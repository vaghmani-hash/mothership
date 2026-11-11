import { describe, expect, it } from 'vitest'
import { nextNeedingYou, openOrder, stepFrom } from '../src/shared/order'
import type { SessionState } from '../src/shared/types'

const s = (id: string, startedAt: number, state: SessionState = 'working') => ({ id, startedAt, state })

describe('the order of open sessions', () => {
  it('lists them oldest first, so a row never moves when a state changes', () => {
    const list = [s('c', 30), s('a', 10, 'needs-you'), s('b', 20, 'ended')]
    expect(openOrder(list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(openOrder([s('z', 5), s('y', 5)]).map((x) => x.id)).toEqual(['y', 'z'])
  })

  it('steps to the next and the previous one, round the ends', () => {
    const list = [s('a', 1), s('b', 2), s('c', 3)]
    expect(stepFrom(list, 'a', 1)).toBe('b')
    expect(stepFrom(list, 'c', 1)).toBe('a')
    expect(stepFrom(list, 'a', -1)).toBe('c')
    expect(stepFrom(list, null, 1)).toBe('a')
    expect(stepFrom(list, null, -1)).toBe('c')
    expect(stepFrom(list, 'gone', 1)).toBe('a')
    expect(stepFrom([], null, 1)).toBeNull()
  })

  it('finds the next session that needs you, after the one you are on', () => {
    const list = [s('a', 1, 'needs-you'), s('b', 2), s('c', 3, 'needs-you'), s('d', 4, 'ready')]
    expect(nextNeedingYou(list, null)).toBe('a')
    expect(nextNeedingYou(list, 'a')).toBe('c')
    expect(nextNeedingYou(list, 'b')).toBe('c')
    expect(nextNeedingYou(list, 'c')).toBe('a')
    expect(nextNeedingYou(list, 'd')).toBe('a')
    expect(nextNeedingYou([s('a', 1, 'needs-you')], 'a')).toBe('a')
    expect(nextNeedingYou([s('a', 1), s('b', 2, 'ended')], 'a')).toBeNull()
  })
})
