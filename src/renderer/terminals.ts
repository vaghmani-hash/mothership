// One xterm per session, kept while the session lives so switching sessions never loses output.
// The main process numbers every character a session writes (`end`); a terminal remembers how far
// it has shown, so the snapshot it starts from and the live output never overlap or leave a gap.

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { pasteFor } from './paste'
import { terminalKey } from './keys'

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

/** Terminal text size, the same in every session: ⌘+ / ⌘- / ⌘0, kept between launches. */
const DEFAULT_SIZE = 13
const MIN_SIZE = 9
const MAX_SIZE = 28
const SIZE_KEY = 'terminal-font-size'

function savedSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return Number.isFinite(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}
let fontSize = savedSize()

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
    fontSize,
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
    const does = terminalKey(ev, term.hasSelection())
    if (does === 'copy') void navigator.clipboard.writeText(term.getSelection())
    // Shift+Enter: a new line in Claude's prompt (what Option+Enter sends).
    if (does === 'newline') window.api.input(id, '\x1b\r')
    // Only what is for Claude goes on to xterm; the menu's keys are left for the menu (⌘V pastes through it).
    return does === 'terminal'
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

/** Makes every terminal's text bigger (+1), smaller (-1) or back to its usual size (0). */
export function zoomTerminals(step: 1 | -1 | 0): void {
  fontSize = step === 0 ? DEFAULT_SIZE : Math.min(MAX_SIZE, Math.max(MIN_SIZE, fontSize + step))
  try {
    localStorage.setItem(SIZE_KEY, String(fontSize))
  } catch {
    // Not kept this time; the size still changes.
  }
  for (const [id, e] of entries) {
    e.term.options.fontSize = fontSize
    fitNow(id, e)
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
