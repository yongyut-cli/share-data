// pipeline/fetch-master.js — โหลด/ตรวจสอบ master list หุ้นไทย
// Phase 0: อ่านจาก master/thai-stocks.json (seed)
// TODO (Phase หลัง): ดึงรายชื่อทั้งตลาด SET/mai อัตโนมัติเดือนละครั้ง
//   แนวทาง: ดึงจากหน้า SET (set.or.th) หรือไฟล์รายชื่อสาธารณะ แล้ว merge เข้า master
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
const MASTER_PATH = resolve(REPO_ROOT, 'master/thai-stocks.json');

const VALID_MARKETS = new Set(['SET', 'mai']);

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

// รันตรง ๆ เพื่อตรวจสอบ master list
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = await loadMaster();
  const bySector = {};
  for (const s of list) bySector[s.sector] = (bySector[s.sector] ?? 0) + 1;
  console.log(`✓ master list: ${list.length} ตัว`);
  console.log('  รายเซกเตอร์:', bySector);
}
