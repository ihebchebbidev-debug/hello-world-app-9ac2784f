# Project Memory

## CoreE
PHP backend at https://luccibyey.com.tn/crminternet — display_errors=0, so always wrap inserts in try/catch and return $e->getMessage() in fail() for debuggability.
Custom fields system is dynamic — always mount <CustomFieldsCard> on new entity detail pages.
CRM MVP scope (cahier des charges): leads (statuts Nouveau/En cours/Rappel/Refus/Vendu, sources Terrain/Facebook/Autre), suivi commercial avec actions horodatées, pipeline Kanban, relances via tasks. Modules masqués: Contracts, Dispatch, Reconciliation, Backoffice, Objectives, Reports.
Rôles MVP: DB garde Administrateur/Manager/Agent/Backoffice — UI affiche Administrateur/Superviseur/Commercial via src/lib/roleLabels.ts. Backoffice masqué dans selects.
Endpoint lead actions: backend/php/lead_actions.php (table crminternet_lead_actions auto-créée). Types: appel/visite/relance/note.
Login = 2FA email obligatoire: code 4 chiffres envoyé via SMTP OVH (backend/php/mailer.php). Endpoints: auth_login.php (étape 1), auth_otp_verify.php, auth_otp_resend.php. Pas d'intégrations externes (WhatsApp/SMS/API) dans le scope MVP.

## Memories
- [Custom fields](mem://features/custom-fields) — Dynamic fields backend+frontend pattern
- [Login OTP](mem://features/login-otp) — 2FA email 4 chiffres via OVH SMTP
