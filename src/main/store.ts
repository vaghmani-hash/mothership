// The app's two small files in its own folder: config.json (the watched folders, the session
// folder, folders hidden as not a project, whether the window stays on top) and names.json (the
// names you gave conversations, by Claude Code's session id). Written atomically. names.json is re-read on demand: the background host writes it too.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** The folder inside each project where its sessions run. */
export const DEFAULT_SESSION_FOLDER = 'script'

/** A plain folder name: no path, not hidden. */
export const isFolderName = (name: string): boolean => name.trim() !== '' && !/[/\\\0]/.test(name) && !name.startsWith('.')

export class Store {
  private roots: string[] = []
  private sessionFolder = DEFAULT_SESSION_FOLDER
  private hidden: string[] = []
  private onTop = false
  private names = new Map<string, string>()

  constructor(private readonly home: string) {}

  async load(): Promise<void> {
    await mkdir(this.home, { recursive: true })
    const config = (await readJson(join(this.home, 'config.json'))) as { roots?: unknown; sessionFolder?: unknown; hiddenFolders?: unknown; alwaysOnTop?: unknown } | null
    this.onTop = config?.alwaysOnTop === true
    if (Array.isArray(config?.hiddenFolders)) this.hidden = config.hiddenFolders.filter((h): h is string => typeof h === 'string')
    if (typeof config?.sessionFolder === 'string' && isFolderName(config.sessionFolder)) this.sessionFolder = config.sessionFolder.trim()
    if (Array.isArray(config?.roots)) this.roots = config.roots.filter((r): r is string => typeof r === 'string' && r !== '')
    // A fresh install watches nothing until you choose your clients' folder.
    else await this.saveConfig()
    await this.reloadNames()
  }

  /** Reads names.json again (another process may have written it). */
  async reloadNames(): Promise<void> {
    const names = (await readJson(join(this.home, 'names.json'))) as { names?: Record<string, unknown> } | null
    this.names = new Map(Object.entries(names?.names ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'))
  }

  /** The folders you hid from the panel as not a project. */
  getHidden(): string[] {
    return [...this.hidden]
  }

  async setHidden(folder: string, hide: boolean): Promise<void> {
    this.hidden = hide ? [...new Set([...this.hidden, folder])] : this.hidden.filter((h) => h !== folder)
    await this.saveConfig()
  }

  getRoots(): string[] {
    return [...this.roots]
  }

  async setRoots(roots: readonly string[]): Promise<void> {
    this.roots = [...new Set(roots.filter((r) => r.trim() !== ''))]
    await this.saveConfig()
  }

  getSessionFolder(): string {
    return this.sessionFolder
  }

  async setSessionFolder(name: string): Promise<void> {
    if (!isFolderName(name)) throw new Error(`"${name}" isn't a folder name.`)
    this.sessionFolder = name.trim()
    await this.saveConfig()
  }

  /** Whether the window stays on top of every other window. */
  getOnTop(): boolean {
    return this.onTop
  }

  async setOnTop(on: boolean): Promise<void> {
    this.onTop = on
    await this.saveConfig()
  }

  nameOf(claudeId: string): string | null {
    return this.names.get(claudeId) ?? null
  }

  async setName(claudeId: string, name: string | null): Promise<void> {
    await this.reloadNames()
    if (name === null) this.names.delete(claudeId)
    else this.names.set(claudeId, name)
    await writeJson(join(this.home, 'names.json'), { names: Object.fromEntries(this.names) })
  }

  private saveConfig(): Promise<void> {
    return writeJson(join(this.home, 'config.json'), { roots: this.roots, sessionFolder: this.sessionFolder, hiddenFolders: this.hidden, alwaysOnTop: this.onTop })
  }
}
