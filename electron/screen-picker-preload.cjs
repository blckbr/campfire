const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('campfirePicker', {
  onSources: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('picker:sources', handler);
    return () => ipcRenderer.removeListener('picker:sources', handler);
  },
  select: (id) => ipcRenderer.send('picker:select', id),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
