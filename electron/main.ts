import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    transparent: true, // Crucial for widget mode
    frame: false,      // Crucial for widget mode
    hasShadow: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the web app
  mainWindow.loadURL('http://localhost:3001');

  // IPC listeners
  ipcMain.on('pop-out', () => {
    if (mainWindow) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      
      const widgetWidth = 380;
      const widgetHeight = 480;
      
      mainWindow.setMinimumSize(widgetWidth, widgetHeight);
      mainWindow.setSize(widgetWidth, widgetHeight, true);
      
      // Position at bottom right corner
      mainWindow.setPosition(width - widgetWidth - 20, height - widgetHeight - 20, true);
      
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  ipcMain.on('restore-window', () => {
    if (mainWindow) {
      mainWindow.setMinimumSize(800, 600);
      mainWindow.setSize(1200, 800, true);
      mainWindow.center();
      mainWindow.setAlwaysOnTop(false);
    }
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
