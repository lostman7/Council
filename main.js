import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initThrone,
  startSession,
  handleSeed,
  getThroneLog,
  recordSummary,
  getThroneMetrics
} from './core/throne.js';
import * as seats from './core/seats.js';
import { summarize } from './core/thinker.js';
import { initVectorCache } from './memory/vectorCache.js';
import { getStats, setTelemetryTarget, resetSeatStates } from './core/telemetry.js';
import { refreshPool } from './core/pool.js';
import { getHarmonicState } from './core/harmony.js';
import {
  initArchive,
  latestSummary,
  listSessions,
  loadSession
} from './core/continuum.js';
import { loadContinuumState } from './core/continuum_recall.js';
import { exportCouncilLog } from './core/exporter.js';
import { getSafeMode, setSafeMode } from './core/dispatcher.js';
import { saveConfig as persistConfig } from './core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let lastPoolSignature = '';
let lastStats = null;
let lastPool = [];

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    backgroundColor: '#0b0c0f',
    title: 'Council',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
}

async function checkOllama(targetWin) {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) {
      throw new Error(`unexpected status ${res.status}`);
    }
    const data = await res.json();
    const modelCount = Array.isArray(data?.models) ? data.models.length : 0;
    console.log(`✅ Ollama OK — Models: ${modelCount}`);
    if (targetWin) {
      targetWin.webContents.send('hud-status', 'Ollama online');
    }
    return true;
  } catch (e) {
    console.error('❌ Ollama unreachable:', e.message);
    if (targetWin) {
      targetWin.webContents.send('hud-status', 'Ollama offline');
    }
    return false;
  }
}

app.whenReady().then(async () => {
  createWindow();
  setTelemetryTarget(win);
  await initArchive();
  await seats.initializeSeatRegistry();
  const previousEchoes = latestSummary();
  const recall = loadContinuumState();

  if (recall?.seats) {
    seats.resetSeats(recall.seats);
  }
  if (recall?.harmony) {
    globalThis.__councilHarmony__ = recall.harmony;
  }

  await initThrone(win);
  await initVectorCache('./flowfield_docs');
  scheduleOpticalThinker();
  startTelemetryLoop();

  let initialOllama = false;

  if (recall) {
    initialOllama = await checkOllama(win);
  }

  if (win) {
    win.webContents.once('did-finish-load', async () => {
      if (previousEchoes) {
        win.webContents.send(
          'council-response',
          `Throne: Recalling previous echoes...\n${previousEchoes}`
        );
      }

      if (recall) {
        const topicLabel = recall.topic || 'Unnamed Continuum';
        win.webContents.send(
          'council-response',
          `Throne: Remembering prior topic — “${topicLabel}”.`
        );
        const ready = initialOllama || (await checkOllama(win));
        if (ready) {
          try {
            await startSession(`${topicLabel} (continuation)`, win);
          } catch (err) {
            console.error('continuum resume error:', err);
            win.webContents.send(
              'council-response',
              `Throne: Unable to resume continuum — ${err.message}`
            );
          }
        } else {
          win.webContents.send(
            'council-response',
            'Throne: Ollama offline — cannot resume continuum.'
          );
        }
      } else {
        win.webContents.send(
          'council-response',
          'Throne: No prior memory found — standing by for your first message.'
        );
      }
    });
  }

  // Skip early Ollama probing when launching fresh sessions; checks occur on demand.
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('saveSettings', async (_evt, config) => {
  try {
    await persistConfig(config || {});
    console.log('Council settings saved via persistConfig');
    if (win) {
      const stamp = new Date().toLocaleTimeString();
      win.webContents.send('system-log', `[${stamp}] Settings updated.`);
    }
  } catch (err) {
    console.error('Failed to persist settings:', err);
  }
});

ipcMain.on('get-safe-mode', (event) => {
  event.sender.send('safe-mode-state', getSafeMode());
});

ipcMain.on('toggle-safe-mode', (_event, enabled) => {
  const state = setSafeMode(Boolean(enabled));
  if (win) {
    const stamp = new Date().toLocaleTimeString();
    win.webContents.send('system-log', `[${stamp}] Safe Mode: ${state ? 'ON' : 'OFF'}`);
    win.webContents.send('safe-mode-state', state);
  }
});

ipcMain.on('start-session', async (_evt, topic) => {
  try {
    await startSession(topic, win);
  } catch (e) {
    console.error('start-session error:', e);
    if (win) {
      win.webContents.send(
        'council-response',
        `Throne: (error starting session) ${e.message}`
      );
    }
  }
});

ipcMain.on('seed', async (_evt, text) => {
  try {
    await handleSeed(text, win);
  } catch (e) {
    console.error('seed error:', e);
    if (win) {
      win.webContents.send('council-response', `Throne: (seed error) ${e.message}`);
    }
  }
});


ipcMain.on('describe-council', async (event) => {
  try {
    const pool = await refreshPool();
    seats.updateModelPool(pool);
    event.sender.send('council-description', {
      safeMode: getSafeMode(),
      poolCount: pool.length,
      seatPlan: seats.getSeatExecutionPlan()
    });
  } catch (err) {
    console.error('describe-council error:', err);
    event.sender.send('council-description', {
      safeMode: getSafeMode(),
      poolCount: 0,
      seatPlan: seats.getSeatExecutionPlan()
    });
  }
});

ipcMain.on('get-seats', async (evt) => {
  try {
    const pool = await refreshPool();
    seats.updateModelPool(pool);
    evt.sender.send('seats-list', {
      seats: seats.getAllSeatConfigs(),
      pool
    });
  } catch (err) {
    console.error('get-seats error:', err);
    evt.sender.send('seats-list', {
      seats: seats.getAllSeatConfigs(),
      pool: []
    });
  }
});

ipcMain.on('update-seat', (_evt, { name, model }) => {
  try {
    seats.updateSeatModel(name, model);
    if (win) {
      win.webContents.send('seats-updated', { name, model });
      resetSeatStates(seats.getSeats());
    }
  } catch (e) {
    console.error('update-seat error:', e);
  }
});

ipcMain.on('set-seat-enabled', (_evt, { name, enabled }) => {
  try {
    seats.setSeatEnabled(name, enabled);
    if (win) {
      win.webContents.send('seats-updated', { name, enabled });
      resetSeatStates(seats.getSeats());
    }
  } catch (e) {
    console.error('set-seat-enabled error:', e);
  }
});

ipcMain.on('list-archive', (event) => {
  const sessions = listSessions();
  event.sender.send('archive-list', sessions);
});

ipcMain.on('load-archive', (event, name) => {
  const content = loadSession(name);
  event.sender.send('archive-content', content);
});

ipcMain.on('export-chat', async (event) => {
  try {
    const file = await exportCouncilLog();
    event.sender.send('system-log', `Exported council log → ${file}`);
  } catch (err) {
    console.error('export-chat error:', err);
    event.sender.send('system-log', `Export failed: ${err.message || err}`);
  }
});

const THINKER_INTERVAL_MS = 15 * 60 * 1000;
const TELEMETRY_INTERVAL_MS = 5 * 1000;

function scheduleOpticalThinker() {
  setInterval(async () => {
    const log = getThroneLog(30);
    if (!log.length) {
      return;
    }

    const summary = await summarize('Throne', log);
    await recordSummary(summary, { win, broadcast: false });
    console.log('[Optical Thinker Tick]', summary);
  }, THINKER_INTERVAL_MS);
}

function startTelemetryLoop() {
  const sendTelemetry = async (forcePool = false) => {
    if (!win) return;

    const stats = await getStats();
    lastStats = stats;
    const poolList = await refreshPool(forcePool);
    lastPool = poolList;
    seats.updateModelPool(poolList);
    const poolSignature = poolList.join(',');
    if (poolSignature !== lastPoolSignature) {
      lastPoolSignature = poolSignature;
      const stamp = new Date().toLocaleTimeString();
      win.webContents.send('system-log', `[${stamp}] Pool: ${poolSignature || 'no models loaded'}`);
    }

    const metrics = getThroneMetrics();
    const harmony = getHarmonicState();
    win.webContents.send('telemetry-update', {
      stats,
      pool: poolList,
      metrics,
      harmony
    });
  };

  sendTelemetry(true);
  setInterval(sendTelemetry, TELEMETRY_INTERVAL_MS);
}
