-- Adds the `lead.history` permission so non-admins can view a lead's full
-- change history when explicitly granted. Admins bypass the check.
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','lead.history',1),
  ('Manager','lead.history',1),
  ('Superviseur','lead.history',1);
