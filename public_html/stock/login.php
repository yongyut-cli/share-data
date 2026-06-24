<?php
/**
 * login.php — หน้าเข้าสู่ระบบ (FR-AUTH)
 */
declare(strict_types=1);
require __DIR__ . '/auth.php';

// ล็อกอินอยู่แล้ว → เข้าหน้าหลัก
if (auth_is_logged_in()) {
    header('Location: index.html');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!auth_csrf_check($_POST['csrf'] ?? null)) {
        $error = 'เซสชันหมดอายุ กรุณาลองใหม่';
    } elseif (auth_attempt((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''))) {
        header('Location: index.html');
        exit;
    } else {
        $error = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        usleep(400000); // หน่วงเล็กน้อยกัน brute-force
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
<title>เข้าสู่ระบบ — Thai Stock Analyzer</title>
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
  .sub { color:#9ca3af; font-size:13px; margin:0 0 22px; }
  label { display:block; font-size:13px; color:#cbd5e1; margin:14px 0 6px; }
  input {
    width:100%; padding:11px 13px; border-radius:11px; font-size:15px;
    background:#0b0f14; border:1px solid #2a3441; color:#f3f4f6; outline:none;
  }
  input:focus { border-color:var(--accent); }
  button {
    width:100%; margin-top:20px; padding:12px; border:0; border-radius:11px;
    background:linear-gradient(135deg,#10d18e,#3b82f6); color:#04130d;
    font-weight:700; font-size:15px; cursor:pointer;
    font-family:inherit;
  }
  button:hover { filter:brightness(1.06); }
  .err { margin-top:16px; padding:10px 12px; border-radius:10px;
    background:#2a1212; border:1px solid #f8717155; color:#fca5a5; font-size:13px; }
  .disclaimer { margin-top:22px; padding-top:16px; border-top:1px solid #1f2937;
    color:#6b7280; font-size:11.5px; line-height:1.65; }
</style>
</head>
<body>
  <form class="card" method="post" action="login.php" autocomplete="off">
    <div class="logo">📊</div>
    <h1>Thai Stock <span style="color:var(--accent)">Analyzer</span></h1>
    <p class="sub">ระบบส่วนตัว · กรุณาเข้าสู่ระบบ</p>

    <?php if ($error !== ''): ?>
      <div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endif; ?>

    <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
    <label for="u">ชื่อผู้ใช้</label>
    <input id="u" name="username" type="text" required autofocus autocomplete="username">
    <label for="p">รหัสผ่าน</label>
    <input id="p" name="password" type="password" required autocomplete="current-password">
    <button type="submit">เข้าสู่ระบบ</button>

    <p class="disclaimer">
      ⚠️ <b>ข้อจำกัดความรับผิดชอบ:</b> ระบบนี้ใช้เพื่อการศึกษา/วิเคราะห์ส่วนตัวเท่านั้น
      ข้อมูลและสัญญาณทั้งหมดไม่ใช่คำแนะนำการลงทุน และไม่ได้เผยแพร่ต่อสาธารณะ
      การลงทุนมีความเสี่ยง ผู้ใช้ควรศึกษาข้อมูลก่อนตัดสินใจ
    </p>
  </form>
</body>
</html>
