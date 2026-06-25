// pipeline/fetch-master.js — โหลด/ตรวจสอบ/รีเฟรช master list หุ้นไทย
// - โหลด+validate: อ่านจาก master/thai-stocks.json
// - รีเฟรชเต็มตลาด: `node fetch-master.js --refresh` ดึงรายชื่อจาก Yahoo screener (region=th)
//   แล้ว merge เข้า master โดย "คงรายการ seed ที่ enrich แล้ว" (ชื่อไทย/เซกเตอร์จริง) ไว้เหมือนเดิม
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
const MASTER_PATH = resolve(REPO_ROOT, 'master/thai-stocks.json');

const VALID_MARKETS = new Set(['SET', 'mai']);

// DR ต่างชาติที่ชื่อ longName มี "Public Company Limited" ของผู้ออก (securities) จึงหลุด filter หลัก — ตัดทิ้งด้วยมือ
const DR_EXCLUDE = new Set(['JAP03', 'TAIWANAI13', 'TAIWANHD13', 'THAIBEV19']);
const YH = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: '*/*' };

/** โหลด master list + ตรวจความถูกต้องเบื้องต้น */
export async function loadMaster() {
  const raw = JSON.parse(await readFile(MASTER_PATH, 'utf8'));
  const stocks = raw.stocks ?? [];
  const seen = new Set();
  const clean = [];
  for (const s of stocks) {
    if (!s.symbol) continue;
    const sym = s.symbol.trim().toUpperCase();
    if (seen.has(sym)) {
      console.warn(`  ⚠ ข้าม symbol ซ้ำ: ${sym}`);
      continue;
    }
    if (!VALID_MARKETS.has(s.market)) {
      console.warn(`  ⚠ ${sym}: market ไม่ถูกต้อง (${s.market}) — ตั้งเป็น SET`);
    }
    seen.add(sym);
    clean.push({
      symbol: sym,
      name_th: s.name_th ?? sym,
      name_en: s.name_en ?? '',
      market: VALID_MARKETS.has(s.market) ? s.market : 'SET',
      sector: s.sector ?? 'อื่นๆ',
    });
  }
  return clean;
}

// ---- ขอ crumb + cookie จาก Yahoo (สำหรับ screener) ----
async function yahooCrumb() {
  const c = await fetch('https://fc.yahoo.com', { headers: YH }).catch(() => null);
  const cookie = (c?.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...YH, cookie } });
  const crumb = (await r.text()).trim();
  if (!crumb || crumb.includes('<')) throw new Error(`ขอ crumb ไม่สำเร็จ (HTTP ${r.status})`);
  return { crumb, cookie };
}

/**
 * ดึงรายชื่อหุ้นสามัญไทยเต็มตลาดจาก Yahoo screener (region=th, quoteType=EQUITY)
 * แล้วกรองให้เหลือเฉพาะบริษัทจดทะเบียนจริง:
 *  - ตัด NVDR (สัญลักษณ์ลงท้าย -R), ETF, และ DR ต่างชาติ (NVDA80/AAPL01 — ชื่อบริษัทต่างชาติ ไม่มี "Public Company Limited")
 *  - ตัด DR ที่หลุด filter (DR_EXCLUDE)
 * คืน array { symbol, name_en }  (Yahoo ไม่ให้ชื่อไทย/เซกเตอร์)
 */
export async function fetchMarketList() {
  const { crumb, cookie } = await yahooCrumb();
  const out = [];
  for (let offset = 0; offset < 3000; offset += 250) {
    const body = {
      size: 250, offset, quoteType: 'EQUITY', sortField: 'intradaymarketcap', sortType: 'DESC',
      query: { operator: 'AND', operands: [{ operator: 'EQ', operands: ['region', 'th'] }] },
      userId: '', userIdType: 'guid',
    };
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}`,
      { method: 'POST', headers: { ...YH, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`screener HTTP ${r.status}`);
    const res = (await r.json()).finance?.result?.[0];
    if (!res?.quotes?.length) break;
    out.push(...res.quotes);
    if (out.length >= (res.total ?? 0)) break;
  }
  const isPCL = (q) => /Public Company Limited|PCL\b/i.test(q.longName || q.shortName || '');
  return out
    .map((q) => ({ q, sym: q.symbol.replace(/\.BK$/, '') }))
    .filter(({ q, sym }) => q.quoteType !== 'ETF' && !sym.endsWith('-R') && !DR_EXCLUDE.has(sym) && isPCL(q))
    .map(({ q, sym }) => ({ symbol: sym, name_en: (q.longName || q.shortName || sym).trim() }));
}

/** รีเฟรช master: merge รายชื่อจาก Yahoo เข้าไฟล์เดิม โดยคงรายการที่ enrich แล้วไว้ */
export async function refreshMaster() {
  const raw = JSON.parse(await readFile(MASTER_PATH, 'utf8'));
  const existing = raw.stocks ?? [];
  const existSet = new Set(existing.map((s) => s.symbol));
  const clean = (s) => s.replace(/\s*Public Company Limited\.?$/i, '').replace(/\s*\bPCL\.?$/i, '').trim();
  const market = await fetchMarketList();
  const added = market
    .filter((m) => !existSet.has(m.symbol))
    .map((m) => ({ symbol: m.symbol, name_th: clean(m.name_en) || m.symbol, name_en: m.name_en, market: 'SET', sector: 'อื่นๆ' }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const stocks = [...existing, ...added];
  const data = {
    _meta: {
      ...(raw._meta ?? {}),
      note: 'Master list หุ้นไทย — ขยายเต็มตลาดจาก Yahoo screener (region=th, EQUITY). seed ตัวแรกมีชื่อไทย+เซกเตอร์จริง; ส่วนที่เพิ่ม sector=อื่นๆ + name_th=ชื่ออังกฤษ. ตัด NVDR(-R)/DR/ETF. mai ติดป้าย SET.',
      source: 'Yahoo Finance screener (region=th) — filter longName มี "Public Company Limited"',
      updated: '2026-06-25',
      count_total: stocks.length,
    },
    stocks,
  };
  await writeFile(MASTER_PATH, JSON.stringify(data, null, 2) + '\n');
  return { total: stocks.length, added: added.length };
}

// รันตรง ๆ: ตรวจสอบ master (ค่าเริ่มต้น) หรือ --refresh เพื่อดึงรายชื่อใหม่จาก Yahoo
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--refresh')) {
    const r = await refreshMaster();
    console.log(`✓ refreshed master: ${r.total} ตัว (เพิ่มใหม่ ${r.added})`);
  } else {
    const list = await loadMaster();
    const bySector = {};
    for (const s of list) bySector[s.sector] = (bySector[s.sector] ?? 0) + 1;
    console.log(`✓ master list: ${list.length} ตัว`);
    console.log('  รายเซกเตอร์:', bySector);
  }
}
