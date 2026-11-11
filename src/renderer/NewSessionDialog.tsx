// "New session": a name (optional) and a folder of a client. The session runs in that folder
// itself; any other folder can still be chosen. From a folder's +, the folder is chosen.

import { useEffect, useRef, useState } from 'react'
import { sessionName, tidyName } from '../shared/names'
import { clientsOf, projectLabel, projectOf, seqKey } from '../shared/projects'
import type { LiveSession, Project } from '../shared/types'

interface Props {
  readonly projects: readonly Project[]
  readonly roots: readonly string[]
  readonly sessions: readonly LiveSession[]
  /** The folder it starts in, when opened from a project's + or "New session here". */
  readonly startIn?: string
  readonly onStart: (cwd: string, name: string | null) => Promise<string | null>
  readonly onClose: () => void
}

export function NewSessionDialog({ projects, roots, sessions, startIn, onStart, onClose }: Props): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [cwd, setCwd] = useState<string | null>(startIn ?? null)
  const [picking, setPicking] = useState(startIn === undefined)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<Project[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => dialog.current?.showModal(), [])
  useEffect(() => {
    void window.api.history().then((entries) => {
      const seen = new Set<string>()
      const list: Project[] = []
      for (const cwdOf of [...sessions.map((s) => s.cwd), ...entries.map((e) => e.cwd)]) {
        const p = projectOf(cwdOf, projects)
        if (p && !seen.has(p.path)) {
          seen.add(p.path)
          list.push(p)
        }
      }
      setRecent(list.slice(0, 6))
    })
  }, [projects, sessions])

  const chosen = cwd === null ? null : projectOf(cwd, projects)
  const key = cwd === null ? null : seqKey(cwd, projects)
  const here = key === null ? [] : sessions.filter((s) => seqKey(s.cwd, projects) === key).sort((a, b) => a.seq - b.seq)
  const seq = Math.max(0, ...here.map((s) => s.seq)) + 1
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const clients = clientsOf(projects)
    .map((c) => ({ ...c, projects: c.projects.filter((p) => words.every((w) => `${c.client} ${c.agency ?? ''} ${p.name}`.toLowerCase().includes(w))) }))
    .filter((c) => c.projects.length > 0)

  const pick = (folder: string): void => {
    setCwd(folder)
    setError(null)
  }
  const start = async (): Promise<void> => {
    if (cwd === null) return
    setBusy(true)
    const problem = await onStart(cwd, tidyName(name))
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <dialog ref={dialog} className="dialog new-session" aria-label="New session" onClose={onClose}>
      <h2>New session</h2>
      <label className="field">
        <span>Name</span>
        <input value={name} placeholder="Automatic: Claude names it from your first prompt" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && cwd !== null && void start()} autoFocus />
      </label>
      <div className="field">
        <span>Folder</span>
        <div>
          {cwd !== null && (
            <div className="chosen">
              <strong>{projectLabel(cwd, projects, roots)}</strong>
              {!picking && (
                <button className="link-button" onClick={() => setPicking(true)}>
                  Change
                </button>
              )}
              <div className="runs-in" title={cwd}>
                Runs in {cwd}
              </div>
            </div>
          )}
          {picking && (
            <div className="picker">
              <input type="search" className="picker-search" placeholder="Find a client, video or folder" aria-label="Find a project" value={query} onChange={(e) => setQuery(e.target.value)} />
              {recent.length > 0 && words.length === 0 && (
                <>
                  <h3>Recent</h3>
                  <div className="recent">
                    {recent.map((p) => (
                      <button key={p.path} className={`chip${cwd === p.path ? ' is-on' : ''}`} onClick={() => pick(p.path)}>
                        {p.name === p.client ? p.client : `${p.client} › ${p.title}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="project-picker" role="listbox" aria-label="Projects">
                {clients.length === 0 && <p className="muted">{projects.length === 0 ? 'No client folders found under the watched folders.' : 'No folder matches.'}</p>}
                {clients.map((c) => (
                  <div key={c.key} className="picker-client">
                    <h3>
                      {c.client}
                      {c.agency && <span className="agency">{c.agency}</span>}
                    </h3>
                    <div className="recent">
                      <button role="option" aria-selected={cwd === c.key} className={`chip client-chip${cwd === c.key ? ' is-on' : ''}`} title={c.key} onClick={() => pick(c.key)}>
                        Client folder
                      </button>
                      {c.projects
                        .filter((p) => p.path !== c.key)
                        .map((p) => (
                          <button key={p.path} role="option" aria-selected={cwd === p.path} className={`chip${p.kind === 'folder' ? ' folder-chip' : ''}${cwd === p.path ? ' is-on' : ''}`} title={p.path} onClick={() => pick(p.path)}>
                            {p.title}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="link-button"
                onClick={() =>
                  void window.api.pickFolder().then((p) => {
                    if (p) pick(p)
                  })
                }
              >
                Use another folder…
              </button>
            </div>
          )}
        </div>
      </div>
      {cwd !== null && (
        <p className="hint">
          {here.length > 0 ? `${here.length} already open in ${chosen?.kind === 'video' ? 'this video' : 'this folder'}: ${here.map((s) => sessionName(s)).join(', ')}. ` : ''}
          {name.trim() === '' ? `With no name it shows as “${seq > 1 ? `New session ${seq}` : 'New session'}” until Claude names it from your first prompt; rename it any time.` : ''}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={cwd === null || busy} onClick={() => void start()}>
          Start Claude
        </button>
      </div>
    </dialog>
  )
}
