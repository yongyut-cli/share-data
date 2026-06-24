<?php
// เปลี่ยนเส้นทาง root → แอปจริงที่ /stock/ (ซึ่งมีระบบ login กั้นอยู่)
header('Location: /stock/', true, 302);
exit;
