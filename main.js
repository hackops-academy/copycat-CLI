// -----------------------------------------------------------------------------
// CopyCat GUI v3.0 — Electron main process
// Mirror | Recon | Mindmap
// HackOps Academy — Use only on targets you are authorized to test.
// -----------------------------------------------------------------------------
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const mirror = require('./src/modules/mirror');
const recon = require('./src/modules/recon');
const extractor = require('./src/modules/extractor');
const mindmap = require('./src/modules/mindmap');
const workspace = require('./src/modules/workspace');

let mainWindow;
const APP_ICON = path.join(__dirname, 'build', 'icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#05080a',
    frame: false,
    titleBarStyle: 'hidden',
    icon: APP_ICON, // taskbar/dock icon on Linux & Windows during dev; packaged builds use build.icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.hackopsacademy.copycatgui');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ----------------- window chrome controls (frameless UI) -----------------
ipcMain.on('win:minimize', () => mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow.close());

// ----------------- helper: stream logs to renderer -----------------
function makeLogger(channel) {
  return (line) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', { channel, line });
    }
  };
}

// ----------------- IPC: workspace -----------------
ipcMain.handle('workspace:pick-root', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  workspace.setRoot(res.filePaths[0]);
  return res.filePaths[0];
});

ipcMain.handle('workspace:get-root', () => workspace.getRoot());

ipcMain.handle('workspace:open', async (evt, dir) => {
  if (dir && fs.existsSync(dir)) shell.openPath(dir);
});

// ----------------- IPC: mirror -----------------
ipcMain.handle('mirror:run', async (evt, url) => {
  const log = makeLogger('mirror');
  try {
    const result = await mirror.runMirror(url, workspace.getRoot(), log);
    return { ok: true, ...result };
  } catch (e) {
    log(`[X] ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ----------------- IPC: recon (subdomains + ports) -----------------
ipcMain.handle('recon:run', async (evt, { domain, portScan }) => {
  const log = makeLogger('recon');
  try {
    const result = await recon.runFullRecon(domain, workspace.getRoot(), portScan, log);
    return { ok: true, ...result };
  } catch (e) {
    log(`[X] ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ----------------- IPC: extractor -----------------
ipcMain.handle('extract:run', async (evt, mirrorDir) => {
  const log = makeLogger('extract');
  try {
    const result = await extractor.runExtractor(mirrorDir, log);
    return { ok: true, ...result };
  } catch (e) {
    log(`[X] ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ----------------- IPC: mindmap -----------------
ipcMain.handle('mindmap:build', async (evt, { domain, subdomainsFile, mirrorDir }) => {
  const log = makeLogger('mindmap');
  try {
    const graph = await mindmap.buildGraph({ domain, subdomainsFile, mirrorDir }, log);
    return { ok: true, graph };
  } catch (e) {
    log(`[X] ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ----------------- IPC: list past workspaces -----------------
ipcMain.handle('workspace:list', () => workspace.listRuns());
