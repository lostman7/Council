import fetch from 'node-fetch';

let pool = [];
let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 30 * 1000;

export async function refreshPool(force = false) {
  const now = Date.now();
  if (!force && now - lastRefresh < REFRESH_INTERVAL_MS && pool.length) {
    return pool;
  }

  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) {
      throw new Error(`Ollama tags request failed with status ${res.status}`);
    }

    const data = await res.json();
    pool = Array.isArray(data.models) ? data.models.map((m) => m.name).filter(Boolean) : [];
    lastRefresh = now;
    console.log('Ollama pool:', pool);
  } catch (err) {
    console.error('Pool refresh error:', err);
    pool = [];
  }

  return pool;
}

export function pickModel(role) {
  if (role === 'Physicist') return 'llama3.2:3b';
  if (role === 'Engineer') return 'cogito:3b';
  if (role === 'Linguist') return 'qwen3:0.6b';
  return pool[0] || 'llama3.2:3b';
}

export function getPoolSnapshot() {
  return [...pool];
}
