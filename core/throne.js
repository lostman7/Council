import { spawnSeat } from './dispatcher.js';
import { loadBubble, saveBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';
import { searchDocs } from '../memory/vectorCache.js';

let activeSeat = 'Physicist';
let throneContext = [];

export async function initThrone(win) {
  await initRamdisk();
  if (win) {
    win.webContents.send('seat-change', 'Idle');
  }
  console.log('Throne initialized.');
}

export async function handleSeed(msg, win) {
  throneContext.push({ role: 'user', content: msg });
  activeSeat = decideSeat(msg);
  if (win) {
    win.webContents.send('seat-change', activeSeat);
  }

  const bubble = loadBubble(activeSeat);
  const docs = await searchDocs(msg);
  const rag = docs.length ? docs.join('\n---\n') : 'No relevant Flowfield context available.';

  const prompt = buildPrompt(msg, bubble, rag);

  const reply = await spawnSeat(activeSeat, prompt);
  throneContext.push({ role: activeSeat, content: reply });

  saveBubble(activeSeat, reply);
  if (win) {
    win.webContents.send('council-response', `${activeSeat}: ${reply}`);
  }
}

function decideSeat(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('field') || lower.includes('plasma')) return 'Physicist';
  if (lower.includes('structure') || lower.includes('design')) return 'Engineer';
  return 'Physicist';
}

function buildPrompt(msg, bubble, rag) {
  const memory = bubble?.slice(-5).join('\n') ?? '';
  return `Flowfield Context:\n${rag}\n\nRecent Seat Memory:\n${memory}\n\nUser:${msg}`;
}
