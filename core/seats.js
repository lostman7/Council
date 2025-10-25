// core/seats.js
// -------------------------------
// Defines the Council seats, their models, and live update utilities.

let seatConfigs = {
  Physicist: { model: 'llama3.2:3b' },
  Engineer: { model: 'deepscaler:1.5b' },
  Linguist: { model: 'cogito:3b' },
  Thinker: { model: 'qwen:1.8b' },
  Navigator: { model: 'glm-4.6:cloud' }
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
