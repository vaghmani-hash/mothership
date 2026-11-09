// The background host: owns every session's terminal, so sessions keep running when the app quits.
// The app connects over host.sock; while no app is connected, "needs you" alerts go through
// macOS's own notifications (osascript). It exits on its own once no session is open and no app
// has been connected for a while.

import { execFile } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { join } from 'node:path'
import { projectLabel, seqKey } from '../shared/projects'
import { sessionName } from '../shared/names'
import type { LiveSession, Project } from '../shared/types'
import { EventInbox, writeHookFiles } from '../main/hooks'
import { transcriptsDir } from '../main/paths'
import { Sessions } from '../main/sessions'
import { Store } from '../main/store'
import type { HostEvent, Reply, Request } from './protocol'
import { lineReader, PROTOCOL, socketPath } from './protocol'

export interface HostOptions {
  /** How long to stay up with no session open and no app connected. */
  readonly idleMs?: number
  /** Called when the host stops (after a shutdown or when idle). */
  readonly onExit?: () => void
}

export interface RunningHost {
  readonly server: Server
  readonly sessions: Sessions
  stop(): Promise<void>
}

/** macOS's own notification, for when the app is closed. Words go in as arguments, never as script. */
function systemNotify(title: string, subtitle: string, body: string): void {
  execFile('osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)', '-e', 'end run', body, title, subtitle], () => undefined)
}

export async function startHost(home: string, options: HostOptions = {}): Promise<RunningHost> {
  const store = new Store(home)
  await store.load()
  const hookFiles = await writeHookFiles(home)
  let projects: Project[] = []
  const sessions = new Sessions(hookFiles, store, transcriptsDir(), (folder) => seqKey(folder, projects))
  const inbox = new EventInbox(hookFiles.events, (e) => sessions.hook(e.tab, e.input))
  await inbox.start()

  const clients = new Set<Socket>()
  const broadcast = (event: HostEvent): void => {
    const line = `${JSON.stringify(event)}\n`
    for (const c of clients) c.write(line)
  }
  sessions.on('changed', () => broadcast({ event: 'changed', sessions: sessions.list() }))
  sessions.on('data', (id, data, end) => broadcast({ event: 'data', id, data, end }))
  sessions.on('needsYou', (session: LiveSession) => {
    if (clients.size > 0) broadcast({ event: 'needsYou', session })
    else systemNotify(projectLabel(session.cwd, projects, store.getRoots()), sessionName(session), session.reason ?? 'Needs you')
  })

  const answer = async (request: Request): Promise<unknown> => {
    switch (request.method) {
      case 'hello':
        return { protocol: PROTOCOL, pid: process.pid, live: sessions.list().filter((s) => s.state !== 'ended').length, execPath: process.execPath }
      case 'list':
        return sessions.list()
      case 'snapshot':
        return sessions.snapshot(request.id)
      case 'start':
        return sessions.start(request.request)
      case 'input':
        sessions.input(request.id, request.data)
        return null
      case 'resize':
        sessions.resize(request.id, request.cols, request.rows)
        return null
      case 'close':
        sessions.close(request.id)
        return null
      case 'rename':
        await store.setName(request.claudeId, request.name)
        sessions.renamed(request.claudeId)
        return null
      case 'projects':
        projects = [...request.projects]
        return null
      case 'shutdown':
        setTimeout(() => void stop(), 50)
        return null
    }
  }

  const server = createServer((socket) => {
    clients.add(socket)
    socket.on('data', lineReader((value) => {
      const request = value as Request
      void answer(request).then(
        (v): Reply => ({ seq: request.seq, ok: true, value: v ?? null }),
        (err: unknown): Reply => ({ seq: request.seq, ok: false, error: err instanceof Error ? err.message : String(err) })
      ).then((reply) => {
        if (!socket.destroyed) socket.write(`${JSON.stringify(reply)}\n`)
      })
    }))
    const gone = (): void => {
      clients.delete(socket)
    }
    socket.on('close', gone)
    socket.on('error', gone)
  })

  // Idle: no app and no open session for a while.
  const idleMs = options.idleMs ?? 60_000
  let idleSince = Date.now()
  const timer = setInterval(() => {
    const busy = clients.size > 0 || sessions.list().some((s) => s.state !== 'ended')
    if (busy) idleSince = Date.now()
    else if (Date.now() - idleSince > idleMs) void stop()
  }, 1000)

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    inbox.stop()
    sessions.stopAll()
    for (const c of clients) c.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(socketPath(home), { force: true })
    await rm(join(home, 'host.pid'), { force: true })
    options.onExit?.()
  }

  await rm(socketPath(home), { force: true })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath(home), () => resolve())
  })
  await writeFile(join(home, 'host.pid'), `${process.pid}\n`)
  return { server, sessions, stop }
}
