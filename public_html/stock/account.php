<?php
/**
 * account.php — หน้าเปลี่ยนรหัสผ่าน (FR-AUTH)
 * ต้องล็อกอินก่อน · ตรวจรหัสเดิม + CSRF · เขียน hash ใหม่ลง private/users.php
 */
declare(strict_types=1);
require __DIR__ . '/auth.php';

// ต้องล็อกอินก่อน
if (!auth_is_logged_in()) {
    header('Location: login.php');
    exit;
}

$user    = (string) auth_current_user();
$error   = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!auth_csrf_check($_POST['csrf'] ?? null)) {
        $error = 'เซสชันหมดอายุ กรุณาลองใหม่';
    } else {
        $cur     = (string) ($_POST['current'] ?? '');
        $new     = (string) ($_POST['new'] ?? '');
        $confirm = (string) ($_POST['confirm'] ?? '');
        if ($new !== $confirm) {
            $error = 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน';
        } else {
            [$ok, $msg] = auth_change_password($user, $cur, $new);
            if ($ok) {
                $success = $msg;
            } else {
                $error = $msg;
            }
        }
    }
}
$csrf = auth_csrf_token();
?>
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>เปลี่ยนรหัสผ่าน — Thai Stock Analyzer</title>
<style>
  :root { --accent:#10d18e; }
  * { box-sizing: border-box; }
  body {
    margin:0; min-height:100vh; display:grid; place-items:center;
    background:#0b0f14; color:#e5e7eb;
    font-family:"IBM Plex Sans Thai", system-ui, -apple-system, sans-serif;
    padding:20px;
  }
  .card {
    width:100%; max-width:380px; background:#121821;
    border:1px solid #1f2937; border-radius:18px; padding:28px 26px;
    box-shadow:0 20px 60px rgba(0,0,0,.45);
  }
  .logo { width:46px; height:46px; border-radius:13px; display:grid; place-items:center;
    background:linear-gradient(135deg,#10d18e,#3b82f6); font-size:22px; margin-bottom:14px; }
  h1 { font-size:19px; margin:0 0 4px; }
  .sub { color:#9ca3af; font-size:13px; margin:0 0 8px; }
  .who { color:#cbd5e1; font-size:13px; margin:0 0 14px; }
  .who b { color:var(--accent); }
  label { display:block; font-size:13px; color:#cbd5e1; margin:14px 0 6px; }
  input {
    width:100%; padding:11px 13px; border-radius:11px; font-size:15px;
    background:#0b0f14; border:1px solid #2a3441; color:#f3f4f6; outline:none;
  }
  input:focus { border-color:var(--accent); }
  .hint { color:#6b7280; font-size:11.5px; margin-top:6px; }
  button {
    width:100%; margin-top:20px; padding:12px; border:0; border-radius:11px;
    background:linear-gradient(135deg,#10d18e,#3b82f6); color:#04130d;
    font-weight:700; font-size:15px; cursor:pointer; font-family:inherit;
  }
  button:hover { filter:brightness(1.06); }
  .err { margin-top:16px; padding:10px 12px; border-radius:10px;
    background:#2a1212; border:1px solid #f8717155; color:#fca5a5; font-size:13px; }
  .ok { margin-top:16px; padding:10px 12px; border-radius:10px;
    background:#0e2018; border:1px solid #10d18e55; color:#6ee7b7; font-size:13px; }
  .links { margin-top:20px; padding-top:16px; border-top:1px solid #1f2937;
    display:flex; justify-content:space-between; font-size:13px; }
  .links a { color:#9ca3af; text-decoration:none; }
  .links a:hover { color:var(--accent); }
</style>
</head>
<body>
  <form class="card" method="post" action="account.php" autocomplete="off">
    <div class="logo">🔑</div>
    <h1>เปลี่ยนรหัสผ่าน</h1>
    <p class="sub">Thai Stock <span style="color:var(--accent)">Analyzer</span></p>
    <p class="who">บัญชี: <b><?= htmlspecialchars($user, ENT_QUOTES, 'UTF-8') ?></b></p>

    <?php if ($error !== ''): ?>
      <div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endif; ?>
    <?php if ($success !== ''): ?>
      <div class="ok">✅ <?= htmlspecialchars($success, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endif; ?>

    <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">

    <label for="cur">รหัสผ่านปัจจุบัน</label>
    <input id="cur" name="current" type="password" required autocomplete="current-password" autofocus>

    <label for="np">รหัสผ่านใหม่</label>
    <input id="np" name="new" type="password" required minlength="8" autocomplete="new-password">
    <div class="hint">อย่างน้อย 8 ตัวอักษร และต้องไม่ซ้ำรหัสเดิม</div>

    <label for="cp">ยืนยันรหัสผ่านใหม่</label>
    <input id="cp" name="confirm" type="password" required minlength="8" autocomplete="new-password">

    <button type="submit">บันทึกรหัสผ่านใหม่</button>

    <div class="links">
      <a href="index.html">← กลับแดชบอร์ด</a>
      <a href="logout.php">ออกจากระบบ</a>
    </div>
  </form>
</body>
</html>
