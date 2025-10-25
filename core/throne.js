import { spawnSeat } from './dispatcher.js';
import { loadBubble, saveBubble, mergeBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';
import { searchDocs } from '../memory/vectorCache.js';
import { summarize } from './thinker.js';

const chainOrder = ['Physicist', 'Engineer', 'Linguist'];
const chainDepth = 3;
export const THRONE_LOG_LIMIT = 200;
const SUMMARY_CHANCE = 0.2;

let activeSeat = 'Idle';
let throneLog = [];
let contextTokens = 0;
let lastSummaryAt = null;

export async function initThrone(win) {
  await initRamdisk();
  syncThroneLog();
  activeSeat = 'Idle';
  if (win) {
    win.webContents.send('seat-change', 'Idle');
    emitSystemLog(win, 'Throne initialized and standing by.');
  }
  console.log('Throne initialized.');
}

export async function handleSeed(msg, win) {
  const seed = typeof msg === 'string' ? msg.trim() : '';
  if (!seed) {
    return;
  }

  const seatsToRun = chainOrder.slice(0, chainDepth).filter(Boolean);
  if (!seatsToRun.length) {
    return;
  }

  appendToThroneLog([`User: ${seed}`]);
  activeSeat = seatsToRun[0];
  if (win) {
    win.webContents.send('seat-change', activeSeat);
    emitSystemLog(win, `New topic received. Chaining seats: ${seatsToRun.join(' → ')}.`);
  }

  let baton = seed;
  const turnLog = [`User: ${seed}`];

  for (const role of seatsToRun) {
    activeSeat = role;
    if (win) {
      win.webContents.send('seat-change', role);
      emitSystemLog(win, `Spawning seat: ${role}`);
    }

    const bubble = loadBubble(role);
    const docs = await searchDocs(baton);
    const rag = docs.length ? docs.join('\n---\n') : 'No relevant Flowfield context available.';
    const prompt = buildPrompt(baton, bubble, rag);

    const reply = await spawnSeat(role, prompt);
    const message = `${role}: ${reply}`;

    saveBubble(role, reply);
    appendToThroneLog([message]);
    turnLog.push(message);

    if (win) {
      win.webContents.send('council-response', message);
    }

    baton = reply;
  }

  activeSeat = 'Idle';
  if (win) {
    win.webContents.send('seat-change', 'Idle');
  }

  if (turnLog.length && Math.random() < SUMMARY_CHANCE) {
    const summary = await summarize('Throne', turnLog);
    await recordSummary(summary, { win, broadcast: true });
  }
}

export async function recordSummary(summary, { win, broadcast = false } = {}) {
  const thinkerMessage = `Optical Thinker: ${summary}`;
  appendToThroneLog([thinkerMessage]);
  lastSummaryAt = new Date();
  if (broadcast && win) {
    win.webContents.send('council-response', thinkerMessage);
  }
  if (win) {
    emitSystemLog(win, 'Optical Thinker updated the Throne log.');
  }
  return thinkerMessage;
}

export function getThroneMetrics() {
  return {
    activeSeat,
    contextTokens,
    lastSummaryAt: lastSummaryAt ? lastSummaryAt.toISOString() : null
  };
}

export function getThroneLog(limit = 30) {
  if (!limit || limit >= throneLog.length) {
    return [...throneLog];
  }
  return throneLog.slice(-limit);
}

function buildPrompt(input, bubble, rag) {
  const memory = bubble.slice(-5).join('\n') || 'No prior memory.';
  return `Flowfield Context:\n${rag}\n\nRecent Memory:\n${memory}\n\nUser:${input}`;
}

function appendToThroneLog(entries) {
  mergeBubble('Throne', entries, THRONE_LOG_LIMIT);
  syncThroneLog();
}

function syncThroneLog() {
  throneLog = loadBubble('Throne');
  contextTokens = estimateTokens(throneLog.join('\n'));
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function emitSystemLog(win, text) {
  if (!win) return;
  const stamp = new Date().toLocaleTimeString();
  win.webContents.send('system-log', `[${stamp}] ${text}`);
}
