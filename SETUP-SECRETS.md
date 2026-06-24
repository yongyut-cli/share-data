# คู่มือสร้าง Secret — ANTHROPIC_API_KEY + TELEGRAM_BOT_TOKEN/CHAT_ID

> โดเมน: yongyut.it-tni.online · สำหรับเปิดใช้ AI sentiment (Phase 2) และแจ้งเตือน Telegram (Phase 3)
>
> ทั้ง 3 ค่านี้ pipeline จะอ่านจาก **environment variable** ตอนรันบน GitHub Actions
> (ดู `.github/workflows/eod.yml` บรรทัด 40–42) ถ้าไม่ตั้งไว้ ระบบ **degrade เงียบ** — ไม่พัง แค่ปิดฟีเจอร์นั้น

| Secret | ใช้ทำอะไร | จำเป็นไหม |
|---|---|---|
| `GEMINI_API_KEY` | วิเคราะห์ข่าว → sentiment ไทย ด้วย **Gemini (Google AI Studio)** — **มี free tier** | ทางเลือก |
| `ANTHROPIC_API_KEY` | ทางเลือกแทน Gemini — วิเคราะห์ด้วย Claude (Haiku) | ทางเลือก |
| `TELEGRAM_BOT_TOKEN` | token ของบอทที่จะส่งข้อความ | ทางเลือก |
| `TELEGRAM_CHAT_ID` | ปลายทางที่จะรับข้อความ (ตัวคุณ / กลุ่ม) | ทางเลือก (คู่กับ token) |

> 🔀 **เลือกได้ค่ายเดียว** สำหรับ sentiment: ระบบจะใช้ **Gemini ก่อนถ้ามี `GEMINI_API_KEY`**,
> ถ้าไม่มีจึงค่อยใช้ Claude จาก `ANTHROPIC_API_KEY` — ไม่ต้องตั้งทั้งคู่
> (logic อยู่ใน `pipeline/lib/sentiment.js`)

---

## 0) GEMINI_API_KEY — Google AI Studio (แนะนำ มี free tier)

Gemini API จาก Google AI Studio มี **ชั้นใช้งานฟรี** (free tier) ที่ใช้ได้เลยโดยไม่ต้องผูกบัตร
เหมาะกับงานนี้มาก เพราะ pipeline ยิงแค่ **batch เดียวต่อวัน**

1. เปิด **https://aistudio.google.com** → ล็อกอินด้วยบัญชี Google
2. กดเมนู **Get API key** (หรือไปที่ https://aistudio.google.com/apikey )
3. กด **Create API key** → เลือกโปรเจกต์ (ถ้าไม่มี กดสร้างใหม่ได้เลย)
4. คัดลอกค่า key — หน้าตาเป็น `AIzaSy...`
5. ค่านี้คือ `GEMINI_API_KEY`

> 💡 ระบบใช้รุ่น `gemini-2.5-flash` เป็นค่าเริ่มต้น (รุ่นเล็ก เร็ว ราคาประหยัด/ฟรี)
> เปลี่ยนรุ่นได้ผ่าน env `GEMINI_MODEL` หรือ `SENTIMENT_MODEL`
> ⚠️ Free tier มีลิมิตจำนวน request/นาที และข้อมูลอาจถูกใช้ปรับปรุงโมเดล —
> ถ้าต้องการความเป็นส่วนตัว/โควต้าสูง ให้เปิด billing ในโปรเจกต์ Google Cloud ของ key นั้น

### ทดสอบ key ว่าใช้ได้ (curl)
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: AIzaSy..." \
  -H "content-type: application/json" \
  -d '{"contents":[{"parts":[{"text":"ตอบว่า OK"}]}]}'
```
ได้ JSON ที่มี `"text": "OK"` = ใช้ได้ ✅

---

## 1) ANTHROPIC_API_KEY — ทางเลือกแทน Gemini

API key ของ Anthropic (Claude) เป็นบริการ **เสียเงินตามการใช้งาน** (ต้องเติมเครดิตก่อน)

1. เปิด **https://console.anthropic.com** → สมัคร / ล็อกอิน
2. เติมเงินก่อน: เมนู **Billing** → **Add credits** (ขั้นต่ำมักเริ่ม ~$5 ก็พอสำหรับงานนี้ เพราะ pipeline ใช้ Haiku batch เดียวต่อวัน ราคาถูกมาก)
3. ไปเมนู **API Keys** (หรือ **Settings → API Keys**) → กด **Create Key**
4. ตั้งชื่อ เช่น `yongyut-stock-eod` → กด **Create**
5. **คัดลอกค่าทันที** — หน้าตาเป็น `sk-ant-api03-xxxxxxxx...` (ปิดหน้าต่างแล้วจะดูซ้ำไม่ได้ ต้องสร้างใหม่)

> 💡 ระบบนี้ใช้โมเดล `claude-haiku-4-5-20251001` (ตั้งใน `pipeline/lib/sentiment.js`)
> เปลี่ยนรุ่นได้ผ่าน env `SENTIMENT_MODEL` ถ้าต้องการ
> ค่าใช้จ่ายต่อวันน้อยมาก เพราะส่งข่าวทั้งหมดรวมเป็น batch เดียว วันละครั้ง

---

## 2) TELEGRAM_BOT_TOKEN — สร้างบอทด้วย @BotFather

1. เปิดแอป **Telegram** → ค้นหา **@BotFather** (มีติ๊กถูกฟ้าของจริง) → กดเริ่มแชท
2. พิมพ์ `/newbot`
3. ตั้ง **ชื่อบอท** (ตั้งอะไรก็ได้ เช่น `Yongyut Stock Alert`)
4. ตั้ง **username** ของบอท — ต้องลงท้ายด้วย `bot` เช่น `yongyut_stock_bot`
5. BotFather จะตอบกลับพร้อม **token** หน้าตาแบบนี้:

   ```
   123456789:AAH7xQk2c-XXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

   ค่านี้คือ `TELEGRAM_BOT_TOKEN` — **เก็บเป็นความลับ** ใครได้ไปคุมบอทได้เลย

> ถ้า token หลุด: ใน @BotFather พิมพ์ `/revoke` เพื่อยกเลิกและออก token ใหม่

---

## 3) TELEGRAM_CHAT_ID — หา "ปลายทาง" ที่จะรับข้อความ

บอทจะส่งข้อความไปที่ chat_id นี้ มี 2 กรณี:

### กรณี A — ส่งเข้าแชทส่วนตัวของคุณ (ง่ายสุด)
1. **กดเริ่มแชทกับบอทที่เพิ่งสร้างก่อน** แล้วพิมพ์อะไรก็ได้ เช่น `สวัสดี`
   (สำคัญมาก — บอทส่งหาคนที่ยังไม่เคยทักไม่ได้)
2. เปิด URL นี้ในเบราว์เซอร์ (แทน `<TOKEN>` ด้วย token ของคุณ):

   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. มองหา `"chat":{"id":123456789,...}` — เลข `id` นั้นคือ `TELEGRAM_CHAT_ID`
   (แชทส่วนตัวเป็นเลขบวก เช่น `123456789`)

### กรณี B — ส่งเข้ากลุ่ม
1. สร้างกลุ่ม → **เพิ่มบอทเข้ากลุ่ม** เป็นสมาชิก
2. พิมพ์อะไรสักข้อความในกลุ่ม
3. เปิด `https://api.telegram.org/bot<TOKEN>/getUpdates` แล้วหา `"chat":{"id":-100xxxxxxxxxx,...}`
   (กลุ่มเป็น **เลขติดลบ** มักขึ้นต้น `-100`) — ใช้ทั้งเลขรวมเครื่องหมายลบ

> 💡 ทางลัด: ทักบอท **@userinfobot** หรือ **@getidsbot** ใน Telegram มันจะบอก chat_id ให้ทันที

### ทดสอบว่าส่งได้จริง (ก่อนเอาไปตั้ง Secret)
```
https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=ทดสอบ
```
ถ้าได้ข้อความเข้าใน Telegram = ใช้ได้ ✅

---

## 4) เอาค่าไปใส่ตรงไหน

### บน GitHub (ให้ pipeline EOD รันอัตโนมัติ — แนะนำ)
1. เปิด repo บน GitHub → **Settings** → **Secrets and variables** → **Actions**
2. กด **New repository secret** ทีละตัว (ชื่อต้อง **ตรงเป๊ะ** ตามนี้):

   | Name | Secret (value) |
   |---|---|
   | `GEMINI_API_KEY` | `AIzaSy...` *(เลือกใช้ค่ายนี้ — แนะนำ)* |
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` *(หรือใช้ค่ายนี้แทน)* |
   | `TELEGRAM_BOT_TOKEN` | `123456789:AAH...` |
   | `TELEGRAM_CHAT_ID` | `123456789` (หรือ `-100...`) |

   > sentiment ตั้งแค่ **ค่ายเดียว** ก็พอ (Gemini **หรือ** Anthropic) — ตั้งทั้งคู่ก็ได้ ระบบจะเลือก Gemini ก่อน

3. ครั้งต่อไปที่ workflow `eod.yml` รัน (cron 17:30 ICT) จะเปิดฟีเจอร์ให้เอง ไม่ต้องแก้โค้ด

### ทดสอบบนเครื่อง local ก่อนได้ (ไม่บังคับ)
```bash
cd /home/u907300887/domains/yongyut.it-tni.online

# ทดสอบ AI sentiment ด้วย Gemini (แนะนำ)
GEMINI_API_KEY="AIzaSy..." node pipeline/run.js

# หรือด้วย Claude
ANTHROPIC_API_KEY="sk-ant-api03-..." node pipeline/run.js

# ทดสอบข้อความแจ้งเตือน Telegram แบบ "ไม่ส่งจริง" (พิมพ์ออกจอ)
node pipeline/run.js --dry-alerts

# ทดสอบส่งจริง
TELEGRAM_BOT_TOKEN="..." TELEGRAM_CHAT_ID="..." node pipeline/run.js
```

---

## ⚠️ ความปลอดภัย — ห้ามพลาด

- **อย่า** commit ค่าพวกนี้ลงโค้ดหรือไฟล์ใน repo เด็ดขาด — ใส่ใน GitHub Secrets เท่านั้น
- ค่าทั้งหมดเป็นความลับระดับ "ใครได้ไปใช้แทนคุณได้" — Anthropic key = ใช้เงินคุณ, Telegram token = คุมบอทคุณ
- ถ้าเผลอเผยแพร่: Anthropic → ลบ key เดิมที่ console แล้วสร้างใหม่ · Telegram → `/revoke` ที่ @BotFather
- pipeline ออกแบบให้ **ไม่มี key ก็ไม่พัง** (sentiment คืน `null`, alerts ข้ามเงียบ) จึงเปิดทีหลังเมื่อพร้อมได้
