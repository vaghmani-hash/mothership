// Reading the head and tail of Claude Code transcripts from disk, and the History list.

import { open, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Head, Tail } from '../shared/transcript'
import { readHead, readTail, wholeLines } from '../shared/transcript'
import type { HistoryEntry } from '../shared/types'

const CHUNK = 512 * 1024
/** How far in from each end the app looks before giving up. */
const MAX_SCAN = 8 * 1024 * 1024

async function readRange(path: string, start: number, length: number): Promise<string> {
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await file.read(buffer, 0, length, start)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await file.close()
  }
}

/** The folder and first prompt, reading more of the start only while one is missing. */
export async function headOf(path: string, size: number): Promise<Head> {
  let length = Math.min(size, CHUNK)
  for (;;) {
    const head = readHead(wholeLines(await readRange(path, 0, length), true, length >= size))
    if ((head.cwd !== null && head.firstPrompt !== null) || length >= Math.min(size, MAX_SCAN)) return head
    length = Math.min(size, length * 4, MAX_SCAN)
  }
}

/** The latest titles and time, reading further back only while no title turns up. */
export async function tailOf(path: string, size: number): Promise<Tail> {
  let length = Math.min(size, CHUNK * 2)
  for (;;) {
    const start = size - length
    const tail = readTail(wholeLines(await readRange(path, start, length), start === 0, true))
    if (tail.customTitle !== null || tail.aiTitle !== null || length >= Math.min(size, MAX_SCAN)) return tail
    length = Math.min(size, length * 4, MAX_SCAN)
  }
}

/** Claude Code's title for a live session's transcript (your /rename first). */
export async function titleOf(transcript: string): Promise<string | null> {
  try {
    const { size } = await stat(transcript)
    const tail = await tailOf(transcript, size)
    return tail.customTitle ?? tail.aiTitle
  } catch {
    return null
  }
}

interface Cached {
  readonly mtimeMs: number
  readonly size: number
  readonly entry: Omit<HistoryEntry, 'name'> | null
}

/** Every conversation in the transcripts folder, newest first. Unchanged files are not read again. */
export class History {
  private readonly cache = new Map<string, Cached>()

  constructor(private readonly dir: string) {}

  async list(): Promise<Omit<HistoryEntry, 'name'>[]> {
    const files: string[] = []
    const folders = await readdir(this.dir, { withFileTypes: true }).catch(() => [])
    for (const folder of folders) {
      if (!folder.isDirectory()) continue
      const inside = await readdir(join(this.dir, folder.name)).catch(() => [])
      for (const name of inside) if (name.endsWith('.jsonl')) files.push(join(this.dir, folder.name, name))
    }
    const entries = await Promise.all(files.map((f) => this.read(f)))
    return entries.filter((e): e is Omit<HistoryEntry, 'name'> => e !== null).sort((a, b) => b.lastAt - a.lastAt)
  }

  private async read(path: string): Promise<Omit<HistoryEntry, 'name'> | null> {
    const info = await stat(path).catch(() => null)
    if (!info) return null
    const cached = this.cache.get(path)
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.entry
    let entry: Omit<HistoryEntry, 'name'> | null = null
    try {
      const head = await headOf(path, info.size)
      // Print-mode runs and conversations without a prompt of yours aren't worth resuming.
      if (head.cwd !== null && head.firstPrompt !== null && head.interactive) {
        const tail = await tailOf(path, info.size)
        entry = { claudeId: basename(path, '.jsonl'), cwd: head.cwd, title: tail.customTitle ?? tail.aiTitle, firstPrompt: head.firstPrompt, lastAt: tail.lastAt ?? info.mtimeMs }
      }
    } catch (err) {
      console.error('[history] unreadable transcript', path, err)
    }
    this.cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, entry })
    return entry
  }
}
