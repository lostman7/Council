import { spawnSeat } from './dispatcher.js';
import { getSeatConfig, getSeats } from './seats.js';
import { loadBubble, saveBubble, mergeBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';
import { searchDocs } from '../memory/vectorCache.js';
import { summarize } from './thinker.js';
import { saveSession } from './continuum.js';

export const THRONE_LOG_LIMIT = 200;
const SUMMARY_INTERVAL = 3;
const SESSION_INTERVAL_MS = 60 * 1000;

let activeSeat = 'Idle';
let throneLog = [];
let contextTokens = 0;
let lastSummaryAt = null;

let sessionActive = false;
let sessionTopic = '';
let iteration = 0;
let loopTimer = null;
let loopRunning = false;
let pendingQueue = [];
let lastBaton = '';

export async function initThrone(win) {
  await initRamdisk();
  syncThroneLog();
  activeSeat = 'Idle';
  sessionActive = false;
  sessionTopic = '';
  iteration = 0;
  pendingQueue = [];
  lastBaton = '';

  if (win) {
    win.webContents.send('seat-change', 'Idle');
    emitSystemLog(win, 'Throne initialized and standing by.');
  }
  console.log('Throne initialized.');
}

export async function startSession(topic, win) {
  const seed = typeof topic === 'string' ? topic.trim() : '';
  if (!seed) {
    if (win) emitSystemLog(win, 'Session start ignored: empty topic.');
    return;
  }

  if (sessionActive) {
    stopSession(win, { silent: true });
  }

  sessionTopic = seed;
  sessionActive = true;
  iteration = 0;
  pendingQueue = [];
  lastBaton = seed;
  lastSummaryAt = null;

  appendToThroneLog([`Throne Session Topic: ${seed}`]);
  if (win) {
    win.webContents.send('council-response', `Throne: Initiating Council on "${seed}"`);
    emitSystemLog(win, `Council session started for topic: ${seed}`);
  }

  scheduleCouncilLoop(win, 0);
}

export function stopSession(win, { silent = false } = {}) {
  sessionActive = false;
  pendingQueue = [];
  lastBaton = '';
  iteration = 0;
  sessionTopic = '';
  lastSummaryAt = null;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  activeSeat = 'Idle';
  if (win) {
    win.webContents.send('seat-change', 'Idle');
    if (!silent) {
      emitSystemLog(win, 'Council session halted.');
    }
  }
}

export async function handleSeed(msg, win) {
  const input = typeof msg === 'string' ? msg.trim() : '';
  if (!input) {
    return;
  }

  if (!sessionActive) {
    await startSession(input, win);
    return;
  }

  pendingQueue.push(input);
  appendToThroneLog([`User: ${input}`]);
  if (win) {
    emitSystemLog(win, `Queued new prompt for Council: ${input}`);
  }
  scheduleCouncilLoop(win, 0);
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
    lastSummaryAt: lastSummaryAt ? lastSummaryAt.toISOString() : null,
    sessionTopic,
    sessionActive,
    iteration
  };
}

export function getThroneLog(limit = 30) {
  if (!limit || limit >= throneLog.length) {
    return [...throneLog];
  }
  return throneLog.slice(-limit);
}

function scheduleCouncilLoop(win, delay = SESSION_INTERVAL_MS) {
  if (!sessionActive) return;
  if (loopTimer) {
    clearTimeout(loopTimer);
  }
  loopTimer = setTimeout(() => runCouncilLoop(win), Math.max(0, delay));
}

async function runCouncilLoop(win) {
  if (!sessionActive) {
    return;
  }

  if (loopRunning) {
    scheduleCouncilLoop(win, 500);
    return;
  }

  const seatNames = getSeats().filter((name) => name !== 'Throne');
  if (!seatNames.length) {
    if (win) emitSystemLog(win, 'No configured seats available for Council loop.');
    return;
  }

  loopRunning = true;
  try {
    const previousBaton = lastBaton;
    const baton = pendingQueue.length ? pendingQueue.shift() : lastBaton || sessionTopic;
    let batonMessageLogged = baton === previousBaton;
    const turnLog = [];

    if (baton && baton !== lastBaton) {
      appendToThroneLog([`User: ${baton}`]);
      batonMessageLogged = true;
    }

    for (const seatName of seatNames) {
      const config = getSeatConfig(seatName);
      const role = config?.role ?? seatName;
      const model = config?.model;

      activeSeat = role;
      if (win) {
        win.webContents.send('seat-change', role);
        emitSystemLog(win, `Spawning seat: ${role} (${model || 'default'})`);
      }

      const bubble = loadBubble(seatName);
      let rag = '';
      try {
        const docs = await searchDocs(`${sessionTopic}\n${baton}`);
        rag = docs.length ? docs.join('\n---\n') : 'No relevant Flowfield context available.';
      } catch (err) {
        console.error('Flowfield search error:', err);
        rag = 'Flowfield search unavailable.';
      }

      const prompt = buildPrompt({ topic: sessionTopic, baton, memory: bubble, rag, role, iteration });
      const reply = await spawnSeat(role, prompt, model);
      const message = `${role}: ${reply}`;

      saveBubble(seatName, reply);
      appendToThroneLog([message]);
      turnLog.push(message);

      if (win) {
        win.webContents.send('council-response', message);
      }

      lastBaton = reply || baton;
    }

    activeSeat = 'Idle';
    if (win) {
      win.webContents.send('seat-change', 'Idle');
    }

    if (!batonMessageLogged && baton) {
      appendToThroneLog([`User: ${baton}`]);
    }

    iteration += 1;

    if (iteration % SUMMARY_INTERVAL === 0 && turnLog.length) {
      const summary = await summarize('Throne', turnLog);
      await recordSummary(summary, { win, broadcast: true });
    }

    if (iteration % 5 === 0) {
      const allTranscripts = getAllBubbles();
      await saveSession(sessionTopic || 'Untitled Session', allTranscripts);
    }
  } catch (err) {
    console.error('Council loop error:', err);
    if (win) {
      emitSystemLog(win, `Council loop error: ${err.message || err}`);
    }
  } finally {
    loopRunning = false;
    if (sessionActive) {
      scheduleCouncilLoop(win, SESSION_INTERVAL_MS);
    }
  }
}

function getAllBubbles() {
  const seatNames = getSeats();
  const transcripts = [];
  for (const seatName of seatNames) {
    const entries = loadBubble(seatName);
    if (!entries.length) continue;
    transcripts.push(`# ${seatName}`);
    transcripts.push(...entries);
    transcripts.push('');
  }
  return transcripts;
}

function buildPrompt({ topic, baton, memory, rag, role, iteration: turn }) {
  const memoryTail = Array.isArray(memory) && memory.length ? memory.slice(-5).join('\n') : 'No prior memory.';
  const batonText = baton || `Continue reflecting on ${topic}.`;
  return `Session Topic: ${topic}\nCurrent Turn: ${turn + 1}\nSeat: ${role}\n\nFlowfield Context:\n${rag}\n\nRecent Memory:\n${memoryTail}\n\nBaton:${batonText}`;
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
