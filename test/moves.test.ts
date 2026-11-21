// Renamed folders: paths read through the renames, the renamed folder found from a session's
// before and after, and its conversations moved to where Claude Code looks for them.

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyMoves, claudeProjectDir, moveBetween, moveConversations } from '../src/main/moves'
import { Store } from '../src/main/store'

const gone = (): boolean => false

describe('renamed folders', () => {
  it('reads a path through the renames, in order, and leaves a path that exists alone', () => {
    const moves = [
      { from: '/c/mesa/Mara/video 3', to: '/c/mesa/Mara/rough cut' },
      { from: '/c/mesa/Mara', to: '/c/mesa/Mara Stone' }
    ]
    expect(applyMoves('/c/mesa/Mara/video 3/script', moves, gone)).toBe('/c/mesa/Mara Stone/rough cut/script')
    expect(applyMoves('/c/mesa/Mara/video 30/script', moves, gone)).toBe('/c/mesa/Mara Stone/video 30/script')
    expect(applyMoves('/c/mesa/Mara/video 3/script', moves, () => true)).toBe('/c/mesa/Mara/video 3/script')
    // Renamed and renamed back.
    expect(applyMoves('/c/A/script', [{ from: '/c/A', to: '/c/B' }, { from: '/c/B', to: '/c/A' }], gone)).toBe('/c/A/script')
  })

  it("finds the renamed folder from a session's folder before and after", () => {
    expect(moveBetween('/c/mesa/Mara/video 3/script', '/c/mesa/Mara/step count rough/script')).toEqual({ from: '/c/mesa/Mara/video 3', to: '/c/mesa/Mara/step count rough' })
    expect(moveBetween('/c/mesa/Mara/2/script', '/c/mesa/Mara Stone/2/script')).toEqual({ from: '/c/mesa/Mara', to: '/c/mesa/Mara Stone' })
    expect(moveBetween('/c/x/script', '/c/x/script')).toBeNull()
  })

  it("names a folder's conversations the way Claude Code does", () => {
    expect(claudeProjectDir('/Users/me/Client work/mesa/Shaun Sidey/1 - Get Toned/script')).toBe('-Users-me-Client-work-mesa-Shaun-Sidey-1---Get-Toned-script')
  })

  it('moves the conversations of a renamed folder, holds back a running one, and overwrites nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-moves-'))
    const before = '/c/mesa/Mara/video 3/script'
    const after = '/c/mesa/Mara/rough cut/script'
    const source = join(dir, claudeProjectDir(before))
    const line = (id: string) => JSON.stringify({ type: 'user', cwd: before, sessionId: id, message: { content: 'hi' }, timestamp: '2026-11-20T10:00:00.000Z' }) + '\n'
    await mkdir(join(source, 'aaaa1111', 'subagents'), { recursive: true })
    await mkdir(join(source, 'memory'))
    await writeFile(join(source, 'aaaa1111.jsonl'), line('aaaa1111'))
    await writeFile(join(source, 'bbbb2222.jsonl'), line('bbbb2222'))
    await writeFile(join(source, 'memory', 'MEMORY.md'), 'notes')
    // Elsewhere, untouched.
    await mkdir(join(dir, claudeProjectDir('/c/mesa/Mara/video 30/script')))
    await writeFile(join(dir, claudeProjectDir('/c/mesa/Mara/video 30/script'), 'cccc3333.jsonl'), line('cccc3333').replace(before, '/c/mesa/Mara/video 30/script'))
    const move = { from: '/c/mesa/Mara/video 3', to: '/c/mesa/Mara/rough cut' }
    const target = join(dir, claudeProjectDir(after))

    // bbbb2222 is still running: it and the memory beside it wait.
    expect(await moveConversations(dir, move, new Set(['bbbb2222']))).toEqual({ moved: 1, waiting: 1 })
    expect((await readdir(target)).sort()).toEqual(['aaaa1111', 'aaaa1111.jsonl'])
    expect((await readdir(source)).sort()).toEqual(['bbbb2222.jsonl', 'memory'])
    // It ended: the rest follows and the old folder goes.
    expect(await moveConversations(dir, move)).toEqual({ moved: 1, waiting: 0 })
    expect((await readdir(target)).sort()).toEqual(['aaaa1111', 'aaaa1111.jsonl', 'bbbb2222.jsonl', 'memory'])
    expect(existsSync(source)).toBe(false)
    expect(await readFile(join(target, 'aaaa1111.jsonl'), 'utf8')).toBe(line('aaaa1111'))
    expect(await readdir(join(dir, claudeProjectDir('/c/mesa/Mara/video 30/script')))).toEqual(['cccc3333.jsonl'])

    // Never overwrites: a conversation already at the new place stays as it is.
    await mkdir(source)
    await writeFile(join(source, 'aaaa1111.jsonl'), line('aaaa1111') + line('aaaa1111'))
    await moveConversations(dir, move)
    expect(await readFile(join(target, 'aaaa1111.jsonl'), 'utf8')).toBe(line('aaaa1111'))
    expect(existsSync(join(source, 'aaaa1111.jsonl'))).toBe(true)
  })

  it('keeps renames in folders.json and moves hidden folders with them', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cs-moves-store-'))
    const store = new Store(home)
    await store.load()
    await store.setHidden('/c/mesa/Mara/video 3', true)
    await store.addMove({ from: '/c/mesa/Mara', to: '/c/mesa/Mara Stone' })
    await store.setKnown({ '1:2': '/c/mesa/Mara Stone' })
    const again = new Store(home)
    await again.load()
    expect(again.getMoves()).toEqual([{ from: '/c/mesa/Mara', to: '/c/mesa/Mara Stone' }])
    expect(again.getHidden()).toEqual(['/c/mesa/Mara Stone/video 3'])
    expect(again.getKnown()).toEqual({ '1:2': '/c/mesa/Mara Stone' })
  })
})
