// What the main process and the window share.

/**
 * starting: Claude is launching. ready: waiting for your first prompt. working: Claude is on a turn.
 * needs-you: it finished its turn or asks for permission or input. ended: the process exited.
 */
export type SessionState = 'starting' | 'ready' | 'working' | 'needs-you' | 'ended'

/** Why a session needs you: its turn ended, or it asks something (a permission, a question). */
export type WaitKind = 'turn' | 'ask'

/** A session running in one of the app's terminals. */
export interface LiveSession {
  /** The app's own id for the terminal tab. */
  readonly id: string
  /** The folder Claude runs in. */
  readonly cwd: string
  /** Claude Code's conversation id (what `claude --resume` takes). */
  readonly claudeId: string
  /** #1, #2… among the sessions the app started in this folder, so two never look alike. */
  readonly seq: number
  /** The name you gave it; wins over every automatic one. */
  readonly name: string | null
  /** Claude Code's own title for the conversation (a /rename, else the one it makes up). */
  readonly title: string | null
  readonly firstPrompt: string | null
  readonly state: SessionState
  readonly wait: WaitKind | null
  /** What it says while it needs you ("Finished its turn", "Claude needs your permission to use Bash"). */
  readonly reason: string | null
  readonly startedAt: number
  readonly changedAt: number
  readonly exitCode: number | null
}

/** A past Claude Code conversation, read from its transcript. */
export interface HistoryEntry {
  readonly claudeId: string
  readonly cwd: string
  readonly name: string | null
  readonly title: string | null
  readonly firstPrompt: string | null
  /** Time of the last line, in ms. */
  readonly lastAt: number
}

/**
 * A folder of a client, as it is on disk: a video (`Video 3`, `41`) or any other folder (`Base`,
 * `References`). Its sessions run in the folder itself. A client with no folders inside is listed
 * as one of these too, for its own folder.
 */
export interface Project {
  /** The folder (`…/mesa/Wren/Video 2`), exactly as it is on disk. */
  readonly path: string
  /** The folder's name, trimmed (`Video 2`, `2`, `Base`). */
  readonly name: string
  /** What it is called on screen: `Video 2` for a numbered folder, else the folder name. */
  readonly title: string
  /** A folder named as a video (`Video 3`, `41`), or any other folder of the client. */
  readonly kind: 'video' | 'folder'
  /** The client: the folder it sits in (`Wren`), trimmed. */
  readonly client: string
  readonly clientPath: string
  /** The agency folder the client sits in (`mesa`), trimmed, or null. */
  readonly agency: string | null
  /** The watched folder it is under. */
  readonly root: string
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

/** What Claude Code hands a hook on stdin (only the fields the app reads). */
export interface HookInput {
  readonly hook_event_name?: string
  readonly session_id?: string
  readonly transcript_path?: string
  readonly cwd?: string
  readonly prompt?: string
  readonly message?: string
  readonly notification_type?: string
  readonly source?: string
}
