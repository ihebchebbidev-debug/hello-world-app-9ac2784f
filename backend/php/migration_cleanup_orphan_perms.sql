-- Run once on existing databases to remove orphan permission rows
-- (e.g. role='Superviseur' which never existed in crminternet_roles —
-- the real role is 'Manager' labelled 'Superviseur').
DELETE FROM crminternet_role_permissions
 WHERE role NOT IN (SELECT name FROM crminternet_roles);
