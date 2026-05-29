-- =====================================================================
-- MIGRATION FINALE — CIN doublons autorisés + jeu de données de test
-- Idempotent : peut être rejouée sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. S'assurer que les colonnes nécessaires existent (gouvernorat, delegation, comment2)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS crm_add_col_v3;
DELIMITER $$
CREATE PROCEDURE crm_add_col_v3(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema=DATABASE() AND table_name=tbl AND column_name=col) THEN
    SET @s := CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

CALL crm_add_col_v3('crminternet_prospects',     'gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_prospects',     'delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_prospects',     'comment2',    "`comment2`    TEXT         NULL");

CALL crm_add_col_v3('crminternet_opportunities', 'phone2',      "`phone2`      VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_opportunities', 'cin',         "`cin`         VARCHAR(40)  NULL");
CALL crm_add_col_v3('crminternet_opportunities', 'birth_date',  "`birth_date`  DATE         NULL");
CALL crm_add_col_v3('crminternet_opportunities', 'gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_opportunities', 'delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_opportunities', 'address',     "`address`     VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_opportunities', 'comment1',    "`comment1`    TEXT         NULL");
CALL crm_add_col_v3('crminternet_opportunities', 'comment2',    "`comment2`    TEXT         NULL");

CALL crm_add_col_v3('crminternet_contracts',     'civility',    "`civility`    ENUM('M','Mme') NOT NULL DEFAULT 'M'");
CALL crm_add_col_v3('crminternet_contracts',     'phone2',      "`phone2`      VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_contracts',     'cin',         "`cin`         VARCHAR(40)  NULL");
CALL crm_add_col_v3('crminternet_contracts',     'birth_date',  "`birth_date`  DATE         NULL");
CALL crm_add_col_v3('crminternet_contracts',     'gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_contracts',     'delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_contracts',     'address',     "`address`     VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_contracts',     'comment1',    "`comment1`    TEXT         NULL");
CALL crm_add_col_v3('crminternet_contracts',     'comment2',    "`comment2`    TEXT         NULL");

DROP PROCEDURE crm_add_col_v3;

-- ---------------------------------------------------------------------
-- 2. CIN doublons autorisés : passer en NULL + INDEX simple (drop UNIQUE)
-- ---------------------------------------------------------------------
UPDATE crminternet_prospects     SET cin = NULL WHERE cin = '';
UPDATE crminternet_opportunities SET cin = NULL WHERE cin = '';
UPDATE crminternet_contracts     SET cin = NULL WHERE cin = '';

ALTER TABLE crminternet_prospects     MODIFY cin VARCHAR(40) NULL;
ALTER TABLE crminternet_opportunities MODIFY cin VARCHAR(40) NULL;
ALTER TABLE crminternet_contracts     MODIFY cin VARCHAR(40) NULL;

-- Drop UNIQUE indexes if present, add simple index for fast lookup
DROP PROCEDURE IF EXISTS crm_swap_cin_index;
DELIMITER $$
CREATE PROCEDURE crm_swap_cin_index(IN tbl VARCHAR(64), IN ux_name VARCHAR(64), IN ix_name VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.statistics
             WHERE table_schema=DATABASE() AND table_name=tbl AND index_name=ux_name) THEN
    SET @s := CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', ux_name, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                 WHERE table_schema=DATABASE() AND table_name=tbl AND index_name=ix_name) THEN
    SET @s := CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', ix_name, '` (cin)');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

CALL crm_swap_cin_index('crminternet_prospects',     'ux_prospect_cin',  'ix_prospect_cin');
CALL crm_swap_cin_index('crminternet_opportunities', 'ux_opp_cin',       'ix_opp_cin');
CALL crm_swap_cin_index('crminternet_contracts',     'ux_contract_cin',  'ix_contract_cin');
DROP PROCEDURE crm_swap_cin_index;

-- ---------------------------------------------------------------------
-- 3. JEU DE DONNÉES DE TEST (FAKE DATA)
--    - 30 prospects, dont plusieurs partagent la même CIN (doublons légitimes)
--    - 6 opportunités, 4 contrats
-- ---------------------------------------------------------------------

-- ===== PROSPECTS =====
-- CIN partagées pour démonstration des "fiches doublons" :
--   '01234567' -> 3 fiches (Ben Salah Ahmed, Ben Saleh Ahmad, BENSALAH A.)
--   '11223344' -> 2 fiches (Trabelsi Sonia, Trabelsi S.)
--   '99887766' -> 2 fiches (Gharbi Mohamed, Gharbi Med)
INSERT IGNORE INTO crminternet_prospects
  (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email,
   source, status, assigned_to, created_at, city, gouvernorat, delegation, address,
   outcome, comment, comment2, check_valeur)
VALUES
  ('P-FAKE001','M','Ben Salah','Ahmed','22111001','71800001','01234567','1985-03-12','ahmed.bs@example.tn','Terrain','Nouveau',NULL,'2025-04-01','TUNIS','TUNIS','Bab Bhar','12 Rue de la République','pending','Premier contact via porte-à-porte','RDV à reconfirmer','pending'),
  ('P-FAKE002','M','Ben Saleh','Ahmad','22111002','','01234567','1985-03-12','ahmad.bs@example.tn','Web','En cours',NULL,'2025-04-15','TUNIS','TUNIS','Medina','15 Rue Sidi Brahim','pending','Doublon probable de P-FAKE001 — coordonnées différentes',NULL,'pending'),
  ('P-FAKE003','M','BENSALAH','A.','22111003','','01234567',NULL,'','Recommandation','Rappel',NULL,'2025-05-02','SOUSSE','SOUSSE','Sousse Médina','Av. Habib Bourguiba','pending','Variante orthographique',NULL,'pending'),

  ('P-FAKE004','Mme','Trabelsi','Sonia','24222004','71800004','11223344','1990-07-21','sonia.t@example.tn','Salon','En cours',NULL,'2025-03-20','ARIANA','ARIANA','Ariana Ville','45 Rue Taieb Mhiri','pending','Intéressée formule famille',NULL,'valid'),
  ('P-FAKE005','Mme','Trabelsi','S.','24222005','','11223344','1990-07-21','','Terrain','Nouveau',NULL,'2025-05-18','ARIANA','ARIANA','La Soukra','Cité Ennasr 2','pending','Fiche saisie par un autre agent',NULL,'pending'),

  ('P-FAKE006','M','Gharbi','Mohamed','25333006','','99887766','1978-11-05','m.gharbi@example.tn','Web','Vendu',NULL,'2025-02-10','SFAX','SFAX','Sfax Ville','Rue Mongi Slim','won','Converti rapidement',NULL,'valid'),
  ('P-FAKE007','M','Gharbi','Med','25333007','71800007','99887766','1978-11-05','','Email','Refus',NULL,'2025-04-22','SFAX','SFAX','Sakiet Ezzit','Cité El Habib','lost','Doublon — déjà client (P-FAKE006)',NULL,'invalid'),

  -- Prospects uniques
  ('P-FAKE008','M','Hammami','Karim','26111008','','12345678','1982-05-14','k.hammami@example.tn','Terrain','En cours',NULL,'2025-05-01','TUNIS','TUNIS','El Menzah','5 Rue de Carthage','pending',NULL,NULL,'pending'),
  ('P-FAKE009','Mme','Mejri','Leila','26111009','','23456789','1995-09-30','l.mejri@example.tn','Web','Nouveau',NULL,'2025-05-03','BIZERTE','BIZERTE','Bizerte Nord','Av. de France','pending',NULL,NULL,'pending'),
  ('P-FAKE010','M','Bouzidi','Slim','26111010','','34567890','1988-01-18','s.bouzidi@example.tn','Recommandation','Rappel',NULL,'2025-05-05','NABEUL','NABEUL','Hammamet','Centre-ville','pending','Rappeler vendredi','Préfère le matin','pending'),
  ('P-FAKE011','Mme','Riahi','Amel','26111011','','45678901','1992-12-02','a.riahi@example.tn','Salon','En cours',NULL,'2025-05-06','MONASTIR','MONASTIR','Monastir Ville','Av. Bourguiba','pending',NULL,NULL,'pending'),
  ('P-FAKE012','M','Khaldi','Nizar','26111012','','56789012','1980-08-25','n.khaldi@example.tn','Web','Nouveau',NULL,'2025-05-07','GABES','GABES','Gabès Sud','Rue Ali Belhouane','pending',NULL,NULL,'pending'),
  ('P-FAKE013','Mme','Zarrouk','Hela','26111013','','67890123','1986-02-11','h.zarrouk@example.tn','Email','Vendu',NULL,'2025-04-12','SFAX','SFAX','Sfax Ouest','Cité El Bahri','won',NULL,NULL,'valid'),
  ('P-FAKE014','M','Sassi','Walid','26111014','','78901234','1991-06-19','w.sassi@example.tn','Terrain','Refus',NULL,'2025-04-28','TUNIS','TUNIS','Bardo','12 Rue Ibn Khaldoun','lost','Pas intéressé',NULL,'invalid'),
  ('P-FAKE015','Mme','Bouzaiene','Rim','26111015','','89012345','1993-10-04','r.bouzaiene@example.tn','Web','En cours',NULL,'2025-05-08','ARIANA','ARIANA','Raoued','Cité Olympique','pending',NULL,NULL,'pending'),
  ('P-FAKE016','M','Marzouki','Tarek','26111016','','90123456','1979-04-22','t.marzouki@example.tn','Recommandation','Nouveau',NULL,'2025-05-09','BEN AROUS','BEN AROUS','Hammam Lif','Av. de la Plage','pending',NULL,NULL,'pending'),
  ('P-FAKE017','M','Chaabane','Yassine','26111017','','01987654','1987-07-07','y.chaabane@example.tn','Web','Rappel',NULL,'2025-05-10','TUNIS','TUNIS','Lac 2','Rue du Lac Léman','pending','Intéressé par l\'auto',NULL,'pending'),
  ('P-FAKE018','Mme','Toumi','Nadia','26111018','','12876543','1989-11-13','n.toumi@example.tn','Salon','En cours',NULL,'2025-05-11','SOUSSE','SOUSSE','Hammam Sousse','Cité El Manar','pending',NULL,NULL,'pending'),
  ('P-FAKE019','M','Jlassi','Hatem','26111019','','23765432','1984-03-29','h.jlassi@example.tn','Terrain','Vendu',NULL,'2025-04-05','MAHDIA','MAHDIA','Mahdia Centre','Av. Habib Bourguiba','won',NULL,NULL,'valid'),
  ('P-FAKE020','M','Mansouri','Aymen','26111020','','34654321','1996-08-16','a.mansouri@example.tn','Web','Nouveau',NULL,'2025-05-12','KAIROUAN','KAIROUAN','Kairouan Médina','Rue Tahar Sfar','pending',NULL,NULL,'pending'),
  ('P-FAKE021','Mme','Hadj Ali','Sarra','26111021','','45543210','1994-05-23','s.hadjali@example.tn','Recommandation','En cours',NULL,'2025-05-13','TUNIS','TUNIS','Marsa','Av. de la Marsa','pending',NULL,NULL,'pending'),
  ('P-FAKE022','M','Belhadj','Anis','26111022','','56432109','1983-09-08','a.belhadj@example.tn','Web','Rappel',NULL,'2025-05-14','BIZERTE','BIZERTE','Menzel Bourguiba','Rue de la Liberté','pending',NULL,NULL,'pending'),
  ('P-FAKE023','Mme','Dridi','Imen','26111023','','67321098','1990-12-15','i.dridi@example.tn','Email','Nouveau',NULL,'2025-05-15','TUNIS','TUNIS','Centre Urbain Nord','Tour Yasmine','pending',NULL,NULL,'pending'),
  ('P-FAKE024','M','Saidi','Marouane','26111024','','78210987','1981-02-28','m.saidi@example.tn','Salon','Refus',NULL,'2025-04-30','GAFSA','GAFSA','Gafsa Sud','Rue Ali Bach Hamba','lost','Concurrence moins chère',NULL,'invalid'),
  ('P-FAKE025','Mme','Brahmi','Olfa','26111025','','89109876','1992-06-04','o.brahmi@example.tn','Terrain','Vendu',NULL,'2025-03-15','SFAX','SFAX','Sakiet Eddaier','Av. Hédi Chaker','won',NULL,NULL,'valid'),
  ('P-FAKE026','M','Aissaoui','Ramzi','26111026','','90098765','1985-10-19','r.aissaoui@example.tn','Web','En cours',NULL,'2025-05-16','TUNIS','TUNIS','Manouba','Rue de l\'Indépendance','pending',NULL,NULL,'pending'),
  ('P-FAKE027','Mme','Krimi','Donia','26111027','','01122334','1997-01-25','d.krimi@example.tn','Recommandation','Nouveau',NULL,'2025-05-17','BEN AROUS','BEN AROUS','Mégrine','Av. de Carthage','pending',NULL,NULL,'pending'),
  ('P-FAKE028','M','Ferchichi','Sami','26111028','','11233445',NULL,'','Terrain','Rappel',NULL,'2025-05-18','KEBILI','KEBILI','Douz','Av. du 7 Novembre','pending','CIN à reverifier','Sans date de naissance','pending'),
  ('P-FAKE029','Mme','Ouali','Hiba','26111029','',NULL,NULL,'','Web','Nouveau',NULL,'2025-05-19','TUNIS','TUNIS','Ennasr','Rue de Rome','pending','CIN inconnue (autorisé)',NULL,'pending'),
  ('P-FAKE030','M','Ben Romdhane','Fares','26111030','71800030',NULL,'1988-04-04','f.benromdhane@example.tn','Email','En cours',NULL,'2025-05-20','TUNIS','TUNIS','Bardo','Rue de Marseille','pending','CIN volontairement vide',NULL,'pending');

-- ===== OPPORTUNITÉS =====
INSERT IGNORE INTO crminternet_opportunities
  (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email,
   city, gouvernorat, delegation, address, source, title, stage,
   amount, probability, expected_close_date, assigned_to, notes, created_by,
   comment1, comment2)
VALUES
  ('O-FAKE001','M','Ben Salah','Ahmed','22111001','','01234567','1985-03-12','ahmed.bs@example.tn',
   'TUNIS','TUNIS','Bab Bhar','12 Rue de la République','Terrain','Auto Tous Risques — Ben Salah','Qualification',
   1850.00,60,'2025-06-30','admin','Devis envoyé','admin','Doublon CIN avec O-FAKE002',NULL),
  ('O-FAKE002','M','Ben Saleh','Ahmad','22111002','','01234567','1985-03-12','ahmad.bs@example.tn',
   'TUNIS','TUNIS','Medina','15 Rue Sidi Brahim','Web','Habitation — Ben Saleh','Proposition',
   620.00,40,'2025-07-15','admin','Variante du même client','admin','Fiche doublon autorisée',NULL),
  ('O-FAKE003','Mme','Trabelsi','Sonia','24222004','','11223344','1990-07-21','sonia.t@example.tn',
   'ARIANA','ARIANA','Ariana Ville','45 Rue Taieb Mhiri','Salon','Pack Famille — Trabelsi','Négociation',
   3200.00,75,'2025-06-20','admin','Très intéressée','admin',NULL,NULL),
  ('O-FAKE004','M','Hammami','Karim','26111008','','12345678','1982-05-14','k.hammami@example.tn',
   'TUNIS','TUNIS','El Menzah','5 Rue de Carthage','Terrain','Auto — Hammami','Qualification',
   1450.00,50,'2025-07-01','admin','En attente justificatifs','admin',NULL,NULL),
  ('O-FAKE005','Mme','Riahi','Amel','26111011','','45678901','1992-12-02','a.riahi@example.tn',
   'MONASTIR','MONASTIR','Monastir Ville','Av. Bourguiba','Salon','Santé Premium — Riahi','Proposition',
   2100.00,65,'2025-06-25','admin','Devis personnalisé','admin',NULL,NULL),
  ('O-FAKE006','M','Marzouki','Tarek','26111016','','90123456','1979-04-22','t.marzouki@example.tn',
   'BEN AROUS','BEN AROUS','Hammam Lif','Av. de la Plage','Recommandation','Multi-risques Pro — Marzouki','Qualification',
   4800.00,55,'2025-08-10','admin','Société en création','admin',NULL,NULL);

-- ===== CONTRATS =====
INSERT IGNORE INTO crminternet_contracts
  (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email,
   city, gouvernorat, delegation, address, partner, cabinet,
   signature_date, effective_date, validation_date, premium, billing_status,
   source, assigned_to, comment1, comment2)
VALUES
  ('C-FAKE001','M','Gharbi','Mohamed','25333006','','99887766','1978-11-05','m.gharbi@example.tn',
   'SFAX','SFAX','Sfax Ville','Rue Mongi Slim','GAT Assurances','Cabinet Sfax Centre',
   '2025-02-20','2025-03-01','2025-02-25',1980.00,'Validé Confirmation','Web','admin','Premier contrat',NULL),
  ('C-FAKE002','Mme','Zarrouk','Hela','26111013','','67890123','1986-02-11','h.zarrouk@example.tn',
   'SFAX','SFAX','Sfax Ouest','Cité El Bahri','STAR','Cabinet Sfax Ouest',
   '2025-04-18','2025-05-01','2025-04-22',2450.00,'Validé Confirmation','Email','admin',NULL,NULL),
  ('C-FAKE003','M','Jlassi','Hatem','26111019','','23765432','1984-03-29','h.jlassi@example.tn',
   'MAHDIA','MAHDIA','Mahdia Centre','Av. Habib Bourguiba','MAGHREBIA','Cabinet Mahdia',
   '2025-04-10','2025-04-20','2025-04-15',1620.00,'Pré-validé','Terrain','admin',NULL,NULL),
  ('C-FAKE004','Mme','Brahmi','Olfa','26111025','','89109876','1992-06-04','o.brahmi@example.tn',
   'SFAX','SFAX','Sakiet Eddaier','Av. Hédi Chaker','GAT Assurances','Cabinet Sfax Centre',
   '2025-03-22','2025-04-01','2025-03-28',2890.00,'En attente de validation','Terrain','admin',NULL,NULL);

-- =====================================================================
-- FIN. Vérifications utiles :
--   SELECT cin, COUNT(*) c FROM crminternet_prospects WHERE cin IS NOT NULL GROUP BY cin HAVING c > 1;
--   -> doit lister 01234567 (3), 11223344 (2), 99887766 (2)
-- =====================================================================
