// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import { callModel, listOllamaModels } from './dispatcher.js';
import { trace, traceLog } from './trace.js';
import { loadPersona } from './personas.js';
import { loadSeatRegistry, saveSeatPreferences, DEFAULT_MODELS } from './seatRegistry.js';
import { getConfig, saveConfig } from './config.js';

const FALLBACK_MODEL = 'llama3.2:3b';

export const MODEL_RUNTIME = {
  throne: 'cogito:3b',
  allowed: [
    'tinydolphin:1.1b',
    'deepseek-r1:1.5b',
    'qwen2.5-coder:1.5b',
    'qwen2.5-coder:0.5b',
    'qwen3:1.7b',
    'qwen3:0.6b',
    'PhysicsObsession/sequoia-1b:latest',
    'llama3.2:3b'
  ],
  embeddings: ['qwen3-embedding:0.6b', 'mxbai-embed-large:latest'],
  blacklist: [
    'omkarjava0103/gpt-oss-mini:omkar',
    'llama3-groq-tool-use:8b',
    'deepscaler:1.5b',
    'gpt-oss:120b-cloud',
    'glm-4.6:cloud'
  ]
};

const MODEL_BLACKLIST = new Set(MODEL_RUNTIME.blacklist);

const MODEL_POOLS = {
  Physicist: ['deepseek-r1:1.5b', 'qwen3:1.7b', 'llama3.2:3b'],
  Engineer: ['qwen2.5-coder:1.5b', 'qwen2.5-coder:0.5b', 'tinydolphin:1.1b'],
  Linguist: ['qwen3:0.6b', 'llama3.2:3b', 'PhysicsObsession/sequoia-1b:latest'],
  Thinker: ['llama3.2:3b', 'qwen3:1.7b'],
  Navigator: ['PhysicsObsession/sequoia-1b:latest', 'tinydolphin:1.1b', 'qwen3:0.6b'],
  Doctor: ['llama3.2:3b', 'deepseek-r1:1.5b'],
  Surgeon: ['deepseek-r1:1.5b', 'llama3.2:3b'],
  Machinist: ['qwen2.5-coder:1.5b', 'qwen2.5-coder:0.5b', 'tinydolphin:1.1b'],
  Architect: ['qwen3:1.7b', 'llama3.2:3b'],
  Historian: ['qwen3:0.6b', 'llama3.2:3b'],
  Philosopher: ['llama3.2:3b', 'qwen3:1.7b'],
  Artist: ['tinydolphin:1.1b', 'qwen3:1.7b'],
  Diplomat: ['llama3.2:3b', 'qwen3:0.6b'],
  Strategist: ['deepseek-r1:1.5b', 'llama3.2:3b'],
  OpenMind: ['llama3.2:3b', 'PhysicsObsession/sequoia-1b:latest'],
  Throne: ['cogito:3b', 'llama3.2:3b']
};

const POOL_LOOKUP = Object.fromEntries(
  Object.entries(MODEL_POOLS).map(([role, models]) => [role.toLowerCase(), models])
);

let seatConfigs = {
  Throne: {
    model: 'cogito:3b',
    defaultModel: 'cogito:3b',
    enabled: true,
    rotation: true,
    variants: []
  }
};
let initializationPromise = null;
let initialized = false;

async function applyActiveSeatOverrides() {
  const config = await getConfig();
  const activeSeats = config.activeSeats || {};
  let changed = false;
  for (const [name, enabled] of Object.entries(activeSeats)) {
    if (!seatConfigs[name]) continue;
    const flag = Boolean(enabled);
    if (seatConfigs[name].enabled !== flag) {
      seatConfigs[name].enabled = flag;
      changed = true;
    }
  }
  if (changed) {
    traceLog('[Seat] Applied active seat overrides from config');
  }
}

function buildActiveSeatMap() {
  const map = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    map[name] = cfg.enabled !== false;
  }
  return map;
}

async function persistActiveSeatConfig() {
  const activeSeats = buildActiveSeatMap();
  await saveConfig({ activeSeats });
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) {
    initializationPromise = loadSeatRegistry().then(async (registry) => {
      seatConfigs = registry;
      await applyActiveSeatOverrides();
      void persistActiveSeatConfig();
      initialized = true;
      trace('Seats', 'registry.loaded', { count: Object.keys(seatConfigs).length });
      return seatConfigs;
    });
  }
  await initializationPromise;
}

export async function initializeSeatRegistry() {
  await ensureInitialized();
}

function snapshotConfigs() {
  const snapshot = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    snapshot[name] = { ...cfg };
  }
  return snapshot;
}

export function getSeats({ includeDisabled = false } = {}) {
  return Object.entries(seatConfigs)
    .filter(([, cfg]) => includeDisabled || cfg.enabled !== false)
    .map(([name]) => name);
}

export function getSeatConfig(name) {
  return seatConfigs[name];
}

export function getAllSeatConfigs() {
  const result = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    const rotationEnabled = cfg.rotation !== false;
    result[name] = {
      model: resolveDisplayModel(name, cfg),
      enabled: cfg.enabled !== false,
      variants: Array.isArray(cfg.variants) ? cfg.variants.length : 0,
      rotation: rotationEnabled,
      defaultModel: cfg.defaultModel || DEFAULT_MODELS[name] || null
    };
  }
  return result;
}

export function resetSeats(newMap = {}) {
  for (const [name, cfg] of Object.entries(newMap)) {
    if (!seatConfigs[name]) {
      seatConfigs[name] = {
        model: cfg.model ?? null,
        defaultModel: cfg.defaultModel ?? (DEFAULT_MODELS[name] || null),
        enabled: cfg.enabled !== false,
        rotation: cfg.rotation !== false,
        variants: []
      };
    } else {
      if (cfg.model !== undefined) {
        seatConfigs[name].model = cfg.model || null;
      }
      if (cfg.enabled !== undefined) {
        seatConfigs[name].enabled = Boolean(cfg.enabled);
      }
      if (cfg.rotation !== undefined) {
        seatConfigs[name].rotation = Boolean(cfg.rotation);
      }
      if (cfg.defaultModel !== undefined) {
        seatConfigs[name].defaultModel = cfg.defaultModel || seatConfigs[name].defaultModel || null;
      } else if (!seatConfigs[name].defaultModel) {
        seatConfigs[name].defaultModel = DEFAULT_MODELS[name] || null;
      }
    }
  }
  persistSeatPreferences();
  void persistActiveSeatConfig();
}

export function updateSeatModel(name, model) {
  if (!name) return;
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!seatConfigs[name]) {
    seatConfigs[name] = {
      model: trimmed || null,
      defaultModel: DEFAULT_MODELS[name] || null,
      enabled: true,
      rotation: !trimmed,
      variants: []
    };
  } else {
    if (trimmed) {
      seatConfigs[name].model = trimmed;
      seatConfigs[name].rotation = false;
    } else {
      seatConfigs[name].model = null;
      seatConfigs[name].rotation = true;
    }
    if (!seatConfigs[name].defaultModel) {
      seatConfigs[name].defaultModel = DEFAULT_MODELS[name] || seatConfigs[name].defaultModel || null;
    }
    seatConfigs[name].poolIndex = 0;
  }
  persistSeatPreferences();
  void persistActiveSeatConfig();
  trace('Seats', 'update', { seat: name, model: trimmed || null });
  console.log(`[Council] Seat updated: ${name} → ${model}`);
}

export function setSeatEnabled(name, enabled) {
  if (!seatConfigs[name]) {
    seatConfigs[name] = {
      model: null,
      defaultModel: DEFAULT_MODELS[name] || null,
      enabled: Boolean(enabled),
      rotation: true,
      variants: []
    };
  } else {
    seatConfigs[name].enabled = Boolean(enabled);
  }
  persistSeatPreferences();
  void persistActiveSeatConfig();
  trace('Seats', 'enabled', { seat: name, enabled: Boolean(enabled) });
}

export async function unloadSeat(name) {
  trace('Seat', 'unload', { seat: name });
  if (!seatConfigs[name]) return;
  delete seatConfigs[name].lastModel;
}

export async function filterActiveSeats(seatRegistry) {
  const config = await getConfig();
  const desired = config.activeSeats || {};
  const active = {};

  for (const [seat, data] of Object.entries(seatRegistry)) {
    const enabled = desired[seat];
    if (enabled === false) {
      traceLog(`[Seat] ${seat} disabled (🔇)`);
      await unloadSeat(seat);
      continue;
    }
    active[seat] = data;
  }

  return active;
}

export function getAvailableModel(requested) {
  const { allowed, throne } = MODEL_RUNTIME;
  const fallback = allowed[0] || FALLBACK_MODEL;
  if (!requested) {
    return fallback;
  }
  if (MODEL_BLACKLIST.has(requested)) {
    traceLog(`[Blacklist] ${requested} rejected`);
    return fallback;
  }
  if (requested === throne) {
    return requested;
  }
  if (!allowed.includes(requested)) {
    traceLog(`[Fallback] ${requested} not whitelisted, selecting alternate`);
    return fallback;
  }
  return requested;
}

const MODEL_COOLDOWN_MS = 30_000;

export async function seatCycleLoop(seats, iterator) {
  const entries = Object.entries(seats || {});
  for (let index = 0; index < entries.length; index += 1) {
    const [seatName, data] = entries[index];
    const model = getAvailableModel(data?.model || null);
    traceLog(`[Council] Spawning ${seatName} → ${model}`);
    if (typeof iterator === 'function') {
      await iterator(seatName, { ...data, model });
    }
    if (MODEL_COOLDOWN_MS > 0 && index < entries.length - 1) {
      traceLog(`[Cooldown] Waiting ${MODEL_COOLDOWN_MS / 1000}s before next model load`);
      await new Promise((resolve) => setTimeout(resolve, MODEL_COOLDOWN_MS));
    }
  }
  if (entries.length) {
    traceLog('[Cycle] All seats completed rotation.');
  }
}

export function isSeatEnabled(name) {
  return seatConfigs[name]?.enabled !== false;
}

export async function spawnSeat(
  role,
  prompt,
  { modelOverride, messages, systemPrompt, intent } = {}
) {
  await ensureInitialized();
  const config = seatConfigs[role];
  if (!config || config.enabled === false) {
    throw new Error(`Seat ${role} is disabled`);
  }

  const persona = loadPersonaSafe(role);
  let selectedModel = selectModelForSeat(role, config, modelOverride);
  selectedModel = await ensureModelChoice(role, selectedModel);
  if (config) {
    config.lastModel = selectedModel;
  }
  const systemParts = [systemPrompt || `You are the ${role} of the Council.`];

  if (persona?.tone) {
    systemParts.push(`Persona tone: ${persona.tone}`);
  }
  if (persona?.seed) {
    systemParts.push(`Persona directive: ${persona.seed}`);
  }
  if (intent) {
    systemParts.push(`Intent: ${intent}`);
  }

  const chat = Array.isArray(messages) && messages.length
    ? messages
    : [
        { role: 'system', content: systemParts.join(' ') },
        { role: 'user', content: prompt || persona?.seed || '' }
      ];

  trace('Seat', 'spawn', { role, model: selectedModel, intent: intent || null });
  const result = await callModel({ model: selectedModel, messages: chat });
  trace('Seat', 'reply', { role, bytes: result?.text ? result.text.length : 0 });
  return { ...result, persona, model: selectedModel };
}

function loadPersonaSafe(role) {
  try {
    return loadPersona(role);
  } catch (err) {
    const message = err?.message || String(err);
    trace('Persona', 'default', { role, err: message });
    console.warn(`[Persona] ${role} using default persona — ${message}`);
    return null;
  }
}

function persistSeatPreferences() {
  void saveSeatPreferences(snapshotConfigs());
}

function resolveDisplayModel(role, cfg) {
  if (cfg?.rotation === false && cfg?.model) {
    return cfg.model;
  }
  if (cfg?.model) {
    return cfg.model;
  }
  if (cfg?.lastModel) {
    return cfg.lastModel;
  }
  const pool = getModelPool(role);
  if (pool?.length) {
    return pool[0];
  }
  if (cfg?.defaultModel) {
    return cfg.defaultModel;
  }
  return DEFAULT_MODELS[role] || 'llama3.2:3b';
}

function getModelPool(role) {
  if (!role) return null;
  return POOL_LOOKUP[role.toLowerCase()] || null;
}

function takeNextModelFromPool(role, config) {
  const pool = getModelPool(role);
  if (!pool || !pool.length) {
    return null;
  }
  const index = Math.max(0, config?.poolIndex ?? 0) % pool.length;
  const next = pool[index];
  if (config) {
    config.poolIndex = (index + 1) % pool.length;
  }
  return next;
}

function selectModelForSeat(role, config, override) {
  if (override) {
    return override;
  }

  const rotationEnabled = config?.rotation !== false;
  let model = null;

  if (rotationEnabled) {
    model = takeNextModelFromPool(role, config);
  }

  if (!model) {
    const manual = config?.model;
    if (manual && manual.trim()) {
      model = manual.trim();
    }
  }

  if (!model) {
    model =
      takeNextModelFromPool(role, config) ||
      config?.defaultModel ||
      DEFAULT_MODELS[role] ||
      'llama3.2:3b';
  }

  if (config) {
    config.lastModel = model;
  }

  trace('Seat', 'model.select', { role, model });
  console.log(`[COUNCIL] Seat '${role}' assigned model → ${model}`);
  return model;
}

export function pickModelForSeat(role) {
  return takeNextModelFromPool(role, seatConfigs[role] || {});
}

async function ensureModelChoice(role, candidate) {
  let selected = getAvailableModel(candidate || DEFAULT_MODELS[role] || FALLBACK_MODEL);

  try {
    const available = await listOllamaModels();
    if (available.length && !available.includes(selected)) {
      const fallbackCandidate = available.find((model) => !MODEL_BLACKLIST.has(model));
      const fallback = getAvailableModel(fallbackCandidate || FALLBACK_MODEL);
      trace('Seat', 'model.fallback', { role, from: selected, to: fallback });
      console.warn(`[COUNCIL] Seat '${role}' model '${selected}' unavailable → ${fallback}`);
      selected = fallback;
    }
  } catch (err) {
    trace('Seat', 'model.check.error', { role, err: err?.message || String(err) });
  }

  return selected;
}
