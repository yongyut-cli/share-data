<?php
/**
 * auth.php — ตัวกลางจัดการ session + ตรวจสิทธิ์ (FR-AUTH)
 * ใช้ร่วมโดย guard.php / login.php / logout.php
 */

declare(strict_types=1);

// ---- โหลดรายชื่อผู้ใช้จากนอก public_html (ไม่เก็บ secret ใน web root) ----
function auth_users(): array
{
    $path = __DIR__ . '/../../private/users.php';
    if (!is_file($path)) {
        return [];
    }
    $users = require $path;
    return is_array($users) ? $users : [];
}

// ---- path ของไฟล์ผู้ใช้ (นอก public_html) ----
function auth_users_path(): string
{
    return __DIR__ . '/../../private/users.php';
}

// ---- เขียนรายชื่อผู้ใช้กลับลงไฟล์ (atomic + สิทธิ์เข้มงวด) ----
function auth_save_users(array $users): bool
{
    $file = auth_users_path();
    $out  = "<?php\n"
          . "/**\n"
          . " * ผู้ใช้ที่ได้รับอนุญาต (FR-AUTH) — เก็บนอก public_html\n"
          . " * แก้ไขผ่าน account.php (เว็บ) หรือ tools/set-password.php (CLI) — ห้าม commit (.gitignore)\n"
          . " */\n"
          . "return [\n";
    foreach ($users as $u => $h) {
        $out .= "    " . var_export((string) $u, true) . " => " . var_export((string) $h, true) . ",\n";
    }
    $out .= "];\n";

    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    // เขียนลงไฟล์ชั่วคราวแล้ว rename เพื่อกันไฟล์เสียกลางคัน
    $tmp = $file . '.tmp' . getmypid();
    if (file_put_contents($tmp, $out, LOCK_EX) === false) {
        return false;
    }
    chmod($tmp, 0600);
    return rename($tmp, $file);
}

// ---- ตั้ง/เปลี่ยนรหัสผ่านผู้ใช้ (สร้าง user ใหม่ถ้ายังไม่มี) ----
function auth_set_password(string $user, string $pass): bool
{
    $users = auth_users();
    $users[trim($user)] = password_hash($pass, PASSWORD_DEFAULT);
    return auth_save_users($users);
}

// ---- เปลี่ยนรหัสผ่านโดยต้องยืนยันรหัสเดิม คืน [bool, ข้อความ] ----
function auth_change_password(string $user, string $current, string $new): array
{
    $users = auth_users();
    $user  = trim($user);
    if (!isset($users[$user])) {
        return [false, 'ไม่พบบัญชีผู้ใช้'];
    }
    if (!password_verify($current, $users[$user])) {
        usleep(400000); // หน่วงกัน brute-force
        return [false, 'รหัสผ่านปัจจุบันไม่ถูกต้อง'];
    }
    if (strlen($new) < 8) {
        return [false, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร'];
    }
    if ($new === $current) {
        return [false, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'];
    }
    if (!auth_set_password($user, $new)) {
        return [false, 'บันทึกรหัสผ่านไม่สำเร็จ — ตรวจสิทธิ์ไฟล์ private/users.php'];
    }
    return [true, 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'];
}

// ---- ชื่อผู้ใช้ที่ล็อกอินอยู่ (null ถ้ายังไม่ล็อกอิน) ----
function auth_current_user(): ?string
{
    auth_start_session();
    return isset($_SESSION['uid']) ? (string) $_SESSION['uid'] : null;
}

// ---- เริ่ม session แบบปลอดภัย ----
function auth_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_name('tsa_sess');
    session_set_cookie_params([
        'lifetime' => 0,            // หมดอายุเมื่อปิด browser
        'path'     => '/stock/',
        'httponly' => true,         // JS อ่าน cookie ไม่ได้
        'secure'   => $https,       // ส่งผ่าน HTTPS เท่านั้น (เมื่อมี)
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ---- ตรวจว่าล็อกอินอยู่หรือยัง ----
function auth_is_logged_in(): bool
{
    auth_start_session();
    if (empty($_SESSION['uid'])) {
        return false;
    }
    // idle timeout 12 ชม.
    if (isset($_SESSION['last']) && (time() - (int) $_SESSION['last']) > 43200) {
        auth_logout();
        return false;
    }
    $_SESSION['last'] = time();
    return true;
}

// ---- พยายามล็อกอิน คืน true เมื่อสำเร็จ ----
function auth_attempt(string $user, string $pass): bool
{
    $users = auth_users();
    $user  = trim($user);
    if (!isset($users[$user])) {
        // hash ปลอมกัน timing attack ให้ลองหุ้นเวลาเท่ากัน
        password_verify($pass, '$2y$10$usesomesillystringfooobarbazquxXXXXXXXXXXXXXXXXXXXXX.');
        return false;
    }
    if (!password_verify($pass, $users[$user])) {
        return false;
    }
    auth_start_session();
    session_regenerate_id(true);  // กัน session fixation
    $_SESSION['uid']  = $user;
    $_SESSION['last'] = time();
    return true;
}

// ---- ออกจากระบบ ----
function auth_logout(): void
{
    auth_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool) ($p['secure'] ?? false), (bool) ($p['httponly'] ?? false));
    }
    session_destroy();
}

// ---- CSRF token ----
function auth_csrf_token(): string
{
    auth_start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function auth_csrf_check(?string $token): bool
{
    auth_start_session();
    return !empty($_SESSION['csrf']) && is_string($token) && hash_equals($_SESSION['csrf'], $token);
}
