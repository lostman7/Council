import fs from 'fs';
import path from 'path';
import { callModel } from './dispatcher.js';
import {
  initializeSeatRegistry,
  spawnSeat as invokeSeat,
  getSeatConfig,
  getSeats,
  MODEL_RUNTIME
} from './seats.js';
import { loadBubble, saveBubble, mergeBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';
import { chunkAllDocs } from './chunker.js';
import { searchDocs } from '../memory/vectorCache.js';
import { searchEmbeddings } from './vectorOps.js';
import { summarize, reconcile } from './thinker.js';
import { saveSession } from './continuum.js';
import { saveContinuumState } from './continuum_recall.js';
import { initHarmony, tuneHarmony, dominantSeat, getHarmonicState } from './harmony.js';
import { appendSeatTurn, getSeatHistory, clearSeatHistory } from './recorder.js';
import { recordDriftSnapshot } from './synaptic_drift.js';
import { emitSeatUpdate, resetSeatStates, broadcastNewSeed } from './telemetry.js';
import { traceLog } from './trace.js';

export const THRONE_LOG_LIMIT = 200;
const SUMMARY_INTERVAL = 3;
const SESSION_INTERVAL_MS = 0;

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
let seatTurns = 0;
let epoch = 1;
let lastThroneMessage = '';
const ROUND_SIZE = 4;
const LOG_DIR = path.join(process.cwd(), 'logs');

export async function initThrone(win) {
  await initializeSeatRegistry();
  await initRamdisk();
  await chunkAllDocs();
  await initHarmony();
  syncThroneLog();
  activeSeat = 'Idle';
  sessionActive = false;
  sessionTopic = '';
  iteration = 0;
  pendingQueue = [];
  lastBaton = '';
  resetSeatStates(uniqueRoster());
  emitSeatUpdate('Throne', 'Idle');

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
  seatTurns = 0;
  lastThroneMessage = '';
  globalThis.initialUserPrompt = seed;
  lastSummaryAt = null;
  clearSeatHistory();
  resetSeatStates(uniqueRoster());
  emitSeatUpdate('Throne', 'Coordinating');

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
  seatTurns = 0;
  lastThroneMessage = '';
  sessionTopic = '';
  lastSummaryAt = null;
  clearSeatHistory();
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  activeSeat = 'Idle';
  resetSeatStates(uniqueRoster());
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

async function onSeatComplete(seatName, _msg, win) {
  seatTurns += 1;
  if (seatTurns < ROUND_SIZE) {
    return;
  }
  try {
    await throneReview(win);
  } catch (err) {
    console.error('Throne review error:', err);
    if (win) {
      emitSystemLog(win, `Throne review error: ${err.message || err}`);
    }
  }
}

async function throneReview(win) {
  const recent = getSeatHistory(ROUND_SIZE);
  if (!recent.length) {
    return;
  }

  const payload = {
    userSeed: globalThis.initialUserPrompt || sessionTopic,
    throneLast: lastThroneMessage,
    seatSnippets: recent
  };

  const config = getSeatConfig('Throne') || {};
  const throneModel = config.model || MODEL_RUNTIME.throne || 'cogito:3b';
  const messages = [
    {
      role: 'system',
      content: 'You are the Throne of the Council. Review the recent seat transcripts and craft the next directive for the Council to explore.'
    },
    { role: 'user', content: JSON.stringify(payload, null, 2) }
  ];

  const response = await callModel({
    model: throneModel,
    messages
  });

  lastThroneMessage = response.text;
  appendToThroneLog([`Throne Review: ${response.text}`]);
  if (win) {
    win.webContents.send('council-response', `Throne: ${response.text}`);
  }

  const file = saveEpoch(recent, response.text);
  await recordDriftSnapshot(getHarmonicState());
  broadcastNewSeed(response.text);
  clearSeatHistory();
  seatTurns = 0;
  pendingQueue.push(response.text);
  lastBaton = response.text;

  console.log(`[Cycle] Throne Review completed → ${file}`);
}

function saveEpoch(transcripts, throneText) {
  if (!Array.isArray(transcripts)) {
    return '';
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `epoch-${String(epoch).padStart(3, '0')}.json`);
  const data = { transcripts, throneText, timestamp: Date.now() };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  epoch += 1;
  return file;
}

export async function runCouncilLoop(win) {
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
    emitSeatUpdate('Throne', 'Idle');
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

    emitSeatUpdate('Throne', 'Coordinating');
    const harmonic = tuneHarmony(baton || sessionTopic);
    const leadSeat = dominantSeat();
    const harmonicMessage = `Throne: Harmonic field adjusted — Entropy ${harmonic.entropy
      .toFixed(2)}, lead seat ${leadSeat}.`;
    appendToThroneLog([harmonicMessage]);
    turnLog.push(harmonicMessage);
    if (win) {
      win.webContents.send('council-response', harmonicMessage);
      emitSystemLog(win, `Harmonic entropy ${harmonic.entropy.toFixed(2)} | lead ${leadSeat}`);
    }

    for (let index = 0; index < seatNames.length; index += 1) {
      const seatName = seatNames[index];
      const config = getSeatConfig(seatName);
      const role = config?.role ?? seatName;
      const model = config?.model;

      activeSeat = role;
      if (win) {
        win.webContents.send('seat-change', role);
        emitSystemLog(win, `Spawning seat: ${role} (${model || 'default'})`);
      }
      emitSeatUpdate(role, 'Thinking');

      const bubble = loadBubble(seatName);
      let rag = '';
      try {
        const docs = await searchDocs(`${sessionTopic}\n${baton}`);
        rag = docs.length ? docs.join('\n---\n') : 'No relevant Flowfield context available.';
      } catch (err) {
        console.error('Flowfield search error:', err);
        rag = 'Flowfield search unavailable.';
      }

      let vectorRecall = '';
      try {
        const matches = await searchEmbeddings(`${sessionTopic}\n${baton}`);
        vectorRecall = matches.length
          ? matches.map((entry) => entry.text).join('\n---\n')
          : '';
      } catch (err) {
        console.error('Embedding recall error:', err);
      }

      const ragSections = [];
      if (rag) {
        ragSections.push(rag);
      }
      if (vectorRecall) {
        ragSections.push(`Vector Recall:\n${vectorRecall}`);
      }
      const combinedRag = ragSections.length ? ragSections.join('\n---\n') : 'No contextual recall available.';

      const prompt = buildPrompt({ topic: sessionTopic, baton, memory: bubble, rag: combinedRag, role, iteration });
      const weight = harmonic.weights?.[seatName] ?? 1.0;
      const weightedPrompt = `${prompt}\n[Resonance Weight:${weight.toFixed(2)}]`;
      const seatResult = await invokeSeat(role, weightedPrompt, { modelOverride: model });
      const reply = seatResult.text;
      const message = `${role}: ${reply}`;

      saveBubble(seatName, reply);
      appendSeatTurn(role, reply);
      appendToThroneLog([message]);
      turnLog.push(message);

      if (win) {
        win.webContents.send('council-response', message);
      }

      await handleCouncilMessage({ win, seatName: role, reply, persona: seatResult.persona, message });

      lastBaton = reply || baton;

    }

    activeSeat = 'Idle';
    if (win) {
      win.webContents.send('seat-change', 'Idle');
    }
    emitSeatUpdate('Throne', 'Idle');

    if (!batonMessageLogged && baton) {
      appendToThroneLog([`User: ${baton}`]);
    }

    iteration += 1;

    if (iteration % SUMMARY_INTERVAL === 0 && turnLog.length) {
      const summary = await summarize('Throne', turnLog);
      await recordSummary(summary, { win, broadcast: true });
    }

    if (harmonic.entropy >= 1.5 && turnLog.length > 1) {
      const reconciliation = await reconcile(turnLog);
      await recordSummary(reconciliation, { win, broadcast: true });
    }

    if (iteration % 5 === 0) {
      const allTranscripts = getAllBubbles();
      await saveSession(sessionTopic || 'Untitled Session', allTranscripts);
    }

    await saveContinuumState(sessionTopic || 'Untitled Session');
    await recordDriftSnapshot(getHarmonicState());
  } catch (err) {
    console.error('Council loop error:', err);
    if (win) {
      emitSystemLog(win, `Council loop error: ${err.message || err}`);
    }
    emitSeatUpdate('Throne', 'Idle');
  } finally {
    loopRunning = false;
    if (sessionActive && pendingQueue.length) {
      scheduleCouncilLoop(win, 0);
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

function uniqueRoster() {
  const roster = new Set(getSeats());
  roster.add('Throne');
  return Array.from(roster);
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

async function handleCouncilMessage({ win, seatName, reply, persona, message }) {
  emitSeatUpdate(seatName, 'Idle', { icon: persona?.icon });
  await onSeatComplete(seatName, reply, win);
}
