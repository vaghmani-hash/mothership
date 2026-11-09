// Drives the built app on scratch folders laid out like the editor's (agency/client/video/script),
// with test/stub-claude.sh standing in for claude. The left panel is one tree: a block per client,
// and in it each video with its open sessions, its past ones (Resume) and + New. Checks: starting a
// named session in a video's script folder, a second one in the same video, automatic names and
// renaming (the ✎, the header's Rename, a past session), needs-you states, hiding a client, New
// client and New video, the picker, History, Resume from the tree and from an ended session, Close,
// and sessions that keep running after the app quits and come back when it reopens. It never reads your own client
// folders, Claude settings or transcripts.

import electronPath from 'electron'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const project = join(import.meta.dirname, '../..')
const shots = join(project, '.e2e-tmp')
const scratch = await mkdtemp(join(tmpdir(), 'cs-e2e-'))
const root = join(scratch, 'Clients')
const home = join(scratch, 'home')
const claudeDir = join(scratch, 'claude')
const wren2 = join(root, 'mesa', 'Wren', '2', 'script')
const jules1 = join(root, 'Jules', '1', 'script')
for (const dir of [wren2, join(root, 'mesa', 'Wren', '10', 'script'), jules1, join(root, 'mesa', 'styles', 'wren'), home, shots]) await mkdir(dir, { recursive: true })
await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [root], sessionFolder: 'script' }))
// One past conversation in Jules › Video 1, as Claude Code writes it.
const pastId = '0e5c2f8a-4b1d-4c3e-9f00-1234567890ab'
await mkdir(join(claudeDir, 'projects', '-Clients-Jules-1-script'), { recursive: true })
await writeFile(
  join(claudeDir, 'projects', '-Clients-Jules-1-script', `${pastId}.jsonl`),
  [
    JSON.stringify({ type: 'user', cwd: jules1, entrypoint: 'cli', message: { role: 'user', content: 'Cut the hype video to the beat' }, timestamp: new Date(Date.now() - 3600_000).toISOString() }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Hype video beat cut', sessionId: pastId })
  ].join('\n') + '\n'
)

const failures = []
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`)
  if (!ok) failures.push(message)
}

const launch = async () => {
  const launched = await electron.launch({
    executablePath: electronPath,
    args: [project],
    env: {
      ...process.env,
      CLIENT_SESSIONS_HOME: home,
      CLIENT_SESSIONS_CLAUDE_DIR: claudeDir,
      CLIENT_SESSIONS_CLAUDE: join(project, 'test', 'stub-claude.sh'),
      CLIENT_SESSIONS_SHELL: '/bin/sh',
      CLIENT_SESSIONS_E2E: '1'
    }
  })
  const page = await launched.firstWindow()
  page.on('dialog', (d) => void d.accept())
  await page.setViewportSize({ width: 1400, height: 880 })
  return { launched, page }
}
let { launched: app, page: win } = await launch()
// The background host outlives the app: the test stops it at the end.
const hostPid = async () => Number((await readFile(join(home, 'host.pid'), 'utf8').catch(() => '0')).trim())
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sidebarOf = () => win.getByRole('navigation', { name: 'Clients and sessions' })
const sidebar = new Proxy({}, { get: (_t, key) => { const s = sidebarOf(); const v = s[key]; return typeof v === 'function' ? v.bind(s) : v } })
const video = (label) => sidebar.getByRole('group', { name: label, exact: true })
const live = (label, name) => video(label).locator('.session-row', { hasText: name })
const past = (label, name) => video(label).getByRole('group', { name, exact: true })
// The terminal wraps long lines (a conversation id), so its rows are read as one text.
const terminalText = async () => (await win.locator('.terminal-box .xterm-rows').innerText()).replace(/\n/g, '')
const typeInTerminal = async (text) => {
  await win.locator('.terminal-box').click()
  await win.keyboard.type(text)
  await win.keyboard.press('Enter')
}
const until = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms
  for (;;) {
    if (await fn().catch(() => false)) return true
    if (Date.now() > end) throw new Error(`timed out: ${what}`)
    await win.waitForTimeout(100)
  }
}
const stateOf = async (label, name) => (await live(label, name).getAttribute('aria-label')) ?? ''
const typeName = async (name) => {
  await win.getByLabel('Session name').fill(name)
  await win.getByLabel('Session name').press('Enter')
}
const dialog = win.getByRole('dialog', { name: 'New session' })

try {
  // The tree: a block per client (agency beside it), every video in it, past sessions under their video.
  await win.getByRole('main', { name: 'Start' }).waitFor({ timeout: 10_000 })
  check((await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource === 'dark' && nativeTheme.shouldUseDarkColors)) === true, 'the app opens dark')
  const will = sidebar.getByRole('region', { name: 'Wren (mesa)' })
  await will.waitFor()
  check(true, 'Wren is a client, with its agency (mesa) beside it')
  check((await will.locator('.video').count()) === 0 && (await will.innerText()).includes('2 videos'), 'clients start folded, saying how many videos they have')
  await sidebar.getByRole('button', { name: 'Wren (mesa)', exact: true }).click()
  check((await will.locator(':scope > .video').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(',') === 'Wren › Video 2,Wren › Video 10', 'its name is a dropdown: it unfolds to all its videos, "Video 2", "Video 10", in order')
  await sidebar.getByRole('button', { name: 'Jules', exact: true }).click()
  check((await sidebar.getByRole('region', { name: /styles/ }).count()) === 0, 'folders without a script folder are not videos')
  check((await past('Jules › Video 1', 'Hype video beat cut').innerText()).includes('ago'), "Jules's past session sits under its own video, Jules › Video 1")
  check((await past('Jules › Video 1', 'Hype video beat cut').getByRole('button', { name: 'Resume' }).count()) === 1, 'with a Resume button right there')
  await sidebar.getByLabel('Find a client or project').fill('jul')
  check((await sidebar.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(',') === 'Jules', 'the search narrows the tree to Jules')
  await sidebar.getByLabel('Find a client or project').fill('beat cut')
  check((await video('Jules › Video 1').count()) === 1 && (await video('Wren › Video 2').count()) === 0, 'and finds a video by a past session in it')
  await sidebar.getByLabel('Find a client or project').fill('')
  await win.screenshot({ path: join(shots, 'tree.png') })

  // + New on Wren › Video 2: the video is chosen and Claude runs in its script folder.
  await sidebar.getByRole('button', { name: 'New session in Wren › Video 2' }).click()
  await dialog.waitFor()
  check((await dialog.locator('.chosen').innerText()).includes('Wren › Video 2'), 'the dialog has Wren › Video 2 chosen')
  check((await dialog.locator('.runs-in').innerText()).includes('Video 2 › script'), 'and says it runs in its script folder')
  await dialog.getByPlaceholder(/Automatic/).fill('Intro animations')
  await dialog.getByRole('button', { name: 'Start Claude' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => (await terminalText()).includes('named Intro animations'), 'the stub says it was named')
  check((await terminalText()).includes(`stub claude in ${wren2}`), 'Claude starts in mesa/Wren/2/script, with the name passed on')
  await until(async () => (await stateOf('Wren › Video 2', 'Intro animations')).includes('Ready'), 'ready')
  check(true, 'Intro animations sits under Wren › Video 2, Ready')
  check((await win.locator('.session-where').innerText()).toLowerCase() === 'wren › video 2', 'the session header says WREN › VIDEO 2 above its name')
  check((await video('Wren › Video 2').innerText()).includes('1 open'), 'the video says how many are open')

  await typeInTerminal('hello')
  await until(async () => (await stateOf('Wren › Video 2', 'Intro animations')).includes('Needs you'), 'needs you')
  check((await live('Wren › Video 2', 'Intro animations').innerText()).includes('Needs you: Finished its turn'), 'after its turn it says Needs you, and why')

  // A second session in the same video: "New session 2" until its first prompt names it.
  await win.getByRole('button', { name: '+ New session in this video' }).click()
  await dialog.waitFor()
  check((await dialog.locator('.hint').innerText()).includes('1 already open in this video: Intro animations'), 'the dialog says what is already open in this video')
  await dialog.getByRole('button', { name: 'Start Claude' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => (await stateOf('Wren › Video 2', 'New session 2')).includes('Ready'), 'second ready')
  check(true, 'the second one reads "New session 2", not a number that clashes with the video')
  await typeInTerminal('fix the music under scene 4')
  await until(async () => (await live('Wren › Video 2', 'fix the music under scene 4').count()) === 1, 'named from its prompt')
  check(true, 'it is named automatically from its first prompt')

  // Renaming: the ✎ on its row, the header's Rename, and empty goes back to automatic.
  await live('Wren › Video 2', 'fix the music under scene 4').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Music fix')
  await until(async () => (await live('Wren › Video 2', 'Music fix').count()) === 1, 'renamed from the row')
  check(true, 'the ✎ on a session row renames it')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Music fix scene 4')
  await until(async () => (await live('Wren › Video 2', 'Music fix scene 4').count()) === 1, 'renamed from the header')
  check((await win.locator('.session-head .name-text').innerText()) === 'Music fix scene 4', 'the Rename button in the session header renames it too')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('')
  await until(async () => (await live('Wren › Video 2', 'fix the music under scene 4').count()) === 1, 'automatic again')
  check(true, 'an empty name goes back to the automatic one')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Music fix scene 4')
  await until(async () => (await live('Wren › Video 2', 'Music fix scene 4').count()) === 1, 'renamed again')
  const names = JSON.parse(await readFile(join(home, 'names.json'), 'utf8')).names
  check(Object.values(names).includes('Music fix scene 4') && Object.values(names).includes('Intro animations'), 'names are kept in names.json')
  check((await video('Wren › Video 2').innerText()).includes('2 open'), 'Wren › Video 2 now has both sessions, in one place')

  // A permission question needs you; answering puts it back to work.
  await typeInTerminal('ask to run the render')
  await until(async () => (await live('Wren › Video 2', 'Music fix scene 4').innerText()).includes('needs your permission'), 'asks')
  check(true, 'a permission question shows as Needs you with its question')
  await win.screenshot({ path: join(shots, 'sessions.png') })
  await win.keyboard.type('1')
  await until(async () => (await stateOf('Wren › Video 2', 'Music fix scene 4')).includes('Working'), 'working again')
  check(true, 'answering it puts Claude back to work')

  // Choose folders, at the bottom of the panel: tick what shows in the list, untick what doesn't.
  const hiddenFolders = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8')).hiddenFolders ?? []
  check((await sidebar.getByRole('button', { name: /^Hide / }).count()) === 0, 'no Hide buttons clutter the list')
  await sidebar.getByRole('button', { name: /^Choose folders/ }).click()
  const choose = sidebar.getByRole('region', { name: 'Choose folders' })
  await choose.waitFor()
  check((await choose.getByRole('checkbox').count()) === 6, 'Choose folders, below the list, ticks every agency, client and video (mesa, Wren, Video 2, Video 10, Jules, Video 1)')
  await win.screenshot({ path: join(shots, 'choose.png') })
  await choose.getByLabel('Show Wren › Video 10', { exact: true }).uncheck()
  await video('Wren › Video 10').waitFor({ state: 'detached', timeout: 5000 })
  check((await video('Wren › Video 2').count()) === 1, 'unticking a video takes just it out of the list, at once')
  await choose.getByLabel('Show Jules', { exact: true }).uncheck()
  await sidebar.getByRole('region', { name: 'Jules', exact: true }).waitFor({ state: 'detached', timeout: 5000 })
  check((await hiddenFolders()).length === 2, 'unticking a client takes the whole client folder out; both kept in config.json')
  check((await sidebar.getByRole('button', { name: 'Choose folders (2 hidden)' }).count()) === 1, 'the button says how many are hidden')
  await choose.getByLabel('Show mesa', { exact: true }).uncheck()
  await until(async () => (await sidebar.getByRole('region', { name: 'Wren (mesa)' }).locator('.hidden-tag').count()) === 1, 'Wren marked hidden')
  check((await live('Wren › Video 2', 'Intro animations').count()) === 1, 'unticking the whole mesa agency keeps Wren while its sessions run, marked hidden')
  await choose.getByRole('button', { name: 'Tick all' }).click()
  await sidebar.getByRole('region', { name: 'Jules', exact: true }).waitFor({ timeout: 5000 })
  check((await hiddenFolders()).length === 0 && (await video('Wren › Video 10').count()) === 1, 'Tick all shows everything again')
  await choose.getByRole('button', { name: 'Done' }).click()
  await choose.waitFor({ state: 'detached' })

  // A session in the client folder itself (where the client's own files are), above its videos.
  await sidebar.getByRole('button', { name: 'New session in the Wren client folder', exact: true }).click()
  await dialog.waitFor()
  check((await dialog.locator('.chosen').innerText()).includes('Wren › Client folder'), '+ Session on a client starts in the client folder: Wren › Client folder')
  await dialog.getByPlaceholder(/Automatic/).fill('Base files')
  await dialog.getByRole('button', { name: 'Start Claude' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => (await terminalText()).includes(`stub claude in ${join(root, 'mesa', 'Wren')} session`), 'client folder session')
  check(true, 'Claude runs in mesa/Wren itself')
  await until(async () => (await live('Wren › Client folder', 'Base files').count()) === 1, 'listed under the client')
  check((await sidebar.getByRole('region', { name: 'Wren (mesa)' }).locator(':scope > .video').first().getAttribute('aria-label')) === 'Wren › Client folder', 'it is listed under Wren, as Client folder, above the videos')
  check((await win.locator('.session-where').innerText()).toLowerCase() === 'wren › client folder', 'the header says WREN › CLIENT FOLDER')
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await live('Wren › Client folder', 'Base files').waitFor({ state: 'detached', timeout: 5000 })
  await live('Wren › Video 2', 'Music fix scene 4').click()
  // A client folds away, saying what runs inside; unfolded again for the rest.
  await sidebar.getByRole('button', { name: 'Wren (mesa)', exact: true }).click()
  check((await video('Wren › Video 2').count()) === 0 && (await will.locator('.client-toggle').innerText()).includes('2 open'), 'folding a client hides its videos but says 2 open')
  await sidebar.getByRole('button', { name: 'Wren (mesa)', exact: true }).click()

  // A new client, in an agency, with its first video; then Claude can start there at once.
  await sidebar.getByRole('button', { name: '+ New client' }).click()
  const newClient = win.getByRole('dialog', { name: 'New client' })
  await newClient.waitFor()
  await newClient.getByPlaceholder(/Their name/).fill('Cora')
  check((await newClient.getByLabel('Agency').inputValue()) === 'mesa', 'New client offers the agencies there are (mesa)')
  check((await newClient.locator('.hint').innerText()).includes('Cora › Video 1') && (await newClient.locator('.hint').innerText()).includes('mesa/Cora/1/script'), 'and shows where it goes: mesa/Cora/1/script, as Cora › Video 1')
  await newClient.getByRole('button', { name: 'Create client' }).click()
  await dialog.waitFor({ timeout: 5000 })
  check((await stat(join(root, 'mesa', 'Cora', '1', 'script'))).isDirectory(), 'Create client makes the folders')
  check((await dialog.locator('.chosen').innerText()).includes('Cora › Video 1'), 'and opens New session in it')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  check((await sidebar.getByRole('region', { name: 'Cora (mesa)' }).count()) === 1, 'the new client is in the panel')

  // A new video for a client: the next number.
  await sidebar.getByRole('button', { name: 'New video for Wren', exact: true }).click()
  const newVideo = win.getByRole('dialog', { name: 'New video for Wren' })
  await newVideo.waitFor()
  check((await newVideo.getByLabel('Video folder').inputValue()) === '11', '+ Video suggests the next number (11 after 2 and 10)')
  await newVideo.getByRole('button', { name: 'Create video' }).click()
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  check((await stat(join(root, 'mesa', 'Wren', '11', 'script'))).isDirectory() && (await video('Wren › Video 11').count()) === 1, 'and makes Wren › Video 11, in the panel')

  // The picker: videos by client, searchable.
  await sidebar.getByRole('button', { name: '+ New session' }).click()
  await dialog.waitFor()
  await dialog.getByLabel('Find a project').fill('wren 10')
  check((await dialog.getByRole('option').allInnerTexts()).join(',') === 'Client folder,Video 10', 'the picker finds Wren › Video 10 by client and video (beside Wren’s own folder)')
  await dialog.getByRole('option', { name: 'Video 10' }).click()
  check((await dialog.locator('.chosen').innerText()).includes('Wren › Video 10'), 'and picks it')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // A past session can be renamed right in the tree.
  await past('Jules › Video 1', 'Hype video beat cut').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Hype cut v1')
  await past('Jules › Video 1', 'Hype cut v1').waitFor({ timeout: 5000 })
  check(true, 'a past session is renamed in the tree too')

  // History: by client, search.
  await sidebar.getByRole('button', { name: 'All history', exact: true }).click()
  const historyRow = win.getByRole('main', { name: 'History' }).getByRole('group', { name: 'Hype cut v1' })
  await historyRow.waitFor({ timeout: 8000 })
  check((await historyRow.innerText()).includes('Jules › Video 1'), 'History shows it under Jules › Video 1, with its new name')
  check((await historyRow.innerText()).includes('Cut the hype video to the beat'), 'and its first prompt')
  check((await win.getByLabel('Client').locator('option').allInnerTexts()).includes('Jules'), 'and can filter by client')
  await win.getByLabel('Search history').fill('nothing like this')
  check((await win.getByText('Nothing matches.').count()) === 1, 'and says when nothing matches')
  await win.getByLabel('Search history').fill('')

  // Resume from the tree: the past session under Jules › Video 1 becomes an open one there.
  await past('Jules › Video 1', 'Hype cut v1').getByRole('button', { name: 'Resume' }).click()
  await until(async () => (await terminalText()).includes(`session ${pastId} (resumed)`), 'resumed')
  check((await terminalText()).includes(`stub claude in ${jules1}`), 'Resume in the tree continues the conversation in its own folder')
  await until(async () => (await win.locator('.session-head .name-text').innerText()) === 'Hype cut v1', 'resumed name')
  check(true, 'with its name at once')
  check((await live('Jules › Video 1', 'Hype cut v1').count()) === 1 && (await past('Jules › Video 1', 'Hype cut v1').count()) === 0, 'it moves from past to open, in the same video')

  // A session that ends offers Resume on its row; Close moves it back to past.
  await typeInTerminal('exit')
  await live('Jules › Video 1', 'Hype cut v1').getByRole('button', { name: 'Resume', exact: true }).waitFor({ timeout: 8000 })
  check((await win.getByRole('button', { name: 'Resume conversation' }).count()) === 1, 'when Claude ends, the header and its row offer Resume')
  await live('Jules › Video 1', 'Hype cut v1').getByRole('button', { name: 'Resume', exact: true }).click()
  await until(async () => (await stateOf('Jules › Video 1', 'Hype cut v1')).includes('Ready'), 'resumed again')
  check((await video('Jules › Video 1').locator('.session-row').count()) === 1, 'resuming it replaces the ended session')
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await past('Jules › Video 1', 'Hype cut v1').waitFor({ timeout: 5000 })
  check((await video('Jules › Video 1').locator('.session-row').count()) === 0, 'Close removes the session; the conversation is back under its video with Resume')
  await win.screenshot({ path: join(shots, 'after.png') })

  // Quit the app with sessions running: they keep running, and come back when it opens again.
  const before = (await live('Wren › Video 2', 'Intro animations').count()) + (await live('Wren › Video 2', 'Music fix scene 4').count())
  check(before === 2, 'two sessions run in Wren › Video 2 before quitting')
  await app.close()
  const pid = await hostPid()
  check(pid > 0 && alive(pid), 'after quitting, the background host still runs')
  await new Promise((r) => setTimeout(r, 500))
  ;({ launched: app, page: win } = await launch())
  await video('Wren › Video 2').waitFor({ timeout: 10_000 })
  await until(async () => (await live('Wren › Video 2', 'Intro animations').count()) === 1 && (await live('Wren › Video 2', 'Music fix scene 4').count()) === 1, 'sessions back')
  check(true, 'reopened, both sessions are still there, under Wren › Video 2')
  await live('Wren › Video 2', 'Intro animations').click()
  await until(async () => (await terminalText()).includes('you said: hello'), 'old output')
  check(true, 'with their earlier output')
  await typeInTerminal('still here')
  await until(async () => (await terminalText()).includes('you said: still here'), 'answer after reopening')
  check(true, 'and Claude still answers: the session never stopped')
} catch (err) {
  check(false, String(err))
  await win.screenshot({ path: join(shots, 'failure.png') }).catch(() => undefined)
} finally {
  await app.close().catch(() => undefined)
  // Stop the background host (and with it the sessions) the test left running.
  const pid = await hostPid()
  if (pid > 0 && alive(pid)) process.kill(pid, 'SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
  await rm(scratch, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nall checks passed; screenshots in ${shots}`)
