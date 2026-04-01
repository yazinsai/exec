const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onStateChange: (callback) => {
    ipcRenderer.on("state-change", (_event, data) => callback(data));
  },
});
