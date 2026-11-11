# Mothership

<img src="build/icon.png" width="128" alt="">

*Every session, every client, docked in one place.*

One dark Mac window for every [Claude Code](https://claude.com/claude-code) session across your
client projects. Made for video editors who run Claude in a folder per video, it works for any work
organised as clients and projects.

- **Clients and their folders, read from disk.** Point the app at the folder your clients are in and
  it lists every client and every folder inside each one, as they are: videos (`Video 3`, `41`), `Base`,
  `References`, anything. Nothing is added by hand and no folder has to be laid out one way. A new
  folder shows up by itself within a few seconds. An agency folder (`mesa`, `Dawn Media`) shows dimmed
  beside the client's name. A session runs in the folder you start it in. See
  [How folders are read](#how-folders-are-read).
- **The left panel** has two parts. On top, **Open sessions**: every session that is open, always in
  sight, in the order you started them (a row never moves). Each row has its name, where it runs
  (**Crew Engine**, or **Crew Engine › Video 3**) and its state in colour: Ready, Working, or
  **Needs you**, with why ("Finished its turn", "Claude needs your permission to use Bash"). A session
  that needs you is lit in amber, and **1 needs you** in the heading is a button that shows it.
  Below, **Clients**: one line per client under its agency, folded. A client's line shows a dot for
  each session open in it. **Find a client or session** at the top narrows both parts, also by a past
  session's name or a folder's. The dock icon shows how many sessions need you.
- **Start a session**: **+** beside a client. Claude starts in the client's own folder at once (where
  its `CLAUDE.md` and rules are), in a real terminal inside the app, named from your first prompt.
  **+ New session** (⌘N) is for naming it first or picking any other folder.
- **Open a client** (click its name) for its past sessions, each with **Resume**, the latest three
  first, and **Folders**, folded away: its videos in number order, then `Base` and the rest, each with
  its own **+** for the times a session should start in one of them. The app remembers what you open.
- **Switch sessions**: click a row, or ⌃Tab and ⌃⇧Tab for the next and the previous one, ⌘1 to ⌘9 for
  the first nine (each row shows its key), and ⌘J for the next one that needs you.
- **Another session in the same place**: **+ New session in this folder** (⌘T) on a session. The
  session header always says where you are (**WREN › VIDEO 2**) above the session's name. An untitled
  second session reads "New session 2" until Claude names it.
- **Names**: give one when you start it, or leave it empty and it is named automatically: Claude's own
  title for the conversation, or your first prompt until there is one. **Rename** any session: the ✎
  beside its name (open or past, in the tree or in History), the **Rename** button in the session
  header, or a double-click on the name. Your name always wins; clear it to go back to automatic. A
  `/rename` inside Claude is picked up too.
- **History** (⌘Y): every past conversation in your watched folders, newest first, by day, each under its
  client › project. Search names, titles, prompts and projects, filter by client, **Resume** one in its
  own folder (or **Show** it, when it is open).
- **Sessions keep running when you quit.** A small background host owns the sessions' terminals, so
  quitting the app (or closing its window) never stops Claude: open the app again and every session is
  where you left it, with its output. **File › Stop All Sessions and Quit…** (⌥⌘Q) stops them all;
  **Close** stops one. They do stop when the Mac restarts or you log out; then **Resume** them.
- **Choose folders** (bottom of the left panel): a checklist of every agency, client and video, right
  below the list. Tick what you want in the list, untick what you don't; it applies at once. Unticking
  an agency hides all its clients, a client all its videos. **Tick all** shows everything again. Kept as
  `hiddenFolders` in `config.json`. A session open in a hidden client still shows at the top.
- **Delete** a conversation: the bin beside a past session (hover it), **Delete** in History, or
  **Delete** in an open session's header. It asks first, stops Claude if it runs, and moves the
  conversation's transcript to the macOS **Trash** (put it back from there if you change your mind).
- **New client**: **+ New client** at the bottom. Type the client's name, pick an agency (the ones you
  have, like `mesa`; none; or a new one) and the first video (`1`). It makes
  `<watched folder>/<agency>/<client>/1`, shows the client in the panel as **CLIENT › Video 1**,
  and opens New session there. A name that is already a folder is refused; nothing is ever overwritten.
- **New video**: **+ New video folder** in a client's **Folders** suggests the next one in the way that
  client names them (`11` after `2` and `10`, `Video 5` after `Video 4`) and makes `<client>/<name>`. You can also
  make folders yourself in Finder, or let Claude make them: they show up by themselves.
- **Alerts**: a macOS notification when a session finishes its turn or asks for permission or input,
  unless you are looking at it. Click it to jump to that session. While the app is closed, the background
host still sends them (as plain macOS notifications).

## Install

You need a Mac with Apple silicon, [Node.js](https://nodejs.org) 22 or later, and
[Claude Code](https://claude.com/claude-code) installed and signed in (`claude` on your PATH).

```bash
git clone https://github.com/vaghmani-hash/mothership.git
cd mothership
npm install        # also unpacks Electron and builds the terminal (node-pty) for it
npm run package    # builds dist/mac-arm64/Mothership.app
```

Drag `dist/mac-arm64/Mothership.app` into Applications. The app is not signed: the first time,
right-click **Mothership.app** → **Open**. Allow notifications when macOS asks.

On first launch, **Choose your clients' folder…**: the folder your clients are in. That is the only
setup. **Watched folders…** (⌘,) at the bottom of the sidebar changes it later. To run it from source
instead: `npm run dev`.

### How folders are read

```
Client/                   ← the folder you choose
  Coda Social/            ← an agency: its clients have a Base folder
    Jonah Park/          ← a client
      Base/               ← listed, after the videos
      Video 3/            ← a video; Claude runs here
      Video 4/
    RIO/                  ← a client too, without a Base
      Rio Video 3/
  Acme/                   ← a client straight in the folder you chose
    Base/
    41/                   ← "Video 41"
```

- A folder with a `Base` folder inside is a **client**.
- A folder whose own folders have a `Base` is an **agency**, and every folder in it is a client.
- Where there is no `Base` at all, the names decide: a folder with videos inside (`Video 3`, `41`) is a
  client, a folder whose folders have videos inside is an agency, and anything else is a client.
- Every folder directly inside a client is listed: videos first, by their number, then the rest by name.
  A client with nothing in it yet is listed too, as its own folder.
- Names show trimmed (`Kite Media ` reads **Kite Media**); the folders themselves are never renamed.
- Skipped: names starting with `.` or `_`, `node_modules`, Premiere's own folders, and links to other
  drives. Untick anything else you don't want to see in **Choose folders**.

The folders are looked up again when the window comes to the front, when you open New session, and
every few seconds while the window is on screen.

## Keys

| Key | |
|---|---|
| ⌘N | New session… |
| ⌘T | New session in the folder of the session you are on |
| ⌃Tab / ⌃⇧Tab | The next / the previous open session |
| ⌘1 … ⌘9 | The first nine open sessions, in the order of the list |
| ⌘J | The next session that needs you |
| ⌘W | Close the session (asks while Claude is working) |
| ⌥⌘Q | Stop all sessions and quit |
| ⌘Y | History |
| ⌘, | Watched folders |
| ⇧↩ | New line in Claude's prompt |
| ⌘C / ⌘V | Copy the terminal selection / paste: text, a screenshot (attached as an image), or files copied in Finder (as their paths). Right-click has Copy and Paste too, and files dropped on a terminal paste as their paths. |
| ⌥⌘P | Pin the window on top of every other window (also the **Pin** button, top right) |
| ⌘+ / ⌘− / ⌘0 | Terminal text bigger / smaller / back to its usual size (every session; kept between launches) |

Closing the window or quitting keeps sessions running; **Stop All Sessions and Quit…** (⌥⌘Q) stops them.
Every conversation stays in History to resume.

## How it works

- Sessions run in a background host (`out/main/host.js`, run as Node on the app's Helper binary, detached, so macOS never takes it for the app),
  which the app reaches over `host.sock` in its folder and starts when it isn't running. It stops by
  itself a minute after the last session ends with no app open.
- Each session is your login shell running
  `claude --settings <app folder>/claude-settings.json --session-id <id>` in its folder, so Claude reads
  the folder's `CLAUDE.md` and your skills as usual, with your own PATH.
- **Your Claude Code settings are never changed.** The `--settings` file adds hooks (`SessionStart`,
  `UserPromptSubmit`, `Stop`, `Notification`, `SessionEnd`) only to the sessions this app starts; they
  run `hook.sh`, which drops each event into the app's `events/` folder. Sessions you start elsewhere
  don't have them; they show in History.
- **History** reads Claude Code's transcripts (`~/.claude/projects`, or `$CLAUDE_CONFIG_DIR/projects`)
  and never writes there. It reads only the start (folder, first prompt) and the end (latest title) of
  each file, so large transcripts stay fast. Print-mode runs (`claude -p`) are left out.
- The app's own files are in `~/Library/Application Support/Mothership/`: `config.json` (watched
  folders, hidden folders, whether the window is pinned), `names.json` (your names, by conversation id), `hook.sh`, `claude-settings.json`, `events/`.
  Delete the folder to start fresh; your conversations stay in Claude Code's transcripts.

## Tests

```bash
npm run typecheck
npm test           # state rules, transcripts, names, the hook bridge, History, folders, real terminal sessions
npm run e2e        # drives the built app on scratch folders
```

The tests use `test/stub-claude.sh` in place of `claude` and scratch folders for everything: they never
read your client folders, Claude settings or transcripts.

## Layout

```
src/host/       the background host that keeps sessions running after the app quits
  server.ts       sessions, hook events, the socket, alerts while the app is closed, idle exit
  protocol.ts     the messages between the app and the host
src/main/       Electron main process
  index.ts        window, menu, IPC, notifications, dock badge
  host-client.ts  reaching the host (starting it when needed)
  create.ts       New client and New video folders
  sessions.ts     terminals (node-pty), session states, names, resume
  hooks.ts        hook.sh + claude-settings.json, and the events folder
  transcripts.ts  History: head and tail of each transcript
  projects.ts     finding the clients under the watched folders, and every folder in each
  store.ts        config.json and names.json
src/preload/    the window's bridge (window.api)
src/renderer/   the React window: left panel (open sessions, clients), session view, new-session dialog, History, settings
src/shared/     types and pure logic: states, transcript parsing, names, clients and projects, the API
test/           unit tests, the stand-in claude, and the e2e script
```

## License

[MIT](LICENSE)
