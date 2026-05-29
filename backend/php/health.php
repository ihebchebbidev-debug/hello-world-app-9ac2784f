<?php
require_once __DIR__ . '/config.php';
$db = (new Database())->getConnection();
$db->query('SELECT 1');
ok(['service' => 'protection-erp-api', 'time' => date('c')]);
