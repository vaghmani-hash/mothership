// New clients and new videos, made as folders the way the editor lays them out:
// <watched folder>/[agency/]<client>/<video>/<session folder>. Only at the editor's click; nothing
// that exists is ever changed, and a name already there is refused.

import { mkdir, stat } from 'node:fs/promises'
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

/** Makes the client (and its agency, if new) with its first video; returns the video's session folder. */
export async function createClient(roots: readonly string[], sessionFolder: string, request: NewClient): Promise<string> {
  if (!roots.includes(request.root)) throw new Error('That is not one of your watched folders.')
  if (!(await exists(request.root))) throw new Error(`${request.root} isn't there. Is its drive connected?`)
  const agency = request.agency === null || request.agency.trim() === '' ? null : checkName(request.agency, 'agency')
  const client = checkName(request.client, 'client')
  const video = checkName(request.video, 'video')
  const clientPath = agency ? join(request.root, agency, client) : join(request.root, client)
  if (await exists(clientPath)) throw new Error(`There is already a folder “${client}”${agency ? ` in ${agency}` : ''}. Add a video to it instead.`)
  const sessionDir = join(clientPath, video, sessionFolder)
  await mkdir(sessionDir, { recursive: true })
  return sessionDir
}

/** Makes a video in a client folder that exists; returns its session folder. */
export async function createVideo(clientPath: string, sessionFolder: string, name: string): Promise<string> {
  if (!(await exists(clientPath))) throw new Error(`${clientPath} isn't there. Is its drive connected?`)
  const video = checkName(name, 'video')
  if (await exists(join(clientPath, video))) throw new Error(`This client already has a folder “${video}”.`)
  const sessionDir = join(clientPath, video, sessionFolder)
  await mkdir(sessionDir, { recursive: true })
  return sessionDir
}
