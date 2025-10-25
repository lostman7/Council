import { spawnSeat } from './dispatcher.js';
import { loadBubble, saveBubble, mergeBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';
import { searchDocs } from '../memory/vectorCache.js';
import { summarize } from './thinker.js';

const chainOrder = ['Physicist', 'Engineer', 'Linguist'];
const chainDepth = 3;
export const THRONE_LOG_LIMIT = 200;
const SUMMARY_CHANCE = 0.2;

export async function initThrone(win) {
  await initRamdisk();
  if (win) {
    win.webContents.send('seat-change', 'Idle');
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

  mergeBubble('Throne', [`User: ${seed}`], THRONE_LOG_LIMIT);
  if (win) {
    win.webContents.send('seat-change', seatsToRun[0]);
  }

  let baton = seed;
  const turnLog = [`User: ${seed}`];

  for (const role of seatsToRun) {
    if (win) {
      win.webContents.send('seat-change', role);
    }

    const bubble = loadBubble(role);
    const docs = await searchDocs(baton);
    const rag = docs.length ? docs.join('\n---\n') : 'No relevant Flowfield context available.';
    const prompt = buildPrompt(baton, bubble, rag);

    const reply = await spawnSeat(role, prompt);
    const message = `${role}: ${reply}`;

    saveBubble(role, reply);
    mergeBubble('Throne', [message], THRONE_LOG_LIMIT);
    turnLog.push(message);

    if (win) {
      win.webContents.send('council-response', message);
    }

    baton = reply;
  }

  if (win) {
    win.webContents.send('seat-change', 'Idle');
  }

  if (turnLog.length && Math.random() < SUMMARY_CHANCE) {
    const summary = await summarize('Throne', turnLog);
    const thinkerMessage = `Optical Thinker: ${summary}`;
    mergeBubble('Throne', [thinkerMessage], THRONE_LOG_LIMIT);
    if (win) {
      win.webContents.send('council-response', thinkerMessage);
    }
  }
}

function buildPrompt(input, bubble, rag) {
  const memory = bubble.slice(-5).join('\n') || 'No prior memory.';
  return `Flowfield Context:\n${rag}\n\nRecent Memory:\n${memory}\n\nUser:${input}`;
}
