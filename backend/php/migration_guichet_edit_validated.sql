-- =====================================================================
-- Permission « guichet.edit_validated » : autorise l'édition d'un
-- dossier / d'une opération guichet déjà validé(e).
-- Administrateur l'obtient par défaut (bypass existant déjà, seed pour
-- visibilité dans l'écran Rôles & permissions).
-- =====================================================================
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur', 'guichet.edit_validated', 1);
