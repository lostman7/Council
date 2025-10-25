import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const TRACE_FILE = path.join(LOG_DIR, 'trace.log');

function ensureDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export function trace(actor, action, detail = {}) {
  ensureDir();
  const row = { t: new Date().toISOString(), actor, action, ...detail };
  fs.appendFileSync(TRACE_FILE, JSON.stringify(row) + '\n');
}

export function logError(err, context = {}) {
  ensureDir();
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `errors-${day}.jsonl`);
  const payload = {
    t: new Date().toISOString(),
    ...context,
    message: err?.message || String(err),
    code: err?.code || err?.name || null,
    stack: err?.stack || null
  };
  fs.appendFileSync(file, JSON.stringify(payload) + '\n');
}
