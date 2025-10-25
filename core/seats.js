// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import { callModel, listOllamaModels } from './dispatcher.js';
import { trace, traceLog } from './trace.js';
import { loadPersona } from './personas.js';
import { loadSeatRegistry, saveSeatPreferences, DEFAULT_MODELS } from './seatRegistry.js';
import { getConfig, saveConfig } from './config.js';
import { cooldown, loadVectorConfig, Thinker as ThinkerLock } from './vectorOps.js';

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
const THINKER_ROLE = 'Thinker';

function getEmbeddingPool() {
  const pool = Array.isArray(MODEL_RUNTIME.embeddings)
    ? MODEL_RUNTIME.embeddings.filter(Boolean)
    : [];
  if (pool.length) {
    return [...new Set(pool)];
  }
  return ['qwen3-embedding:0.6b', 'mxbai-embed-large:latest'];
}

function sanitisePool(pool) {
  return Array.from(
    new Set(
      (Array.isArray(pool) ? pool : [])
        .filter(Boolean)
        .filter((model) => !MODEL_BLACKLIST.has(model))
    )
  );
}

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
      let nextModel = typeof modelValue === 'string' && modelValue.trim() ? modelValue.trim() : null;
      if (nextModel) {
        const allowed = getAllowedModels(name);
        if (allowed.length && !allowed.includes(nextModel)) {
          const fallback = allowed[0] || null;
          traceLog(`[Seat] ${name} stored model ${nextModel} not permitted, using ${fallback ?? 'auto'}`);
          nextModel = fallback;
        }
        if (name === THINKER_ROLE && nextModel && !getEmbeddingPool().includes(nextModel)) {
          const fallback = getEmbeddingPool()[0] || null;
          traceLog(`[Seat] Thinker stored model coerced to ${fallback ?? 'auto'}`);
          nextModel = fallback;
        }
      }
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
      allowedModels: getAllowedModels(name)
    };
  }
  return result;
}

export function getAllowedModels(role) {
  if (role === THINKER_ROLE) {
    const embeddings = sanitisePool(getEmbeddingPool());
    return embeddings.length ? embeddings : getEmbeddingPool();
  }

  const allowed = sanitisePool(MODEL_RUNTIME.allowed);
  if (allowed.length) {
    return allowed;
  }

  const embeddings = sanitisePool(getEmbeddingPool());
  if (embeddings.length) {
    return embeddings;
  }

  return [FALLBACK_MODEL];
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
  const allowed = getAllowedModels(name);
  let nextModel = trimmed;

  if (trimmed && allowed.length && !allowed.includes(trimmed)) {
    const fallback = allowed[0] || '';
    traceLog(`[Seat] ${name} model ${trimmed} not permitted, using ${fallback || 'auto'}`);
    nextModel = fallback;
  }

  if (name === THINKER_ROLE && nextModel && !getEmbeddingPool().includes(nextModel)) {
    const fallback = getEmbeddingPool()[0] || '';
    traceLog(`[Seat] Thinker forced to embedding model ${fallback || 'auto'}`);
    nextModel = fallback;
  }

  const resolved = nextModel || null;
  if (!seatConfigs[name]) {
    seatConfigs[name] = {
      model: resolved,
      defaultModel: DEFAULT_MODELS[name] || null,
      enabled: true,
      variants: []
    };
  } else {
    seatConfigs[name].model = resolved;
    if (!seatConfigs[name].defaultModel) {
      seatConfigs[name].defaultModel = DEFAULT_MODELS[name] || seatConfigs[name].defaultModel || null;
    }
  }
  persistSeatPreferences();
  void persistConfigState();
  trace('Seats', 'update', { seat: name, model: resolved });
  console.log(`[Council] Seat updated: ${name} → ${resolved ?? 'auto'}`);
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

export function getAvailableModel(requested, role) {
  const isThinker = role === THINKER_ROLE;
  const allowedPool = getAllowedModels(isThinker ? THINKER_ROLE : role);
  const pool = allowedPool.length ? [...allowedPool] : [];
  const defaultEmbedding = getEmbeddingPool()[0];
  const chooseFallback = () => {
    if (pool.length) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (isThinker) {
      return defaultEmbedding || 'qwen3-embedding:0.6b';
    }
    if (role === 'Throne' && MODEL_RUNTIME.throne) {
      return MODEL_RUNTIME.throne;
    }
    return FALLBACK_MODEL;
  };

  if (!requested) {
    return chooseFallback();
  }

  if (MODEL_BLACKLIST.has(requested)) {
    traceLog(`[Blacklist] ${requested} rejected`);
    return chooseFallback();
  }

  if (isThinker) {
    const embeddings = getEmbeddingPool();
    if (!embeddings.includes(requested)) {
      traceLog(`[Fallback] Thinker model ${requested} is not an embedding, selecting alternate`);
      return chooseFallback();
    }
    return requested;
  }

  if (role === 'Throne' && requested === MODEL_RUNTIME.throne) {
    return requested;
  }

  if (!pool.includes(requested)) {
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
    const model = getAvailableModel(data?.model || null, seatName);
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
  const isThinker = role === THINKER_ROLE;
  trace('Seat', 'model.select', { role, model: selectedModel, override: Boolean(modelOverride) });
  console.log(`[COUNCIL] Seat '${role}' assigned model → ${selectedModel}`);

  if (isThinker) {
    trace('Seat', 'spawn', { role, model: selectedModel, intent: intent || null, mode: 'embedding' });
    if (ThinkerLock) {
      ThinkerLock.model = selectedModel;
    }

    let text = '';
    try {
      await ThinkerLock?.run?.(prompt || persona?.seed || '');
    } catch (err) {
      const message = err?.message || String(err);
      trace('Seat', 'thinker.embed.error', { role, err: message });
      console.warn(`[Thinker] Embedding error: ${message}`);
    }

    try {
      const recall = await ThinkerLock?.recall?.(prompt || persona?.seed || '');
      text = recall || '(no embeddings found)';
    } catch (err) {
      const message = err?.message || String(err);
      trace('Seat', 'thinker.recall.error', { role, err: message });
      console.warn(`[Thinker] Recall error: ${message}`);
      text = text || '(embedding recall unavailable)';
    }

    if (!text) {
      text = '(no embeddings found)';
    }

    trace('Seat', 'reply', { role, bytes: text.length });
    return { text, persona, model: selectedModel };
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
  const allowed = getAllowedModels(role);
  if (allowed.length) {
    return allowed[0];
  }
  return role === THINKER_ROLE ? getEmbeddingPool()[0] || 'qwen3-embedding:0.6b' : FALLBACK_MODEL;
}

async function ensureModelChoice(role, candidate) {
  let selected = getAvailableModel(candidate || DEFAULT_MODELS[role] || FALLBACK_MODEL, role);

  try {
    const available = await listOllamaModels();
    if (available.length && !available.includes(selected)) {
      const fallbackCandidate = available.find((model) => !MODEL_BLACKLIST.has(model));
      const fallback = getAvailableModel(fallbackCandidate || FALLBACK_MODEL, role);
      trace('Seat', 'model.fallback', { role, from: selected, to: fallback });
      console.warn(`[COUNCIL] Seat '${role}' model '${selected}' unavailable → ${fallback}`);
      selected = fallback;
    }
  } catch (err) {
    trace('Seat', 'model.check.error', { role, err: err?.message || String(err) });
  }

  return selected;
}
