// pipeline/run.js — orchestrator EOD (Phase 0)
//   เป้าหมาย Phase 0: พิสูจน์ว่าดึงราคาจริงได้ 1 ตัว → หลายตัว และเขียนผลเป็น JSON ให้เว็บอ่าน
//   ผลลัพธ์เขียนลง public_html/stock/data/ (web อ่านได้):
//     - meta.json          : ข้อมูลการรัน (เวลา, จำนวนสำเร็จ/ล้มเหลว)
//     - summary.json       : ราคาปิดล่าสุด + %เปลี่ยน ของทุกตัว (ให้ dashboard/screener ใช้)
//     - prices/<SYM>.json  : OHLCV ย้อนหลังรายตัว (ให้กราฟแท่งเทียนใช้)
//
// การใช้งาน:
//   node pipeline/run.js --only PTT       ดึงตัวเดียว
//   node pipeline/run.js --limit 10       ดึง 10 ตัวแรกใน master (ดีฟอลต์ถ้าไม่ใส่ flag)
//   node pipeline/run.js --all            ดึงทุกตัวใน master
//   OUT_DIR=/path node pipeline/run.js    กำหนดโฟลเดอร์ผลลัพธ์เอง
import { resolve } from 'node:path';
import { loadMaster, REPO_ROOT } from './fetch-master.js';
import { fetchEOD } from './lib/yahoo.js';
import { mapBatched, writeJSON, todayICT, nowISO } from './lib/util.js';

const OUT_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(REPO_ROOT, 'public_html/stock/data');

function parseArgs(argv) {
  const a = { mode: 'demo', limit: 10, only: null };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--all') a.mode = 'all';
    else if (t === '--only') { a.mode = 'only'; a.only = argv[++i]?.toUpperCase(); }
    else if (t === '--limit') { a.mode = 'demo'; a.limit = parseInt(argv[++i], 10) || 10; }
  }
  return a;
}

function changePct(bars) {
  if (bars.length < 2) return 0;
  const a = bars[bars.length - 2].close;
  const b = bars[bars.length - 1].close;
  return a ? Math.round(((b - a) / a) * 10000) / 100 : 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const master = await loadMaster();
  const bySym = Object.fromEntries(master.map((s) => [s.symbol, s]));

  let targets;
  if (args.mode === 'only') targets = master.filter((s) => s.symbol === args.only);
  else if (args.mode === 'all') targets = master;
  else targets = master.slice(0, args.limit);

  if (!targets.length) {
    console.error(`✗ ไม่พบ symbol เป้าหมาย (${args.only ?? ''}) ใน master list`);
    process.exit(1);
  }

  console.log(`=== Thai Stock Analyzer — EOD pipeline (Phase 0) ===`);
  console.log(`วันที่ (ICT): ${todayICT()}  |  เป้าหมาย: ${targets.length} ตัว  |  out: ${OUT_DIR}\n`);

  // --- STEP 1: พิสูจน์ดึง "ตัวเดียว" ก่อน ---
  const first = targets[0];
  console.log(`STEP 1 — ดึงตัวเดียว: ${first.symbol} (${first.name_th})`);
  const probe = await fetchEOD(first.symbol);
  const lastBar = probe.bars[probe.bars.length - 1];
  console.log(
    `  ✓ ${probe.yahoo} | ${probe.currency} | ${probe.bars.length} แท่ง | ` +
      `ปิดล่าสุด ${lastBar.close} (${lastBar.date})\n`
  );

  // --- STEP 2: ดึง "หลายตัว" แบบ batch (จำกัด concurrency + เว้นจังหวะ กัน rate-limit) ---
  console.log(`STEP 2 — ดึงหลายตัว (${targets.length}) แบบ batch ...`);
  const settled = await mapBatched(
    targets,
    async (s) => {
      const data = await fetchEOD(s.symbol);
      return { s, data };
    },
    { concurrency: 4, gapMs: 700 }
  );

  const summary = [];
  const failures = [];
  let ok = 0;

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const meta = bySym[targets[i].symbol];
    if (r.status === 'fulfilled') {
      const { data } = r.value;
      const last = data.bars[data.bars.length - 1];
      await writeJSON(resolve(OUT_DIR, 'prices', `${meta.symbol}.json`), {
        symbol: meta.symbol,
        name_th: meta.name_th,
        sector: meta.sector,
        market: meta.market,
        currency: data.currency,
        bars: data.bars,
      });
      summary.push({
        symbol: meta.symbol,
        name_th: meta.name_th,
        name_en: meta.name_en,
        market: meta.market,
        sector: meta.sector,
        price: last.close,
        chg: changePct(data.bars),
        date: last.date,
        bars: data.bars.length,
        incomplete: data.bars.length < 30, // flag ข้อมูลสั้น/ไม่สมบูรณ์
      });
      ok++;
      console.log(`  ✓ ${meta.symbol.padEnd(7)} ${String(last.close).padStart(8)}  (${data.bars.length} แท่ง)`);
    } else {
      failures.push({ symbol: meta.symbol, error: String(r.reason?.message ?? r.reason) });
      console.warn(`  ✗ ${meta.symbol.padEnd(7)} — ${r.reason?.message ?? r.reason}`);
    }
  }

  summary.sort((a, b) => a.symbol.localeCompare(b.symbol));

  await writeJSON(resolve(OUT_DIR, 'summary.json'), { date: todayICT(), count: summary.length, stocks: summary });
  await writeJSON(resolve(OUT_DIR, 'meta.json'), {
    generated_at: nowISO(),
    date_ict: todayICT(),
    requested: targets.length,
    ok,
    failed: failures.length,
    failures,
    phase: 0,
    note: 'EOD prices only (ยังไม่มี indicators/scoring — เพิ่มใน Phase 1)',
  });

  console.log(`\n=== สรุป: สำเร็จ ${ok}/${targets.length} | ล้มเหลว ${failures.length} ===`);
  console.log(`เขียนผลที่: ${OUT_DIR}`);
  if (failures.length && ok === 0) process.exit(1); // ถือว่า fail ถ้าไม่ได้อะไรเลย
}

main().catch((e) => {
  console.error('✗ pipeline ล้มเหลว:', e);
  process.exit(1);
});
