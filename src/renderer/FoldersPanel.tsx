// "Choose folders", at the bottom of the left panel: a checklist of every agency, client and video
// the app found. Tick what you want in the list, untick what you don't; each tick applies at once.
// An unticked agency hides all its clients, an unticked client all its videos. Something with a
// session running still shows (marked hidden).

import { useState } from 'react'
import { clientsOf } from '../shared/projects'
import type { Project } from '../shared/types'

interface Props {
  readonly projects: readonly Project[]
  readonly hidden: readonly string[]
  /** Shows (true) or hides (false) these folders. */
  readonly onShow: (paths: readonly string[], shown: boolean) => void
  readonly onClose: () => void
}

type Client = ReturnType<typeof clientsOf>[number]

export function FoldersPanel({ projects, hidden, onShow, onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const off = new Set(hidden)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const clients = clientsOf(projects).filter((c) => words.every((w) => `${c.agency ?? ''} ${c.client} ${c.projects.map((p) => p.title).join(' ')}`.toLowerCase().includes(w)))
  const groups = new Map<string, Client[]>()
  for (const c of clients) groups.set(c.agency ?? '', [...(groups.get(c.agency ?? '') ?? []), c])
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))

  return (
    <section className="folders-panel" aria-label="Choose folders">
      <div className="folders-head">
        <strong title="Tick what shows in the list, untick what doesn't">Choose folders</strong>
        <span className="spacer" />
        <button className="link-button" disabled={off.size === 0} onClick={() => onShow([...off], true)}>
          Tick all
        </button>
        <button className="link-button" onClick={onClose}>
          Done
        </button>
      </div>
      <input className="folders-search" type="search" placeholder="Find a folder" aria-label="Find a folder" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="show-list" role="group" aria-label="Folders">
        {ordered.length === 0 && <p className="muted small">{projects.length === 0 ? 'No folders found.' : 'No folder matches.'}</p>}
        {ordered.map(([agency, list]) => {
          const keys = list.map((c) => c.key)
          const shownCount = keys.filter((k) => !off.has(k)).length
          return (
            <div key={agency} className="show-group">
              {agency !== '' && (
                <label className="show-agency">
                  <input
                    type="checkbox"
                    aria-label={`Show ${agency}`}
                    checked={shownCount === keys.length}
                    ref={(el) => {
                      if (el) el.indeterminate = shownCount > 0 && shownCount < keys.length
                    }}
                    onChange={(e) => onShow(keys, e.target.checked)}
                  />
                  {agency} <span className="muted small">all {keys.length}</span>
                </label>
              )}
              <div className={agency !== '' ? 'show-clients' : undefined}>
                {list.map((c) => {
                  const clientShown = !off.has(c.key)
                  return (
                    <div key={c.key} className="show-client">
                      <label title={c.key}>
                        <input type="checkbox" aria-label={`Show ${c.client}`} checked={clientShown} onChange={(e) => onShow([c.key], e.target.checked)} />
                        <strong>{c.client}</strong>
                      </label>
                      <div className="show-videos">
                        {c.projects.map((p) => (
                          <label key={p.path} title={p.path} className={clientShown ? undefined : 'is-off'}>
                            <input type="checkbox" aria-label={`Show ${c.client} › ${p.title}`} disabled={!clientShown} checked={clientShown && !off.has(p.path)} onChange={(e) => onShow([p.path], e.target.checked)} />
                            {p.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
