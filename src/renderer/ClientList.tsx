// Below the open sessions: every client on one line, under its agency. + starts Claude in the
// client's own folder at once. Opening a client shows its past sessions (Resume) and, folded away
// until you ask, its folders (videos, Base) for the times a session should start in one of them.

import { useMemo, useState } from 'react'
import { displayName } from '../shared/names'
import { clientPathOf, clientsOf, projectOf } from '../shared/projects'
import type { HistoryEntry, LiveSession, Project } from '../shared/types'
import { EditableName, StateDot } from './parts'
import { agoText } from './time'

interface Props {
  readonly projects: readonly Project[]
  readonly sessions: readonly LiveSession[]
  /** Past conversations, newest first. */
  readonly history: readonly HistoryEntry[]
  /** Folders unticked in Choose folders (clients or folders in them). */
  readonly hidden: readonly string[]
  /** What you typed in Find, in lower case. */
  readonly words: readonly string[]
  readonly now: number
  /** Starts Claude in this folder at once. */
  readonly onStartIn: (folder: string) => void
  readonly onResume: (entry: HistoryEntry) => void
  readonly onRename: (claudeId: string, name: string | null) => void
  readonly onDelete: (claudeId: string, name: string) => void
  readonly onNewVideo: (client: { readonly client: string; readonly clientPath: string; readonly existing: readonly string[] }) => void
}

/** How many past sessions an open client shows before "Show more". */
const PAST_SHOWN = 3
const PAST_MOST = 30

/** What you opened: a client (by its folder) or its folders (the same key with FOLDERS after it). Kept between launches. */
const OPEN_KEY = 'client-sessions.client-folds'
const FOLDERS = '#folders'
function readOpen(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
    return typeof value === 'object' && value !== null ? (value as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}
function saveOpen(open: Record<string, boolean>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open))
  } catch {
    // Only a convenience.
  }
}

export function ClientList({ projects, sessions, history, hidden, words, now, onStartIn, onResume, onRename, onDelete, onNewVideo }: Props): React.JSX.Element {
  const [open, setOpen] = useState(readOpen)
  const [more, setMore] = useState<ReadonlySet<string>>(new Set())
  const searching = words.length > 0
  const matches = (text: string): boolean => words.every((w) => text.toLowerCase().includes(w))
  const flip = (key: string, to: boolean): void => {
    const next = { ...open, [key]: to }
    setOpen(next)
    saveOpen(next)
  }

  // Each client's open sessions and past conversations, wherever in the client they ran.
  const { liveIn, pastIn } = useMemo(() => {
    const liveIn = new Map<string, LiveSession[]>()
    const pastIn = new Map<string, HistoryEntry[]>()
    const openIds = new Set(sessions.filter((s) => s.state !== 'ended').map((s) => s.claudeId))
    for (const s of sessions) {
      const key = clientPathOf(s.cwd, projects)
      if (key) liveIn.set(key, [...(liveIn.get(key) ?? []), s])
    }
    for (const e of history) {
      const key = openIds.has(e.claudeId) ? null : clientPathOf(e.cwd, projects)
      if (key) pastIn.set(key, [...(pastIn.get(key) ?? []), e])
    }
    return { liveIn, pastIn }
  }, [sessions, history, projects])

  const off = new Set(hidden)
  const shown = clientsOf(projects)
    .filter((c) => !off.has(c.key))
    .map((c) => {
      const byName = matches(`${c.client} ${c.agency ?? ''}`)
      const folders = c.projects.filter((p) => p.path !== c.key && !off.has(p.path))
      const past = pastIn.get(c.key) ?? []
      // A search that finds something inside a client (not its name) shows just that, opened.
      const inside = searching && !byName
      return {
        ...c,
        inside,
        folders: inside ? folders.filter((p) => matches(`${p.title} ${p.name}`)) : folders,
        past: inside ? past.filter((e) => matches(displayName(e))) : past,
        // Every folder name, hidden ones too, so the next video's number is right.
        folderNames: c.projects.filter((p) => p.path !== c.key).map((p) => p.name)
      }
    })
    .filter((c) => !c.inside || c.folders.length > 0 || c.past.length > 0)

  const agencies = new Map<string, typeof shown>()
  for (const c of shown) agencies.set(c.agency ?? '', [...(agencies.get(c.agency ?? '') ?? []), c])
  const ordered = [...agencies.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, undefined, { sensitivity: 'base' })))

  const pastRow = (e: HistoryEntry): React.JSX.Element => {
    const folder = projectOf(e.cwd, projects)
    const inFolder = folder && folder.path !== folder.clientPath ? folder.title : null
    return (
      <div key={e.claudeId} className="past-row" role="group" aria-label={displayName(e)}>
        <span className="past-text">
          <EditableName className="past-name" shown={displayName(e)} own={e.name} onSave={(name) => onRename(e.claudeId, name)} />
          <span className="past-when">
            {agoText(e.lastAt, now)}
            {inFolder ? `, in ${inFolder}` : ''}
          </span>
        </span>
        <button className="resume-button" onClick={() => onResume(e)} title={`Continue this conversation in ${e.cwd}`}>
          Resume
        </button>
        <button className="delete-button" onClick={() => onDelete(e.claudeId, displayName(e))} title="Delete this conversation (to the Trash)" aria-label={`Delete ${displayName(e)}`}>
          <TrashIcon />
        </button>
      </div>
    )
  }

  return (
    <section className="client-list" aria-label="Clients">
      <header className="zone-head">
        <h2>Clients</h2>
      </header>
      {projects.length === 0 && <p className="panel-empty">No client folders found. Is the drive with your watched folder connected?</p>}
      {projects.length > 0 && shown.length === 0 && <p className="panel-empty">{searching ? 'No client matches.' : 'Every client is hidden. Tick them again in Choose folders.'}</p>}
      {ordered.map(([agency, clients]) => (
        <div key={agency} className="agency-group" role="group" aria-label={agency === '' ? 'Clients without an agency' : agency}>
          {agency !== '' && <h3 className="agency-head">{agency}</h3>}
          {clients.map((c) => {
            const label = c.agency ? `${c.client} (${c.agency})` : c.client
            const isOpen = c.inside || (open[c.key] ?? false)
            const foldersOpen = (c.inside && c.folders.length > 0) || (open[c.key + FOLDERS] ?? false)
            const live = liveIn.get(c.key) ?? []
            const all = more.has(c.key) || c.inside
            const past = c.past.slice(0, all ? PAST_MOST : PAST_SHOWN)
            return (
              <section key={c.key} className={`client${isOpen ? ' is-open' : ''}`} aria-label={label}>
                <div className="client-row" title={c.key}>
                  {/* While a search holds a client open, its toggles are left alone: what you opened yourself is kept. */}
                  <button className="client-toggle" aria-expanded={isOpen} aria-label={label} onClick={() => !c.inside && flip(c.key, !isOpen)}>
                    <span className="twisty" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="client-name">{c.client}</span>
                    {live.length > 0 && (
                      <span className="client-dots" title={`${live.length} open`}>
                        {live.map((s) => (
                          <StateDot key={s.id} state={s.state} />
                        ))}
                      </span>
                    )}
                  </button>
                  <button className="start-here" aria-label={`New session in the ${c.client} client folder`} title={`Start Claude in ${c.key}`} onClick={() => onStartIn(c.key)}>
                    +
                  </button>
                </div>
                {isOpen && (
                  <div className="client-body">
                    {past.map(pastRow)}
                    {c.past.length === 0 && !c.inside && <p className="client-empty">No past sessions here yet.</p>}
                    {!c.inside && c.past.length > PAST_SHOWN && (
                      <button className="link-button more-past" onClick={() => setMore((old) => new Set(all ? [...old].filter((k) => k !== c.key) : [...old, c.key]))}>
                        {all ? 'Show fewer' : `Show ${Math.min(c.past.length, PAST_MOST) - PAST_SHOWN} more`}
                      </button>
                    )}
                    {(c.folders.length > 0 || !c.inside) && (
                      <button className="folders-toggle" aria-expanded={foldersOpen} onClick={() => !c.inside && flip(c.key + FOLDERS, !foldersOpen)}>
                        <span className="twisty" aria-hidden="true">
                          {foldersOpen ? '▾' : '▸'}
                        </span>
                        Folders
                        <span className="zone-count">{c.folders.length}</span>
                      </button>
                    )}
                    {foldersOpen && (
                      <div className="folder-list">
                        {c.folders.map((p) => (
                          <div key={p.path} className={`folder-row is-${p.kind}`} role="group" aria-label={`${c.client} › ${p.title}`} title={p.path}>
                            <span className="folder-name">{p.title}</span>
                            <button className="start-here" aria-label={`New session in ${c.client} › ${p.title}`} title={`Start Claude in ${p.path}`} onClick={() => onStartIn(p.path)}>
                              +
                            </button>
                          </div>
                        ))}
                        {!c.inside && (
                          <button className="link-button new-video" aria-label={`New video for ${c.client}`} title={`A new video folder in ${c.key}`} onClick={() => onNewVideo({ client: c.client, clientPath: c.key, existing: c.folderNames })}>
                            + New video folder
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ))}
    </section>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.6 6.5v4.5M9.4 6.5v4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
