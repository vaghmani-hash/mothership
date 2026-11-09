// How a session's state follows Claude Code's hook events and your typing.

import { cleanPrompt } from './transcript'
import type { HookInput, LiveSession, SessionState, WaitKind } from './types'

type Fields = Pick<LiveSession, 'state' | 'wait' | 'reason' | 'firstPrompt'>

export interface Change {
  readonly state: SessionState
  readonly wait: WaitKind | null
  readonly reason: string | null
  readonly firstPrompt: string | null
  /** True when this change should tell you (it just started needing you). */
  readonly notify: boolean
}

const same = (s: Fields): Change => ({ ...s, notify: false })

/** The session after one hook event. An ended session stays ended. */
export function afterHook(s: Fields, input: HookInput): Change {
  if (s.state === 'ended') return same(s)
  switch (input.hook_event_name) {
    case 'SessionStart':
      // A resume, /clear or /compact starts again too; only a launch moves on from "starting".
      return s.state === 'starting' ? { ...s, state: 'ready', wait: null, reason: null, notify: false } : same(s)
    case 'UserPromptSubmit':
      return { state: 'working', wait: null, reason: null, firstPrompt: s.firstPrompt ?? cleanPrompt(input.prompt ?? ''), notify: false }
    case 'Stop':
      return { ...s, state: 'needs-you', wait: 'turn', reason: 'Finished its turn', notify: s.state !== 'needs-you' }
    case 'Notification': {
      // The "still waiting for your input" reminder after a turn says nothing new.
      if (s.state === 'needs-you' && (input.notification_type === 'idle_prompt' || /waiting for your input/i.test(input.message ?? ''))) return same(s)
      return { ...s, state: 'needs-you', wait: 'ask', reason: input.message?.trim() || 'Needs your input', notify: s.state !== 'needs-you' }
    }
    case 'SessionEnd':
      return { ...s, state: 'ended', wait: null, reason: null, notify: false }
    default:
      return same(s)
  }
}

/** You typed into the terminal: answering a question or a permission puts Claude back to work. */
export function afterInput(s: Fields, data: string): Change {
  if (s.state === 'needs-you' && s.wait === 'ask' && data.length > 0) return { ...s, state: 'working', wait: null, reason: null, notify: false }
  return same(s)
}
