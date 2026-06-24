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
