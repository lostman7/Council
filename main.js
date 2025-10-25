import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import * as throne from './core/throne.js';
import * as seats from './core/seats.js';
import { summarize } from './core/thinker.js';
import { initVectorCache } from './memory/vectorCache.js';
import { getStats } from './core/telemetry.js';
import { refreshPool } from './core/pool.js';
import { getHarmonicState } from './core/harmony.js';
import {
  initArchive,
  latestSummary,
  listSessions,
  loadSession
} from './core/continuum.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let lastPoolSignature = '';

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

app.whenReady().then(async () => {
  createWindow();
  await initArchive();
  const previousEchoes = latestSummary();
  await throne.initThrone(win);
  await initVectorCache('./flowfield_docs');
  scheduleOpticalThinker();
  startTelemetryLoop();

  if (win) {
    win.webContents.once('did-finish-load', () => {
      if (previousEchoes) {
        win.webContents.send(
          'council-response',
          `Throne: Recalling previous echoes...\n${previousEchoes}`
        );
      }
    });
  }

  setTimeout(() => {
    if (!win) return;
    const starter =
      'Flowfield: begin council on unification protocol; Physicist then Engineer, then summarize.';
    win.webContents.send('council-response', `Throne: Seeding — "${starter}"`);
    throne.startSession(starter, win).catch((e) => {
      console.error('auto seed error:', e);
      win.webContents.send(
        'council-response',
        `Throne: (auto-seed error) ${e.message}`
      );
    });
  }, 3500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('saveSettings', (_, config) => {
  const confPath = path.join(os.homedir(), '.council_config.json');
  fs.writeFileSync(confPath, JSON.stringify(config, null, 2));
  console.log('Council settings saved:', config);
  if (win) {
    const stamp = new Date().toLocaleTimeString();
    win.webContents.send('system-log', `[${stamp}] Settings updated.`);
  }
});

ipcMain.on('start-session', async (_evt, topic) => {
  try {
    await throne.startSession(topic, win);
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
    await throne.handleSeed(text, win);
  } catch (e) {
    console.error('seed error:', e);
    if (win) {
      win.webContents.send('council-response', `Throne: (seed error) ${e.message}`);
    }
  }
});

ipcMain.on('get-seats', (evt) => {
  const all = seats.getSeats().reduce((acc, name) => {
    acc[name] = seats.getSeatConfig(name);
    return acc;
  }, {});
  evt.sender.send('seats-list', all);
});

ipcMain.on('update-seat', (_evt, { name, model }) => {
  try {
    const updated = seats.updateSeatModel(name, model);
    if (!updated) return;
    if (win) {
      win.webContents.send('seats-updated', { name, model });
    }
  } catch (e) {
    console.error('update-seat error:', e);
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

const THINKER_INTERVAL_MS = 15 * 60 * 1000;
const TELEMETRY_INTERVAL_MS = 5 * 1000;

function scheduleOpticalThinker() {
  setInterval(async () => {
    const log = throne.getThroneLog(30);
    if (!log.length) {
      return;
    }

    const summary = await summarize('Throne', log);
    await throne.recordSummary(summary, { win, broadcast: false });
    console.log('[Optical Thinker Tick]', summary);
  }, THINKER_INTERVAL_MS);
}

function startTelemetryLoop() {
  const sendTelemetry = async (forcePool = false) => {
    if (!win) return;

    const stats = await getStats();
    const poolList = await refreshPool(forcePool);
    const poolSignature = poolList.join(',');
    if (poolSignature !== lastPoolSignature) {
      lastPoolSignature = poolSignature;
      const stamp = new Date().toLocaleTimeString();
      win.webContents.send('system-log', `[${stamp}] Pool: ${poolSignature || 'no models loaded'}`);
    }

    const metrics = throne.getThroneMetrics();
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
