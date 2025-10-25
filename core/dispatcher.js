import fetch from 'node-fetch';
import { getSeatConfig } from './seats.js';

export async function spawnSeat(role, prompt, explicitModel) {
  const config = getSeatConfig(role) || {};
  const model = explicitModel && explicitModel.trim()
    ? explicitModel.trim()
    : config.model || 'llama3.2:3b';

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
