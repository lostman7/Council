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
    <label class="safe-mode-row">
      <input type="checkbox" id="safeModeToggle" /> Safe Mode (blacklist cloud)
    </label>
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
  window.CouncilAPI.getSafeMode?.();
};

// Render the seat list when main replies
window.CouncilAPI.on('seats-list', (payload) => {
  ensureDrawer();
  const container = drawer.querySelector('#seatList');
  container.innerHTML = '';

  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const seatMap = data.seats || (payload && !Array.isArray(payload) ? payload : {});
  const globalAllowed = Array.isArray(data.allowedModels) ? data.allowedModels : [];

  if (!seatMap || Object.keys(seatMap).length === 0) {
    container.innerHTML = `<p style="color:#888;text-align:center;">
      (No seats loaded. Try restarting or checking Ollama.)
    </p>`;
    return;
  }

  Object.entries(seatMap).forEach(([name, cfg]) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    const enabled = cfg?.enabled !== false;
    const variantCount = typeof cfg?.variants === 'number' ? cfg.variants : 0;
    const variantLabel = variantCount ? `${variantCount} variants` : '—';

    const label = document.createElement('label');
    label.className = 'seat-label';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'seat-toggle';
    toggle.dataset.seat = name;
    toggle.checked = enabled;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;

    label.append(toggle, nameSpan);

    const select = document.createElement('select');
    select.className = 'model-select';
    select.dataset.seat = name;

    select.append(new Option('off', 'off'));
    select.append(new Option('auto', ''));

    const allowed = Array.isArray(cfg?.allowedModels) && cfg.allowedModels.length
      ? cfg.allowedModels
      : globalAllowed;
    allowed.forEach((modelName) => {
      if (!modelName) return;
      select.append(new Option(modelName, modelName));
    });

    if (!enabled) {
      select.value = 'off';
      select.disabled = true;
    } else if (cfg?.model) {
      select.value = cfg.model;
    } else {
      select.value = '';
    }
    select.dataset.previousValue = select.value || '';

    const variantSpan = document.createElement('span');
    variantSpan.className = 'variant-count';
    variantSpan.textContent = variantLabel;

    row.append(label, select, variantSpan);
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

if (window.CouncilAPI?.onSafeMode) {
  window.CouncilAPI.onSafeMode((state) => {
    ensureDrawer();
    const toggle = drawer.querySelector('#safeModeToggle');
    if (toggle) {
      toggle.checked = Boolean(state);
    }
  });
}

window.CouncilAPI.on('seats-updated', ({ name, model, enabled }) => {
  ensureDrawer();
  if (model !== undefined) {
    const select = drawer.querySelector(`select.model-select[data-seat="${name}"]`);
    if (select) {
      const next = model || '';
      if (select.value !== next) {
        select.value = next;
      }
      if (!next && select.disabled) {
        select.disabled = false;
      }
      select.dataset.previousValue = next;
    }
    appendLog(`Seat updated: ${name} → ${model}`);
  }
  if (enabled !== undefined) {
    const toggle = drawer.querySelector(`input.seat-toggle[data-seat="${name}"]`);
    if (toggle) {
      toggle.checked = Boolean(enabled);
    }
    const select = drawer.querySelector(`select.model-select[data-seat="${name}"]`);
    if (select) {
      if (enabled) {
        select.disabled = false;
        if (select.value === 'off') {
          select.value = '';
        }
      } else {
        select.value = 'off';
        select.disabled = true;
      }
    }
    appendLog(`Seat ${name} ${enabled ? 'enabled' : 'disabled'}`);
  }
});

function handleDrawerChange(event) {
  const target = event.target;
  if (!target) return;

  if (target.matches('input.seat-toggle[data-seat]')) {
    window.CouncilAPI.setSeatEnabled(target.dataset.seat, target.checked);
    const select = drawer.querySelector(`select.model-select[data-seat="${target.dataset.seat}"]`);
    if (select) {
      if (target.checked) {
        select.disabled = false;
        const restore = select.dataset.previousValue ?? '';
        select.value = restore;
      } else {
        if (select.value !== 'off') {
          select.dataset.previousValue = select.value;
        }
        select.value = 'off';
        select.disabled = true;
      }
    }
    appendLog(`Seat ${target.dataset.seat} ${target.checked ? 'enabled' : 'disabled'}`);
    return;
  }

  if (target.matches('select.model-select[data-seat]')) {
    const seat = target.dataset.seat;
    const value = target.value;
    const previous = target.dataset.previousValue ?? '';
    if (value === 'off') {
      window.CouncilAPI.setSeatEnabled(seat, false);
      window.CouncilAPI.updateSeat(seat, '');
      target.dataset.previousValue = previous;
      target.disabled = true;
      appendLog(`Seat ${seat} disabled via model dropdown`);
      return;
    }

    window.CouncilAPI.setSeatEnabled(seat, true);
    window.CouncilAPI.updateSeat(seat, value);
    target.dataset.previousValue = value || '';
    appendLog(`Seat ${seat} model → ${value || 'auto'}`);
    return;
  }

  if (target.id === 'safeModeToggle') {
    window.CouncilAPI.toggleSafeMode?.(target.checked);
    appendLog(`Safe Mode ${target.checked ? 'enabled' : 'disabled'}`);
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
