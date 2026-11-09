import { describe, expect, it } from 'vitest'
import { displayName, placeOf, sessionName, tidyName } from '../src/shared/names'

const roots = ['/Users/me/Client work']

describe('names and places', () => {
  it('your name, else Claude’s title, else the first prompt', () => {
    expect(displayName({ name: 'Mine', title: 'AI', firstPrompt: 'p' })).toBe('Mine')
    expect(displayName({ name: null, title: 'AI', firstPrompt: 'p' })).toBe('AI')
    expect(displayName({ name: null, title: null, firstPrompt: 'p' })).toBe('p')
    expect(displayName({ name: null, title: null, firstPrompt: null })).toBe('New session')
  })

  it('numbers untitled sessions in the same video, never the named ones', () => {
    const untitled = { name: null, title: null, firstPrompt: null }
    expect(sessionName({ ...untitled, seq: 1 })).toBe('New session')
    expect(sessionName({ ...untitled, seq: 2 })).toBe('New session 2')
    expect(sessionName({ ...untitled, title: 'Intro', seq: 2 })).toBe('Intro')
  })

  it('tidies typed names; empty goes back to automatic', () => {
    expect(tidyName('  Intro\n  animations ')).toBe('Intro animations')
    expect(tidyName('   ')).toBeNull()
    expect(tidyName('x'.repeat(100))?.length).toBe(80)
  })

  it('places a folder under its client', () => {
    expect(placeOf('/Users/me/Client work/mesa/Wren/2/script', roots)).toEqual({ root: '/Users/me/Client work', section: 'mesa', label: 'Wren › 2 › script' })
    expect(placeOf('/Users/me/Client work/Jules', roots)).toEqual({ root: '/Users/me/Client work', section: 'Jules', label: 'Jules' })
    expect(placeOf('/Users/me/Client work', roots).section).toBe('Client work')
    expect(placeOf('/tmp/a/b/c/d', roots)).toEqual({ root: null, section: 'Other folders', label: 'b › c › d' })
    // Not fooled by a folder whose name starts like the root.
    expect(placeOf('/Users/me/Client workshop/x', roots).root).toBeNull()
  })
})
