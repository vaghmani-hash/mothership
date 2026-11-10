// Every past conversation in the watched folders, newest first, by day: search, filter by client,
// rename, and resume (or show it, when it is open now).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { displayName } from '../shared/names'
import { clientsOf, OTHER, projectLabel, projectOf } from '../shared/projects'
import type { HistoryEntry, LiveSession, Project } from '../shared/types'
import { EditableName, useNow } from './parts'
import { clock, dayLabel } from './time'

interface Props {
  readonly roots: readonly string[]
  readonly projects: readonly Project[]
  readonly sessions: readonly LiveSession[]
  readonly onResume: (entry: HistoryEntry) => void
  /** Asks, then deletes; true once it is gone. */
  readonly onDelete: (claudeId: string, name: string) => Promise<boolean>
  readonly onShow: (id: string) => void
}

export function HistoryView({ roots, projects, sessions, onResume, onShow, onDelete }: Props): React.JSX.Element {
  const now = useNow()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [client, setClient] = useState('')
  const load = useCallback(() => void window.api.history().then(setEntries), [])
  useEffect(load, [load])

  const rename = async (claudeId: string, name: string | null): Promise<void> => {
    await window.api.rename(claudeId, name)
    setEntries((all) => all?.map((e) => (e.claudeId === claudeId ? { ...e, name } : e)) ?? null)
  }

  const clientKey = (e: HistoryEntry): string => projectOf(e.cwd, projects)?.clientPath ?? OTHER
  const clients = useMemo(() => {
    const used = new Set((entries ?? []).map(clientKey))
    const list = clientsOf(projects).filter((c) => used.has(c.key)).map((c) => ({ key: c.key, label: c.agency ? `${c.client} (${c.agency})` : c.client }))
    return used.has(OTHER) ? [...list, { key: OTHER, label: OTHER }] : list
  }, [entries, projects])
  const shown = (entries ?? []).filter((e) => {
    if (client !== '' && clientKey(e) !== client) return false
    const words = query.trim().toLowerCase()
    if (words === '') return true
    const hay = [e.name, e.title, e.firstPrompt, projectLabel(e.cwd, projects, roots)].filter(Boolean).join(' ').toLowerCase()
    return words.split(/\s+/).every((w) => hay.includes(w))
  })
  const days: { day: string; items: HistoryEntry[] }[] = []
  for (const e of shown) {
    const day = dayLabel(e.lastAt, now)
    const last = days[days.length - 1]
    if (last?.day === day) last.items.push(e)
    else days.push({ day, items: [e] })
  }

  return (
    <main className="history" aria-label="History">
      <header className="page-head">
        <h1>History</h1>
        <input className="search" type="search" placeholder="Search names, titles, prompts and projects" aria-label="Search history" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button onClick={load}>Refresh</button>
      </header>
      {entries === null && <p className="muted pad">Reading your conversations…</p>}
      {entries !== null && shown.length === 0 && <p className="muted pad">{entries.length === 0 ? 'No conversations in the watched folders yet.' : 'Nothing matches.'}</p>}
      <div className="history-list">
        {days.map(({ day, items }) => (
          <section key={day} aria-label={day}>
            <h2 className="day">{day}</h2>
            {items.map((e) => {
              const live = sessions.find((s) => s.claudeId === e.claudeId && s.state !== 'ended')
              const name = displayName(e)
              return (
                <div key={e.claudeId} className="history-row" role="group" aria-label={name}>
                  <div className="history-main">
                    <EditableName shown={name} own={e.name} onSave={(n) => void rename(e.claudeId, n)} />
                    {live && <span className="live-tag">open now</span>}
                    <div className="history-meta" title={e.cwd}>
                      <strong>{projectLabel(e.cwd, projects, roots)}</strong> · {clock(e.lastAt)}
                    </div>
                    {e.firstPrompt && e.firstPrompt !== name && <div className="history-prompt">“{e.firstPrompt}”</div>}
                  </div>
                  <div className="history-actions">
                    {live ? <button onClick={() => onShow(live.id)}>Show</button> : <button className="primary" onClick={() => onResume(e)}>Resume</button>}
                    <button onClick={() => void onDelete(e.claudeId, name).then((gone) => gone && setEntries((all) => all?.filter((x) => x.claudeId !== e.claudeId) ?? null))} title="Delete this conversation (to the Trash)">
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </main>
  )
}
