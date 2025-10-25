// renderer/app.js
// Wires the buttons and prints messages into the two columns.

const leftCol = document.getElementById('left');
const rightCol = document.getElementById('right');

const seedInput = document.getElementById('seedInput');
const startSessionBtn = document.getElementById('startSessionBtn');
const sendBtn = document.getElementById('sendBtn');
const seatStatusLabel = document.getElementById('seatStatusLabel');
const councilDot = document.getElementById('councilDot');

const logPanel = document.getElementById('councilLogs');
const LOG_LIMIT = 200;
let firstMessageSent = false;

function logMessage(message) {
  if (!logPanel) return;
  const line = document.createElement('div');
  const serialised =
    typeof message === 'string'
      ? message
      : JSON.stringify(message) ?? String(message ?? '');
  const text = serialised || '';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logPanel.appendChild(line);
  while (logPanel.children.length > LOG_LIMIT) {
    logPanel.removeChild(logPanel.firstChild);
  }
  logPanel.scrollTop = logPanel.scrollHeight;
}

// simple printer
function addMessage(sender, text, side) {
  const msg = document.createElement('div');
  msg.className = 'message';
  msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
  (side === 'left' ? leftCol : rightCol).appendChild(msg);
  msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// start session by topic (autonomous loop)
startSessionBtn.onclick = () => {
  const topic = seedInput.value.trim() || 'Flowfield: baseline session';
  window.CouncilAPI.startSession(topic);
  seatStatusLabel.textContent = 'Active Seat: Physicist';
  councilDot.classList.remove('red');
  councilDot.classList.add('green');
  addMessage('Throne', `Council assembled on "${topic}"`, 'left');
  logMessage(`Council session started with topic "${topic}"`);
  firstMessageSent = true;
};

// send a manual turn/seed
sendBtn.onclick = async () => {
  const text = seedInput.value.trim();
  if (!text) return;

  addMessage('You', text, 'left');
  logMessage('Send: ⏳ Thinking...');
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳ Thinking...';

  try {
    if (!firstMessageSent) {
      window.dispatchEvent(
        new CustomEvent('send-first-message', { detail: { message: text } })
      );
      firstMessageSent = true;
    }
    await window.CouncilAPI.sendSeed(text);
    logMessage('Send: ✅ Reply received.');
  } catch (err) {
    logMessage(`Send error: ${err?.message || err}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    seedInput.value = '';
  }
};

// receive streamed council messages
window.CouncilAPI.on('council-response', (text) => {
  logMessage(`Council: ${text}`);
  const m = /^([A-Za-z ]+):\s*(.*)$/.exec(text || '');
  if (m && m[1] && m[2]) {
    addMessage(m[1], m[2], 'right');
    seatStatusLabel.textContent = `Active Seat: ${m[1]}`;
    councilDot.classList.remove('red');
    councilDot.classList.add('green');
    return;
  }

  if (typeof text === 'string' && text.startsWith('Throne:')) {
    const cleaned = text.replace(/^Throne:\s*/, '');
    addMessage('Throne', cleaned, 'left');
    seatStatusLabel.textContent = 'Active Seat: Throne';
    councilDot.classList.remove('red');
    councilDot.classList.add('green');
  } else {
    addMessage('Throne', text, 'left');
    seatStatusLabel.textContent = 'Active Seat: Throne';
  }
});

window.CouncilAPI.on('hud-status', (msg) => {
  logMessage(`HUD: ${msg}`);
});

window.CouncilAPI.on('system-log', (entry) => {
  if (entry) {
    logMessage(`System: ${entry}`);
  }
});

window.CouncilAPI.on('new-seed', (seed) => {
  if (seed) {
    logMessage(`Seed → ${seed}`);
  }
});

// (optional) update active seat from backend hooks
window.CouncilAPI.on('seat-change', (role) => {
  seatStatusLabel.textContent = `Active Seat: ${role}`;
  if (role === 'Idle') {
    councilDot.classList.remove('green');
    councilDot.classList.add('red');
  } else {
    councilDot.classList.remove('red');
    councilDot.classList.add('green');
  }
});

// request seats on load so Options can render
window.addEventListener('DOMContentLoaded', () => {
  logMessage('Initializing seat list...');
  window.CouncilAPI.getSeats();
});
