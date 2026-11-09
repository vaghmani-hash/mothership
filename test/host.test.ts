// The background host: sessions keep running while no app is connected, and a new app connection
// finds them with their output, can type into them, and is told about changes.

import { mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startHost } from '../src/host/server'
import type { RunningHost } from '../src/host/server'
import { HostClient } from '../src/main/host-client'
import type { LiveSession } from '../src/shared/types'

const waitFor = async (check: () => boolean | Promise<boolean>, what: string, ms = 8000): Promise<void> => {
  const until = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('background host', () => {
  let host: RunningHost | null = null
  afterEach(async () => {
    await host?.stop()
    host = null
  })

  it('keeps a session running after the app disconnects, and hands it to the next app', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cs-host-'))
    const folder = await mkdtemp(join(tmpdir(), 'cs-host-work-'))
    process.env['CLIENT_SESSIONS_CLAUDE'] = join(import.meta.dirname, 'stub-claude.sh')
    process.env['CLIENT_SESSIONS_SHELL'] = '/bin/sh'
    process.env['CLIENT_SESSIONS_CLAUDE_DIR'] = join(home, 'claude')
    host = await startHost(home)

    // The first app starts a session and gets its output and state.
    const first = new HostClient(home, null)
    expect((await first.open()).protocol).toBe(1)
    let seen = ''
    first.on('data', (_id, data) => (seen += data))
    const made = await first.start({ cwd: folder, name: 'Intro animations' })
    await waitFor(() => seen.includes('named Intro animations'), 'the banner')
    await waitFor(async () => (await first.list())[0]?.state === 'ready', 'ready')

    // The app quits: the session goes on.
    first.close()
    await new Promise((r) => setTimeout(r, 300))
    expect(host.sessions.list()[0]?.state).toBe('ready')

    // The next app finds it, with its name and output, and can type into it.
    const second = new HostClient(home, null)
    expect((await second.open()).live).toBe(1)
    const list = await second.list()
    expect(list.map((s) => [s.id, s.name])).toEqual([[made.id, 'Intro animations']])
    expect((await second.snapshot(made.id))?.data).toContain('named Intro animations')
    const changes: LiveSession[][] = []
    second.on('changed', (s) => changes.push(s))
    second.input(made.id, 'hello\r')
    await waitFor(async () => (await second.list())[0]?.state === 'needs-you', 'needs you')
    expect(changes.length).toBeGreaterThan(0)
    await second.rename(made.claudeId, 'Intro v2')
    expect((await second.list())[0]?.name).toBe('Intro v2')
    second.close()
  }, 20_000)

  it('stops on its own once nothing is open and no app is connected', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cs-host-'))
    let exited = false
    host = await startHost(home, { idleMs: 200, onExit: () => (exited = true) })
    expect(existsSync(join(home, 'host.sock'))).toBe(true)
    await waitFor(() => exited, 'the idle exit', 5000)
    expect(existsSync(join(home, 'host.sock'))).toBe(false)
    host = null
  })

  it('stops every session on shutdown (Stop All Sessions and Quit)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cs-host-'))
    const folder = await mkdtemp(join(tmpdir(), 'cs-host-work-'))
    process.env['CLIENT_SESSIONS_CLAUDE'] = join(import.meta.dirname, 'stub-claude.sh')
    process.env['CLIENT_SESSIONS_SHELL'] = '/bin/sh'
    let exited = false
    host = await startHost(home, { onExit: () => (exited = true) })
    const app = new HostClient(home, null)
    await app.open()
    await app.start({ cwd: folder })
    await app.shutdown()
    await waitFor(() => exited, 'the shutdown')
    expect(host.sessions.list()).toEqual([])
    host = null
  })
})
