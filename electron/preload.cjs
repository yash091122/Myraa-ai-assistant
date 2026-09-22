// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  popOut: () => import_electron.ipcRenderer.send("pop-out"),
  restoreWindow: () => import_electron.ipcRenderer.send("restore-window"),
  quitApp: () => import_electron.ipcRenderer.send("quit-app")
});
