// Finding the clients under the watched folders, and every folder in each, as they are on disk.
//
// A folder with a `Base` folder inside is a client. A folder whose own folders have one is an
// agency, and every folder in it is a client (with a Base yet or not). Where there is no Base at
// all, the names decide: videos inside (`Video 3`, `41`) make a client; clients with videos inside
// make an agency; anything else is a client. Nothing has to be added by hand or laid out one way.

import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describeFolder, isBaseName, isVideoName } from '../shared/projects'
import type { ClientPlace } from '../shared/projects'
import type { Project } from '../shared/types'

const skipped = (name: string): boolean => name.startsWith('.') || name.startsWith('_') || name === 'node_modules' || name.startsWith('Adobe Premiere Pro')

/** The names of the folders in `dir` that count; none when it can't be read (a drive that isn't connected). */
async function foldersIn(dir: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory() && !skipped(e.name)).map((e) => e.name)
}

interface FoundClient extends ClientPlace {
  /** The folders directly inside it. */
  readonly folders: readonly string[]
}

/** The clients in one folder of a watched folder: the folder itself, or each folder in it when it is an agency. */
async function clientsIn(root: string, top: string): Promise<FoundClient[]> {
  const path = join(root, top)
  const folders = await foldersIn(path)
  const itself: FoundClient = { root, clientPath: path, agency: null, folders }
  if (folders.some(isBaseName)) return [itself]
  const inside = await Promise.all(folders.map(async (name) => ({ name, folders: await foldersIn(join(path, name)) })))
  const isAgency = inside.some((f) => f.folders.some(isBaseName)) || (!folders.some(isVideoName) && inside.some((f) => f.folders.some(isVideoName)))
  return isAgency ? inside.map((f) => ({ root, clientPath: join(path, f.name), agency: top, folders: f.folders })) : [itself]
}

export async function findProjects(roots: readonly string[]): Promise<Project[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const clients = (await Promise.all((await foldersIn(root)).map((top) => clientsIn(root, top)))).flat()
      return clients.flatMap((c) => (c.folders.length > 0 ? c.folders.map((folder) => describeFolder(c, folder)) : [describeFolder(c, null)]))
    })
  )
  const seen = new Set<string>()
  return perRoot.flat().filter((p) => !seen.has(p.path) && Boolean(seen.add(p.path)))
}
