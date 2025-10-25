// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import { callModel } from './dispatcher.js';
import { loadPersona } from './personas.js';
import { loadSeatRegistry, saveSeatPreferences } from './seatRegistry.js';

let seatConfigs = {
  Throne: { model: 'llama3-groq-tool-use:8b', enabled: true, variants: [] }
};
let initializationPromise = null;
let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) {
    initializationPromise = loadSeatRegistry().then((registry) => {
      seatConfigs = registry;
      initialized = true;
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
      model: cfg.model,
      enabled: cfg.enabled !== false,
      variants: Array.isArray(cfg.variants) ? cfg.variants.length : 0
    };
  }
  return result;
}

export function resetSeats(newMap = {}) {
  for (const [name, cfg] of Object.entries(newMap)) {
    if (!seatConfigs[name]) {
      seatConfigs[name] = { model: cfg.model, enabled: cfg.enabled !== false, variants: [] };
    } else {
      if (cfg.model) {
        seatConfigs[name].model = cfg.model;
      }
      if (cfg.enabled !== undefined) {
        seatConfigs[name].enabled = Boolean(cfg.enabled);
      }
    }
  }
  persistSeatPreferences();
}

export function updateSeatModel(name, model) {
  if (!name || !model) return;
  if (!seatConfigs[name]) {
    seatConfigs[name] = { model, enabled: true, variants: [] };
  } else {
    seatConfigs[name].model = model;
  }
  persistSeatPreferences();
  console.log(`[Council] Seat updated: ${name} → ${model}`);
}

export function setSeatEnabled(name, enabled) {
  if (!seatConfigs[name]) {
    seatConfigs[name] = { model: 'llama3.2:3b', enabled: Boolean(enabled), variants: [] };
  } else {
    seatConfigs[name].enabled = Boolean(enabled);
  }
  persistSeatPreferences();
}

export function isSeatEnabled(name) {
  return seatConfigs[name]?.enabled !== false;
}

export async function spawnSeat(role, prompt, { modelOverride, messages, systemPrompt } = {}) {
  await ensureInitialized();
  const config = seatConfigs[role];
  if (!config || config.enabled === false) {
    throw new Error(`Seat ${role} is disabled`);
  }

  const persona = loadPersonaSafe(role);
  const model = modelOverride || config.model || 'llama3.2:3b';
  const systemParts = [systemPrompt || `You are the ${role} of the Council.`];

  if (persona?.tone) {
    systemParts.push(`Persona tone: ${persona.tone}`);
  }
  if (persona?.seed) {
    systemParts.push(`Persona directive: ${persona.seed}`);
  }

  const chat = Array.isArray(messages) && messages.length
    ? messages
    : [
        { role: 'system', content: systemParts.join(' ') },
        { role: 'user', content: prompt || persona?.seed || '' }
      ];

  const result = await callModel({ model, messages: chat });
  return { ...result, persona };
}

function loadPersonaSafe(role) {
  try {
    return loadPersona(role);
  } catch (err) {
    console.warn(`[Persona] ${role} using default persona — ${err.message}`);
    return null;
  }
}

function persistSeatPreferences() {
  void saveSeatPreferences(snapshotConfigs());
}
