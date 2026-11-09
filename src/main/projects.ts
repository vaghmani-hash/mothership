// Finding the projects under the watched folders: folders with the session folder (`script`)
// inside. A folder that also holds such projects further down is a client, not a project.

import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describeProject } from '../shared/projects'
import type { Project } from '../shared/types'

/** Projects sit at most this deep under a watched folder (`agency/client/project`, and one more). */
const MAX_DEPTH = 4
const skipped = (name: string): boolean => name.startsWith('.') || name.startsWith('_') || name === 'node_modules' || name.startsWith('Adobe Premiere Pro')

async function walk(dir: string, depth: number, sessionFolder: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((e) => e.isDirectory() && !skipped(e.name))
  const hasSessionFolder = folders.some((f) => f.name === sessionFolder)
  const deeper = depth < MAX_DEPTH ? (await Promise.all(folders.filter((f) => f.name !== sessionFolder).map((f) => walk(join(dir, f.name), depth + 1, sessionFolder)))).flat() : []
  if (deeper.length > 0) return deeper
  return hasSessionFolder && depth > 0 ? [dir] : []
}

export async function findProjects(roots: readonly string[], sessionFolder: string): Promise<Project[]> {
  const found = await Promise.all(roots.map(async (root) => (await walk(root, 0, sessionFolder)).map((path) => describeProject(root, path, sessionFolder))))
  const seen = new Set<string>()
  return found.flat().filter((p) => !seen.has(p.path) && Boolean(seen.add(p.path)))
}
