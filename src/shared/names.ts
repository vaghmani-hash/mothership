// What a session is called, and where its folder sits among your clients.

/** Your name, else Claude's title, else your first prompt, else "New session". */
export function displayName(s: { readonly name: string | null; readonly title: string | null; readonly firstPrompt: string | null }): string {
  return s.name ?? s.title ?? s.firstPrompt ?? 'New session'
}

/** A live session's name; untitled ones in the same project read "New session 2", "New session 3". */
export function sessionName(s: { readonly name: string | null; readonly title: string | null; readonly firstPrompt: string | null; readonly seq: number }): string {
  const name = displayName(s)
  return name === 'New session' && s.seq > 1 ? `New session ${s.seq}` : name
}

/** A typed name, tidied: one line, trimmed, at most 80 characters; empty means "automatic again". */
export function tidyName(input: string): string | null {
  const one = input.replace(/\s+/g, ' ').trim().slice(0, 80)
  return one === '' ? null : one
}

export interface Place {
  /** The watched folder it is under, or null. */
  readonly root: string | null
  /** The top folder under the root (the client or agency), or "Other folders". */
  readonly section: string
  /** The folder's path under the section, joined with › ("Wren › 2 › script"). */
  readonly label: string
}

const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** Where `folder` sits: its watched folder, its client section and a short label. */
export function placeOf(folder: string, roots: readonly string[]): Place {
  const path = trimSlash(folder)
  // The deepest root wins when one watched folder is inside another.
  const root = [...roots].map(trimSlash).sort((a, b) => b.length - a.length).find((r) => path === r || path.startsWith(`${r}/`)) ?? null
  if (root === null) {
    const parts = path.split('/').filter(Boolean)
    return { root: null, section: 'Other folders', label: parts.slice(-3).join(' › ') || path }
  }
  const parts = path.slice(root.length).split('/').filter(Boolean)
  const rootName = root.split('/').filter(Boolean).pop() ?? root
  if (parts.length === 0) return { root, section: rootName, label: rootName }
  const [section, ...rest] = parts as [string, ...string[]]
  return { root, section, label: rest.length > 0 ? rest.join(' › ') : section }
}
