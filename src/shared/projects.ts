// Clients and projects. A project is a folder with a session folder (`script`) inside it; its
// sessions run in that folder. Its client is the folder it sits in; folders above the client (an
// agency such as `mesa` or `Dawn Media`) are shown beside the client's name.

import { placeOf } from './names'
import type { Project } from './types'

const natural = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)
const inside = (parent: string, path: string): boolean => path === parent || path.startsWith(`${parent}/`)

/** `Video 2` for a numbered folder (`2`, `02`), else the folder name as it is. */
export function videoTitle(folder: string): string {
  return /^\d+$/.test(folder.trim()) ? `Video ${Number(folder)}` : folder
}

/** The project a folder belongs to (the project folder itself or anything inside it), or null. */
export function projectOf(folder: string, projects: readonly Project[]): Project | null {
  const path = trimSlash(folder)
  let best: Project | null = null
  for (const p of projects) if (inside(p.path, path) && (best === null || p.path.length > best.path.length)) best = p
  return best
}

/** A project's client, project and agency from where it sits under its watched folder. */
export function describeProject(root: string, path: string, sessionFolder: string): Project {
  const parts = trimSlash(path).slice(trimSlash(root).length).split('/').filter(Boolean)
  const name = parts[parts.length - 1] ?? path
  const above = parts.slice(0, -1)
  const client = above[above.length - 1] ?? name
  const clientPath = above.length > 0 ? `${trimSlash(root)}/${above.join('/')}` : trimSlash(path)
  const agency = above.length > 1 ? above.slice(0, -1).join(' › ') : null
  return { path: trimSlash(path), sessionDir: `${trimSlash(path)}/${sessionFolder}`, name, title: videoTitle(name), client, clientPath, agency, root: trimSlash(root) }
}

export interface ClientFolder {
  readonly clientPath: string
  readonly client: string
  readonly agency: string | null
  /** The folder inside the client (`base`), or null for the client folder itself. */
  readonly sub: string | null
}

/** The client a folder sits in when it is the client folder itself or inside it but in no video, else null. */
export function clientFolderOf(folder: string, projects: readonly Project[]): ClientFolder | null {
  const path = trimSlash(folder)
  if (projectOf(path, projects)) return null
  let best: Project | null = null
  for (const p of projects) if (inside(p.clientPath, path) && p.clientPath !== p.path && (best === null || p.clientPath.length > best.clientPath.length)) best = p
  if (!best) return null
  const sub = path.slice(best.clientPath.length).split('/').filter(Boolean).join(' › ')
  return { clientPath: best.clientPath, client: best.client, agency: best.agency, sub: sub === '' ? null : sub }
}

/** "Client folder", or the folder inside it (`base`). */
export const clientFolderTitle = (c: ClientFolder): string => c.sub ?? 'Client folder'

/** "Wren › Video 2", "Wren › Client folder", or "Other folders › …" for a folder outside every client. */
export function projectLabel(folder: string, projects: readonly Project[], roots: readonly string[]): string {
  const p = projectOf(folder, projects)
  if (p) return p.name === p.client ? p.client : `${p.client} › ${p.title}`
  const c = clientFolderOf(folder, projects)
  if (c) return `${c.client} › ${clientFolderTitle(c)}`
  const place = placeOf(folder, roots)
  return `${place.section} › ${place.label}`
}

/** The key sessions are numbered by: their project, else their folder. */
export function seqKey(folder: string, projects: readonly Project[]): string {
  return projectOf(folder, projects)?.path ?? trimSlash(folder)
}

export interface ProjectGroup<T> {
  /** The project, or null for a folder outside every project. */
  readonly project: Project | null
  readonly key: string
  readonly name: string
  /** Where a new session for this group starts. */
  readonly startIn: string
  readonly items: readonly T[]
}

export interface ClientGroup<T> {
  readonly key: string
  readonly client: string
  readonly agency: string | null
  readonly projects: readonly ProjectGroup<T>[]
}

export const OTHER = 'Other folders'

/** Items by client, then project, in natural order; folders outside every project come last. */
export function groupByProject<T extends { readonly cwd: string; readonly seq: number }>(items: readonly T[], projects: readonly Project[], roots: readonly string[]): ClientGroup<T>[] {
  const clients = new Map<string, { client: string; agency: string | null; groups: Map<string, { project: Project | null; name: string; startIn: string; items: T[] }> }>()
  for (const item of items) {
    const project = projectOf(item.cwd, projects)
    const clientKey = project?.clientPath ?? OTHER
    const entry = clients.get(clientKey) ?? { client: project?.client ?? OTHER, agency: project?.agency ?? null, groups: new Map() }
    clients.set(clientKey, entry)
    const key = project?.path ?? trimSlash(item.cwd)
    const place = placeOf(item.cwd, roots)
    const group = entry.groups.get(key) ?? { project, name: project?.title ?? `${place.section} › ${place.label}`, startIn: project?.sessionDir ?? item.cwd, items: [] }
    entry.groups.set(key, group)
    group.items.push(item)
  }
  return [...clients.entries()]
    .sort(([ka, a], [kb, b]) => (ka === OTHER ? 1 : kb === OTHER ? -1 : natural(a.client, b.client) || natural(a.agency ?? '', b.agency ?? '')))
    .map(([key, c]) => ({
      key,
      client: c.client,
      agency: c.agency,
      projects: [...c.groups.entries()].sort(([, a], [, b]) => natural(a.name, b.name)).map(([k, g]) => ({ ...g, key: k, items: [...g.items].sort((a, b) => a.seq - b.seq) }))
    }))
}

/** Every client with its projects (for the Projects page and the picker), in natural order. */
export function clientsOf(projects: readonly Project[]): { key: string; client: string; agency: string | null; projects: Project[] }[] {
  const map = new Map<string, { key: string; client: string; agency: string | null; projects: Project[] }>()
  for (const p of projects) {
    const c = map.get(p.clientPath) ?? { key: p.clientPath, client: p.client, agency: p.agency, projects: [] }
    map.set(p.clientPath, c)
    c.projects.push(p)
  }
  return [...map.values()].sort((a, b) => natural(a.client, b.client) || natural(a.agency ?? '', b.agency ?? '')).map((c) => ({ ...c, projects: c.projects.sort((a, b) => natural(a.name, b.name)) }))
}

/** The next video folder for a client: one more than its highest numbered one, else `1`. */
export function nextVideoFolder(names: readonly string[]): string {
  const numbers = names.filter((n) => /^\d+$/.test(n.trim())).map(Number)
  return String(numbers.length > 0 ? Math.max(...numbers) + 1 : 1)
}

/** The agency folders that exist (from the projects found), for the New client dialog. */
export function agenciesOf(projects: readonly Project[]): { readonly name: string; readonly root: string }[] {
  const seen = new Map<string, { name: string; root: string }>()
  // Only one folder deep: a new client goes directly into an agency folder.
  for (const p of projects) if (p.agency !== null && !p.agency.includes(' › ')) seen.set(`${p.root}/${p.agency}`, { name: p.agency, root: p.root })
  return [...seen.values()].sort((a, b) => natural(a.name, b.name))
}
