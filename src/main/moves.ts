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
}

const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(folder + sep)

/** `path` read through the renames, oldest first. A path that still exists is left as it is. */
export function applyMoves(path: string, moves: readonly Move[], exists: (p: string) => boolean = existsSync): string {
  if (moves.length === 0 || exists(path)) return path
  let now = path
  for (const m of moves) if (inside(now, m.from)) now = m.to + now.slice(m.from.length)
  return now
}

/**
 * The folder that was renamed, from a path before and after (`…/Mara/video 3/script` and
 * `…/Mara/rough cut/script` → `…/Mara/video 3` became `…/Mara/rough cut`). Null if they are the same.
 */
export function moveBetween(before: string, after: string): Move | null {
  if (before === after) return null
  const a = before.split(sep)
  const b = after.split(sep)
  while (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1]) {
    a.pop()
    b.pop()
  }
  return { from: a.join(sep), to: b.join(sep) }
}

/** Where Claude Code keeps a folder's conversations: its path with `-` for every other character. */
export const claudeProjectDir = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-')

/** The folder a transcript folder belongs to, from the first conversation in it that says. */
async function folderOf(dir: string): Promise<string | null> {
  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.jsonl'))
  for (const name of names) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const head = await headOf(path, info.size).catch(() => null)
    if (head?.cwd) return head.cwd
  }
  return null
}

/**
 * Moves the conversations of every folder inside `move.from` to where Claude Code looks for them
 * under the new name: each `<id>.jsonl` with its `<id>/` folder, then the rest (its memory) once
 * nothing is left. A conversation in `busy` (Claude is still writing it where it started) waits.
 * `earlier` are the renames before this one. Nothing in them is changed, and nothing already at
 * the new place is overwritten. Answers how
 * many conversations moved and how many still wait.
 */
export async function moveConversations(transcripts: string, move: Move, busy: ReadonlySet<string> = new Set(), earlier: readonly Move[] = []): Promise<{ moved: number; waiting: number }> {
  let moved = 0
  let waiting = 0
  for (const entry of await readdir(transcripts, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const source = join(transcripts, entry.name)
    // A conversation names the folder it started in: earlier renames first, then this one.
    const started = await folderOf(source)
    const cwd = started === null ? null : applyMoves(started, earlier, () => false)
    if (cwd === null || !inside(cwd, move.from)) continue
    const target = join(transcripts, claudeProjectDir(move.to + cwd.slice(move.from.length)))
    if (target === source) continue
    try {
      await mkdir(target, { recursive: true })
      const names = await readdir(source)
      const ids = names.filter((n) => n.endsWith('.jsonl')).map((n) => n.slice(0, -'.jsonl'.length))
      const held = ids.filter((id) => busy.has(id))
      waiting += held.length
      for (const id of ids) {
        if (busy.has(id)) continue
        for (const name of [`${id}.jsonl`, id]) {
          if (!names.includes(name) || existsSync(join(target, name))) continue
          await rename(join(source, name), join(target, name))
          if (name.endsWith('.jsonl')) moved++
        }
      }
      // Its memory and other files go once no conversation is left writing beside them.
      if (held.length === 0) {
        for (const name of await readdir(source)) if (!existsSync(join(target, name))) await rename(join(source, name), join(target, name))
        if ((await readdir(source)).length === 0) await rmdir(source)
      }
    } catch (err) {
      console.error('[moves] could not move conversations', source, '→', target, err)
    }
  }
  return { moved, waiting }
}
