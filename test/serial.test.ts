import { describe, expect, it } from 'vitest'
import { oneAtATime } from '../src/shared/serial'

describe('one at a time', () => {
  it('never runs two at once, and a call made meanwhile gets a run that starts after it', async () => {
    let state = 'old'
    let running = 0
    let most = 0
    let runs = 0
    const release: (() => void)[] = []
    const read = oneAtATime(async () => {
      runs++
      most = Math.max(most, ++running)
      const seen = state
      await new Promise<void>((r) => release.push(r))
      running--
      return seen
    })
    const first = read()
    state = 'new'
    // Two calls while the first still runs share one run, started after the first ends.
    const second = read()
    const third = read()
    expect(runs).toBe(1)
    release[0]?.()
    expect(await first).toBe('old')
    await new Promise((r) => setTimeout(r, 0))
    expect(runs).toBe(2)
    release[1]?.()
    expect(await second).toBe('new')
    expect(await third).toBe('new')
    expect(most).toBe(1)
    // Idle again: the next call runs at once.
    const fourth = read()
    expect(runs).toBe(3)
    release[2]?.()
    expect(await fourth).toBe('new')
  })

  it('keeps going after a run fails', async () => {
    let fail = true
    const read = oneAtATime(async () => {
      if (fail) throw new Error('drive gone')
      return 'ok'
    })
    await expect(read()).rejects.toThrow('drive gone')
    fail = false
    expect(await read()).toBe('ok')
  })
})
