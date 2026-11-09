import { describe, expect, it } from 'vitest'
import { cleanPrompt, promptOf, readHead, readTail, wholeLines } from '../src/shared/transcript'

const j = (o: unknown): string => JSON.stringify(o)
const user = (content: unknown, extra: Record<string, unknown> = {}): string => j({ type: 'user', cwd: '/w/mesa/Wren/2', message: { role: 'user', content }, timestamp: '2026-11-07T10:00:00.000Z', ...extra })

describe('transcripts', () => {
  it('finds your first prompt, skipping commands, tool results, meta and sidechains', () => {
    const lines = [
      j({ type: 'permission-mode', permissionMode: 'default' }),
      user('<command-name>/clear</command-name>'),
      user([{ type: 'tool_result', content: 'ok' }]),
      user('Caveat', { isMeta: true }),
      user('side', { isSidechain: true }),
      user([{ type: 'text', text: 'Place the animation [Image #1] slots\nfor scenes 1 to 9' }, { type: 'image', source: {} }])
    ]
    expect(readHead(lines)).toEqual({ cwd: '/w/mesa/Wren/2', firstPrompt: 'Place the animation slots', interactive: true })
  })

  it('marks print-mode and SDK runs', () => {
    expect(readHead([user('hi', { entrypoint: 'sdk-cli' })]).interactive).toBe(false)
    expect(readHead([user('hi', { entrypoint: 'cli' })]).interactive).toBe(true)
  })

  it('takes the latest titles and time from the tail; your /rename wins over the AI title', () => {
    const tail = readTail([
      j({ type: 'ai-title', aiTitle: 'Old title' }),
      j({ type: 'custom-title', customTitle: 'Wren 2 intro' }),
      j({ type: 'ai-title', aiTitle: 'Newer AI title' }),
      j({ type: 'assistant', timestamp: '2026-11-07T11:30:00.000Z' }),
      'not json'
    ])
    expect(tail).toEqual({ customTitle: 'Wren 2 intro', aiTitle: 'Newer AI title', lastAt: Date.parse('2026-11-07T11:30:00.000Z') })
  })

  it('never parses a huge line', () => {
    expect(readTail([`{"type":"ai-title","aiTitle":"x","pad":"${'a'.repeat(1_100_000)}"}`]).aiTitle).toBeNull()
  })

  it('cleans prompts to one short line', () => {
    expect(cleanPrompt('  \n  hello   world  \nmore')).toBe('hello world')
    expect(cleanPrompt('x'.repeat(150))?.length).toBe(100)
    expect(cleanPrompt('   ')).toBeNull()
    expect(promptOf({ type: 'user', isCompactSummary: true, message: { content: 'summary' } })).toBeNull()
  })

  it('drops the cut-off lines of a chunk', () => {
    expect(wholeLines('ial\nwhole\nparti', false, false)).toEqual(['whole'])
    expect(wholeLines('a\nb', true, true)).toEqual(['a', 'b'])
  })
})
