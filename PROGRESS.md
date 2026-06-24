# สถานะความคืบหน้า — Thai Stock Analyzer

> โดเมน: yongyut.it-tni.online · อัปเดต: 2026-06-24
> เอกสารนี้สรุป "เว็บ/ระบบทำถึงไหนแล้ว" — ดูข้อกำหนดเต็มที่ [`REQUIREMENTS.md`](./REQUIREMENTS.md)

## ภาพรวม

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Frontend UI (4 หน้า) | 🟡 เสร็จหน้าตา แต่ยังใช้ **ข้อมูลจำลอง (mock)** | dashboard, รายตัว, screener, พอร์ต |
| Data pipeline (EOD) | 🟢 **ทำงานจริงแล้ว** (Phase 0) | ดึงราคาจริงจาก Yahoo Finance |
| เชื่อม frontend ↔ ข้อมูลจริง | 🔴 ยังไม่ได้ทำ | งานหลักของ Phase 1 |
| Indicators + Scoring | 🔴 ยังไม่ได้ทำ | Phase 1 |
| พื้นฐาน + ข่าว/AI sentiment | 🔴 ยังไม่ได้ทำ | Phase 2 |
| พอร์ต + แจ้งเตือน + login | 🔴 ยังไม่ได้ทำ | Phase 3 / FR-AUTH |

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

## 🟡 Frontend — สถานะรายหน้า

ทุกหน้าทำ **หน้าตา (UI) เสร็จสวยงาม** แล้ว แต่ดึงจาก mock ใน `public_html/stock/assets/app.js` (หุ้น 15 ตัวสมมติ) — **ยังไม่ได้ต่อกับข้อมูลจริง**

| หน้า | ไฟล์ | มีอะไรแล้ว |
|---|---|---|
| Dashboard | `stock/index.html` | SET index, heatmap รายเซกเตอร์, การ์ด Top ซื้อ/ขาย/ถือยาว, ตารางคะแนน |
| รายตัว | `stock/detail.html` | กราฟแท่งเทียน + EMA + volume, เรดาร์ 4 มิติ, กล่องสัญญาณ entry/stop/target, เหตุผล, ข่าว |
| Screener | `stock/screener.html` | กรอง sector/สัญญาณ/คะแนน/ปันผล/ถือยาว |
| พอร์ต | `stock/portfolio.html` | ตารางถือหุ้น, กำไร/ขาดทุน, donut สัดส่วน |

> ⚠️ ทุกหน้ายังขึ้นป้าย "ข้อมูลจำลอง (mock)" — ตัวเลขสัญญาณ/คะแนนทั้งหมดยังไม่ใช่ของจริง

---

## ⏭️ งานที่เหลือ (ตาม Roadmap)

**Phase 1 — MVP เทคนิค (ถัดไป)**
- [ ] คำนวณ indicators: SMA/EMA(20/50/200), RSI(14), MACD, Bollinger, ADX, ATR, OBV
- [ ] scoring เทคนิค 0–100 + สัญญาณ BUY/HOLD/SELL + entry/stop/target + เหตุผล
- [ ] **เปลี่ยน frontend ให้อ่าน JSON จริง แทน mock** ← ทำให้เว็บ "ของจริง"
- [ ] screener ทำงานบนข้อมูลจริง

**Phase 2 — พื้นฐาน + AI ข่าว**
- [ ] อัตราส่วนพื้นฐาน (P/E, P/BV, ROE, ปันผล...) + ป้าย "เหมาะถือยาว"
- [ ] ดึงข่าว RSS → Claude API สรุป + sentiment

**Phase 3 — พอร์ต + แจ้งเตือน + ความปลอดภัย**
- [ ] พอร์ต/watchlist เก็บข้อมูลจริง
- [ ] แจ้งเตือน Telegram/LINE/email
- [ ] **ระบบ login (FR-AUTH)** — สำคัญด้านกฎหมาย ก.ล.ต. (ห้ามเปิดสาธารณะ)
- [ ] backtest แบบ basic

---

## ค้างไว้ / ต้องทำ
- [ ] **push ขึ้น GitHub:** `git push -u origin main` (ต้องใช้ credential GitHub — Actions จะรันอัตโนมัติหลัง push)
- [ ] (ทางเลือก) ตั้ง Secrets `FTP_HOST/FTP_USER/FTP_PASS` ถ้าจะ deploy ขึ้น Hostinger ผ่าน FTP
- [ ] ขยาย master list ให้ครบ ~800 ตัว + ระบบอัปเดตรายชื่ออัตโนมัติเดือนละครั้ง
