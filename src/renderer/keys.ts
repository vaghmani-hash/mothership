// What a key pressed in a session's terminal does: most go to Claude; a few belong to the app.

interface Pressed {
  readonly type: string
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
}

/**
 * terminal: xterm sends it to Claude. menu: left alone, so the app's menu gets it (⌘ shortcuts, and
 * ⌃Tab / ⌃⇧Tab, which xterm would otherwise type into Claude as Tab and Shift+Tab). copy: ⌘C on a
 * selection. newline: Shift+Enter, a new line in Claude's prompt.
 */
export function terminalKey(ev: Pressed, hasSelection: boolean): 'terminal' | 'menu' | 'copy' | 'newline' {
  if (ev.type !== 'keydown') return 'terminal'
  if (ev.metaKey && ev.key === 'c' && hasSelection) return 'copy'
  if (ev.ctrlKey && ev.key === 'Tab') return 'menu'
  if (ev.shiftKey && ev.key === 'Enter') return 'newline'
  return ev.metaKey ? 'menu' : 'terminal'
}
