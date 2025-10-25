import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const CONF_PATH = path.join(os.homedir(), '.council_config.json');

const DEFAULTS = {
  thinkerEmbedModel: 'qwen3-embedding:0.6b',
  embedTimeoutMs: 120000,
  embedRetryDelayMs: 4000,
  embedMaxRetries: 2
};

export const MEMORY_ALLOCATION = {
  seatsMB: 30,
  throneMB: 200
};

export const CONTEXT_WINDOW = {
  throne: 9000,
  seat: 3000
};

export async function getConfig() {
  try {
    const data = await fs.readJson(CONF_PATH);
    return { ...DEFAULTS, ...(data || {}) };
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[Council Config] Failed to read ~/.council_config.json:', err.message || err);
    }
    return { ...DEFAULTS };
  }
}

export async function saveConfig(partial) {
  const current = await getConfig();
  const next = { ...DEFAULTS, ...current, ...partial };
  await fs.ensureDir(path.dirname(CONF_PATH));
  await fs.writeJson(CONF_PATH, next, { spaces: 2 });
  return next;
}
