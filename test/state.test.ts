import { describe, expect, it } from 'vitest'
import { afterHook, afterInput } from '../src/shared/state'

const fresh = { state: 'starting' as const, wait: null, reason: null, firstPrompt: null }

describe('session states', () => {
  it('starting → ready → working → needs you, telling you once', () => {
    const ready = afterHook(fresh, { hook_event_name: 'SessionStart', source: 'startup' })
    expect(ready.state).toBe('ready')
    const working = afterHook(ready, { hook_event_name: 'UserPromptSubmit', prompt: 'Retime the intro\nand the outro' })
    expect(working).toMatchObject({ state: 'working', firstPrompt: 'Retime the intro', notify: false })
    const done = afterHook(working, { hook_event_name: 'Stop' })
    expect(done).toMatchObject({ state: 'needs-you', wait: 'turn', reason: 'Finished its turn', notify: true })
    expect(afterHook(done, { hook_event_name: 'Stop' }).notify).toBe(false)
  })

  it('keeps the first prompt from the first turn', () => {
    const one = afterHook({ ...fresh, state: 'ready' }, { hook_event_name: 'UserPromptSubmit', prompt: 'first' })
    const two = afterHook({ ...one, state: 'needs-you' }, { hook_event_name: 'UserPromptSubmit', prompt: 'second' })
    expect(two.firstPrompt).toBe('first')
  })

  it('a permission question needs you; answering it puts Claude back to work', () => {
    const asked = afterHook({ ...fresh, state: 'working' }, { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' })
    expect(asked).toMatchObject({ state: 'needs-you', wait: 'ask', reason: 'Claude needs your permission to use Bash', notify: true })
    expect(afterInput(asked, '1').state).toBe('working')
  })

  it('typing after a finished turn waits for the prompt to be sent', () => {
    const turn = afterHook({ ...fresh, state: 'working' }, { hook_event_name: 'Stop' })
    expect(afterInput(turn, 'h').state).toBe('needs-you')
  })

  it('the idle reminder after a turn changes nothing and tells nothing', () => {
    const turn = afterHook({ ...fresh, state: 'working' }, { hook_event_name: 'Stop' })
    const reminder = afterHook(turn, { hook_event_name: 'Notification', message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
    expect(reminder).toMatchObject({ state: 'needs-you', reason: 'Finished its turn', notify: false })
  })

  it('ends on SessionEnd and stays ended', () => {
    const ended = afterHook({ ...fresh, state: 'working' }, { hook_event_name: 'SessionEnd' })
    expect(ended.state).toBe('ended')
    expect(afterHook(ended, { hook_event_name: 'UserPromptSubmit', prompt: 'x' }).state).toBe('ended')
  })
})
