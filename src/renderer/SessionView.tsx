// One session: its name, folder and state above its terminal.

import { useEffect, useRef } from 'react'
import { sessionName } from '../shared/names'
import { projectLabel, projectOf } from '../shared/projects'
import type { LiveSession, Project } from '../shared/types'
import { EditableName, StatePill, useNow } from './parts'
import { attach } from './terminals'
import { agoText } from './time'

interface Props {
  readonly session: LiveSession
  readonly roots: readonly string[]
  readonly projects: readonly Project[]
  readonly onNewHere: () => void
  readonly onResume: () => void
  readonly onClose: () => void
  readonly onRename: (name: string | null) => void
  readonly onDelete: () => void
}

export function SessionView({ session, roots, projects, onNewHere, onResume, onClose, onRename, onDelete }: Props): React.JSX.Element {
  const now = useNow()
  const box = useRef<HTMLDivElement>(null)
  const here = projectOf(session.cwd, projects)?.kind === 'video' ? 'video' : 'folder'
  useEffect(() => {
    if (!box.current) return
    return attach(session.id, box.current)
  }, [session.id])

  return (
    <main className="session-view" aria-label={`Session ${sessionName(session)}`}>
      <header className="session-head">
        <div className="session-where" title={session.cwd}>
          {projectLabel(session.cwd, projects, roots)}
        </div>
        <div className="session-title">
          <EditableName className="head-name" shown={sessionName(session)} own={session.name} onSave={onRename} buttonText="Rename" />
          <StatePill state={session.state} />
        </div>
        <div className="session-tools">
          <button onClick={onNewHere} title={`Another session in this ${here} (⌘T)`}>
            + New session in this {here}
          </button>
          <button onClick={() => window.api.reveal(session.cwd)} title={session.cwd}>
            Open folder
          </button>
          <button onClick={onClose} title="Close (⌘W)">
            Close
          </button>
          <button className="danger" onClick={onDelete} title="Stop it and move its conversation to the Trash">
            Delete
          </button>
        </div>
        <div className="session-meta" title={session.cwd}>
          Runs in {session.cwd} · started {agoText(session.startedAt, now)}
          {session.name && session.title && session.title !== session.name ? ` · Claude calls it “${session.title}”` : ''}
        </div>
      </header>
      {session.state === 'needs-you' && session.reason && <div className="banner is-needs-you">{session.reason}</div>}
      {session.state === 'ended' && (
        <div className="banner is-ended">
          Claude has ended{session.exitCode !== null && session.exitCode !== 0 ? ` (code ${session.exitCode})` : ''}.
          <button className="primary" onClick={onResume}>
            Resume conversation
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      )}
      <div className="terminal-box" ref={box} />
    </main>
  )
}
