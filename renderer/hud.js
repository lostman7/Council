const hud = document.createElement('div');
hud.id = 'hud';

const metricsGroup = document.createElement('div');
metricsGroup.className = 'hud-metrics';

const seatSpan = createSpan('Seat: Idle');
const topicSpan = createSpan('Topic: —');
const entropySpan = createSpan('Entropy 0.00');
const leadSpan = createSpan('Lead —');
const ramSpan = createSpan('RAM 0.0%');
const gpuSpan = createSpan('GPU n/a');
const tokenSpan = createSpan('Tokens 0');
const summarySpan = createSpan('Thinker —');
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
const logToggle = document.createElement('button');
logToggle.id = 'logToggle';
logToggle.type = 'button';
logToggle.textContent = 'Logs';
controlsGroup.appendChild(logToggle);

hud.append(metricsGroup, controlsGroup);
document.body.appendChild(hud);

const logDrawer = document.createElement('div');
logDrawer.id = 'logDrawer';
logDrawer.classList.add('hidden');
const logTitle = document.createElement('div');
logTitle.className = 'log-title';
logTitle.textContent = 'Council System Log';
const logContent = document.createElement('div');
logContent.className = 'log-content';
logDrawer.append(logTitle, logContent);
document.body.appendChild(logDrawer);

logToggle.addEventListener('click', () => {
  logDrawer.classList.toggle('hidden');
});

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

  window.CouncilAPI.on('system-log', (entry) => {
    appendLogEntry(entry);
  });
}

function appendLogEntry(entry) {
  if (!entry) return;
  const line = document.createElement('div');
  line.className = 'log-entry';
  line.textContent = entry;
  logContent.appendChild(line);
  logContent.scrollTop = logContent.scrollHeight;
  trimLog();
}

function trimLog(maxEntries = 100) {
  while (logContent.children.length > maxEntries) {
    logContent.removeChild(logContent.firstChild);
  }
}

function createSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
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
