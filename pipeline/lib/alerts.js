// pipeline/lib/alerts.js — แจ้งเตือน (Phase 3 / FR-ALERT)
//   ช่องทาง: Telegram (ตั้งค่าด้วย env TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
//   ทริกเกอร์: สรุปตลาดรายวัน + รายการ "สัญญาณเปลี่ยน" (เข้า BUY / เปลี่ยนเป็นฝั่งขาย)
//   degrade อย่างซื่อสัตย์: ไม่มี token → ข้ามเงียบ ไม่ทำให้ pipeline ล้ม
//
// หมายเหตุ: pipeline รันบน GitHub Actions ซึ่งไม่มีไฟล์พอร์ต/watchlist ของผู้ใช้
//           จึงเป็นการแจ้งเตือน "ภาพรวมทั้ง universe" — ทริกเกอร์ stop/target รายตำแหน่ง
//           เป็นงานฝั่งเว็บในอนาคต

export function hasTelegram() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// จัดกลุ่มสัญญาณเป็นฝั่ง เพื่อดูว่า "เปลี่ยนทิศ" จริงไหม
const SIDE = {
  BUY: 'ซื้อ', ACCUMULATE: 'ซื้อ',
  HOLD: 'ถือ', NA: 'ถือ',
  REDUCE: 'ขาย', SELL: 'ขาย', AVOID: 'ขาย',
};
const LABEL = {
  BUY: 'ซื้อ', ACCUMULATE: 'ทยอยสะสม', HOLD: 'ถือ',
  REDUCE: 'ลดพอร์ต', SELL: 'ขาย', AVOID: 'เลี่ยง', NA: 'ข้อมูลไม่พอ',
};

/**
 * เทียบ summary เก่า ↔ ใหม่ คืนรายการที่ "สัญญาณเปลี่ยนฝั่ง"
 * prevStocks/newStocks = array ของ { symbol, name_th, signal, price, composite }
 */
export function diffSignals(prevStocks = [], newStocks = []) {
  const prev = Object.fromEntries(prevStocks.map((s) => [s.symbol, s.signal]));
  const changes = [];
  for (const s of newStocks) {
    const from = prev[s.symbol];
    const to = s.signal;
    if (!from || !to || from === to) continue;
    if (SIDE[from] === SIDE[to]) continue; // เปลี่ยนระดับในฝั่งเดิม — ข้าม (ลด noise)
    changes.push({
      symbol: s.symbol,
      name: s.name_th,
      from, to,
      side: SIDE[to],
      price: s.price,
      composite: s.composite,
    });
  }
  // เรียง: เข้าฝั่งซื้อก่อน แล้วฝั่งขาย, ในกลุ่มเรียงตามคะแนน
  const rank = { ซื้อ: 0, ขาย: 1, ถือ: 2 };
  changes.sort((a, b) => (rank[a.side] - rank[b.side]) || ((b.composite ?? 0) - (a.composite ?? 0)));
  return changes;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * ประกอบข้อความแจ้งเตือนรายวัน (Telegram HTML)
 */
export function buildDailyMessage({ date, market = {}, stocks = [], changes = [] }) {
  const L = [];
  const idx = market.set_index;
  const arrow = idx ? (idx.chg >= 0 ? '🟢▲' : '🔴▼') : '';
  L.push(`📊 <b>Thai Stock Analyzer</b> — สรุป EOD ${esc(date)}`);
  if (idx) L.push(`SET ${idx.value} ${arrow} ${idx.chg >= 0 ? '+' : ''}${idx.chg}%`);
  L.push(`บวก ${market.advancers ?? '—'} · ลบ ${market.decliners ?? '—'} · BUY ${market.buy_signals ?? '—'} · ถือยาว ${market.long_term_picks ?? '—'} ตัว`);

  // สัญญาณเปลี่ยนฝั่ง
  if (changes.length) {
    L.push('');
    L.push(`🔔 <b>สัญญาณเปลี่ยน (${changes.length})</b>`);
    for (const c of changes.slice(0, 20)) {
      const ic = c.side === 'ซื้อ' ? '🟢' : c.side === 'ขาย' ? '🔴' : '⚪';
      L.push(`${ic} <b>${esc(c.symbol)}</b> ${esc(LABEL[c.from])}→<b>${esc(LABEL[c.to])}</b> @ ${c.price} (รวม ${c.composite ?? '—'})`);
    }
    if (changes.length > 20) L.push(`…และอีก ${changes.length - 20} ตัว`);
  } else {
    L.push('');
    L.push('🔕 ไม่มีสัญญาณเปลี่ยนฝั่งวันนี้');
  }

  // Top BUY วันนี้ (ตามคะแนนรวม)
  const buys = stocks
    .filter((s) => s.signal === 'BUY' || s.signal === 'ACCUMULATE')
    .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0))
    .slice(0, 5);
  if (buys.length) {
    L.push('');
    L.push('🎯 <b>Top สัญญาณซื้อ</b>');
    for (const s of buys) L.push(`• <b>${esc(s.symbol)}</b> รวม ${s.composite ?? '—'}${s.longTerm ? ' 🌱' : ''} @ ${s.price}`);
  }

  L.push('');
  L.push('<i>⚠️ ไม่ใช่คำแนะนำการลงทุน · ระบบส่วนตัว</i>');
  return L.join('\n');
}

/**
 * ส่งข้อความไป Telegram (แบ่งหลายข้อความถ้ายาวเกิน 4096)
 * คืน { ok, parts } · โยน error ถ้า API ตอบไม่สำเร็จ (ให้ผู้เรียก catch)
 */
export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('ไม่มี TELEGRAM_BOT_TOKEN/CHAT_ID');

  const chunks = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if ((buf + '\n' + line).length > 3900) { chunks.push(buf); buf = line; }
    else buf = buf ? buf + '\n' + line : line;
  }
  if (buf) chunks.push(buf);

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }
  return { ok: true, parts: chunks.length };
}

/**
 * orchestrator — เรียกจาก run.js หลังเขียน summary
 * dry=true → คืนข้อความเฉย ๆ ไม่ส่งจริง (สำหรับทดสอบ)
 */
export async function runAlerts({ date, market, stocks, prevStocks = [], dry = false }) {
  const changes = diffSignals(prevStocks, stocks);
  const text = buildDailyMessage({ date, market, stocks, changes });
  if (dry) return { sent: false, dry: true, changes: changes.length, text };
  if (!hasTelegram()) return { sent: false, reason: 'no_token', changes: changes.length };
  const r = await sendTelegram(text);
  return { sent: true, parts: r.parts, changes: changes.length };
}
