<?php
/**
 * set-password.php — ตั้ง/เปลี่ยนรหัสผ่านผู้ใช้ (FR-AUTH)
 *
 * ใช้งาน (รันบน host ผ่าน SSH):
 *   php tools/set-password.php <username> <password>
 *
 * จะเขียน hash ลง private/users.php (นอก public_html) — ไม่เก็บรหัสจริง
 * ใช้ฟังก์ชันร่วมกับเว็บ (account.php) ผ่าน auth.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("เครื่องมือนี้รันผ่าน command line เท่านั้น\n");
}

require __DIR__ . '/../public_html/stock/auth.php';

$user = $argv[1] ?? '';
$pass = $argv[2] ?? '';
if ($user === '' || $pass === '') {
    fwrite(STDERR, "วิธีใช้: php tools/set-password.php <username> <password>\n");
    exit(1);
}
if (strlen($pass) < 8) {
    fwrite(STDERR, "รหัสผ่านควรยาวอย่างน้อย 8 ตัวอักษร\n");
    exit(1);
}

if (!auth_set_password($user, $pass)) {
    fwrite(STDERR, "บันทึกไม่สำเร็จ — ตรวจสิทธิ์ไฟล์ " . auth_users_path() . "\n");
    exit(1);
}

echo "ตั้งรหัสผ่านให้ผู้ใช้ '{$user}' เรียบร้อย → " . auth_users_path() . "\n";
