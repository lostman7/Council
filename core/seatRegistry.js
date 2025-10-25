import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const PERSONA_DIR = path.join(process.cwd(), 'personas');
const CONFIG_PATH = path.join(os.homedir(), '.council_config.json');
export const DEFAULT_MODELS = {
  Physicist: 'deepseek-r1:1.5b',
  Engineer: 'qwen2.5-coder:1.5b',
  Linguist: 'qwen3:0.6b',
  Thinker: 'llama3.2:3b',
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

async function readConfigFile() {
  try {
    const exists = await fs.pathExists(CONFIG_PATH);
    if (!exists) {
      return {};
    }
    const raw = await fs.readJson(CONFIG_PATH);
    return raw || {};
  } catch (err) {
    console.warn('[Council Registry] Failed to read config, using defaults:', err.message);
    return {};
  }
}

async function writeConfigFile(nextConfig) {
  try {
    await fs.outputJson(CONFIG_PATH, nextConfig, { spaces: 2 });
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
      const manualOverride = manualModel && (!defaultModel || manualModel !== defaultModel);
      const rotationEnabled = saved.rotation !== undefined ? Boolean(saved.rotation) : !manualOverride;
      registry[role] = {
        model: manualOverride ? manualModel : null,
        defaultModel,
        rotation: rotationEnabled,
        enabled: saved.enabled !== undefined ? Boolean(saved.enabled) : true,
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
      rotation: true,
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
      enabled: cfg.enabled !== false,
      rotation: cfg.rotation !== false
    };
  }
  const next = { ...existing, seats: serialisable };
  await writeConfigFile(next);
}
