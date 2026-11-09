// Watched folders: where your clients are, and the folder inside each video where its sessions run.
// Which folders show in the list is chosen at the bottom of the left panel (Choose folders).

import { useEffect, useRef, useState } from 'react'

export function SettingsDialog({ onClose, onSaved }: { readonly onClose: () => void; readonly onSaved: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [roots, setRoots] = useState<string[] | null>(null)
  const [folder, setFolder] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    dialog.current?.showModal()
    void window.api.roots().then(setRoots)
    void window.api.sessionFolder().then(setFolder)
  }, [])
  const add = async (): Promise<void> => {
    const picked = await window.api.pickFolder()
    if (picked && roots && !roots.includes(picked)) setRoots([...roots, picked])
  }
  const save = async (): Promise<void> => {
    if (!roots) return
    const result = await window.api.setSessionFolder(folder)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await window.api.setRoots(roots)
    onSaved()
    onClose()
  }
  return (
    <dialog ref={dialog} className="dialog" aria-label="Watched folders" onClose={onClose}>
      <h2>Watched folders</h2>
      <p className="muted">The folders that hold your clients. A video is any folder with a session folder inside; its client is the folder it sits in.</p>
      <ul className="root-list">
        {roots?.length === 0 && <li className="muted">No folders yet.</li>}
        {roots?.map((r) => (
          <li key={r}>
            <span className="root-path">{r}</span>
            <button className="link-button" onClick={() => setRoots(roots.filter((x) => x !== r))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => void add()}>Add folder…</button>
      <p className="muted small settings-note">
        To choose which folders show in the list, use <strong>Choose folders</strong> at the bottom of the left panel.
      </p>
      <label className="field session-folder">
        <span>Sessions run in</span>
        <input aria-label="Session folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
      </label>
      <p className="muted small">The folder inside each video where Claude starts (for example “script” in mesa › Wren › 2 › script).</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </dialog>
  )
}
