import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import * as throne from './core/throne.js';
import { initVectorCache } from './memory/vectorCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('saveSettings', (_, config) => {
  const confPath = path.join(os.homedir(), '.council_config.json');
  fs.writeFileSync(confPath, JSON.stringify(config, null, 2));
  console.log('Council settings saved:', config);
});

ipcMain.on('seed', async (_, msg) => {
  await throne.handleSeed(msg, win);
});
