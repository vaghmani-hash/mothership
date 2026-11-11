// The main-process parts against real files and processes: the hook bridge, History, the folder
// browser, the name store, and sessions running a stand-in for claude in a real terminal.

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hostBinary } from '../src/main/host-client'
import { createClient, createVideo } from '../src/main/create'
import { findProjects } from '../src/main/projects'
import { EventInbox, writeHookFiles } from '../src/main/hooks'
import type { HookEvent } from '../src/main/hooks'
import { Sessions } from '../src/main/sessions'
import { Store } from '../src/main/store'
import { conversationFiles, History, isSessionId } from '../src/main/transcripts'
import type { LiveSession } from '../src/shared/types'

const temp = (): Promise<string> => mkdtemp(join(tmpdir(), 'cs-test-'))
const waitFor = async (check: () => boolean, what: string | (() => string) = 'condition', ms = 5000): Promise<void> => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${typeof what === 'function' ? what() : what}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('hook bridge', () => {
  it('the hook script drops one event file for an app session, which the inbox reads and removes', async () => {
    const home = await temp()
    const files = await writeHookFiles(home)
    const settings = JSON.parse(await readFile(files.settings, 'utf8')) as { hooks: Record<string, unknown> }
    expect(Object.keys(settings.hooks).sort()).toEqual(['Notification', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit'])
    const got: HookEvent[] = []
    const inbox = new EventInbox(files.events, (e) => got.push(e))
    await inbox.start()
    const input = JSON.stringify({ hook_event_name: 'Stop', session_id: 'abc', message: 'quote " and $(x)' })
    execFileSync('/bin/sh', [join(home, 'hook.sh')], { input, env: { ...process.env, CLIENT_SESSIONS_TAB: 't-1', CLIENT_SESSIONS_EVENTS: files.events } })
    await inbox.drain()
    inbox.stop()
    expect(got).toEqual([{ tab: 't-1', input: JSON.parse(input) }])
    expect(await readdir(files.events)).toEqual([])
  })

  it('hands events over in the order they were written, whatever their random names', async () => {
    const home = await temp()
    const files = await writeHookFiles(home)
    const env = { ...process.env, CLIENT_SESSIONS_TAB: 't-3', CLIENT_SESSIONS_EVENTS: files.events }
    const order = ['SessionStart', 'UserPromptSubmit', 'Stop', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']
    for (const hook_event_name of order) execFileSync('/bin/sh', [join(home, 'hook.sh')], { input: JSON.stringify({ hook_event_name }), env })
    const got: string[] = []
    const inbox = new EventInbox(files.events, (e) => got.push(e.input.hook_event_name ?? ''))
    await inbox.drain()
    expect(got).toEqual(order)
  })

  it('does nothing in a session the app did not start', async () => {
    const home = await temp()
    const files = await writeHookFiles(home)
    execFileSync('/bin/sh', [join(home, 'hook.sh')], { input: '{"hook_event_name":"Stop"}', env: { PATH: process.env['PATH'] ?? '' } })
    expect(await readdir(files.events)).toEqual([])
  })

  it('quotes a home folder with spaces and quotes in the hook command', async () => {
    const home = join(await temp(), "Client Sessions it's")
    const files = await writeHookFiles(home)
    const settings = JSON.parse(await readFile(files.settings, 'utf8')) as { hooks: { Stop: { hooks: { command: string }[] }[] } }
    const command = settings.hooks.Stop[0]?.hooks[0]?.command ?? ''
    // The command runs as written by Claude Code's shell: it must find the script.
    execFileSync('/bin/sh', ['-c', command], { input: '{}', env: { ...process.env, CLIENT_SESSIONS_TAB: 't-2', CLIENT_SESSIONS_EVENTS: files.events } })
    expect((await readdir(files.events)).length).toBe(1)
  })
})

describe('History', () => {
  const j = (o: unknown): string => JSON.stringify(o)
  it('lists conversations newest first from head and tail, also across big files, without print-mode runs', async () => {
    const dir = await temp()
    const folder = join(dir, '-w-mesa-Wren-2')
    await mkdir(folder)
    const prompt = (text: string, extra = {}) => j({ type: 'user', cwd: '/w/mesa/Wren/2', message: { content: text }, timestamp: '2026-11-07T10:00:00.000Z', ...extra })
    const blob = j({ type: 'api-request-blob', message: 'x'.repeat(300_000) })
    const big = [prompt('Place the slots'), ...Array.from({ length: 12 }, () => blob), j({ type: 'ai-title', aiTitle: 'Slot placement' }), j({ type: 'assistant', timestamp: '2026-11-07T12:00:00.000Z' })]
    await writeFile(join(folder, '11111111-1111-4111-8111-111111111111.jsonl'), big.join('\n') + '\n')
    await writeFile(join(folder, '22222222-2222-4222-8222-222222222222.jsonl'), [prompt('Old one'), j({ type: 'assistant', timestamp: '2026-11-01T09:00:00.000Z' })].join('\n') + '\n')
    await writeFile(join(folder, '33333333-3333-4333-8333-333333333333.jsonl'), prompt('scripted', { entrypoint: 'sdk-cli' }) + '\n')
    const history = new History(dir)
    const list = await history.list()
    expect(list.map((e) => [e.claudeId.slice(0, 1), e.title, e.firstPrompt])).toEqual([
      ['1', 'Slot placement', 'Place the slots'],
      ['2', null, 'Old one']
    ])
    expect(list[0]?.lastAt).toBe(Date.parse('2026-11-07T12:00:00.000Z'))
    expect((await history.list()).length).toBe(2)
  })

  it("finds a conversation's files to delete, and forgets a deleted one", async () => {
    const dir = await temp()
    const id = '44444444-4444-4444-8444-444444444444'
    const folder = join(dir, '-w-mesa-Wren-2')
    await mkdir(join(folder, id, 'subagents'), { recursive: true })
    await writeFile(join(folder, `${id}.jsonl`), JSON.stringify({ type: 'user', cwd: '/w/mesa/Wren/2', message: { content: 'Cut it' }, timestamp: '2026-11-07T10:00:00.000Z' }) + '\n')
    await writeFile(join(folder, '55555555-5555-4555-8555-555555555555.jsonl'), '')
    expect((await conversationFiles(dir, id)).map((p) => p.slice(folder.length + 1)).sort()).toEqual([id, `${id}.jsonl`])
    // Only an id, never a path: nothing outside the transcripts can be named.
    expect(isSessionId('../../etc')).toBe(false)
    expect(await conversationFiles(dir, '../-w-mesa-Wren-2')).toEqual([])
    const history = new History(dir)
    expect((await history.list()).map((e) => e.claudeId)).toEqual([id])
    await rm(join(folder, `${id}.jsonl`))
    expect(await history.list()).toEqual([])
  })
})

describe('folders and names', () => {
  it('finds every client and every folder in it, however the client lays them out', async () => {
    const root = await temp()
    const dirs = [
      // An agency: its clients have a Base folder. Every folder in it is a client, Base or not.
      'Coda/Jonah/Base', 'Coda/Jonah/Video 3/script', 'Coda/Jonah/Video 10', 'Coda/Jonah/Production-System',
      'Coda/Jonah/.board', 'Coda/Jonah/_old', 'Coda/Jonah/node_modules/x', 'Coda/Jonah/Adobe Premiere Pro Auto-Save',
      'Coda/RIO/Rio Video 3', 'Coda/RIO/Rio video 4 ',
      'Coda/Mateo/PJ',
      // A client whose own name reads like a video doesn't stop its agency being one.
      'Coda/Abel video 4/PJ',
      'Coda/New Guy',
      // Names with a space at the end, as they are on the drive.
      'Kite Media /Paperdesk /Base', 'Kite Media /Paperdesk /41', 'Kite Media /Paperdesk /Video 38',
      // A client straight in the watched folder.
      'Solo/base', 'Solo/Video 1',
      // No Base anywhere: videos inside make it a client; clients with videos inside make it an agency.
      'Jules/2/script',
      'mesa/Wren/2', 'mesa/Wren/10', 'mesa/cora/1',
      'FINANCE/TAXES',
      '.hidden/x/Base', '_Archive/y/Base'
    ]
    for (const d of dirs) await mkdir(join(root, d), { recursive: true })
    await writeFile(join(root, 'Coda/Jonah/AGENTS.md'), 'a file is not a folder')
    const projects = await findProjects([root])
    const seen = projects.map((p) => `${p.agency ?? '-'} | ${p.client} | ${p.name} | ${p.kind}`).sort()
    expect(seen).toEqual([
      '- | FINANCE | TAXES | folder',
      '- | Jules | 2 | video',
      '- | Solo | Video 1 | video',
      '- | Solo | base | folder',
      'Coda | Abel video 4 | PJ | folder',
      'Coda | Jonah | Base | folder',
      'Coda | Jonah | Production-System | folder',
      'Coda | Jonah | Video 10 | video',
      'Coda | Jonah | Video 3 | video',
      'Coda | Mateo | PJ | folder',
      'Coda | New Guy | New Guy | folder',
      'Coda | RIO | Rio Video 3 | video',
      'Coda | RIO | Rio video 4 | video',
      'Kite Media | Paperdesk | 41 | video',
      'Kite Media | Paperdesk | Base | folder',
      'Kite Media | Paperdesk | Video 38 | video',
      'mesa | Wren | 10 | video',
      'mesa | Wren | 2 | video',
      'mesa | cora | 1 | video'
    ])
    // Paths are the folders as they are on disk; sessions run in the folder itself.
    const v38 = projects.find((p) => p.client === 'Paperdesk' && p.name === 'Video 38')
    expect(v38?.path).toBe(join(root, 'Kite Media /Paperdesk /Video 38'))
    expect(v38?.clientPath).toBe(join(root, 'Kite Media /Paperdesk '))
    const empty = projects.find((p) => p.client === 'New Guy')
    expect(empty?.path).toBe(join(root, 'Coda/New Guy'))
    // A new folder shows up on the next look, and a missing watched folder finds nothing.
    await mkdir(join(root, 'Coda/New Guy/Video 1'))
    expect((await findProjects([root])).filter((p) => p.client === 'New Guy').map((p) => p.name)).toEqual(['Video 1'])
    expect(await findProjects([join(root, 'not there')])).toEqual([])
  })

  it('makes a new client and a new video as plain folders, inside the agency folder as it is on disk', async () => {
    const root = await temp()
    await mkdir(join(root, 'Kite Media ', 'JAY', 'Base'), { recursive: true })
    const video = await createClient([root], { root, agency: 'Kite Media', client: 'Nova', video: 'Video 1' })
    expect(video).toBe(join(root, 'Kite Media ', 'Nova', 'Video 1'))
    expect((await readdir(root)).sort()).toEqual(['Kite Media '])
    expect(await readdir(video)).toEqual([])
    await expect(createClient([root], { root, agency: 'Kite Media', client: 'Nova', video: '1' })).rejects.toThrow(/already/)
    expect(await createClient([root], { root, agency: 'Fresh', client: 'Ada', video: '1' })).toBe(join(root, 'Fresh', 'Ada', '1'))
    expect(await createClient([root], { root, agency: null, client: 'Solo', video: '1' })).toBe(join(root, 'Solo', '1'))
    const next = await createVideo(join(root, 'Kite Media ', 'Nova'), 'Video 2')
    expect(next).toBe(join(root, 'Kite Media ', 'Nova', 'Video 2'))
    await expect(createVideo(join(root, 'Kite Media ', 'Nova'), 'Video 2')).rejects.toThrow(/already/)
    // A folder that reads the same but ends in a space on disk is the same client or video: no twin beside it.
    await mkdir(join(root, 'Kite Media ', 'Paperdesk ', 'Video 3 '), { recursive: true })
    await expect(createClient([root], { root, agency: 'Kite Media', client: 'Paperdesk', video: '1' })).rejects.toThrow(/already/)
    await expect(createVideo(join(root, 'Kite Media ', 'Paperdesk '), 'Video 3')).rejects.toThrow(/already/)
    expect((await readdir(join(root, 'Kite Media '))).sort()).toEqual(['JAY', 'Nova', 'Paperdesk '])
    expect(await readdir(join(root, 'Kite Media ', 'Paperdesk '))).toEqual(['Video 3 '])
  })

  it('keeps names across launches, and empty goes back to automatic', async () => {
    const home = await temp()
    const store = new Store(home)
    await store.load()
    await store.setName('id-1', 'Intro animations')
    const again = new Store(home)
    await again.load()
    expect(again.nameOf('id-1')).toBe('Intro animations')
    await again.setName('id-1', null)
    expect(again.nameOf('id-1')).toBeNull()
  })
})

describe('sessions in a real terminal', () => {
  let sessions: Sessions | null = null
  afterEach(() => sessions?.stopAll())

  it('starts claude in its folder with its own id and name, follows the hook events, and resumes', async () => {
    const home = await temp()
    const folder = await temp()
    const files = await writeHookFiles(home)
    const store = new Store(home)
    await store.load()
    process.env['CLIENT_SESSIONS_CLAUDE'] = join(import.meta.dirname, 'stub-claude.sh')
    process.env['CLIENT_SESSIONS_SHELL'] = '/bin/sh'
    sessions = new Sessions(files, store)
    const live = sessions
    const inbox = new EventInbox(files.events, (e) => live.hook(e.tab, e.input))
    await inbox.start()
    const alerts: LiveSession[] = []
    live.on('needsYou', (s) => alerts.push(s))
    let output = ''
    live.on('data', (_id, data) => (output += data))

    const first = await live.start({ cwd: folder, name: 'Intro animations' })
    expect(first).toMatchObject({ seq: 1, name: 'Intro animations', state: 'starting' })
    await waitFor(() => output.includes(`session ${first.claudeId} named Intro animations`), 'the stub banner')
    expect(output).toContain(`stub claude in ${folder}`)
    await waitFor(() => live.list()[0]?.state === 'ready', 'ready')

    live.input(first.id, 'hello\r')
    await waitFor(() => live.list()[0]?.state === 'needs-you', () => `needs-you (state ${live.list()[0]?.state}, output ${JSON.stringify(output.slice(-300))})`)
    expect(live.list()[0]).toMatchObject({ firstPrompt: 'hello', reason: 'Finished its turn', wait: 'turn' })
    expect(alerts).toHaveLength(1)

    const second = await live.start({ cwd: folder })
    expect(second.seq).toBe(2)
    expect(second.name).toBeNull()

    live.input(first.id, 'ask to run\r')
    await waitFor(() => live.list()[0]?.wait === 'ask', () => `the permission question (state ${live.list()[0]?.state}, output ${JSON.stringify(output.slice(-300))})`)
    live.input(first.id, '1')
    expect(live.list()[0]?.state).toBe('working')

    live.input(first.id, '\rexit\r')
    await waitFor(() => live.list()[0]?.state === 'ended', 'ended')
    // Resume on the ended session: the new one takes its place and keeps #1.
    const resumed = await live.start({ cwd: folder, resume: first.claudeId, replaces: first.id })
    await waitFor(() => output.includes(`session ${first.claudeId} (resumed)`), 'the resumed banner')
    expect(resumed).toMatchObject({ name: 'Intro animations', seq: 1 })
    expect(live.list().map((s) => s.seq).sort()).toEqual([1, 2])
    expect(live.list().some((s) => s.id === first.id)).toBe(false)
    // Asking for a conversation already open hands back that session.
    expect((await live.start({ cwd: folder, resume: first.claudeId })).id).toBe(resumed.id)
    inbox.stop()
  }, 20_000)

  it('refuses a folder that is not there and an id that is not one', async () => {
    const home = await temp()
    const store = new Store(home)
    await store.load()
    sessions = new Sessions(await writeHookFiles(home), store)
    await expect(sessions.start({ cwd: join(home, 'missing') })).rejects.toThrow(/isn't a folder/)
    await expect(sessions.start({ cwd: home, resume: '$(rm -rf ~)' })).rejects.toThrow(/not valid/)
  })
})

describe('host binary', () => {
  it.runIf(process.platform === 'darwin')("runs the host on the app's Helper, not on the app itself", async () => {
    const app = join(await temp(), 'Mothership.app', 'Contents')
    const exe = join(app, 'MacOS', 'Mothership')
    const helper = join(app, 'Frameworks', 'Mothership Helper.app', 'Contents', 'MacOS', 'Mothership Helper')
    await mkdir(join(app, 'MacOS'), { recursive: true })
    await writeFile(exe, '')
    expect(hostBinary(exe)).toBe(exe)
    await mkdir(join(helper, '..'), { recursive: true })
    await writeFile(helper, '')
    expect(hostBinary(exe)).toBe(helper)
  })
})
