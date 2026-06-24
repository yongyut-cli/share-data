<?php
/**
 * logout.php — ออกจากระบบ (FR-AUTH)
 */
declare(strict_types=1);
require __DIR__ . '/auth.php';
auth_logout();
header('Location: login.php');
exit;
