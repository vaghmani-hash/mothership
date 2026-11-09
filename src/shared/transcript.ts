// Reading Claude Code transcripts (`<config dir>/projects/<folder>/<session id>.jsonl`, one JSON
// object per line). Transcripts can be tens of MB, mostly API blobs, so the app reads only the
// head (the folder and your first prompt) and the tail (the latest title and time).

/** Lines longer than this are blobs, never a prompt or a title: skipped without parsing. */
const MAX_LINE = 1_000_000

type Line = Record<string, unknown>

function parse(line: string, ...needles: string[]): Line | null {
  if (line.length > MAX_LINE || !needles.some((n) => line.includes(n))) return null
  try {
    const value: unknown = JSON.parse(line)
    return typeof value === 'object' && value !== null ? (value as Line) : null
  } catch {
    return null
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** One line of a prompt to show: the first line with words, image markers dropped, at most `mesa` characters. */
export function cleanPrompt(prompt: string, max = 100): string | null {
  const line = prompt
    .replace(/\[Image #\d+\]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find((l) => l !== '')
  if (!line) return null
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/**
 * The words you typed in a `user` line, or null for lines that aren't your prompt: tool results,
 * meta and sidechain lines, compact summaries, and command or system markup (`<command-name>…`).
 */
export function promptOf(line: Line): string | null {
  if (line['type'] !== 'user' || line['isMeta'] === true || line['isSidechain'] === true || line['isCompactSummary'] === true) return null
  const content = (line['message'] as { content?: unknown } | undefined)?.content
  let words: string | null = null
  if (typeof content === 'string') words = content
  else if (Array.isArray(content)) {
    const parts = content.filter((p): p is { type: string; text: string } => typeof p === 'object' && p !== null && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    if (parts.length > 0 && parts.length + content.filter((p) => (p as { type?: unknown })?.type === 'image').length === content.length) words = parts.map((p) => p.text).join('\n')
  }
  if (words === null || words.trimStart().startsWith('<')) return null
  return cleanPrompt(words)
}

export interface Head {
  readonly cwd: string | null
  readonly firstPrompt: string | null
  /** False for print-mode and SDK runs (`claude -p`), which are not conversations to resume. */
  readonly interactive: boolean
}

/** From the first lines of a transcript. */
export function readHead(lines: readonly string[]): Head {
  let cwd: string | null = null
  let firstPrompt: string | null = null
  let interactive = true
  for (const raw of lines) {
    const line = parse(raw, '"cwd"', '"type":"user"')
    if (!line) continue
    cwd ??= text(line['cwd'])
    if (typeof line['entrypoint'] === 'string' && line['entrypoint'].startsWith('sdk')) interactive = false
    firstPrompt ??= promptOf(line)
    if (cwd !== null && firstPrompt !== null) break
  }
  return { cwd, firstPrompt, interactive }
}

export interface Tail {
  /** Your /rename, if any. */
  readonly customTitle: string | null
  /** The title Claude Code made up. */
  readonly aiTitle: string | null
  readonly lastAt: number | null
}

/** From the last lines of a transcript: the latest of each title wins. */
export function readTail(lines: readonly string[]): Tail {
  let customTitle: string | null = null
  let aiTitle: string | null = null
  let lastAt: number | null = null
  for (const raw of lines) {
    const line = parse(raw, '"custom-title"', '"ai-title"', '"timestamp"')
    if (!line) continue
    if (line['type'] === 'custom-title') customTitle = text(line['customTitle']) ?? customTitle
    if (line['type'] === 'ai-title') aiTitle = text(line['aiTitle']) ?? aiTitle
    const at = typeof line['timestamp'] === 'string' ? Date.parse(line['timestamp']) : NaN
    if (!Number.isNaN(at)) lastAt = Math.max(lastAt ?? 0, at)
  }
  return { customTitle, aiTitle, lastAt }
}

/** Whole lines of a chunk read from the middle of a file: the cut-off first and last ones dropped. */
export function wholeLines(chunk: string, startsAtFileStart: boolean, endsAtFileEnd: boolean): string[] {
  const lines = chunk.split('\n')
  if (!startsAtFileStart) lines.shift()
  if (!endsAtFileEnd) lines.pop()
  return lines
}
