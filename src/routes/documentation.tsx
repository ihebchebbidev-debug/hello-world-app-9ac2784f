import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  BookOpen, LayoutDashboard, ClipboardList, FileText, CalendarDays,
  CheckSquare, Bell, Layers, Target, BarChart3, GitMerge, Shuffle,
  Users, ShieldCheck, Wrench, Settings, User, Search, ExternalLink,
  Sparkles, Database, Lock, FileCog, Download, Upload, KeyRound,
  Workflow, Zap, ArrowRight, FileQuestion, Globe, Bug, Rocket,
  LogIn, Briefcase, IdCard,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/documentation")({
  head: () => ({
    meta: [
      { title: "Documentation — CRM" },
      { name: "description", content: "Documentation complète de l'ERP : pages, fonctionnalités, modules, API et flux métier." },
    ],
  }),
  component: DocumentationPage,
});

type Section = {
  path: string;
  linkTo?: string;
  title: string;
  icon: any;
  roles: string;
  description: string;
  features: string[];
  workflows?: { title: string; steps: string[] }[];
  apis?: string[];
  tips?: string[];
};

import shotLogin from "@/assets/docs/00-login.png";
import shotDashboard from "@/assets/docs/01-dashboard.png";
import shotProspects from "@/assets/docs/02-prospects.png";
import shotLeadDetail from "@/assets/docs/02b-lead-detail.png";
import shotOpportunities from "@/assets/docs/02c-opportunities.png";
import shotContracts from "@/assets/docs/03-contracts.png";
import shotCalendar from "@/assets/docs/04-calendar.png";
import shotTasks from "@/assets/docs/05-tasks.png";
import shotNotifications from "@/assets/docs/06-notifications.png";

import shotObjectives from "@/assets/docs/08-objectives.png";
import shotReports from "@/assets/docs/09-reports.png";
import shotReconciliation from "@/assets/docs/10-reconciliation.png";
import shotDispatch from "@/assets/docs/11-dispatch.png";
import shotUsers from "@/assets/docs/12-users.png";
import shotRoles from "@/assets/docs/13-roles.png";
import shotBackoffice from "@/assets/docs/14-backoffice.png";
import shotConfiguration from "@/assets/docs/15-configuration.png";
import shotProfile from "@/assets/docs/16-profile.png";
import shotMessaging from "@/assets/docs/18-messaging.png";
import shotHrAttendance from "@/assets/docs/19-hr-attendance.png";
import shotHrPayroll from "@/assets/docs/20-hr-payroll.png";
import shotHrCommissions from "@/assets/docs/21-hr-commissions.png";
import shotAudit from "@/assets/docs/23-audit.png";
import shotSecurity from "@/assets/docs/24-security.png";
import shotHrExternalAgents from "@/assets/docs/22-hr-external-agents.png";
import shotModalNewProspect from "@/assets/docs/modal-new-prospect.png";
import shotModalNewCommission from "@/assets/docs/modal-new-commission.png";
import shotModalNewContract from "@/assets/docs/modal-new-contract.png";
import shotModalNewUser from "@/assets/docs/modal-new-user.png";
import shotModalEditUser from "@/assets/docs/modal-edit-user.png";
import shotModalResetPassword from "@/assets/docs/modal-reset-password.png";
import shotModalDeleteUser from "@/assets/docs/modal-delete-user.png";
import shotModalImport from "@/assets/docs/modal-import.png";
import shotMenuQuickCreate from "@/assets/docs/menu-quick-create.png";
import shotMenuOpportunityActions from "@/assets/docs/menu-opportunity-actions.png";

const SCREENSHOTS: Record<string, string> = {
  "/login": shotLogin,
  "/": shotDashboard,
  "/prospects": shotProspects,
  "/prospects/detail": shotLeadDetail,
  "/opportunities": shotOpportunities,
  "/contracts": shotContracts,
  "/calendar": shotCalendar,
  "/tasks": shotTasks,
  "/notifications": shotNotifications,
  
  "/objectives": shotObjectives,
  "/reports": shotReports,
  "/reconciliation": shotReconciliation,
  "/dispatch": shotDispatch,
  "/users": shotUsers,
  "/roles": shotRoles,
  "/backoffice": shotBackoffice,
  "/configuration": shotConfiguration,
  "/profile": shotProfile,
  "/messaging": shotMessaging,
  "/hr/attendance": shotHrAttendance,
  "/hr/payroll": shotHrPayroll,
  "/hr/commissions": shotHrCommissions,
  "/hr/external-agents": shotHrExternalAgents,
  "/audit": shotAudit,
  "/security": shotSecurity,
  "/modals/new-prospect": shotModalNewProspect,
  "/modals/new-commission": shotModalNewCommission,
  "/modals/new-contract": shotModalNewContract,
  "/modals/new-user": shotModalNewUser,
  "/modals/edit-user": shotModalEditUser,
  "/modals/reset-password": shotModalResetPassword,
  "/modals/delete-user": shotModalDeleteUser,
  "/modals/import": shotModalImport,
  "/modals/quick-create": shotMenuQuickCreate,
  "/modals/opportunity-actions": shotMenuOpportunityActions,
};

const SECTIONS: Section[] = [
  {
    path: "/login", title: "Connexion", icon: LogIn, roles: "Public",
    description: "Authentification de l'utilisateur avec captcha anti-bot, option de session persistante et contrôle de force du mot de passe.",
    features: [
      "Identifiant : username OU email (résolution backend)",
      "Mot de passe avec toggle de visibilité (œil)",
      "Captcha 'Je ne suis pas un robot' obligatoire avant soumission",
      "Case 'Se souvenir de moi' (token persistant 30 jours, sinon session)",
      "Émission d'un JWT signé HS256 (sub / username / role / exp)",
      "Stockage du token côté client + injection automatique en Authorization: Bearer",
      "Rejet 401 → purge du token et redirection automatique vers /login",
      "Verrouillage temporaire après 5 essais échoués (anti brute-force)",
      "Force-change-password à la première connexion (si flag must_change_password)",
    ],
    workflows: [
      {
        title: "Connexion standard",
        steps: [
          "L'utilisateur saisit son identifiant et son mot de passe",
          "Coche 'Je ne suis pas un robot' (validation captcha côté client)",
          "Clique 'Se connecter' → POST auth_login.php",
          "Le backend vérifie le hash bcrypt et émet un JWT",
          "Le client stocke le token et redirige vers la dernière route demandée (ou /)",
        ],
      },
    ],
    apis: ["POST /auth_login.php", "GET /auth_me.php", "POST /auth_logout.php"],
    tips: [
      "Compte de test QA : AymenAdmin / Admin@2026",
      "Le JWT contient le rôle pour pré-filtrer la nav côté client (vérification doublée backend)",
    ],
  },
  {
    path: "/", title: "Tableau de bord", icon: LayoutDashboard, roles: "Tous",
    description: "Vue synthétique de l'activité commerciale : KPIs, tendances et accès rapides aux modules opérationnels.",
    features: [
      "5 KPIs en temps réel : leads traités, gagnés, perdus, taux de conversion, revenu signé",
      "Sparklines (7/30/60 jours) sur leads, won, lost et conversion",
      "Comparaison à la période précédente (delta % et flèche directionnelle)",
      "Cartes raccourcis vers prospects en attente, contrats à valider, calendrier du jour",
      "Données rafraîchies à chaque visite + cache court côté client",
      "Adapté aux Agents (vue scoped sur leurs propres leads) et aux Managers (vue globale)",
    ],
    workflows: [
      {
        title: "Lecture quotidienne d'un agent",
        steps: [
          "À l'ouverture du tableau de bord, l'agent voit ses chiffres du jour",
          "Les sparklines indiquent la tendance vs semaine précédente",
          "Un clic sur le KPI 'Leads en attente' ouvre la liste filtrée",
        ],
      },
    ],
    apis: ["GET /dashboard.php", "GET /dashboard.php?series=leads&days=7"],
  },
  {
    path: "/prospects", title: "Prospects (Leads)", icon: ClipboardList, roles: "Tous (vue scoped pour Agent)",
    description: "Gestion complète du cycle de vie d'un lead : création, qualification, attribution, suivi et conversion en contrat.",
    features: [
      "Création via dialog avec champs standards + champs personnalisés",
      "Recherche full-text (nom, prénom, téléphone, email, ville)",
      "Filtres : statut, agent assigné, source, check valeur, plage de dates",
      "Vues sauvegardées par utilisateur (filtres + tri + colonnes)",
      "Colonnes personnalisées (toggle via picker) issues des champs admin",
      "Filtres sur valeurs de champs personnalisés",
      "Tri colonnes ascendant/descendant",
      "Pagination 25 lignes / page",
      "Sélection multiple + actions en masse : réassignation, archivage statut",
      "Import CSV/Excel avec mapping intelligent + déduplication par id/téléphone/email",
      "Historique des imports (qui, quand, combien)",
      "Export CSV/JSON enrichi : chaque champ personnalisé devient une colonne (label)",
      "Page détail : édition complète, claim, mark won/lost, journal, pièces jointes (≤20 Mo)",
      "Convertir un prospect 'gagné' crée automatiquement un contrat lié + notification à l'agent",
    ],
    workflows: [
      {
        title: "Convertir un lead gagné",
        steps: [
          "Ouvrir la fiche prospect",
          "Cliquer 'Marquer gagné' et saisir la cotisation + le partenaire",
          "Le backend crée transactionnellement le contrat + l'entrée d'activité + la notification",
          "Le contrat apparaît immédiatement dans Contrats avec assignedTo identique",
        ],
      },
      {
        title: "Réassignation en masse (Manager)",
        steps: [
          "Filtrer les prospects à réattribuer",
          "Cocher la sélection (case d'en-tête sélectionne la page)",
          "Choisir le nouvel agent dans le dropdown 'Réassigner à…'",
          "Confirmation toast + rafraîchissement automatique",
        ],
      },
    ],
    apis: [
      "GET /prospects.php (liste, scope agent)",
      "POST /prospects.php (création + customValues)",
      "PATCH /prospects.php?id=… (édition)",
      "POST /prospects.php?action=claim (atomique)",
      "POST /prospects.php?action=mark_won (transactionnel)",
      "POST /prospects.php?action=bulk (op: assign|status)",
      "DELETE /prospects.php?id=…",
    ],
    tips: [
      "L'agent ne voit et n'édite que ses propres prospects (filtre SQL backend)",
      "Le claim est atomique : un même lead ne peut être pris deux fois",
    ],
  },
  {
    path: "/prospects/detail", linkTo: "/prospects",
    title: "Fiche prospect (détail)", icon: IdCard, roles: "Tous (scope agent)",
    description: "Page détail d'un lead : édition complète, claim, marquage gagné/perdu, journal d'activité, parcours commercial, pièces jointes et champs personnalisés.",
    features: [
      "5 onglets : Vue d'ensemble, Pièces jointes, Champs perso, Historique, Parcours",
      "Édition inline des champs standards (nom, téléphone, email, ville, source, statut)",
      "Bloc 'Champs personnalisés' (CustomFieldsCard) auto-généré depuis la définition admin",
      "Action Claim (atomique) : auto-assignation à l'agent connecté",
      "Action Marquer gagné → ouvre le dialog cotisation/partenaire et crée le contrat lié",
      "Action Marquer perdu → ouvre LostDialog (motif + commentaire)",
      "Pièces jointes (≤20 Mo) : upload multipart, téléchargement signé, suppression journalisée",
      "Historique : journal complet (création, claim, changements de statut, ajouts CF, fichiers)",
      "Parcours : timeline visuelle des étapes du pipeline avec horodatage par étape",
      "Notification automatique à l'agent assigné lors d'une modification par un tiers",
      "Convertir en contrat : crée transactionnellement le contrat + l'activité + la notification",
    ],
    workflows: [
      {
        title: "Claim & qualification",
        steps: [
          "Un agent ouvre une fiche non assignée depuis la file Dispatch ou /prospects",
          "Clique 'Claim' → POST prospects.php?action=claim (atomique, anti race)",
          "Renseigne les champs personnalisés requis et avance le statut dans le pipeline",
          "Le journal d'activité enregistre chaque étape avec auteur + horodatage",
        ],
      },
    ],
    apis: [
      "GET /prospects.php?id=…",
      "PATCH /prospects.php?id=…",
      "POST /prospects.php?action=claim",
      "POST /prospects.php?action=mark_won",
      "POST /prospects.php?action=mark_lost",
      "GET /attachments.php?entity=prospect&entity_id=…",
      "POST /attachments.php (multipart)",
      "DELETE /attachments.php?id=…",
      "GET /activity.php?entity=prospect&entity_id=…",
      "GET /custom_field_values.php?entity=prospect&entity_id=…",
      "POST /custom_field_values.php",
    ],
    tips: [
      "Les uploads sont stockés hashés hors webroot ; chaque téléchargement passe par un token signé éphémère",
      "Le claim est rejeté côté backend si un autre agent a déjà revendiqué le lead",
    ],
  },
  {
    path: "/opportunities", title: "Opportunités", icon: Briefcase, roles: "Tous (scope agent)",
    description: "Pipeline des opportunités commerciales issues des leads qualifiés : suivi des étapes de vente, conversion en contrat ou retour en lead.",
    features: [
      "Liste tabulaire avec édition inline de l'étape courante (cellule éditable)",
      "Étapes configurables (table opportunity_stages) : Découverte, Devis, Négociation, Signature…",
      "Cache TanStack Query avec staleTime court : invalidation auto sur mutation",
      "Action 'Convertir en contrat' : crée le contrat lié + déplace l'opportunité en archive",
      "Action 'Renvoyer en lead' : remet le prospect en file (statut = pending)",
      "Pièces jointes attachées à l'opportunité (≤20 Mo)",
      "Filtres : agent, étape, source, plage de dates",
      "Export CSV avec champs personnalisés",
      "Journal d'activité par opportunité",
      "Notification à l'agent assigné lors d'un changement d'étape par un tiers",
    ],
    workflows: [
      {
        title: "Conversion lead → opportunité → contrat",
        steps: [
          "Un lead qualifié (statut won) est promu en opportunité automatiquement",
          "L'agent fait avancer l'opportunité étape par étape (cellule inline)",
          "À l'étape finale 'Signature', clic sur 'Convertir en contrat'",
          "Le backend crée le contrat (contracts.php) + invalide les caches opportunités/contrats",
        ],
      },
      {
        title: "Renvoi en lead (annulation)",
        steps: [
          "L'opportunité ne se concrétise pas (client injoignable, hors cible)",
          "Clic 'Renvoyer en lead' → l'opportunité est archivée et le prospect remis pending",
          "Une entrée d'activité est tracée + l'agent est notifié",
        ],
      },
    ],
    apis: [
      "GET /opportunities.php (liste, scope agent)",
      "POST /opportunities.php (création depuis lead)",
      "PATCH /opportunities.php?id=… (édition + changement d'étape)",
      "POST /opportunities.php?action=convert (transactionnel → contrat)",
      "POST /opportunities.php?action=back_to_lead",
      "DELETE /opportunities.php?id=…",
      "GET /opportunity_stages.php (catalogue d'étapes, cache 5 min)",
    ],
    tips: [
      "L'invalidation TanStack Query après mutation garantit une UI cohérente sans refetch manuel",
      "Le scope agent est appliqué SQL-side : un agent ne voit que ses propres opportunités",
    ],
  },
  {
    path: "/contracts", title: "Contrats", icon: FileText, roles: "Tous (vue scoped pour Agent)",
    description: "Gestion des contrats signés : suivi de la facturation, validation backoffice, journal d'activité et pièces jointes.",
    features: [
      "Création via dialog (avec champs personnalisés)",
      "Filtres riches : date signature/effet/validation, partenaire, cabinet, source, statut facturation",
      "4 statuts facturation : Validé Confirmation, En attente, Annuler, Pré-validé",
      "Vues sauvegardées + colonnes personnalisées + filtres CF",
      "Sélection + actions en masse : changement de statut facturation",
      "Calcul automatique CA filtré (badge dans le header)",
      "Import CSV/Excel + export CSV/Excel/JSON avec champs personnalisés",
      "Page détail : édition, journal d'activité (changements de statut/cotisation), pièces jointes",
      "Date de validation auto-renseignée quand le statut passe à 'Validé Confirmation'",
      "Notification automatique à l'agent assigné lors d'une modification",
    ],
    workflows: [
      {
        title: "Validation backoffice",
        steps: [
          "Backoffice ouvre le contrat depuis la page /backoffice ou /contracts",
          "Modifie le statut → 'Validé Confirmation'",
          "validation_date est automatiquement positionnée à NOW()",
          "Une entrée d'activité est ajoutée et l'agent est notifié",
        ],
      },
    ],
    apis: [
      "GET /contracts.php (liste, scope agent)",
      "POST /contracts.php (création + customValues)",
      "PATCH /contracts.php?id=… (édition + journal)",
      "POST /contracts.php?action=bulk",
      "DELETE /contracts.php?id=…",
    ],
  },
  {
    path: "/calendar", title: "Calendrier", icon: CalendarDays, roles: "Tous",
    description: "Planning des rendez-vous, rappels et signatures avec gestion CRUD des événements.",
    features: [
      "3 types : RDV client, rappel, signature",
      "Création/édition via dialog",
      "Vue mensuelle + liste",
      "Lié à un agent (visibilité scoped)",
      "Champs requis validés côté serveur (titre, date, heure, type)",
    ],
    apis: ["GET/POST/PUT/DELETE /calendar.php"],
  },
  {
    path: "/tasks", title: "Tâches", icon: CheckSquare, roles: "Tous",
    description: "To-do list personnelle avec priorités, échéances et marquage 'fait' horodaté.",
    features: [
      "Création de tâches assignées à soi ou à un autre utilisateur",
      "Priorités : basse, normale, haute, urgente",
      "Marquage 'fait' → completed_at automatique",
      "Tri par priorité puis date",
    ],
    apis: ["GET/POST/PATCH/DELETE /tasks.php"],
  },
  {
    path: "/notifications", title: "Notifications", icon: Bell, roles: "Tous",
    description: "Centre des notifications : nouveaux leads, contrats validés, mentions, etc.",
    features: [
      "Liste read/unread avec badge compteur dans le header",
      "Polling automatique toutes les ~30 s",
      "Marquer lu / tout marquer lu",
      "Création cross-user restreinte aux Admin/Manager",
    ],
    apis: ["GET /notifications.php", "POST /notifications.php", "PATCH /notifications.php?id=…"],
  },
  {
    path: "/objectives", title: "Objectifs", icon: Target, roles: "Tous",
    description: "Définition et suivi des objectifs commerciaux par agent et par période.",
    features: [
      "Objectifs mensuels et trimestriels",
      "Progression visuelle (barre + %) vs réalisé",
      "Vue agent et vue équipe",
    ],
  },
  {
    path: "/reports", title: "Rapports & analytique", icon: BarChart3, roles: "Tous",
    description: "Performance par agent, entonnoir de conversion, revenus mensuels, comparaison période et exports complets.",
    features: [
      "KPIs par agent : leads traités, gagnés, perdus, contrats, revenu, conversion",
      "Entonnoir de conversion (pending → won/lost)",
      "Revenus mensuels (12 derniers mois)",
      "Performance par source",
      "6 plages préconfigurées (today, 7j, 30j, MTD, YTD, mois précédent) + plage custom",
      "Comparaison à la période précédente (toggle)",
      "Export CSV agents (généré côté backend)",
      "Export Excel multi-onglets (Agents, Mensuel, Sources, Entonnoir, + comparaison)",
      "Export CSV prospects (avec champs personnalisés)",
      "Export Excel prospects (avec champs personnalisés)",
      "Export CSV contrats (avec champs personnalisés)",
      "Export Excel contrats (avec champs personnalisés)",
    ],
    apis: ["GET /reports.php?from=&to=", "GET /reports.php?format=csv&from=&to="],
  },
  {
    path: "/reconciliation", title: "Réconciliation", icon: GitMerge, roles: "Backoffice / Admin",
    description: "Rapprochement entre prospects gagnés et contrats créés pour détecter les écarts.",
    features: [
      "Écarts : prospects 'won' sans contrat, contrats sans prospect source",
      "Validation manuelle ligne à ligne",
      "Export des anomalies",
    ],
  },
  {
    path: "/dispatch", title: "Dispatch", icon: Shuffle, roles: "Admin / Manager",
    description: "Distribution des leads non assignés aux agents disponibles, en manuel ou en lot.",
    features: [
      "Vue charge de travail par agent (leads en cours)",
      "Attribution unitaire ou en masse",
      "Filtres source / date pour cibler les bons leads",
    ],
  },
  {
    path: "/users", title: "Utilisateurs", icon: Users, roles: "Administrateur",
    description: "Gestion complète des comptes : création, édition, désactivation et stats par agent.",
    features: [
      "Création via dialog (rôle, équipe, mot de passe, champs personnalisés)",
      "Mot de passe hashé bcrypt côté backend, jamais retourné par l'API",
      "KPIs par agent affichés dans la liste (leads traités, contrats, conversion)",
      "Édition profil, rôle, équipe, statut actif/inactif, mot de passe",
      "Désactivation (soft) ou suppression (cascade contrôlée)",
      "Page détail dédiée par utilisateur (/users/$username)",
    ],
    apis: ["GET /users.php (avec stats)", "POST /users.php", "PATCH /users.php?id=…", "DELETE /users.php?id=…"],
  },
  {
    path: "/roles", title: "Rôles & permissions", icon: ShieldCheck, roles: "Administrateur",
    description: "Configuration de la matrice rôles × permissions appliquée côté frontend ET côté backend.",
    features: [
      "Matrice à cocher (rôle × module)",
      "Modules : dashboard, prospect, contract, calendar, dispatch, users, role, backoffice",
      "Application immédiate (Frontend cache la nav, Backend rejette via require_role)",
      "4 rôles par défaut : Administrateur, Manager, Agent, Backoffice",
      "Mise à jour transactionnelle (DELETE + INSERT en une transaction)",
    ],
    apis: ["GET /roles.php", "PUT /roles.php"],
  },
  {
    path: "/backoffice", title: "Backoffice", icon: Wrench, roles: "Backoffice / Admin",
    description: "Espace dédié à la validation des contrats et au suivi opérationnel de la facturation.",
    features: [
      "File de contrats à valider",
      "Changement de statut + date validation auto",
      "Filtres par partenaire, cabinet, période",
    ],
  },
  {
    path: "/configuration", title: "Configuration", icon: Settings, roles: "Administrateur",
    description: "Paramètres globaux de l'application + administration des champs personnalisés (prospect/contract/user).",
    features: [
      "Paramètres globaux : devise, format date, etc.",
      "Création/édition/suppression des champs personnalisés",
      "6 types : texte, textarea, nombre, date, booléen, select (avec options)",
      "Drapeau 'requis' validé dans les dialogs de création",
      "Position (ordre d'affichage)",
      "Suppression cascade : supprime aussi toutes les valeurs stockées (transactionnel)",
      "Application immédiate dans : NewProspectDialog, NewContractDialog, NewUserDialog, pages détail, listes (colonnes/filtres), exports",
    ],
    apis: ["GET/POST/PUT/DELETE /custom_fields.php", "GET/POST/DELETE /custom_field_values.php"],
  },
  {
    path: "/profile", title: "Profil", icon: User, roles: "Tous",
    description: "Profil personnel : informations, changement de mot de passe.",
    features: [
      "Édition email, équipe (selon droits)",
      "Changement de mot de passe (re-vérification de l'ancien)",
      "Affichage du rôle et des permissions actives",
    ],
    apis: ["GET /auth_me.php", "POST /auth_change_password.php"],
  },
];

const TRANSVERSAL = [
  {
    title: "Champs personnalisés (dynamic fields)",
    icon: Sparkles,
    body:
      "Configurez librement des champs métier (texte, nombre, date, booléen, select…) sur 3 entités : prospect, contract, user. " +
      "Définition côté Configuration → propagation immédiate dans les dialogs de création (avec validation requis), les pages détail (CustomFieldsCard), " +
      "les listes (colonnes optionnelles via picker + filtres dédiés) et tous les exports CSV/Excel/JSON (colonne nommée par le label du champ).",
  },
  {
    title: "Onboarding interactif (Joyride)",
    icon: BookOpen,
    body:
      "Tour guidé en 24 étapes filtrées par rôle, couvrant l'intégralité des routes. " +
      "Démarre automatiquement au premier login et est relançable à tout moment via le bouton d'aide du header. " +
      "La progression est sauvegardée par utilisateur et par rôle.",
  },
  {
    title: "Imports CSV / Excel",
    icon: Upload,
    body:
      "Module d'import disponible sur Prospects et Contrats avec : sélection du fichier, mapping intelligent des colonnes, " +
      "prévisualisation, validation des champs requis, déduplication par id/téléphone/email, et historique d'import.",
  },
  {
    title: "Exports unifiés",
    icon: Download,
    body:
      "CSV, Excel et JSON disponibles sur Prospects, Contrats et Reports. " +
      "Les champs personnalisés sont automatiquement injectés en colonnes (label du champ, fallback cf_<key> en cas de collision). " +
      "Cohérent partout grâce au helper withCustomFields().",
  },
  {
    title: "Permissions & rôles (defense in depth)",
    icon: Lock,
    body:
      "Frontend : permissionForPath() masque les liens et bloque les routes interdites. " +
      "Backend : chaque endpoint sensible appelle require_role(['Administrateur', …]). " +
      "La matrice est éditable depuis /roles et appliquée immédiatement sans redéploiement.",
  },
  {
    title: "Pièces jointes",
    icon: FileCog,
    body:
      "Upload multipart sécurisé (≤20 Mo) sur prospects, contrats et utilisateurs. " +
      "Stockage hashé hors webroot, téléchargement signé via token, suppression journalisée dans l'activité.",
  },
  {
    title: "Vues sauvegardées",
    icon: Workflow,
    body:
      "Sur Prospects et Contrats : sauvegarde par utilisateur des combinaisons filtres + tri + colonnes visibles. " +
      "Réutilisables en un clic depuis le header de la liste.",
  },
  {
    title: "Notifications & journal d'activité",
    icon: Zap,
    body:
      "Polling client toutes les ~30 s pour les notifications. " +
      "Journal d'activité automatique sur les contrats (changement statut, cotisation, ajout/retrait pièce jointe) avec auteur et horodatage.",
  },
];

const API_ENDPOINTS = [
  { path: "auth_login.php", method: "POST", desc: "Authentification username/email + mot de passe → JWT (Bearer)", auth: "Public" },
  { path: "auth_me.php", method: "GET", desc: "Profil utilisateur courant + permissions effectives", auth: "Auth" },
  { path: "auth_logout.php", method: "POST", desc: "Invalidation token côté client (stateless)", auth: "Auth" },
  { path: "auth_change_password.php", method: "POST", desc: "Changement mot de passe avec ré-authentification", auth: "Auth" },
  { path: "auth_signup.php", method: "POST", desc: "Création de compte interne (route cachée)", auth: "Public restreint" },
  { path: "prospects.php", method: "GET/POST/PATCH/DELETE", desc: "CRUD prospects + claim atomique + mark_won transactionnel + bulk + customValues", auth: "Auth (scope agent)" },
  { path: "contracts.php", method: "GET/POST/PATCH/DELETE", desc: "CRUD contrats + bulk + journal d'activité + notifications + customValues", auth: "Auth (scope agent)" },
  { path: "users.php", method: "GET/POST/PATCH/DELETE", desc: "CRUD utilisateurs + KPIs joints (leads, contrats, conversion)", auth: "Admin pour POST/DELETE" },
  { path: "roles.php", method: "GET/PUT", desc: "Matrice rôles × permissions, mise à jour transactionnelle", auth: "Admin" },
  { path: "stages.php", method: "GET/POST/PUT/DELETE", desc: "Étapes du pipeline commercial", auth: "Admin/Manager" },
  { path: "tasks.php", method: "GET/POST/PATCH/DELETE", desc: "Tâches utilisateurs avec horodatage completed_at auto", auth: "Auth" },
  { path: "calendar.php", method: "GET/POST/PUT/DELETE", desc: "Événements (RDV/rappel/signature) avec validation type", auth: "Auth" },
  { path: "notifications.php", method: "GET/POST/PATCH", desc: "Notifications scoped utilisateur, création cross-user restreinte", auth: "Auth" },
  { path: "attachments.php", method: "GET/POST/DELETE", desc: "Pièces jointes multipart (≤20 Mo), stockage hashé, download token", auth: "Auth" },
  { path: "activity.php", method: "GET", desc: "Journal d'activité (filtrable par entité)", auth: "Auth" },
  { path: "dashboard.php", method: "GET", desc: "KPIs + 6 séries (leads/won/lost/conversion/revenue), days clamp 1-60", auth: "Auth" },
  { path: "reports.php", method: "GET (json|csv)", desc: "KPIs agents + entonnoir + mensuel + sources, export CSV agents", auth: "Auth" },
  { path: "settings.php", method: "GET/PUT", desc: "Paramètres globaux clé/valeur (scope global ou user)", auth: "Auth" },
  { path: "custom_fields.php", method: "GET/POST/PUT/DELETE", desc: "Définitions champs personnalisés (entity/type/options/required/position)", auth: "Admin/Manager pour mutations" },
  { path: "custom_field_values.php", method: "GET/POST/DELETE", desc: "Valeurs CF, GET supporte ?all=1 (bulk par entité), upsert idempotent", auth: "Auth" },
  { path: "health.php", method: "GET", desc: "Healthcheck uptime + version", auth: "Public" },
];

const FAQ = [
  {
    q: "Comment ajouter un nouveau champ personnalisé ?",
    a: "Aller dans Configuration → onglet Champs personnalisés → Nouveau champ. Choisir l'entité (prospect/contract/user), le type, le libellé, marquer 'requis' si besoin et sauvegarder. Le champ apparaît immédiatement dans le dialog de création de l'entité, sur la page détail, en option de colonne dans les listes et dans tous les exports.",
  },
  {
    q: "Comment relancer le tour guidé ?",
    a: "Cliquer sur le bouton d'aide (?) en haut à droite du header. Le tour redémarre depuis l'étape filtrée par votre rôle.",
  },
  {
    q: "Pourquoi mon agent ne voit pas certains prospects ?",
    a: "Le scoping est appliqué côté SQL : un Agent ne voit que les prospects dont assigned_to = son username. Pour partager, réassigner via /dispatch ou la sélection en masse sur /prospects.",
  },
  {
    q: "Que se passe-t-il quand je supprime un champ personnalisé ?",
    a: "La suppression est transactionnelle : la définition ET toutes les valeurs stockées pour ce champ sur toutes les entités sont supprimées. Action irréversible.",
  },
  {
    q: "Les exports incluent-ils les champs personnalisés ?",
    a: "Oui. Les exports CSV/Excel/JSON sur Prospects, Contrats et Reports passent tous par withCustomFields() qui injecte une colonne par champ (label).",
  },
  {
    q: "Comment changer la devise affichée ?",
    a: "Configuration → Paramètres globaux → currency. Modification immédiatement reflétée dans tous les formatAmount() de l'app.",
  },
];

const CHANGELOG = [
  { date: "2026-05", title: "Documentation admin", desc: "Page /documentation détaillant chaque module, workflow, endpoint API et FAQ." },
  { date: "2026-05", title: "Exports Excel Reports", desc: "Ajout des exports XLSX prospects/contrats avec champs personnalisés depuis la page Rapports." },
  { date: "2026-05", title: "Champs personnalisés end-to-end", desc: "Définitions, valeurs (single + bulk), dialogs, détails, colonnes, filtres et exports." },
  { date: "2026-05", title: "Onboarding 24 étapes", desc: "Tour Joyride couvrant toutes les routes, filtré par rôle, relançable." },
];

function DocumentationPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return SECTIONS;
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(t) ||
        s.description.toLowerCase().includes(t) ||
        s.features.some((f) => f.toLowerCase().includes(t)) ||
        (s.apis ?? []).some((a) => a.toLowerCase().includes(t)),
    );
  }, [q]);

  if (!user) return null;
  if (user.role !== "Administrateur") {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <PageHeader
        title="Documentation"
        description="Référentiel complet de l'application : modules, fonctionnalités, workflows, endpoints API, sécurité et FAQ."
        icon={<BookOpen className="h-5 w-5" />}
      />

      <Card className="p-4 mt-6 shadow-elegant">
        <div className="flex items-center gap-2 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une page, une fonctionnalité, un endpoint…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {filtered.length} page(s) — accès réservé aux Administrateurs.
        </div>
      </Card>

      <Tabs defaultValue="pages" className="mt-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pages"><LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />Pages ({SECTIONS.length})</TabsTrigger>
          <TabsTrigger value="features"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Fonctionnalités transverses</TabsTrigger>
          <TabsTrigger value="api"><Database className="h-3.5 w-3.5 mr-1.5" />API ({API_ENDPOINTS.length})</TabsTrigger>
          <TabsTrigger value="security"><KeyRound className="h-3.5 w-3.5 mr-1.5" />Sécurité</TabsTrigger>
          <TabsTrigger value="faq"><FileQuestion className="h-3.5 w-3.5 mr-1.5" />FAQ</TabsTrigger>
          <TabsTrigger value="changelog"><Rocket className="h-3.5 w-3.5 mr-1.5" />Changelog</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((s) => (
              <Card key={s.path} className="p-4 hover:shadow-elegant hover:border-primary/40 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <Link to={(s.linkTo ?? s.path) as any} className="flex items-center gap-3 group flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-1.5">
                        {s.title}
                        <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                      <code className="text-[11px] text-muted-foreground">{s.path}</code>
                    </div>
                  </Link>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{s.roles}</Badge>
                </div>

                {SCREENSHOTS[s.path] ? (
                  <a
                    href={SCREENSHOTS[s.path]}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block overflow-hidden rounded-md border bg-muted/30 hover:border-primary/40 transition"
                  >
                    <img
                      src={SCREENSHOTS[s.path]}
                      alt={`Aperçu — ${s.title}`}
                      loading="lazy"
                      className="w-full h-40 object-cover object-top"
                    />
                  </a>
                ) : (
                  <div
                    className="mt-3 h-40 rounded-md border border-dashed bg-gradient-to-br from-muted/50 to-muted/20 flex flex-col items-center justify-center text-center px-4"
                    aria-label={`Aperçu indisponible — ${s.title}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Aperçu visuel à venir</div>
                  </div>
                )}

                <p className="mt-3 text-sm text-muted-foreground">{s.description}</p>

                <Accordion type="multiple" className="mt-3">
                  <AccordionItem value="features" className="border-none">
                    <AccordionTrigger className="py-2 text-xs uppercase tracking-wider text-muted-foreground hover:no-underline">
                      Fonctionnalités ({s.features.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                        {s.features.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  {s.workflows && s.workflows.length > 0 && (
                    <AccordionItem value="workflows" className="border-none">
                      <AccordionTrigger className="py-2 text-xs uppercase tracking-wider text-muted-foreground hover:no-underline">
                        Workflows ({s.workflows.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {s.workflows.map((w) => (
                            <div key={w.title}>
                              <div className="text-sm font-medium mb-1">{w.title}</div>
                              <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                                {w.steps.map((st, i) => <li key={i}>{st}</li>)}
                              </ol>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {s.apis && s.apis.length > 0 && (
                    <AccordionItem value="apis" className="border-none">
                      <AccordionTrigger className="py-2 text-xs uppercase tracking-wider text-muted-foreground hover:no-underline">
                        Endpoints API ({s.apis.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-1">
                          {s.apis.map((a) => (
                            <li key={a}><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{a}</code></li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {s.tips && s.tips.length > 0 && (
                    <AccordionItem value="tips" className="border-none">
                      <AccordionTrigger className="py-2 text-xs uppercase tracking-wider text-muted-foreground hover:no-underline">
                        Bonnes pratiques
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                          {s.tips.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>

                <Link to={(s.linkTo ?? s.path) as any} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Ouvrir la page <ArrowRight className="h-3 w-3" />
                </Link>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TRANSVERSAL.map((t) => (
              <Card key={t.title} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <t.icon className="h-4 w-4 text-primary" />
                  <div className="font-semibold">{t.title}</div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="api" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-primary" />
              <div className="font-semibold">Conventions API</div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Toutes les requêtes répondent en JSON avec enveloppe <code>{"{ success, data?, message? }"}</code>.</li>
              <li>Authentification : <code>Authorization: Bearer &lt;jwt&gt;</code> (et <code>X-Auth-Token</code> en fallback).</li>
              <li>Erreurs 401 → le client purge le token et redirige vers /login automatiquement.</li>
              <li>Préparation PDO partout, <code>EMULATE_PREPARES=false</code>, <code>display_errors=0</code>.</li>
              <li>CORS reflète l'origine appelante et autorise les credentials.</li>
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Endpoint</th>
                  <th className="text-left px-4 py-2">Méthodes</th>
                  <th className="text-left px-4 py-2">Auth</th>
                  <th className="text-left px-4 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {API_ENDPOINTS.map((e) => (
                  <tr key={e.path} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-2"><code className="text-xs">{e.path}</code></td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{e.method}</Badge></td>
                    <td className="px-4 py-2"><Badge variant="secondary" className="text-[10px]">{e.auth}</Badge></td>
                    <td className="px-4 py-2 text-muted-foreground">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <div className="font-semibold">Authentification</div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>JWT signé HS256 (sub / username / role) émis par <code>auth_login.php</code>.</li>
              <li>Token stocké côté client + injecté en <code>Authorization: Bearer</code>.</li>
              <li>Mots de passe hashés bcrypt via <code>password_hash()</code> ; jamais retournés.</li>
              <li>Sur 401 le client purge le token et redirige vers /login.</li>
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-primary" />
              <div className="font-semibold">Autorisation (defense in depth)</div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Frontend : <code>permissionForPath()</code> filtre la nav et les pages protégées.</li>
              <li>Backend : chaque endpoint sensible appelle <code>require_role([…])</code>.</li>
              <li>Matrice configurable depuis <Link to="/roles" className="text-primary underline">Rôles & permissions</Link>.</li>
              <li>Scoping SQL agent : un Agent ne voit que ses propres prospects/contrats.</li>
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bug className="h-4 w-4 text-primary" />
              <div className="font-semibold">Hygiène & robustesse</div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>PDO préparé partout (<code>EMULATE_PREPARES=false</code>) → anti-injection.</li>
              <li>Validation enum (civility, outcome, type événement, statut facturation…).</li>
              <li>Transactions sur les opérations critiques (mark_won, suppression CF, mise à jour matrice rôles).</li>
              <li>Upsert idempotent <code>ON DUPLICATE KEY UPDATE</code> pour les valeurs CF.</li>
              <li><code>display_errors=0</code> en production, réponses JSON uniquement.</li>
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="faq" className="mt-4">
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ.map((f, i) => (
              <Card key={i} className="px-4">
                <AccordionItem value={`f-${i}`} className="border-none">
                  <AccordionTrigger className="hover:no-underline">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              </Card>
            ))}
          </Accordion>
        </TabsContent>

        <TabsContent value="changelog" className="mt-4">
          <div className="space-y-3">
            {CHANGELOG.map((c, i) => (
              <Card key={i} className="p-4 flex items-start gap-3">
                <Badge variant="outline" className="shrink-0">{c.date}</Badge>
                <div>
                  <div className="font-semibold text-sm">{c.title}</div>
                  <div className="text-sm text-muted-foreground">{c.desc}</div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 mb-12 text-xs text-muted-foreground">
        Documentation interne — CRM. Mise à jour automatique au fil des évolutions.
      </div>
    </AppLayout>
  );
}
