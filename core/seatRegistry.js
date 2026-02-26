import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const PERSONA_DIR = path.join(process.cwd(), 'personas');
const CONFIG_PATH = path.join(os.homedir(), '.council_config.json');
const DEFAULT_DISABLED = new Set(['Artist', 'Doctor', 'Surgeon', 'Historian']);
export const DEFAULT_MODELS = {
  Physicist: 'deepseek-r1:1.5b',
  Engineer: 'qwen2.5-coder:1.5b',
  Linguist: 'qwen3:0.6b',
  Thinker: 'qwen3-embedding:0.6b',
  Navigator: 'PhysicsObsession/sequoia-1b:latest',
  Doctor: 'llama3.2:3b',
  Surgeon: 'deepseek-r1:1.5b',
  Machinist: 'qwen2.5-coder:0.5b',
  Architect: 'qwen3:1.7b',
  Historian: 'qwen3:0.6b',
  Philosopher: 'llama3.2:3b',
  Artist: 'tinydolphin:1.1b',
  Diplomat: 'llama3.2:3b',
  Strategist: 'deepseek-r1:1.5b',
  OpenMind: 'llama3.2:3b',
  Throne: 'cogito:3b'
};

function parseConfigText(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function readConfigFile() {
  try {
    const exists = await fs.pathExists(CONFIG_PATH);
    if (!exists) {
      return {};
    }
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = parseConfigText(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    throw new SyntaxError('Invalid JSON configuration content');
  } catch (err) {
    console.warn('[Council Registry] Failed to read config, using defaults:', err.message);
    if (err?.name === 'SyntaxError' || /Unexpected token|non-whitespace/i.test(err?.message || '')) {
      try {
        const backup = `${CONFIG_PATH}.${Date.now()}.invalid`;
        await fs.move(CONFIG_PATH, backup, { overwrite: true });
        console.warn('[Council Registry] Corrupt config moved to', backup);
      } catch (moveErr) {
        console.warn('[Council Registry] Unable to move corrupt config:', moveErr?.message || moveErr);
      }
    }
    return {};
  }
}

async function writeConfigFile(nextConfig) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    await fs.ensureDir(dir);
    const tmp = path.join(dir, `.${path.basename(CONFIG_PATH)}.tmp`);
    await fs.writeJson(tmp, nextConfig, { spaces: 2 });
    await fs.move(tmp, CONFIG_PATH, { overwrite: true });
  } catch (err) {
    console.error('[Council Registry] Failed to write config:', err);
  }
}

function countVariants(map) {
  return Object.values(map).reduce((total, entry) => total + (entry.variants?.length || 0), 0);
}

export async function loadSeatRegistry() {
  await fs.ensureDir(PERSONA_DIR);
  const personaFiles = (await fs.readdir(PERSONA_DIR)).filter((file) => file.endsWith('.json'));
  const preferences = await readConfigFile();
  const savedSeats = preferences.seats || {};
  const registry = {};

  for (const file of personaFiles) {
    const role = path.basename(file, '.json');
    try {
      const payload = await fs.readJson(path.join(PERSONA_DIR, file));
      const variants = Array.isArray(payload) ? payload : [];
      const saved = savedSeats[role] || {};
      const defaultModel = DEFAULT_MODELS[role] || null;
      const manualModel = typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim() : null;
      const defaultEnabled = DEFAULT_DISABLED.has(role) ? false : true;
      const enabled = saved.enabled !== undefined ? Boolean(saved.enabled) : defaultEnabled;
      registry[role] = {
        model: manualModel,
        defaultModel,
        enabled,
        variants
      };
    } catch (err) {
      console.error(`[Council Registry] Failed parsing persona file ${file}:`, err);
    }
  }

  // ensure Throne exists even if no persona file
  if (!registry.Throne) {
    registry.Throne = {
      model: null,
      defaultModel: DEFAULT_MODELS.Throne,
      enabled: true,
      variants: []
    };
  }

  const groupCount = Object.keys(registry).length;
  const variantCount = countVariants(registry);
  console.log(`[Council Registry] Loaded ${groupCount} persona groups, ${variantCount} total variants.`);

  return registry;
}

export async function saveSeatPreferences(seatConfigs) {
  const existing = await readConfigFile();
  const serialisable = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    serialisable[name] = {
      model: cfg.model || null,
      enabled: cfg.enabled !== false
    };
  }
  const next = { ...existing, seats: serialisable };
  await writeConfigFile(next);
}
