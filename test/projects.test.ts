import { describe, expect, it } from 'vitest'
import { clientFolderOf, clientsOf, describeProject, groupByProject, projectLabel, projectOf, seqKey, videoTitle } from '../src/shared/projects'

const root = '/Users/me/Client work'
const p = (path: string) => describeProject(root, `${root}/${path}`, 'script')
const projects = [p('mesa/Wren/2'), p('mesa/Wren/10'), p('mesa/cora/1'), p('Jules/2'), p('FINANCE/TAXES'), p('Dawn Media/test/base')]

describe('clients and projects', () => {
  it('describes a project: its client, agency and session folder', () => {
    expect(p('mesa/Wren/2')).toEqual({ path: `${root}/mesa/Wren/2`, sessionDir: `${root}/mesa/Wren/2/script`, name: '2', title: 'Video 2', client: 'Wren', clientPath: `${root}/mesa/Wren`, agency: 'mesa', root })
    expect(p('Jules/2')).toMatchObject({ client: 'Jules', agency: null })
    expect(p('Dawn Media/test/base')).toMatchObject({ client: 'test', agency: 'Dawn Media', name: 'base', title: 'base' })
  })

  it('calls numbered folders videos', () => {
    expect(videoTitle('2')).toBe('Video 2')
    expect(videoTitle('07')).toBe('Video 7')
    expect(videoTitle('christmas special')).toBe('christmas special')
    expect(videoTitle('Video 1')).toBe('Video 1')
  })

  it('finds the project of any folder inside it', () => {
    expect(projectOf(`${root}/mesa/Wren/2/script`, projects)?.name).toBe('2')
    expect(projectOf(`${root}/mesa/Wren/2/remotion/src`, projects)?.name).toBe('2')
    expect(projectOf(`${root}/mesa/Wren/20`, projects)).toBeNull()
    expect(projectOf(`${root}/mesa/Wren`, projects)).toBeNull()
  })

  it('labels folders by client and project', () => {
    expect(projectLabel(`${root}/mesa/Wren/2/script`, projects, [root])).toBe('Wren › Video 2')
    expect(projectLabel(`${root}/mesa/styles/wren`, projects, [root])).toBe('mesa › styles › wren')
  })

  it('numbers sessions by project, so the script folder and the project folder share #1, #2', () => {
    expect(seqKey(`${root}/mesa/Wren/2/script`, projects)).toBe(seqKey(`${root}/mesa/Wren/2`, projects))
    expect(seqKey('/tmp/x/', projects)).toBe('/tmp/x')
  })

  it('groups sessions by client, then project; other folders come last', () => {
    const s = (cwd: string, seq: number) => ({ cwd, seq })
    const groups = groupByProject([s(`${root}/mesa/Wren/10/script`, 1), s(`${root}/mesa/Wren/2/script`, 2), s(`${root}/mesa/Wren/2/script`, 1), s(`${root}/Jules/2/script`, 1), s('/tmp/elsewhere', 1)], projects, [root])
    expect(groups.map((g) => g.client)).toEqual(['Jules', 'Wren', 'Other folders'])
    expect(groups[1]).toMatchObject({ agency: 'mesa' })
    expect(groups[1]?.projects.map((x) => x.name)).toEqual(['Video 2', 'Video 10'])
    expect(groups[1]?.projects[0]?.items.map((i) => i.seq)).toEqual([1, 2])
    expect(groups[1]?.projects[0]?.startIn).toBe(`${root}/mesa/Wren/2/script`)
    expect(groups[2]?.projects[0]?.startIn).toBe('/tmp/elsewhere')
  })

  it('lists every client with its projects', () => {
    const clients = clientsOf(projects)
    expect(clients.map((c) => c.client)).toEqual(['cora', 'FINANCE', 'Jules', 'test', 'Wren'])
    expect(clients.find((c) => c.client === 'Wren')?.projects.map((x) => x.name)).toEqual(['2', '10'])
  })

  it('knows a client folder itself, and folders in it that are no video', () => {
    expect(clientFolderOf(`${root}/mesa/Wren`, projects)).toEqual({ clientPath: `${root}/mesa/Wren`, client: 'Wren', agency: 'mesa', sub: null })
    expect(clientFolderOf(`${root}/mesa/Wren/base`, projects)?.sub).toBe('base')
    expect(clientFolderOf(`${root}/mesa/Wren/2/script`, projects)).toBeNull()
    expect(clientFolderOf(`${root}/mesa`, projects)).toBeNull()
    expect(projectLabel(`${root}/mesa/Wren`, projects, [root])).toBe('Wren › Client folder')
    expect(projectLabel(`${root}/mesa/Wren/base`, projects, [root])).toBe('Wren › base')
  })
})
