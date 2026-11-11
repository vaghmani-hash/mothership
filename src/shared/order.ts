// The open sessions as a list you can step through: one fixed order (oldest first), so a row never
// moves under your pointer when a state changes, and the keys that jump between them.

import type { SessionState } from './types'

interface Ordered {
  readonly id: string
  readonly startedAt: number
  readonly state: SessionState
}

/** Oldest first; the id settles two started at the same moment. */
export function openOrder<T extends Ordered>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
}

/** The session after (1) or before (-1) the one you are on, round the ends; the first or last when you are on none. */
export function stepFrom(ordered: readonly Ordered[], current: string | null, by: 1 | -1): string | null {
  if (ordered.length === 0) return null
  const at = ordered.findIndex((s) => s.id === current)
  const next = at === -1 ? (by === 1 ? 0 : ordered.length - 1) : (at + by + ordered.length) % ordered.length
  return ordered[next]?.id ?? null
}

/** The next session that needs you after the one you are on, round the end; null when none does. */
export function nextNeedingYou(ordered: readonly Ordered[], current: string | null): string | null {
  const at = ordered.findIndex((s) => s.id === current)
  const after = [...ordered.slice(at + 1), ...ordered.slice(0, at + 1)]
  return after.find((s) => s.state === 'needs-you')?.id ?? null
}
