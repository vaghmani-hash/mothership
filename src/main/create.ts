// New clients and new videos, made as folders the way the editor lays them out:
// <watched folder>/[agency/]<client>/<video>. Only at the editor's click; nothing that exists is
// ever changed, and a name already there is refused.

import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isFolderName } from './store'

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

function checkName(name: string, what: string): string {
  const clean = name.trim()
  if (!isFolderName(clean)) throw new Error(`“${name}” isn't a name a folder can have (${what}).`)
  return clean
}

export interface NewClient {
  /** One of the watched folders. */
  readonly root: string
  /** An agency folder under the root (existing or new), or null for none. */
  readonly agency: string | null
  readonly client: string
  /** The first video's folder name (`1`). */
  readonly video: string
}

/** What is in `dir` that reads as this name (`Kite Media ` on disk for `Kite Media`), or null. */
async function reading(dir: string, name: string): Promise<string | null> {
  const names = await readdir(dir).catch(() => [] as string[])
  return names.find((n) => n === name) ?? names.find((n) => n.trim() === name) ?? null
}

/** Makes the client (and its agency, if new) with its first video; returns the video's folder. */
export async function createClient(roots: readonly string[], request: NewClient): Promise<string> {
  if (!roots.includes(request.root)) throw new Error('That is not one of your watched folders.')
  if (!(await exists(request.root))) throw new Error(`${request.root} isn't there. Is its drive connected?`)
  // An agency that is there is used as it is on disk; a new one is made as typed.
  const typed = request.agency === null || request.agency.trim() === '' ? null : checkName(request.agency, 'agency')
  const agency = typed === null ? null : ((await reading(request.root, typed)) ?? typed)
  const client = checkName(request.client, 'client')
  const video = checkName(request.video, 'video')
  const parent = agency ? join(request.root, agency) : request.root
  const clientPath = join(parent, client)
  if ((await reading(parent, client)) !== null) throw new Error(`There is already a folder “${client}”${agency ? ` in ${agency.trim()}` : ''}. Add a video to it instead.`)
  const videoPath = join(clientPath, video)
  await mkdir(videoPath, { recursive: true })
  return videoPath
}

/** Makes a video in a client folder that exists; returns its folder. */
export async function createVideo(clientPath: string, name: string): Promise<string> {
  if (!(await exists(clientPath))) throw new Error(`${clientPath} isn't there. Is its drive connected?`)
  const video = checkName(name, 'video')
  const videoPath = join(clientPath, video)
  if ((await reading(clientPath, video)) !== null) throw new Error(`This client already has a folder “${video}”.`)
  await mkdir(videoPath)
  return videoPath
}
