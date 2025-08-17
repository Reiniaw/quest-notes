import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { loadTasks, saveTasks } from './tasksStore.js';


const createWindow = () => {
  const win = new BrowserWindow({
    width: 1224,
    height: 700,
    resizable: false,
    maximizable: false,
    fullscreen: false,
    center: true,
    title: 'Квест‑Заметки',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(app.getAppPath(), 'renderer', 'index.html'));
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: хранилище задач
ipcMain.handle('tasks:load', async () => {
  return await loadTasks();
});

ipcMain.handle('tasks:save', async (_evt, tasks) => {
  return await saveTasks(tasks);
});