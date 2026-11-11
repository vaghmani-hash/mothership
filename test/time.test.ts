import { describe, expect, it } from 'vitest'
import { ago, agoText } from '../src/renderer/time'

describe('how long ago', () => {
  const now = 1_000_000_000
  it('is short for a row: now, 4m, 2h, 3d', () => {
    expect(ago(now - 10_000, now)).toBe('now')
    expect(ago(now - 4 * 60_000, now)).toBe('4m')
    expect(ago(now - 2 * 3600_000, now)).toBe('2h')
    expect(ago(now - 3 * 86400_000, now)).toBe('3d')
  })

  it('reads as words in a sentence: "just now", never "now ago"', () => {
    expect(agoText(now - 10_000, now)).toBe('just now')
    expect(agoText(now - 4 * 60_000, now)).toBe('4m ago')
  })
})
