const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  addSoundCloud: (url) => ipcRenderer.invoke('soundcloud:add', url),
  downloadTracks: (trackIds, tracks) => ipcRenderer.invoke('soundcloud:download', trackIds, tracks),
  exportRekordbox: (tracks) => ipcRenderer.invoke('exportRekordbox', tracks)
});
