// Folders renamed or moved, in the app or in Finder. Sessions and conversations remember the
// folder they ran in by its path; once a folder is renamed that path is gone, so each rename is
// recorded (`folders.json`) and every remembered path is read through the renames. Claude Code
// files a conversation under its folder's path (`~/.claude/projects/<path with - for every
// other character>`), so a rename also moves the folder's conversations there, or Resume
// wouldn't find them.

import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { headOf } from './transcripts'

export interface Move {
  readonly from: string
  readonly to: string
  /** When it was renamed (ms). It applies to what started before then, never after: a new folder
   * may take the old name, and what starts in it is its own. */
  readonly at: number
}

export const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(folder + sep)

/** `path`, as something that started at `since` (ms) remembers it, read through the renames since. */
export function applyMoves(path: string, moves: readonly Move[], since: number): string {
  let now = path
  for (const m of moves) if (m.at > since && inside(now, m.from)) now = m.to + now.slice(m.from.length)
  return now
}

/**
 * The folder that was renamed, from a path before and after (`…/Mara/video 3/script` and
 * `…/Mara/rough cut/script` → `…/Mara/video 3` became `…/Mara/rough cut`). Null if they are the same.
 */
export function moveBetween(before: string, after: string): Omit<Move, 'at'> | null {
  if (before === after) return null
  const a = before.split(sep)
  const b = after.split(sep)
  while (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1]) {
    a.pop()
    b.pop()
  }
  return { from: a.join(sep), to: b.join(sep) }
}

/**
 * Whether the renames already say `move` (the same rename noticed again, or a folder inside one
 * already renamed): the latest rename of a folder holding `move.from` takes it to `move.to`, and
 * nothing renamed it away again since.
 */
export function alreadyMoved(move: Omit<Move, 'at'>, moves: readonly Move[]): boolean {
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    if (!m || !inside(move.from, m.from)) continue
    const mapped = m.to + move.from.slice(m.from.length)
    return mapped === move.to && !moves.slice(i + 1).some((later) => inside(mapped, later.from))
  }
  return false
}

/** Where Claude Code keeps a folder's conversations: its path with `-` for every other character. */
export const claudeProjectDir = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-')

/**
 * Puts every conversation whose folder was renamed since it started where Claude Code looks for it
 * under the new name: its `<id>.jsonl` with its `<id>/` folder, and, once a transcript folder has
 * no conversation left, the rest of it (its memory). A conversation in `busy` (Claude is still
 * writing it where it started) waits. Nothing in them is changed, and nothing already at the new
 * place is overwritten. Answers how many moved and how many still wait.
 */
export async function moveConversations(transcripts: string, moves: readonly Move[], busy: ReadonlySet<string> = new Set()): Promise<{ moved: number; waiting: number }> {
  let moved = 0
  let waiting = 0
  if (moves.length === 0) return { moved, waiting }
  for (const entry of await readdir(transcripts, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const source = join(transcripts, entry.name)
    let movedTo: string | null = null
    try {
      for (const name of (await readdir(source)).filter((n) => n.endsWith('.jsonl'))) {
        const info = await stat(join(source, name)).catch(() => null)
        const head = info ? await headOf(join(source, name), info.size).catch(() => null) : null
        if (!head?.cwd) continue
        const now = applyMoves(head.cwd, moves, head.startedAt ?? 0)
        const target = join(transcripts, claudeProjectDir(now))
        if (now === head.cwd || target === source) continue
        const id = name.slice(0, -'.jsonl'.length)
        if (busy.has(id)) {
          waiting++
          continue
        }
        await mkdir(target, { recursive: true })
        for (const part of [name, id]) {
          if (!existsSync(join(source, part)) || existsSync(join(target, part))) continue
          await rename(join(source, part), join(target, part))
          if (part === name) moved++
        }
        movedTo = target
      }
      // Its memory and other files go once no conversation is left beside them.
      const left = await readdir(source)
      if (movedTo !== null && !left.some((n) => n.endsWith('.jsonl'))) {
        for (const name of left) if (!existsSync(join(movedTo, name))) await rename(join(source, name), join(movedTo, name))
        if ((await readdir(source)).length === 0) await rmdir(source)
      }
    } catch (err) {
      console.error('[moves] could not move conversations from', source, err)
    }
  }
  return { moved, waiting }
}
