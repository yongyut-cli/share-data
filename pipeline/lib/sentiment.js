// pipeline/lib/sentiment.js — ข่าว → สรุป + คะแนน sentiment ด้วย Claude API (Phase 2, FR-AI)
//   - คุมต้นทุน token: รวมข่าวหลายตัวเป็น batch เดียว, ใช้รุ่นเล็ก (Haiku)
//   - ทนข้อมูลขาด/ไม่มี key: คืน null อย่างซื่อสัตย์ (ไม่ปลอมคะแนน)
//   เปิดใช้งานเมื่อมี ANTHROPIC_API_KEY (เก็บใน GitHub Secrets ตอนรันบน Actions)
import { withRetry } from './util.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.SENTIMENT_MODEL || 'claude-haiku-4-5-20251001';

export function hasSentimentKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * วิเคราะห์ sentiment ของหุ้นหลายตัวพร้อมกัน (batch เดียว ประหยัด token)
 * @param {Array<{symbol, name, news:Array<{title,publisher}>}>} batch
 * @returns {Promise<Record<string,{score, summary, risks}>>} key = symbol
 *          score: -1..+1 (>0 บวก, <0 ลบ) ; คืน {} ถ้าไม่มี key/ข่าว
 */
export async function analyzeSentimentBatch(batch) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {}; // ไม่มี key → ข้าม (sentiment = null ทุกตัว)
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

  const data = await withRetry(
    async () => {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Claude API HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return res.json();
    },
    { tries: 3, baseDelay: 1500, label: 'sentiment' }
  );

  const text = data?.content?.[0]?.text ?? '';
  const parsed = extractJSON(text);
  if (!parsed) {
    console.warn('  ⚠ sentiment: parse JSON จาก Claude ไม่ได้');
    return {};
  }
  // normalize score ให้อยู่ใน -1..1
  for (const k of Object.keys(parsed)) {
    const s = parsed[k];
    if (s && typeof s.score === 'number') s.score = Math.max(-1, Math.min(1, s.score));
  }
  return parsed;
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
