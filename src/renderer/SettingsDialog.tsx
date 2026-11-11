// Watched folders: where your clients are. Every client in them and every folder in each client is
// listed by itself. Which ones show is chosen at the bottom of the left panel (Choose folders).

import { useEffect, useRef, useState } from 'react'

export function SettingsDialog({ onClose, onSaved }: { readonly onClose: () => void; readonly onSaved: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [roots, setRoots] = useState<string[] | null>(null)
  useEffect(() => {
    dialog.current?.showModal()
    void window.api.roots().then(setRoots)
  }, [])
  const add = async (): Promise<void> => {
    const picked = await window.api.pickFolder()
    if (picked && roots && !roots.includes(picked)) setRoots([...roots, picked])
  }
  const save = async (): Promise<void> => {
    if (!roots) return
    await window.api.setRoots(roots)
    onSaved()
    onClose()
  }
  return (
    <dialog ref={dialog} className="dialog" aria-label="Watched folders" onClose={onClose}>
      <h2>Watched folders</h2>
      <p className="muted">The folders that hold your clients. Every client in them, and every folder in each client, is listed by itself and kept up to date. Claude starts in the folder you pick.</p>
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
