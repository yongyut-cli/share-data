<?php
/**
 * api.php — API ส่วนตัว (FR-PORT) พอร์ต + watchlist
 * ต้องล็อกอินก่อน (ตรวจ session) · เก็บข้อมูลต่อผู้ใช้ใน private/userdata/<uid>.json (นอก web root)
 *
 * GET  ?action=state                         → { portfolio, watchlist, updated_at, csrf }
 * POST action=add_holding {sym,qty,cost,opened_at?}
 * POST action=update_holding {id,qty,cost}
 * POST action=del_holding {id}
 * POST action=watch_add {sym}
 * POST action=watch_del {sym}
 * POST ต้องแนบ header X-CSRF (ได้จาก ?action=state)
 */
declare(strict_types=1);
require __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');

function out($data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!auth_is_logged_in()) {
    out(['error' => 'unauthorized'], 401);
}
$uid = (string) ($_SESSION['uid'] ?? '');

// ---- storage helpers (ไฟล์ต่อผู้ใช้ นอก public_html) ----
function udata_path(string $uid): string
{
    $dir = __DIR__ . '/../../private/userdata';
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    // sanitize uid ให้เป็นชื่อไฟล์ปลอดภัย
    $safe = preg_replace('/[^a-zA-Z0-9_-]/', '_', $uid);
    return $dir . '/' . $safe . '.json';
}

function udata_load(string $uid): array
{
    $path = udata_path($uid);
    $base = ['portfolio' => [], 'watchlist' => [], 'updated_at' => null];
    if (!is_file($path)) {
        return $base;
    }
    $j = json_decode((string) file_get_contents($path), true);
    if (!is_array($j)) {
        return $base;
    }
    return array_merge($base, $j);
}

function udata_save(string $uid, array $data): void
{
    $data['updated_at'] = gmdate('c');
    $path = udata_path($uid);
    file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    chmod($path, 0600);
}

// ---- ตัวช่วย validate ----
function clean_sym($v): ?string
{
    $v = strtoupper(trim((string) $v));
    return preg_match('/^[A-Z0-9.&-]{1,12}$/', $v) ? $v : null;
}
function pos_num($v): ?float
{
    if (!is_numeric($v)) return null;
    $f = (float) $v;
    return $f >= 0 ? $f : null;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($_POST['action'] ?? '');

// ---- GET: อ่านสถานะ ----
if ($method === 'GET' && $action === 'state') {
    $d = udata_load($uid);
    $d['csrf'] = auth_csrf_token();
    out($d);
}

// ---- POST: เปลี่ยนแปลงข้อมูล (ต้องมี CSRF) ----
if ($method === 'POST') {
    // รับ body ได้ทั้ง form และ JSON
    $body = $_POST;
    if (empty($body)) {
        $raw = file_get_contents('php://input');
        $j = json_decode((string) $raw, true);
        if (is_array($j)) $body = $j;
    }
    $action = $body['action'] ?? $action;
    $token  = $_SERVER['HTTP_X_CSRF'] ?? ($body['csrf'] ?? null);
    if (!auth_csrf_check(is_string($token) ? $token : null)) {
        out(['error' => 'bad_csrf'], 403);
    }

    $d = udata_load($uid);

    switch ($action) {
        case 'add_holding': {
            $sym  = clean_sym($body['sym'] ?? '');
            $qty  = pos_num($body['qty'] ?? null);
            $cost = pos_num($body['cost'] ?? null);
            $when = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($body['opened_at'] ?? '')) ? $body['opened_at'] : gmdate('Y-m-d');
            if (!$sym || $qty === null || $qty <= 0 || $cost === null) {
                out(['error' => 'invalid_input'], 422);
            }
            $d['portfolio'][] = [
                'id'        => bin2hex(random_bytes(6)),
                'sym'       => $sym,
                'qty'       => $qty,
                'cost'      => $cost,
                'opened_at' => $when,
            ];
            udata_save($uid, $d);
            out($d);
        }
        case 'update_holding': {
            $id   = (string) ($body['id'] ?? '');
            $qty  = pos_num($body['qty'] ?? null);
            $cost = pos_num($body['cost'] ?? null);
            $found = false;
            foreach ($d['portfolio'] as &$h) {
                if ($h['id'] === $id) {
                    if ($qty !== null && $qty > 0) $h['qty'] = $qty;
                    if ($cost !== null) $h['cost'] = $cost;
                    $found = true;
                    break;
                }
            }
            unset($h);
            if (!$found) out(['error' => 'not_found'], 404);
            udata_save($uid, $d);
            out($d);
        }
        case 'del_holding': {
            $id = (string) ($body['id'] ?? '');
            $d['portfolio'] = array_values(array_filter($d['portfolio'], fn($h) => $h['id'] !== $id));
            udata_save($uid, $d);
            out($d);
        }
        case 'watch_add': {
            $sym = clean_sym($body['sym'] ?? '');
            if (!$sym) out(['error' => 'invalid_input'], 422);
            if (!in_array($sym, $d['watchlist'], true)) {
                $d['watchlist'][] = $sym;
            }
            udata_save($uid, $d);
            out($d);
        }
        case 'watch_del': {
            $sym = clean_sym($body['sym'] ?? '');
            $d['watchlist'] = array_values(array_filter($d['watchlist'], fn($s) => $s !== $sym));
            udata_save($uid, $d);
            out($d);
        }
        default:
            out(['error' => 'unknown_action'], 400);
    }
}

out(['error' => 'bad_request'], 400);
