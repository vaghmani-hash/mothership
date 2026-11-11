// The top of the left panel: every open session, always in sight, in one fixed order (oldest
// first). Each row says where it runs and what it is doing; one that needs you stands out, with why.

import { sessionName } from '../shared/names'
import { whereLabel } from '../shared/projects'
import type { LiveSession, Project } from '../shared/types'
import { EditableName, StateDot, STATE_LABEL } from './parts'
import { ago } from './time'

interface Props {
  /** The open sessions to show, in their fixed order. */
  readonly sessions: readonly LiveSession[]
  /** How many are open in all (more than are shown while you search). */
  readonly total: number
  /** Each open session's place in the full order (1 for the first), for its ⌘ key. */
  readonly keyOf: (id: string) => number | null
  readonly projects: readonly Project[]
  readonly roots: readonly string[]
  readonly selected: string | null
  readonly now: number
  readonly onSelect: (id: string) => void
  readonly onRename: (claudeId: string, name: string | null) => void
  readonly onResumeEnded: (session: LiveSession) => void
  /** Shows the next session that needs you. */
  readonly onNextNeedsYou: () => void
  /** How many of all the open sessions need you. */
  readonly waiting: number
}

export function OpenSessions({ sessions, total, keyOf, projects, roots, selected, now, onSelect, onRename, onResumeEnded, onNextNeedsYou, waiting }: Props): React.JSX.Element {
  return (
    <section className="open-sessions" aria-label="Open sessions">
      <header className="zone-head">
        <h2>Open sessions</h2>
        {total > 0 && <span className="zone-count">{total}</span>}
        {waiting > 0 && (
          <button className="needs-jump" onClick={onNextNeedsYou} title="Show the next session that needs you (⌘J)">
            {waiting} need{waiting === 1 ? 's' : ''} you
          </button>
        )}
      </header>
      {total === 0 && <p className="panel-empty">Nothing open. Press + beside a client to start Claude in its folder.</p>}
      {total > 0 && sessions.length === 0 && <p className="panel-empty">No open session matches.</p>}
      {sessions.map((s) => {
        const key = keyOf(s.id)
        const since = ago(s.changedAt, now)
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            aria-label={`${sessionName(s)}, ${STATE_LABEL[s.state]}`}
            aria-current={selected === s.id ? 'true' : undefined}
            className={`session-row is-${s.state}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
          >
            <StateDot state={s.state} />
            <EditableName className="row-name" shown={sessionName(s)} own={s.name} onSave={(name) => onRename(s.claudeId, name)} />
            {key !== null && key <= 9 ? (
              <kbd className="row-key" title={`Show this session (⌘${key})`}>
                ⌘{key}
              </kbd>
            ) : (
              <span />
            )}
            <span className="row-where" title={s.cwd}>
              {whereLabel(s.cwd, projects, roots)}
            </span>
            <span className={`row-state is-${s.state}`}>
              {STATE_LABEL[s.state]}
              {since !== 'now' && <span className="row-time">{since}</span>}
            </span>
            {s.state === 'needs-you' && s.reason && <span className="row-reason">{s.reason}</span>}
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
          </div>
        )
      })}
    </section>
  )
}
