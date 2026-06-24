# Requirements — ระบบวิเคราะห์หุ้นไทย (Thai Stock Analyzer)

> เอกสารกำหนดความต้องการ (PRD/SRS) — เวอร์ชัน 0.1
> วันที่: 2026-06-24 · เจ้าของ: projectcoordinator@shargemgmt.com
> โดเมน: yongyut.it-tni.online

---

## 1. ภาพรวมและเป้าหมาย (Vision)

เว็บแอปวิเคราะห์หุ้นไทย (SET + mai) ครบทุกตัว แสดงผลด้วยกราฟิกสวยงาม ให้ข้อมูลเชิงลึกและ
"สัญญาณ" รายวันว่า **ควรซื้อตัวไหนวันนี้ / ควรขายเมื่อไหร่ / ตัวไหนเหมาะถือยาว** โดยรวม
4 มิติ: เทคนิค + พื้นฐาน + ข่าว/sentiment (AI) + การจัดการพอร์ต & แจ้งเตือน

### ข้อจำกัด/บริบทที่ยึดเป็นหลักออกแบบ (จากที่ยืนยันแล้ว)
| ประเด็น | ค่าที่เลือก | ผลต่อการออกแบบ |
|---|---|---|
| ความสดข้อมูล | **End-of-day (EOD)** | ประมวลผลเป็น batch วันละครั้งหลังตลาดปิด ไม่ต้องมี realtime feed |
| งบประมาณ | **ฟรีล้วน/ถูกสุด** | ใช้แหล่งข้อมูลฟรี + compute ฟรี (GitHub Actions) + host เดิม (Hostinger) |
| ผู้ใช้ | **ส่วนตัว/คนใกล้ชิด** | ลดภาระ compliance ก.ล.ต. แต่ยังต้องมี disclaimer และ "ห้ามเผยแพร่สาธารณะ" |
| ขอบเขต | **เทคนิค + พื้นฐาน + AI/ข่าว + พอร์ต/แจ้งเตือน** | 4 โมดูลวิเคราะห์ + 1 โมดูลพอร์ต |

---

## 2. ⚠️ ข้อกฎหมายและ Disclaimer (อ่านก่อน — สำคัญ)

- การให้คำแนะนำซื้อ-ขายหลักทรัพย์ **ต่อสาธารณะ** ในไทยเข้าข่ายธุรกิจที่ ก.ล.ต. กำกับ
  (ผู้แนะนำการลงทุน/นักวิเคราะห์ต้องมีใบอนุญาต). เพราะเลือก **"ใช้ส่วนตัว/คนใกล้ชิด"**
  จึงยังไม่เข้าข่าย แต่ต้อง:
  - **ไม่เปิดสาธารณะ** — มีระบบ login จำกัดผู้ใช้ (ดู FR-AUTH)
  - แสดง disclaimer ทุกหน้า: *"ข้อมูลเพื่อการศึกษาส่วนตัว ไม่ใช่คำแนะนำการลงทุน
    การลงทุนมีความเสี่ยง ผู้ลงทุนควรตัดสินใจด้วยตนเอง"*
- ปฏิบัติตามเงื่อนไขการใช้ข้อมูล (ToS) ของแหล่งข้อมูลฟรี — ห้ามขายต่อข้อมูล
- ระบบให้ "สัญญาณเชิงกลไก (rule-based/score)" ไม่ใช่การการันตีผลตอบแทน

---

## 3. ขอบเขต (Scope)

### In scope
1. ดึงข้อมูล EOD หุ้นไทยทุกตัว (~800+ securities) ราคา OHLCV + งบการเงินย่อ + ข่าว
2. คำนวณอินดิเคเตอร์เทคนิค + อัตราส่วนพื้นฐาน + sentiment ข่าว
3. เครื่องให้คะแนน (scoring engine) → สัญญาณ Buy/Hold/Sell/Avoid + โซนเข้า/จุดตัดขาดทุน/เป้าหมาย
4. ป้ายกำกับ "เหมาะถือยาว" (จากพื้นฐาน + ปันผล) แยกจากสัญญาณเทรดสั้น
5. เว็บ UI: dashboard, หน้ารายตัว (กราฟแท่งเทียน + อินดิเคเตอร์), ตารางคัดกรอง (screener)
6. พอร์ตจำลอง + watchlist + แจ้งเตือน (email/LINE/Telegram)

### Out of scope (เฟสแรก)
- การส่งคำสั่งซื้อขายจริง (order execution) / เชื่อมโบรกเกอร์
- ข้อมูล realtime / level-2 order book
- Backtesting engine เต็มรูปแบบ (มีแบบ basic ใน Phase 3)
- รองรับผู้ใช้สาธารณะจำนวนมาก

---

## 4. แหล่งข้อมูล (ฟรี — Data Sources)

| ข้อมูล | แหล่งฟรี | หมายเหตุ |
|---|---|---|
| ราคา EOD OHLCV | **yfinance** (Yahoo Finance, ใช้ ticker `XXXX.BK`) | ครอบคลุม SET ส่วนใหญ่, ฟรี, batch ได้ |
| รายชื่อหุ้นทั้งหมด | ไฟล์รายชื่อ SET/mai (ดึงครั้งเดียว/อัปเดตเดือนละครั้ง) | เก็บเป็น master table |
| งบการเงิน/อัตราส่วน | yfinance (P/E, P/BV, ROE, มาร์เก็ตแคป, ปันผล) + เสริมด้วย scrape เท่าที่ ToS อนุญาต | พื้นฐานบางตัวอาจไม่ครบ → ใส่ flag "ข้อมูลไม่สมบูรณ์" |
| ข่าว | RSS ฟรีของสำนักข่าวการเงินไทย/ตลาด | feed รายวัน |
| Sentiment | **Claude API** (มี token อยู่แล้วในเครื่อง) สรุป+ให้คะแนนข่าว -1..+1 | ใช้ batch วันละครั้ง คุมต้นทุน token |

> หมายเหตุความเสี่ยงข้อมูล: Yahoo เป็น unofficial/อาจมี rate limit และข้อมูลพื้นฐานหุ้นเล็กไม่ครบ
> → ออกแบบให้ระบบ "ทนต่อข้อมูลขาด" (graceful degradation) และ cache ทุกอย่าง

---

## 5. สถาปัตยกรรม (Free-tier Architecture)

```
[GitHub Actions cron 17:30 ICT]  ← compute ฟรี วันละครั้ง
        │  (Node.js pipeline)
        ▼
  1. ingest EOD (yfinance)  → raw
  2. คำนวณ technical + fundamental
  3. ดึงข่าว RSS → Claude API → sentiment
  4. scoring engine → signals
  5. เขียนผลเป็น SQLite + JSON snapshot
        │
        ▼ (deploy: rsync/FTP/SSH หรือ commit artifact)
[Hostinger: yongyut.it-tni.online/public_html]
   - frontend (static SPA หรือ PHP) อ่าน JSON/SQLite
   - PHP API บางๆ (อ่านอย่างเดียว) + ระบบ login
        │
        ▼
   ผู้ใช้ (เบราว์เซอร์) — dashboard, กราฟ, screener, พอร์ต, แจ้งเตือน
```

**เหตุผล:** งานหนัก (ดึง+คำนวณหุ้น 800 ตัว/วัน) ไม่เหมาะรันบน shared hosting →
ยกไป GitHub Actions (ฟรี 2,000 นาที/เดือน เกินพอสำหรับ EOD) แล้วส่งผล "สำเร็จรูป"
มาให้เว็บอ่าน → เว็บเบาและเร็ว, ไม่ต้องมี Python บน host

---

## 6. Tech Stack ที่แนะนำ (ทั้งหมดฟรี/โอเพนซอร์ส)

| ชั้น | เทคโนโลยี | เหตุผล |
|---|---|---|
| Data pipeline | **Node.js** (Node 20, `fetch` ในตัว — ไม่ต้องลง dependency) | host เป็น Node-only; ดึง Yahoo ได้จริง, ภาษาเดียวกับ frontend · *(เดิมระบุ Python+pandas-ta — เปลี่ยนเป็น Node ตามสภาพแวดล้อมจริง 2026-06-24)* |
| Sentiment | **Anthropic Claude API** (Haiku/Sonnet สำหรับงาน batch) | มี token แล้ว, คุณภาพดี |
| Compute/cron | **GitHub Actions** | ฟรี, cron ในตัว, log/retry ดี |
| Storage | **SQLite** (+ JSON snapshot ต่อวัน) | ไม่ต้องมี DB server, พกพาง่าย |
| Backend (host) | **PHP 8** (มีบน Hostinger) อ่านอย่างเดียว | ไม่ต้องลงอะไรเพิ่ม |
| Frontend | **HTML + Vanilla/Alpine.js หรือ Vue (CDN)** | เบา, ไม่ต้อง build chain |
| กราฟราคา | **TradingView Lightweight Charts** (ฟรี) | แท่งเทียนสวย+ลื่น เหมาะหุ้นที่สุด |
| กราฟสถิติ/แดชบอร์ด | **ECharts** หรือ **Chart.js** | heatmap, treemap, เรดาร์คะแนน |
| CSS/UI | **Tailwind CSS** (CDN) + ธีม dark | "สวยๆ" ตามโจทย์ ทำเร็ว |
| แจ้งเตือน | **Telegram Bot API** / **LINE Notify** (ฟรี) + email (PHP mail) | push ฟรี |

---

## 7. Functional Requirements (รายโมดูล)

### FR-DATA — Data Ingestion
- FR-DATA-1: master list หุ้นไทยทั้งหมด (symbol, ชื่อ, ตลาด SET/mai, sector, industry)
- FR-DATA-2: ดึง OHLCV EOD ย้อนหลัง ≥ 2 ปี (ครั้งแรก) แล้ว incremental รายวัน
- FR-DATA-3: เก็บ corporate actions (แตกพาร์/ปันผล) เพื่อปรับราคา (adjusted)
- FR-DATA-4: ทนข้อมูลขาด/ticker เพี้ยน → log + ข้าม + ตั้ง flag

### FR-TECH — การวิเคราะห์เทคนิค
- ตัวชี้วัด: SMA/EMA (20/50/200), RSI(14), MACD, Bollinger Bands, ADX,
  Stochastic, ATR (สำหรับ stop), OBV/Volume profile
- รูปแบบ: แนวรับ-แนวต้าน (pivot), Golden/Dead cross, breakout จาก base
- เอาต์พุต/ตัว: คะแนนเทคนิค 0–100 + รายการสัญญาณที่ติด (เช่น "RSI ออกจาก oversold", "ตัด EMA50 ขึ้น")

### FR-FUND — การวิเคราะห์พื้นฐาน
- อัตราส่วน: P/E, P/BV, ROE, ROA, D/E, อัตรากำไรขั้นต้น/สุทธิ, การเติบโตกำไร (YoY),
  อัตราปันผล (dividend yield), payout ratio, market cap
- จัดเกรดคุณภาพ (quality) + มูลค่า (valuation: ถูก/แพงเทียบ sector)
- เอาต์พุต/ตัว: คะแนนพื้นฐาน 0–100 + ป้าย "เหมาะถือยาว" (ผ่านเกณฑ์คุณภาพ+ปันผล+ไม่แพงเกิน)

### FR-AI — ข่าว & Sentiment
- ดึงข่าวรายตัว/รายเซกเตอร์จาก RSS รายวัน
- ส่งให้ Claude API สรุปเป็นไทย + ให้คะแนน sentiment (-1..+1) + ระบุประเด็นเสี่ยง/บวก
- เอาต์พุต/ตัว: sentiment score + สรุปข่าว 2–3 บรรทัด + ลิงก์แหล่ง

### FR-SIGNAL — เครื่องให้คะแนน & สัญญาณ (หัวใจระบบ)
- **Composite score** = ถ่วงน้ำหนัก (เทคนิค, พื้นฐาน, momentum, sentiment) — น้ำหนักปรับได้
- จำแนกสัญญาณ: **BUY / ACCUMULATE / HOLD / REDUCE / SELL / AVOID**
- สำหรับ "ซื้อวันนี้": จัด Top-N รายวันแยกตาม style (เทรดสั้น vs สะสมยาว)
- สำหรับ "ขายเมื่อไหร่": กฎ exit ชัดเจนต่อตัว —
  - จุดตัดขาดทุน (stop) = entry − k×ATR
  - เป้าหมาย (target) = แนวต้านถัดไป / risk-reward ≥ 1:2
  - exit เมื่อสัญญาณกลับตัว (เช่น dead cross, RSI overbought + แรงขาย) หรือพื้นฐานแย่ลง
- ทุกสัญญาณต้องแสดง **"เหตุผลประกอบ"** (อินดิเคเตอร์/อัตราส่วนที่ทำให้ได้คะแนนนั้น) — โปร่งใส ไม่ใช่กล่องดำ

### FR-SCREEN — Screener / คัดกรอง
- กรองตามเงื่อนไข: คะแนน, sector, สัญญาณ, ปันผล, มูลค่า, market cap, ปริมาณซื้อขาย
- บันทึกชุดเงื่อนไข (saved screens)

### FR-PORT — พอร์ตโฟลิโอ & Watchlist
- บันทึกการถือ (จำลอง): symbol, จำนวน, ราคาทุน, วันที่
- คำนวณกำไร/ขาดทุนตามราคา EOD ล่าสุด, สัดส่วนพอร์ต, การกระจายความเสี่ยง (รายเซกเตอร์)
- watchlist + ติดป้ายสัญญาณรายตัว

### FR-ALERT — แจ้งเตือน
- ทริกเกอร์: สัญญาณเปลี่ยน (เช่นเข้า BUY), ราคาทะลุระดับ, ถึง stop/target, ข่าวสำคัญ
- ช่องทาง: Telegram / LINE / email — สรุปรายวันหลังประมวลผล + alert เฉพาะกิจ

### FR-AUTH — ผู้ใช้ & ความปลอดภัย
- login จำกัดผู้ใช้ (ส่วนตัว/คนใกล้ชิด) — ไม่เปิด index ให้สาธารณะ
- เก็บรหัสผ่านแบบ hash, ใส่ disclaimer ทุกหน้า

---

## 8. UI / หน้าจอ (กราฟิกสวย)

1. **Dashboard** — ภาพรวมตลาดวันนี้, SET index, heatmap รายเซกเตอร์ (สีเขียว/แดง),
   การ์ด "Top ซื้อวันนี้" / "ควรขาย" / "ถือยาวน่าสน"
2. **หน้ารายตัว (Stock detail)** — กราฟแท่งเทียน + อินดิเคเตอร์ซ้อน, เรดาร์คะแนน 4 มิติ,
   ตารางงบ, ข่าว+sentiment, กล่องสัญญาณ + เหตุผล + entry/stop/target
3. **Screener** — ตารางกรองได้ เรียงตามคะแนน
4. **Portfolio** — สรุปพอร์ต, กราฟสัดส่วน (donut), P/L
5. **Settings** — ปรับน้ำหนักคะแนน, ตั้งค่าแจ้งเตือน

ธีม: dark mode, การ์ดโค้งมน, สีสื่อความหมาย (เขียว=บวก/แดง=ลบ), responsive มือถือ

---

## 9. Data Model (ย่อ)

- `securities`(symbol, name_th, name_en, market, sector, industry, is_active)
- `prices_eod`(symbol, date, open, high, low, close, volume, adj_close)
- `fundamentals`(symbol, period, pe, pbv, roe, de, div_yield, eps_growth, mktcap, updated_at)
- `news`(id, symbol, date, title, url, summary, sentiment)
- `scores`(symbol, date, tech, fund, momentum, sentiment, composite, signal, entry, stop, target, long_term_flag, reasons_json)
- `portfolio`(user_id, symbol, qty, cost, opened_at)
- `watchlist`(user_id, symbol)
- `users`(id, email, pass_hash)

---

## 10. Non-Functional Requirements
- **ต้นทุน:** ≈ 0 บาท/เดือน (ยกเว้นค่า token Claude เล็กน้อย — คุมด้วย batch + เลือกรุ่นเล็ก)
- **ประสิทธิภาพ:** pipeline รายวันเสร็จ < 30 นาที; หน้าเว็บโหลด < 2 วินาที (อ่าน JSON สำเร็จรูป)
- **ความเชื่อถือได้:** มี retry + log; ถ้า pipeline ล้มเหลวให้คงข้อมูลวันก่อนหน้า + แจ้งเตือน admin
- **ความปลอดภัย:** ไม่เก็บ secret ใน public_html; token เก็บใน GitHub Secrets
- **บำรุงรักษา:** อัปเดต master list หุ้นอัตโนมัติเดือนละครั้ง

---

## 11. แผนพัฒนาเป็นเฟส (Roadmap)

**Phase 0 — Setup (1–2 วัน)** — ✅ เสร็จแล้ว (2026-06-24)
- repo + GitHub Actions skeleton, master list หุ้น, ทดสอบดึงราคา 1 ตัว → หลายตัว
- ผลทดสอบจริง: ดึง EOD จาก Yahoo สำเร็จ 58/59 ตัว (~19 วิ), ราคาย้อนหลัง 2 ปี (488 แท่ง/ตัว)
- เขียนผลเป็น JSON ที่ `public_html/stock/data/` (summary + meta + prices รายตัว)

**Phase 1 — MVP เทคนิค (สัปดาห์ 1–2)** — ✅ เสร็จแล้ว (2026-06-24)
- pipeline EOD + อินดิเคเตอร์ (SMA/EMA/RSI/MACD/BB/ADX/ATR/Stoch/OBV) + scoring เทคนิคล้วน + เก็บ JSON
- เว็บ: dashboard + หน้ารายตัว + กราฟแท่งเทียน (OHLCV จริง) + screener — **ต่อข้อมูลจริงครบ ไม่ใช้ mock แล้ว**
- **ส่งมอบได้: "ซื้อวันนี้ / ขายเมื่อไหร่" แบบเทคนิค** พร้อมเหตุผลประกอบโปร่งใส

**Phase 2 — พื้นฐาน + AI ข่าว (สัปดาห์ 3–4)**
- เพิ่มงบการเงิน + ป้ายถือยาว + ข่าว/sentiment ผ่าน Claude + เรดาร์ 4 มิติ

**Phase 3 — พอร์ต + แจ้งเตือน + ปรับจูน (สัปดาห์ 5–6)**
- พอร์ต/watchlist, Telegram/LINE alert, backtest แบบ basic เพื่อตรวจคุณภาพสัญญาณ, ปรับน้ำหนัก

---

## 12. สิ่งที่ต้องเตรียม/ต้องรู้ (Checklist สำหรับเจ้าของ)

- [ ] บัญชี GitHub (สำหรับ repo + Actions ฟรี)
- [ ] ยืนยันว่ามี Python รันได้ (ใช้ GitHub Actions แทน ไม่ต้องลงบน host)
- [ ] Anthropic API key (มี token ในเครื่องแล้ว — ตรวจสิทธิ์/โควตา)
- [ ] Telegram bot token หรือ LINE Notify token (เลือกช่องทางแจ้งเตือน)
- [ ] ตัดสินใจ: deploy ผลขึ้น Hostinger ผ่าน FTP หรือ SSH (มี SSH ในเครื่องนี้)
- [ ] เข้าใจพื้นฐาน: อินดิเคเตอร์เทคนิค, อัตราส่วนการเงิน, การบริหารความเสี่ยง (stop-loss/position sizing)
- [ ] ยอมรับ disclaimer + เก็บระบบเป็นส่วนตัว (ไม่เผยแพร่คำแนะนำสาธารณะ)

---

## 13. ความเสี่ยง & ข้อควรระวัง
- ข้อมูล Yahoo ไม่เป็นทางการ → อาจมีคลาดเคลื่อน/ขาดช่วง; หุ้นเล็กพื้นฐานไม่ครบ
- สัญญาณเป็นกลไกสถิติ ไม่การันตีกำไร — ต้องมี backtest + วินัยบริหารเงิน
- rate limit ของแหล่งฟรี → ต้อง batch + cache + เว้นจังหวะ
- ค่า token Claude โตตามจำนวนข่าว → จำกัดจำนวนข่าว/วัน + ใช้รุ่นเล็ก

---

*เอกสารนี้เป็น draft v0.1 — ปรับน้ำหนัก/ขอบเขตได้ตามที่ต้องการก่อนเริ่ม Phase 0*
