import { refreshPool } from './pool.js';

const seatRegistry = {
  Throne: { model: 'llama3-groq-tool-use:8b', role: 'Throne' },
  Physicist: { model: 'llama3.2:3b', role: 'Physicist' },
  Engineer: { model: 'cogito:3b', role: 'Engineer' },
  Linguist: { model: 'qwen3:0.6b', role: 'Linguist' },
  Philosopher: { model: 'glm-4.6:cloud', role: 'Philosopher' },
  Navigator: { model: 'mxbai-embed-large:latest', role: 'Navigator' },
  Historian: { model: 'qwen3-embedding:0.6b', role: 'Historian' },
  Strategist: { model: 'deepscaler:1.5b', role: 'Strategist' }
};

export function getSeats() {
  return Object.keys(seatRegistry);
}

export function getSeatConfig(name) {
  return seatRegistry[name] ? { ...seatRegistry[name] } : undefined;
}

export function getSeatMap() {
  const map = {};
  for (const name of Object.keys(seatRegistry)) {
    map[name] = { ...seatRegistry[name] };
  }
  return map;
}

export function updateSeatModel(name, model) {
  if (!name || !model) return false;
  if (!seatRegistry[name]) return false;
  seatRegistry[name] = { ...seatRegistry[name], model };
  return true;
}

export async function refreshSeatPool() {
  await refreshPool(true);
  return getSeatMap();
}
