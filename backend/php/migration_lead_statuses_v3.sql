-- ============================================================
-- Lead statuses v3 — replace the kanban / allowed status list.
-- Idempotent: clears crminternet_lead_stages and reseeds.
-- Run ONCE on each environment.
-- ============================================================

DELETE FROM crminternet_lead_stages;

INSERT INTO crminternet_lead_stages (id, name, color, position) VALUES
  ('S-1',  'Ok',                'success',     1),
  ('S-2',  'Att cin',            'warning',     2),
  ('S-3',  'Att confirmation',   'warning',     3),
  ('S-4',  'Rappel',             'info',        4),
  ('S-5',  'refuse',             'destructive', 5),
  ('S-6',  'migration',          'primary',     6),
  ('S-7',  'Basculement',        'primary',     7),
  ('S-8',  'Ing',                'info',        8),
  ('S-9',  'Nrp',                'muted',       9),
  ('S-10', 'Pas de rep',         'muted',      10),
  ('S-11', 'Pas intersse',       'destructive',11),
  ('S-12', 'Déjà connecté',      'success',    12),
  ('S-13', 'Autr dde encor',     'info',       13),
  ('S-14', 'Autre',              'muted',      14);

-- Re-map any legacy status values still present on existing leads.
UPDATE crminternet_prospects SET status='Ok'        WHERE status IN ('Vendu','Gagné','Vente');
UPDATE crminternet_prospects SET status='refuse'    WHERE status IN ('Refus','Refusé','Perdu','Sans réponse');
UPDATE crminternet_prospects SET status='Rappel'    WHERE status IN ('A rappeler');
UPDATE crminternet_prospects SET status='Nrp'       WHERE status IN ('Nouveau','A traiter','En cours','Contacté','Qualifié','Proposition','');
