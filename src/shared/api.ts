// The window's bridge to the main process: channel names and `window.api`.

import type { HistoryEntry, LiveSession, Project, Result } from './types'

export const CH = {
  sessions: 'sessions:list',
  sessionsChanged: 'sessions:changed',
  data: 'sessions:data',
  snapshot: 'sessions:snapshot',
  create: 'sessions:create',
  input: 'sessions:input',
  resize: 'sessions:resize',
  close: 'sessions:close',
  rename: 'sessions:rename',
  selected: 'sessions:selected',
  focus: 'sessions:focus',
  history: 'history:list',
  pickFolder: 'folders:pick',
  reveal: 'folders:reveal',
  roots: 'roots:get',
  setRoots: 'roots:set',
  projects: 'projects:list',
  sessionFolder: 'settings:session-folder',
  setSessionFolder: 'settings:set-session-folder',
  hidden: 'clients:hidden',
  setHidden: 'clients:set-hidden',
  createClient: 'clients:create',
  createVideo: 'clients:create-video',
  menu: 'menu:command',
  onTop: 'window:on-top',
  setOnTop: 'window:set-on-top',
  onTopChanged: 'window:on-top-changed'
} as const

export type MenuCommand = 'new-session' | 'new-session-here' | 'close-session' | 'history' | 'settings' | 'stop-all'

export interface NewSession {
  readonly cwd: string
  /** A conversation to pick up again (`claude --resume`). */
  readonly resume?: string
  /** A name for it; null or left out lets Claude's title name it. */
  readonly name?: string | null
  /** An ended session this one replaces (Resume on it): the new one keeps its #n. */
  readonly replaces?: string
}

export interface Api {
  sessions(): Promise<LiveSession[]>
  onSessions(listener: (sessions: LiveSession[]) => void): () => void
  /** Terminal output; `end` counts every character the session ever wrote. */
  onData(listener: (id: string, data: string, end: number) => void): () => void
  /** The output kept for a session (its last part) and the count it ends at. */
  snapshot(id: string): Promise<{ data: string; end: number } | null>
  create(session: NewSession): Promise<Result<LiveSession>>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  /** Stops Claude if it runs and removes the session. */
  close(id: string): Promise<void>
  /** Names a conversation, live or past; null goes back to the automatic name. */
  rename(claudeId: string, name: string | null): Promise<void>
  /** The session you are looking at, so the app doesn't notify about it. */
  setSelected(id: string | null): void
  /** A notification was clicked: show this session. */
  onFocus(listener: (id: string) => void): () => void
  history(): Promise<HistoryEntry[]>
  pickFolder(): Promise<string | null>
  reveal(path: string): void
  roots(): Promise<string[]>
  setRoots(roots: readonly string[]): Promise<void>
  /** Every client project under the watched folders, looked up again. */
  projects(): Promise<Project[]>
  /** The folder inside each project where sessions run (`script`). */
  sessionFolder(): Promise<string>
  setSessionFolder(name: string): Promise<Result<null>>
  /** The folders hidden from the panel as not a project. */
  hidden(): Promise<string[]>
  setHidden(folder: string, hide: boolean): Promise<string[]>
  /** Makes a client folder (in an agency, or not) with its first video; answers the video's session folder. */
  createClient(request: { root: string; agency: string | null; client: string; video: string }): Promise<Result<string>>
  /** Makes a video folder in a client; answers its session folder. */
  createVideo(clientPath: string, name: string): Promise<Result<string>>
  onMenu(listener: (command: MenuCommand) => void): () => void
  /** Whether the window is pinned on top of every other window. */
  onTop(): Promise<boolean>
  setOnTop(on: boolean): Promise<boolean>
  /** Pinned or unpinned from elsewhere (the View menu). */
  onOnTopChanged(listener: (on: boolean) => void): () => void
  /** The path of a file pasted or dropped on the window ('' for one with none, like a screenshot). */
  pathForFile(file: File): string
}
