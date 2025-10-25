// preload.js
// Secure bridge so the renderer can talk to the main process.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('CouncilAPI', {
  // Session control
  startSession: (topic) => ipcRenderer.send('start-session', topic),
  sendSeed: (text) => ipcRenderer.send('seed', text),

  // Options drawer
  getSeats: () => ipcRenderer.send('get-seats'),
  updateSeat: (name, model) => ipcRenderer.send('update-seat', { name, model }),

  // Archive
  listArchive: () => ipcRenderer.send('list-archive'),
  loadArchive: (name) => ipcRenderer.send('load-archive', name),

  // Generic listener helper
  on: (channel, fn) => ipcRenderer.on(channel, (_evt, payload) => fn(payload))
});
