// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

import { callModel } from './dispatcher.js';
import { loadPersona } from './personas.js';

let seatConfigs = {
  Physicist: { model: 'llama3.2:3b' },
  Engineer: { model: 'deepscaler:1.5b' },
  Linguist: { model: 'cogito:3b' },
  Thinker: { model: 'qwen:1.8b' },
  Navigator: { model: 'glm-4.6:cloud' },
  Throne: { model: 'llama3-groq-tool-use:8b' }
};

export function getSeats() {
  return Object.keys(seatConfigs);
}

export function getSeatConfig(name) {
  return seatConfigs[name] || {};
}

export function updateSeatModel(name, model) {
  if (!name || !model) return;
  if (!seatConfigs[name]) {
    seatConfigs[name] = {};
  }
  seatConfigs[name].model = model;
  console.log(`[Council] Seat updated: ${name} → ${model}`);
}

export function getAllSeatConfigs() {
  const snapshot = {};
  for (const [name, cfg] of Object.entries(seatConfigs)) {
    snapshot[name] = { ...cfg };
  }
  return snapshot;
}

export function resetSeats(newMap) {
  seatConfigs = newMap;
}

export async function spawnSeat(role, prompt, { modelOverride, messages, systemPrompt } = {}) {
  const persona = loadPersonaSafe(role);
  const config = getSeatConfig(role) || {};
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
