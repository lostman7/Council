// renderer/app.js
// Wires the buttons and prints messages into the two columns.

const leftCol = document.getElementById('left');
const rightCol = document.getElementById('right');

const seedInput = document.getElementById('seedInput');
const startSessionBtn = document.getElementById('startSessionBtn');
const sendBtn = document.getElementById('sendBtn');
const seatStatus = document.getElementById('seatStatus');
const councilDot = document.getElementById('councilDot');

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
};

// send a manual turn/seed
sendBtn.onclick = () => {
  const text = seedInput.value.trim();
  if (!text) return;
  window.CouncilAPI.sendSeed(text);
  addMessage('Throne', text, 'left');
  seedInput.value = '';
};

// receive streamed council messages
window.CouncilAPI.on('council-response', (text) => {
  // naive routing: if line starts with "Physicist:" etc, put on right
  const m = /^([A-Za-z ]+):\s*(.*)$/.exec(text || '');
  if (m && m[1] && m[2]) {
    addMessage(m[1], m[2], 'right');
    seatStatus.textContent = `Active Seat: ${m[1]}`;
  } else {
    addMessage('Throne', text, 'left');
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
  window.CouncilAPI.getSeats();
});
