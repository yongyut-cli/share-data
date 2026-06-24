// pipeline/lib/scoring.js — เครื่องให้คะแนนเทคนิค + สัญญาณ (Phase 1)
//   โปร่งใส: ทุกคะแนนมี "เหตุผลประกอบ" ว่าอินดิเคเตอร์ตัวไหนทำให้ได้คะแนนนั้น (FR-SIGNAL)
//   Phase 1 = เทคนิคล้วน (พื้นฐาน/ข่าว มาใน Phase 2)
import { sma, ema, rsi, macd, bollinger, atr, adx, stochastic, obv, last } from './indicators.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/**
 * คำนวณอินดิเคเตอร์ + คะแนน + สัญญาณ จาก bars (เรียงเก่า→ใหม่)
 * คืน null ถ้าข้อมูลสั้นเกินไป
 */
export function analyze(bars) {
  if (!bars || bars.length < 60) return null; // ข้อมูลสั้นเกินกว่าจะเชื่อถือสัญญาณ
  const closes = bars.map((b) => b.close);
  const i = bars.length - 1;
  const price = closes[i];

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(bars, 14);
  const dmi = adx(bars, 14);
  const st = stochastic(bars, 14, 3);
  const ob = obv(bars);

  const v = {
    price,
    ema20: last(ema20),
    ema50: last(ema50),
    ema200: last(ema200),
    rsi: last(r),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHist: last(m.hist),
    bbUpper: last(bb.upper),
    bbLower: last(bb.lower),
    bbMid: last(bb.mid),
    atr: last(a),
    adx: last(dmi.adx),
    plusDI: last(dmi.plusDI),
    minusDI: last(dmi.minusDI),
    stochK: last(st.k),
    stochD: last(st.d),
  };

  // momentum: %เปลี่ยน 20 วัน + ทิศ OBV
  const ago = closes[Math.max(0, i - 20)];
  const roc20 = ago ? ((price - ago) / ago) * 100 : 0;
  const obvSlopeUp = ob[i] > ob[Math.max(0, i - 10)];

  // cross ล่าสุด (มองย้อน ~5 แท่ง)
  const goldenCross = crossedUp(ema50, ema200, 5);
  const deadCross = crossedDown(ema50, ema200, 5);
  const macdBullCross = crossedUp(m.macd, m.signal, 3);
  const macdBearCross = crossedDown(m.macd, m.signal, 3);
  const rsiExitOversold = r[i - 1] != null && r[i - 1] < 35 && v.rsi >= 35;

  // ---------- คะแนนเทคนิค ----------
  let tech = 50;
  const reasons = [];
  const add = (pts, ic, t) => {
    tech += pts;
    reasons.push({ ic, t, pts });
  };

  // 1) แนวโน้มจากเส้นค่าเฉลี่ย
  if (v.ema50 != null && v.ema200 != null) {
    if (price > v.ema200) add(8, '📈', 'ราคายืนเหนือ EMA200 — แนวโน้มใหญ่เป็นขาขึ้น');
    else add(-8, '📉', 'ราคาต่ำกว่า EMA200 — แนวโน้มใหญ่เป็นขาลง');
    if (price > v.ema50) add(6, '📈', 'ราคาเหนือ EMA50 — แนวโน้มกลางเป็นบวก');
    else add(-6, '📉', 'ราคาต่ำกว่า EMA50 — แนวโน้มกลางเป็นลบ');
  }
  if (goldenCross) add(10, '✨', 'Golden cross: EMA50 ตัด EMA200 ขึ้น');
  if (deadCross) add(-10, '💀', 'Dead cross: EMA50 ตัด EMA200 ลง');

  // 2) RSI
  if (v.rsi != null) {
    if (v.rsi > 70) add(-6, '🔥', `RSI ${r2(v.rsi)} — overbought เสี่ยงพักตัว`);
    else if (v.rsi >= 50) add(6, '💪', `RSI ${r2(v.rsi)} — โซนขาขึ้นที่ยังไม่ร้อนเกิน`);
    else if (v.rsi >= 40) add(0, '〰️', `RSI ${r2(v.rsi)} — เป็นกลาง`);
    else add(-4, '🥶', `RSI ${r2(v.rsi)} — โซน oversold/อ่อนแรง`);
    if (rsiExitOversold) add(6, '↗️', 'RSI ฟื้นออกจากโซน oversold');
  }

  // 3) MACD
  if (v.macdHist != null) {
    if (v.macdHist > 0) add(6, '🚀', 'MACD histogram เป็นบวก — โมเมนตัมหนุน');
    else add(-6, '🪫', 'MACD histogram เป็นลบ — โมเมนตัมอ่อน');
  }
  if (macdBullCross) add(5, '↗️', 'MACD ตัดเส้น signal ขึ้น (สัญญาณซื้อ)');
  if (macdBearCross) add(-5, '↘️', 'MACD ตัดเส้น signal ลง (สัญญาณขาย)');

  // 4) ADX / DI — ความแข็งแรงของแนวโน้ม
  if (v.adx != null) {
    if (v.adx > 25) {
      if (v.plusDI > v.minusDI) add(8, '🧭', `ADX ${r2(v.adx)} (>25) แนวโน้มแข็งแรง, +DI เหนือ -DI`);
      else add(-8, '🧭', `ADX ${r2(v.adx)} (>25) แนวโน้มลงแข็งแรง, -DI เหนือ +DI`);
    } else {
      reasons.push({ ic: '😴', t: `ADX ${r2(v.adx)} (<25) แนวโน้มยังไม่ชัด`, pts: 0 });
    }
  }

  // 5) Bollinger
  if (v.bbLower != null) {
    if (price <= v.bbLower) add(4, '🪃', 'ราคาแตะขอบล่าง Bollinger — มีโอกาสเด้ง');
    else if (price >= v.bbUpper) add(-3, '⚠️', 'ราคาแตะขอบบน Bollinger — ยืดเกินตัว');
  }

  // 6) โมเมนตัม/ปริมาณ
  if (roc20 > 3) add(5, '📊', `ราคา +${r2(roc20)}% ใน 20 วัน — โมเมนตัมบวก`);
  else if (roc20 < -3) add(-5, '📊', `ราคา ${r2(roc20)}% ใน 20 วัน — โมเมนตัมลบ`);
  if (obvSlopeUp) add(4, '🔊', 'OBV เพิ่มขึ้น — แรงซื้อสะสม');

  tech = clamp(Math.round(tech));

  // momentum score (สำหรับเรดาร์) แยกออกมา
  let mom = 50 + roc20 * 2 + (obvSlopeUp ? 8 : -8) + (v.macdHist > 0 ? 6 : -6);
  mom = clamp(Math.round(mom));

  // ---------- จำแนกสัญญาณ ----------
  const uptrend = v.ema200 != null && price > v.ema200;
  let signal;
  if (tech >= 78 && uptrend) signal = 'BUY';
  else if (tech >= 66) signal = 'ACCUMULATE';
  else if (tech >= 50) signal = 'HOLD';
  else if (tech >= 38) signal = 'REDUCE';
  else if (uptrend === false && tech < 30) signal = 'AVOID';
  else signal = 'SELL';

  // ---------- แผนเทรด (เฉพาะฝั่งซื้อ) ----------
  let entry = 0;
  let stop = 0;
  let target = 0;
  let rr = null;
  if ((signal === 'BUY' || signal === 'ACCUMULATE') && v.atr) {
    entry = r2(price);
    stop = r2(price - 2 * v.atr); // จุดตัดขาดทุน = entry − 2×ATR
    const resistance = Math.max(...bars.slice(-20).map((b) => b.high));
    const rrTarget = price + 2 * (price - stop); // เป้าหมายจาก risk-reward 1:2
    target = r2(Math.max(resistance, rrTarget));
    rr = stop < entry ? r2((target - entry) / (entry - stop)) : null;
    reasons.push({ ic: '🎯', t: `แผน: เข้า ~${entry} · stop ${stop} (−2×ATR) · เป้า ${target} · R:R 1:${rr}`, pts: 0 });
  }

  return {
    tech,
    mom,
    composite: tech, // Phase 1: composite = เทคนิคล้วน (Phase 2 จะถ่วงน้ำหนักรวมพื้นฐาน+sentiment)
    signal,
    entry,
    stop,
    target,
    rr,
    indicators: {
      ema20: r2(v.ema20),
      ema50: r2(v.ema50),
      ema200: r2(v.ema200),
      rsi: r2(v.rsi),
      macd: r2(v.macd),
      macdSignal: r2(v.macdSignal),
      macdHist: r2(v.macdHist),
      atr: r2(v.atr),
      adx: r2(v.adx),
      plusDI: r2(v.plusDI),
      minusDI: r2(v.minusDI),
      stochK: r2(v.stochK),
      stochD: r2(v.stochD),
      bbUpper: r2(v.bbUpper),
      bbLower: r2(v.bbLower),
      roc20: r2(roc20),
    },
    reasons,
  };
}

// ============================================================
//  Composite score (Phase 2) — รวม เทคนิค + พื้นฐาน + โมเมนตัม + sentiment
//  น้ำหนักปรับได้ (FR-SIGNAL) ; ถ้ามิติใดไม่มีข้อมูล → เฉลี่ยน้ำหนักใหม่อัตโนมัติ
// ============================================================
export const DEFAULT_WEIGHTS = { tech: 0.45, fund: 0.3, mom: 0.15, sentiment: 0.1 };

/**
 * รวมคะแนน 4 มิติเป็น composite + ตัดสินสัญญาณสุดท้าย
 * @param {{tech, fund, mom, sentiment}} parts (ค่า null = ไม่มีข้อมูลมิตินั้น)
 * @param {boolean} uptrend ราคายืนเหนือ EMA200 หรือไม่ (กันสัญญาณ BUY สวนเทรนด์ใหญ่)
 */
export function compose(parts, uptrend, weights = DEFAULT_WEIGHTS) {
  let wsum = 0;
  let acc = 0;
  const used = {};
  for (const k of Object.keys(weights)) {
    if (parts[k] != null) {
      acc += parts[k] * weights[k];
      wsum += weights[k];
      used[k] = weights[k];
    }
  }
  if (wsum === 0) return { composite: parts.tech ?? null, signal: 'NA', weights: used };
  const composite = clamp(Math.round(acc / wsum));

  let signal;
  if (composite >= 75 && uptrend) signal = 'BUY';
  else if (composite >= 64) signal = 'ACCUMULATE';
  else if (composite >= 50) signal = 'HOLD';
  else if (composite >= 38) signal = 'REDUCE';
  else if (uptrend === false && composite < 30) signal = 'AVOID';
  else signal = 'SELL';

  return { composite, signal, weights: used };
}

// helper: เส้น a ตัด b ขึ้น ภายใน lookback แท่งล่าสุด
function crossedUp(a, b, lookback) {
  const n = a.length;
  for (let i = n - 1; i >= Math.max(1, n - lookback); i--) {
    if (a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null) {
      if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return true;
    }
  }
  return false;
}
function crossedDown(a, b, lookback) {
  const n = a.length;
  for (let i = n - 1; i >= Math.max(1, n - lookback); i--) {
    if (a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null) {
      if (a[i - 1] >= b[i - 1] && a[i] < b[i]) return true;
    }
  }
  return false;
}
