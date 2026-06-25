/* ============================================================
   portfolio.js — พอร์ต + watchlist (Phase 3 / FR-PORT)
   ใช้ข้อมูลจริงจาก api.php (เก็บต่อผู้ใช้) + ราคา EOD จาก summary.json
   ============================================================ */

let STATE = { portfolio: [], watchlist: [] };
let donutChart = null;

const $ = (id) => document.getElementById(id);
const baht = (v, d = 0) => (v >= 0 ? '' : '') + v.toLocaleString('th-TH', { maximumFractionDigits: d }) + ' ฿';

function setText(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  if (cls != null) el.className = 'text-2xl font-bold ' + cls;
}

// ---- เติมรายชื่อหุ้นใน datalist ----
function fillSymList() {
  $('symList').innerHTML = STOCKS
    .map((s) => `<option value="${s.sym}">${s.name}</option>`)
    .join('');
}

// ---- render สรุป + ตารางถือครอง ----
function renderPortfolio() {
  const rows = STATE.portfolio.map((h) => {
    const s = getStock(h.sym);
    const unknown = !s;                       // หุ้นนอก universe — ไม่มีราคา/เซกเตอร์จริง
    const price = s && s.price != null ? s.price : null;
    const val = price != null ? h.qty * price : null;
    const c = h.qty * h.cost;
    const pl = val != null ? val - c : null;
    return { h, s, unknown, price, val, c, pl, signal: (s && s.signal) || 'NA', sector: (s && s.sector) || '—' };
  });

  let mv = 0, cost = 0;
  rows.forEach((r) => { mv += r.val ?? 0; cost += r.c; });
  const pl = mv - cost;
  const pct = cost > 0 ? (pl / cost) * 100 : 0;

  setText('mv', baht(mv));
  setText('cost', baht(cost));
  setText('pl', (pl >= 0 ? '+' : '') + baht(pl), pl >= 0 ? 'up' : 'down');
  setText('plpct', (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', pct >= 0 ? 'up' : 'down');

  $('emptyHold').style.display = rows.length ? 'none' : '';
  $('tb').innerHTML = rows.map(({ h, s, unknown, price, val, pl, signal }) => {
    const m = SIGNAL_META[signal] || SIGNAL_META.NA;
    const nameCell = unknown
      ? `<b>${h.sym}</b> <span class="disclaimer" style="color:#fbbf24">⚠️ นอกชุดข้อมูล</span>`
      : `<b>${h.sym}</b> <span class="disclaimer">${s.name || ''}</span>`;
    const onclick = unknown ? '' : `onclick="location.href='detail.html?sym=${h.sym}'" style="cursor:pointer"`;
    const sigCell = unknown ? '<span class="disclaimer">—</span>' : `<span class="chip ${m.cls}">${m.label}</span>`;
    return `<tr>
      <td ${onclick}>${nameCell}</td>
      <td>${h.qty.toLocaleString('th-TH')}</td>
      <td>${fmtNum(h.cost)}</td>
      <td>${price != null ? fmtNum(price) : '—'}</td>
      <td>${val != null ? val.toLocaleString('th-TH', { maximumFractionDigits: 0 }) : '—'}</td>
      <td class="${pl == null ? '' : pl >= 0 ? 'up' : 'down'}">${pl == null ? '—' : (pl >= 0 ? '+' : '') + pl.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
      <td>${sigCell}</td>
      <td><button onclick="editHolding('${h.id}')" title="แก้ไข" style="color:#60a5fa;font-weight:700;padding:2px 8px">✎</button><button onclick="delHolding('${h.id}')" title="ลบ" style="color:#f87171;font-weight:700;padding:2px 8px">✕</button></td>
    </tr>`;
  }).join('');

  renderDonut(rows);
  renderSectors(rows, mv);
}

function renderDonut(rows) {
  const el = $('donut');
  const data = rows.filter((r) => r.val != null).map((r) => ({ name: r.h.sym, value: Math.round(r.val) }));
  if (!donutChart) donutChart = echarts.init(el);
  donutChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    series: [{
      type: 'pie', radius: ['45%', '72%'],
      itemStyle: { borderColor: '#0b0f17', borderWidth: 2 },
      label: { color: '#cbd5e1' },
      data: data.length ? data : [{ name: 'ว่าง', value: 1, itemStyle: { color: '#1f2937' } }],
    }],
    color: ['#10d18e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'],
  });
}

// ---- การกระจายความเสี่ยงรายเซกเตอร์ ----
function renderSectors(rows, mv) {
  const bySector = {};
  rows.forEach((r) => { if (r.val != null) bySector[r.sector] = (bySector[r.sector] || 0) + r.val; });
  const entries = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  if (!entries.length || mv <= 0) { $('sectorBars').innerHTML = '<div class="disclaimer">—</div>'; return; }
  const palette = ['#10d18e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  $('sectorBars').innerHTML = entries.map(([sec, v], i) => {
    const p = (v / mv) * 100;
    const warn = p > 40 ? ' ⚠️' : '';
    return `<div>
      <div class="flex justify-between text-xs mb-0.5"><span>${sec}${warn}</span><span class="muted">${p.toFixed(1)}%</span></div>
      <div style="height:7px;background:#1f2937;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${p.toFixed(1)}%;background:${palette[i % palette.length]}"></div></div>
    </div>`;
  }).join('') + (entries.some(([, v]) => v / mv > 0.4)
    ? '<div class="disclaimer mt-1">⚠️ มีเซกเตอร์เกิน 40% ของพอร์ต — กระจุกตัวสูง</div>' : '');
}

// ---- watchlist ----
function renderWatchlist() {
  const list = STATE.watchlist || [];
  $('emptyWatch').style.display = list.length ? 'none' : '';
  $('wtb').innerHTML = list.map((sym) => {
    const s = getStock(sym);
    if (!s) return `<tr><td><b>${sym}</b></td><td colspan="3" class="disclaimer">ไม่มีข้อมูลในชุดติดตาม</td><td><button onclick="watchDel('${sym}')" style="color:#f87171;padding:2px 8px">✕</button></td></tr>`;
    const m = SIGNAL_META[s.signal] || SIGNAL_META.NA;
    return `<tr>
      <td onclick="location.href='detail.html?sym=${sym}'" style="cursor:pointer"><b>${sym}</b> <span class="disclaimer">${s.name}</span></td>
      <td>${fmtNum(s.price)}</td>
      <td class="${s.chg >= 0 ? 'up' : 'down'}">${(s.chg >= 0 ? '+' : '') + fmtNum(s.chg)}%</td>
      <td><span style="color:${scoreColor(s.comp)};font-weight:700">${s.comp ?? '—'}</span></td>
      <td><span class="chip ${m.cls}">${m.label}</span></td>
      <td><button onclick="watchDel('${sym}')" title="เอาออก" style="color:#f87171;padding:2px 8px">✕</button></td>
    </tr>`;
  }).join('');
}

// ---- actions ----
async function delHolding(id) {
  if (!confirm('ลบรายการนี้?')) return;
  STATE = await apiPost('del_holding', { id });
  renderPortfolio();
}
async function editHolding(id) {
  const h = (STATE.portfolio || []).find((x) => x.id === id);
  if (!h) return;
  const qtyStr = prompt(`จำนวนหุ้น ${h.sym} (เดิม ${h.qty})`, String(h.qty));
  if (qtyStr === null) return;
  const costStr = prompt(`ต้นทุนเฉลี่ย/หุ้น ${h.sym} (เดิม ${h.cost})`, String(h.cost));
  if (costStr === null) return;
  const qty = parseFloat(qtyStr);
  const cost = parseFloat(costStr);
  if (!(qty > 0) || !(cost >= 0)) { alert('⚠️ จำนวนต้อง > 0 และต้นทุน ≥ 0'); return; }
  try {
    STATE = await apiPost('update_holding', { id, qty, cost });
    renderPortfolio();
  } catch (err) { alert('⚠️ ' + err.message); }
}
async function watchDel(sym) {
  STATE = await apiPost('watch_del', { sym });
  renderWatchlist();
}

$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sym = $('f_sym').value.trim().toUpperCase();
  const qty = parseFloat($('f_qty').value);
  const cost = parseFloat($('f_cost').value);
  const opened_at = $('f_date').value || undefined;
  const msg = $('formMsg');
  if (!getStock(sym)) { msg.textContent = '⚠️ ไม่พบสัญลักษณ์หุ้นนี้ในชุดข้อมูล'; msg.style.color = '#f87171'; return; }
  try {
    STATE = await apiPost('add_holding', { sym, qty, cost, opened_at });
    e.target.reset();
    msg.textContent = `✓ เพิ่ม ${sym} แล้ว`; msg.style.color = '#10d18e';
    renderPortfolio();
  } catch (err) {
    msg.textContent = '⚠️ ' + err.message; msg.style.color = '#f87171';
  }
});

// ---- boot ----
Promise.all([READY, apiState()])
  .then(([, state]) => {
    STATE = state;
    fillSymList();
    renderPortfolio();
    renderWatchlist();
    window.addEventListener('resize', () => donutChart && donutChart.resize());
  })
  .catch(showDataError);
