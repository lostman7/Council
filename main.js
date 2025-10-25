import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import * as throne from './core/throne.js';
import { summarize } from './core/thinker.js';
import { initVectorCache } from './memory/vectorCache.js';
import { getStats } from './core/telemetry.js';
import { refreshPool } from './core/pool.js';

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
  await throne.initThrone(win);
  await initVectorCache('./flowfield_docs');
  scheduleOpticalThinker();
  startTelemetryLoop();
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

ipcMain.on('seed', async (_, msg) => {
  await throne.handleSeed(msg, win);
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
    win.webContents.send('telemetry-update', {
      stats,
      pool: poolList,
      metrics
    });
  };

  sendTelemetry(true);
  setInterval(sendTelemetry, TELEMETRY_INTERVAL_MS);
}
