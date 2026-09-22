import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  popOut: () => ipcRenderer.send('pop-out'),
  restoreWindow: () => ipcRenderer.send('restore-window'),
  quitApp: () => ipcRenderer.send('quit-app')
});
