import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuCommand } from '../shared/api'
import { sessionName } from '../shared/names'
import { nextNeedingYou, openOrder, stepFrom } from '../shared/order'
import type { HistoryEntry, LiveSession, Project } from '../shared/types'
import { HistoryView } from './HistoryView'
import { NewClientDialog, NewVideoDialog } from './CreateDialogs'
import { NewSessionDialog } from './NewSessionDialog'
import { SessionView } from './SessionView'
import { SettingsDialog } from './SettingsDialog'
import { Sidebar } from './Sidebar'
import logo from './assets/logo.png'
import { dispose, knownTerminals, zoomTerminals } from './terminals'

/** How often the client folders are looked up again while the window is on screen. */
const FOLDER_CHECK_MS = 4000

type View = { readonly kind: 'home' } | { readonly kind: 'history' } | { readonly kind: 'session'; readonly id: string }
type Dialog =
  | { readonly kind: 'new'; readonly startIn?: string }
  | { readonly kind: 'settings' }
  | { readonly kind: 'new-client' }
  | { readonly kind: 'new-video'; readonly client: string; readonly clientPath: string; readonly existing: readonly string[] }
  | null

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [roots, setRoots] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [view, setView] = useState<View>({ kind: 'home' })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const loadHistory = useCallback(() => void window.api.history().then(setHistory), [])

  const loadSettings = useCallback(async (): Promise<void> => {
    const [r, p, h] = await Promise.all([window.api.roots(), window.api.projects(), window.api.hidden()])
    setRoots(r)
    setProjects(p)
    setHidden(h)
  }, [])
  useEffect(() => {
    void window.api.sessions().then(setSessions)
    void loadSettings()
    return window.api.onSessions(setSessions)
  }, [loadSettings])
  // A closed session's terminal goes with it.
  useEffect(() => {
    for (const id of knownTerminals()) if (!sessions.some((s) => s.id === id)) dispose(id)
  }, [sessions])

  // One fixed order for the open sessions: the panel lists them in it, and the keys step through it.
  const ordered = useMemo(() => openOrder(sessions), [sessions])
  const current = view.kind === 'session' ? sessions.find((s) => s.id === view.id) : undefined
  // Leave a session's page only once that session has gone (a new one may not be listed yet).
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const s of sessions) seen.current.add(s.id)
    if (view.kind === 'session' && !current && seen.current.has(view.id)) setView({ kind: 'home' })
  }, [view, current, sessions])
  useEffect(() => window.api.setSelected(current?.id ?? null), [current?.id])
  useEffect(() => window.api.onFocus((id) => setView({ kind: 'session', id })), [])
  // A session that starts or ends changes what there is to resume.
  const liveKey = sessions.map((s) => `${s.claudeId}:${s.state === 'ended'}`).join(',')
  useEffect(loadHistory, [loadHistory, liveKey])
  // New client and video folders show up in the panel by themselves: looked up when the window
  // comes to the front, and every few seconds while it is on screen (Claude makes folders too).
  const loadProjects = useCallback(async (): Promise<void> => {
    const found = await window.api.projects()
    setProjects((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found))
  }, [])
  useEffect(() => {
    const refresh = (): void => {
      void loadProjects()
      loadHistory()
    }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProjects()
    }, FOLDER_CHECK_MS)
    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [loadHistory, loadProjects])

  const openNew = useCallback((startIn?: string): void => {
    void loadProjects()
    setDialog({ kind: 'new', startIn })
  }, [loadProjects])

  const start = useCallback(async (cwd: string, opts: { name?: string | null; resume?: string; replaces?: string } = {}): Promise<string | null> => {
    const result = await window.api.create({ cwd, ...opts })
    if (!result.ok) return result.error
    const made = result.value
    setSessions((list) => (list.some((s) => s.id === made.id) ? list : [...list.filter((s) => s.id !== opts.replaces), made]))
    setDialog(null)
    setView({ kind: 'session', id: made.id })
    return null
  }, [])

  // + beside a client or folder: Claude starts there at once, named from your first prompt. A second
  // click while it starts (a double-click on the small +) doesn't start another.
  const starting = useRef(new Set<string>())
  const startIn = useCallback(
    (cwd: string): void => {
      if (starting.current.has(cwd)) return
      starting.current.add(cwd)
      void start(cwd)
        .then((error) => {
          if (error) setProblem(error)
        })
        .finally(() => starting.current.delete(cwd))
    },
    [start]
  )
  const show = (id: string | null): void => {
    if (id !== null) setView({ kind: 'session', id })
  }

  const close = useCallback(async (s: LiveSession): Promise<void> => {
    if (s.state === 'working' && !window.confirm(`Claude is still working in #${s.seq}. Stop it and close the session?`)) return
    await window.api.close(s.id)
  }, [])
  // Delete: after you confirm, the session stops and its conversation goes to the Trash.
  const deleteConversation = useCallback(
    async (claudeId: string, name: string): Promise<boolean> => {
      if (!window.confirm(`Delete “${name}”?\n\nClaude stops if it is running, and the conversation moves to the Trash: it leaves History and can't be resumed. To get it back, put it back from the Trash.`)) return false
      const result = await window.api.deleteConversation(claudeId)
      if (!result.ok) {
        setProblem(`Couldn't delete “${name}”: ${result.error}`)
        return false
      }
      loadHistory()
      return true
    },
    [loadHistory]
  )
  const resumeEnded = async (s: LiveSession): Promise<void> => {
    const error = await start(s.cwd, { resume: s.claudeId, replaces: s.id })
    if (error) setProblem(error)
  }

  // The menu's shortcuts, with the latest state.
  const latest = useRef({ current, close, openNew, ordered })
  latest.current = { current, close, openNew, ordered }
  useEffect(
    () =>
      window.api.onMenu((command: MenuCommand) => {
        const { current: here, close: closeIt, openNew: newIt, ordered: list } = latest.current
        const key = /^session-(\d)$/.exec(command)
        if (key) show(list[Number(key[1]) - 1]?.id ?? null)
        if (command === 'next-session') show(stepFrom(list, here?.id ?? null, 1))
        if (command === 'prev-session') show(stepFrom(list, here?.id ?? null, -1))
        if (command === 'next-needs-you') show(nextNeedingYou(list, here?.id ?? null))
        if (command === 'new-session') newIt()
        if (command === 'new-session-here') newIt(here?.cwd)
        if (command === 'close-session' && here) void closeIt(here)
        if (command === 'history') setView({ kind: 'history' })
        if (command === 'settings') setDialog({ kind: 'settings' })
        if (command === 'text-bigger') zoomTerminals(1)
        if (command === 'text-smaller') zoomTerminals(-1)
        if (command === 'text-reset') zoomTerminals(0)
      }),
    []
  )

  return (
    <div className="app">
      <div className="titlebar" />
      <PinButton />
      <Sidebar
        sessions={ordered}
        projects={projects}
        roots={roots}
        selected={current?.id ?? null}
        page={view.kind}
        onSelect={(id) => setView({ kind: 'session', id })}
        onNew={() => openNew()}
        onStartIn={startIn}
        onNextNeedsYou={() => show(nextNeedingYou(ordered, current?.id ?? null))}
        onHistory={() => setView({ kind: 'history' })}
        onSettings={() => setDialog({ kind: 'settings' })}
        onRename={(claudeId, name) => void window.api.rename(claudeId, name).then(loadHistory)}
        onDelete={(claudeId, name) => void deleteConversation(claudeId, name)}
        history={history}
        onResume={(e) =>
          void start(e.cwd, { resume: e.claudeId }).then((error) => {
            if (error) setProblem(error)
          })
        }
        onResumeEnded={(s) => void resumeEnded(s)}
        hidden={hidden}
        onShowFolders={(paths, shown) => {
          // The tick shows at once; the saved list follows.
          setHidden((list) => (shown ? list.filter((h) => !paths.includes(h)) : [...new Set([...list, ...paths])]))
          void (async () => {
            let saved: string[] | null = null
            for (const p of paths) saved = await window.api.setHidden(p, !shown)
            if (saved) setHidden(saved)
          })()
        }}
        onNewClient={() => setDialog({ kind: 'new-client' })}
        onNewVideo={(c) => setDialog({ kind: 'new-video', ...c })}
      />
      <div className="content">
        {problem && (
          <div className="banner is-error" role="alert">
            {problem}
            <button className="link-button" onClick={() => setProblem(null)}>
              Dismiss
            </button>
          </div>
        )}
        {current && (
          <SessionView
            key={current.id}
            session={current}
            roots={roots}
            projects={projects}
            onNewHere={() => openNew(current.cwd)}
            onResume={() => void resumeEnded(current)}
            onClose={() => void close(current)}
            onRename={(name) => void window.api.rename(current.claudeId, name)}
            onDelete={() => void deleteConversation(current.claudeId, sessionName(current))}
          />
        )}
        {view.kind === 'history' && (
          <HistoryView
            roots={roots}
            projects={projects}
            sessions={sessions}
            onShow={(id) => setView({ kind: 'session', id })}
            onDelete={deleteConversation}
            onResume={(e: HistoryEntry) =>
              void start(e.cwd, { resume: e.claudeId }).then((error) => {
                if (error) setProblem(error)
              })
            }
          />
        )}
        {view.kind === 'home' && <Home open={sessions.length} projects={projects.length} watching={roots.length} onNew={() => openNew()} onHistory={() => setView({ kind: 'history' })} onSettings={() => setDialog({ kind: 'settings' })} />}
      </div>
      {dialog?.kind === 'new' && <NewSessionDialog projects={projects} roots={roots} sessions={sessions} startIn={dialog.startIn} onStart={(cwd, name) => start(cwd, { name })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'settings' && <SettingsDialog onClose={() => setDialog(null)} onSaved={() => void loadSettings()} />}
      {dialog?.kind === 'new-client' && <NewClientDialog roots={roots} projects={projects} onCreated={(dir) => void window.api.projects().then((p) => (setProjects(p), openNew(dir)))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'new-video' && (
        <NewVideoDialog client={dialog.client} clientPath={dialog.clientPath} existing={dialog.existing} onCreated={(dir) => void window.api.projects().then((p) => (setProjects(p), openNew(dir)))} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

/** Top right: keeps the window above every other window, so it is always in sight. */
function PinButton(): React.JSX.Element {
  const [on, setOn] = useState(false)
  useEffect(() => {
    void window.api.onTop().then(setOn)
    return window.api.onOnTopChanged(setOn)
  }, [])
  const label = on ? 'Unpin: stop keeping Mothership on top (⌥⌘P)' : 'Pin Mothership on top of every window (⌥⌘P)'
  return (
    <button
      className={`pin-button${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => {
        setOn(!on)
        void window.api.setOnTop(!on).then(setOn)
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M10.5 1.5 14.5 5.5 12.6 6.3 9.9 9 10.3 12.2 8.9 13.6 6 10.7 2.2 14.5 1.5 13.8 5.3 10 2.4 7.1 3.8 5.7 7 6.1 9.7 3.4Z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span>{on ? 'Pinned' : 'Pin'}</span>
    </button>
  )
}

function Home({ open, projects, watching, onNew, onHistory, onSettings }: { readonly open: number; readonly projects: number; readonly watching: number; readonly onNew: () => void; readonly onHistory: () => void; readonly onSettings: () => void }): React.JSX.Element {
  // A fresh install watches nothing yet: the first thing to do is choose the clients' folder.
  const firstRun = watching === 0
  return (
    <main className="home" aria-label="Start">
      <img className="home-logo" src={logo} alt="" />
      <h1>Mothership</h1>
      <p className="tagline">Every session, every client, docked in one place.</p>
      <p className="muted">
        {firstRun
          ? 'Choose the folder your clients are in. Every client in it, and every folder in each client, is listed by itself.'
          : projects === 0
            ? 'No client folders found. Is the drive with your watched folder connected?'
            : open === 0
              ? 'Press + beside a client on the left to start Claude in its folder, or open the client to resume a past session.'
              : 'Pick a session at the top left, or press + beside a client to start another.'}
      </p>
      <div className="home-actions">
        {firstRun ? (
          <button className="primary" onClick={onSettings}>
            Choose your clients’ folder…
          </button>
        ) : (
          <button className="primary" onClick={onNew}>
            New session (⌘N)
          </button>
        )}
        <button onClick={onHistory}>History (⌘Y)</button>
      </div>
    </main>
  )
}
