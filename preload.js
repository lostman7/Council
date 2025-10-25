import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('CouncilAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, listener) => ipcRenderer.on(channel, (_, args) => listener(args))
});
