const sendBtn = document.getElementById('sendBtn');
const startSessionBtn = document.getElementById('startSessionBtn');
const seedInput = document.getElementById('seedInput');

const recallBtn = document.createElement('button');
recallBtn.id = 'recallSessionBtn';
recallBtn.textContent = 'Recall Session';
recallBtn.onclick = () => {
  if (window.CouncilAPI?.send) {
    window.CouncilAPI.send('list-archive');
  }
};
document.body.prepend(recallBtn);

const optionsBtn = document.getElementById('optionsBtn');
const councilDot = document.getElementById('councilDot');
const seatStatus = document.getElementById('seatStatus');

function addMessage(sender, text, side) {
  const msg = document.createElement('div');
  msg.className = 'message';
  msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
  document.getElementById(side).appendChild(msg);
  msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function setCouncilDot(state) {
  councilDot.classList.remove('red', 'green');
  councilDot.classList.add(state === 'active' ? 'green' : 'red');
}

document.addEventListener('DOMContentLoaded', () => {
  addMessage('Throne', 'Council loaded. Awaiting session seed...', 'left');
  setCouncilDot('idle');
});

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on('council-response', (payload) => {
    const { sender, message } = parseSeatPayload(payload);
    const side = sender === 'Throne' || sender === 'Optical Thinker' ? 'left' : 'right';
    addMessage(sender, message, side);
  });

  window.CouncilAPI.on('seat-change', (role) => {
    seatStatus.textContent = `Active Seat: ${role}`;
    setCouncilDot(role === 'Idle' ? 'idle' : 'active');
  });

  window.CouncilAPI.on('archive-list', (sessions) => {
    if (!Array.isArray(sessions) || !sessions.length) {
      window.alert('No archived sessions yet.');
      return;
    }
    const selection = window.prompt('Choose session to recall:\n' + sessions.join('\n'));
    if (selection && window.CouncilAPI?.send) {
      window.CouncilAPI.send('load-archive', selection);
    }
  });

  window.CouncilAPI.on('archive-content', (text) => {
    const snippet = typeof text === 'string' ? text.slice(-1000) : '(invalid session data)';
    window.alert(`Recalled Memory:\n${snippet}`);
  });
}

optionsBtn.onclick = () => {
  if (window.CouncilOptions?.toggle) {
    window.CouncilOptions.toggle();
  }
};

sendBtn.onclick = () => {
  const seed = seedInput.value.trim();
  if (!seed) return;
  addMessage('User', seed, 'left');
  if (window.CouncilAPI?.send) {
    window.CouncilAPI.send('seed', seed);
  }
  seedInput.value = '';
};

startSessionBtn.onclick = () => {
  const topic = seedInput.value.trim();
  if (!topic) {
    const promptTopic = window.prompt('Seed topic for the Council:');
    if (!promptTopic) return;
    sendStartSession(promptTopic);
    return;
  }
  sendStartSession(topic);
};

function sendStartSession(topic) {
  addMessage('User', topic, 'left');
  if (window.CouncilAPI?.send) {
    window.CouncilAPI.send('start-session', topic);
  }
  seedInput.value = '';
}

function parseSeatPayload(payload) {
  if (typeof payload !== 'string') {
    return { sender: 'Seat', message: '' };
  }
  const separatorIndex = payload.indexOf(':');
  if (separatorIndex === -1) {
    return { sender: 'Seat', message: payload };
  }
  const sender = payload.slice(0, separatorIndex).trim() || 'Seat';
  const message = payload.slice(separatorIndex + 1).trim();
  return { sender, message };
}
