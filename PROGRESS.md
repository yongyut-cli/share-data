# สถานะความคืบหน้า — Thai Stock Analyzer

> โดเมน: yongyut.it-tni.online · อัปเดต: 2026-06-24
> เอกสารนี้สรุป "เว็บ/ระบบทำถึงไหนแล้ว" — ดูข้อกำหนดเต็มที่ [`REQUIREMENTS.md`](./REQUIREMENTS.md)

## ภาพรวม

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Frontend UI (4 หน้า) | 🟢 **ต่อข้อมูลจริงแล้ว** (เทคนิค) | dashboard, รายตัว, screener, พอร์ต |
| Data pipeline (EOD) | 🟢 **ทำงานจริงแล้ว** (Phase 0) | ดึงราคาจริงจาก Yahoo Finance |
| เชื่อม frontend ↔ ข้อมูลจริง | 🟢 **เสร็จแล้ว** (Phase 1) | app.js fetch summary/prices JSON |
| Indicators + Scoring | 🟢 **เสร็จแล้ว** (Phase 1) | SMA/EMA/RSI/MACD/BB/ADX/ATR/Stoch/OBV + คะแนน+สัญญาณ |
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

## ⏭️ งานที่เหลือ (ตาม Roadmap)

**Phase 1 — MVP เทคนิค** ✅ เสร็จแล้ว (ดูด้านบน)

**Phase 2 — พื้นฐาน + AI ข่าว (ถัดไป)**
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
