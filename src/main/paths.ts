import { homedir } from 'node:os'
import { join } from 'node:path'

const support = join(homedir(), 'Library', 'Application Support')

/** The app's own files: `~/Library/Application Support/Mothership`, or CLIENT_SESSIONS_HOME (tests). */
export function appHome(): string {
  const override = process.env['CLIENT_SESSIONS_HOME']
  if (override) return override
  return join(support, 'Mothership')
}

/** Claude Code's transcripts: `<config dir>/projects`. Only ever read. */
export function transcriptsDir(): string {
  const dir = process.env['CLIENT_SESSIONS_CLAUDE_DIR'] ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
  return join(dir, 'projects')
}
