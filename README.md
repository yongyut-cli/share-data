# Thai Stock Analyzer — share-data

ระบบวิเคราะห์หุ้นไทย (SET + mai) แบบ **EOD** · ใช้ส่วนตัว/คนใกล้ชิด
ดูข้อกำหนดเต็มที่ [`REQUIREMENTS.md`](./REQUIREMENTS.md)

> ⚠️ ข้อมูลเพื่อการศึกษาส่วนตัว ไม่ใช่คำแนะนำการลงทุน · การลงทุนมีความเสี่ยง

## สถาปัตยกรรม (ฟรีล้วน)

```
GitHub Actions (cron 17:30 ICT)         ← compute ฟรี วันละครั้ง
   └─ node pipeline/run.js --all         ดึง EOD จาก Yahoo Finance
        └─ เขียน JSON → public_html/stock/data/
             ├─ summary.json             ราคาปิด+%เปลี่ยน ทุกตัว
             ├─ meta.json                ผลการรัน (สำเร็จ/ล้มเหลว)
             └─ prices/<SYM>.json        OHLCV ย้อนหลังรายตัว
        └─ commit ข้อมูลกลับเข้า repo (share-data)

Frontend (public_html/stock, static)     ← Hostinger
   └─ อ่าน JSON (จาก data/ บน host หรือ raw GitHub URL)
```

**ภาษา:** Pipeline เป็น **Node.js** (host เป็น Node-only; Node 20 มี `fetch` ในตัว → ไม่ต้องลง dependency)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run master` | ตรวจสอบ master list หุ้น |
| `npm run fetch:one` | ดึงราคา PTT ตัวเดียว (พิสูจน์การเชื่อมต่อ) |
| `npm run fetch:demo` | ดึง 10 ตัวแรก |
| `npm run fetch:all` | ดึงทุกตัวใน master |

## โครงสร้าง

```
pipeline/
  lib/yahoo.js        ดึง EOD OHLCV จาก Yahoo chart API (UA + retry + สลับ host)
  lib/util.js         retry/backoff, batch concurrency, เขียน JSON
  fetch-master.js     โหลด/ตรวจ master list
  run.js              orchestrator: ดึง 1 → หลายตัว → เขียน JSON
master/thai-stocks.json   master list หุ้นไทย (seed SET50/100)
.github/workflows/eod.yml  cron รายวัน + commit + (ทางเลือก) FTP deploy
public_html/stock/         frontend (static)
```

## สถานะ

- **Phase 0 (เสร็จ):** ดึงราคา EOD จริงได้ 1 → หลายตัว, master list, GitHub Actions skeleton
- Phase 1: indicators (SMA/EMA/RSI/MACD…) + scoring เทคนิค + เชื่อม frontend อ่านข้อมูลจริง
- Phase 2: พื้นฐาน + ข่าว/sentiment (Claude API)
- Phase 3: พอร์ต + แจ้งเตือน (Telegram/LINE) + backtest

## หมายเหตุข้อมูล

- Yahoo เป็นแหล่ง unofficial — ใส่ User-Agent เสมอ (ไม่งั้นโดน 429) และ pipeline ทนข้อมูลขาด (ข้าม + log + ตั้ง flag)
- หุ้นที่ delisted/ควบรวม (เช่น INTUCH) จะคืน 404 → ระบบข้ามและบันทึกใน `meta.json`
