const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadTasks: async () => ipcRenderer.invoke("tasks:load"),
  saveTasks: async (tasks) => ipcRenderer.invoke("tasks:save", tasks)
});
