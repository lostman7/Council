// renderer/options.js
// Populates the options drawer from main and lets you change models.

const optionsBtn = document.getElementById('optionsBtn');

let drawer;
let drawerInitialized = false;
function ensureDrawer() {
  if (drawer) return drawer;
  drawer = document.createElement('div');
  drawer.id = 'optionsDrawer';
  drawer.classList.add('hidden');
  drawer.innerHTML = `
    <div class="options-header">
      <h3>Council Options</h3>
      <button id="closeOptionsDrawer">×</button>
    </div>
    <label class="auto-rotate-row">
      <input type="checkbox" id="autoRotateToggle" checked /> Auto-rotate Seats
    </label>
    <div id="seatList"></div>
  `;
  document.body.appendChild(drawer);
  document.getElementById('closeOptionsDrawer').onclick = () => drawer.classList.add('hidden');
  if (!drawerInitialized) {
    drawer.addEventListener('change', handleDrawerChange);
    drawerInitialized = true;
  }
  return drawer;
}

optionsBtn.onclick = () => {
  ensureDrawer();
  drawer.classList.toggle('hidden');
  window.CouncilAPI.getSeats();
};

// Render the seat list when main replies
window.CouncilAPI.on('seats-list', (all) => {
  ensureDrawer();
  const container = drawer.querySelector('#seatList');
  container.innerHTML = '';

  if (!all || Object.keys(all).length === 0) {
    container.innerHTML = `<p style="color:#888;text-align:center;">
      (No seats loaded. Try restarting or checking Ollama.)
    </p>`;
    return;
  }

  Object.entries(all).forEach(([name, cfg]) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    const enabled = cfg?.enabled !== false;
    const variantCount = typeof cfg?.variants === 'number' ? cfg.variants : 0;
    const variantLabel = variantCount ? `${variantCount} variants` : '—';
    row.innerHTML = `
      <label class="seat-label">
        <input type="checkbox" class="seat-toggle" data-seat="${name}" ${enabled ? 'checked' : ''} />
        <span>${name}</span>
      </label>
      <input type="text" value="${cfg?.model || ''}" data-seat="${name}" />
      <span class="variant-count">${variantLabel}</span>
    `;
    container.appendChild(row);
  });

});

window.CouncilAPI.on('auto-rotate-state', (state) => {
  ensureDrawer();
  const toggle = drawer.querySelector('#autoRotateToggle');
  if (toggle) {
    toggle.checked = Boolean(state);
  }
});

window.CouncilAPI.on('seats-updated', ({ name, model, enabled }) => {
  ensureDrawer();
  if (model !== undefined) {
    const input = drawer.querySelector(`input[data-seat="${name}"]`);
    if (input && input.value !== model) {
      input.value = model;
    }
    appendLog(`Seat updated: ${name} → ${model}`);
  }
  if (enabled !== undefined) {
    const toggle = drawer.querySelector(`input.seat-toggle[data-seat="${name}"]`);
    if (toggle) {
      toggle.checked = Boolean(enabled);
    }
    appendLog(`Seat ${name} ${enabled ? 'enabled' : 'disabled'}`);
  }
});

function handleDrawerChange(event) {
  const target = event.target;
  if (!target) return;

  if (target.matches('input[data-seat]')) {
    window.CouncilAPI.updateSeat(target.dataset.seat, target.value.trim());
    return;
  }

  if (target.matches('input.seat-toggle[data-seat]')) {
    window.CouncilAPI.setSeatEnabled(target.dataset.seat, target.checked);
    appendLog(`Seat ${target.dataset.seat} ${target.checked ? 'enabled' : 'disabled'}`);
    return;
  }

  if (target.id === 'autoRotateToggle') {
    window.CouncilAPI.toggleAutoRotate(target.checked);
    appendLog(`Auto-rotate ${target.checked ? 'enabled' : 'disabled'}`);
  }
}

function appendLog(message) {
  const logPanel = document.getElementById('councilLogs');
  if (!logPanel) return;
  const line = document.createElement('div');
  const serialised =
    typeof message === 'string'
      ? message
      : JSON.stringify(message) ?? String(message ?? '');
  const text = serialised || '';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logPanel.appendChild(line);
  while (logPanel.children.length > 200) {
    logPanel.removeChild(logPanel.firstChild);
  }
}
