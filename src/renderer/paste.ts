// What a paste or drop into a session's terminal sends, other than plain text.

/** A path as Terminal pastes a dropped file: spaces and shell characters escaped. */
export const escapePath = (path: string): string => path.replace(/([ !"#$&'()*,;<>?[\\\]^`{|}~])/g, '\\$1')

/**
 * Files (copied in Finder, or dropped) go in as their paths, the way Terminal does; Claude Code
 * attaches an image given its path. An image on the clipboard with no file behind it (a
 * screenshot) has no text to paste: Claude Code reads it from the clipboard itself on Ctrl+V, so
 * that is sent. null: plain text, left to xterm.
 */
export function pasteFor(
  files: readonly { readonly type: string }[],
  pathOf: (index: number) => string,
  from: 'clipboard' | 'drop'
): { readonly paste: string } | { readonly input: string } | null {
  if (files.length === 0) return null
  const paths = files.map((_f, i) => pathOf(i)).filter((p) => p !== '')
  if (paths.length > 0) return { paste: `${paths.map(escapePath).join(' ')} ` }
  if (from === 'clipboard' && files.some((f) => f.type.startsWith('image/'))) return { input: '\x16' }
  return null
}
