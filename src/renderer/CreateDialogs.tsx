// New client and New video: they make the folders the way you lay them out,
// <watched folder>/[agency/]<client>/<video>/script, then offer to start Claude in the new video.

import { useEffect, useRef, useState } from 'react'
import { agenciesOf, nextVideoFolder, videoTitle } from '../shared/projects'
import type { Project } from '../shared/types'

const NEW_AGENCY = '\u0000new'

interface ClientProps {
  readonly roots: readonly string[]
  readonly projects: readonly Project[]
  readonly sessionFolder: string
  /** The new video's session folder. */
  readonly onCreated: (sessionDir: string) => void
  readonly onClose: () => void
}

export function NewClientDialog({ roots, projects, sessionFolder, onCreated, onClose }: ClientProps): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [root, setRoot] = useState(roots[0] ?? '')
  const agencies = agenciesOf(projects).filter((a) => a.root === root)
  const [agency, setAgency] = useState<string>(agencies[0]?.name ?? '')
  const [newAgency, setNewAgency] = useState('')
  const [client, setClient] = useState('')
  const [video, setVideo] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => dialog.current?.showModal(), [])

  const agencyName = agency === NEW_AGENCY ? newAgency.trim() : agency
  const where = [root, agencyName, client.trim() || '<client>', video.trim() || '<video>', sessionFolder].filter(Boolean).join('/')
  const create = async (): Promise<void> => {
    setBusy(true)
    const result = await window.api.createClient({ root, agency: agencyName === '' ? null : agencyName, client, video })
    setBusy(false)
    if (result.ok) onCreated(result.value)
    else setError(result.error)
  }

  return (
    <dialog ref={dialog} className="dialog" aria-label="New client" onClose={onClose}>
      <h2>New client</h2>
      <label className="field">
        <span>Client</span>
        <input value={client} placeholder="Their name, as the folder should read (Cora, Fitlab…)" onChange={(e) => setClient(e.target.value)} autoFocus />
      </label>
      {roots.length > 1 && (
        <label className="field">
          <span>In</span>
          <select value={root} onChange={(e) => setRoot(e.target.value)}>
            {roots.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Agency</span>
        <select aria-label="Agency" value={agency} onChange={(e) => setAgency(e.target.value)}>
          {agencies.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
          <option value="">No agency (straight in {root.split('/').pop()})</option>
          <option value={NEW_AGENCY}>New agency…</option>
        </select>
      </label>
      {agency === NEW_AGENCY && (
        <label className="field">
          <span>Name</span>
          <input aria-label="New agency" value={newAgency} placeholder="The agency folder's name" onChange={(e) => setNewAgency(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>First video</span>
        <input aria-label="First video" value={video} onChange={(e) => setVideo(e.target.value)} />
      </label>
      <p className="hint">
        Shows as <strong>{client.trim() || 'the client'} › {videoTitle(video.trim() || '1')}</strong>. Creates <code>{where}</code>, where its sessions run.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || client.trim() === '' || video.trim() === '' || (agency === NEW_AGENCY && newAgency.trim() === '')} onClick={() => void create()}>
          Create client
        </button>
      </div>
    </dialog>
  )
}

interface VideoProps {
  readonly client: string
  readonly clientPath: string
  /** The client's video folder names, for the next number. */
  readonly existing: readonly string[]
  readonly sessionFolder: string
  readonly onCreated: (sessionDir: string) => void
  readonly onClose: () => void
}

export function NewVideoDialog({ client, clientPath, existing, sessionFolder, onCreated, onClose }: VideoProps): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(() => nextVideoFolder(existing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => dialog.current?.showModal(), [])
  const create = async (): Promise<void> => {
    setBusy(true)
    const result = await window.api.createVideo(clientPath, name)
    setBusy(false)
    if (result.ok) onCreated(result.value)
    else setError(result.error)
  }
  return (
    <dialog ref={dialog} className="dialog" aria-label={`New video for ${client}`} onClose={onClose}>
      <h2>New video for {client}</h2>
      <label className="field">
        <span>Folder</span>
        <input aria-label="Video folder" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() !== '' && void create()} autoFocus />
      </label>
      <p className="hint">
        Shows as <strong>{client} › {videoTitle(name.trim() || '?')}</strong>. Creates <code>{`${clientPath}/${name.trim() || '<video>'}/${sessionFolder}`}</code>.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || name.trim() === ''} onClick={() => void create()}>
          Create video
        </button>
      </div>
    </dialog>
  )
}
