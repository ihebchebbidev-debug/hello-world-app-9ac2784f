-- Adds an "Instance rejeté" stage to the opportunity pipeline.
-- Safe to re-run: INSERT IGNORE skips when the unique name already exists.

INSERT IGNORE INTO crminternet_opportunity_stages
  (id, name, color, position, is_initial, is_won, is_lost, auto_action)
VALUES
  ('OS-rejete01', 'Instance rejeté', 'destructive', 90, 0, 0, 1, 'revert_lead');
