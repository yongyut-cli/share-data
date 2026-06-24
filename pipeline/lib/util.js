// pipeline/lib/util.js — helper ทั่วไป (ไม่มี dependency ภายนอก)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** วันที่/เวลาปัจจุบันตามโซน Asia/Bangkok (ICT, UTC+7) แบบ YYYY-MM-DD */
export function todayICT() {
  const now = new Date();
  // เลื่อนเป็นเวลา ICT แล้วตัดเอาเฉพาะวันที่
  const ict = new Date(now.getTime() + 7 * 3600 * 1000);
  return ict.toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

/** เขียน JSON ลงไฟล์ (สร้างโฟลเดอร์ให้อัตโนมัติ) */
export async function writeJSON(path, data, { pretty = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, pretty ? 2 : 0));
}

/** retry แบบ exponential backoff สำหรับงาน network ที่อาจโดน rate-limit */
export async function withRetry(fn, { tries = 4, baseDelay = 800, label = '' } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.quota) throw err; // โควต้า/rate-limit รายวัน — retry ไม่ช่วย ซ้ำยังเปลือง quota ฟรี
      const wait = baseDelay * 2 ** i + Math.floor(Math.random() * 250);
      if (i < tries - 1) {
        console.warn(`  ↻ retry ${i + 1}/${tries - 1} ${label} หลัง ${wait}ms — ${err.message}`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/** รัน task เป็นชุด ๆ (จำกัด concurrency + เว้นจังหวะระหว่างชุด เพื่อกัน rate-limit) */
export async function mapBatched(items, worker, { concurrency = 4, gapMs = 600 } = {}) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((it, j) => worker(it, i + j)));
    results.push(...settled);
    if (i + concurrency < items.length) await sleep(gapMs);
  }
  return results;
}
