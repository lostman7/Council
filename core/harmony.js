import { getSeats } from './seats.js';

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

export function initHarmony() {
  const seats = getSeats().filter((seat) => seat !== 'Throne');
  harmonicState.weights = seats.reduce((acc, seat) => {
    acc[seat] = 1.0;
    if (!harmonicState.moods[seat]) {
      harmonicState.moods[seat] = 'Neutral';
    }
    return acc;
  }, {});
  harmonicState.entropy = 0;
  harmonicState.lastTopic = '';
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

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
