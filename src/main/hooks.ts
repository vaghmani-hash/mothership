// How sessions tell the app what they are doing, without touching your Claude Code settings:
// every session the app starts runs `claude --settings <app>/claude-settings.json`, which adds
// hooks that run <app>/hook.sh. The script drops each event into <app>/events as one file, named
// for the app's tab (CLIENT_SESSIONS_TAB). Sessions you start elsewhere don't load these hooks.

import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { HookInput } from '../shared/types'

const HOOK_SCRIPT = `#!/bin/sh
# Mothership: hands one Claude Code hook event to the app. Does nothing outside the app's sessions.
if [ -z "$CLIENT_SESSIONS_TAB" ] || [ -z "$CLIENT_SESSIONS_EVENTS" ] || [ ! -d "$CLIENT_SESSIONS_EVENTS" ]; then
  cat > /dev/null
  exit 0
fi
tmp=$(mktemp "$CLIENT_SESSIONS_EVENTS/.ev.XXXXXX") || exit 0
{ printf '{"tab":"%s","input":' "$CLIENT_SESSIONS_TAB"; cat; printf '}\\n'; } > "$tmp"
mv "$tmp" "$tmp.json"
exit 0
`

export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'Notification', 'SessionEnd'] as const

/** A path inside single quotes for /bin/sh. */
const quoted = (path: string): string => `'${path.replace(/'/g, `'\\''`)}'`

export interface HookFiles {
  readonly settings: string
  readonly events: string
}

/** Writes hook.sh and claude-settings.json (every launch, so they match this version of the app). */
export async function writeHookFiles(home: string): Promise<HookFiles> {
  const script = join(home, 'hook.sh')
  const settings = join(home, 'claude-settings.json')
  const events = join(home, 'events')
  await mkdir(events, { recursive: true })
  await writeFile(script, HOOK_SCRIPT, 'utf8')
  await chmod(script, 0o755)
  const command = { type: 'command', command: `/bin/sh ${quoted(script)}`, timeout: 10 }
  const hooks = Object.fromEntries(HOOK_EVENTS.map((event) => [event, [{ hooks: [command] }]]))
  await writeFile(settings, `${JSON.stringify({ hooks }, null, 2)}\n`, 'utf8')
  return { settings, events }
}

export interface HookEvent {
  readonly tab: string
  readonly input: HookInput
}

/** Parses one event file; null for anything that isn't one. */
export function parseEvent(text: string): HookEvent | null {
  try {
    const value = JSON.parse(text) as { tab?: unknown; input?: unknown }
    if (typeof value.tab !== 'string' || typeof value.input !== 'object' || value.input === null) return null
    return { tab: value.tab, input: value.input as HookInput }
  } catch {
    return null
  }
}

/** Reads the events folder as files arrive (a watcher, and a check each second in case it misses one). */
export class EventInbox {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private draining = false
  private again = false

  constructor(
    private readonly dir: string,
    private readonly onEvent: (event: HookEvent) => void
  ) {}

  async start(): Promise<void> {
    // Events left from a run before this one belong to sessions that are gone.
    for (const name of await readdir(this.dir)) await rm(join(this.dir, name), { force: true })
    this.watcher = watch(this.dir, () => void this.drain())
    this.timer = setInterval(() => void this.drain(), 1000)
  }

  stop(): void {
    this.watcher?.close()
    if (this.timer) clearInterval(this.timer)
  }

  async drain(): Promise<void> {
    if (this.draining) {
      this.again = true
      return
    }
    this.draining = true
    try {
      do {
        this.again = false
        // In the order they were written (the names are random): a turn's prompt before its end.
        const names = (await readdir(this.dir)).filter((n) => n.startsWith('.ev.') && n.endsWith('.json'))
        const timed = await Promise.all(names.map(async (name) => ({ name, at: (await stat(join(this.dir, name), { bigint: true }).catch(() => null))?.mtimeNs ?? 0n })))
        timed.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.name.localeCompare(b.name)))
        for (const { name } of timed) {
          const path = join(this.dir, name)
          const text = await readFile(path, 'utf8').catch(() => null)
          await rm(path, { force: true })
          const event = text === null ? null : parseEvent(text)
          if (event) this.onEvent(event)
        }
      } while (this.again)
    } finally {
      this.draining = false
    }
  }
}
