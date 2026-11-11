import { describe, expect, it } from 'vitest'
import { terminalKey } from '../src/renderer/keys'

const key = (key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}, type = 'keydown') => ({ type, key, metaKey: mods.meta === true, ctrlKey: mods.ctrl === true, shiftKey: mods.shift === true })

describe('a key pressed in a terminal', () => {
  it('goes to Claude when it is typing', () => {
    expect(terminalKey(key('a'), false)).toBe('terminal')
    expect(terminalKey(key('Tab'), false)).toBe('terminal')
    // Shift+Tab is Claude's own key (it cycles the permission mode).
    expect(terminalKey(key('Tab', { shift: true }), false)).toBe('terminal')
    expect(terminalKey(key('c', { ctrl: true }), false)).toBe('terminal')
    expect(terminalKey(key('a', {}, 'keyup'), false)).toBe('terminal')
  })

  it('goes to the menu for the keys that switch sessions, never into Claude', () => {
    expect(terminalKey(key('Tab', { ctrl: true }), false)).toBe('menu')
    expect(terminalKey(key('Tab', { ctrl: true, shift: true }), false)).toBe('menu')
    expect(terminalKey(key('1', { meta: true }), false)).toBe('menu')
    expect(terminalKey(key('j', { meta: true }), false)).toBe('menu')
    expect(terminalKey(key('v', { meta: true }), false)).toBe('menu')
  })

  it('copies a selection with ⌘C, and makes a new line with Shift+Enter', () => {
    expect(terminalKey(key('c', { meta: true }), true)).toBe('copy')
    expect(terminalKey(key('c', { meta: true }), false)).toBe('menu')
    expect(terminalKey(key('Enter', { shift: true }), false)).toBe('newline')
    expect(terminalKey(key('Enter'), false)).toBe('terminal')
  })
})
