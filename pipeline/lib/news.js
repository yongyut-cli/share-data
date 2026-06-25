// pipeline/lib/news.js — ดึงข่าวหุ้นไทย "รายตัว" จาก Google News RSS (ภาษาไทย, region TH)
//   เหตุผล: Yahoo search คืนข่าว US เป็นหลัก — หุ้นไทย .BK แทบไม่มีข่าว/ไม่ตรงตัว (ดู PROGRESS audit)
//   Google News RSS รองรับ query ภาษาไทย + แหล่งข่าวหุ้นไทยจริง (HoonVision, มิติหุ้น, ข่าวหุ้นธุรกิจ ฯลฯ)
//   - ฟรี ไม่ต้องใช้ API key · parse XML เองด้วย regex (ไม่ลง dependency ตามแนวโปรเจกต์)
//   - คืนรูปแบบเดียวกับ fetchNews ของ yahoo.js: {title, publisher, url, ts}
import { withRetry } from './util.js';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/rss+xml,application/xml,text/xml,*/*',
};

// decode entity พื้นฐานใน RSS (&amp; &lt; &gt; &quot; &#39; &#160; ฯลฯ)
function decodeEntities(s = '') {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#0*160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // ทำท้ายสุด กัน double-decode
}

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  let v = m[1].trim();
  const cd = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cd) v = cd[1].trim();
  return decodeEntities(v).trim();
};

/** แยกพาดหัว/แหล่งข่าว — Google News ใส่ title เป็น "พาดหัว - แหล่งข่าว" */
function splitTitleSource(rawTitle, sourceTag) {
  let title = rawTitle;
  let publisher = sourceTag || null;
  if (publisher) {
    // Google News ต่อท้าย " - <แหล่งข่าว>" (บางเจ้ามี tagline ยาวต่อท้ายชื่ออีก) → ตัดตั้งแต่ " - <แหล่งข่าว>"
    const at = title.indexOf(` - ${publisher}`);
    if (at > 0) title = title.slice(0, at).trim();
  } else {
    const i = rawTitle.lastIndexOf(' - ');
    if (i > 0) {
      title = rawTitle.slice(0, i).trim();
      publisher = rawTitle.slice(i + 3).trim() || null;
    }
  }
  return { title, publisher };
}

/**
 * ดึงข่าวหุ้นไทยรายตัวจาก Google News RSS
 * @param {string} symbol  ชื่อย่อหุ้น (เช่น PTT)
 * @param {{name_th?, name_en?, max?}} opts
 * @returns {Promise<Array<{title, publisher, url, ts}>>}
 */
export async function fetchNewsTH(symbol, { name_th = '', name_en = '', max = 6 } = {}) {
  // query: ใช้ชื่อไทยเป็นหลัก (ตรงแหล่งข่าวไทยสุด) + คำว่า "หุ้น" คั่น noise ทั่วไป
  const core = (name_th || name_en || symbol).trim();
  const q = `${core} หุ้น ${symbol}`;
  const url =
    'https://news.google.com/rss/search' +
    `?q=${encodeURIComponent(q)}&hl=th&gl=TH&ceid=TH%3Ath`;

  let xml = '';
  try {
    xml = await withRetry(
      async () => {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      },
      { tries: 3, baseDelay: 1000, label: `news ${symbol}` }
    );
  } catch {
    return [];
  }

  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const items = blocks.map((b) => {
    const sourceTag = pick(b, 'source');
    const { title, publisher } = splitTitleSource(pick(b, 'title'), sourceTag);
    const pub = pick(b, 'pubDate');
    let ts = null;
    if (pub) {
      const d = new Date(pub);
      if (!Number.isNaN(d.getTime())) ts = d.toISOString();
    }
    return { title, publisher, url: pick(b, 'link') || null, ts };
  });

  // กรองความเกี่ยวข้อง: เก็บที่พาดหัวมี symbol / ชื่อไทย / ชื่ออังกฤษ โผล่จริง
  const needles = [symbol, name_th, name_en]
    .filter((n) => n && n.length >= 2)
    .map((n) => n.toLowerCase());
  const relevant = items.filter((n) => {
    const hay = (n.title || '').toLowerCase();
    return needles.some((k) => hay.includes(k));
  });

  // ถ้ากรองแล้วเหลือน้อย (ชื่อไทยยาว/ตัดคำไม่ตรง) ใช้ผลที่กรองได้ก่อน แล้วเสริมด้วยอันดับต้น ๆ จาก query เจาะจง
  const out = relevant.length >= 2 ? relevant : (relevant.length ? relevant : items);
  // ลบพาดหัวซ้ำ
  const seen = new Set();
  const dedup = out.filter((n) => {
    const k = (n.title || '').slice(0, 80);
    if (!n.title || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return dedup.slice(0, max);
}
