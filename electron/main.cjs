var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var path = __toESM(require("path"), 1);
var mainWindow = null;
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1200,
    height: 800,
    transparent: true,
    // Crucial for widget mode
    frame: false,
    // Crucial for widget mode
    hasShadow: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadURL("http://localhost:3001");
  import_electron.ipcMain.on("pop-out", () => {
    if (mainWindow) {
      const primaryDisplay = import_electron.screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      const widgetWidth = 380;
      const widgetHeight = 480;
      mainWindow.setMinimumSize(widgetWidth, widgetHeight);
      mainWindow.setSize(widgetWidth, widgetHeight, true);
      mainWindow.setPosition(width - widgetWidth - 20, height - widgetHeight - 20, true);
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    }
  });
  import_electron.ipcMain.on("restore-window", () => {
    if (mainWindow) {
      mainWindow.setMinimumSize(800, 600);
      mainWindow.setSize(1200, 800, true);
      mainWindow.center();
      mainWindow.setAlwaysOnTop(false);
    }
  });
  import_electron.ipcMain.on("quit-app", () => {
    import_electron.app.quit();
  });
}
import_electron.app.whenReady().then(() => {
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
