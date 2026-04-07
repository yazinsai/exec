const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onStateChange: (callback) => {
    ipcRenderer.on("state-change", (_event, data) => callback(data));
  },
  cancelRecording: () => {
    ipcRenderer.send("cancel-recording");
  },
  retrySave: () => {
    ipcRenderer.send("retry-save");
  },
  dismissSave: () => {
    ipcRenderer.send("dismiss-save");
  },
  onHide: (callback) => {
    ipcRenderer.on("overlay-hide", () => callback());
  },
});
