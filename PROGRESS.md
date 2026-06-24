# สถานะความคืบหน้า — Thai Stock Analyzer

> โดเมน: yongyut.it-tni.online · อัปเดต: 2026-06-24 (Phase 2 เสร็จ)
> เอกสารนี้สรุป "เว็บ/ระบบทำถึงไหนแล้ว" — ดูข้อกำหนดเต็มที่ [`REQUIREMENTS.md`](./REQUIREMENTS.md)

## ภาพรวม

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Frontend UI (4 หน้า) | 🟢 **ต่อข้อมูลจริงแล้ว** (เทคนิค+พื้นฐาน) | dashboard, รายตัว, screener, พอร์ต |
| Data pipeline (EOD) | 🟢 **ทำงานจริงแล้ว** | ดึงราคา + งบการเงินจริงจาก Yahoo Finance |
| เชื่อม frontend ↔ ข้อมูลจริง | 🟢 **เสร็จแล้ว** | app.js fetch summary/prices JSON |
| Indicators + Scoring | 🟢 **เสร็จแล้ว** (Phase 1) | SMA/EMA/RSI/MACD/BB/ADX/ATR/Stoch/OBV + คะแนน+สัญญาณ |
| พื้นฐาน (งบการเงิน) + ป้ายถือยาว | 🟢 **เสร็จแล้ว** (Phase 2) | P/E,P/BV,ROE,D/E,ปันผล,กำไรโต + คะแนน+เกรด+composite |
| ข่าว + AI sentiment | 🟡 **infra พร้อม** (Phase 2) | ดึงข่าว+Claude พร้อมรัน — เปิดเมื่อตั้ง `ANTHROPIC_API_KEY` บน Actions |
| ระบบ login (FR-AUTH) | 🟢 **เสร็จแล้ว** | PHP session gate กั้นทั้ง /stock/ (html+js+json), hash รหัสผ่าน, disclaimer |
| พอร์ต + watchlist (FR-PORT) | 🟢 **เสร็จแล้ว** (Phase 3) | เก็บจริงต่อผู้ใช้ผ่าน api.php, P/L EOD, สัดส่วน+กระจายเซกเตอร์, watchlist |
| แจ้งเตือน (FR-ALERT) | 🟡 **infra พร้อม** (Phase 3) | Telegram สรุปรายวัน+สัญญาณเปลี่ยน — เปิดเมื่อตั้ง Secret TELEGRAM_* |
| backtest พื้นฐาน | 🟢 **เสร็จแล้ว** (Phase 3) | replay สัญญาณเทคนิคย้อนหลัง วัด forward-return + edge |

🟢 เสร็จใช้งานได้ · 🟡 บางส่วน · 🔴 ยังไม่เริ่ม

---

## ✅ Phase 0 — Setup (เสร็จ 2026-06-24)

- [x] git repo + remote `origin` → `github.com/yongyut-cli/share-data` *(commit แล้ว, รอ push)*
- [x] master list หุ้นไทย — `master/thai-stocks.json` **58 ตัว** (SET50/100, 14 เซกเตอร์)
- [x] Node.js pipeline ดึง EOD OHLCV จาก Yahoo (ไม่มี dependency, ใช้ `fetch` ของ Node 20)
- [x] ทดสอบจริง: ดึง 1 ตัว → หลายตัว
- [x] GitHub Actions skeleton — `.github/workflows/eod.yml` (cron 17:30 ICT)

**ผลทดสอบจริงบน host:**
- PTT 1 ตัว → 488 แท่ง (ราคาย้อนหลัง 2 ปี)
- ทั้ง master → **สำเร็จ 58/58 ใน ~19 วินาที, ไม่โดน rate-limit**
- INTUCH (ควบรวมกับ GULF, delisted) → ระบบข้าม+log ถูกต้อง (FR-DATA-4) แล้วลบออกจาก master

**ไฟล์ผลลัพธ์** (เขียนที่ `public_html/stock/data/`, web อ่านได้):
- `summary.json` — ราคาปิด + %เปลี่ยน ทุกตัว
- `meta.json` — ผลการรัน (สำเร็จ/ล้มเหลว/เวลา)
- `prices/<SYM>.json` — OHLCV ย้อนหลังรายตัว

---

## ✅ Phase 1 — MVP เทคนิค (เสร็จ 2026-06-24)

- [x] `pipeline/lib/indicators.js` — SMA, EMA(20/50/200), RSI(14), MACD, Bollinger, ATR, ADX(+DI/-DI), Stochastic, OBV (pure JS)
- [x] `pipeline/lib/scoring.js` — คะแนนเทคนิค 0–100 + จำแนกสัญญาณ BUY/ACCUMULATE/HOLD/REDUCE/SELL/AVOID + entry/stop/target (−2×ATR, R:R 1:2) + **เหตุผลประกอบทุกข้อ** (โปร่งใส)
- [x] ผนวกเข้า `run.js` — เขียน score ลง `prices/<SYM>.json` + `summary.json` + ดึง SET index (`^SET.BK`) + สถิติตลาด
- [x] **เปลี่ยน frontend จาก mock → fetch JSON จริง** ทั้ง 4 หน้า
- [x] ทดสอบ: 58/58 มีคะแนน+สัญญาณ, หน้าเว็บ serve 200, ข้อมูลเข้าถึงได้

## 🟢 Frontend — สถานะรายหน้า (ต่อข้อมูลจริงแล้ว)

| หน้า | ไฟล์ | ใช้ข้อมูลจริง |
|---|---|---|
| Dashboard | `stock/index.html` | SET index จริง, heatmap (สี=คะแนนเทคนิค, ขนาด=มูลค่าซื้อขาย), Top ซื้อ/ขาย/สะสม, ตารางคะแนน |
| รายตัว | `stock/detail.html` | กราฟแท่งเทียนจาก OHLCV จริง + EMA, กล่องสัญญาณ+แผนเทรด, เหตุผลจาก scoring engine, อินดิเคเตอร์จริง |
| Screener | `stock/screener.html` | กรอง sector/สัญญาณ/คะแนน/โมเมนตัม บนข้อมูลจริง |
| พอร์ต | `stock/portfolio.html` | กำไร/ขาดทุนจากราคา EOD จริง (รายการถือยังเป็น list จำลอง — เก็บถาวร Phase 3) |

> หมายเหตุ: ส่วนที่เป็น Phase 2 (พื้นฐาน/ข่าว/sentiment/ถือยาว) แสดงป้าย "รอ Phase 2" อย่างชัดเจน ไม่มี mock หลอกแล้ว

---

## ✅ Phase 2 — พื้นฐาน + AI ข่าว (เสร็จ 2026-06-24)

- [x] `pipeline/lib/yahoo.js` — เพิ่ม `fetchFundamentals()` (Yahoo quoteSummary + crumb/cookie auth) ดึง P/E, P/BV, ROE, ROA, D/E, ปันผล, กำไรโต YoY, อัตรากำไร, มาร์เก็ตแคป, beta + `fetchNews()` (คัด noise ออก)
- [x] `pipeline/lib/fundamentals.js` — คะแนนพื้นฐาน 0–100 + เกรด A–D + **ป้าย "เหมาะถือยาว"** (ROE≥10% + ปันผล≥3% + P/E≤25 + หนี้ไม่สูง) + เหตุผลประกอบทุกข้อ
- [x] `pipeline/lib/scoring.js` — เพิ่ม `compose()` รวม **composite 4 มิติ** (เทคนิค 45% + พื้นฐาน 30% + โมเมนตัม 15% + sentiment 10%) ปรับน้ำหนักอัตโนมัติเมื่อมิติใดไม่มีข้อมูล + สัญญาณตัดสินจาก composite
- [x] `pipeline/lib/sentiment.js` — ข่าว → Claude API (Haiku, batch เดียวคุม token) สรุปไทย + คะแนน −1..+1 + ประเด็นเสี่ยง · **degrade อย่างซื่อสัตย์**: ไม่มี key → คืน null ไม่ปลอมข้อมูล
- [x] `run.js` — ดึงราคา+งบ+ข่าวใน batch เดียว, compose, เขียน `fundamentals`/`sentiment`/`news` ลง JSON
- [x] **Frontend ต่อข้อมูลจริง Phase 2:**
  - Dashboard: การ์ด "🌱 ถือยาวน่าสน", ตัวนับถือยาว, คอลัมน์พื้นฐานในตาราง, heatmap สี=composite
  - รายตัว: การ์ดงบการเงิน (8 อัตราส่วน+เหตุผล), ป้ายถือยาว, **เรดาร์ 4 มิติของจริง**, กล่องข่าว+sentiment
  - Screener: ฟิลเตอร์ พื้นฐานขั้นต่ำ/ปันผลขั้นต่ำ/เฉพาะถือยาว + คอลัมน์ พื้นฐาน/ปันผล/ถือยาว
- [x] `.github/workflows/eod.yml` — ส่ง Secret `ANTHROPIC_API_KEY` ให้ pipeline (sentiment เปิดอัตโนมัติเมื่อตั้ง)
- [x] **ทดสอบจริง 58/58 ตัว**: งบการเงินครบ 58/58, ถือยาว 11 ตัว, BUY 21 ตัว, หน้าเว็บ serve 200, JS parse ผ่านทุกไฟล์

> ตัวอย่างผล: KTC พื้นฐาน 96 (A) · AMATA 93 (A, PE 8.39, ปันผล 4.1%) 🌱 · KKP ปันผล 6% 🌱
> **sentiment ยังไม่ทำงาน** เพราะเครื่อง dev ไม่มี `ANTHROPIC_API_KEY` — จะเปิดเองเมื่อรันบน GitHub Actions ที่ตั้ง Secret

## ⏭️ งานที่เหลือ (ตาม Roadmap)

**Phase 1 + 2** ✅ เสร็จแล้ว (ดูด้านบน)

**Phase 2 — เก็บตก (ถ้าต้องการ)**
- [ ] ตั้ง Secret `ANTHROPIC_API_KEY` บน GitHub → เปิด AI sentiment อัตโนมัติ
- [ ] หาแหล่งข่าวไทยรายตัวที่ดีกว่า Yahoo (ปัจจุบัน Yahoo ข่าว .BK เป็น noise คัดทิ้งเกือบหมด)

**Phase 3 — พอร์ต + แจ้งเตือน + ความปลอดภัย** ✅ เสร็จแล้ว (2026-06-24)
- [x] **ระบบ login (FR-AUTH)** — เสร็จ (ดูหัวข้อ 🔐 ด้านบน)
- [x] พอร์ต/watchlist เก็บข้อมูลจริง (ดูหัวข้อ 📦 ด้านล่าง)
- [x] แจ้งเตือน Telegram (สรุปรายวัน + สัญญาณเปลี่ยน) — infra พร้อม รอตั้ง Secret
- [x] backtest แบบ basic ตรวจคุณภาพสัญญาณ
- [ ] (เก็บตก) แจ้งเตือนรายตำแหน่ง stop/target จากพอร์ตผู้ใช้ · LINE ปิดบริการ Notify แล้ว · email ต้องมี SMTP

---

## 📦 Phase 3 — พอร์ต + watchlist + แจ้งเตือน + backtest (เสร็จ 2026-06-24)

**A. พอร์ต + watchlist (FR-PORT) — เก็บข้อมูลจริงต่อผู้ใช้**
- `public_html/stock/api.php` — REST เล็ก ๆ (ตรวจ session + CSRF) CRUD พอร์ต/watchlist
- เก็บที่ `private/userdata/<uid>.json` **นอก public_html** (gitignore แล้ว)
- `portfolio.html` + `assets/portfolio.js` — เพิ่ม/ลบรายการถือครอง, P/L จากราคา EOD จริง, donut สัดส่วน, **แถบกระจายความเสี่ยงรายเซกเตอร์** (เตือนเมื่อเกิน 40%), ตาราง watchlist
- `detail.html` — ปุ่ม **⭐ ติดตาม** เพิ่ม/เอาออก watchlist
- ทดสอบจริง: 401 เมื่อไม่ล็อกอิน · CSRF บังคับ · add/del/watch + validation (qty≤0 → 422) ผ่านครบ

**B. แจ้งเตือน Telegram (FR-ALERT)**
- `pipeline/lib/alerts.js` — เทียบ summary เก่า↔ใหม่หา **สัญญาณเปลี่ยนฝั่ง** + สรุปตลาด + Top BUY → ส่ง Telegram (HTML, แบ่งข้อความอัตโนมัติ)
- `run.js` STEP 5 — เรียกหลังเขียน summary · degrade เงียบถ้าไม่มี token · `--dry-alerts` พิมพ์ข้อความแทนส่ง
- `eod.yml` — ส่ง Secret `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- ทดสอบ: diff + ข้อความ render ถูกต้องบนข้อมูลจริง (dry-run)

**C. Backtest พื้นฐาน — ตรวจคุณภาพสัญญาณ**
- `pipeline/backtest.js` — replay `analyze()` ทีละวันบน OHLCV จริง, วัด forward-return 5/10/20 วัน ต่อชนิดสัญญาณ + เทียบ baseline → `data/backtest.json`
- การ์ด "🧪 คุณภาพสัญญาณ" บน dashboard
- ผลจริง (58 หุ้น): **BUY +0.38% / HOLD −0.75% / REDUCE −1.02% ที่ 20 วัน · Edge ของ BUY = +0.64% เหนือ baseline** → สัญญาณมีทิศทางถูก
- รันใน eod.yml อัตโนมัติ (`continue-on-error`, ~3 วิ)

> ⚠️ backtest วัดเฉพาะสัญญาณ**เทคนิค** (ไม่มีงบ/sentiment ย้อนหลัง) ไม่รวมค่าคอม/ปันผล/สลิปเพจ — เป็นตัวชี้คุณภาพคร่าว ไม่ใช่ผลเทรดจริง

---

## ค้างไว้ / ต้องทำ
- [ ] **push ขึ้น GitHub:** `git push -u origin main` (ต้องใช้ credential GitHub — Actions จะรันอัตโนมัติหลัง push)
- [ ] (ทางเลือก) ตั้ง Secrets `FTP_HOST/FTP_USER/FTP_PASS` ถ้าจะ deploy ขึ้น Hostinger ผ่าน FTP
- [ ] ขยาย master list ให้ครบ ~800 ตัว + ระบบอัปเดตรายชื่ออัตโนมัติเดือนละครั้ง

---

## 🔍 ผลตรวจสอบ (audit 2026-06-24) — เทียบ PROGRESS ↔ ของจริงบนเครื่อง

**สรุป: Phase 0 + Phase 1 เสร็จจริงตามที่เขียน ไม่ได้เคลมเกิน** ✅ ตรวจรายข้อ:

| ข้อเคลม | ตรวจจริง | ผล |
|---|---|---|
| Master list 58 ตัว | `master/thai-stocks.json` = 58 | ✅ |
| ราคาย้อนหลัง ~2 ปี | `prices/ADVANC.json` = 488 แท่ง OHLCV จริง | ✅ |
| Indicators ครบชุด | `lib/indicators.js` + score ฝังใน JSON (ema/rsi/macd/atr/adx/stoch) | ✅ |
| Scoring + สัญญาณ + entry/stop/target + เหตุผล | `lib/scoring.js`, score ทุกตัว | ✅ |
| SET index จริง | `summary.json` → SET 1543.44 | ✅ |
| Frontend 4 หน้า ต่อข้อมูลจริง ไม่ใช่ mock | `app.js` ใช้ `fetch()` summary/prices จริง, ไม่เหลือ mock | ✅ |
| Data JSON | prices/ = 58 ไฟล์ + summary.json + meta.json | ✅ |
| GitHub Actions cron | `.github/workflows/eod.yml` มีจริง | ✅ |

### ⚠️ ประเด็นที่พบเพิ่ม (ต้องแก้)
- [x] **หน้า root ขึ้น Hostinger default** — แก้แล้ว 2026-06-24: `public_html/index.php` + `.htaccess` redirect `/` → `/stock/`
- [x] **ลบโฟลเดอร์ขยะ** `public_html/claude-skills-main/` (42MB/3096 ไฟล์) — ลบแล้ว 2026-06-24
- [x] **🔴 login (FR-AUTH)** — เสร็จแล้ว 2026-06-24 ✅ (รายละเอียดด้านล่าง)

---

## 🔐 FR-AUTH — ระบบ login (เสร็จ 2026-06-24)

**กลไก:** PHP session gate + `.htaccess` rewrite — กั้น **ทั้งโฟลเดอร์ `/stock/`** ที่ระดับ Apache
ทุก request (html, js, **และ data .json**) วิ่งผ่าน `guard.php` ตรวจ session ก่อนเสมอ → fetch ไฟล์ตรงๆ โดยไม่ล็อกอินไม่ได้ (กันข้อมูลรั่วจริง ไม่ใช่แค่ซ่อน UI)

| ไฟล์ | หน้าที่ |
|---|---|
| `private/users.php` | username + bcrypt hash **นอก public_html** (ตาม req ไม่เก็บ secret ใน web root) · อยู่ใน `.gitignore` |
| `public_html/stock/auth.php` | session ปลอดภัย (HttpOnly/Secure/SameSite), `password_verify`, CSRF, session_regenerate, idle timeout 12 ชม. |
| `public_html/stock/guard.php` | front controller: ไม่ล็อกอิน → html เด้ง login / json ตอบ 403; ล็อกอินแล้ว → เสิร์ฟไฟล์ + กัน path traversal + กันเสิร์ฟ .php |
| `public_html/stock/login.php` | หน้าเข้าระบบ (ธีมเข้ม + **disclaimer ก.ล.ต.**) |
| `public_html/stock/logout.php` | ออกจากระบบ + ทำลาย session |
| `public_html/stock/.htaccess` | rewrite ทุก request → guard.php (ยกเว้น login/logout/auth/guard) + `-Indexes` |
| `tools/set-password.php` | CLI ตั้ง/เปลี่ยนรหัสผ่าน: `php tools/set-password.php <user> <pass>` |

**ทดสอบจริง (php -S, 10 เคส) ผ่านหมด:** root→/stock/ · html ไม่ล็อกอิน 302→login · summary.json ไม่ล็อกอิน 403 · รหัสผิดแจ้ง error · รหัสถูก 302+Set-Cookie(HttpOnly) · ล็อกอินแล้ว html/json/js = 200 · traversal+เรียก .php ตรง = บล็อก · logout คืนสภาพต้องล็อกอินใหม่

> ⚠️ มี **รหัสผ่านชั่วคราว** seed ไว้ (user `yongyut`) — เจ้าของต้องเปลี่ยนทันทีด้วย `tools/set-password.php`
