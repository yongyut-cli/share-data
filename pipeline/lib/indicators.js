// pipeline/lib/indicators.js — อินดิเคเตอร์เทคนิค (pure JS, ไม่มี dependency)
// ทุกฟังก์ชันรับ "ราคา" เป็น array และคืน array ความยาวเท่ากัน (ค่าเริ่มต้นเป็น null จนกว่าจะคำนวณได้)
// bars = [{date, open, high, low, close, volume}, ...] เรียงจากเก่า → ใหม่

export function sma(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    prev = prev == null ? v : v * k + prev * (1 - k);
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

// RSI แบบ Wilder smoothing
export function rsi(closes, period = 14) {
  const out = Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = Math.max(ch, 0);
    const loss = Math.max(-ch, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = rsiFrom(avgGain, avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = rsiFrom(avgGain, avgLoss);
    }
  }
  return out;
}
function rsiFrom(g, l) {
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
}

// MACD: คืน {macd[], signal[], hist[]}
export function macd(closes, fast = 12, slow = 26, signalP = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  // signal = EMA ของ macdLine (เฉพาะช่วงที่มีค่า)
  const signal = Array(closes.length).fill(null);
  const k = 2 / (signalP + 1);
  let prev = null;
  let count = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) continue;
    count++;
    prev = prev == null ? macdLine[i] : macdLine[i] * k + prev * (1 - k);
    if (count >= signalP) signal[i] = prev;
  }
  const hist = closes.map((_, i) =>
    macdLine[i] != null && signal[i] != null ? macdLine[i] - signal[i] : null
  );
  return { macd: macdLine, signal, hist };
}

// Bollinger Bands: คืน {mid[], upper[], lower[]}
export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = Array(closes.length).fill(null);
  const lower = Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

// ATR แบบ Wilder
export function atr(bars, period = 14) {
  const out = Array(bars.length).fill(null);
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      if (i === period - 1) {
        prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

// ADX (+DI/-DI) แบบ Wilder: คืน {adx[], plusDI[], minusDI[]}
export function adx(bars, period = 14) {
  const n = bars.length;
  const plusDI = Array(n).fill(null);
  const minusDI = Array(n).fill(null);
  const adxArr = Array(n).fill(null);
  if (n <= period) return { adx: adxArr, plusDI, minusDI };

  const tr = Array(n).fill(0);
  const plusDM = Array(n).fill(0);
  const minusDM = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    const pc = bars[i - 1].close;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc));
  }

  let trS = 0;
  let pS = 0;
  let mS = 0;
  const dx = Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (i <= period) {
      trS += tr[i];
      pS += plusDM[i];
      mS += minusDM[i];
    } else {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + plusDM[i];
      mS = mS - mS / period + minusDM[i];
    }
    if (i >= period) {
      const pdi = trS === 0 ? 0 : (100 * pS) / trS;
      const mdi = trS === 0 ? 0 : (100 * mS) / trS;
      plusDI[i] = pdi;
      minusDI[i] = mdi;
      dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
    }
  }
  // ADX = Wilder smoothing ของ DX
  let adxPrev = null;
  let cnt = 0;
  for (let i = period; i < n; i++) {
    if (dx[i] == null) continue;
    cnt++;
    if (cnt <= period) {
      adxPrev = adxPrev == null ? dx[i] : adxPrev + dx[i];
      if (cnt === period) {
        adxPrev /= period;
        adxArr[i] = adxPrev;
      }
    } else {
      adxPrev = (adxPrev * (period - 1) + dx[i]) / period;
      adxArr[i] = adxPrev;
    }
  }
  return { adx: adxArr, plusDI, minusDI };
}

// Stochastic %K/%D
export function stochastic(bars, period = 14, smoothD = 3) {
  const n = bars.length;
  const k = Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    k[i] = hh === ll ? 50 : (100 * (bars[i].close - ll)) / (hh - ll);
  }
  const d = sma(k.map((v) => (v == null ? 0 : v)), smoothD).map((v, i) => (k[i] == null ? null : v));
  return { k, d };
}

// OBV
export function obv(bars) {
  const out = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    out[i] = out[i - 1] + (diff > 0 ? bars[i].volume : diff < 0 ? -bars[i].volume : 0);
  }
  return out;
}

export const last = (arr) => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
};
