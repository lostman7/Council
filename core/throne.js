import { spawnSeat } from './dispatcher.js';
import { loadBubble, saveBubble } from '../memory/bubbles.js';
import { initRamdisk } from './ramdisk.js';

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
  const prompt = buildPrompt(msg, bubble);

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

function buildPrompt(msg, bubble) {
  const context = bubble?.slice(-3).join('\n') ?? '';
  return `Context:\n${context}\nUser:${msg}`;
}
