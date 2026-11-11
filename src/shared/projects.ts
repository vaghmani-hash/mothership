// Clients and their folders. Every folder directly inside a client is listed (a video such as
// `Video 3` or `41`, or any other folder such as `Base`), and its sessions run in the folder itself.
// A client may sit in an agency folder (`mesa`, `Dawn Media`), shown beside the client's name.

import { placeOf } from './names'
import type { Project } from './types'

const natural = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)
const inside = (parent: string, path: string): boolean => path === parent || path.startsWith(`${parent}/`)

/** `Video 2` for a numbered folder (`2`, `02`), else the folder name, trimmed. */
export function videoTitle(folder: string): string {
  const name = folder.trim()
  return /^\d+$/.test(name) ? `Video ${Number(name)}` : name
}

/** A video folder's number and what comes before it: `41` → 41 after nothing, `Rio video 4` → 4 after "Rio video ". Null when it isn't named as a video. */
function videoNumber(folder: string): { readonly prefix: string; readonly n: number } | null {
  const name = folder.trim()
  if (/^\d+$/.test(name)) return { prefix: '', n: Number(name) }
  const worded = /^(.*?\bvideo\s*)(\d+)/i.exec(name)
  return worded ? { prefix: worded[1] ?? '', n: Number(worded[2]) } : null
}

/** A folder named as a video: a number (`41`) or "video" and a number (`Video 3`, `Rio video 4`). */
export const isVideoName = (folder: string): boolean => videoNumber(folder) !== null

/** A client's folders in the order they are listed: videos by their number, then the rest by name. */
function byVideoThenName(a: Project, b: Project): number {
  const [va, vb] = [videoNumber(a.name), videoNumber(b.name)]
  if (va && vb) return va.n - vb.n || natural(a.name, b.name)
  return Number(vb !== null) - Number(va !== null) || natural(a.name, b.name)
}

/** The `Base` folder that marks a client (any case). */
export const isBaseName = (folder: string): boolean => folder.trim().toLowerCase() === 'base'

/** What a client's own folder is called on screen. */
export const CLIENT_FOLDER = 'Client folder'

/** The project a folder belongs to (the project folder itself or anything inside it), or null. */
export function projectOf(folder: string, projects: readonly Project[]): Project | null {
  const path = trimSlash(folder)
  let best: Project | null = null
  for (const p of projects) if (inside(p.path, path) && (best === null || p.path.length > best.path.length)) best = p
  return best
}

/** Where a client is: its folder, the watched folder it is under, and its agency folder's name or null. */
export interface ClientPlace {
  readonly root: string
  readonly clientPath: string
  readonly agency: string | null
}

/** A folder of a client (by its name on disk), or the client's own folder (null) when it has none inside. */
export function describeFolder(place: ClientPlace, folder: string | null): Project {
  const clientPath = trimSlash(place.clientPath)
  const client = (clientPath.split('/').pop() ?? clientPath).trim()
  const shared = { client, clientPath, agency: place.agency?.trim() || null, root: trimSlash(place.root) }
  if (folder === null) return { path: clientPath, name: client, title: CLIENT_FOLDER, kind: 'folder', ...shared }
  return { path: `${clientPath}/${folder}`, name: folder.trim(), title: videoTitle(folder), kind: isVideoName(folder) ? 'video' : 'folder', ...shared }
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

/** The client a folder belongs to (one of its folders, the client folder itself, or anything inside), or null. */
export function clientPathOf(folder: string, projects: readonly Project[]): string | null {
  return projectOf(folder, projects)?.clientPath ?? clientFolderOf(folder, projects)?.clientPath ?? null
}

/** "Client folder", or the folder inside it that is not listed (`_notes`). */
export const clientFolderTitle = (c: ClientFolder): string => c.sub ?? CLIENT_FOLDER

/** "Wren › Video 2", "Wren › Client folder", or "Other folders › …" for a folder outside every client. */
export function projectLabel(folder: string, projects: readonly Project[], roots: readonly string[]): string {
  const p = projectOf(folder, projects)
  if (p) return p.name === p.client ? p.client : `${p.client} › ${p.title}`
  const c = clientFolderOf(folder, projects)
  if (c) return `${c.client} › ${clientFolderTitle(c)}`
  const place = placeOf(folder, roots)
  return `${place.section} › ${place.label}`
}

/** The same in few words, for a session's row: "Wren" for the client's own folder, "Wren › Video 2" for a folder in it. */
export function whereLabel(folder: string, projects: readonly Project[], roots: readonly string[]): string {
  const p = projectOf(folder, projects)
  if (p) return p.path === p.clientPath ? p.client : `${p.client} › ${p.title}`
  const c = clientFolderOf(folder, projects)
  if (c) return c.sub ? `${c.client} › ${c.sub}` : c.client
  const place = placeOf(folder, roots)
  return place.root === null ? place.label : `${place.section} › ${place.label}`
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
    const group = entry.groups.get(key) ?? { project, name: project?.title ?? `${place.section} › ${place.label}`, startIn: project?.path ?? item.cwd, items: [] }
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

/** Every client with its folders (for the panel and the picker): videos first, in natural order, then the rest. */
export function clientsOf(projects: readonly Project[]): { key: string; client: string; agency: string | null; projects: Project[] }[] {
  const map = new Map<string, { key: string; client: string; agency: string | null; projects: Project[] }>()
  for (const p of projects) {
    const c = map.get(p.clientPath) ?? { key: p.clientPath, client: p.client, agency: p.agency, projects: [] }
    map.set(p.clientPath, c)
    c.projects.push(p)
  }
  return [...map.values()].sort((a, b) => natural(a.client, b.client) || natural(a.agency ?? '', b.agency ?? '')).map((c) => ({ ...c, projects: c.projects.sort(byVideoThenName) }))
}

/**
 * The next video folder for a client, named the way its highest numbered one is: `45` after `44`,
 * `Video 5` after `Video 4`, `Rio video 5` after `Rio video 4`; `1` for a client with none.
 */
export function nextVideoFolder(names: readonly string[]): string {
  let best: { readonly prefix: string; readonly n: number } | null = null
  for (const name of names) {
    const hit = videoNumber(name)
    if (hit && (best === null || hit.n > best.n)) best = hit
  }
  return best ? `${best.prefix}${best.n + 1}` : '1'
}

/** The agency folders that exist (from the projects found), for the New client dialog. */
export function agenciesOf(projects: readonly Project[]): { readonly name: string; readonly root: string }[] {
  const seen = new Map<string, { name: string; root: string }>()
  for (const p of projects) if (p.agency !== null) seen.set(`${p.root}/${p.agency}`, { name: p.agency, root: p.root })
  return [...seen.values()].sort((a, b) => natural(a.name, b.name))
}
