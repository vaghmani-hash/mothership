// The left panel: Open now (every running session, one click away), then the clients under their
// agency, and in each client its videos with everything about a video in one place: its open
// sessions, its latest past ones (Resume), and + New. A video with nothing open or past stays one
// line. Sessions in folders outside every project come last, under Other folders. ↑ ↓ → ← and ⌘F
// get around it from the keyboard.

import { useEffect, useRef, useState } from 'react'
import { displayName, sessionName } from '../shared/names'
import { clientFolderOf, clientFolderTitle, clientsOf, groupByProject, OTHER, projectLabel, projectOf } from '../shared/projects'
import type { HistoryEntry, LiveSession, Project } from '../shared/types'
import { FoldersPanel } from './FoldersPanel'
import { EditableName, StateDot, STATE_LABEL, useNow } from './parts'
import { ago } from './time'

export type Page = 'session' | 'history' | 'home'

interface Props {
  readonly sessions: readonly LiveSession[]
  readonly projects: readonly Project[]
  readonly roots: readonly string[]
  readonly selected: string | null
  readonly page: Page
  readonly onSelect: (id: string) => void
  readonly onNew: (startIn?: string) => void
  readonly onHistory: () => void
  readonly onSettings: () => void
  readonly onRename: (claudeId: string, name: string | null) => void
  /** Delete a past conversation (asks first; it goes to the Trash). */
  readonly onDelete: (claudeId: string, name: string) => void
  /** Past conversations, newest first. */
  readonly history: readonly HistoryEntry[]
  /** Picks a past conversation up again in its own folder. */
  readonly onResume: (entry: HistoryEntry) => void
  /** Picks an ended session's conversation up again, in its place. */
  readonly onResumeEnded: (session: LiveSession) => void
  /** Folders you unticked in Choose folders (clients or videos); they stay out unless something runs in them. */
  readonly hidden: readonly string[]
  readonly onShowFolders: (paths: readonly string[], shown: boolean) => void
  readonly onNewClient: () => void
  /** Rename a client or video folder (asks for the new name). */
  readonly onRenameFolder: (folder: { readonly label: string; readonly folder: string }) => void
  readonly onNewVideo: (client: { readonly client: string; readonly clientPath: string; readonly existing: readonly string[] }) => void
}

/** How many past sessions a video shows: more while something is open in it. */
const PAST_WITH_OPEN = 2
const PAST_ALONE = 1

/** Which clients you unfolded or folded, by client folder; the rest follow whether something runs in them. */
const FOLDS_KEY = 'client-sessions.client-folds'
function readFolds(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? '{}')
    return typeof value === 'object' && value !== null ? (value as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}
function saveFolds(folds: Record<string, boolean>): void {
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds))
  } catch {
    // Only a convenience.
  }
}

export function Sidebar({ sessions, projects, roots, selected, page, onSelect, onNew, onHistory, onSettings, onRename, onDelete, history, onResume, onResumeEnded, hidden, onShowFolders, onNewClient, onNewVideo, onRenameFolder }: Props): React.JSX.Element {
  const now = useNow()
  const [query, setQuery] = useState('')
  const [folds, setFolds] = useState(readFolds)
  const [choosing, setChoosing] = useState(false)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (text: string): boolean => words.every((w) => text.toLowerCase().includes(w))

  const openIds = new Set(sessions.filter((s) => s.state !== 'ended').map((s) => s.claudeId))
  const openIn = new Map<string, LiveSession[]>()
  for (const s of sessions) {
    const p = projectOf(s.cwd, projects)
    if (p) openIn.set(p.path, [...(openIn.get(p.path) ?? []), s].sort((a, b) => a.seq - b.seq))
  }
  const pastIn = new Map<string, HistoryEntry[]>()
  for (const e of history) {
    const p = projectOf(e.cwd, projects)
    if (p && !openIds.has(e.claudeId)) pastIn.set(p.path, [...(pastIn.get(p.path) ?? []), e])
  }
  // Sessions in a client folder itself (or a folder in it that is no video), by client, then folder.
  interface Here {
    readonly folder: string
    readonly title: string
    live: LiveSession[]
    past: HistoryEntry[]
  }
  const clientIn = new Map<string, Map<string, Here>>()
  const here = (folder: string): Here | null => {
    const c = clientFolderOf(folder, projects)
    if (!c) return null
    const groups = clientIn.get(c.clientPath) ?? new Map<string, Here>()
    clientIn.set(c.clientPath, groups)
    const key = folder.replace(/\/+$/, '')
    const g = groups.get(key) ?? { folder: key, title: clientFolderTitle(c), live: [], past: [] }
    groups.set(key, g)
    return g
  }
  for (const s of sessions) here(s.cwd)?.live.push(s)
  for (const e of history) if (!openIds.has(e.claudeId)) here(e.cwd)?.past.push(e)
  const clientGroups = (clientPath: string): Here[] =>
    [...(clientIn.get(clientPath)?.values() ?? [])].sort((a, b) => (a.title === 'Client folder' ? -1 : b.title === 'Client folder' ? 1 : a.title.localeCompare(b.title)))
  const others = groupByProject(sessions.filter((s) => clientFolderOf(s.cwd, projects) === null), projects, roots).find((c) => c.key === OTHER)?.projects ?? []
  const waiting = sessions.filter((s) => s.state === 'needs-you').length

  // A hidden client folder stays out of the list, unless a session runs in it.
  const hiddenSet = new Set(hidden)
  const runs = (p: Project): boolean => (openIn.get(p.path)?.length ?? 0) > 0
  const liveAtClient = (clientPath: string): number => clientGroups(clientPath).reduce((n, g) => n + g.live.length, 0)
  const runsIn = (c: { readonly key: string; readonly projects: readonly Project[] }): boolean => c.projects.some(runs) || liveAtClient(c.key) > 0
  const hiddenCount = clientsOf(projects).filter((c) => hiddenSet.has(c.key)).length + projects.filter((p) => hiddenSet.has(p.path) && !hiddenSet.has(p.clientPath)).length
  const shownClients = clientsOf(projects)
    .filter((c) => !hiddenSet.has(c.key) || runsIn(c))
    .map((c) => {
      const atClient = clientGroups(c.key).flatMap((g) => [...g.live.map(sessionName), ...g.past.map(displayName), g.title]).join(' ')
      const clientMatches = matches(`${c.client} ${c.agency ?? ''} ${atClient}`)
      return {
        ...c,
        clientMatches,
        projects: c.projects.filter((p) => {
          // An unticked video stays out, unless a session runs in it.
          if (hiddenSet.has(p.path) && !runs(p)) return false
          const inside = [...(openIn.get(p.path) ?? []).map(sessionName), ...(pastIn.get(p.path) ?? []).map(displayName)].join(' ')
          return matches(`${c.client} ${c.agency ?? ''} ${p.title} ${p.name} ${inside}`)
        })
      }
    })
    .filter((c) => c.projects.length > 0 || c.clientMatches)
  // Folded unless you unfolded it, or something runs in it; every match shows while you search.
  const isOpen = (c: { readonly key: string; readonly projects: readonly Project[] }): boolean => words.length > 0 || (folds[c.key] ?? runsIn(c))
  const toggle = (c: { readonly key: string; readonly projects: readonly Project[] }): void => {
    const next = { ...folds, [c.key]: !isOpen(c) }
    setFolds(next)
    saveFolds(next)
  }

  const sessionRow = (s: LiveSession): React.JSX.Element => (
    <div
      key={s.id}
      role="button"
      tabIndex={0}
      data-nav=""
      aria-label={`${sessionName(s)}, ${STATE_LABEL[s.state]}`}
      aria-current={page === 'session' && selected === s.id ? 'true' : undefined}
      className={`session-row is-${s.state}`}
      onClick={() => onSelect(s.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
    >
      <StateDot state={s.state} />
      <EditableName className="row-name" shown={sessionName(s)} own={s.name} onSave={(name) => onRename(s.claudeId, name)} />
      <span className={`row-state is-${s.state}`}>
        {s.state === 'needs-you' && s.reason ? `Needs you: ${s.reason}` : STATE_LABEL[s.state]} · {ago(s.changedAt, now)}
        {s.state === 'ended' && (
          <button
            className="row-resume"
            onClick={(e) => {
              e.stopPropagation()
              onResumeEnded(s)
            }}
          >
            Resume
          </button>
        )}
      </span>
    </div>
  )

  const pastRow = (e: HistoryEntry): React.JSX.Element => (
    <div key={e.claudeId} className="past-row" role="group" aria-label={displayName(e)}>
      <span className="past-icon" aria-hidden="true">
        ↺
      </span>
      <span className="past-text">
        <EditableName className="past-name" shown={displayName(e)} own={e.name} onSave={(name) => onRename(e.claudeId, name)} />
        <span className="past-when">{ago(e.lastAt, now)} ago</span>
      </span>
      <button className="resume-button" data-nav="" onClick={() => onResume(e)} title={`Continue this conversation in ${e.cwd}`}>
        Resume
      </button>
      <button className="delete-button" onClick={() => onDelete(e.claudeId, displayName(e))} title="Delete this conversation (to the Trash)" aria-label={`Delete ${displayName(e)}`}>
        <TrashIcon />
      </button>
    </div>
  )

  // Running sessions, the ones that need you first: one click from anywhere in the list.
  const STATE_ORDER: Record<string, number> = { 'needs-you': 0, working: 1, ready: 2 }
  const openNow = sessions
    .filter((s) => s.state !== 'ended')
    .slice()
    .sort((a, b) => (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) || projectLabel(a.cwd, projects, roots).localeCompare(projectLabel(b.cwd, projects, roots)) || a.seq - b.seq)

  // Clients under their agency (mesa, Dawn Media…), agencies by name, clients with none last.
  const sections = [...new Set(shownClients.map((c) => c.agency ?? ''))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' })))
    .map((agency) => ({ key: agency || '\u0000', title: agency || (shownClients.some((c) => c.agency) ? 'Other clients' : 'Clients'), clients: shownClients.filter((c) => (c.agency ?? '') === agency) }))
  const anyOpen = shownClients.some(isOpen)
  const foldAll = (): void => {
    const next = { ...folds }
    for (const c of shownClients) next[c.key] = !anyOpen
    setFolds(next)
    saveFolds(next)
  }

  // ↑ ↓ move through clients and sessions, → / ← unfold and fold a client (← from inside goes to it).
  const tree = useRef<HTMLDivElement>(null)
  const moveFocus = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    if (!target.matches('[data-nav]') || !tree.current) return
    const items = [...tree.current.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null)
    const at = items.indexOf(target)
    const go = (i: number): void => {
      items[Math.max(0, Math.min(items.length - 1, i))]?.focus()
      e.preventDefault()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'ArrowLeft' && !target.classList.contains('client-toggle')) {
      const head = target.closest('.client-block')?.querySelector<HTMLElement>('.client-toggle')
      if (head) {
        head.focus()
        e.preventDefault()
      }
    }
  }
  // ⌘F finds; Esc in the box clears it.
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const find = (e: KeyboardEvent): void => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', find, true)
    return () => window.removeEventListener('keydown', find, true)
  }, [])

  const clientBlock = (c: (typeof shownClients)[number]): React.JSX.Element => {
    const open = isOpen(c)
    const running = c.projects.reduce((n, p) => n + (openIn.get(p.path)?.length ?? 0), 0) + liveAtClient(c.key)
    const label = c.agency ? `${c.client} (${c.agency})` : c.client
    return (
      <section key={c.key} className={`client-block${open ? ' is-open' : ''}${hiddenSet.has(c.key) ? ' is-hidden' : ''}${running > 0 ? ' is-running' : ''}`} aria-label={label}>
        <h3 className="client-head" title={c.key}>
          <button
            className="client-toggle"
            data-nav=""
            aria-expanded={open}
            aria-label={label}
            onClick={() => toggle(c)}
            onKeyDown={(e) => {
              if ((e.key === 'ArrowRight' && !open) || (e.key === 'ArrowLeft' && open)) {
                e.preventDefault()
                e.stopPropagation()
                toggle(c)
              }
            }}
          >
            <span className="twisty" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            <span className="client-title">{c.client}</span>
            {hiddenSet.has(c.key) && <span className="hidden-tag" title="Hidden; shown while a session runs in it">hidden</span>}
            {running > 0 ? (
              <span className="video-count">{running} open</span>
            ) : (
              <span className="client-sub">
                {c.projects.length} {c.projects.length === 1 ? 'video' : 'videos'}
              </span>
            )}
          </button>
          <span className="client-tools">
            <button className="client-tool icon-tool" aria-label={`New session in the ${c.client} client folder`} title={`New session in the client folder itself (${c.key})`} onClick={() => onNew(c.key)}>
              <TerminalIcon />
            </button>
            <button className="client-tool icon-tool" aria-label={`Rename the ${c.client} folder`} title={`Rename the folder ${c.key}`} onClick={() => onRenameFolder({ label: c.client, folder: c.key })}>
              <PencilIcon />
            </button>
            <button className="client-tool icon-tool" aria-label={`New video for ${c.client}`} title={`New video: a new video folder in ${c.key}`} onClick={() => onNewVideo({ client: c.client, clientPath: c.key, existing: clientsOf(projects).find((x) => x.key === c.key)?.projects.map((p) => p.name) ?? [] })}>
              <PlusIcon />
            </button>
          </span>
        </h3>
        {open && (
          <div className="client-body">
            {clientGroups(c.key).map((g) => {
              const past = g.past.slice(0, g.live.length > 0 ? PAST_WITH_OPEN : PAST_ALONE)
              return (
                <div key={g.folder} className={`video client-folder${g.live.length > 0 ? ' is-busy' : ''}${past.length > 0 ? ' has-past' : ''}`} role="group" aria-label={`${c.client} › ${g.title}`}>
                  <div className="video-head" title={g.folder}>
                    <span className="video-title">{g.title}</span>
                    {g.live.length > 0 && <span className="video-count">{g.live.length} open</span>}
                    <button className="new-here" aria-label={`New session in ${c.client} › ${g.title}`} title={`Start Claude in ${g.folder}`} onClick={() => onNew(g.folder)}>
                      + New
                    </button>
                  </div>
                  {[...g.live].sort((a, b) => a.seq - b.seq).map(sessionRow)}
                  {past.map(pastRow)}
                </div>
              )
            })}
            {c.projects.map((p) => {
              const live = openIn.get(p.path) ?? []
              const past = (pastIn.get(p.path) ?? []).slice(0, live.length > 0 ? PAST_WITH_OPEN : PAST_ALONE)
              const busy = live.length > 0
              return (
                <div key={p.path} className={`video${busy ? ' is-busy' : ''}${past.length > 0 ? ' has-past' : ''}`} role="group" aria-label={`${c.client} › ${p.title}`}>
                  <div className="video-head" title={p.sessionDir}>
                    <span className="video-title">{p.title}</span>
                    {busy && <span className="video-count">{live.length} open</span>}
                    <button className="rename-folder" aria-label={`Rename the ${c.client} › ${p.title} folder`} title={`Rename ${p.path}`} onClick={() => onRenameFolder({ label: `${c.client} › ${p.title}`, folder: p.path })}>
                      <PencilIcon />
                    </button>
                    <button className="new-here" aria-label={`New session in ${c.client} › ${p.title}`} title={`Start Claude in ${p.sessionDir}`} onClick={() => onNew(p.sessionDir)}>
                      + New
                    </button>
                  </div>
                  {live.map(sessionRow)}
                  {past.map(pastRow)}
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <nav className="sidebar" aria-label="Clients and sessions">
      <div className="sidebar-top">
        <button className="primary new-button" onClick={() => onNew()} title="New session (⌘N)">
          + New session
        </button>
        <input
          ref={search}
          className="sidebar-search"
          type="search"
          placeholder="Find a client, video or session (⌘F)"
          aria-label="Find a client or project"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('')
              e.currentTarget.blur()
            }
            // ↓ from the box goes into the list.
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              tree.current?.querySelector<HTMLElement>('[data-nav]')?.focus()
            }
          }}
        />
        <div className="sidebar-summary">
          <span>
            {sessions.length === 0 ? 'No sessions open' : `${sessions.length} open`}
            {waiting > 0 && <span className="heading-needs"> · {waiting} need{waiting === 1 ? 's' : ''} you</span>}
          </span>
          {shownClients.length > 0 && words.length === 0 && (
            <button className="link-button fold-all" onClick={foldAll} title={anyOpen ? 'Fold every client' : 'Unfold every client'}>
              {anyOpen ? 'Fold all' : 'Unfold all'}
            </button>
          )}
        </div>
      </div>

      <div className="panel-scroll" ref={tree} onKeyDown={moveFocus}>
        {projects.length === 0 && <p className="panel-empty">No videos found. A video is a folder with a “script” folder inside, under a watched folder.</p>}
        {projects.length > 0 && shownClients.length === 0 && others.length === 0 && <p className="panel-empty">{words.length > 0 ? 'Nothing matches.' : 'Every folder is hidden.'}</p>}
        {openNow.length > 0 && words.length === 0 && (
          <section className="open-now" aria-label="Open now">
            <h2 className="section-head">
              Open now <span className="section-count">{openNow.length}</span>
            </h2>
            {openNow.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                data-nav=""
                className={`open-row is-${s.state}`}
                aria-label={`Open ${sessionName(s)} in ${projectLabel(s.cwd, projects, roots)}, ${STATE_LABEL[s.state]}`}
                aria-current={page === 'session' && selected === s.id ? 'true' : undefined}
                title={s.state === 'needs-you' && s.reason ? `Needs you: ${s.reason}` : STATE_LABEL[s.state]}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
              >
                <StateDot state={s.state} />
                <span className="open-name">{sessionName(s)}</span>
                <span className="open-where">{projectLabel(s.cwd, projects, roots)}</span>
              </div>
            ))}
          </section>
        )}
        {sections.map((section) => (
          <section key={section.key} className="agency-section" aria-label={section.title}>
            {sections.length > 1 && <h2 className="section-head">{section.title}</h2>}
            {section.clients.map(clientBlock)}
          </section>
        ))}
        {others.length > 0 && (
          <section className="client-block" aria-label={OTHER}>
            <h2 className="client-head">
              <span className="client-title">{OTHER}</span>
            </h2>
            {others.map((g) => (
              <div key={g.key} className="video is-busy" role="group" aria-label={`${OTHER} › ${g.name}`}>
                <div className="video-head" title={g.startIn}>
                  <span className="video-title">{g.name}</span>
                  <button className="new-here" aria-label={`New session in ${g.name}`} onClick={() => onNew(g.startIn)}>
                    + New
                  </button>
                </div>
                {g.items.map(sessionRow)}
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="sidebar-actions">
        <button className="link-button" onClick={onNewClient} title="Make a client folder with its first video">
          + New client
        </button>
        <button className="link-button" aria-expanded={choosing} onClick={() => setChoosing(!choosing)} title="Tick the folders you want in the list, untick the ones you don't">
          Choose folders{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
        </button>
      </div>
      {choosing && <FoldersPanel projects={projects} hidden={hidden} onShow={onShowFolders} onClose={() => setChoosing(false)} />}
      <div className="sidebar-bottom">
        <button className={`link-button${page === 'history' ? ' is-on' : ''}`} onClick={onHistory} title="Every past conversation (⌘Y)">
          All history
        </button>
        <button className="link-button" onClick={onSettings} title="Where your clients are (⌘,)">
          Watched folders…
        </button>
      </div>
    </nav>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.6 6.5v4.5M9.4 6.5v4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10L11 2.5zM9.5 4l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function TerminalIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6l2 2-2 2M8 10.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
