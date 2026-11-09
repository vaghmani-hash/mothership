import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH } from '../shared/api'
import type { Api } from '../shared/api'

function listen<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api: Api = {
  sessions: () => ipcRenderer.invoke(CH.sessions),
  onSessions: (listener) => listen(CH.sessionsChanged, listener),
  onData: (listener) => listen(CH.data, listener),
  snapshot: (id) => ipcRenderer.invoke(CH.snapshot, id),
  create: (session) => ipcRenderer.invoke(CH.create, session),
  input: (id, data) => ipcRenderer.send(CH.input, id, data),
  resize: (id, cols, rows) => ipcRenderer.send(CH.resize, id, cols, rows),
  close: (id) => ipcRenderer.invoke(CH.close, id),
  rename: (claudeId, name) => ipcRenderer.invoke(CH.rename, claudeId, name),
  setSelected: (id) => ipcRenderer.send(CH.selected, id),
  onFocus: (listener) => listen(CH.focus, listener),
  history: () => ipcRenderer.invoke(CH.history),
  pickFolder: () => ipcRenderer.invoke(CH.pickFolder),
  reveal: (path) => ipcRenderer.send(CH.reveal, path),
  roots: () => ipcRenderer.invoke(CH.roots),
  setRoots: (roots) => ipcRenderer.invoke(CH.setRoots, roots),
  projects: () => ipcRenderer.invoke(CH.projects),
  sessionFolder: () => ipcRenderer.invoke(CH.sessionFolder),
  setSessionFolder: (name) => ipcRenderer.invoke(CH.setSessionFolder, name),
  hidden: () => ipcRenderer.invoke(CH.hidden),
  setHidden: (clientPath, hide) => ipcRenderer.invoke(CH.setHidden, clientPath, hide),
  createClient: (request) => ipcRenderer.invoke(CH.createClient, request),
  createVideo: (clientPath, name) => ipcRenderer.invoke(CH.createVideo, clientPath, name),
  onMenu: (listener) => listen(CH.menu, listener),
  onTop: () => ipcRenderer.invoke(CH.onTop),
  setOnTop: (on) => ipcRenderer.invoke(CH.setOnTop, on),
  onOnTopChanged: (listener) => listen(CH.onTopChanged, listener),
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
