// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import { callModel, listOllamaModels } from './dispatcher.js';
import { trace, traceLog } from './trace.js';
import { loadPersona } from './personas.js';
import { loadSeatRegistry, saveSeatPreferences, DEFAULT_MODELS } from './seatRegistry.js';
import { getConfig, saveConfig } from './config.js';
import { cooldown, loadVectorConfig } from './vectorOps.js';

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
    'llama3.2:3b',
    'cogito:3b'
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

let seatConfigs = {
  Throne: {
    model: 'cogito:3b',
    defaultModel: 'cogito:3b',
    enabled: true,
    variants: []
  }
};
let initializationPromise = null;
let initialized = false;

async function applyActiveSeatOverrides() {
  const config = await getConfig();
  const activeSeats = config.activeSeats || {};
  const configuredModels = config.models || {};
  let changed = false;

  for (const [name, cfg] of Object.entries(seatConfigs)) {
    const enabled = Object.prototype.hasOwnProperty.call(activeSeats, name)
      ? Boolean(activeSeats[name])
      : cfg.enabled !== false;
    if (cfg.enabled !== enabled) {
      cfg.enabled = enabled;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(configuredModels, name)) {
      const modelValue = configuredModels[name];
      const nextModel = typeof modelValue === 'string' && modelValue.trim() ? modelValue.trim() : null;
      if (cfg.model !== nextModel) {
        cfg.model = nextModel;
        changed = true;
      }
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

function buildModelMap() {
  const map = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    if (cfg?.model) {
      map[name] = cfg.model;
    }
  }
  return map;
}

async function persistConfigState() {
  const activeSeats = buildActiveSeatMap();
  const models = buildModelMap();
  await saveConfig({ activeSeats, models });
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) {
    initializationPromise = loadSeatRegistry().then(async (registry) => {
      seatConfigs = registry;
      await applyActiveSeatOverrides();
      void persistConfigState();
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
    result[name] = {
      model: resolveDisplayModel(name, cfg),
      enabled: cfg.enabled !== false,
      variants: Array.isArray(cfg.variants) ? cfg.variants.length : 0,
      defaultModel: cfg.defaultModel || DEFAULT_MODELS[name] || null,
      allowedModels: getAllowedModels()
    };
  }
  return result;
}

export function getAllowedModels() {
  const list = Array.isArray(MODEL_RUNTIME.allowed) ? MODEL_RUNTIME.allowed : [];
  return Array.from(new Set(list.filter((model) => !MODEL_BLACKLIST.has(model))));
}

export function resetSeats(newMap = {}) {
  for (const [name, cfg] of Object.entries(newMap)) {
    if (!seatConfigs[name]) {
      seatConfigs[name] = {
        model: cfg.model ?? null,
        defaultModel: cfg.defaultModel ?? (DEFAULT_MODELS[name] || null),
        enabled: cfg.enabled !== false,
        variants: Array.isArray(cfg.variants) ? cfg.variants : []
      };
    } else {
      if (cfg.model !== undefined) {
        seatConfigs[name].model = cfg.model || null;
      }
      if (cfg.enabled !== undefined) {
        seatConfigs[name].enabled = Boolean(cfg.enabled);
      }
      if (cfg.defaultModel !== undefined) {
        seatConfigs[name].defaultModel = cfg.defaultModel || seatConfigs[name].defaultModel || null;
      }
      if (!seatConfigs[name].defaultModel) {
        seatConfigs[name].defaultModel = DEFAULT_MODELS[name] || null;
      }
      if (Array.isArray(cfg.variants)) {
        seatConfigs[name].variants = [...cfg.variants];
      }
    }
  }
  persistSeatPreferences();
  void persistConfigState();
}

export function updateSeatModel(name, model) {
  if (!name) return;
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!seatConfigs[name]) {
    seatConfigs[name] = {
      model: trimmed || null,
      defaultModel: DEFAULT_MODELS[name] || null,
      enabled: true,
      variants: []
    };
  } else {
    seatConfigs[name].model = trimmed || null;
    if (!seatConfigs[name].defaultModel) {
      seatConfigs[name].defaultModel = DEFAULT_MODELS[name] || seatConfigs[name].defaultModel || null;
    }
  }
  persistSeatPreferences();
  void persistConfigState();
  trace('Seats', 'update', { seat: name, model: trimmed || null });
  console.log(`[Council] Seat updated: ${name} → ${model}`);
}

export function setSeatEnabled(name, enabled) {
  if (!seatConfigs[name]) {
    seatConfigs[name] = {
      model: null,
      defaultModel: DEFAULT_MODELS[name] || null,
      enabled: Boolean(enabled),
      variants: []
    };
  } else {
    seatConfigs[name].enabled = Boolean(enabled);
  }
  persistSeatPreferences();
  void persistConfigState();
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
    const enabled = Object.prototype.hasOwnProperty.call(desired, seat)
      ? desired[seat]
      : data?.enabled !== false;
    if (!enabled) {
      traceLog(`[Seat] ${seat} disabled (🔇)`);
      await unloadSeat(seat);
      continue;
    }
    active[seat] = data;
  }

  return active;
}

export function getAvailableModel(requested) {
  const fallbackPool = getAllowedModels();
  const throne = MODEL_RUNTIME.throne;
  if (!fallbackPool.length) {
    fallbackPool.push(FALLBACK_MODEL);
  }

  const chooseFallback = () => fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

  if (!requested) {
    return chooseFallback();
  }
  if (MODEL_BLACKLIST.has(requested)) {
    traceLog(`[Blacklist] ${requested} rejected`);
    return chooseFallback();
  }
  if (requested === throne) {
    return requested;
  }
  if (!fallbackPool.includes(requested)) {
    traceLog(`[Fallback] ${requested} not whitelisted, selecting alternate`);
    return chooseFallback();
  }
  return requested;
}

export async function seatCycleLoop(seats, iterator) {
  const entries = Object.entries(seats || {});
  const vectorConfig = await loadVectorConfig().catch(() => null);
  const configuredCooldownSeconds = Number(vectorConfig?.cooldownDelay);
  const cooldownMs = Number.isFinite(configuredCooldownSeconds)
    ? Math.max(0, configuredCooldownSeconds * 1000)
    : 30_000;

  for (let index = 0; index < entries.length; index += 1) {
    const [seatName, data] = entries[index];
    const model = getAvailableModel(data?.model || null);
    traceLog(`[Council] Spawning ${seatName} → ${model}`);
    if (typeof iterator === 'function') {
      await iterator(seatName, { ...data, model });
    } else {
      await spawnSeat(seatName, data?.prompt || '', { modelOverride: model });
    }
    if (cooldownMs > 0 && index < entries.length - 1) {
      await cooldown(cooldownMs);
    }
  }
  if (entries.length) {
    traceLog('[Cycle] All seats completed cycle.');
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
  const baseModel =
    modelOverride ||
    config?.model ||
    config?.defaultModel ||
    DEFAULT_MODELS[role] ||
    FALLBACK_MODEL;
  const selectedModel = await ensureModelChoice(role, baseModel);
  if (config) {
    config.lastModel = selectedModel;
  }
  trace('Seat', 'model.select', { role, model: selectedModel, override: Boolean(modelOverride) });
  console.log(`[COUNCIL] Seat '${role}' assigned model → ${selectedModel}`);
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
  if (cfg?.model) {
    return cfg.model;
  }
  if (cfg?.lastModel) {
    return cfg.lastModel;
  }
  if (cfg?.defaultModel) {
    return cfg.defaultModel;
  }
  if (DEFAULT_MODELS[role]) {
    return DEFAULT_MODELS[role];
  }
  return MODEL_RUNTIME.allowed[0] || FALLBACK_MODEL;
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
