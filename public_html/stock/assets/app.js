/* ============================================================
   Thai Stock Analyzer — โหลดข้อมูลจริงจาก pipeline (Phase 1)
   ข้อมูลมาจาก data/summary.json + data/prices/<SYM>.json
   (สร้างโดย Node pipeline → GitHub Actions รายวัน)
   ============================================================ */

const DATA_BASE = 'data';

// ---- state (เติมค่าเมื่อ READY resolve) ----
let STOCKS = [];
let MARKET = {};
let SECTORS = [];
let DATA_DATE = '';

// ---- signal styling ----
const SIGNAL_META = {
  BUY:        { label: 'ซื้อ',       cls: 'sig-buy',    dot: '#10d18e' },
  ACCUMULATE: { label: 'ทยอยสะสม',   cls: 'sig-acc',    dot: '#4ade80' },
  HOLD:       { label: 'ถือ',        cls: 'sig-hold',   dot: '#a3a3a3' },
  REDUCE:     { label: 'ลดพอร์ต',    cls: 'sig-reduce', dot: '#fbbf24' },
  SELL:       { label: 'ขาย',        cls: 'sig-sell',   dot: '#f87171' },
  AVOID:      { label: 'เลี่ยง',      cls: 'sig-avoid',  dot: '#ef4444' },
  NA:         { label: 'ข้อมูลไม่พอ', cls: 'sig-hold',   dot: '#6b7280' },
};

function scoreColor(v) {
  if (v == null) return '#6b7280';
  if (v >= 75) return '#10d18e';
  if (v >= 60) return '#4ade80';
  if (v >= 45) return '#fbbf24';
  return '#f87171';
}

function fmtNum(v, d = 2) { return v == null ? '—' : (+v).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d }); }
function fmtCap(b) { if (b == null) return '—'; return b >= 1000 ? (b / 1000).toFixed(2) + ' ล้านล้าน' : Math.round(b).toLocaleString('th-TH') + ' ลบ.'; }
function qs(name) { return new URLSearchParams(location.search).get(name); }
function getStock(sym) { return STOCKS.find((s) => s.sym === sym) || null; }

// ---- EMA helper สำหรับกราฟ (รับ array ที่มี .time และ .close) ----
function ema(data, period, key = 'close') {
  const k = 2 / (period + 1);
  let prev;
  const out = [];
  data.forEach((d, i) => {
    const v = d[key];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    if (i >= period - 1) out.push({ time: d.time, value: +prev.toFixed(2) });
  });
  return out;
}

// ---- map ข้อมูลจาก summary → รูปแบบที่หน้าเว็บใช้ ----
function mapStock(s) {
  return {
    sym: s.symbol,
    name: s.name_th,
    name_en: s.name_en,
    sector: s.sector,
    market: s.market,
    price: s.price,
    chg: s.chg,
    turnover: s.turnover,
    tech: s.tech,
    mom: s.mom,
    comp: s.composite,
    signal: s.signal || 'NA',
    rr: s.rr,
    incomplete: s.incomplete,
    // --- Phase 2 (ข้อมูลจริง) ---
    fund: s.fund ?? null,
    sent: s.sentiment ?? null,
    longTerm: s.longTerm ?? false,
    grade: s.grade ?? null,
    pe: s.pe ?? null,
    div: s.divYield ?? null,
    fundIncomplete: s.fundIncomplete ?? null,
  };
}

// ---- โหลดข้อมูลภาพรวม ----
async function bootstrap() {
  const res = await fetch(`${DATA_BASE}/summary.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`โหลด summary.json ไม่ได้ (HTTP ${res.status})`);
  const data = await res.json();
  DATA_DATE = data.date;
  MARKET = data.market || {};
  STOCKS = (data.stocks || []).map(mapStock);
  SECTORS = [...new Set(STOCKS.map((s) => s.sector))].sort();
  return STOCKS;
}

// ---- โหลดข้อมูลรายตัว (bars + score เต็ม) ----
async function loadStock(sym) {
  const res = await fetch(`${DATA_BASE}/prices/${sym}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`โหลดข้อมูล ${sym} ไม่ได้ (HTTP ${res.status})`);
  return res.json();
}

// ---- แสดง error แบบสุภาพ ----
function showDataError(err) {
  const box = document.createElement('div');
  box.style.cssText = 'max-width:760px;margin:40px auto;padding:20px;border-radius:14px;background:#1a1010;border:1px solid #f8717155;color:#f8b4b4;font-family:inherit';
  box.innerHTML = `<b>โหลดข้อมูลไม่สำเร็จ</b><br><span style="opacity:.8">${err.message}</span>
    <div style="margin-top:10px;opacity:.7;font-size:13px">ตรวจว่ามีไฟล์ <code>${DATA_BASE}/summary.json</code> (รัน pipeline แล้วหรือยัง)
    และเปิดผ่าน http(s) ไม่ใช่ file://</div>`;
  document.body.prepend(box);
  console.error(err);
}

// ============================================================
//  API ส่วนตัว (Phase 3 / FR-PORT) — พอร์ต + watchlist
//  ต้องล็อกอินอยู่ (session) · เซิร์ฟเวอร์ตรวจสิทธิ์ใน api.php
// ============================================================
let _csrf = null;

async function apiState() {
  const res = await fetch('api.php?action=state', { cache: 'no-store' });
  if (res.status === 401) { location.href = 'login.php'; throw new Error('ต้องเข้าสู่ระบบ'); }
  if (!res.ok) throw new Error(`โหลดข้อมูลผู้ใช้ไม่ได้ (HTTP ${res.status})`);
  const d = await res.json();
  _csrf = d.csrf || _csrf;
  return d;
}

async function apiPost(action, payload = {}) {
  if (!_csrf) { try { await apiState(); } catch (e) { /* ตกไปให้ error ด้านล่าง */ } }
  const res = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF': _csrf || '' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (res.status === 401) { location.href = 'login.php'; throw new Error('ต้องเข้าสู่ระบบ'); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `บันทึกไม่สำเร็จ (HTTP ${res.status})`);
  _csrf = d.csrf || _csrf;
  return d;
}

// ============================================================
//  ค้นหา + แบ่งหน้า (ใช้ร่วมกัน — index/screener) สำหรับ master list ใหญ่ (~800 ตัว)
// ============================================================

/** กรองด้วยคำค้น: symbol / ชื่อไทย / ชื่ออังกฤษ (ไม่สนตัวพิมพ์) */
function searchStocks(rows, term) {
  const q = (term || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((s) =>
    (s.sym && s.sym.toLowerCase().includes(q)) ||
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.name_en && s.name_en.toLowerCase().includes(q)));
}

/** วาดปุ่มแบ่งหน้าแบบมีหน้าต่าง (… ย่อเมื่อหน้าเยอะ) */
function renderPager(el, page, pages, go) {
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  const btn = (label, p, { active = false, disabled = false } = {}) =>
    `<button ${disabled ? 'disabled' : ''} class="${active ? 'active' : ''}" data-p="${p}">${label}</button>`;
  const gap = '<span class="gap">…</span>';
  let html = btn('‹', page - 1, { disabled: page <= 1 });
  const win = [];
  const push = (p) => { if (p >= 1 && p <= pages && !win.includes(p)) win.push(p); };
  push(1); push(2);
  for (let p = page - 1; p <= page + 1; p++) push(p);
  push(pages - 1); push(pages);
  win.sort((a, b) => a - b);
  let prev = 0;
  for (const p of win) { if (p - prev > 1) html += gap; html += btn(p, p, { active: p === page }); prev = p; }
  html += btn('›', page + 1, { disabled: page >= pages });
  el.innerHTML = html;
  el.querySelectorAll('button[data-p]').forEach((b) =>
    b.addEventListener('click', () => { const p = +b.dataset.p; if (p >= 1 && p <= pages) go(p); }));
}

/**
 * ผูกตาราง + แบ่งหน้า + ช่องค้นหาเข้าด้วยกัน
 * opts: { source():rows[], render(rows):html, body, pager, info?, search?, perPage=25, cols=12 }
 * คืน { refresh } เรียกเมื่อฟิลเตอร์เปลี่ยน (รีเซ็ตไปหน้า 1)
 */
function attachPagedTable(opts) {
  const { render, body, pager, info, search, perPage = 25, cols = 12 } = opts;
  let page = 1;
  function show() {
    let rows = opts.source();
    if (search) rows = searchStocks(rows, search.value);
    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    const start = (page - 1) * perPage;
    const slice = rows.slice(start, start + perPage);
    body.innerHTML = slice.length
      ? render(slice)
      : `<tr><td colspan="${cols}" class="text-center muted py-6">ไม่พบหุ้นตามเงื่อนไข</td></tr>`;
    if (info) info.textContent = rows.length
      ? `${start + 1}–${Math.min(start + perPage, rows.length)} จาก ${rows.length} ตัว`
      : '0 ตัว';
    renderPager(pager, page, pages, (p) => { page = p; show(); body.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  }
  const refresh = () => { page = 1; show(); };
  if (search) search.addEventListener('input', refresh);
  return { refresh, show };
}

// promise กลางที่ทุกหน้า await ก่อน render
const READY = bootstrap();
