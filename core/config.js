import fs from 'fs-extra';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'config');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

export const MEMORY_ALLOCATION = {
  seatsMB: 30,
  throneMB: 200
};

export const CONTEXT_WINDOW = {
  throne: 9000,
  seat: 3000
};

async function ensureConfigDir() {
  await fs.ensureDir(CONFIG_DIR);
}

export async function getConfig() {
  await ensureConfigDir();
  try {
    const data = await fs.readJson(STATE_FILE);
    return data || {};
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[Council Config] Failed to read state.json:', err.message || err);
    }
    return {};
  }
}

export async function saveConfig(partial) {
  const current = await getConfig();
  const next = { ...current, ...partial };
  await ensureConfigDir();
  await fs.writeJson(STATE_FILE, next, { spaces: 2 });
  return next;
}
