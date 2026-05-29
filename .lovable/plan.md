# Plan d'optimisation API — cible 500k+ prospects

## Problème actuel (mesuré)

| Symptôme | Cause |
|---|---|
| `erpStore` charge toute la table prospects/contracts/opps en RAM via `fetchAllPaginated(perPage: 2000)` | Filtres/tri/recherche faits côté client → impossible à 500k lignes |
| Deux sources de vérité (`useErp()` + TanStack Query) | Double fetch, invalidations désynchronisées |
| `SELECT *` partout sans index sur les colonnes filtrables (`status`, `cin`, `assigned_to`, `created_at`) | Full table scan MySQL dès quelques dizaines de milliers de lignes |
| `ensure_*_runtime_schema()` exécuté à chaque GET (auto-ALTER) | Coût constant, locks DDL |
| Pas de cache HTTP (ETag, Cache-Control) | Chaque navigation refait tous les fetchs |
| JSON renvoyé contient tous les champs (snapshot, comments, customs) même pour la liste | Payload gonflé inutilement |

## Architecture cible

```text
[ Liste DataGrid ]
        │  search/filter/sort/page → URL search params
        ▼
[ TanStack Query keyed on (entity, params) ]
        │  GET /prospects.php?paginate=1&q=&status=&page=&perPage=&sort=&fields=list
        ▼
[ PHP : index DB + projection minimale + count(*) en cache ]
        ▼
[ MySQL : index composites sur (status, created_at), (assigned_to, created_at), FULLTEXT(name,phone,cin,email) ]
```

`erpStore` devient un cache de lookups petits (users, types, stages, current user). Les listes lourdes passent **uniquement** par TanStack Query avec pagination serveur.

## Phases (livrables indépendants, déployables séparément)

### Phase 1 — Backend : pagination + projection + index (impact x100)
1. Ajout des index MySQL critiques (migration unique) :
   - `crminternet_prospects (status, created_at DESC)`, `(assigned_to, created_at DESC)`, `(cin)`, `(phone)`, `FULLTEXT(last_name, first_name, email, phone, cin)`
   - Idem opportunités, contrats, guichet_dossiers
2. Mode `?fields=list` sur `prospects.php` / `opportunities.php` / `contracts.php` qui renvoie une projection courte (id, nom, téléphone, statut, assignedTo, createdAt) au lieu de `SELECT *` — payload divisé par ~5
3. Filtres serveur acceptés en query string : `q`, `status`, `assignedTo`, `dateFrom`, `dateTo`, `sort`, `dir` — pousse le WHERE/ORDER en SQL
4. `ensure_*_runtime_schema()` mis derrière une garde `APCu`/`memcache` ou flag `?schema=ensure` (appel explicite, plus à chaque GET)
5. Cache du `total` via header `X-Total-Approx` (count rapide via `information_schema.TABLES.TABLE_ROWS` ou cache 60s)

### Phase 2 — Frontend : retirer le "load all"
1. `erpStore` : suppression du `fetchAllPaginated` pour prospects/contracts/opportunities. Reste : users, prospect types, stages (petits)
2. `prospects.index.tsx` / `opportunities.index.tsx` / `contracts.index.tsx` : passage à un hook `useEntityList({ entity, page, perPage, q, filters, sort })` basé sur `useQuery` + `keepPreviousData`
3. État de filtre/tri/page dans l'URL (`Route.useSearch()` + `validateSearch`) — partageable, bookmark-able, pas de re-fetch sur navigation arrière
4. `DataGrid` passe en mode "server pagination" (totalCount fourni par l'API)
5. Debounce 300ms sur la recherche + `staleTime: 30_000` sur les listes

### Phase 3 — Couche réseau
1. `api.ts` : ajout d'un `AbortController` par requête lié au lifecycle React Query (annule le fetch précédent quand on tape vite)
2. Retry exponentiel uniquement sur 5xx + network error (pas sur 4xx)
3. Compression : forcer `Accept-Encoding: gzip` côté client + `mod_deflate` côté Apache (`backend/php/.htaccess`)
4. ETag faible côté PHP sur les GET liste (hash du tuple `max(updated_at), count`) → 304 instant sur navigation arrière
5. Suppression de la dédup maison des GET dans `api.ts` (TanStack Query le fait déjà mieux)

### Phase 4 — Détails (gains marginaux mais cumulés)
1. Code-split des routes lourdes (`prospects.index.tsx` 896 lignes → composants séparés lazy)
2. Virtualisation du DataGrid (ne render que les lignes visibles, indispensable au-delà de 200 lignes affichées)
3. Préfetch on-hover sur les liens `/prospects/$id` (TanStack Router `preload="intent"`)
4. Suppression du double-fetch `erpStore` ↔ Query sur les pages détail

## Détails techniques

**Index MySQL — exemple prospects** :
```sql
ALTER TABLE crminternet_prospects
  ADD INDEX idx_status_created (status, created_at DESC),
  ADD INDEX idx_assigned_created (assigned_to, created_at DESC),
  ADD INDEX idx_cin (cin),
  ADD INDEX idx_phone (phone),
  ADD FULLTEXT KEY ft_search (last_name, first_name, email, phone, cin);
```

**Endpoint cible** :
```text
GET /prospects.php?paginate=1&fields=list&q=ben+ali&status=Nouveau&assignedTo=u_42&page=3&perPage=50&sort=createdAt&dir=desc
→ 200 { rows: [...50 rows projetés], page: 3, perPage: 50, total: 124387, totalApprox: false }
   ETag: W/"hash"   Cache-Control: private, max-age=0, must-revalidate
```

**Hook unifié frontend** :
```ts
const list = useQuery({
  queryKey: ['prospects', search],
  queryFn: ({ signal }) => api('/prospects.php', { signal, params: { paginate: 1, fields: 'list', ...search } }),
  staleTime: 30_000,
  placeholderData: keepPreviousData,
});
```

## Ce qui ne change PAS
- Schéma DB métier (les colonnes/relations restent)
- Logique de conversion prospect → opportunité → contrat
- Endpoints d'écriture (POST/PUT/DELETE inchangés)
- Permissions / auth
- Information contrat (déjà corrigée dans la session précédente)

## Risques + mitigation
- **Risque** : composants qui lisent `useErp().prospects` cassent → mitigation : phase 2 fait un grep exhaustif et migre chaque consommateur, on garde un wrapper `useProspectsList()` rétrocompatible le temps de la transition
- **Risque** : la migration d'index lock la table → mitigation : `ALGORITHM=INPLACE, LOCK=NONE` pour MySQL 8, exécution hors heures
- **Risque** : ETag mal calculé invalide trop souvent → mitigation : basé sur `MAX(updated_at) + COUNT(*)` recalculé toutes les 60s

## Ordre d'exécution recommandé
1. **Phase 1** d'abord (backend prêt à servir la nouvelle API tout en restant rétrocompatible avec l'ancien client)
2. **Phase 2** ensuite (frontend bascule sur le nouveau contrat)
3. **Phase 3 + 4** en parallèle, par petits PRs

## Estimation
- Phase 1 : ~1 session (SQL + 3 endpoints PHP)
- Phase 2 : ~2 sessions (touche prospects/opps/contracts/guichet + erpStore)
- Phase 3 : ~1 session
- Phase 4 : ~1 session

Dis-moi si tu veux que je démarre par **Phase 1** (backend, gain immédiat sans risque frontend) ou si tu préfères ajuster le périmètre avant.
