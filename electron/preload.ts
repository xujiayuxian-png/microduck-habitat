import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('habitat', {
  loadState: () => ipcRenderer.invoke('habitat:load-state'),
  saveState: (state: Record<string, unknown>) => ipcRenderer.send('habitat:save-state', state),
  setQuiet: (quiet: boolean) => ipcRenderer.send('habitat:set-quiet', quiet),
  resetPosition: () => ipcRenderer.send('habitat:reset-position'),
  hide: () => ipcRenderer.send('habitat:hide'),
  setMotion: (direction: -1 | 0 | 1) => ipcRenderer.send('habitat:set-motion', direction),
  dragBegin: () => ipcRenderer.send('habitat:drag-begin'),
  dragEnd: () => ipcRenderer.send('habitat:drag-end'),
  reportHitTest: (sequence: number, interactive: boolean) =>
    ipcRenderer.send('habitat:hit-test-result', sequence, interactive),
  onHitTest: (callback: (point: { sequence: number; x: number; y: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, point: { sequence: number; x: number; y: number }) =>
      callback(point)
    ipcRenderer.on('habitat:hit-test', listener)
    return () => ipcRenderer.removeListener('habitat:hit-test', listener)
  },
  onEdge: (callback: (direction: -1 | 1) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: -1 | 1) => callback(direction)
    ipcRenderer.on('habitat:edge', listener)
    return () => ipcRenderer.removeListener('habitat:edge', listener)
  },
  onQuietChanged: (callback: (quiet: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, quiet: boolean) => callback(quiet)
    ipcRenderer.on('habitat:quiet-changed', listener)
    return () => ipcRenderer.removeListener('habitat:quiet-changed', listener)
  },
  onOwnerPresence: (callback: (present: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, present: boolean) => callback(present)
    ipcRenderer.on('habitat:owner-presence', listener)
    return () => ipcRenderer.removeListener('habitat:owner-presence', listener)
  },
})
