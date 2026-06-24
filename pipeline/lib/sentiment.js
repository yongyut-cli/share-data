// pipeline/lib/sentiment.js — ข่าว → สรุป + คะแนน sentiment ด้วย LLM (Phase 2, FR-AI)
//   - รองรับ 2 ผู้ให้บริการ: Google AI Studio (Gemini) หรือ Anthropic (Claude)
//     · ตั้ง GEMINI_API_KEY (หรือ GOOGLE_API_KEY) → ใช้ Gemini  (มี free tier)
//     · ไม่มี Gemini แต่มี ANTHROPIC_API_KEY      → ใช้ Claude
//   - คุมต้นทุน token: รวมข่าวหลายตัวเป็น batch เดียว, ใช้รุ่นเล็ก (flash/haiku)
//   - ทนข้อมูลขาด/ไม่มี key: คืน null อย่างซื่อสัตย์ (ไม่ปลอมคะแนน)
import { withRetry } from './util.js';

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
export async function analyzeSentimentBatch(batch) {
  const p = provider();
  if (!p) return {}; // ไม่มี key → ข้าม (sentiment = null ทุกตัว)
  const withNews = batch.filter((b) => b.news && b.news.length);
  if (!withNews.length) return {};

  const items = withNews.map((b) => ({
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

  const text = await withRetry(
    () => (p.name === 'gemini' ? callGemini(p.key, prompt) : callAnthropic(p.key, prompt)),
    { tries: 3, baseDelay: 1500, label: 'sentiment' }
  );

  const parsed = extractJSON(text);
  if (!parsed) {
    console.warn(`  ⚠ sentiment: parse JSON จาก ${p.name} ไม่ได้`);
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
      generationConfig: { maxOutputTokens: 2048, temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
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
  if (!res.ok) throw new Error(`Claude API HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
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
