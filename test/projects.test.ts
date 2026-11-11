import { describe, expect, it } from 'vitest'
import { agenciesOf, CLIENT_FOLDER, clientFolderOf, clientPathOf, clientsOf, describeFolder, groupByProject, isBaseName, isVideoName, nextVideoFolder, projectLabel, projectOf, seqKey, videoTitle, whereLabel } from '../src/shared/projects'

const root = '/Users/me/Client work'
/** `mesa/Wren/2`: a folder of a client in an agency. `Jules/2`: one of a client straight in the root. */
const p = (path: string) => {
  const parts = path.split('/')
  const folder = parts.pop() ?? ''
  const agency = parts.length > 1 ? (parts[0] ?? null) : null
  return describeFolder({ root, clientPath: `${root}/${parts.join('/')}`, agency }, folder)
}
const projects = [p('mesa/Wren/2'), p('mesa/Wren/10'), p('mesa/Wren/Base'), p('mesa/cora/1'), p('Jules/2'), p('FINANCE/TAXES'), p('Dawn Media/test/base')]

describe('clients and their folders', () => {
  it('describes a folder: its client, agency and whether it is a video', () => {
    expect(p('mesa/Wren/2')).toEqual({ path: `${root}/mesa/Wren/2`, name: '2', title: 'Video 2', kind: 'video', client: 'Wren', clientPath: `${root}/mesa/Wren`, agency: 'mesa', root })
    expect(p('Jules/2')).toMatchObject({ client: 'Jules', agency: null })
    expect(p('mesa/Wren/Base')).toMatchObject({ name: 'Base', title: 'Base', kind: 'folder' })
  })

  it('shows names trimmed and keeps the path as it is on disk', () => {
    const folder = describeFolder({ root, clientPath: `${root}/Kite Media /Paperdesk `, agency: 'Kite Media ' }, 'Video 38 ')
    expect(folder).toMatchObject({ path: `${root}/Kite Media /Paperdesk /Video 38 `, name: 'Video 38', title: 'Video 38', client: 'Paperdesk', agency: 'Kite Media' })
  })

  it('lists a client with no folders inside as its own folder', () => {
    const empty = describeFolder({ root, clientPath: `${root}/mesa/New Guy`, agency: 'mesa' }, null)
    expect(empty).toMatchObject({ path: `${root}/mesa/New Guy`, clientPath: `${root}/mesa/New Guy`, client: 'New Guy', name: 'New Guy', title: CLIENT_FOLDER, kind: 'folder' })
    expect(projectLabel(`${root}/mesa/New Guy`, [empty], [root])).toBe('New Guy')
  })

  it('calls numbered folders videos', () => {
    expect(videoTitle('2')).toBe('Video 2')
    expect(videoTitle('07')).toBe('Video 7')
    expect(videoTitle('christmas special')).toBe('christmas special')
    expect(videoTitle('Video 1 ')).toBe('Video 1')
  })

  it('knows a video folder by its name, and a Base folder', () => {
    for (const name of ['41', 'Video 38', 'Video 1 ', 'VIDEO 20', 'Rio video 4 ', 'Video 1 I Approached X Women in 5 Years']) expect(isVideoName(name), name).toBe(true)
    for (const name of ['Base', 'References', 'Style-System', 'video notes', 'PJ']) expect(isVideoName(name), name).toBe(false)
    expect(isBaseName('Base')).toBe(true)
    expect(isBaseName('base ')).toBe(true)
    expect(isBaseName('Base files')).toBe(false)
  })

  it('finds the folder a session runs in, from anything inside it', () => {
    expect(projectOf(`${root}/mesa/Wren/2`, projects)?.name).toBe('2')
    expect(projectOf(`${root}/mesa/Wren/2/remotion/src`, projects)?.name).toBe('2')
    expect(projectOf(`${root}/mesa/Wren/20`, projects)).toBeNull()
    expect(projectOf(`${root}/mesa/Wren`, projects)).toBeNull()
  })

  it('labels folders by client and folder', () => {
    expect(projectLabel(`${root}/mesa/Wren/2/script`, projects, [root])).toBe('Wren › Video 2')
    expect(projectLabel(`${root}/mesa/Wren/Base`, projects, [root])).toBe('Wren › Base')
    expect(projectLabel(`${root}/mesa/styles/wren`, projects, [root])).toBe('mesa › styles › wren')
  })

  it('numbers sessions by folder, so a folder inside it shares its #1, #2', () => {
    expect(seqKey(`${root}/mesa/Wren/2/script`, projects)).toBe(seqKey(`${root}/mesa/Wren/2`, projects))
    expect(seqKey('/tmp/x/', projects)).toBe('/tmp/x')
  })

  it('groups sessions by client, then folder; other folders come last', () => {
    const s = (cwd: string, seq: number) => ({ cwd, seq })
    const groups = groupByProject([s(`${root}/mesa/Wren/10`, 1), s(`${root}/mesa/Wren/2`, 2), s(`${root}/mesa/Wren/2/script`, 1), s(`${root}/Jules/2`, 1), s('/tmp/elsewhere', 1)], projects, [root])
    expect(groups.map((g) => g.client)).toEqual(['Jules', 'Wren', 'Other folders'])
    expect(groups[1]).toMatchObject({ agency: 'mesa' })
    expect(groups[1]?.projects.map((x) => x.name)).toEqual(['Video 2', 'Video 10'])
    expect(groups[1]?.projects[0]?.items.map((i) => i.seq)).toEqual([1, 2])
    expect(groups[1]?.projects[0]?.startIn).toBe(`${root}/mesa/Wren/2`)
    expect(groups[2]?.projects[0]?.startIn).toBe('/tmp/elsewhere')
  })

  it('lists every client with its videos first, in order, then its other folders', () => {
    const clients = clientsOf(projects)
    expect(clients.map((c) => c.client)).toEqual(['cora', 'FINANCE', 'Jules', 'test', 'Wren'])
    expect(clients.find((c) => c.client === 'Wren')?.projects.map((x) => x.name)).toEqual(['2', '10', 'Base'])
  })

  it('orders videos by their number, however each one is named', () => {
    const mixed = ['41', 'Video 38', 'Base', '44', 'Video 40', 'Video 9 The long title'].map((f) => p(`KM/Paperdesk/${f}`))
    expect(clientsOf(mixed)[0]?.projects.map((x) => x.name)).toEqual(['Video 9 The long title', 'Video 38', 'Video 40', '41', '44', 'Base'])
  })

  it('knows a client folder itself, and folders deeper in it that are not listed', () => {
    expect(clientFolderOf(`${root}/mesa/Wren`, projects)).toEqual({ clientPath: `${root}/mesa/Wren`, client: 'Wren', agency: 'mesa', sub: null })
    expect(clientFolderOf(`${root}/mesa/Wren/_notes`, projects)?.sub).toBe('_notes')
    expect(clientFolderOf(`${root}/mesa/Wren/2/script`, projects)).toBeNull()
    expect(clientFolderOf(`${root}/mesa`, projects)).toBeNull()
    expect(projectLabel(`${root}/mesa/Wren`, projects, [root])).toBe('Wren › Client folder')
  })

  it('knows the client of a session wherever it runs: a video, the client folder, or deeper', () => {
    expect(clientPathOf(`${root}/mesa/Wren/2/script`, projects)).toBe(`${root}/mesa/Wren`)
    expect(clientPathOf(`${root}/mesa/Wren`, projects)).toBe(`${root}/mesa/Wren`)
    expect(clientPathOf(`${root}/mesa`, projects)).toBeNull()
    expect(clientPathOf('/tmp/elsewhere', projects)).toBeNull()
  })

  it('says where a session runs in few words: the client alone for its own folder', () => {
    expect(whereLabel(`${root}/mesa/Wren`, projects, [root])).toBe('Wren')
    expect(whereLabel(`${root}/mesa/Wren/2/script`, projects, [root])).toBe('Wren › Video 2')
    expect(whereLabel(`${root}/mesa/Wren/_notes`, projects, [root])).toBe('Wren › _notes')
    const empty = describeFolder({ root, clientPath: `${root}/mesa/New Guy`, agency: 'mesa' }, null)
    expect(whereLabel(`${root}/mesa/New Guy`, [empty], [root])).toBe('New Guy')
    expect(whereLabel('/tmp/elsewhere', projects, [root])).toBe('tmp › elsewhere')
  })

  it('suggests the next video in the way the client names them', () => {
    expect(nextVideoFolder([])).toBe('1')
    expect(nextVideoFolder(['2', '10', 'Base'])).toBe('11')
    expect(nextVideoFolder(['Video 1', 'Video 4', 'Base'])).toBe('Video 5')
    expect(nextVideoFolder(['41', '44', 'Video 38', 'Video 40'])).toBe('45')
    expect(nextVideoFolder(['Rio Video 3', 'Rio video 4'])).toBe('Rio video 5')
    expect(nextVideoFolder(['Video 1 I Approached X Women in 5 Years', 'References'])).toBe('Video 2')
  })

  it('offers the agencies there are, by the name they show under', () => {
    const spaced = describeFolder({ root, clientPath: `${root}/Kite Media /JAY`, agency: 'Kite Media ' }, 'Video 37')
    expect(agenciesOf([...projects, spaced])).toEqual([
      { name: 'Dawn Media', root },
      { name: 'Kite Media', root },
      { name: 'mesa', root }
    ])
  })
})
