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
  seatsMB: 10,
  throneMB: 200
};

export const CONTEXT_WINDOW = {
  throne: 9000,
  seat: 3000
};

async function writeConfigAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  await fs.ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp`);
  await fs.writeJson(tmp, payload, { spaces: 2 });
  await fs.move(tmp, filePath, { overwrite: true });
}

async function handleCorruptConfig(err) {
  const message = err?.message || String(err);
  console.warn('[Council Config] Failed to read ~/.council_config.json:', message);
  try {
    const backupName = `${CONF_PATH}.${Date.now()}.invalid`;
    await fs.move(CONF_PATH, backupName, { overwrite: true });
    console.warn('[Council Config] Corrupt configuration backed up to', backupName);
  } catch (moveErr) {
    console.warn('[Council Config] Unable to isolate corrupt config:', moveErr?.message || moveErr);
  }
}

function parseConfigText(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = raw.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function getConfig() {
  try {
    const raw = await fs.readFile(CONF_PATH, 'utf8');
    const parsed = parseConfigText(raw);
    if (parsed && typeof parsed === 'object') {
      if (raw.trim() !== JSON.stringify(parsed, null, 2)) {
        await writeConfigAtomic(CONF_PATH, { ...DEFAULTS, ...parsed });
      }
      return { ...DEFAULTS, ...parsed };
    }
    throw new SyntaxError('Invalid JSON configuration content');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { ...DEFAULTS };
    }
    if (err?.name === 'SyntaxError' || /Unexpected token|non-whitespace/i.test(err?.message || '')) {
      await handleCorruptConfig(err);
    } else {
      console.warn('[Council Config] Failed to read ~/.council_config.json:', err?.message || err);
    }
    return { ...DEFAULTS };
  }
}

export async function saveConfig(partial) {
  const current = await getConfig();
  const next = { ...DEFAULTS, ...current, ...partial };
  await writeConfigAtomic(CONF_PATH, next);
  return next;
}
