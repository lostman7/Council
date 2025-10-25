const hudContainer = document.getElementById('hud-container');
const hudToggle = document.getElementById('hud-toggle');
const hudText = document.getElementById('hud-text');
const logToggleBtn = document.getElementById('toggleLogs');
const exportBtn = document.getElementById('exportLog');
const logPanel = document.getElementById('councilLogs');
const seatStatusPanel = document.getElementById('seatStatus');
const logAppender = createLogAppender(logPanel);
const toast = createToast();

const metricsState = {
  seat: 'Idle',
  topic: '—',
  tokens: 0,
  summaryAt: null,
  entropy: 0,
  lead: '—',
  ram: '0.0%',
  gpu: 'n/a',
  models: '—',
  updatedAt: null
};

updateHudText();

if (hudToggle && hudContainer) {
  const initHudToggle = () => {
    hudToggle.textContent = hudContainer.classList.contains('collapsed') ? '▲' : '▼';
    hudToggle.addEventListener('click', () => {
      hudContainer.classList.toggle('collapsed');
      hudToggle.textContent = hudContainer.classList.contains('collapsed') ? '▲' : '▼';
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHudToggle, { once: true });
  } else {
    initHudToggle();
  }
}

if (logToggleBtn && logPanel) {
  logToggleBtn.addEventListener('click', () => {
    logPanel.classList.toggle('visible');
  });
}

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    window.CouncilAPI?.exportLog?.();
  });
}

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on('seat-change', (role) => {
    metricsState.seat = role || 'Idle';
    updateHudText();
  });

  window.CouncilAPI.on('telemetry-update', ({ stats, pool, metrics, harmony }) => {
    if (metrics) {
      metricsState.seat = metrics.activeSeat ?? metricsState.seat;
      metricsState.topic = metrics.sessionTopic ? truncate(metrics.sessionTopic, 40) : '—';
      metricsState.tokens = metrics.contextTokens ?? metricsState.tokens;
      metricsState.summaryAt = metrics.lastSummaryAt ?? metricsState.summaryAt;
    }

    if (stats) {
      const ramValue = stats.ramUsage ?? '0.0';
      const gpuValue = stats.gpuUsage ?? 'n/a';
      metricsState.ram = typeof ramValue === 'string' && ramValue.endsWith('%') ? ramValue : `${ramValue}%`;
      metricsState.gpu = gpuValue === 'n/a' ? 'n/a' : `${gpuValue}%`;
      metricsState.updatedAt = stats.timestamp ?? metricsState.updatedAt;
    }

    if (Array.isArray(pool) && pool.length) {
      metricsState.models = pool.join(', ');
    } else {
      metricsState.models = '—';
    }

    if (harmony) {
      const entropyValue = typeof harmony.entropy === 'number' ? harmony.entropy : 0;
      metricsState.entropy = entropyValue;
      const leadEntry = Object.entries(harmony.weights || {})
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)[0];
      metricsState.lead = leadEntry || '—';
      updateHarmonyBackdrop(entropyValue);
    }

    updateHudText();
  });

  window.CouncilAPI.on('new-seed', (seed) => {
    if (seed) {
      logAppender(`New seed issued: ${seed}`);
    }
  });

  window.CouncilAPI.on('system-log', (message) => {
    if (message) {
      logAppender(`System: ${message}`);
      showToast(message);
    }
  });
}

if (window.CouncilAPI?.onSeatUpdate && seatStatusPanel) {
  window.CouncilAPI.onSeatUpdate((seats) => {
    if (!Array.isArray(seats) || !seats.length) {
      seatStatusPanel.innerHTML = '<div class="seatStat offline">No seats active</div>';
      return;
    }
    seatStatusPanel.innerHTML = seats
      .map(({ name, state, icon }) => {
        const glyph = icon ? `${icon} ` : '';
        return `<div class="seatStat ${String(state).toLowerCase()}">${glyph}${name}: ${state}</div>`;
      })
      .join('');
  });
}

function createLogAppender(panel) {
  if (!panel) {
    return () => {};
  }
  return (message) => {
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    panel.appendChild(entry);
    if (panel.children.length > 300) {
      panel.removeChild(panel.firstChild);
    }
    panel.scrollTop = panel.scrollHeight;
  };
}

function createToast() {
  const el = document.createElement('div');
  el.id = 'hudToast';
  document.body.appendChild(el);
  return el;
}

let toastTimeout;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}

function formatTimestamp(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

function truncate(text, max) {
  if (typeof text !== 'string') return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function updateHarmonyBackdrop(entropy) {
  const body = document.body;
  if (!body) return;
  body.classList.remove('harmonic-low', 'harmonic-mid', 'harmonic-high');

  let target = 'harmonic-low';
  if (entropy >= 3) {
    target = 'harmonic-high';
  } else if (entropy >= 1.5) {
    target = 'harmonic-mid';
  }

  body.classList.add(target);
}

function updateHudText() {
  if (!hudText) return;
  const parts = [
    `Seat: ${metricsState.seat}`,
    `Topic: ${metricsState.topic}`,
    `Entropy ${metricsState.entropy.toFixed(2)}`,
    `Lead ${metricsState.lead}`,
    `Tokens ${metricsState.tokens}`,
    `Thinker ${formatTimestamp(metricsState.summaryAt)}`,
    `RAM ${metricsState.ram}`,
    `GPU ${metricsState.gpu}`,
    `Models: ${metricsState.models}`,
    `Updated ${formatTimestamp(metricsState.updatedAt)}`
  ];
  hudText.textContent = parts.join(' — ');
}
