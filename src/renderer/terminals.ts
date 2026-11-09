// One xterm per session, kept while the session lives so switching sessions never loses output.
// The main process numbers every character a session writes (`end`); a terminal remembers how far
// it has shown, so the snapshot it starts from and the live output never overlap or leave a gap.

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { pasteFor } from './paste'

interface Entry {
  readonly term: Terminal
  readonly fit: FitAddon
  readonly host: HTMLDivElement
  end: number
  ready: boolean
  pending: { data: string; end: number }[]
}

const THEME = {
  background: '#101012',
  foreground: '#e6e6ea',
  cursor: '#e6e6ea',
  selectionBackground: '#3a4a6b',
  black: '#1c1c20',
  brightBlack: '#5c5c66'
}

const entries = new Map<string, Entry>()
let listening = false

function write(e: Entry, data: string, end: number): void {
  if (end <= e.end) return
  const start = end - data.length
  e.term.write(start >= e.end ? data : data.slice(e.end - start))
  e.end = end
}

function listen(): void {
  if (listening) return
  listening = true
  window.api.onData((id, data, end) => {
    const e = entries.get(id)
    if (!e) return
    if (e.ready) write(e, data, end)
    else e.pending.push({ data, end })
  })
}

function fitNow(id: string, e: Entry): void {
  if (!e.host.isConnected || e.host.clientWidth === 0) return
  e.fit.fit()
  window.api.resize(id, e.term.cols, e.term.rows)
}

function create(id: string, container: HTMLElement): Entry {
  const host = document.createElement('div')
  host.className = 'terminal-host'
  container.appendChild(host)
  const term = new Terminal({
    theme: THEME,
    fontFamily: 'Menlo, "SF Mono", Monaco, monospace',
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 10_000,
    macOptionIsMeta: true
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host)
  const e: Entry = { term, fit, host, end: 0, ready: false, pending: [] }
  term.onData((data) => window.api.input(id, data))
  // A paste (⌘V, Edit › Paste, right-click › Paste) or a drop of files or an image: see pasteFor.
  // Caught before xterm, which would paste only the text (a file's name, or nothing for an image).
  const take = (ev: ClipboardEvent | DragEvent, data: DataTransfer | null, from: 'clipboard' | 'drop'): void => {
    const files = [...(data?.files ?? [])]
    const action = pasteFor(files, (i) => window.api.pathForFile(files[i] as File), from)
    if (!action) return
    ev.preventDefault()
    ev.stopPropagation()
    if ('paste' in action) term.paste(action.paste)
    else window.api.input(id, action.input)
    term.focus()
  }
  host.addEventListener('paste', (ev) => take(ev, ev.clipboardData, 'clipboard'), true)
  host.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files')) return
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'copy'
  })
  host.addEventListener('drop', (ev) => take(ev, ev.dataTransfer, 'drop'))
  // Right-click › Paste goes to the focused element: the terminal.
  host.addEventListener('contextmenu', () => term.focus())
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true
    if (ev.metaKey && ev.key === 'c' && term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection())
      return false
    }
    // Shift+Enter: a new line in Claude's prompt (what Option+Enter sends).
    if (ev.shiftKey && ev.key === 'Enter') {
      window.api.input(id, '\x1b\r')
      return false
    }
    // ⌘ shortcuts belong to the menu (and ⌘V pastes through it).
    return !ev.metaKey
  })
  entries.set(id, e)
  void window.api.snapshot(id).then((snap) => {
    if (snap) {
      term.write(snap.data)
      e.end = snap.end
    }
    e.ready = true
    for (const p of e.pending) write(e, p.data, p.end)
    e.pending = []
  })
  return e
}

/** Shows the session's terminal in `container` (creating it the first time) and focuses it. */
export function attach(id: string, container: HTMLElement): () => void {
  listen()
  const e = entries.get(id) ?? create(id, container)
  if (e.host.parentElement !== container) container.appendChild(e.host)
  const observer = new ResizeObserver(() => fitNow(id, e))
  observer.observe(container)
  requestAnimationFrame(() => {
    fitNow(id, e)
    e.term.focus()
  })
  return () => {
    observer.disconnect()
    e.host.remove()
  }
}

/** The session is gone: its terminal goes too. */
export function dispose(id: string): void {
  entries.get(id)?.term.dispose()
  entries.delete(id)
}

export function knownTerminals(): string[] {
  return [...entries.keys()]
}
