// pipeline/lib/sentiment.js — ข่าว → สรุป + คะแนน sentiment ด้วย LLM (Phase 2, FR-AI)
//   - รองรับ 2 ผู้ให้บริการ: Google AI Studio (Gemini) หรือ Anthropic (Claude)
//     · ตั้ง GEMINI_API_KEY (หรือ GOOGLE_API_KEY) → ใช้ Gemini  (มี free tier)
//     · ไม่มี Gemini แต่มี ANTHROPIC_API_KEY      → ใช้ Claude
//   - คุมต้นทุน token: รวมข่าวหลายตัวเป็น batch เดียว, ใช้รุ่นเล็ก (flash/haiku)
//   - ทนข้อมูลขาด/ไม่มี key: คืน null อย่างซื่อสัตย์ (ไม่ปลอมคะแนน)
import { withRetry, sleep } from './util.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// รุ่นปรับได้ผ่าน env — ค่าเริ่มต้นเป็นรุ่นเล็กราคาประหยัดของแต่ละค่าย
const GEMINI_MODEL = process.env.SENTIMENT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ANTHROPIC_MODEL = process.env.SENTIMENT_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/** เลือกผู้ให้บริการตาม env ที่ตั้งไว้ — Gemini มาก่อน (ฟรี), แล้วค่อย Claude */
function provider() {
  const gkey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gkey) return { name: 'gemini', key: gkey };
  if (process.env.ANTHROPIC_API_KEY) return { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY };
  return null;
}

export function hasSentimentKey() {
  return !!provider();
}

/** ชื่อผู้ให้บริการ/รุ่นที่กำลังใช้ (ไว้ log) — คืน null ถ้าไม่มี key */
export function sentimentProvider() {
  const p = provider();
  if (!p) return null;
  return p.name === 'gemini' ? `Gemini (${GEMINI_MODEL})` : `Claude (${ANTHROPIC_MODEL})`;
}

/**
 * วิเคราะห์ sentiment ของหุ้นหลายตัวพร้อมกัน (batch เดียว ประหยัด token)
 * @param {Array<{symbol, name, news:Array<{title,publisher}>}>} batch
 * @returns {Promise<Record<string,{score, summary, risks}>>} key = symbol
 *          score: -1..+1 (>0 บวก, <0 ลบ) ; คืน {} ถ้าไม่มี key/ข่าว
 */
// แบ่งหุ้นเป็นกลุ่มต่อ 1 คำเรียก — กัน output ทะลุ maxOutputTokens (JSON ถูกตัด parse ไม่ได้)
//   ค่าเริ่มต้น 12 → 58 หุ้น = ~5 คำเรียก/รอบ ซึ่งอยู่ใต้เพดาน Gemini free tier (20 requests/วัน/รุ่น)
const SENTIMENT_CHUNK = Number(process.env.SENTIMENT_CHUNK) || 12;
// เว้นจังหวะระหว่าง chunk — กัน per-minute rate-limit
const SENTIMENT_GAP_MS = Number(process.env.SENTIMENT_GAP_MS) || 5000;

export async function analyzeSentimentBatch(batch) {
  const p = provider();
  if (!p) return {}; // ไม่มี key → ข้าม (sentiment = null ทุกตัว)
  const withNews = batch.filter((b) => b.news && b.news.length);
  if (!withNews.length) return {};

  // แบ่งเป็น chunk แล้ววิเคราะห์ทีละกลุ่ม — กลุ่มที่พังไม่ทำให้ทั้ง batch ล่ม
  const out = {};
  for (let i = 0; i < withNews.length; i += SENTIMENT_CHUNK) {
    const chunk = withNews.slice(i, i + SENTIMENT_CHUNK);
    try {
      Object.assign(out, await analyzeChunk(p, chunk));
    } catch (e) {
      if (e.quota) {
        // โควต้ารายวันหมด (429 RESOURCE_EXHAUSTED) — chunk ที่เหลือก็จะ 429 เหมือนกัน
        // หยุดทั้ง step ทันที ไม่ retry/ยิงต่อให้เปลือง request ฟรี
        console.warn(`  ⚠ sentiment: โควต้า ${p.name} หมด (429) — ข้าม ${withNews.length - Object.keys(out).length} ตัวที่เหลือ; ที่ได้แล้ว ${Object.keys(out).length} ตัว`);
        break;
      }
      console.warn(`  ⚠ sentiment: เรียก ${p.name} ไม่สำเร็จ (${chunk.map((c) => c.symbol).join(',')}): ${e.message}`);
    }
    // เว้นจังหวะก่อน chunk ถัดไป (ยกเว้น chunk สุดท้าย) — อยู่ใต้เพดาน per-minute
    if (i + SENTIMENT_CHUNK < withNews.length) await sleep(SENTIMENT_GAP_MS);
  }
  return out;
}

/** วิเคราะห์ sentiment 1 กลุ่ม (≤ SENTIMENT_CHUNK ตัว) — โยน error (มี .quota=true ถ้าโดน 429) */
async function analyzeChunk(p, chunk) {
  const items = chunk.map((b) => ({
    symbol: b.symbol,
    name: b.name,
    headlines: b.news.map((n) => n.title).slice(0, 6),
  }));

  const prompt =
    `คุณเป็นนักวิเคราะห์ข่าวหุ้นไทย วิเคราะห์ข่าวต่อไปนี้รายบริษัท ` +
    `ให้คะแนน sentiment เป็นตัวเลข -1.0 ถึง +1.0 (ลบ=ข่าวร้าย, 0=กลาง, บวก=ข่าวดี) ` +
    `พร้อมสรุปสั้นเป็นภาษาไทย 1-2 ประโยค และระบุประเด็นเสี่ยง/บวกหลัก\n\n` +
    `ข้อมูล:\n${JSON.stringify(items, null, 1)}\n\n` +
    `ตอบกลับเป็น JSON อย่างเดียว รูปแบบ: ` +
    `{"<symbol>":{"score":<number>,"summary":"<ไทย>","risks":"<ไทย|>"}, ...}`;

  // retry เฉพาะ error ชั่วคราว (เช่น 503/timeout) — แต่ 429 (โควต้า) จะโยนทันทีไม่ retry (ดู callGemini)
  const text = await withRetry(
    () => (p.name === 'gemini' ? callGemini(p.key, prompt) : callAnthropic(p.key, prompt)),
    { tries: 4, baseDelay: 4000, label: 'sentiment' }
  );

  const parsed = extractJSON(text);
  if (!parsed) {
    console.warn(`  ⚠ sentiment: parse JSON จาก ${p.name} ไม่ได้ (${chunk.map((c) => c.symbol).join(',')})`);
    return {};
  }
  // normalize score ให้อยู่ใน -1..1
  for (const k of Object.keys(parsed)) {
    const s = parsed[k];
    if (s && typeof s.score === 'number') s.score = Math.max(-1, Math.min(1, s.score));
  }
  return parsed;
}

/** เรียก Google AI Studio (Gemini) — คืน text ของคำตอบ */
async function callGemini(key, prompt) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // ปิด thinking (gemini-2.5-flash) — กัน thinking tokens กิน budget จน JSON ถูกตัด (finishReason MAX_TOKENS)
      // + เพิ่ม maxOutputTokens ให้พอกับ JSON หลายบริษัท
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.2,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) {
    const err = new Error(`Gemini API HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    if (res.status === 429) err.quota = true; // โควต้า/rate-limit → ไม่ต้อง retry (ดู withRetry)
    throw err;
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

/** เรียก Anthropic (Claude) — คืน text ของคำตอบ */
async function callAnthropic(key, prompt) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = new Error(`Claude API HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    if (res.status === 429) err.quota = true; // rate-limit → ไม่ retry
    throw err;
  }
  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
}

/** sentiment -1..1 → คะแนน 0..100 (ไว้รวมใน composite/เรดาร์) */
export function sentimentToScore(s) {
  if (s == null) return null;
  return Math.round((s + 1) * 50);
}

function extractJSON(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
