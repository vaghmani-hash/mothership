// The sessions running in the app's terminals: each is your login shell running
// `claude --settings <hooks>` in its folder, with its own conversation id, so the app always knows
// which transcript and which hook events belong to which tab.

import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'
import { afterHook, afterInput } from '../shared/state'
import type { Change } from '../shared/state'
import type { HookInput, LiveSession } from '../shared/types'
import { isFolder } from './folders'
import type { HookFiles } from './hooks'
import type { Store } from './store'
import { headOf, titleOf } from './transcripts'

/** `<projects>/<any folder>/<id>.jsonl`, or null. */
async function findTranscript(projects: string, claudeId: string): Promise<string | null> {
  const folders = await readdir(projects, { withFileTypes: true }).catch(() => [])
  for (const f of folders) {
    if (!f.isDirectory()) continue
    const path = join(projects, f.name, `${claudeId}.jsonl`)
    if (await stat(path).then(() => true, () => false)) return path
  }
  return null
}

/** How much of each terminal's output is kept for showing it again (its last part). */
const KEEP = 2 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Running {
  info: LiveSession
  pty: IPty | null
  output: string
  /** Every character ever written, so the window can tell what it has already shown. */
  end: number
  transcript: string | null
}

export interface SessionEvents {
  changed: []
  data: [id: string, data: string, end: number]
  /** A session just started needing you. */
  needsYou: [session: LiveSession]
}

export interface StartOptions {
  readonly cwd: string
  readonly resume?: string
  readonly name?: string | null
  /** An ended session this one takes the place of (a Resume): it keeps that session's #n. */
  readonly replaces?: string
}

/** Your login shell's -l -i loads the same PATH (and claude) as your own terminal. */
function shellCommand(resume: boolean, named: boolean): string {
  const id = resume ? '--resume "$CLIENT_SESSIONS_CLAUDE_ID"' : '--session-id "$CLIENT_SESSIONS_CLAUDE_ID"'
  return `exec "$CLIENT_SESSIONS_CLAUDE" --settings "$CLIENT_SESSIONS_SETTINGS" ${id}${named ? ' --name "$CLIENT_SESSIONS_NAME"' : ''}`
}

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('ELECTRON_') && !k.startsWith('CLIENT_SESSIONS_')) env[k] = v
  return env
}

export class Sessions extends EventEmitter<SessionEvents> {
  private readonly running = new Map<string, Running>()

  constructor(
    private readonly hooks: HookFiles,
    private readonly store: Store,
    /** Claude Code's transcripts folder, for a resumed conversation's title and first prompt. */
    private readonly transcripts: string | null = null,
    /** What sessions are numbered by (#1, #2…): their project, else their folder. */
    private readonly seqKey: (folder: string) => string = (folder) => folder,
    private readonly now: () => number = Date.now
  ) {
    super()
  }

  list(): LiveSession[] {
    return [...this.running.values()].map((r) => r.info).sort((a, b) => a.startedAt - b.startedAt)
  }

  snapshot(id: string): { data: string; end: number } | null {
    const r = this.running.get(id)
    return r ? { data: r.output, end: r.end } : null
  }

  /** Starts Claude in `cwd`, a new conversation or `resume`d one. */
  async start({ cwd, resume, name, replaces }: StartOptions): Promise<LiveSession> {
    if (!(await isFolder(cwd))) throw new Error(`"${cwd}" isn't a folder (is its drive connected?).`)
    if (resume !== undefined && !UUID.test(resume)) throw new Error('That conversation id is not valid.')
    const open = this.list().find((s) => resume !== undefined && s.claudeId === resume && s.state !== 'ended')
    if (open) return open
    const old = replaces === undefined ? undefined : this.running.get(replaces)
    const takeOver = old !== undefined && old.info.state === 'ended' ? old : undefined
    const id = `t-${randomBytes(5).toString('hex')}`
    const claudeId = resume ?? randomUUID()
    if (name) await this.store.setName(claudeId, name)
    const at = this.now()
    const info: LiveSession = {
      id,
      cwd,
      claudeId,
      seq: takeOver?.info.seq ?? Math.max(0, ...this.list().filter((s) => this.seqKey(s.cwd) === this.seqKey(cwd)).map((s) => s.seq)) + 1,
      name: this.store.nameOf(claudeId),
      title: null,
      firstPrompt: null,
      state: 'starting',
      wait: null,
      reason: null,
      startedAt: at,
      changedAt: at,
      exitCode: null
    }
    const r: Running = { info, pty: null, output: '', end: 0, transcript: null }
    if (takeOver) this.running.delete(takeOver.info.id)
    this.running.set(id, r)
    const shell = process.env['CLIENT_SESSIONS_SHELL'] ?? process.env['SHELL'] ?? '/bin/zsh'
    const named = Boolean(name)
    const pty = spawn(shell, ['-l', '-i', '-c', shellCommand(resume !== undefined, named)], {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd,
      env: {
        ...cleanEnv(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CLIENT_SESSIONS_TAB: id,
        CLIENT_SESSIONS_EVENTS: this.hooks.events,
        CLIENT_SESSIONS_SETTINGS: this.hooks.settings,
        CLIENT_SESSIONS_CLAUDE: process.env['CLIENT_SESSIONS_CLAUDE'] ?? 'claude',
        CLIENT_SESSIONS_CLAUDE_ID: claudeId,
        ...(named && name ? { CLIENT_SESSIONS_NAME: name } : {})
      }
    })
    r.pty = pty
    pty.onData((data) => {
      r.end += data.length
      r.output = (r.output + data).slice(-KEEP)
      this.emit('data', id, data, r.end)
    })
    pty.onExit(({ exitCode }) => {
      r.pty = null
      this.update(r, { state: 'ended', wait: null, reason: null, exitCode })
    })
    this.emit('changed')
    if (resume !== undefined) void this.loadPast(r, resume)
    return info
  }

  /** A resumed conversation shows its title and first prompt at once, from its transcript. */
  private async loadPast(r: Running, claudeId: string): Promise<void> {
    if (this.transcripts === null) return
    const path = await findTranscript(this.transcripts, claudeId)
    if (!path || this.running.get(r.info.id) !== r) return
    r.transcript ??= path
    const head = await headOf(path, (await stat(path)).size).catch(() => null)
    if (head?.firstPrompt && r.info.firstPrompt === null) this.update(r, { firstPrompt: head.firstPrompt })
    await this.refreshTitle(r)
  }

  input(id: string, data: string): void {
    const r = this.running.get(id)
    if (!r?.pty) return
    r.pty.write(data)
    this.apply(r, afterInput(r.info, data))
  }

  resize(id: string, cols: number, rows: number): void {
    const r = this.running.get(id)
    if (r?.pty && cols > 0 && rows > 0) r.pty.resize(Math.floor(cols), Math.floor(rows))
  }

  /** Stops Claude if it still runs, and forgets the session. */
  close(id: string): void {
    const r = this.running.get(id)
    if (!r) return
    this.running.delete(id)
    r.pty?.kill()
    this.emit('changed')
  }

  stopAll(): void {
    for (const id of [...this.running.keys()]) this.close(id)
  }

  /** Sessions Claude is working in (a quit would interrupt them). */
  workingCount(): number {
    return this.list().filter((s) => s.state === 'working').length
  }

  /** A name changed in the store: show it on the live sessions of that conversation. */
  renamed(claudeId: string): void {
    for (const r of this.running.values()) if (r.info.claudeId === claudeId) this.update(r, { name: this.store.nameOf(claudeId) })
  }

  /** One hook event from the events folder. */
  hook(tab: string, input: HookInput): void {
    const r = this.running.get(tab)
    if (!r) return
    // A /clear starts another conversation in the same tab: follow its id and name.
    if (input.session_id && UUID.test(input.session_id) && input.session_id !== r.info.claudeId) {
      this.update(r, { claudeId: input.session_id, name: this.store.nameOf(input.session_id), title: null, firstPrompt: null })
    }
    if (input.transcript_path) r.transcript = input.transcript_path
    this.apply(r, afterHook(r.info, input))
    if (r.transcript) void this.refreshTitle(r)
  }

  private async refreshTitle(r: Running): Promise<void> {
    if (!r.transcript) return
    const title = await titleOf(r.transcript)
    if (title !== null && title !== r.info.title && this.running.get(r.info.id) === r) this.update(r, { title })
  }

  private apply(r: Running, change: Change): void {
    const { notify, ...fields } = change
    const moved = fields.state !== r.info.state || fields.reason !== r.info.reason || fields.wait !== r.info.wait || fields.firstPrompt !== r.info.firstPrompt
    if (moved) this.update(r, fields)
    if (notify) this.emit('needsYou', r.info)
  }

  private update(r: Running, fields: Partial<LiveSession>): void {
    const stateMoved = fields.state !== undefined && fields.state !== r.info.state
    r.info = { ...r.info, ...fields, changedAt: stateMoved ? this.now() : r.info.changedAt }
    this.emit('changed')
  }
}
