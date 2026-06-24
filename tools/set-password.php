<?php
/**
 * set-password.php — ตั้ง/เปลี่ยนรหัสผ่านผู้ใช้ (FR-AUTH)
 *
 * ใช้งาน (รันบน host ผ่าน SSH):
 *   php tools/set-password.php <username> <password>
 *
 * จะเขียน hash ลง private/users.php (นอก public_html) — ไม่เก็บรหัสจริง
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("เครื่องมือนี้รันผ่าน command line เท่านั้น\n");
}

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

$file = __DIR__ . '/../private/users.php';
$users = is_file($file) ? (require $file) : [];
if (!is_array($users)) {
    $users = [];
}

$users[trim($user)] = password_hash($pass, PASSWORD_DEFAULT);

$out = "<?php\n"
     . "/**\n"
     . " * ผู้ใช้ที่ได้รับอนุญาต (FR-AUTH) — เก็บนอก public_html\n"
     . " * สร้างโดย tools/set-password.php — ห้าม commit (อยู่ใน .gitignore)\n"
     . " */\n"
     . "return [\n";
foreach ($users as $u => $h) {
    $out .= "    " . var_export((string) $u, true) . " => " . var_export((string) $h, true) . ",\n";
}
$out .= "];\n";

if (!is_dir(dirname($file))) {
    mkdir(dirname($file), 0700, true);
}
file_put_contents($file, $out, LOCK_EX);
chmod($file, 0600);

echo "ตั้งรหัสผ่านให้ผู้ใช้ '{$user}' เรียบร้อย → {$file}\n";
