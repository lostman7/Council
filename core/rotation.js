// core/rotation.js
// Handles seat rotation, timing, and auto-summon integrated with drift snapshots

import { getSeats } from './seats.js';
import { recordDriftSnapshot } from './synaptic_drift.js';
import { getHarmonicState } from './harmony.js';
import { emitSeatUpdate } from './telemetry.js';

const DEFAULT_ORDER = ['Linguist', 'Physicist', 'Engineer', 'Thinker'];
let rotationOrder = [...DEFAULT_ORDER];
let currentIndex = -1;
let autoMode = true;

function ensureRotationOrder() {
  const availableSeats = getSeats().filter((name) => name !== 'Throne');
  if (!availableSeats.length) {
    rotationOrder = [...DEFAULT_ORDER];
    return;
  }

  const normalized = new Set(rotationOrder.filter((seat) => availableSeats.includes(seat)));
  for (const seat of availableSeats) {
    normalized.add(seat);
  }
  rotationOrder = Array.from(normalized);
}

export function getNextSeatName() {
  ensureRotationOrder();
  if (!rotationOrder.length) {
    return null;
  }
  currentIndex = (currentIndex + 1) % rotationOrder.length;
  return rotationOrder[currentIndex];
}

export async function autoRotateIfTriggered(message, { scheduleNextTurn, delay = 5000 } = {}) {
  if (!autoMode || typeof message !== 'string') {
    return;
  }

  const trigger = /(Pauses for response|End of report)/i;
  if (!trigger.test(message)) {
    return;
  }

  const nextSeat = getNextSeatName();
  if (!nextSeat) {
    return;
  }

  const seconds = (delay / 1000).toFixed(1);
  console.log(`[AutoTurn] Summoning ${nextSeat} in ${seconds}s`);
  setTimeout(async () => {
    if (!autoMode) return;
    await recordDriftSnapshot(getHarmonicState());
    emitSeatUpdate(nextSeat, 'Thinking');
    if (typeof scheduleNextTurn === 'function') {
      scheduleNextTurn(nextSeat);
    }
  }, Math.max(0, delay));
}

export function toggleAutoRotation(state) {
  autoMode = Boolean(state);
  console.log(`[AutoTurn] Auto rotation ${autoMode ? 'enabled' : 'disabled'}`);
}

export function isAutoRotationEnabled() {
  return autoMode;
}

export function setRotationOrder(order) {
  if (!Array.isArray(order) || !order.length) return;
  rotationOrder = Array.from(new Set(order));
  currentIndex = -1;
}
