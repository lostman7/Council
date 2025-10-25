// core/continuum_recall.js
// --------------------------------------
// Persists last known Council state so it reboots "mid-thought".

import fs from 'fs-extra';
import path from 'path';
import { getAllSeatConfigs } from './seats.js';
import { getHarmonicState } from './harmony.js';

const store = path.join(process.cwd(), 'archive/continuum_state.json');

export async function saveContinuumState(topic) {
  const snapshot = {
    topic,
    time: new Date().toISOString(),
    seats: getAllSeatConfigs(),
    harmony: getHarmonicState()
  };
  await fs.outputJson(store, snapshot, { spaces: 2 });
  console.log('[Continuum] State saved:', snapshot.topic);
}

export function loadContinuumState() {
  try {
    if (!fs.existsSync(store)) return null;
    const data = fs.readJsonSync(store);
    console.log('[Continuum] Recalled:', data.topic);
    return data;
  } catch (e) {
    console.error('[Continuum] recall error:', e);
    return null;
  }
}
