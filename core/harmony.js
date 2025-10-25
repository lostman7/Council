import { getSeats } from './seats.js';
import { applySynapticDrift } from './synaptic_drift.js';

const DEFAULT_MOODS = {
  Physicist: 'Analytical',
  Engineer: 'Creative',
  Philosopher: 'Reflective',
  Linguist: 'Skeptical',
  Navigator: 'Neutral',
  Historian: 'Reflective',
  Strategist: 'Analytical'
};

const harmonicState = {
  entropy: 0,
  lastTopic: '',
  weights: {},
  moods: { ...DEFAULT_MOODS }
};

export async function initHarmony(initialState) {
  if (initialState) {
    applyState(initialState);
  } else if (globalThis.__councilHarmony__) {
    applyState(globalThis.__councilHarmony__);
  } else {
    harmonicState.entropy = 0;
    harmonicState.lastTopic = '';
    harmonicState.moods = { ...DEFAULT_MOODS, ...harmonicState.moods };
  }

  alignSeats();

  try {
    const drifted = await applySynapticDrift(getHarmonicState());
    if (drifted) {
      applyState(drifted);
      alignSeats();
      console.log('[Drift] Harmony drift applied from last sessions.');
    }
  } catch (err) {
    console.error('[Drift] Unable to apply synaptic drift:', err);
  }

  return getHarmonicState();
}

export function tuneHarmony(topic) {
  const subject = typeof topic === 'string' ? topic.trim() : '';
  if (!harmonicState.lastTopic) {
    harmonicState.lastTopic = subject;
  }

  if (subject && subject !== harmonicState.lastTopic) {
    harmonicState.entropy += 0.8;
  } else {
    harmonicState.entropy -= 0.3;
  }

  harmonicState.entropy = Math.max(0, harmonicState.entropy);
  harmonicState.lastTopic = subject || harmonicState.lastTopic;

  for (const seat of Object.keys(harmonicState.weights)) {
    const mood = harmonicState.moods[seat] || 'Neutral';
    let delta = 0;
    if (mood === 'Analytical') delta = -0.05 * harmonicState.entropy;
    if (mood === 'Creative') delta = 0.07 * harmonicState.entropy;
    if (mood === 'Skeptical') delta = -0.02 * harmonicState.entropy;
    if (mood === 'Reflective') delta = 0.03;
    if (mood === 'Neutral') delta = 0;

    const nextWeight = (harmonicState.weights[seat] ?? 1) + delta;
    harmonicState.weights[seat] = clamp(nextWeight, 0.1, 2.0);
  }

  return getHarmonicState();
}

export function dominantSeat() {
  const entries = Object.entries(harmonicState.weights);
  if (!entries.length) {
    return 'Idle';
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export function getHarmonicState() {
  return {
    entropy: harmonicState.entropy,
    lastTopic: harmonicState.lastTopic,
    weights: { ...harmonicState.weights },
    moods: { ...harmonicState.moods }
  };
}

export function restoreHarmony(state) {
  applyState(state);
  alignSeats();
  return getHarmonicState();
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function applyState(state) {
  if (!state || typeof state !== 'object') {
    return;
  }
  if (typeof state.entropy === 'number') {
    harmonicState.entropy = clamp(state.entropy, 0, 10);
  }
  if (typeof state.lastTopic === 'string') {
    harmonicState.lastTopic = state.lastTopic;
  }
  if (state.moods && typeof state.moods === 'object') {
    harmonicState.moods = { ...DEFAULT_MOODS, ...state.moods };
  } else {
    harmonicState.moods = { ...DEFAULT_MOODS, ...harmonicState.moods };
  }
  if (state.weights && typeof state.weights === 'object') {
    harmonicState.weights = { ...state.weights };
  }
}

function alignSeats() {
  const seats = getSeats().filter((seat) => seat !== 'Throne');
  const alignedWeights = {};
  for (const seat of seats) {
    if (!harmonicState.moods[seat]) {
      harmonicState.moods[seat] = DEFAULT_MOODS[seat] || 'Neutral';
    }
    const weight = harmonicState.weights?.[seat];
    alignedWeights[seat] = clamp(
      typeof weight === 'number' ? weight : 1.0,
      0.1,
      2.0
    );
  }
  harmonicState.weights = alignedWeights;
}
