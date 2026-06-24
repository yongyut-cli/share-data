// pipeline/lib/yahoo.js — ดึงราคา EOD OHLCV จาก Yahoo Finance chart API
// ใช้ fetch ในตัวของ Node 18+ (ไม่ต้องลง dependency)
import { withRetry } from './util.js';

const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

// Yahoo จะตอบ 429 ถ้าไม่มี User-Agent — ต้องแนบทุกครั้ง
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

/** หุ้นไทยใน Yahoo ใช้ ticker แบบ "XXXX.BK" (ดัชนีขึ้นต้น ^ ไม่ต้องเติม .BK) */
export function toYahooSymbol(symbol) {
  if (symbol.startsWith('^') || symbol.includes('.')) return symbol;
  return `${symbol}.BK`;
}

/**
 * ดึง EOD OHLCV ย้อนหลังของหุ้น 1 ตัว
 * @returns {{symbol, yahoo, currency, exchange, bars: Array}}
 */
export async function fetchEOD(symbol, { range = '2y', interval = '1d' } = {}) {
  const ysym = toYahooSymbol(symbol);
  const path =
    `/v8/finance/chart/${encodeURIComponent(ysym)}` +
    `?range=${range}&interval=${interval}&includeAdjustedClose=true&events=div,splits`;

  return withRetry(
    async () => {
      // สลับ host เผื่อ host ใดโดน throttle
      let lastStatus;
      for (const host of HOSTS) {
        const res = await fetch(host + path, { headers: HEADERS });
        lastStatus = res.status;
        if (res.status === 429) continue; // ลอง host ถัดไปก่อนค่อย retry/backoff
        if (!res.ok) throw new Error(`HTTP ${res.status} (${ysym})`);
        const json = await res.json();
        return normalize(symbol, ysym, json);
      }
      throw new Error(`HTTP ${lastStatus} (rate-limited ทุก host) (${ysym})`);
    },
    { tries: 4, baseDelay: 1000, label: ysym }
  );
}

function normalize(symbol, ysym, json) {
  const err = json?.chart?.error;
  if (err) throw new Error(`${err.code}: ${err.description} (${ysym})`);
  const r = json?.chart?.result?.[0];
  if (!r || !r.timestamp) throw new Error(`ไม่มีข้อมูลราคา (${ysym})`);

  const q = r.indicators.quote[0];
  const adj = r.indicators.adjclose?.[0]?.adjclose;
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const close = q.close[i];
    if (close == null) continue; // ข้ามวันหยุด/แท่งว่าง (graceful degradation)
    bars.push({
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
      open: round(q.open[i]),
      high: round(q.high[i]),
      low: round(q.low[i]),
      close: round(close),
      adjclose: round(adj?.[i] ?? close),
      volume: q.volume[i] ?? 0,
    });
  }
  if (!bars.length) throw new Error(`ราคาว่างทั้งหมด (${ysym})`);

  return {
    symbol,
    yahoo: ysym,
    currency: r.meta?.currency ?? null,
    exchange: r.meta?.fullExchangeName ?? r.meta?.exchangeName ?? null,
    bars,
  };
}

function round(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

// ============================================================
//  Phase 2 — งบการเงิน (fundamentals) + ข่าว
//  Yahoo quoteSummary ต้องมี "crumb" + cookie (ดึงครั้งเดียว cache ไว้)
// ============================================================

let _crumb = null; // { crumb, cookie }

/** ขอ cookie + crumb จาก Yahoo (cache ทั้ง process — ใช้ซ้ำทุก symbol) */
async function getCrumb() {
  if (_crumb) return _crumb;
  // 1) ขอ cookie (A1/A3) — fc.yahoo.com มักตอบ 404 แต่ยังแนบ Set-Cookie มาให้
  const r1 = await fetch('https://fc.yahoo.com', { headers: HEADERS }).catch(() => null);
  const setc = r1?.headers?.getSetCookie?.() ?? [];
  const cookie = setc.map((c) => c.split(';')[0]).join('; ');
  // 2) เอา cookie ไปแลก crumb
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...HEADERS, cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes('<')) throw new Error(`ขอ crumb ไม่สำเร็จ (HTTP ${r2.status})`);
  _crumb = { crumb, cookie };
  return _crumb;
}

const num = (n) => (n && typeof n.raw === 'number' ? n.raw : null);

/**
 * ดึงงบการเงินย่อ/อัตราส่วนของหุ้น 1 ตัว
 * ทนข้อมูลขาด: ฟิลด์ใดดึงไม่ได้ → null (ไม่ throw) ; โยน error เฉพาะกรณีเรียก API ไม่ได้เลย
 * @returns {{pe, pbv, roe, roa, de, divYield, epsGrowth, netMargin, grossMargin, payout, mktcap, beta, currency}}
 */
export async function fetchFundamentals(symbol) {
  const ysym = toYahooSymbol(symbol);
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,price';
  return withRetry(
    async () => {
      const { crumb, cookie } = await getCrumb();
      const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym)}` +
        `?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
      const res = await fetch(url, { headers: { ...HEADERS, cookie } });
      if (res.status === 401 || res.status === 403) {
        _crumb = null; // crumb หมดอายุ → ขอใหม่รอบหน้า
        throw new Error(`auth หมดอายุ (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} fundamentals (${ysym})`);
      const j = await res.json();
      const r = j?.quoteSummary?.result?.[0];
      if (!r) throw new Error(`ไม่มีงบการเงิน (${ysym})`);
      const sd = r.summaryDetail ?? {};
      const ks = r.defaultKeyStatistics ?? {};
      const fd = r.financialData ?? {};
      const pr = r.price ?? {};
      return {
        pe: num(sd.trailingPE) ?? num(ks.trailingPE),
        pbv: num(ks.priceToBook) ?? num(sd.priceToBook),
        roe: num(fd.returnOnEquity),
        roa: num(fd.returnOnAssets),
        de: num(fd.debtToEquity) != null ? num(fd.debtToEquity) / 100 : null, // Yahoo รายงานเป็น %
        divYield: num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield),
        epsGrowth: num(fd.earningsGrowth) ?? num(ks.earningsQuarterlyGrowth),
        revGrowth: num(fd.revenueGrowth),
        netMargin: num(fd.profitMargins),
        grossMargin: num(fd.grossMargins),
        payout: num(sd.payoutRatio),
        mktcap: num(sd.marketCap) ?? num(pr.marketCap),
        beta: num(sd.beta) ?? num(ks.beta),
        currency: pr.currency ?? null,
      };
    },
    { tries: 3, baseDelay: 1200, label: `fund ${ysym}` }
  );
}

/**
 * ดึงพาดหัวข่าวที่ "เกี่ยวข้องจริง" ราย ticker จาก Yahoo search
 * คัดกรอง noise ออก: เก็บเฉพาะที่ชื่อ/symbol โผล่ในพาดหัวหรือสรุป
 * @returns {Array<{title, publisher, url, ts}>}
 */
export async function fetchNews(symbol, { names = [], max = 6 } = {}) {
  const ysym = toYahooSymbol(symbol);
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(ysym)}&newsCount=${max + 6}&quotesCount=0&lang=en-US&region=US`;
  let items = [];
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    const j = await res.json();
    items = j?.news ?? [];
  } catch {
    return [];
  }
  const needles = [symbol.toLowerCase(), ...names.filter(Boolean).map((n) => n.toLowerCase())];
  const relevant = items.filter((n) => {
    const hay = `${n.title ?? ''} ${n.publisher ?? ''}`.toLowerCase();
    // เกี่ยวข้องเมื่อชื่อบริษัท/symbol โผล่ในพาดหัว (ตัด noise ของ Yahoo ออก)
    return needles.some((k) => k.length >= 3 && hay.includes(k));
  });
  return relevant.slice(0, max).map((n) => ({
    title: n.title,
    publisher: n.publisher ?? null,
    url: n.link ?? null,
    ts: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
  }));
}
