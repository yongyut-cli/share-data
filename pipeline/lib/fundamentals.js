// pipeline/lib/fundamentals.js — คะแนนพื้นฐาน + ป้าย "เหมาะถือยาว" (Phase 2)
//   โปร่งใส: ทุกคะแนนมีเหตุผลประกอบ (FR-FUND)
//   ทนข้อมูลขาด: ฟิลด์ที่เป็น null จะข้าม (ไม่ลงโทษ) + ตั้ง flag incomplete

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10); // 0.0746 → 7.5(%)

/**
 * ให้คะแนนพื้นฐาน 0–100 จากอัตราส่วนการเงิน + ตัดสินป้าย "เหมาะถือยาว"
 * @param {object} f ผลจาก fetchFundamentals (อาจมีฟิลด์เป็น null)
 * @returns {{fund, grade, longTerm, incomplete, ratios, reasons}}
 */
export function scoreFundamentals(f) {
  if (!f) return null;
  const reasons = [];
  let fund = 50;
  let signals = 0; // นับฟิลด์ที่มีข้อมูลจริง (ไว้ตัดสิน incomplete)
  const add = (pts, ic, t) => {
    fund += pts;
    reasons.push({ ic, t, pts });
  };

  // 1) มูลค่า (Valuation) — P/E
  if (f.pe != null) {
    signals++;
    if (f.pe <= 0) add(-8, '⚠️', `P/E ${r2(f.pe)} — กำไรติดลบ/ไม่ปกติ`);
    else if (f.pe < 12) add(10, '💎', `P/E ${r2(f.pe)} — ถูก (ต่ำกว่า 12 เท่า)`);
    else if (f.pe < 20) add(4, '🟢', `P/E ${r2(f.pe)} — สมเหตุสมผล`);
    else if (f.pe < 30) add(0, '〰️', `P/E ${r2(f.pe)} — ค่อนข้างสูง`);
    else add(-6, '🔴', `P/E ${r2(f.pe)} — แพง (เกิน 30 เท่า)`);
  }

  // 2) P/BV
  if (f.pbv != null) {
    signals++;
    if (f.pbv < 1) add(8, '💎', `P/BV ${r2(f.pbv)} — ต่ำกว่ามูลค่าทางบัญชี`);
    else if (f.pbv < 2) add(3, '🟢', `P/BV ${r2(f.pbv)} — เหมาะสม`);
    else if (f.pbv < 4) add(0, '〰️', `P/BV ${r2(f.pbv)} — ค่อนข้างสูง`);
    else add(-5, '🔴', `P/BV ${r2(f.pbv)} — แพงเทียบมูลค่าทางบัญชี`);
  }

  // 3) ROE — ความสามารถทำกำไร
  if (f.roe != null) {
    signals++;
    if (f.roe >= 0.15) add(12, '🏆', `ROE ${pct(f.roe)}% — สูง (คุณภาพดี)`);
    else if (f.roe >= 0.1) add(7, '💪', `ROE ${pct(f.roe)}% — ดี`);
    else if (f.roe >= 0.05) add(2, '🟡', `ROE ${pct(f.roe)}% — ปานกลาง`);
    else add(-6, '🔻', `ROE ${pct(f.roe)}% — ต่ำ/อ่อนแอ`);
  }

  // 4) หนี้สิน (D/E)
  if (f.de != null) {
    signals++;
    if (f.de < 0.5) add(5, '🛡️', `D/E ${r2(f.de)} — หนี้ต่ำ ฐานะการเงินแข็ง`);
    else if (f.de < 1.5) add(0, '〰️', `D/E ${r2(f.de)} — หนี้ระดับปกติ`);
    else add(-6, '⛓️', `D/E ${r2(f.de)} — หนี้สูง เสี่ยงดอกเบี้ย`);
  }

  // 5) เงินปันผล
  if (f.divYield != null && f.divYield > 0) {
    signals++;
    if (f.divYield >= 0.05) add(8, '💰', `ปันผล ${pct(f.divYield)}% — สูง`);
    else if (f.divYield >= 0.03) add(5, '💵', `ปันผล ${pct(f.divYield)}% — ดี`);
    else add(2, '🪙', `ปันผล ${pct(f.divYield)}%`);
  }

  // 6) การเติบโตกำไร (YoY)
  if (f.epsGrowth != null) {
    signals++;
    if (f.epsGrowth >= 0.15) add(8, '🚀', `กำไรโต ${pct(f.epsGrowth)}% YoY — เติบโตเด่น`);
    else if (f.epsGrowth >= 0) add(3, '📈', `กำไรโต ${pct(f.epsGrowth)}% YoY`);
    else add(-6, '📉', `กำไรหด ${pct(f.epsGrowth)}% YoY`);
  }

  // 7) อัตรากำไรสุทธิ
  if (f.netMargin != null) {
    if (f.netMargin >= 0.15) add(5, '✨', `อัตรากำไรสุทธิ ${pct(f.netMargin)}% — สูง`);
    else if (f.netMargin >= 0.05) add(2, '🟢', `อัตรากำไรสุทธิ ${pct(f.netMargin)}%`);
    else if (f.netMargin < 0) add(-5, '🔴', `อัตรากำไรสุทธิ ${pct(f.netMargin)}% — ขาดทุน`);
  }

  fund = clamp(Math.round(fund));
  const grade = fund >= 75 ? 'A' : fund >= 60 ? 'B' : fund >= 45 ? 'C' : 'D';
  const incomplete = signals < 3; // ข้อมูลหลักไม่พอ → ตั้ง flag เตือน

  // ---------- ป้าย "เหมาะถือยาว" ----------
  // เกณฑ์: คุณภาพดี (ROE) + จ่ายปันผลพอควร + ไม่แพงเกิน + หนี้ไม่สูงเกิน + ไม่ขาดทุน
  const longTerm =
    !incomplete &&
    f.roe != null && f.roe >= 0.1 &&
    f.divYield != null && f.divYield >= 0.03 &&
    f.pe != null && f.pe > 0 && f.pe <= 25 &&
    (f.de == null || f.de < 2) &&
    (f.epsGrowth == null || f.epsGrowth > -0.05);
  if (longTerm) {
    reasons.push({ ic: '🌱', t: 'ผ่านเกณฑ์ "เหมาะถือยาว": ROE≥10% + ปันผล≥3% + ราคาไม่แพง + หนี้ไม่สูง', pts: 0 });
  }

  return {
    fund,
    grade,
    longTerm,
    incomplete,
    ratios: {
      pe: r2(f.pe),
      pbv: r2(f.pbv),
      roe: pct(f.roe),
      roa: pct(f.roa),
      de: r2(f.de),
      divYield: pct(f.divYield),
      epsGrowth: pct(f.epsGrowth),
      revGrowth: pct(f.revGrowth),
      netMargin: pct(f.netMargin),
      payout: pct(f.payout),
      mktcap: f.mktcap != null ? Math.round(f.mktcap / 1e6) : null, // ล้านบาท
      beta: r2(f.beta),
    },
    reasons,
  };
}

function r2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}
