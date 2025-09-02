import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { loadTasks, saveTasks } from './tasksStore.js';

// Чтобы заработал __dirname в ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1224,
    height: 700,
    resizable: false,
    maximizable: false,
    fullscreen: false,
    center: true,
    title: 'Квест-Заметки',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

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