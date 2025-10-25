// core/synaptic_drift.js
// -----------------------------------------------
// The Council's emotional evolution layer.
// Reads prior harmonic states, blends them, and biases the new session accordingly.

import fs from 'fs-extra';
import path from 'path';
import { getAllSeatConfigs } from './seats.js';

const driftDir = path.join(process.cwd(), 'archive', 'drift');
await fs.ensureDir(driftDir);

const WEIGHT_BLEND_RATE = 0.1;
const ENTROPY_BLEND_RATE = 0.1;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.0;

export async function applySynapticDrift(currentState = {}) {
  let files = [];
  try {
    files = (await fs.readdir(driftDir)).filter((file) => file.endsWith('.drift')).sort();
  } catch (err) {
    console.error('[Drift] Unable to read drift directory:', err);
    return null;
  }

  if (!files.length) {
    return null;
  }

  const recent = files.slice(-3);
  let totalEntropy = 0;
  let count = 0;
  const weightSums = {};

  for (const file of recent) {
    try {
      const data = await fs.readJson(path.join(driftDir, file));
      if (typeof data?.entropy === 'number') {
        totalEntropy += data.entropy;
      }
      if (data?.weights && typeof data.weights === 'object') {
        for (const [seat, value] of Object.entries(data.weights)) {
          if (typeof value !== 'number') continue;
          weightSums[seat] = (weightSums[seat] || 0) + value;
        }
      }
      count += 1;
    } catch (err) {
      console.warn('[Drift] Skipping corrupt drift snapshot:', file, err);
    }
  }

  if (!count) {
    return null;
  }

  const avgEntropy = totalEntropy / count;
  const avgWeights = {};
  for (const [seat, total] of Object.entries(weightSums)) {
    avgWeights[seat] = total / count;
  }

  const current = {
    entropy: typeof currentState.entropy === 'number' ? currentState.entropy : 0,
    lastTopic: typeof currentState.lastTopic === 'string' ? currentState.lastTopic : '',
    moods: { ...(currentState.moods || {}) },
    weights: { ...(currentState.weights || {}) }
  };
  const seatSet = new Set([
    ...Object.keys(current.weights || {}),
    ...Object.keys(avgWeights),
    ...Object.keys(getAllSeatConfigs() || {})
  ]);

  const blendedWeights = {};
  for (const seat of seatSet) {
    const present = typeof current.weights?.[seat] === 'number' ? current.weights[seat] : 1;
    const target = typeof avgWeights[seat] === 'number' ? avgWeights[seat] : present;
    const delta = (target - present) * WEIGHT_BLEND_RATE;
    const blended = clamp(present + delta, MIN_WEIGHT, MAX_WEIGHT);
    blendedWeights[seat] = blended;
  }

  const driftedState = {
    ...currentState,
    entropy: clamp(current.entropy + (avgEntropy - current.entropy) * ENTROPY_BLEND_RATE, 0, 10),
    weights: blendedWeights
  };

  const adjustment = Object.entries(blendedWeights)
    .map(([seat, value]) => `${seat}:${value.toFixed(2)}`)
    .join(', ');

  console.log(`[Drift] Adjusted harmony (entropy=${avgEntropy.toFixed(2)}): ${adjustment}`);

  return driftedState;
}

export async function recordDriftSnapshot(state) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(driftDir, `${stamp}.drift`);
    const snapshot = {
      entropy: typeof state?.entropy === 'number' ? state.entropy : 0,
      weights: state?.weights || {},
      time: stamp
    };
    await fs.writeJson(file, snapshot, { spaces: 2 });
    console.log('[Drift] Snapshot saved:', file);
  } catch (err) {
    console.error('[Drift] Failed to write drift snapshot:', err);
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
