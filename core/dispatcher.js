import fetch from 'node-fetch';
import { pickModel, refreshPool } from './pool.js';

let lastPoolCheck = 0;
const POOL_CHECK_INTERVAL_MS = 15 * 1000;

export async function spawnSeat(role, prompt, modelOverride) {
  await ensurePool();
  const model = modelOverride && modelOverride.trim() ? modelOverride.trim() : pickModel(role);

  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: `You are the ${role} of the Council.` },
      { role: 'user', content: prompt }
    ]
  };

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`Seat request failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.message?.content || '(no reply)';
  } catch (err) {
    console.error('Seat spawn error:', err);
    return '(seat offline)';
  }
}

async function ensurePool() {
  const now = Date.now();
  if (now - lastPoolCheck > POOL_CHECK_INTERVAL_MS) {
    await refreshPool();
    lastPoolCheck = now;
  }
}
