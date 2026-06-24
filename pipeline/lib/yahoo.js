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
