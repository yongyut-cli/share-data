<?php
/**
 * guard.php — front controller (FR-AUTH)
 * .htaccess ส่งทุก request (ยกเว้น login/logout/auth/guard) มาที่นี่
 * - ยังไม่ล็อกอิน → หน้า html เด้งไป login.php, ไฟล์อื่น (json/js) ตอบ 403
 * - ล็อกอินแล้ว → ส่งไฟล์สถิตจริงออกไปพร้อม Content-Type ถูกต้อง
 */

declare(strict_types=1);
require __DIR__ . '/auth.php';

$ROOT = __DIR__; // /public_html/stock

// ---- หา path ที่ผู้ใช้ขอจริง (จาก REQUEST_URI เดิม ก่อน rewrite) ----
$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri  = rawurldecode($uri);
$rel  = preg_replace('#^/stock/?#', '', $uri);   // ตัด prefix /stock/
$rel  = ltrim((string) $rel, '/');
if ($rel === '' || substr($rel, -1) === '/') {
    $rel .= 'index.html';                         // ไดเรกทอรี → index.html
}

// ---- เป็นการขอ "หน้าเว็บ" หรือไม่ (ใช้ตัดสินวิธีตอบเมื่อไม่ได้ล็อกอิน) ----
$ext     = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
$is_page = ($ext === 'html' || $ext === '');

// ---- ตรวจสิทธิ์ ----
if (!auth_is_logged_in()) {
    if ($is_page) {
        header('Location: login.php');
        exit;
    }
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'unauthorized', 'login' => 'login.php'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---- ป้องกัน path traversal: ไฟล์ต้องอยู่ใต้ $ROOT จริง ----
$target = realpath($ROOT . '/' . $rel);
if ($target === false || strpos($target, $ROOT . DIRECTORY_SEPARATOR) !== 0 || !is_file($target)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'ไม่พบไฟล์';
    exit;
}

// ---- ห้ามเสิร์ฟไฟล์ระบบ/โค้ดฝั่งเซิร์ฟเวอร์ ----
$base = strtolower(basename($target));
$blocked = ['auth.php', 'guard.php', 'login.php', 'logout.php', '.htaccess'];
if (in_array($base, $blocked, true) || $ext === 'php') {
    http_response_code(403);
    echo 'ปฏิเสธการเข้าถึง';
    exit;
}

// ---- Content-Type ----
$mimes = [
    'html' => 'text/html; charset=utf-8',
    'js'   => 'application/javascript; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif'  => 'image/gif',
    'ico'  => 'image/x-icon',
    'webp' => 'image/webp',
    'woff' => 'font/woff',
    'woff2'=> 'font/woff2',
    'map'  => 'application/json; charset=utf-8',
    'txt'  => 'text/plain; charset=utf-8',
];
header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
// แคชเฉพาะไฟล์ static (vendor/assets) — data .json เปลี่ยนรายวันจึงห้ามแคช
if (strpos($rel, 'assets/') === 0) {
    header('Cache-Control: private, max-age=86400'); // 1 วัน (ส่วนตัว ไม่ให้ proxy สาธารณะแคช)
} else {
    header('Cache-Control: private, no-cache'); // html + data ส่วนตัว — ดึงสดเสมอ
}
header('Content-Length: ' . filesize($target));
readfile($target);
