// The left panel, top to bottom: New session and Find; the open sessions, always in sight; the
// clients, one line each; then New client, Choose folders, History and Watched folders.

import { useState } from 'react'
import { sessionName } from '../shared/names'
import { clientsOf, whereLabel } from '../shared/projects'
import type { HistoryEntry, LiveSession, Project } from '../shared/types'
import { ClientList } from './ClientList'
import { FoldersPanel } from './FoldersPanel'
import { OpenSessions } from './OpenSessions'
import { useNow } from './parts'

export type Page = 'session' | 'history' | 'home'

interface Props {
  /** The open sessions, in their fixed order. */
  readonly sessions: readonly LiveSession[]
  readonly projects: readonly Project[]
  readonly roots: readonly string[]
  readonly selected: string | null
  readonly page: Page
  readonly onSelect: (id: string) => void
  /** Opens New session, to name it or pick any folder. */
  readonly onNew: () => void
  /** Starts Claude in this folder at once. */
  readonly onStartIn: (folder: string) => void
  /** Shows the next session that needs you. */
  readonly onNextNeedsYou: () => void
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
  /** Folders you unticked in Choose folders (clients or folders in them). */
  readonly hidden: readonly string[]
  readonly onShowFolders: (paths: readonly string[], shown: boolean) => void
  readonly onNewClient: () => void
  readonly onNewVideo: (client: { readonly client: string; readonly clientPath: string; readonly existing: readonly string[] }) => void
}

export function Sidebar({ sessions, projects, roots, selected, page, onSelect, onNew, onStartIn, onNextNeedsYou, onHistory, onSettings, onRename, onDelete, history, onResume, onResumeEnded, hidden, onShowFolders, onNewClient, onNewVideo }: Props): React.JSX.Element {
  const now = useNow()
  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState(false)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = sessions.filter((s) => words.every((w) => `${sessionName(s)} ${whereLabel(s.cwd, projects, roots)}`.toLowerCase().includes(w)))
  const waiting = sessions.filter((s) => s.state === 'needs-you').length
  const hiddenSet = new Set(hidden)
  const hiddenCount = clientsOf(projects).filter((c) => hiddenSet.has(c.key)).length + projects.filter((p) => hiddenSet.has(p.path) && !hiddenSet.has(p.clientPath)).length

  return (
    <nav className="sidebar" aria-label="Clients and sessions">
      <div className="sidebar-top">
        <button className="primary new-button" onClick={onNew} title="New session: name it, or pick any folder (⌘N)">
          + New session
        </button>
        <input className="sidebar-search" type="search" placeholder="Find a client or session" aria-label="Find a client or session" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <OpenSessions
        sessions={found}
        total={sessions.length}
        keyOf={(id) => {
          const at = sessions.findIndex((s) => s.id === id)
          return at === -1 ? null : at + 1
        }}
        projects={projects}
        roots={roots}
        selected={page === 'session' ? selected : null}
        now={now}
        onSelect={onSelect}
        onRename={onRename}
        onResumeEnded={onResumeEnded}
        onNextNeedsYou={onNextNeedsYou}
        waiting={waiting}
      />

      <div className="panel-scroll">
        <ClientList projects={projects} sessions={sessions} history={history} hidden={hidden} words={words} now={now} onStartIn={onStartIn} onResume={onResume} onRename={onRename} onDelete={onDelete} onNewVideo={onNewVideo} />
      </div>

      <div className="sidebar-actions">
        <button className="link-button" onClick={onNewClient} title="Make a client folder with its first video">
          + New client
        </button>
        <button className="link-button" aria-expanded={choosing} onClick={() => setChoosing(!choosing)} title="Tick the clients and folders you want in the list, untick the ones you don't">
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
