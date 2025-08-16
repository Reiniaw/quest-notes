import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_NAME = 'tasks.json';

function dataPath() {
  // Файл лежит в userData, чтобы переживать обновления приложения
  return path.join(app.getPath('userData'), FILE_NAME);
}

export async function loadTasks() {
  try {
    const filePath = dataPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      // поддержка очень старого формата
      return { tasks: data };
    }
    return data;
  } catch {
    // Если файла нет — вернём дефолтную структуру
    return { tasks: [] };
  }
}

export async function saveTasks(tasks) {
  const filePath = dataPath();
  const payload = JSON.stringify({ tasks }, null, 2);
  await fs.writeFile(filePath, payload, 'utf-8');
  return { ok: true };
}