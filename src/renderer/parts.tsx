// Small pieces used across the window: the state pill, the editable name and a ticking clock.

import { useEffect, useRef, useState } from 'react'
import { tidyName } from '../shared/names'
import type { SessionState } from '../shared/types'

export const STATE_LABEL: Record<SessionState, string> = {
  starting: 'Starting',
  ready: 'Ready',
  working: 'Working',
  'needs-you': 'Needs you',
  ended: 'Ended'
}

export function StateDot({ state }: { readonly state: SessionState }): React.JSX.Element {
  return <span className={`state-dot is-${state}`} role="img" aria-label={STATE_LABEL[state]} title={STATE_LABEL[state]} />
}

export function StatePill({ state }: { readonly state: SessionState }): React.JSX.Element {
  return (
    <span className={`state-pill is-${state}`}>
      <StateDot state={state} />
      {STATE_LABEL[state]}
    </span>
  )
}

/** The current time, every 30 seconds, for "4m ago". */
export function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

interface NameProps {
  /** What it is called now (your name or the automatic one). */
  readonly shown: string
  /** Your own name, or null while it is automatic. */
  readonly own: string | null
  readonly onSave: (name: string | null) => void
  readonly className?: string
  /** The rename button's words: a pencil when left out, or "Rename" in the session header. */
  readonly buttonText?: string
}

/**
 * A session's name: double-click it (or the pencil) to type one; Enter keeps it, Esc cancels, and an
 * empty name goes back to the automatic one.
 */
export function EditableName({ shown, own, onSave, className, buttonText }: NameProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])
  const start = (): void => {
    setDraft(own ?? shown)
    setEditing(true)
  }
  const done = (save: boolean): void => {
    if (!editing) return
    setEditing(false)
    if (!save) return
    const name = tidyName(draft)
    if (name !== own) onSave(name)
  }
  if (editing) {
    return (
      <input
        ref={input}
        className={`name-input ${className ?? ''}`}
        aria-label="Session name"
        value={draft}
        placeholder="Empty: Claude names it"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') done(true)
          if (e.key === 'Escape') done(false)
        }}
        onBlur={() => done(true)}
        onClick={(e) => e.stopPropagation()}
        autoFocus
      />
    )
  }
  return (
    <span className={`name ${className ?? ''}`} title={own ? 'Your name. Double-click to rename.' : 'Named automatically. Double-click to rename.'} onDoubleClick={(e) => (e.stopPropagation(), start())}>
      <span className="name-text">{shown}</span>
      <button
        className={buttonText ? 'rename rename-text' : 'icon-button rename'}
        aria-label={`Rename ${shown}`}
        title="Rename (or double-click the name). Leave it empty to go back to the automatic name."
        onClick={(e) => {
          e.stopPropagation()
          start()
        }}
      >
        {buttonText ?? '✎'}
      </button>
    </span>
  )
}
