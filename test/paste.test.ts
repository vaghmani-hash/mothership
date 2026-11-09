// Pasting and dropping into a session's terminal: files as escaped paths, a screenshot as Ctrl+V.

import { describe, expect, it } from 'vitest'
import { escapePath, pasteFor } from '../src/renderer/paste'

describe('paste into a terminal', () => {
  it('escapes a path the way Terminal does', () => {
    expect(escapePath('/Users/me/Client work/mesa/Wren (old)/shot 1.png')).toBe('/Users/me/Client\\ work/mesa/Wren\\ \\(old\\)/shot\\ 1.png')
    expect(escapePath("/a/it's & $x")).toBe("/a/it\\'s\\ \\&\\ \\$x")
  })
  it('leaves plain text to xterm', () => {
    expect(pasteFor([], () => '', 'clipboard')).toBeNull()
  })
  it('pastes copied or dropped files as their paths, with a space after', () => {
    const files = [{ type: 'image/png' }, { type: '' }]
    const paths = ['/tmp/a b.png', '/tmp/c']
    expect(pasteFor(files, (i) => paths[i] ?? '', 'clipboard')).toEqual({ paste: '/tmp/a\\ b.png /tmp/c ' })
    expect(pasteFor(files, (i) => paths[i] ?? '', 'drop')).toEqual({ paste: '/tmp/a\\ b.png /tmp/c ' })
  })
  it("sends Ctrl+V for a screenshot on the clipboard, so Claude Code reads the image itself", () => {
    expect(pasteFor([{ type: 'image/png' }], () => '', 'clipboard')).toEqual({ input: '\x16' })
  })
  it('ignores a dropped image with no file behind it (it is not on the clipboard)', () => {
    expect(pasteFor([{ type: 'image/png' }], () => '', 'drop')).toBeNull()
  })
})
