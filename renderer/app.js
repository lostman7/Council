// renderer/app.js
// Wires the buttons and prints messages into the two columns.

const leftCol = document.getElementById('left');
const rightCol = document.getElementById('right');

const seedInput = document.getElementById('seedInput');
const startSessionBtn = document.getElementById('startSessionBtn');
const sendBtn = document.getElementById('sendBtn');
const seatStatus = document.getElementById('seatStatus');
const councilDot = document.getElementById('councilDot');

const debugBox = document.createElement('div');
debugBox.id = 'debugOverlay';
debugBox.style.cssText =
  'position:fixed;bottom:0;right:0;background:#111;color:#0f0;font:11px monospace;padding:4px 8px;opacity:0.8;z-index:9999;';
document.body.appendChild(debugBox);

const logContent = document.getElementById('logContent');

function debug(message) {
  if (debugBox) {
    debugBox.textContent = message;
  }
  if (!logContent) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContent.appendChild(line);
  while (logContent.children.length > 200) {
    logContent.removeChild(logContent.firstChild);
  }
  logContent.scrollTop = logContent.scrollHeight;
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
  seatStatus.textContent = 'Active Seat: Physicist';
  councilDot.classList.remove('red');
  councilDot.classList.add('green');
  addMessage('Throne', `Council assembled on "${topic}"`, 'left');
  debug(`Council: session started with topic "${topic}"`);
};

// send a manual turn/seed
sendBtn.onclick = async () => {
  const text = seedInput.value.trim();
  if (!text) return;

  addMessage('You', text, 'left');
  debug('Send: ⏳ Thinking...');
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳ Thinking...';

  try {
    await window.CouncilAPI.sendSeed(text);
    debug('Send: ✅ Reply received.');
  } catch (err) {
    debug(`Send error: ${err?.message || err}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    seedInput.value = '';
  }
};

// receive streamed council messages
window.CouncilAPI.on('council-response', (text) => {
  debug(`Council: ${text}`);
  const m = /^([A-Za-z ]+):\s*(.*)$/.exec(text || '');
  if (m && m[1] && m[2]) {
    addMessage(m[1], m[2], 'right');
    seatStatus.textContent = `Active Seat: ${m[1]}`;
    councilDot.classList.remove('red');
    councilDot.classList.add('green');
    return;
  }

  if (typeof text === 'string' && text.startsWith('Throne:')) {
    const cleaned = text.replace(/^Throne:\s*/, '');
    addMessage('Throne', cleaned, 'left');
    seatStatus.textContent = 'Active Seat: Throne';
    councilDot.classList.remove('red');
    councilDot.classList.add('green');
  } else {
    addMessage('Throne', text, 'left');
    seatStatus.textContent = 'Active Seat: Throne';
  }
});

window.CouncilAPI.on('hud-status', (msg) => {
  debug(`HUD: ${msg}`);
});

window.CouncilAPI.on('system-log', (entry) => {
  if (entry) {
    debug(`System: ${entry}`);
  }
});

// (optional) update active seat from backend hooks
window.CouncilAPI.on('seat-change', (role) => {
  seatStatus.textContent = `Active Seat: ${role}`;
  councilDot.classList.remove('red');
  councilDot.classList.add('green');
});

// request seats on load so Options can render
window.addEventListener('DOMContentLoaded', () => {
  debug('Initializing seat list...');
  window.CouncilAPI.getSeats();
});
