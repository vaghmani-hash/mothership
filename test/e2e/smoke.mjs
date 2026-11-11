// Drives the built app on scratch folders laid out like the editor's (agency/client/video, a Base
// folder in the client), with test/stub-claude.sh standing in for claude. The left panel is one
// panel: the open sessions on top (always in sight), then the clients, one line each; a client
// opens to its past sessions (Resume) and, folded away, its folders. Checks: folders listed by
// themselves (also ones made while the app is open), + starting Claude at once in a folder or a
// client, a second session in the same video, the keys that switch sessions, automatic names and
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
const wren2 = join(root, 'mesa', 'Wren', '2')
const jules1 = join(root, 'Jules', '1')
// Wren keeps the client's own files in Base and its script documents in a script folder; New Guy has nothing yet.
for (const dir of [join(wren2, 'script'), join(root, 'mesa', 'Wren', '10'), join(root, 'mesa', 'Wren', 'Base'), jules1, join(root, 'mesa', 'New Guy'), home, shots]) await mkdir(dir, { recursive: true })
await writeFile(join(home, 'config.json'), JSON.stringify({ roots: [root] }))
// One past conversation in Jules › Video 1, as Claude Code writes it.
const pastId = '0e5c2f8a-4b1d-4c3e-9f00-1234567890ab'
await mkdir(join(claudeDir, 'projects', '-Clients-Jules-1'), { recursive: true })
await writeFile(
  join(claudeDir, 'projects', '-Clients-Jules-1', `${pastId}.jsonl`),
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
// The open sessions, at the top of the panel; a row is found by its name and where it runs.
const openZone = () => sidebar.getByRole('region', { name: 'Open sessions' })
const live = (where, name) => openZone().locator('.session-row', { hasText: name }).filter({ hasText: where })
// A client's block, the button that opens it, a past session in it, and one of its folders.
const client = (label) => sidebar.getByRole('region', { name: label, exact: true })
const toggle = (label) => sidebar.getByRole('button', { name: label, exact: true })
const past = (label, name) => client(label).getByRole('group', { name, exact: true })
const folder = (label) => sidebar.getByRole('group', { name: label, exact: true })
const folderLabels = (label) => client(label).locator('.folder-row').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).join(','))
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
const stateOf = async (where, name) => (await live(where, name).getAttribute('aria-label')) ?? ''
const typeName = async (name) => {
  await win.getByLabel('Session name').fill(name)
  await win.getByLabel('Session name').press('Enter')
}
const headName = () => win.locator('.session-head .name-text').innerText()
// A menu command, as its key would send it (⌃Tab, ⌘1, ⌘J).
const menu = (command) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0]?.webContents.send('menu:command', c), command)
const dialog = win.getByRole('dialog', { name: 'New session' })

try {
  // The panel: the open sessions on top, then the clients under their agency, one line each, folded.
  await win.getByRole('main', { name: 'Start' }).waitFor({ timeout: 10_000 })
  check((await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource === 'dark' && nativeTheme.shouldUseDarkColors)) === true, 'the app opens dark')
  await client('Wren (mesa)').waitFor()
  check((await openZone().innerText()).includes('Nothing open'), 'with nothing open, the top of the panel says how to start')
  check((await sidebar.getByRole('group', { name: 'mesa', exact: true }).locator('.client-name').allInnerTexts()).join(',') === 'New Guy,Wren', 'clients sit under their agency (mesa): New Guy (nothing in it yet) and Wren')
  check((await sidebar.locator('.client.is-open').count()) === 0 && (await sidebar.locator('.folder-row').count()) === 0, 'clients start folded, one line each: no video folders in sight')
  await win.screenshot({ path: join(shots, 'folded.png') })
  await toggle('Wren (mesa)').click()
  check((await client('Wren (mesa)').innerText()).includes('No past sessions here yet') && (await sidebar.locator('.folder-row').count()) === 0, 'opening a client shows its past sessions; its folders stay folded away')
  await client('Wren (mesa)').getByRole('button', { name: /^Folders/ }).click()
  check((await folderLabels('Wren (mesa)')) === 'Wren › Video 2,Wren › Video 10,Wren › Base', 'Folders unfolds to every folder in it: the videos in order ("Video 2", "Video 10"), then Base')
  await toggle('Jules').click()
  check((await past('Jules', 'Hype video beat cut').innerText()).includes('in Video 1'), "Jules's past session sits under Jules, saying it ran in Video 1")
  check((await past('Jules', 'Hype video beat cut').getByRole('button', { name: 'Resume' }).count()) === 1, 'with a Resume button right there')
  // A folder made while the app is open (in Finder, or by Claude) shows up by itself.
  await client('Jules').getByRole('button', { name: /^Folders/ }).click()
  await mkdir(join(root, 'Jules', 'Video 2'))
  await folder('Jules › Video 2').waitFor({ timeout: 10_000 })
  check(true, 'a folder made while the app is open shows up by itself: Jules › Video 2')
  const find = sidebar.getByLabel('Find a client or session')
  await find.fill('jul')
  check((await sidebar.locator('.client').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(',') === 'Jules', 'the search narrows the clients to Jules')
  await find.fill('beat cut')
  check((await past('Jules', 'Hype video beat cut').count()) === 1 && (await client('Wren (mesa)').count()) === 0, 'and finds a client by a past session in it')
  // A client the search holds open stays as you left it: clicking it now folds nothing, then or later.
  await toggle('Jules').click()
  check((await past('Jules', 'Hype video beat cut').count()) === 1, 'a client held open by the search stays open when clicked')
  await find.fill('video 10')
  check((await folder('Wren › Video 10').count()) === 1 && (await client('Jules').count()) === 0, 'or by one of its folders')
  await find.fill('')
  check((await past('Jules', 'Hype video beat cut').count()) === 1, 'and is still open, as you left it, once the search is cleared')
  await win.screenshot({ path: join(shots, 'tree.png') })

  // + on a folder: Claude starts in it at once, with no dialog, named later.
  await sidebar.getByRole('button', { name: 'New session in Wren › Video 2' }).click()
  await until(async () => (await terminalText()).includes(`stub claude in ${wren2}`), 'the stub starts in the video folder')
  check((await dialog.count()) === 0, '+ on a folder starts Claude there at once, in the folder itself (mesa/Wren/2), with no dialog')
  await until(async () => (await stateOf('Wren › Video 2', 'New session')).includes('Ready'), 'ready')
  check(true, 'it shows at the top, under Open sessions, saying where it runs (Wren › Video 2) and Ready')
  await live('Wren › Video 2', 'New session').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Intro animations')
  await until(async () => (await live('Wren › Video 2', 'Intro animations').count()) === 1, 'renamed from its row')
  check((await win.locator('.session-where').innerText()).toLowerCase() === 'wren › video 2', 'the session header says WREN › VIDEO 2 above its name')
  check((await client('Wren (mesa)').locator('.client-dots .state-dot').count()) === 1, "the client's line shows a dot for its open session")

  await typeInTerminal('hello')
  await until(async () => (await stateOf('Wren › Video 2', 'Intro animations')).includes('Needs you'), 'needs you')
  check((await live('Wren › Video 2', 'Intro animations').innerText()).includes('Finished its turn'), 'after its turn its row says Needs you, and why')
  check((await openZone().getByRole('button', { name: '1 needs you' }).count()) === 1, 'and the heading says 1 needs you')

  // A second session in the same video, from the header: "New session 2" until its first prompt names it.
  await win.getByRole('button', { name: '+ New session in this video' }).click()
  await dialog.waitFor()
  check((await dialog.locator('.chosen').innerText()).includes('Wren › Video 2'), 'the dialog has Wren › Video 2 chosen')
  check((await dialog.locator('.runs-in').innerText()).trim() === `Runs in ${wren2}`, 'and says it runs in the video folder itself, not the script folder inside it')
  check((await dialog.locator('.hint').innerText()).includes('1 already open in this video: Intro animations'), 'and what is already open in this video')
  await dialog.getByRole('button', { name: 'Start Claude' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => (await stateOf('Wren › Video 2', 'New session 2')).includes('Ready'), 'second ready')
  check(true, 'the second one reads "New session 2", not a number that clashes with the video')
  // "1 needs you" is a button: it shows the one that needs you.
  await openZone().getByRole('button', { name: '1 needs you' }).click()
  await until(async () => (await headName()) === 'Intro animations', 'jumped to the one that needs you')
  check(true, 'pressing "1 needs you" shows the session that needs you')
  await live('Wren › Video 2', 'New session 2').click()
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
  check((await headName()) === 'Music fix scene 4', 'the Rename button in the session header renames it too')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('')
  await until(async () => (await live('Wren › Video 2', 'fix the music under scene 4').count()) === 1, 'automatic again')
  check(true, 'an empty name goes back to the automatic one')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Music fix scene 4')
  await until(async () => (await live('Wren › Video 2', 'Music fix scene 4').count()) === 1, 'renamed again')
  const names = JSON.parse(await readFile(join(home, 'names.json'), 'utf8')).names
  check(Object.values(names).includes('Music fix scene 4') && Object.values(names).includes('Intro animations'), 'names are kept in names.json')
  check((await openZone().locator('.session-row').count()) === 2 && (await openZone().locator('.zone-count').innerText()) === '2', 'both sessions are listed at the top, in the order they were started')

  // A permission question needs you; answering puts it back to work.
  await typeInTerminal('ask to run the render')
  await until(async () => (await live('Wren › Video 2', 'Music fix scene 4').innerText()).includes('needs your permission'), 'asks')
  check((await openZone().getByRole('button', { name: '2 need you' }).count()) === 1, 'a permission question shows as Needs you with its question, and the heading counts both')
  await win.screenshot({ path: join(shots, 'sessions.png') })
  await win.keyboard.type('1')
  await until(async () => (await stateOf('Wren › Video 2', 'Music fix scene 4')).includes('Working'), 'working again')
  check(true, 'answering it puts Claude back to work')

  // The keys that switch sessions: ⌘1…⌘9, ⌃Tab and ⌃⇧Tab, ⌘J.
  await menu('session-1')
  await until(async () => (await headName()) === 'Intro animations', '⌘1')
  await menu('next-session')
  await until(async () => (await headName()) === 'Music fix scene 4', '⌃Tab')
  await menu('next-session')
  await until(async () => (await headName()) === 'Intro animations', '⌃Tab round the end')
  await menu('prev-session')
  await until(async () => (await headName()) === 'Music fix scene 4', '⌃⇧Tab')
  await menu('next-needs-you')
  await until(async () => (await headName()) === 'Intro animations', '⌘J')
  check(true, '⌘1 shows the first session, ⌃Tab and ⌃⇧Tab step through them, ⌘J shows the next that needs you')
  check((await live('Wren › Video 2', 'Intro animations').locator('.row-key').innerText()) === '⌘1', 'each row shows its key')
  await live('Wren › Video 2', 'Music fix scene 4').click()

  // Choose folders, at the bottom of the panel: tick what shows in the list, untick what doesn't.
  const hiddenFolders = async () => JSON.parse(await readFile(join(home, 'config.json'), 'utf8')).hiddenFolders ?? []
  await sidebar.getByRole('button', { name: /^Choose folders/ }).click()
  const choose = sidebar.getByRole('region', { name: 'Choose folders' })
  await choose.waitFor()
  check((await choose.getByRole('checkbox').count()) === 9, 'Choose folders, below the list, ticks every agency, client and folder (mesa, New Guy, Wren, Video 2, Video 10, Base, Jules, Video 1, Video 2)')
  await win.screenshot({ path: join(shots, 'choose.png') })
  await choose.getByLabel('Show Wren › Video 10', { exact: true }).uncheck()
  await folder('Wren › Video 10').waitFor({ state: 'detached', timeout: 5000 })
  check((await folder('Wren › Video 2').count()) === 1, 'unticking a folder takes just it out of the list, at once')
  await choose.getByLabel('Show Jules', { exact: true }).uncheck()
  await client('Jules').waitFor({ state: 'detached', timeout: 5000 })
  check((await hiddenFolders()).length === 2, 'unticking a client takes the whole client out; both kept in config.json')
  check((await sidebar.getByRole('button', { name: 'Choose folders (2 hidden)' }).count()) === 1, 'the button says how many are hidden')
  await choose.getByLabel('Show mesa', { exact: true }).uncheck()
  await client('Wren (mesa)').waitFor({ state: 'detached', timeout: 5000 })
  check((await live('Wren › Video 2', 'Intro animations').count()) === 1, 'unticking the whole mesa agency takes Wren out of the clients; its open sessions stay at the top')
  await choose.getByRole('button', { name: 'Tick all' }).click()
  await client('Jules').waitFor({ timeout: 5000 })
  check((await hiddenFolders()).length === 0 && (await folder('Wren › Video 10').count()) === 1, 'Tick all shows everything again')
  await choose.getByRole('button', { name: 'Done' }).click()
  await choose.waitFor({ state: 'detached' })

  // + on a client: Claude starts in the client folder itself (where the client's own files are).
  await sidebar.getByRole('button', { name: 'New session in the Wren client folder', exact: true }).dblclick()
  await until(async () => (await terminalText()).includes(`stub claude in ${join(root, 'mesa', 'Wren')} session`), 'client folder session')
  check((await dialog.count()) === 0, '+ on a client starts Claude in mesa/Wren itself, at once')
  check((await win.locator('.session-where').innerText()).toLowerCase() === 'wren › client folder', 'the header says WREN › CLIENT FOLDER')
  await win.locator('.session-head').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Base files')
  await until(async () => (await openZone().locator('.session-row', { hasText: 'Base files' }).locator('.row-where').innerText()) === 'Wren', 'its row says Wren')
  check(true, 'its row says just the client, Wren')
  check((await client('Wren (mesa)').locator('.client-dots .state-dot').count()) === 3 && (await openZone().locator('.session-row').count()) === 3, "Wren's line now shows three dots, one for each open session: the double-click on + started one session, not two")
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await openZone().locator('.session-row', { hasText: 'Base files' }).waitFor({ state: 'detached', timeout: 5000 })
  await live('Wren › Video 2', 'Music fix scene 4').click()
  // A client folds away to one line again, still showing what runs in it.
  await toggle('Wren (mesa)').click()
  check((await folder('Wren › Video 2').count()) === 0 && (await client('Wren (mesa)').locator('.client-dots .state-dot').count()) === 2, 'folding a client hides everything in it but the dots for its 2 open sessions')
  await toggle('Wren (mesa)').click()

  // A new client, in an agency, with its first video; then Claude can start there at once.
  await sidebar.getByRole('button', { name: '+ New client' }).click()
  const newClient = win.getByRole('dialog', { name: 'New client' })
  await newClient.waitFor()
  await newClient.getByPlaceholder(/Their name/).fill('Cora')
  check((await newClient.getByLabel('Agency').inputValue()) === 'mesa', 'New client offers the agencies there are (mesa)')
  check((await newClient.locator('.hint').innerText()).includes('Cora › Video 1') && (await newClient.locator('.hint').innerText()).trim().endsWith('mesa/Cora/1, where its sessions run.'), 'and shows where it goes: mesa/Cora/1, as Cora › Video 1')
  await newClient.getByRole('button', { name: 'Create client' }).click()
  await dialog.waitFor({ timeout: 5000 })
  check((await stat(join(root, 'mesa', 'Cora', '1'))).isDirectory(), 'Create client makes the folders')
  check((await dialog.locator('.chosen').innerText()).includes('Cora › Video 1'), 'and opens New session in it')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  check((await client('Cora (mesa)').count()) === 1, 'the new client is in the panel')

  // A new video for a client, from its folders: the next number.
  await sidebar.getByRole('button', { name: 'New video for Wren', exact: true }).click()
  const newVideo = win.getByRole('dialog', { name: 'New video for Wren' })
  await newVideo.waitFor()
  check((await newVideo.getByLabel('Video folder').inputValue()) === '11', '+ New video folder suggests the next number (11 after 2 and 10)')
  await newVideo.getByRole('button', { name: 'Create video' }).click()
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  check((await stat(join(root, 'mesa', 'Wren', '11'))).isDirectory() && (await folder('Wren › Video 11').count()) === 1, 'and makes Wren › Video 11, in the panel')

  // + New session: name it, and pick any folder by client, searchable.
  await sidebar.getByRole('button', { name: '+ New session' }).click()
  await dialog.waitFor()
  await dialog.getByLabel('Find a project').fill('wren 10')
  check((await dialog.getByRole('option').allInnerTexts()).join(',') === 'Client folder,Video 10', 'the picker finds Wren › Video 10 by client and video (beside Wren’s own folder)')
  await dialog.getByRole('option', { name: 'Video 10' }).click()
  check((await dialog.locator('.chosen').innerText()).includes('Wren › Video 10'), 'and picks it')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // A past session can be renamed right in the panel.
  await past('Jules', 'Hype video beat cut').getByRole('button', { name: /^Rename/ }).click()
  await typeName('Hype cut v1')
  await past('Jules', 'Hype cut v1').waitFor({ timeout: 5000 })
  check(true, 'a past session is renamed in the panel too')

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

  // Resume from the panel: the past session under Jules becomes an open one, at the top.
  await past('Jules', 'Hype cut v1').getByRole('button', { name: 'Resume' }).click()
  await until(async () => (await terminalText()).includes(`session ${pastId} (resumed)`), 'resumed')
  check((await terminalText()).includes(`stub claude in ${jules1}`), 'Resume in the panel continues the conversation in its own folder')
  await until(async () => (await headName()) === 'Hype cut v1', 'resumed name')
  check(true, 'with its name at once')
  check((await live('Jules › Video 1', 'Hype cut v1').count()) === 1 && (await past('Jules', 'Hype cut v1').count()) === 0, 'it moves from past to open')

  // A session that ends offers Resume on its row; Close moves it back to past.
  await typeInTerminal('exit')
  await live('Jules › Video 1', 'Hype cut v1').getByRole('button', { name: 'Resume', exact: true }).waitFor({ timeout: 8000 })
  check((await win.getByRole('button', { name: 'Resume conversation' }).count()) === 1, 'when Claude ends, the header and its row offer Resume')
  await live('Jules › Video 1', 'Hype cut v1').getByRole('button', { name: 'Resume', exact: true }).click()
  await until(async () => (await stateOf('Jules › Video 1', 'Hype cut v1')).includes('Ready'), 'resumed again')
  check((await openZone().locator('.session-row', { hasText: 'Hype cut v1' }).count()) === 1, 'resuming it replaces the ended session')
  await win.getByRole('button', { name: 'Close', exact: true }).click()
  await past('Jules', 'Hype cut v1').waitFor({ timeout: 5000 })
  check((await openZone().locator('.session-row', { hasText: 'Hype cut v1' }).count()) === 0, 'Close removes the session; the conversation is back under its client with Resume')
  await win.screenshot({ path: join(shots, 'after.png') })

  // Quit the app with sessions running: they keep running, and come back when it opens again.
  const before = (await live('Wren › Video 2', 'Intro animations').count()) + (await live('Wren › Video 2', 'Music fix scene 4').count())
  check(before === 2, 'two sessions run in Wren › Video 2 before quitting')
  await app.close()
  const pid = await hostPid()
  check(pid > 0 && alive(pid), 'after quitting, the background host still runs')
  await new Promise((r) => setTimeout(r, 500))
  ;({ launched: app, page: win } = await launch())
  await until(async () => (await live('Wren › Video 2', 'Intro animations').count()) === 1 && (await live('Wren › Video 2', 'Music fix scene 4').count()) === 1, 'sessions back', 15_000)
  check(true, 'reopened, both sessions are still there, at the top')
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
