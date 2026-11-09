import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/api'
import type { MenuCommand, NewSession } from '../shared/api'
import { placeOf, sessionName, tidyName } from '../shared/names'
import { projectLabel } from '../shared/projects'
import type { HistoryEntry, LiveSession, Project, Result } from '../shared/types'
import { isFolder } from './folders'
import { createClient, createVideo } from './create'
import type { NewClient } from './create'
import { HostClient } from './host-client'
import { appHome, transcriptsDir } from './paths'
import { findProjects } from './projects'
import { Store } from './store'
import { History } from './transcripts'

const home = appHome()
app.setPath('userData', join(home, 'electron'))

let window: BrowserWindow | null = null
let selected: string | null = null
/** Pinned: the window floats above every other app's windows. */
let onTop = false

function applyOnTop(win: BrowserWindow): void {
  win.setAlwaysOnTop(onTop, 'floating')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 860,
    minHeight: 520,
    title: 'Mothership',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#141416',
    // CLIENT_SESSIONS_E2E: shown without focus, so real keystrokes elsewhere never reach the test.
    show: process.env['CLIENT_SESSIONS_E2E'] !== '1',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  if (process.env['CLIENT_SESSIONS_E2E'] === '1') win.once('ready-to-show', () => win.showInactive())
  applyOnTop(win)
  // Right-click: Copy and Paste (in a terminal too: xterm answers the copy and paste events).
  win.webContents.on('context-menu', (_e, params) => {
    const items: MenuItemConstructorOptions[] = [
      ...(params.isEditable ? [{ role: 'cut' } as const] : []),
      { role: 'copy' },
      { role: 'paste', enabled: params.isEditable || params.editFlags.canPaste },
      ...(params.isEditable ? [{ type: 'separator' } as const, { role: 'selectAll' } as const] : [])
    ]
    Menu.buildFromTemplate(items).popup({ window: win })
  })
  win.on('closed', () => {
    if (window === win) window = null
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

function showWindow(): BrowserWindow {
  window ??= createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

function installMenu(send: (command: MenuCommand) => void, toggleOnTop: () => void): void {
  const item = (label: string, accelerator: string, command: MenuCommand): MenuItemConstructorOptions => ({ label, accelerator, click: () => send(command) })
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        item('New Session…', 'CmdOrCtrl+N', 'new-session'),
        item('New Session in This Folder', 'CmdOrCtrl+T', 'new-session-here'),
        { type: 'separator' },
        item('Close Session', 'CmdOrCtrl+W', 'close-session'),
        { role: 'close', accelerator: 'Shift+CmdOrCtrl+W' },
        { type: 'separator' },
        item('Stop All Sessions and Quit…', 'Alt+CmdOrCtrl+Q', 'stop-all')
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        item('History', 'CmdOrCtrl+Y', 'history'),
        item('Watched Folders…', 'CmdOrCtrl+,', 'settings'),
        { type: 'separator' },
        { id: 'on-top', label: 'Keep on Top of All Windows', type: 'checkbox', checked: onTop, accelerator: 'Alt+CmdOrCtrl+P', click: toggleOnTop },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()
  nativeTheme.themeSource = 'dark'
  // The packaged app takes its icon from build/icon.png; a development run shows it in the Dock too.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
  const store = new Store(home)
  await store.load()
  onTop = store.getOnTop()
  // The background host owns the sessions, so they keep running after the app quits.
  const host = new HostClient(home, join(import.meta.dirname, 'host.js'))
  // The clients' projects, looked up at launch and whenever the window asks; the host numbers
  // sessions by project, so it gets them too.
  let projects: Project[] = []
  const refreshProjects = async (): Promise<Project[]> => {
    projects = await findProjects(store.getRoots(), store.getSessionFolder())
    void host.setProjects(projects).catch(() => undefined)
    return projects
  }
  const history = new History(transcriptsDir())

  const send = (channel: string, ...args: unknown[]): void => window?.webContents.send(channel, ...args)
  const changed = (list: LiveSession[]): void => {
    send(CH.sessionsChanged, list)
    const waiting = list.filter((s) => s.state === 'needs-you').length
    app.dock?.setBadge(waiting > 0 ? String(waiting) : '')
  }
  host.on('changed', changed)
  host.on('data', (id, data, end) => send(CH.data, id, data, end))
  host.on('needsYou', (session: LiveSession) => {
    // Not for the session you are looking at in a focused window.
    if (window?.isFocused() && selected === session.id) return
    if (!Notification.isSupported()) return
    const where = projectLabel(session.cwd, projects, store.getRoots())
    const note = new Notification({ title: where, subtitle: sessionName(session), body: session.reason ?? 'Needs you', silent: false })
    note.on('click', () => {
      showWindow()
      send(CH.focus, session.id)
    })
    note.show()
  })
  // The host went away (it crashed, or was stopped): reconnect, which starts a new one, retrying
  // until it works.
  let reconnecting = false
  const reconnect = async (): Promise<void> => {
    if (reconnecting) return
    reconnecting = true
    for (let delay = 1000; ; delay = Math.min(delay * 2, 15_000)) {
      await new Promise((r) => setTimeout(r, delay))
      try {
        await host.open()
        await host.setProjects(projects)
        changed(await host.list())
        break
      } catch (err) {
        console.error('[host] reconnect failed, trying again:', err)
      }
    }
    reconnecting = false
  }
  host.on('lost', () => void reconnect())
  await host.open()
  await refreshProjects()

  const failed = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : String(err) })
  ipcMain.handle(CH.sessions, () => host.list())
  ipcMain.handle(CH.snapshot, (_e, id: unknown) => (typeof id === 'string' ? host.snapshot(id) : null))
  ipcMain.handle(CH.create, async (_e, request: unknown): Promise<Result<LiveSession>> => {
    const r = request as Partial<NewSession> | null
    if (typeof r?.cwd !== 'string' || (r.resume !== undefined && typeof r.resume !== 'string') || (r.name != null && typeof r.name !== 'string') || (r.replaces !== undefined && typeof r.replaces !== 'string')) return { ok: false, error: 'Malformed request.' }
    try {
      return { ok: true, value: await host.start({ cwd: r.cwd, resume: r.resume, name: r.name ? tidyName(r.name) : null, replaces: r.replaces }) }
    } catch (err) {
      return failed(err)
    }
  })
  ipcMain.on(CH.input, (_e, id: unknown, data: unknown) => {
    if (typeof id === 'string' && typeof data === 'string') host.input(id, data)
  })
  ipcMain.on(CH.resize, (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string' && typeof cols === 'number' && typeof rows === 'number') host.resize(id, cols, rows)
  })
  ipcMain.handle(CH.close, async (_e, id: unknown) => {
    if (typeof id === 'string') await host.closeSession(id)
  })
  ipcMain.handle(CH.rename, async (_e, claudeId: unknown, name: unknown) => {
    if (typeof claudeId !== 'string' || (name !== null && typeof name !== 'string')) return
    await host.rename(claudeId, name === null ? null : tidyName(name))
  })
  ipcMain.on(CH.selected, (_e, id: unknown) => {
    selected = typeof id === 'string' ? id : null
  })
  ipcMain.handle(CH.history, async (): Promise<HistoryEntry[]> => {
    const roots = store.getRoots()
    await store.reloadNames()
    const entries = await history.list()
    return entries.filter((e) => placeOf(e.cwd, roots).root !== null).map((e) => ({ ...e, name: store.nameOf(e.claudeId) }))
  })
  ipcMain.handle(CH.pickFolder, async () => {
    const options = { title: 'Choose the folder for the session', defaultPath: store.getRoots()[0], properties: ['openDirectory' as const] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.on(CH.reveal, (_e, path: unknown) => {
    if (typeof path !== 'string') return
    void isFolder(path).then(async (yes) => {
      if (yes) await shell.openPath(path)
    })
  })
  ipcMain.handle(CH.roots, () => store.getRoots())
  ipcMain.handle(CH.setRoots, async (_e, roots: unknown) => {
    if (Array.isArray(roots) && roots.every((r) => typeof r === 'string')) {
      await store.setRoots(roots)
      await refreshProjects()
      changed(await host.list())
    }
  })
  ipcMain.handle(CH.projects, () => refreshProjects())
  ipcMain.handle(CH.sessionFolder, () => store.getSessionFolder())
  ipcMain.handle(CH.setSessionFolder, async (_e, name: unknown): Promise<Result<null>> => {
    if (typeof name !== 'string') return { ok: false, error: 'Malformed request.' }
    try {
      await store.setSessionFolder(name)
      await refreshProjects()
      return { ok: true, value: null }
    } catch (err) {
      return failed(err)
    }
  })
  ipcMain.handle(CH.hidden, () => store.getHidden())
  ipcMain.handle(CH.setHidden, async (_e, folder: unknown, hide: unknown) => {
    if (typeof folder === 'string' && typeof hide === 'boolean') await store.setHidden(folder, hide)
    return store.getHidden()
  })
  ipcMain.handle(CH.createClient, async (_e, request: unknown): Promise<Result<string>> => {
    const r = request as Partial<NewClient> | null
    if (typeof r?.root !== 'string' || typeof r.client !== 'string' || typeof r.video !== 'string' || (r.agency !== null && typeof r.agency !== 'string')) return { ok: false, error: 'Malformed request.' }
    try {
      const sessionDir = await createClient(store.getRoots(), store.getSessionFolder(), { root: r.root, agency: r.agency ?? null, client: r.client, video: r.video })
      await refreshProjects()
      return { ok: true, value: sessionDir }
    } catch (err) {
      return failed(err)
    }
  })
  ipcMain.handle(CH.createVideo, async (_e, clientPath: unknown, name: unknown): Promise<Result<string>> => {
    if (typeof clientPath !== 'string' || typeof name !== 'string') return { ok: false, error: 'Malformed request.' }
    // Only into a client the app knows.
    if (!projects.some((p) => p.clientPath === clientPath)) return { ok: false, error: "That client isn't one of your watched clients." }
    try {
      const sessionDir = await createVideo(clientPath, store.getSessionFolder(), name)
      await refreshProjects()
      return { ok: true, value: sessionDir }
    } catch (err) {
      return failed(err)
    }
  })

  const setOnTop = async (on: boolean): Promise<boolean> => {
    onTop = on
    if (window) applyOnTop(window)
    const menuItem = Menu.getApplicationMenu()?.getMenuItemById('on-top')
    if (menuItem) menuItem.checked = on
    send(CH.onTopChanged, on)
    await store.setOnTop(on)
    return on
  }
  ipcMain.handle(CH.onTop, () => onTop)
  ipcMain.handle(CH.setOnTop, (_e, on: unknown) => setOnTop(on === true))

  const stopAll = async (): Promise<void> => {
    const live = (await host.list()).filter((s) => s.state !== 'ended').length
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Stop sessions and quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: live > 0 ? `Stop ${live} running ${live === 1 ? 'session' : 'sessions'} and quit?` : 'Quit?',
      detail: 'Every conversation stays in History, where you can resume it. (Quitting normally keeps sessions running.)'
    })
    if (choice !== 0) return
    await host.shutdown().catch(() => undefined)
    app.quit()
  }
  installMenu(
    (command) => {
      if (command === 'stop-all') void stopAll()
      else send(CH.menu, command)
    },
    () => void setOnTop(!onTop)
  )
  app.on('second-instance', () => showWindow())
  // Closing the window keeps the sessions running; the dock icon brings it back.
  app.on('window-all-closed', () => undefined)
  app.on('activate', () => showWindow())
  // Quitting only disconnects: the host keeps every session running until you open the app again.
  app.on('before-quit', () => host.close())

  window = createWindow()
}

void main()
