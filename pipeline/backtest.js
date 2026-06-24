// pipeline/backtest.js — backtest พื้นฐาน ตรวจ "คุณภาพสัญญาณ" (Phase 3)
//
// แนวคิด (honest & simple): เดินย้อนหลังทีละวันบนข้อมูล OHLCV จริงของแต่ละหุ้น
//   - ที่วัน i เรียก analyze(bars[0..i]) → ได้ "สัญญาณเทคนิค" ของวันนั้น
//   - วัดผลตอบแทนล่วงหน้า H วัน = (close[i+H] − close[i]) / close[i]
//   - รวมสถิติต่อชนิดสัญญาณ: จำนวน, ผลตอบแทนเฉลี่ย, อัตราชนะ (% บวก) ที่ H = 5/10/20 วัน
//   - เทียบกับ baseline (สุ่มเข้าเฉลี่ยทุกวัน) เพื่อดูว่าสัญญาณมี "edge" จริงไหม
//
// ⚠️ backtest นี้วัด "สัญญาณเทคนิค" (Phase 1) เท่านั้น — เพราะงบการเงิน/sentiment ย้อนหลัง
//    ไม่มีเก็บไว้ จึง replay composite ไม่ได้ ใช้เป็นตัวตรวจคุณภาพเชิงเทคนิคแบบคร่าว ไม่ใช่ผลเทรดจริง
//    (ไม่รวมค่าคอม/สลิปเพจ/เงินปันผล)
//
// ใช้งาน:
//   node pipeline/backtest.js              (ทุกหุ้นใน data/prices)
//   node pipeline/backtest.js --only PTT
//   node pipeline/backtest.js --step 2     (ข้ามวันเพื่อเร็วขึ้น)

import { resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { REPO_ROOT } from './fetch-master.js';
import { analyze } from './lib/scoring.js';
import { writeJSON, nowISO } from './lib/util.js';

const DATA_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(REPO_ROOT, 'public_html/stock/data');

const HORIZONS = [5, 10, 20];
const MIN_BARS = 60; // ต้องมีอย่างน้อยเท่าที่ analyze ต้องการ

function parseArgs(argv) {
  const a = { only: null, step: 1 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--only') a.only = argv[++i]?.toUpperCase();
    else if (argv[i] === '--step') a.step = Math.max(1, parseInt(argv[++i], 10) || 1);
  }
  return a;
}

// ตัวสะสมสถิติต่อชนิดสัญญาณ ต่อ horizon
function blankStat() {
  const s = { samples: 0 };
  for (const h of HORIZONS) s[`h${h}`] = { n: 0, sumRet: 0, wins: 0 };
  return s;
}
function addReturn(stat, h, ret) {
  const b = stat[`h${h}`];
  b.n++; b.sumRet += ret; if (ret > 0) b.wins++;
}
function finalize(stat) {
  const out = { samples: stat.samples };
  for (const h of HORIZONS) {
    const b = stat[`h${h}`];
    out[`h${h}`] = {
      n: b.n,
      avgRetPct: b.n ? +(b.sumRet / b.n * 100).toFixed(3) : null,
      winRatePct: b.n ? +(b.wins / b.n * 100).toFixed(1) : null,
    };
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const files = (await readdir(resolve(DATA_DIR, 'prices'))).filter((f) => f.endsWith('.json'));
  const targets = args.only ? files.filter((f) => f === `${args.only}.json`) : files;
  if (!targets.length) { console.error('✗ ไม่พบไฟล์ราคาใน', resolve(DATA_DIR, 'prices')); process.exit(1); }

  console.log(`=== Backtest คุณภาพสัญญาณ (เทคนิค) ===`);
  console.log(`หุ้น ${targets.length} ตัว · horizons ${HORIZONS.join('/')} วัน · step ${args.step}\n`);

  const bySignal = {};          // signal → stat
  const baseline = blankStat(); // สุ่มเข้าเฉลี่ยทุกวัน
  let stocksUsed = 0;
  const t0 = Date.now();

  for (const file of targets) {
    let rec;
    try { rec = JSON.parse(await readFile(resolve(DATA_DIR, 'prices', file), 'utf8')); }
    catch { continue; }
    const bars = rec.bars || [];
    if (bars.length < MIN_BARS + Math.max(...HORIZONS) + 1) continue;
    stocksUsed++;

    const maxH = Math.max(...HORIZONS);
    for (let i = MIN_BARS - 1; i < bars.length - maxH; i += args.step) {
      const res = analyze(bars.slice(0, i + 1));
      if (!res) continue;
      const sig = res.signal || 'NA';
      const c0 = bars[i].close;
      if (!c0) continue;

      (bySignal[sig] ||= blankStat()).samples++;
      baseline.samples++;
      for (const h of HORIZONS) {
        const cH = bars[i + h]?.close;
        if (!cH) continue;
        const ret = (cH - c0) / c0;
        addReturn(bySignal[sig], h, ret);
        addReturn(baseline, h, ret);
      }
    }
  }

  // ---- สรุปผล ----
  const ORDER = ['BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL', 'AVOID', 'NA'];
  const result = {
    generated_at: nowISO(),
    note: 'วัดเฉพาะสัญญาณเทคนิค (Phase 1) บน close price — ไม่รวมค่าคอม/ปันผล/สลิปเพจ',
    universe: stocksUsed,
    horizons: HORIZONS,
    baseline: finalize(baseline),
    bySignal: Object.fromEntries(
      ORDER.filter((s) => bySignal[s]).map((s) => [s, finalize(bySignal[s])])
    ),
  };

  await writeJSON(resolve(DATA_DIR, 'backtest.json'), result);

  // ---- ตารางคอนโซล ----
  const base20 = result.baseline.h20.avgRetPct;
  console.log(`สัญญาณ      ตัวอย่าง   | ` + HORIZONS.map((h) => `H${h}: ผลตอบแทน% / ชนะ%`).join('  '));
  console.log('-'.repeat(78));
  for (const sig of ORDER) {
    const st = result.bySignal[sig];
    if (!st) continue;
    const cells = HORIZONS.map((h) => {
      const b = st[`h${h}`];
      return `${String(b.avgRetPct ?? '—').padStart(7)} / ${String(b.winRatePct ?? '—').padStart(5)}`;
    }).join('  ');
    console.log(`${sig.padEnd(11)} ${String(st.samples).padStart(7)}   | ${cells}`);
  }
  console.log('-'.repeat(78));
  const bl = HORIZONS.map((h) => {
    const b = result.baseline[`h${h}`];
    return `${String(b.avgRetPct ?? '—').padStart(7)} / ${String(b.winRatePct ?? '—').padStart(5)}`;
  }).join('  ');
  console.log(`${'baseline'.padEnd(11)} ${String(result.baseline.samples).padStart(7)}   | ${bl}`);

  // edge ของสัญญาณซื้อเทียบ baseline (H20)
  const buy = result.bySignal.BUY?.h20?.avgRetPct;
  if (buy != null && base20 != null) {
    const edge = +(buy - base20).toFixed(3);
    console.log(`\n📊 Edge สัญญาณ BUY ที่ 20 วัน: ${edge >= 0 ? '+' : ''}${edge}% เทียบ baseline ${base20}%`);
    console.log(edge > 0 ? '   → สัญญาณ BUY ทำได้ดีกว่าค่าเฉลี่ย (มี edge เชิงบวกในชุดข้อมูลนี้)'
                         : '   → สัญญาณ BUY ยังไม่ชนะค่าเฉลี่ยในชุดข้อมูลนี้ (ควรปรับจูน)');
  }
  console.log(`\nเขียนผล: ${resolve(DATA_DIR, 'backtest.json')}  ·  ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error('✗ backtest ล้มเหลว:', e); process.exit(1); });
