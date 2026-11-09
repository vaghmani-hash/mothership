// How the app talks to the background host that keeps sessions running while the app is closed:
// one JSON object per line over a Unix socket in the app's folder (`host.sock`).

import type { Project } from '../shared/types'
import type { LiveSession } from '../shared/types'

/** Bumped when the messages change: an app and a host of different versions don't mix. */
export const PROTOCOL = 1

export interface StartRequest {
  readonly cwd: string
  readonly resume?: string
  readonly name?: string | null
  readonly replaces?: string
}

export type Call =
  | { readonly method: 'hello' }
  | { readonly method: 'list' }
  | { readonly method: 'snapshot'; readonly id: string }
  | { readonly method: 'start'; readonly request: StartRequest }
  | { readonly method: 'input'; readonly id: string; readonly data: string }
  | { readonly method: 'resize'; readonly id: string; readonly cols: number; readonly rows: number }
  | { readonly method: 'close'; readonly id: string }
  | { readonly method: 'rename'; readonly claudeId: string; readonly name: string | null }
  | { readonly method: 'projects'; readonly projects: readonly Project[] }
  | { readonly method: 'shutdown' }

export type Request = Call & { readonly seq: number }

export interface Hello {
  readonly protocol: number
  readonly pid: number
  readonly live: number
  /** The binary the host runs on (left out by hosts older than this field). */
  readonly execPath?: string
}

export type Reply = { readonly seq: number; readonly ok: true; readonly value: unknown } | { readonly seq: number; readonly ok: false; readonly error: string }

export type HostEvent =
  | { readonly event: 'changed'; readonly sessions: readonly LiveSession[] }
  | { readonly event: 'data'; readonly id: string; readonly data: string; readonly end: number }
  | { readonly event: 'needsYou'; readonly session: LiveSession }

/** Splits a stream of text into lines and hands each parsed one on. */
export function lineReader(onMessage: (value: unknown) => void): (chunk: Buffer | string) => void {
  let pending = ''
  return (chunk) => {
    pending += chunk.toString()
    let at = pending.indexOf('\n')
    while (at >= 0) {
      const line = pending.slice(0, at)
      pending = pending.slice(at + 1)
      if (line.trim() !== '') {
        try {
          onMessage(JSON.parse(line))
        } catch {
          // A line that isn't JSON is dropped.
        }
      }
      at = pending.indexOf('\n')
    }
  }
}

export const socketPath = (home: string): string => `${home}/host.sock`
