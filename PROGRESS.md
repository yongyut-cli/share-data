# สถานะความคืบหน้า — Thai Stock Analyzer

> โดเมน: yongyut.it-tni.online · อัปเดต: 2026-06-25 (Phase 0–3 เสร็จ · **audit รอบสาม — บั๊กโค้ดแก้ครบแล้ว** เหลือแต่งานฝั่ง operational/CI ดู [🐞 ท้ายไฟล์](#-audit-รอบสาม--บั๊กงานค้างที่ยังไม่แก้-2026-06-25))
> เอกสารนี้สรุป "เว็บ/ระบบทำถึงไหนแล้ว" — ดูข้อกำหนดเต็มที่ [`REQUIREMENTS.md`](./REQUIREMENTS.md)

## ภาพรวม

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Frontend UI (4 หน้า) | 🟢 **ต่อข้อมูลจริงแล้ว** (เทคนิค+พื้นฐาน) | dashboard, รายตัว, screener, พอร์ต |
| Data pipeline (EOD) | 🟢 **ทำงานจริงแล้ว** | ดึงราคา + งบการเงินจริงจาก Yahoo Finance |
| เชื่อม frontend ↔ ข้อมูลจริง | 🟢 **เสร็จแล้ว** | app.js fetch summary/prices JSON |
| Indicators + Scoring | 🟢 **เสร็จแล้ว** (Phase 1) | SMA/EMA/RSI/MACD/BB/ADX/ATR/Stoch/OBV + คะแนน+สัญญาณ |
| พื้นฐาน (งบการเงิน) + ป้ายถือยาว | 🟢 **เสร็จแล้ว** (Phase 2) | P/E,P/BV,ROE,D/E,ปันผล,กำไรโต + คะแนน+เกรด+composite |
| ข่าว (ไทย) | 🟢 **เสร็จแล้ว** · ตรงบริษัทจริง | **Google News RSS ภาษาไทย** (2026-06-24) → ข่าวตรงบริษัท 6 ข่าว/ตัว hit-rate ~100% (เดิม Yahoo .BK ได้ 3/58 และผิดบริษัท) |
| AI sentiment | 🟡 **โค้ดแก้แล้ว · ติดโควต้า** | **บั๊ก truncation แก้แล้ว** (commit `af27e47`, ได้ 48/58 ก่อนโควต้าหมด · เดิม 0/58) · ข้อจำกัด: Gemini free tier 20 req/วัน — ดู [🔧 audit รอบสอง](#-audit--fix-รอบสอง--sentiment-จริงๆ-คืน-0-ตัว-แก้แล้ว-2026-06-24) |
| ระบบ login (FR-AUTH) | 🟢 **เสร็จแล้ว** | PHP session gate กั้นทั้ง /stock/ (html+js+json), hash รหัสผ่าน, disclaimer |
| พอร์ต + watchlist (FR-PORT) | 🟢 **เสร็จแล้ว** (Phase 3) | เก็บจริงต่อผู้ใช้ผ่าน api.php, P/L EOD, สัดส่วน+กระจายเซกเตอร์, watchlist |
| แจ้งเตือน (FR-ALERT) | 🟢 **ยืนยันส่งจริงแล้ว** (Phase 3) | Telegram สรุปรายวัน+สัญญาณเปลี่ยน · ทดสอบบน GitHub Actions 2026-06-24 (run #28087589335): STEP 5 "ส่ง Telegram สำเร็จ" ข้อความเด้งจริง |
| backtest พื้นฐาน | 🟢 **เสร็จแล้ว** (Phase 3) | replay สัญญาณเทคนิคย้อนหลัง วัด forward-return + edge |

🟢 เสร็จใช้งานได้ · 🟡 บางส่วน · 🔴 ยังไม่เริ่ม

---

## ✅ Phase 0 — Setup (เสร็จ 2026-06-24)

- [x] git repo + remote `origin` → `github.com/yongyut-cli/share-data` *(commit แล้ว, รอ push)*
- [x] master list หุ้นไทย — `master/thai-stocks.json` **58 ตัว** (SET50/100, 14 เซกเตอร์)
- [x] Node.js pipeline ดึง EOD OHLCV จาก Yahoo (ไม่มี dependency, ใช้ `fetch` ของ Node 20)
- [x] ทดสอบจริง: ดึง 1 ตัว → หลายตัว
- [x] GitHub Actions skeleton — `.github/workflows/eod.yml` (**2 จังหวะ:** intraday ทุก 15 นาทีระหว่างตลาดเปิด + EOD เต็ม 17:30 ICT)

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
- [x] `pipeline/lib/sentiment.js` — ข่าว → LLM (batch เดียวคุม token) สรุปไทย + คะแนน −1..+1 + ประเด็นเสี่ยง · **degrade อย่างซื่อสัตย์**: ไม่มี key → คืน null ไม่ปลอมข้อมูล
  - **รองรับ 2 ค่าย (เพิ่ม 2026-06-24):** ใช้ **Gemini (Google AI Studio)** ถ้าตั้ง `GEMINI_API_KEY` (มี free tier) · ถ้าไม่มีจึงใช้ Claude จาก `ANTHROPIC_API_KEY` · ค่าเริ่มต้น `gemini-2.5-flash`
- [x] `run.js` — ดึงราคา+งบ+ข่าวใน batch เดียว, compose, เขียน `fundamentals`/`sentiment`/`news` ลง JSON
- [x] **Frontend ต่อข้อมูลจริง Phase 2:**
  - Dashboard: การ์ด "🌱 ถือยาวน่าสน", ตัวนับถือยาว, คอลัมน์พื้นฐานในตาราง, heatmap สี=composite
  - รายตัว: การ์ดงบการเงิน (8 อัตราส่วน+เหตุผล), ป้ายถือยาว, **เรดาร์ 4 มิติของจริง**, กล่องข่าว+sentiment
  - Screener: ฟิลเตอร์ พื้นฐานขั้นต่ำ/ปันผลขั้นต่ำ/เฉพาะถือยาว + คอลัมน์ พื้นฐาน/ปันผล/ถือยาว
- [x] `.github/workflows/eod.yml` — ส่ง Secret `ANTHROPIC_API_KEY` ให้ pipeline (sentiment เปิดอัตโนมัติเมื่อตั้ง)
- [x] **ทดสอบจริง 58/58 ตัว** (รันล่าสุด 2026-06-24 08:06): งบการเงินครบ 58/58, ถือยาว 11 ตัว, **BUY 22 ตัว** (advancers 41), SET index 1549.46, หน้าเว็บ serve 200, JS parse ผ่านทุกไฟล์

> ตัวอย่างผล: KTC พื้นฐาน 96 (A) · AMATA 93 (A, PE 8.39, ปันผล 4.1%) 🌱 · KKP ปันผล 6% 🌱
> **sentiment เชื่อม LLM ทำงานแล้ว** — ทดสอบจริงด้วย Gemini 2.5 Flash 2026-06-24 (ดู 🔬 audit ด้านล่าง)

## ⏭️ งานที่เหลือ (ตาม Roadmap)

**Phase 1 + 2** ✅ เสร็จแล้ว (ดูด้านบน)

**Phase 2 — เก็บตก (ถ้าต้องการ)**
- [x] ตั้ง Secret LLM บน GitHub → เปิด AI sentiment อัตโนมัติ (ใช้ `GEMINI_API_KEY`, ตั้งแล้ว 2026-06-24)
- [x] ✅ **แก้แหล่งข่าวไทยรายตัวแล้ว** (2026-06-24) — เปลี่ยนจาก Yahoo search → **Google News RSS ภาษาไทย** (`pipeline/lib/news.js`, ฟรี ไม่ต้องใช้ key, parse XML เอง) · ทดสอบ PTT/ADVANC/GLOBAL/TRUE/DELTA/KCE = ได้ข่าวตรงบริษัทจากแหล่งหุ้นไทยจริง (HoonVision, มิติหุ้น, Thunhoon, ข่าวหุ้นธุรกิจ) **ตัวละ 5–6 ข่าว** · 3 ตัวที่เคยพัง (ADVANC/GLOBAL/TRUE) ตอนนี้ถูกหมด · `run.js` เรียก `fetchNewsTH()` แทน

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

## ⏱️ ตารางรันอัตโนมัติ (eod.yml — อัปเดต 2026-06-24)

รัน 2 จังหวะในวันทำการ (จันทร์–ศุกร์) เลือกโหมดอัตโนมัติจาก cron ที่ trigger:

| จังหวะ | cron (UTC) | เวลาไทย | โหมด | ทำอะไร |
|---|---|---|---|---|
| **Intraday** | `*/15 3-9 * * 1-5` | ทุก 15 นาที 10:00–16:30 | `--intraday` | ดึงราคา+เทคนิคเท่านั้น · **ไม่ดึงงบ/ข่าว · ไม่ยิง Telegram** · ข้าม backtest |
| **EOD เต็ม** | `30 10 * * 1-5` | 17:30 | `--all` | ราคา+งบ+ข่าว+sentiment+เทียบสัญญาณ+**Telegram**+backtest |

ทุกรอบ commit ผลลง repo (ป้าย `intraday <เวลา>` / `EOD <วันที่>`) + deploy ขึ้น Hostinger ถ้าตั้ง FTP secret · กดรันเองได้จากแท็บ Actions (`workflow_dispatch`, เลือก all/demo)

> ⚠️ GitHub Actions cron มัก delay 5–15 นาทีช่วงโหลดสูง และอาจข้าม run บางรอบ — เป็น near-EOD ไม่ใช่ realtime เป๊ะ

---

## ค้างไว้ / ต้องทำ
- [x] **push ขึ้น GitHub:** `origin` = `git@github.com:yongyut-cli/share-data.git` · local `main` sync กับ `origin/main` แล้ว (push ไปแล้ว 3 commit: Phase 0/1/2+3)
- [x] **แหล่งข่าวไทย + frontend ค้นหา/แบ่งหน้า:** commit + push แล้ว 2026-06-24 (`pipeline/lib/news.js`, `run.js`, frontend search/pagination)
- [x] **frontend รองรับ master list ใหญ่:** เพิ่มช่องค้นหา (ชื่อย่อ/ไทย/อังกฤษ) + แบ่งหน้า 25 ตัว/หน้า บน dashboard + screener + แก้ dropdown พื้นขาวมองไม่เห็น (`app.js`/`style.css`/`index.html`/`screener.html`)
- [ ] (ทางเลือก) ตั้ง Secrets `FTP_HOST/FTP_USER/FTP_PASS` ถ้าจะ deploy ขึ้น Hostinger ผ่าน FTP
- [x] **ขยาย master list ให้ครบเต็มตลาด** — ✅ **เสร็จ 2026-06-25**: `master/thai-stocks.json` **58 → 795 ตัว** (เพิ่ม **737 ตัว**) · แหล่ง: Yahoo Finance screener (`region=th`, `EQUITY`) ดึง 2,157 instrument แล้วกรองเหลือบริษัทจดทะเบียนจริง (เงื่อนไข: longName มี "Public Company Limited" + ตัด NVDR `-R` 838 ตัว / ETF / DR ต่างชาติ เช่น NVDA80/AAPL01 + ตัด DR ที่หลุด 4 ตัว JAP03/TAIWANAI13/TAIWANHD13/THAIBEV19) · ตรวจ: 58 ตัวเดิมอยู่ครบ (ชื่อไทย+เซกเตอร์เดิม), ไม่มี dup, `fetch-master.js` โหลดผ่าน, spot-check ราคา 7 ตัวใหม่ดึงได้จริง (ปิด 2026-06-25)
  - ⚠️ **ค้าง (enrichment):** 737 ตัวใหม่ `sector=อื่นๆ` + `name_th`=ชื่ออังกฤษ (Yahoo ไม่ให้ชื่อไทย/เซกเตอร์) · `market`=SET ทั้งหมด (Yahoo แยก mai ไม่ได้)
  - ⚠️ **ผลกระทบ operational ที่ต้องจัดการก่อนรัน 795 จริงบน CI:** (ก) **sentiment** Gemini free tier 20 req/วัน — 795 ตัว chunk 12 = ~67 req/รอบ **เกินโควต้ามาก** → ต้องเปิด billing หรือจำกัดเฉพาะ top-N (ข) **ข่าว** Google News RSS 795 req/รอบ อาจช้า/โดน rate-limit (ค) เวลา EOD ยาวขึ้น (~5 เท่า) · **โค้ดรีเฟรชรายชื่ออยู่ใน repo แล้ว** — `node pipeline/fetch-master.js --refresh` (`fetchMarketList()`+`refreshMaster()`) ดึง Yahoo screener + กรอง + merge โดยคงรายการ enrich เดิม (idempotent: รันซ้ำเพิ่ม 0) · **เหลือ wire เข้า workflow ให้รันเดือนละครั้งอัตโนมัติ**

---

## 🔍 ผลตรวจสอบ (audit 2026-06-24) — เทียบ PROGRESS ↔ ของจริงบนเครื่อง

**สรุป: Phase 0–3 เสร็จจริงตามที่เขียน ไม่ได้เคลมเกิน** ✅ (ตรวจซ้ำ 2026-06-24 — เทียบ doc กับไฟล์บนเครื่อง + เว็บสด) ตรวจรายข้อ:

| ข้อเคลม | ตรวจจริง | ผล |
|---|---|---|
| Master list 58 ตัว | `master/thai-stocks.json` = 58 | ✅ |
| ราคาย้อนหลัง ~2 ปี | `prices/ADVANC.json` = 489 แท่ง OHLCV จริง | ✅ |
| Indicators ครบชุด | `lib/indicators.js` + score ฝังใน JSON (ema/rsi/macd/atr/adx/stoch) | ✅ |
| Scoring + สัญญาณ + entry/stop/target + เหตุผล | `lib/scoring.js`, score ทุกตัว | ✅ |
| SET index จริง | `summary.json` → SET 1549.46 (รันล่าสุด) | ✅ |
| Frontend 4 หน้า ต่อข้อมูลจริง ไม่ใช่ mock | `app.js` ใช้ `fetch()` summary/prices จริง, ไม่เหลือ mock | ✅ |
| Data JSON | prices/ = 58 ไฟล์ + summary.json + meta.json | ✅ |
| GitHub Actions cron | `.github/workflows/eod.yml` มีจริง · 2 schedule: `*/15 3-9 * * 1-5` (intraday) + `30 10 * * 1-5` (EOD) | ✅ |

**ตรวจเว็บสด (HTTP จริง) 2026-06-24:**

| ข้อเคลม | ตรวจจริง | ผล |
|---|---|---|
| `/` redirect → `/stock/` | curl → 302 → /stock/ | ✅ |
| ไม่ล็อกอินเข้า `/stock/` ไม่ได้ | /stock/ + index.html → 302 → login.php | ✅ |
| data .json กันรั่วจริง | `/stock/data/summary.json` ไม่ล็อกอิน → 403 `{"error":"unauthorized"}` | ✅ |
| API กั้น session | `/stock/api.php` ไม่ล็อกอิน → 401 | ✅ |
| กันเสิร์ฟ .php ตรง | `/stock/guard.php` → 403 | ✅ |
| หน้า login + disclaimer | `/stock/login.php` → 200, มีคำเตือนความเสี่ยง | ✅ |

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

> ✅ เจ้าของเปลี่ยนรหัสผ่าน (user `yongyut`) จากค่า seed ชั่วคราวแล้ว 2026-06-24

---

## 🔬 audit AI sentiment — ทดสอบจริงด้วย Gemini (2026-06-24)

**สรุป: การเชื่อม LLM ทำงานครบ 100% · คอขวดอยู่ที่แหล่งข่าว ไม่ใช่ AI**

ตั้ง `GEMINI_API_KEY` แล้วรัน `node pipeline/run.js --all` จริง (58/58 สำเร็จ):

| ตรวจ | ผล |
|---|---|
| เลือก provider | ✅ ใช้ Gemini (gemini-2.5-flash) อัตโนมัติเมื่อมี `GEMINI_API_KEY` |
| `meta.json` | ✅ `sentiment_enabled: true`, `sentiment_ok: 3` |
| เรียก API + ตอบไทย + parse JSON + composite | ✅ ครบ (ทดสอบแยก: PTT +0.9, TRUE −0.9, KBANK +0.9 แม่นยำ) |
| degrade ซื่อสัตย์ | ✅ ไม่มี key → null; key fail → retry แล้ว skip |

⚠️ **(เดิม) แหล่งข่าว Yahoo ใช้ไม่ได้กับหุ้นไทย:** จาก 58 ตัว มีข่าวแค่ **3 ตัว** และทั้ง 3 เป็นข่าว **คนละบริษัท** (ADVANC→Advanced Medical Solutions UK, GLOBAL→การแข่งขัน Excel, TRUE→เงินเฟ้อสหรัฐฯ) · Gemini จับได้ว่าไม่เกี่ยวและให้ 0 (ถูกต้อง ไม่มั่ว)

✅ **แก้แล้ว 2026-06-24 — เปลี่ยนเป็น Google News RSS ภาษาไทย** (`pipeline/lib/news.js`):
- query ด้วยชื่อไทย + "หุ้น" + symbol, region TH (`hl=th&gl=TH&ceid=TH:th`), ฟรี ไม่ต้องใช้ key
- ทดสอบ PTT/ADVANC/GLOBAL/TRUE/DELTA/KCE → ได้ข่าว **ตรงบริษัท** จากแหล่งหุ้นไทยจริง (HoonVision, มิติหุ้น, Thunhoon, ข่าวหุ้นธุรกิจ, Share2Trade) ตัวละ 5–6 ข่าว
- รัน `node run.js --limit 3` จริง (เขียน OUT_DIR แยก ไม่แตะ data สด): PTT/PTTEP/PTTGC ได้ข่าวไทยครบตัวละ 6 ข่าว ✅
- sentiment ที่ป้อนเข้า LLM จึงมีความหมายจริง (ไม่ใช่ข่าวคนละบริษัทอีกต่อไป)

**การตั้งค่า:** local รันได้ผ่าน `.env` (gitignore แล้ว, auto-load ใน `run.js`) · GitHub Actions ตั้ง Secret `GEMINI_API_KEY` + `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` แล้ว (2026-06-24) · ดูคู่มือ [`SETUP-SECRETS.md`](./SETUP-SECRETS.md)

> ✅ **ยืนยันครบทั้ง 3 secret บน GitHub Actions แล้ว** 2026-06-24 (run #28087589335, ผ่าน 58/58):
> - `GEMINI_API_KEY` → STEP 3 "วิเคราะห์ด้วย Gemini (gemini-2.5-flash)" (เคยขึ้น 503 จาก Google ระหว่าง retry แต่สุดท้ายผ่าน · `sentiment_ok:1`)
> - `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID` → STEP 5 "ส่ง Telegram สำเร็จ" ข้อความเด้งจริง

## 🔧 audit + fix รอบสอง — sentiment จริงๆ คืน 0 ตัว (แก้แล้ว 2026-06-24)

**ตรวจซ้ำพบว่า sentiment ไม่ทำงานจริงตามที่เคลม** — รัน `--all` แล้ว `sentiment_ok` เป็น **0/58** (ไม่ใช่แค่ 1) ทั้งบนเครื่องและบน CI (commit data `0634f73` ก็ `sentiment_ok:0`)

**สาเหตุจริง (debug):**
1. `gemini-2.5-flash` ใช้ thinking tokens → output JSON ถูกตัดกลาง (`finishReason: MAX_TOKENS`) parse ไม่ได้ทุกครั้ง
2. `run.js` ส่งหุ้นที่มีข่าว **ทั้ง 58 ตัวเป็น batch เดียว** → output ทะลุ token แน่นอน
3. Gemini **free tier จำกัด 20 requests/วัน/รุ่น** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) — retry 429 รัวๆ ยิ่งเปลืองโควต้า

**แก้ (`pipeline/lib/sentiment.js`, `util.js`, `run.js` · commit `af27e47`):**
- ปิด thinking (`thinkingBudget:0`) + เพิ่ม `maxOutputTokens` 2048→4096 → JSON ไม่ถูกตัด
- chunk batch กลุ่มละ 12 (58 หุ้น = ~5 requests/รอบ อยู่ใต้เพดาน 20/วัน)
- เจอ 429 → หยุดทั้ง step ทันที ไม่ retry เปลืองโควต้า
- carry-forward: รอบ `--all` ถ้าดึง sentiment ไม่ได้ คงค่ารอบก่อน (ติดธง `stale`) แทนล้างเป็น null

**ยืนยัน:** หลังแก้ รันได้ **sentiment 48/58** ก่อนโควต้ารายวันหมด (เดิม 0/58) → บั๊กหายจริง

> ⚠️ **คงค้าง:** โควต้า Gemini free tier (20 req/วัน) ใช้หมดจากการ debug วันนี้ → sentiment ปัจจุบันยังเป็น null จนโควต้า reset · ข่าวไทย (Google News RSS) ลงครบแล้ว 6 ข่าว/ตัว · รอบ EOD ถัดไปบน CI (ใช้ ~5 req) จะเติม sentiment ให้เองถ้าไม่รัน key เดียวกันซ้ำในวันเดียว · ถ้าต้องการ sentiment ครบ 58 ทุกวันแน่นอน ควรพิจารณา (ก) เปิด billing Gemini หรือ (ข) ลดจำนวนหุ้นที่ส่ง LLM/วัน

## 🚀 deploy/CI log — 2026-06-24

**ปัญหาที่พบ:** โค้ดบน GitHub (remote) เป็นเวอร์ชันเก่า — `sentiment.js` ไม่รองรับ Gemini, `run.js` ไม่มี `--intraday`, `eod.yml` ไม่ได้ส่ง `GEMINI_API_KEY` เข้า env → CI run แรก (#28087127298) ข้าม sentiment ทั้งที่ตั้ง secret แล้ว (เว็บสดใช้ได้เพราะ Hostinger เสิร์ฟไฟล์ในเครื่องตรง ไม่ผ่าน GitHub)

**แก้:** commit + push โค้ด/frontend/เอกสารที่ค้าง (ไม่รวม data — CI เป็นเจ้าของ) → `fbcf2fe` · rebase ดึง CI data commit (`4848009`) ก่อน push · ตรวจไม่มี secret/`users.php`/`userdata` หลุด (gitignore กันแล้ว)

**ผล:** CI run #28087589335 ยืนยัน Gemini + Telegram + 2-schedule ทำงานครบ ✅

---

## 🐞 audit รอบสาม — บั๊ก/งานค้างที่ยังไม่แก้ (2026-06-25)

> ตรวจโค้ดจริงบนเครื่อง (ไม่ใช่แค่อ่าน doc) — อ่าน pipeline ทั้งหมด + PHP backend + frontend JS/HTML + ตรวจไฟล์ data สด
> **สรุป: โครงสร้างหลักแน่น (auth/api/guard/indicators ผ่าน)** แต่เจอบั๊ก frontend 1 จุดที่ทำตัวเลขพอร์ตผิดได้จริง + งานค้างย่อยอีกหลายจุด
>
> ✅ **อัปเดต 2026-06-25 — บั๊ก/งานค้างฝั่งโค้ดแก้ครบทุกข้อแล้ว** (getStock null + ป้ายนอกชุดข้อมูล, แก้ไขรายการถือครอง, ป้าย sentiment stale, SET index stale, sentiment score string→null, news.js cosmetic) ทุกไฟล์ `node --check` ผ่าน · **เหลือเฉพาะงาน operational ที่ตรวจจากในเครื่องไม่ได้:** เติม sentiment รอบ EOD ถัดไป + ตรวจ/ push CI (ดูท้ายหัวข้อ)

### 🔴 บั๊กจริง (ควรแก้)

- [x] **พอร์ต/watchlist แสดงข้อมูลหุ้น "ผิดตัว" เงียบ ๆ เมื่อหุ้นอยู่นอก universe 58 ตัว** ⭐ สำคัญสุด — ✅ **แก้แล้ว 2026-06-25**
  - ต้นเหตุ (เดิม): `getStock()` (`assets/app.js:37`) = `STOCKS.find(...) || STOCKS[0]` → หาไม่เจอ **คืนตัวแรก (ADVANC)** ไม่ใช่ null
  - **แก้:** `getStock` คืน `null` เมื่อไม่เจอ (`app.js:37`) · `renderPortfolio` (`portfolio.js:26`) ตรวจ `unknown=!s` → ไม่เอาราคา/เซกเตอร์หุ้นอื่นมาคิด, แถวขึ้นป้าย **"⚠️ นอกชุดข้อมูล"** (สีเหลือง), ราคา/มูลค่า/PL = "—", ไม่นับเข้า MV/กระจายเซกเตอร์ → ตัวเลขพอร์ตถูกต้อง
  - ด่านกันกลับมาทำงาน (ไม่ใช่ dead code แล้ว): `renderWatchlist` (`portfolio.js`) แสดง "ไม่มีข้อมูลในชุดติดตาม" · addForm `if(!getStock(sym))` บล็อกเพิ่มหุ้นนอกชุดจริง
  - `detail.html` ไม่ได้ใช้ `getStock` (fetch `prices/<sym>.json` ตรง → 404 → `showDataError` สุภาพ) จึงไม่กระทบ
  - ทดสอบ: `node --check` ผ่านทั้ง `app.js`/`portfolio.js`

### 🟠 ข้อมูล / งานยังไม่เสร็จ

- [x] **SET index ค้างเก่า** — ✅ **แก้แล้ว 2026-06-25**: `run.js` คำนวณ gap วันปฏิทินระหว่าง `^SET.BK` กับวันที่หุ้นล่าสุด (`latestStockDate`) → ติดธง `set_index.stale=true` เมื่อ ≥2 วัน + เก็บ `stale_days`/`stock_date` ลง `summary.json` · dashboard (`index.html`) โชว์ป้าย **"⏳ <วันที่>"** สีเหลือง + tooltip บอกว่า Yahoo ดีเลย์ · log ขึ้นคำเตือนตอนรันด้วย · `node --check` ผ่าน
- [x] **แก้ไขรายการถือครองไม่ได้** — ✅ **แก้แล้ว 2026-06-25**: เพิ่มปุ่ม **✎ แก้ไข** ในตารางถือครอง (`portfolio.js`) + ฟังก์ชัน `editHolding()` เรียก action `update_holding` (prompt qty/cost, validate qty>0 & cost≥0) · `node --check` ผ่าน
- [x] **ป้าย sentiment "stale" ไม่แสดง** — ✅ **แก้แล้ว 2026-06-25**: `renderNews()` ใน `detail.html` เช็ค `sent.stale` → ขึ้นป้าย **"⏳ ข้อมูลเก่า"** (สีเหลือง + tooltip อธิบายว่าเป็นค่าคงจากรอบก่อนเพราะดึง AI ไม่ได้/โควต้าหมด) ข้างชิป sentiment
- [ ] **sentiment ว่างทั้ง 58 ตัวบนเว็บสดตอนนี้** (`meta.json → sentiment_ok:0`) — ⏳ **รอ EOD รอบถัดไป (operational ไม่ใช่บั๊กโค้ด)**: data สดสร้าง 2026-06-24T17:31Z (ตรวจซ้ำ 2026-06-25 ยังเป็นไฟล์เดิม) `sentiment_ok:0` เพราะโควต้า Gemini free tier หมดตอน debug · โค้ดแก้แล้ว (chunk 12 + ปิด thinking + carry-forward `stale`) · รอบ EOD ที่รันโค้ดใหม่บน CI จะเติม sentiment + ป้าย stale (frontend พร้อมแล้ว 2026-06-25)

### 🟡 เล็กน้อย / เชิงป้องกัน

- [x] `sentiment.js` — ✅ **แก้แล้ว 2026-06-25**: normalize score รองรับ string (`Number(...)`) + ถ้า parse ไม่ได้/ไม่ finite → คืน `null` แทน NaN เงียบ ๆ (`analyzeChunk`)
- [x] `news.js:46` — ✅ **แก้แล้ว 2026-06-25**: เปลี่ยน `else if (!publisher)` ที่ซ้ำซ้อน → `else` (cosmetic)

### ✅ ตรวจแล้วผ่าน (ไม่พบปัญหา)

- PHP backend: `auth.php` (bcrypt + session ปลอดภัย + CSRF + timing-safe), `guard.php` (กัน path traversal + บล็อก .php + 403/302 ถูก), `api.php` (validate input + CSRF + sanitize uid), `.htaccess` (rewrite + กัน auth.php) — แน่นหนา
- `indicators.js` SMA/EMA/RSI/MACD/ATR/ADX/Stoch/OBV — สูตรถูก (EMA seed จากค่าแรกเป็น simplification ที่ยอมรับได้)
- `backtest.js` — index slicing ไม่ over-run (ตรวจ off-by-one แล้วถูก)
- frontend field mapping — ทุก field ที่ `app.js`/`portfolio.js`/`detail.html` ใช้ มีจริงใน `summary.json`/`prices/<SYM>.json`
- API action names ตรงกันระหว่าง frontend ↔ `api.php` ครบ
- vendor assets (echarts/lightweight-charts/tailwind) มีไฟล์ครบ · pipeline JS parse ผ่านทุกไฟล์

### ⚠️ ต้องเช็คเพิ่ม (จากในเครื่องตรวจไม่ได้)

- [ ] **cron EOD บน GitHub Actions ยังรันจริงทุกวันหรือเปล่า** — ⚠️ **ตรวจจากในเครื่องไม่ได้ (ไม่มี `gh` CLI/auth บน host)** · ข้อมูลที่ตรวจได้ 2026-06-25: `meta.json generated_at = 2026-06-24T17:31Z`, แท่งหุ้นล่าสุด 06-23, **ยังไม่มี run ของ 06-25** · ✅ โค้ดแก้รอบสาม push ขึ้น origin/main แล้ว 2026-06-25 (commit `737db9a`, `8faf2f7..737db9a`) → รอบ EOD ถัดไป CI จะรันโค้ดใหม่ · **เจ้าของควรเปิดแท็บ Actions** ดู run 06-25 สำเร็จไหม
