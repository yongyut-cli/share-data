/* ============================================================
   Thai Stock Analyzer — Prototype mock data & helpers
   หมายเหตุ: ข้อมูลทั้งหมดเป็นข้อมูลจำลอง (mock) เพื่อ demo UI เท่านั้น
   ============================================================ */

// ---- seeded RNG (เพื่อให้กราฟเหมือนเดิมทุกครั้งที่โหลด) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTORS = ['พลังงาน', 'ธนาคาร', 'ค้าปลีก', 'สื่อสาร', 'อาหาร', 'การแพทย์', 'อสังหา', 'ขนส่ง'];

// ---- master mock data: หุ้นไทยตัวอย่าง ----
const STOCKS = [
  { sym: 'PTT',    name: 'ปตท.',                 sector: 'พลังงาน', price: 35.25, chg: 1.44,  tech: 78, fund: 82, mom: 71, sent: 0.42, signal: 'BUY',        entry: 35.0, stop: 33.2, target: 39.0, longTerm: true,  pe: 9.1,  pbv: 0.9, roe: 11.2, div: 5.8,  mktcap: 1006 },
  { sym: 'AOT',    name: 'ท่าอากาศยานไทย',        sector: 'ขนส่ง',   price: 62.50, chg: 2.46,  tech: 84, fund: 74, mom: 80, sent: 0.55, signal: 'BUY',        entry: 62.0, stop: 58.5, target: 70.0, longTerm: true,  pe: 28.4, pbv: 5.1, roe: 18.6, div: 1.1,  mktcap: 893 },
  { sym: 'CPALL',  name: 'ซีพี ออลล์',            sector: 'ค้าปลีก', price: 58.75, chg: 0.43,  tech: 62, fund: 79, mom: 58, sent: 0.18, signal: 'ACCUMULATE', entry: 58.0, stop: 55.0, target: 65.0, longTerm: true,  pe: 21.0, pbv: 4.2, roe: 20.1, div: 2.0,  mktcap: 527 },
  { sym: 'KBANK',  name: 'ธนาคารกสิกรไทย',        sector: 'ธนาคาร',  price: 132.0, chg: -0.75, tech: 55, fund: 88, mom: 49, sent: 0.05, signal: 'HOLD',       entry: 0,    stop: 0,    target: 0,    longTerm: true,  pe: 7.8,  pbv: 0.7, roe: 9.8,  div: 4.2,  mktcap: 312 },
  { sym: 'ADVANC', name: 'แอดวานซ์ อินโฟร์',      sector: 'สื่อสาร', price: 218.0, chg: 1.16,  tech: 71, fund: 80, mom: 68, sent: 0.31, signal: 'BUY',        entry: 216,  stop: 205,  target: 240,  longTerm: true,  pe: 22.3, pbv: 8.4, roe: 35.2, div: 3.6,  mktcap: 648 },
  { sym: 'SCB',    name: 'เอสซีบี เอกซ์',          sector: 'ธนาคาร',  price: 108.5, chg: -1.36, tech: 41, fund: 76, mom: 38, sent: -0.22, signal: 'REDUCE',    entry: 0,    stop: 0,    target: 0,    longTerm: false, pe: 8.2,  pbv: 0.8, roe: 9.1,  div: 7.1,  mktcap: 365 },
  { sym: 'CPN',    name: 'เซ็นทรัลพัฒนา',          sector: 'อสังหา',  price: 56.25, chg: 0.90,  tech: 66, fund: 78, mom: 62, sent: 0.20, signal: 'ACCUMULATE', entry: 56.0, stop: 52.5, target: 63.0, longTerm: true,  pe: 16.5, pbv: 2.4, roe: 15.0, div: 2.4,  mktcap: 252 },
  { sym: 'GULF',   name: 'กัลฟ์ เอ็นเนอร์จี',      sector: 'พลังงาน', price: 44.75, chg: 3.47,  tech: 88, fund: 64, mom: 85, sent: 0.61, signal: 'BUY',        entry: 44.0, stop: 41.0, target: 51.0, longTerm: false, pe: 32.0, pbv: 3.8, roe: 12.5, div: 1.2,  mktcap: 525 },
  { sym: 'BDMS',   name: 'กรุงเทพดุสิตเวชการ',     sector: 'การแพทย์',price: 28.50, chg: 0.71,  tech: 64, fund: 83, mom: 60, sent: 0.28, signal: 'ACCUMULATE', entry: 28.0, stop: 26.5, target: 32.0, longTerm: true,  pe: 27.1, pbv: 4.6, roe: 17.3, div: 1.8,  mktcap: 453 },
  { sym: 'TRUE',   name: 'ทรู คอร์ปอเรชั่น',       sector: 'สื่อสาร', price: 11.30, chg: -2.59, tech: 34, fund: 45, mom: 31, sent: -0.41, signal: 'AVOID',     entry: 0,    stop: 0,    target: 0,    longTerm: false, pe: 0,    pbv: 1.9, roe: -4.2, div: 0,    mktcap: 391 },
  { sym: 'MINT',   name: 'ไมเนอร์ อินเตอร์เนชั่นแนล',sector: 'อาหาร',  price: 27.75, chg: 1.83,  tech: 73, fund: 67, mom: 70, sent: 0.34, signal: 'BUY',        entry: 27.5, stop: 25.8, target: 31.0, longTerm: false, pe: 18.9, pbv: 1.7, roe: 9.4,  div: 1.0,  mktcap: 161 },
  { sym: 'OR',     name: 'ปตท. น้ำมันและการค้าปลีก',sector: 'พลังงาน', price: 16.40, chg: -0.61, tech: 48, fund: 70, mom: 44, sent: -0.08, signal: 'HOLD',      entry: 0,    stop: 0,    target: 0,    longTerm: true,  pe: 19.4, pbv: 1.6, roe: 8.3,  div: 3.0,  mktcap: 196 },
  { sym: 'BBL',    name: 'ธนาคารกรุงเทพ',          sector: 'ธนาคาร',  price: 152.5, chg: 0.66,  tech: 58, fund: 85, mom: 53, sent: 0.12, signal: 'ACCUMULATE', entry: 151,  stop: 143,  target: 168,  longTerm: true,  pe: 7.1,  pbv: 0.6, roe: 8.9,  div: 4.6,  mktcap: 291 },
  { sym: 'DELTA',  name: 'เดลต้า อีเลคโทรนิคส์',    sector: 'สื่อสาร', price: 92.25, chg: 4.82,  tech: 90, fund: 58, mom: 89, sent: 0.48, signal: 'BUY',        entry: 91.0, stop: 84.0, target: 105.0,longTerm: false, pe: 64.0, pbv: 14.2,roe: 23.1, div: 0.4,  mktcap: 1150 },
  { sym: 'HMPRO',  name: 'โฮม โปรดักส์ เซ็นเตอร์',  sector: 'ค้าปลีก', price: 9.85,  chg: 0.51,  tech: 60, fund: 81, mom: 55, sent: 0.15, signal: 'ACCUMULATE', entry: 9.7,  stop: 9.1,  target: 11.0, longTerm: true,  pe: 18.2, pbv: 5.0, roe: 27.4, div: 3.4,  mktcap: 130 },
  { sym: 'IVL',    name: 'อินโดรามา เวนเจอร์ส',     sector: 'พลังงาน', price: 22.10, chg: -1.78, tech: 39, fund: 60, mom: 36, sent: -0.30, signal: 'REDUCE',    entry: 0,    stop: 0,    target: 0,    longTerm: false, pe: 0,    pbv: 0.8, roe: -2.1, div: 1.4,  mktcap: 124 },
];

// composite = ถ่วงน้ำหนัก
function composite(s) {
  const sentScore = (s.sent + 1) * 50; // -1..1 -> 0..100
  return Math.round(s.tech * 0.35 + s.fund * 0.30 + s.mom * 0.20 + sentScore * 0.15);
}
STOCKS.forEach(s => s.comp = composite(s));

// ---- generate OHLCV history (seeded random walk) ----
function genCandles(sym, lastClose, days = 180) {
  let seed = 0; for (const c of sym) seed += c.charCodeAt(0);
  const rnd = mulberry32(seed * 7919);
  const out = [];
  // เริ่มจากราคาในอดีต แล้วเดินมาจบที่ราคาปัจจุบัน
  let price = lastClose * (0.78 + rnd() * 0.1);
  const today = new Date('2026-06-24T00:00:00');
  const arr = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // ข้ามเสาร์-อาทิตย์
    arr.push(d);
  }
  const drift = (lastClose - price) / arr.length;
  arr.forEach((d, idx) => {
    const vol = lastClose * 0.018;
    const open = price;
    const move = drift + (rnd() - 0.5) * vol * 2;
    let close = open + move;
    if (idx === arr.length - 1) close = lastClose; // จบที่ราคาจริง
    const high = Math.max(open, close) + rnd() * vol;
    const low = Math.min(open, close) - rnd() * vol;
    const volume = Math.round((0.6 + rnd()) * 1e6 * (lastClose < 20 ? 5 : 1));
    out.push({
      time: d.toISOString().slice(0, 10),
      open: +open.toFixed(2), high: +high.toFixed(2),
      low: +Math.max(0.1, low).toFixed(2), close: +close.toFixed(2),
      value: volume,
    });
    price = close;
  });
  return out;
}

// ---- EMA helper ----
function ema(data, period, key = 'close') {
  const k = 2 / (period + 1);
  let prev;
  return data.map((d, i) => {
    const v = d[key];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    return { time: d.time, value: +prev.toFixed(2) };
  });
}

// ---- signal styling ----
const SIGNAL_META = {
  BUY:        { label: 'ซื้อ',       cls: 'sig-buy',    dot: '#10d18e' },
  ACCUMULATE: { label: 'ทยอยสะสม',   cls: 'sig-acc',    dot: '#4ade80' },
  HOLD:       { label: 'ถือ',        cls: 'sig-hold',   dot: '#a3a3a3' },
  REDUCE:     { label: 'ลดพอร์ต',    cls: 'sig-reduce', dot: '#fbbf24' },
  SELL:       { label: 'ขาย',        cls: 'sig-sell',   dot: '#f87171' },
  AVOID:      { label: 'เลี่ยง',      cls: 'sig-avoid',  dot: '#ef4444' },
};

function scoreColor(v) {
  if (v >= 75) return '#10d18e';
  if (v >= 60) return '#4ade80';
  if (v >= 45) return '#fbbf24';
  return '#f87171';
}

function fmtCap(b) { return b >= 1000 ? (b / 1000).toFixed(2) + ' ล้านล้าน' : b.toFixed(0) + ' พันล้าน'; }

function getStock(sym) { return STOCKS.find(s => s.sym === sym) || STOCKS[0]; }
function qs(name) { return new URLSearchParams(location.search).get(name); }

// ---- reasons generator (เหตุผลประกอบสัญญาณ — โปร่งใส) ----
function reasonsFor(s) {
  const r = [];
  if (s.tech >= 70) r.push({ ic: '📈', t: 'เทคนิคแข็งแรง: ราคายืนเหนือ EMA50/200 และ RSI ขาขึ้น' });
  else if (s.tech < 45) r.push({ ic: '📉', t: 'เทคนิคอ่อนแอ: ราคาหลุดเส้นค่าเฉลี่ย แรงขายเด่น' });
  if (s.mom >= 75) r.push({ ic: '🚀', t: 'โมเมนตัมสูง: ปริมาณซื้อขายและ MACD เป็นบวกต่อเนื่อง' });
  if (s.fund >= 80) r.push({ ic: '🏛️', t: `พื้นฐานดี: ROE ${s.roe}% , P/E ${s.pe || '—'} อยู่ในเกณฑ์น่าสนใจ` });
  if (s.div >= 4) r.push({ ic: '💰', t: `ปันผลเด่น ${s.div}% เหมาะสำหรับถือยาว` });
  if (s.sent >= 0.3) r.push({ ic: '📰', t: 'ข่าวเชิงบวก: sentiment ข่าวล่าสุดเป็นบวก' });
  else if (s.sent <= -0.3) r.push({ ic: '⚠️', t: 'ข่าวเชิงลบ: ระวังประเด็นความเสี่ยงในข่าวล่าสุด' });
  if (s.longTerm) r.push({ ic: '⏳', t: 'ผ่านเกณฑ์ "เหมาะถือยาว" (คุณภาพ + ปันผล + มูลค่าไม่แพงเกิน)' });
  return r;
}

// ---- mock news ----
function newsFor(s) {
  const pos = s.sent >= 0;
  return [
    { date: '2026-06-24', t: `${s.name} รายงานผลประกอบการไตรมาสล่าสุด${pos ? 'เติบโตกว่าคาด' : 'ต่ำกว่าที่ตลาดคาด'}`, sent: s.sent, src: 'ข่าวจำลอง' },
    { date: '2026-06-23', t: `นักวิเคราะห์ปรับ${pos ? 'เพิ่ม' : 'ลด'}ราคาเป้าหมาย ${s.sym} หลังแนวโน้มอุตสาหกรรม${s.sector}`, sent: s.sent * 0.7, src: 'ข่าวจำลอง' },
    { date: '2026-06-20', t: `${s.sector}ภาพรวมทรงตัว ติดตามทิศทางอัตราดอกเบี้ยและเงินทุนต่างชาติ`, sent: s.sent * 0.3, src: 'ข่าวจำลอง' },
  ];
}
