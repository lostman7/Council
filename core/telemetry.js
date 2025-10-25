import os from 'os';

let systemInformationPromise = null;

async function loadSystemInformation() {
  if (systemInformationPromise) {
    return systemInformationPromise;
  }

  systemInformationPromise = import('systeminformation')
    .then((mod) => mod.default ?? mod)
    .catch((err) => {
      console.error('GPU telemetry module unavailable:', err?.message || err);
      return null;
    });

  return systemInformationPromise;
}

let telemetryWindow = null;
const seatStates = new Map();
let lastSeedBroadcast = '';

export function setTelemetryTarget(win) {
  telemetryWindow = win || null;
  broadcastSeatStates();
  if (telemetryWindow && lastSeedBroadcast) {
    telemetryWindow.webContents.send('new-seed', lastSeedBroadcast);
  }
}

export function resetSeatStates(seats = []) {
  seatStates.clear();
  const roster = Array.isArray(seats) ? seats : [];
  for (const name of roster) {
    if (typeof name === 'string' && name.trim()) {
      seatStates.set(name, { state: 'Idle', icon: null });
    }
  }
  broadcastSeatStates();
}

export function emitSeatUpdate(name, state, meta = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    return;
  }
  const cleanName = name.trim();
  const cleanState = typeof state === 'string' && state.trim() ? state.trim() : 'Idle';
  const existing = seatStates.get(cleanName) || {};
  seatStates.set(cleanName, {
    state: cleanState,
    icon: meta.icon ?? existing.icon ?? null
  });
  broadcastSeatStates();
}

export function broadcastNewSeed(seed) {
  if (typeof seed !== 'string') return;
  lastSeedBroadcast = seed;
  if (!telemetryWindow) return;
  telemetryWindow.webContents.send('new-seed', seed);
}

function broadcastSeatStates() {
  if (!telemetryWindow) {
    return;
  }
  const payload = Array.from(seatStates.entries()).map(([seat, data]) => ({
    name: seat,
    state: data.state,
    icon: data.icon || null
  }));
  telemetryWindow.webContents.send('seat-status', payload);
}

export async function getStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const ramUsage = total ? ((1 - free / total) * 100).toFixed(1) : '0.0';

  let gpuUsage = 'n/a';
  try {
    const si = await loadSystemInformation();
    if (si) {
      const gpus = await si.graphics();
      if (gpus.controllers.length) {
        const controller = gpus.controllers[0];
        if (controller.memoryTotal && controller.memoryUsed) {
          gpuUsage = ((controller.memoryUsed / controller.memoryTotal) * 100).toFixed(1);
        }
      }
    }
  } catch (err) {
    console.error('GPU telemetry error:', err);
  }

  return {
    ramUsage,
    gpuUsage,
    timestamp: new Date().toISOString()
  };
}
