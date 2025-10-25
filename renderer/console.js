export function setupConsoleOverlay() {
  const existing = document.getElementById('consoleOverlay');
  if (existing) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'console-overlay hidden';
  wrapper.id = 'consoleOverlay';

  const toggle = document.createElement('button');
  toggle.textContent = 'Logs ▼';
  toggle.className = 'console-toggle';
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    wrapper.classList.toggle('hidden');
    toggle.textContent = wrapper.classList.contains('hidden') ? 'Logs ▼' : 'Logs ▲';
  });

  document.body.appendChild(wrapper);
  document.body.appendChild(toggle);

  const pushLine = (message) => {
    if (!message) return;
    const line = document.createElement('div');
    line.textContent = message;
    wrapper.appendChild(line);
    wrapper.scrollTop = wrapper.scrollHeight;
  };

  const api = window.CouncilAPI || {};
  if (typeof api.onSystemLog === 'function') {
    api.onSystemLog((msg) => {
      pushLine(msg);
    });
  }

  if (typeof api.on === 'function') {
    api.on('system-log', (msg) => pushLine(msg));
  }
}

document.addEventListener('DOMContentLoaded', setupConsoleOverlay);
