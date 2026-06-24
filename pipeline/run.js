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
import { fetchEOD, fetchFundamentals } from './lib/yahoo.js';
import { fetchNewsTH } from './lib/news.js';
import { analyze, compose } from './lib/scoring.js';
import { scoreFundamentals } from './lib/fundamentals.js';
import { analyzeSentimentBatch, sentimentToScore, hasSentimentKey, sentimentProvider } from './lib/sentiment.js';
import { runAlerts, hasTelegram } from './lib/alerts.js';
import { mapBatched, writeJSON, todayICT, nowISO } from './lib/util.js';
import { readFile } from 'node:fs/promises';

// โหลดไฟล์ .env ที่ราก repo (ถ้ามี) — เก็บ secret ในเครื่องโดยไม่ commit
// Node 20.12+ มี process.loadEnvFile · บน GitHub Actions ไม่มีไฟล์นี้ → ใช้ Secrets ผ่าน env แทน
try { process.loadEnvFile(resolve(REPO_ROOT, '.env')); } catch { /* ไม่มีไฟล์ก็ข้ามเงียบ ๆ */ }

const OUT_DIR = process.env.OUT_DIR
  ? resolve(process.env.OUT_DIR)
  : resolve(REPO_ROOT, 'public_html/stock/data');

function parseArgs(argv) {
  const a = { mode: 'demo', limit: 10, only: null, fund: true, news: true, alerts: true, dryAlerts: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--all') a.mode = 'all';
    else if (t === '--only') { a.mode = 'only'; a.only = argv[++i]?.toUpperCase(); }
    else if (t === '--limit') { a.mode = 'demo'; a.limit = parseInt(argv[++i], 10) || 10; }
    else if (t === '--no-fund') a.fund = false;
    else if (t === '--no-news') a.news = false;
    else if (t === '--no-alerts') a.alerts = false; // intraday: ไม่ยิง Telegram ทุกรอบ
    else if (t === '--intraday') { a.fund = false; a.news = false; a.alerts = false; } // ทางลัด: ราคา/เทคนิคเท่านั้น
    else if (t === '--dry-alerts') a.dryAlerts = true; // พิมพ์ข้อความแจ้งเตือนแทนการส่งจริง
  }
  return a;
}

// อ่านไฟล์รายตัวเดิม (ไว้ carry-forward งบ/sentiment/ข่าว ตอนรัน intraday ที่ไม่ดึงค่าพวกนี้)
async function readPrevPrice(sym) {
  try {
    return JSON.parse(await readFile(resolve(OUT_DIR, 'prices', `${sym}.json`), 'utf8'));
  } catch {
    return null; // ครั้งแรกยังไม่มีไฟล์
  }
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

  // อ่าน summary เดิม (วันก่อนหน้า) ไว้เทียบ "สัญญาณเปลี่ยน" สำหรับแจ้งเตือน (FR-ALERT)
  let prevStocks = [];
  try {
    const prev = JSON.parse(await readFile(resolve(OUT_DIR, 'summary.json'), 'utf8'));
    prevStocks = prev.stocks || [];
  } catch { /* ครั้งแรกยังไม่มีไฟล์ — ไม่เป็นไร */ }

  // --- STEP 1: พิสูจน์ดึง "ตัวเดียว" ก่อน ---
  const first = targets[0];
  console.log(`STEP 1 — ดึงตัวเดียว: ${first.symbol} (${first.name_th})`);
  const probe = await fetchEOD(first.symbol);
  const lastBar = probe.bars[probe.bars.length - 1];
  console.log(
    `  ✓ ${probe.yahoo} | ${probe.currency} | ${probe.bars.length} แท่ง | ` +
      `ปิดล่าสุด ${lastBar.close} (${lastBar.date})\n`
  );

  // --- STEP 2: ดึง "หลายตัว" แบบ batch — ราคา + งบการเงิน + ข่าว (กัน rate-limit) ---
  console.log(
    `STEP 2 — ดึงหลายตัว (${targets.length}): ราคา` +
      `${args.fund ? ' + งบการเงิน' : ''}${args.news ? ' + ข่าว' : ''} ...`
  );
  const settled = await mapBatched(
    targets,
    async (s) => {
      const data = await fetchEOD(s.symbol);
      // งบการเงิน/ข่าว = เสริม → ล้มเหลวได้โดยไม่ทำให้ทั้งตัวพัง (graceful degradation, FR-DATA-4)
      let fund = null;
      let news = [];
      if (args.fund) {
        try {
          fund = await fetchFundamentals(s.symbol);
        } catch (e) {
          console.warn(`  ⚠ ${s.symbol} งบการเงิน: ${e.message}`);
        }
      }
      if (args.news) {
        try {
          // ข่าวหุ้นไทยรายตัวจาก Google News RSS (ไทย) — ตรงบริษัทกว่า Yahoo มาก (ดู PROGRESS audit)
          news = await fetchNewsTH(s.symbol, { name_th: s.name_th, name_en: s.name_en });
        } catch { /* เงียบ — ข่าวเป็นออปชัน */ }
      }
      return { s, data, fund, news };
    },
    { concurrency: 4, gapMs: 700 }
  );

  // --- STEP 2.5: รวบรวมผลดิบ + คำนวณเทคนิค/พื้นฐาน (ยังไม่ compose จนกว่าได้ sentiment) ---
  const records = [];
  const failures = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const meta = bySym[targets[i].symbol];
    if (r.status === 'fulfilled') {
      const { data, fund, news } = r.value;
      records.push({
        meta,
        data,
        tech: analyze(data.bars),                       // เทคนิค (null ถ้าข้อมูลสั้น)
        fundScore: fund ? scoreFundamentals(fund) : null, // พื้นฐาน (null ถ้าดึงไม่ได้)
        news: news ?? [],
      });
    } else {
      failures.push({ symbol: meta.symbol, error: String(r.reason?.message ?? r.reason) });
      console.warn(`  ✗ ${meta.symbol.padEnd(7)} — ${r.reason?.message ?? r.reason}`);
    }
  }

  // --- STEP 3: ข่าว → sentiment ด้วย LLM (batch เดียว ; ข้ามถ้าไม่มี key) ---
  //   ใช้ Gemini ถ้าตั้ง GEMINI_API_KEY, มิฉะนั้นใช้ Claude ถ้าตั้ง ANTHROPIC_API_KEY
  let sentiments = {};
  if (args.news) {
    if (hasSentimentKey()) {
      const newsBatch = records
        .filter((rec) => rec.news.length)
        .map((rec) => ({ symbol: rec.meta.symbol, name: rec.meta.name_en || rec.meta.name_th, news: rec.news }));
      if (newsBatch.length) {
        console.log(`\nSTEP 3 — วิเคราะห์ sentiment ${newsBatch.length} ตัวที่มีข่าว ด้วย ${sentimentProvider()} ...`);
        try {
          sentiments = await analyzeSentimentBatch(newsBatch);
        } catch (e) {
          console.warn(`  ⚠ sentiment ล้มเหลว: ${e.message}`);
        }
      }
    } else {
      console.log(`\nSTEP 3 — ข้าม sentiment (ไม่มี GEMINI_API_KEY/ANTHROPIC_API_KEY) — จะทำงานเมื่อรันบน GitHub Actions ที่ตั้ง Secret`);
    }
  }

  // --- STEP 4: compose composite + สัญญาณสุดท้าย แล้วเขียนไฟล์ ---
  const summary = [];
  let ok = 0;
  for (const rec of records) {
    const { meta, data, tech } = rec;
    const last = data.bars[data.bars.length - 1];
    const turnover = Math.round((last.close * last.volume) / 1e6);

    // อ่านรอบก่อนเสมอ — ใช้ทั้ง (ก) intraday ที่ไม่ดึงงบ/ข่าว และ (ข) carry-forward sentiment เมื่อ LLM ล้มเหลว/โควต้าหมด
    const prev = await readPrevPrice(meta.symbol);
    const fundScore = args.fund ? rec.fundScore : (prev?.fundamentals ?? null);
    // sentiment: ใช้ผลรอบนี้ก่อน → ถ้าไม่มี (เช่นโควต้า Gemini หมด) คงค่ารอบก่อนไว้ (ติดธง stale) แทนล้างเป็น null
    const freshSent = args.news ? sentiments[meta.symbol] : null;
    const sent = freshSent
      ? freshSent                                           // { score, summary, risks }
      : (prev?.sentiment ? { ...prev.sentiment, stale: true } : null);
    const newsArr = args.news ? rec.news : (prev?.news ?? []);
    const sentScore = sent ? sentimentToScore(sent.score) : null; // 0..100 | null
    const uptrend = tech?.indicators?.ema200 != null ? last.close > tech.indicators.ema200 : null;

    // composite รวม 4 มิติ (มิติที่ไม่มีข้อมูล → ถ่วงน้ำหนักใหม่อัตโนมัติ)
    const comp = tech
      ? compose({ tech: tech.tech, fund: fundScore?.fund ?? null, mom: tech.mom, sentiment: sentScore }, uptrend)
      : { composite: null, signal: 'NA', weights: {} };

    // score รวม = เทคนิค (entry/stop/target/indicators/reasons) + composite/signal สุดท้าย
    const score = tech
      ? { ...tech, composite: comp.composite, signal: comp.signal, signalTech: tech.signal, weights: comp.weights }
      : null;

    await writeJSON(resolve(OUT_DIR, 'prices', `${meta.symbol}.json`), {
      symbol: meta.symbol,
      name_th: meta.name_th,
      name_en: meta.name_en,
      sector: meta.sector,
      market: meta.market,
      currency: data.currency,
      date: last.date,
      price: last.close,
      chg: changePct(data.bars),
      score,
      fundamentals: fundScore,                 // { fund, grade, longTerm, ratios, reasons } | null
      sentiment: sent ? { ...sent, score100: sentScore } : null,
      news: newsArr,
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
      turnover,
      date: last.date,
      bars: data.bars.length,
      tech: tech?.tech ?? null,
      fund: fundScore?.fund ?? null,
      mom: tech?.mom ?? null,
      sentiment: sentScore,
      composite: comp.composite,
      signal: score?.signal ?? null,
      rr: tech?.rr ?? null,
      longTerm: fundScore?.longTerm ?? false,
      grade: fundScore?.grade ?? null,
      divYield: fundScore?.ratios?.divYield ?? null,
      pe: fundScore?.ratios?.pe ?? null,
      fundIncomplete: fundScore?.incomplete ?? null,
      incomplete: !tech,
    });
    ok++;
    const sig = score?.signal ?? '—';
    const lt = fundScore?.longTerm ? '🌱' : '  ';
    console.log(
      `  ✓ ${meta.symbol.padEnd(7)} ${String(last.close).padStart(8)}  ` +
        `T${String(tech?.tech ?? '—').padStart(3)} F${String(fundScore?.fund ?? '—').padStart(3)} ` +
        `→ ${String(comp.composite ?? '—').padStart(3)} ${lt} ${sig}`
    );
  }

  summary.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // --- SET index + สถิติภาพรวมตลาด (จาก universe ที่ติดตาม) ---
  let setIndex = null;
  try {
    const idx = await fetchEOD('^SET.BK', { range: '5d' });
    const lb = idx.bars[idx.bars.length - 1];
    setIndex = { value: lb.close, chg: changePct(idx.bars), date: lb.date };
    console.log(`\nSET index: ${setIndex.value} (${setIndex.chg >= 0 ? '+' : ''}${setIndex.chg}%)`);
  } catch (e) {
    console.warn(`\n⚠ ดึง SET index ไม่ได้: ${e.message}`);
  }

  const advancers = summary.filter((s) => s.chg > 0).length;
  const decliners = summary.filter((s) => s.chg < 0).length;
  const buyCount = summary.filter((s) => s.signal === 'BUY').length;
  const longTermCount = summary.filter((s) => s.longTerm).length;
  const turnoverSum = summary.reduce((a, s) => a + (s.turnover || 0), 0);

  const market = {
    set_index: setIndex,
    universe: summary.length,
    advancers,
    decliners,
    buy_signals: buyCount,
    long_term_picks: longTermCount,
    turnover_total_mbaht: turnoverSum,
  };

  await writeJSON(resolve(OUT_DIR, 'summary.json'), {
    date: todayICT(),
    count: summary.length,
    market,
    stocks: summary,
  });
  const fundOk = summary.filter((s) => s.fund != null).length;
  const sentOk = summary.filter((s) => s.sentiment != null).length;
  await writeJSON(resolve(OUT_DIR, 'meta.json'), {
    generated_at: nowISO(),
    date_ict: todayICT(),
    requested: targets.length,
    ok,
    failed: failures.length,
    failures,
    phase: 2,
    fundamentals_ok: fundOk,
    sentiment_ok: sentOk,
    sentiment_enabled: hasSentimentKey(),
    note: 'EOD + technical + fundamentals + long-term flag + composite (sentiment เปิดเมื่อมี GEMINI_API_KEY หรือ ANTHROPIC_API_KEY)',
  });

  console.log(`\n=== สรุป: สำเร็จ ${ok}/${targets.length} | ล้มเหลว ${failures.length} ===`);
  console.log(`เขียนผลที่: ${OUT_DIR}`);

  // --- STEP 5: แจ้งเตือน (FR-ALERT) — สรุปรายวัน + สัญญาณเปลี่ยน ---
  try {
    const r = await runAlerts({ date: todayICT(), market, stocks: summary, prevStocks, dry: args.dryAlerts });
    if (r.dry) {
      console.log(`\nSTEP 5 — แจ้งเตือน (dry-run, สัญญาณเปลี่ยน ${r.changes} ตัว):\n${'-'.repeat(48)}\n${r.text}\n${'-'.repeat(48)}`);
    } else if (r.sent) {
      console.log(`\nSTEP 5 — ส่ง Telegram สำเร็จ (${r.parts} ข้อความ, สัญญาณเปลี่ยน ${r.changes} ตัว)`);
    } else {
      console.log(`\nSTEP 5 — ข้ามแจ้งเตือน (ไม่มี TELEGRAM_BOT_TOKEN/CHAT_ID) — จะทำงานเมื่อตั้ง Secret บน Actions`);
    }
  } catch (e) {
    console.warn(`\n⚠ STEP 5 แจ้งเตือนล้มเหลว (ไม่กระทบข้อมูล): ${e.message}`);
  }

  if (failures.length && ok === 0) process.exit(1); // ถือว่า fail ถ้าไม่ได้อะไรเลย
}

main().catch((e) => {
  console.error('✗ pipeline ล้มเหลว:', e);
  process.exit(1);
});
