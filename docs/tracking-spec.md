# Tracking Lead → Opportunité → Contrat — spec backend
z
Le frontend agrège **3 sources** dans `src/lib/journey.ts` :
- `/audit_log.php` — actions système (auteur, IP, timestamp)
- `/activity.php` — diffs champ-par-champ (ancienne → nouvelle valeur)
- `/lead_actions.php` — actions commerciales horodatées (appel, visite, note…)

Pour que la timeline "Parcours complet" soit exhaustive de la création dukk
lead jusqu'au contrat gagné/perdu, le backend PHP doit garantir que **tous**
les événements ci-dessous sont écrits dans `audit_log` ET (pour les diffs)
dans `activity`.

## 1. Endpoints à étendre côté lecture

```
GET /audit_log.php?entity={prospect|opportunity|contract}&entity_id=ID&limit=500&sort=asc
GET /activity.php?entity={prospect|opportunity|contract}&entity_id=ID&limit=500
GET /lead_actions.php?prospect_id=ID&limit=500
GET /opportunities.php?id=ID  → { opportunity: { … } }
```

Tous doivent accepter le filtre `entity` + `entity_id` et trier par date asc.

## 2. Événements obligatoires à logger

### Lead (prospect)
| Action | Où | Détails JSON |
|---|---|---|
| `create` | POST /prospects.php | `{ source, assignedTo }` |
| `claim` | action=claim | `{ assignedTo }` |
| `assign` | PATCH assignedTo | `{ field:"assigned_to", previousValue, newValue }` |
| `status_change` | PATCH status | `{ field:"status", previousValue, newValue }` |
| `update` (autres champs) | PATCH | `{ field, previousValue, newValue }` |
| `mark_won` | action=mark_won | `{ premium, partner, contract_id }` |
| `mark_lost` | action=mark_lost | `{ category, reason, note }` (cf. payload front) |
| `convert_opportunity` | auto-action de stage | `{ opportunity_id, from_stage, to_stage }` |
| `convert_contract` | raccourci | `{ contract_id }` |
| `delete` | DELETE | `{}` |

### Opportunité
| Action | Détails |
|---|---|
| `create` | `{ prospect_id, stage }` |
| `stage_change` | `{ field:"stage", previousValue, newValue }` |
| `update` | `{ field, previousValue, newValue }` pour amount, probability, expected_close_date, assignedTo, title |
| `convert_contract` | `{ contract_id }` |
| `revert_lead` | `{ prospect_id, reason? }` |
| `delete` | `{}` |

### Contrat
| Action | Détails |
|---|---|
| `create` | `{ opportunity_id?, prospect_id?, partner, premium, stage }` |
| `update` (assignedTo, partner, cabinet, premium, signature_date, effective_date, validation_date) | `{ field, previousValue, newValue }` |
| `stage_change` (= billingStatus) | `{ field:"billing_status", previousValue, newValue }` |
| `validate` | `{ validation_date }` |
| `revert_opportunity` | `{ opportunity_id }` |
| `delete` | `{}` |

## 3. Format `details` (JSON string)

Toujours JSON ; le front parse et reconnaît :
```json
{ "field": "premium", "previousValue": "950", "newValue": "1100" }
{ "category": "Concurrent", "reason": "A choisi un concurrent", "note": "Texte libre" }
{ "from_stage": "En cours", "to_stage": "Vendu", "auto_action": "convert_opportunity" }
```

## 4. Lien transversal

Pour reconstruire la chaîne, exposer dans les payloads :
- `prospect.opportunityId` (déjà présent)
- `opportunity.prospectId` + `opportunity.contractId`
- `contract.opportunityId` + (idéalement) `contract.prospectId`

→ Ajouter `prospect_id` à la table contracts si absent (sinon le front
retombe sur opportunity → prospect).

## 5. Conversions / reverts — règle d'or

Chaque transition doit produire **deux** lignes audit cohérentes :
- une sur l'entité source (`convert_opportunity` sur prospect)
- une sur l'entité cible (`create` sur opportunity, avec `details.source_prospect_id`)

Idem pour les reverts. Cela permet à la timeline de matérialiser la flèche
des deux côtés et au reporting de compter les conversions sans ambiguïté.

## 6. Lost — payload riche

Le dialogue front (`LostDialog`) envoie désormais :
```
formatted: "Concurrent — A choisi un concurrent | note: Le client a signé chez X"
```
Recommandation : stocker les 3 champs séparés côté DB (`lost_category`,
`lost_reason`, `lost_note`) en plus du legacy `lostReason` pour pouvoir
agréger en reporting.
