// Renamed folders: a rename applies to what started before it (a new folder may take the old
// name), the renamed folder is found from a session's before and after, and conversations move to
// where Claude Code looks for them.

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyMoves, claudeProjectDir, moveBetween, moveConversations } from '../src/main/moves'
import { Store } from '../src/main/store'

const T = (h: number): number => Date.parse(`2026-11-21T0${h}:00:00.000Z`)
const M = '/c/mesa/Mara'
// What happened in Mara's folder: video 3's work went to "rough cut" (1:00); a new video,
// "step count", was made and got a session (2:00); then it was renamed "video 3" (3:00).
const moves = [
  { from: `${M}/video 3`, to: `${M}/rough cut`, at: T(1) },
  { from: `${M}/step count`, to: `${M}/video 3`, at: T(3) }
]

describe('renamed folders', () => {
  it('reads a path through the renames since it was remembered, never through older ones', () => {
    expect(applyMoves(`${M}/video 3/script`, moves, T(0))).toBe(`${M}/rough cut/script`)
    expect(applyMoves(`${M}/step count/script`, moves, T(2))).toBe(`${M}/video 3/script`)
    // Started in the new "video 3": it is that folder, not the old one of the same name.
    expect(applyMoves(`${M}/video 3/script`, moves, T(4))).toBe(`${M}/video 3/script`)
    expect(applyMoves(`${M}/video 30/script`, moves, T(0))).toBe(`${M}/video 30/script`)
    // Renamed, and renamed back.
    expect(applyMoves('/c/A/script', [{ from: '/c/A', to: '/c/B', at: T(1) }, { from: '/c/B', to: '/c/A', at: T(2) }], T(0))).toBe('/c/A/script')
  })

  it("finds the renamed folder from a session's folder before and after", () => {
    expect(moveBetween(`${M}/step count/script`, `${M}/video 3/script`)).toEqual({ from: `${M}/step count`, to: `${M}/video 3` })
    expect(moveBetween(`${M}/2/script`, '/c/mesa/Mara Stone/2/script')).toEqual({ from: M, to: '/c/mesa/Mara Stone' })
    expect(moveBetween('/c/x/script', '/c/x/script')).toBeNull()
  })

  it("names a folder's conversations the way Claude Code does", () => {
    expect(claudeProjectDir('/Users/me/Client work/mesa/Shaun Sidey/1 - Get Toned/script')).toBe('-Users-me-Client-work-mesa-Shaun-Sidey-1---Get-Toned-script')
  })

  it('moves each conversation to its folder now, holds back a running one, and never mixes in an older one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-moves-'))
    const at = (cwd: string) => join(dir, claudeProjectDir(cwd))
    const line = (cwd: string, id: string, h: number) => JSON.stringify({ type: 'user', cwd, sessionId: id, message: { content: 'hi' }, timestamp: new Date(T(h)).toISOString() }) + '\n'
    // The old video 3 conversation (0:00) and a new one in the new "video 3" (4:00) share a folder.
    await mkdir(join(at(`${M}/video 3/script`), 'old0000'), { recursive: true })
    await writeFile(join(at(`${M}/video 3/script`), 'old0000.jsonl'), line(`${M}/video 3/script`, 'old0000', 0))
    await writeFile(join(at(`${M}/video 3/script`), 'new4444.jsonl'), line(`${M}/video 3/script`, 'new4444', 4))
    await mkdir(join(at(`${M}/step count/script`), 'memory'), { recursive: true })
    await writeFile(join(at(`${M}/step count/script`), 'step2222.jsonl'), line(`${M}/step count/script`, 'step2222', 2))
    await writeFile(join(at(`${M}/step count/script`), 'memory', 'MEMORY.md'), 'notes')

    // step2222 is still running: it and the memory beside it wait.
    expect(await moveConversations(dir, moves, new Set(['step2222']))).toEqual({ moved: 1, waiting: 1 })
    expect((await readdir(at(`${M}/rough cut/script`))).sort()).toEqual(['old0000', 'old0000.jsonl'])
    expect(await readdir(at(`${M}/video 3/script`))).toEqual(['new4444.jsonl'])
    // It ended: it joins the new video 3, with its memory; the old folder goes.
    expect(await moveConversations(dir, moves)).toEqual({ moved: 1, waiting: 0 })
    expect((await readdir(at(`${M}/video 3/script`))).sort()).toEqual(['memory', 'new4444.jsonl', 'step2222.jsonl'])
    expect(existsSync(at(`${M}/step count/script`))).toBe(false)
    expect(await readFile(join(at(`${M}/rough cut/script`), 'old0000.jsonl'), 'utf8')).toBe(line(`${M}/video 3/script`, 'old0000', 0))
    // Settled: nothing moves again.
    expect(await moveConversations(dir, moves)).toEqual({ moved: 0, waiting: 0 })

    // Never overwrites: a copy already at the new place stays as it is.
    await mkdir(at(`${M}/video 3/script`), { recursive: true })
    await writeFile(join(at(`${M}/video 3/script`), 'old0000.jsonl'), line(`${M}/video 3/script`, 'old0000', 0) + 'more\n')
    await moveConversations(dir, moves)
    expect(await readFile(join(at(`${M}/rough cut/script`), 'old0000.jsonl'), 'utf8')).toBe(line(`${M}/video 3/script`, 'old0000', 0))
  })

  it('moves a conversation whose folder was renamed away and back to its first name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-moves-'))
    const at = (cwd: string) => join(dir, claudeProjectDir(cwd))
    // Started in video 3; its folder became "rough cut", then "video 2", then "video 3" again
    // (after the old video 3 became video 4): its transcript sits under "rough cut".
    const trip = [
      { from: `${M}/video 3`, to: `${M}/rough cut`, at: T(1) },
      { from: `${M}/rough cut`, to: `${M}/video 2`, at: T(5) },
      { from: `${M}/video 3`, to: `${M}/video 4`, at: T(6) },
      { from: `${M}/video 2`, to: `${M}/video 3`, at: T(7) }
    ]
    await mkdir(at(`${M}/rough cut/script`), { recursive: true })
    await writeFile(join(at(`${M}/rough cut/script`), 'old0000.jsonl'), JSON.stringify({ type: 'user', cwd: `${M}/video 3/script`, message: { content: 'hi' }, timestamp: new Date(T(0)).toISOString() }) + '\n')
    // Resumed in another folder, never renamed: Claude keeps it under that folder, and so do we.
    await mkdir(at('/c/elsewhere/script'), { recursive: true })
    await writeFile(join(at('/c/elsewhere/script'), 'away1111.jsonl'), JSON.stringify({ type: 'user', cwd: '/c/first/script', message: { content: 'hi' }, timestamp: new Date(T(0)).toISOString() }) + '\n')
    expect(applyMoves(`${M}/video 3/script`, trip, T(0))).toBe(`${M}/video 3/script`)
    expect(await moveConversations(dir, trip)).toEqual({ moved: 1, waiting: 0 })
    expect(await readdir(at(`${M}/video 3/script`))).toEqual(['old0000.jsonl'])
    expect(await readdir(at('/c/elsewhere/script'))).toEqual(['away1111.jsonl'])
  })

  it('keeps renames in folders.json and moves hidden folders with them', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cs-moves-store-'))
    const store = new Store(home)
    await store.load()
    await store.setHidden(`${M}/video 3`, true)
    await store.addMove({ from: M, to: '/c/mesa/Mara Stone', at: T(1) })
    await store.setKnown({ '1:2': '/c/mesa/Mara Stone' })
    const again = new Store(home)
    await again.load()
    expect(again.getMoves()).toEqual([{ from: M, to: '/c/mesa/Mara Stone', at: T(1) }])
    expect(again.getHidden()).toEqual(['/c/mesa/Mara Stone/video 3'])
    expect(again.getKnown()).toEqual({ '1:2': '/c/mesa/Mara Stone' })
  })
})
