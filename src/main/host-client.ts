// The app's side of the background host: connects to host.sock, starting the host first when none
// is running (the app's Helper binary run as Node, detached, so it outlives the app), and turns
// calls into requests and the host's messages into events.

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, realpathSync } from 'node:fs'
import { connect } from 'node:net'
import { basename, dirname, join } from 'node:path'
import type { Socket } from 'node:net'
import type { Call, Hello, HostEvent, Reply, StartRequest } from '../host/protocol'
import { lineReader, PROTOCOL, socketPath } from '../host/protocol'
import type { LiveSession, Project } from '../shared/types'

export interface HostEvents {
  changed: [sessions: LiveSession[]]
  data: [id: string, data: string, end: number]
  needsYou: [session: LiveSession]
  /** The connection to the host was lost (it is reconnected on the next call). */
  lost: []
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function dial(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

export class HostClient extends EventEmitter<HostEvents> {
  private socket: Socket | null = null
  private connecting: Promise<Socket> | null = null
  private seq = 0
  /** The host runs on the wrong binary (see hostBinary) but has sessions open: replace it once they end. */
  private retireWhenIdle = false
  private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  /** `hostScript` is the host's entry file; null connects only (tests start the host themselves). */
  constructor(
    private readonly home: string,
    private readonly hostScript: string | null
  ) {
    super()
  }

  /** Connects (starting the host if needed) and checks it speaks the same protocol. */
  async open(): Promise<Hello> {
    await this.ensure()
    let hello = (await this.call({ method: 'hello' })) as Hello
    if (this.outdated(hello) && hello.live === 0) {
      // An older host with nothing open: replace it with this version's.
      await this.call({ method: 'shutdown' }).catch(() => undefined)
      this.drop()
      await sleep(300)
      await this.ensure()
      hello = (await this.call({ method: 'hello' })) as Hello
    }
    // One with sessions open is never stopped: it goes once its last session ends.
    this.retireWhenIdle = this.hostScript !== null && hello.live > 0 && !sameFile(hello.execPath, hostBinary())
    return hello
  }

  /** A host this app should replace: another protocol, or (macOS) not running on the Helper. */
  private outdated(hello: Hello): boolean {
    if (this.hostScript === null) return false
    return hello.protocol !== PROTOCOL || !sameFile(hello.execPath, hostBinary())
  }

  close(): void {
    this.drop()
  }

  list(): Promise<LiveSession[]> {
    return this.call({ method: 'list' }) as Promise<LiveSession[]>
  }
  snapshot(id: string): Promise<{ data: string; end: number } | null> {
    return this.call({ method: 'snapshot', id }) as Promise<{ data: string; end: number } | null>
  }
  start(request: StartRequest): Promise<LiveSession> {
    return this.call({ method: 'start', request }) as Promise<LiveSession>
  }
  input(id: string, data: string): void {
    void this.call({ method: 'input', id, data }).catch(() => undefined)
  }
  resize(id: string, cols: number, rows: number): void {
    void this.call({ method: 'resize', id, cols, rows }).catch(() => undefined)
  }
  async closeSession(id: string): Promise<void> {
    await this.call({ method: 'close', id })
  }
  async rename(claudeId: string, name: string | null): Promise<void> {
    await this.call({ method: 'rename', claudeId, name })
  }
  async setProjects(projects: readonly Project[]): Promise<void> {
    await this.call({ method: 'projects', projects })
  }
  /** Stops every session and the host. */
  async shutdown(): Promise<void> {
    await this.call({ method: 'shutdown' })
  }

  private async call(call: Call): Promise<unknown> {
    const socket = await this.ensure()
    const seq = ++this.seq
    return new Promise((resolve, reject) => {
      this.waiting.set(seq, { resolve, reject })
      socket.write(`${JSON.stringify({ ...call, seq })}\n`)
    })
  }

  private ensure(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket)
    this.connecting ??= this.reach().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async reach(): Promise<Socket> {
    const path = socketPath(this.home)
    let socket = await dial(path).catch(() => null)
    if (!socket && this.hostScript !== null) {
      this.spawnHost()
      for (let i = 0; i < 100 && !socket; i++) {
        await sleep(100)
        socket = await dial(path).catch(() => null)
      }
    }
    if (!socket) throw new Error('The background host could not be reached.')
    this.attach(socket)
    return socket
  }

  private spawnHost(): void {
    if (this.hostScript === null) return
    const child = spawn(hostBinary(), [this.hostScript], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CLIENT_SESSIONS_HOME: this.home }
    })
    child.unref()
  }

  private attach(socket: Socket): void {
    this.socket = socket
    socket.on(
      'data',
      lineReader((value) => {
        const message = value as Partial<Reply> & Partial<HostEvent>
        if (typeof message.seq === 'number') {
          const w = this.waiting.get(message.seq)
          this.waiting.delete(message.seq)
          if (!w) return
          const reply = message as Reply
          if (reply.ok) w.resolve(reply.value)
          else w.reject(new Error(reply.error))
          return
        }
        const event = message as HostEvent
        if (event.event === 'changed') {
          this.emit('changed', [...event.sessions])
          if (this.retireWhenIdle && !event.sessions.some((s) => s.state !== 'ended')) {
            // The last session ended: stop the outdated host. The app reconnects (`lost`) and starts a
            // new one on the right binary.
            this.retireWhenIdle = false
            void this.call({ method: 'shutdown' }).catch(() => undefined)
          }
        }
        if (event.event === 'data') this.emit('data', event.id, event.data, event.end)
        if (event.event === 'needsYou') this.emit('needsYou', event.session)
      })
    )
    const lost = (): void => {
      if (this.socket !== socket) return
      this.drop()
      this.emit('lost')
    }
    socket.on('close', lost)
    socket.on('error', lost)
  }

  private drop(): void {
    const socket = this.socket
    this.socket = null
    socket?.destroy()
    for (const w of this.waiting.values()) w.reject(new Error('The background host went away.'))
    this.waiting.clear()
  }
}

/**
 * The binary the host runs on. On a Mac, the app's Helper (`Mothership Helper.app`): it has its own
 * bundle id and no Dock icon. Run on the app's own binary, the host signs in to macOS as the app, so
 * once the window has quit, opening Mothership only finds the windowless host ("The application
 * Mothership is not open anymore").
 */
export function hostBinary(execPath = process.execPath): string {
  if (process.platform !== 'darwin') return execPath
  const name = `${basename(execPath)} Helper`
  const helper = join(dirname(execPath), '..', 'Frameworks', `${name}.app`, 'Contents', 'MacOS', name)
  return existsSync(helper) ? helper : execPath
}

function sameFile(a: string | undefined, b: string): boolean {
  if (a === undefined) return false
  const real = (p: string): string => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  return real(a) === real(b)
}
