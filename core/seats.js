// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import fs from 'fs-extra';
import path from 'path';
import { callModel, listOllamaModels } from './dispatcher.js';
import { trace } from './trace.js';
import { loadPersona } from './personas.js';
import { loadSeatRegistry, saveSeatPreferences, DEFAULT_MODELS } from './seatRegistry.js';

const FALLBACK_MODEL = 'llama3.2:3b';

const MODEL_POOLS = {
  Physicist: ['deepseek-r1:1.5b', 'sequoia-1b', 'qwen3:1.7b'],
  Engineer: ['qwen2.5-coder:1.5b', 'qwen2.5-coder:0.5b', 'tinydolphin:1.1b'],
  Linguist: ['cogito:3b', 'gpt-oss-mini:2.0b', 'qwen3:0.6b'],
  Thinker: ['llama3.2:3b', 'cogito:3b'],
  Navigator: ['tinydolphin:1.1b', 'deepseek-r1:1.5b', 'qwen3:1.7b'],
  Doctor: ['llama3.2:3b', 'deepseek-r1:1.5b', 'qwen3:1.7b'],
  Surgeon: ['llama3.2:3b', 'glm-4.6:cloud', 'qwen3:1.7b'],
  Machinist: ['qwen2.5-coder:1.5b', 'tinydolphin:1.1b', 'deepseek-r1:1.5b'],
  Architect: ['glm-4.6:cloud', 'llama3.2:3b', 'qwen3:1.7b'],
  Historian: ['qwen3-embedding:0.6b', 'llama3.2:3b', 'deepseek-r1:1.5b'],
  Philosopher: ['glm-4.6:cloud', 'llama3.2:3b', 'qwen3:1.7b'],
  Artist: ['cogito:3b', 'llama3.2:3b', 'qwen3:1.7b'],
  Diplomat: ['deepscaler:1.5b', 'glm-4.6:cloud', 'qwen3:1.7b'],
  Strategist: ['deepscaler:1.5b', 'llama3.2:3b', 'qwen3:1.7b'],
  OpenMind: ['llama3.2:3b', 'deepseek-r1:1.5b', 'cogito:3b'],
  Throne: ['llama3-groq-tool-use:8b']
};

const POOL_LOOKUP = Object.fromEntries(
  Object.entries(MODEL_POOLS).map(([role, models]) => [role.toLowerCase(), models])
);

let seatConfigs = {
  Throne: {
    model: 'llama3-groq-tool-use:8b',
    defaultModel: 'llama3-groq-tool-use:8b',
    enabled: true,
    rotation: true,
    variants: []
  }
};
let initializationPromise = null;
let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) {
    initializationPromise = loadSeatRegistry().then((registry) => {
      seatConfigs = registry;
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
  trace('Seats', 'enabled', { seat: name, enabled: Boolean(enabled) });
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
  let selected = candidate || DEFAULT_MODELS[role] || FALLBACK_MODEL;

  try {
    const available = await listOllamaModels();
    if (available.length && !available.includes(selected)) {
      const fallback = available.includes(FALLBACK_MODEL)
        ? FALLBACK_MODEL
        : available[0] || FALLBACK_MODEL;
      trace('Seat', 'model.fallback', { role, from: selected, to: fallback });
      console.warn(`[COUNCIL] Seat '${role}' model '${selected}' unavailable → ${fallback}`);
      selected = fallback;
    }
  } catch (err) {
    trace('Seat', 'model.check.error', { role, err: err?.message || String(err) });
  }

  return selected;
}
