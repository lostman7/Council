// preload.js
// Secure bridge so the renderer can talk to the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CouncilAPI', {
  // Session control
  startSession: (topic) => ipcRenderer.send('start-session', topic),
  sendSeed: (text) => ipcRenderer.send('seed', text),

  // Options drawer
  getSeats: () => ipcRenderer.send('get-seats'),
  updateSeat: (name, model) => ipcRenderer.send('update-seat', { name, model }),
  setSeatEnabled: (name, enabled) => ipcRenderer.send('set-seat-enabled', { name, enabled }),
  toggleAutoRotate: (enabled) => ipcRenderer.send('toggle-auto-rotate', Boolean(enabled)),

  // Archive (already in your build)
  listArchive: () => ipcRenderer.send('list-archive'),
  loadArchive: (name) => ipcRenderer.send('load-archive', name),

  exportLog: () => ipcRenderer.send('export-chat'),

  // Generic "on" listeners
  on: (channel, fn) => ipcRenderer.on(channel, (_evt, payload) => fn(payload)),
  onSeatUpdate: (fn) => ipcRenderer.on('seat-status', (_evt, payload) => fn(payload))
});
