const hud = document.createElement('div');
hud.id = 'hud';

const metricsGroup = document.createElement('div');
metricsGroup.className = 'hud-metrics';

const seatSpan = createSpan('Seat: Idle');
const topicSpan = createSpan('Topic: —');
const entropySpan = createSpan('Entropy 0.00');
const leadSpan = createSpan('Lead —');
const tokenSpan = createSpan('Tokens 0');
const summarySpan = createSpan('Thinker —');
const ramSpan = createSpan('RAM 0.0%');
const gpuSpan = createSpan('GPU n/a');
const modelsSpan = createSpan('Models: —');
const updatedSpan = createSpan('Updated —');

metricsGroup.append(
  seatSpan,
  topicSpan,
  entropySpan,
  leadSpan,
  tokenSpan,
  summarySpan,
  ramSpan,
  gpuSpan,
  modelsSpan,
  updatedSpan
);

const controlsGroup = document.createElement('div');
controlsGroup.className = 'hud-controls';
hud.append(metricsGroup, controlsGroup);
document.body.appendChild(hud);

const logToggleBtn = document.getElementById('toggleLogs');
const logPanel = document.getElementById('councilLogs');
const seatStatusPanel = document.getElementById('seatStatus');
const logAppender = createLogAppender(logPanel);

if (logToggleBtn && logPanel) {
  logToggleBtn.addEventListener('click', () => {
    logPanel.classList.toggle('visible');
  });
}

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on('seat-change', (role) => {
    seatSpan.textContent = `Seat: ${role}`;
  });

  window.CouncilAPI.on('telemetry-update', ({ stats, pool, metrics, harmony }) => {
    if (metrics) {
      seatSpan.textContent = `Seat: ${metrics.activeSeat ?? 'Idle'}`;
      topicSpan.textContent = `Topic: ${metrics.sessionTopic ? truncate(metrics.sessionTopic, 40) : '—'}`;
      tokenSpan.textContent = `Tokens ${metrics.contextTokens ?? 0}`;
      summarySpan.textContent = `Thinker ${formatTimestamp(metrics.lastSummaryAt)}`;
    }

    if (stats) {
      const ramValue = stats.ramUsage ?? '0.0';
      const gpuValue = stats.gpuUsage ?? 'n/a';
      ramSpan.textContent = `RAM ${ramValue}${typeof ramValue === 'string' && ramValue.endsWith('%') ? '' : '%'}`;
      gpuSpan.textContent = `GPU ${gpuValue === 'n/a' ? 'n/a' : `${gpuValue}%`}`;
      updatedSpan.textContent = `Updated ${formatTimestamp(stats.timestamp)}`;
    }

    modelsSpan.textContent = `Models: ${Array.isArray(pool) && pool.length ? pool.join(', ') : '—'}`;

    if (harmony) {
      const entropyValue = typeof harmony.entropy === 'number' ? harmony.entropy : 0;
      entropySpan.textContent = `Entropy ${entropyValue.toFixed(2)}`;
      const leadEntry = Object.entries(harmony.weights || {})
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)[0];
      leadSpan.textContent = `Lead ${leadEntry || '—'}`;
      updateHarmonyBackdrop(entropyValue);
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

if (window.CouncilAPI?.on) {
  window.CouncilAPI.on('new-seed', (seed) => {
    if (seed) {
      logAppender(`New seed issued: ${seed}`);
    }
  });
}

function createSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
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
