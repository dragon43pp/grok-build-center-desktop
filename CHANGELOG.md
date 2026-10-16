# Changelog

本文件记录 Agent Session Center 各公开版本的重要变化。版本号遵循 [Semantic Versioning](https://semver.org/)。

> 说明：0.4.7 及更早的条目记录的是本项目早期阶段（当时产品名与现在不同）。为避免旧名残留，文中产品名统一写作「本应用」。条目按历史事实原样保留，未做改写。

> 体例变更（自 1.0.4 起）：条目改为中文优先的双语排布 —— 中文正文在前，其后是一条 `---` 分隔线，英文正文在后；两侧共用同一个 `## [x.y.z] - date` 标题，英文侧以 `### English` 标记。此前的条目保留原有体例与历史原样，未做改写。

## [Unreleased]

## [1.0.14] - 2026-10-17

安装时可以选择目录，首次安装默认到 D 盘。

### 变更

- **安装向导可以选择任意盘。** 目录页还在。D 盘存在、而且这台机器还没装过时，默认目录是 `D:\Agent Session Center`，不再落在当前用户的 AppData。
- **已经装过的机器保持原目录。** 升级不会把文件悄悄搬到 D 盘。要换盘，请自己运行安装包，在目录页改路径。应用内的「重启并安装」会留在当前目录。
- **新建项目先起名字，再选主目录。** 名字和文件夹是两件事，不必相同。会话仍按项目挂上去，不按文件夹名归类。确认后项目出现在侧栏，并打开目标页。

---

### English

The installer lets you pick a folder. A first install defaults to drive D.

### Changed

- **The wizard can install on any drive.** The directory page remains. When D: exists and nothing is installed yet, the default folder is `D:\Agent Session Center` instead of the current user's AppData.
- **An existing install stays where it is.** An upgrade does not move files to D:. To move, run the setup yourself and change the folder. In-app restart-and-install keeps the current folder.
- **A new project starts with a name, then a home directory.** The name and the folder are separate. Sessions still join by project, not by folder name. After confirm, the project appears in the sidebar and its goal page opens.

## [1.0.13] - 2026-10-16

项目可以单独新建。打开项目后，可以在这个项目里再开一场会话。

### 新增

- **侧栏有「新建项目」。** 先选目录，再填名字。项目会出现在侧栏，点开就能写目标和进展。
- **项目里可以新建会话。** 打开项目后，点「在此项目新建会话」。选择器和顶栏「新建」是同一套，目录预填成这个项目。记下对话钥匙后，这场会话自动归进项目。
- 顶栏和侧栏原来的「新建」还在，不进项目也能自己开一场。

---

### English

A project can be created on its own. After it is open, a new session can start inside it.

### Added

- **The sidebar has New project.** Pick a directory, then a name. The project appears in the sidebar, and opening it edits the goal and progress.
- **A project can start a session.** Open the project and choose New session in this project. The picker is the same as New, with the directory filled from the project. Once the conversation key is saved, the session joins the project.
- The existing New entry still starts a session that does not belong to a project.

## [1.0.12] - 2026-10-16

安装或退出打断后，有钥匙的会话会重新出现在「继续」里。项目在还没有会话挂上时也能在侧栏看见。

### 修复

- **重进名单补上被打断的会话。** 安装更新会先停掉进程。账本可能还写着「在跑」，重进标记却是 0，窗口重开就只剩 Terminal 1、Terminal 2 这种匿名终端。现在没挂上宿主、但已有对话钥匙的行会补进重进名单，打开后按钥匙拉回。没有钥匙的行标成已停止，避免空拉起变成另一场。
- **项目不依赖会话先出现。** 侧栏在会话列表为空时仍列出项目，点开就能改目标和进展。

---

### English

After an install or quit interrupts a session, a keyed session shows up in Continue again. A project stays visible in the sidebar before any session is attached.

### Fixed

- **Interrupted sessions return to the relaunch list.** An update stops the process first. The ledger can still say running while the relaunch flag stays off, so reopening shows only anonymous terminals. A running row with a conversation key and no host terminal is now marked for relaunch. A row without a key is marked stopped so it is not opened as a new conversation.
- **A project does not wait for a session.** The sidebar lists projects even when the session list is empty. Opening one still edits the goal and progress.

## [1.0.11] - 2026-10-16

这一版让改过的会话名留下来，并在会话上面加一层项目。交接和交回都记在同一个项目里。

### 新增

- **重命名跟着对话钥匙走。** 侧栏改名会写入账本。记下了 CLI 对话钥匙之后，再打开、按钥匙接回、在会话历史里查询，都用这个名字。没有钥匙的场次只改当前这一场，钥匙一到就补上。
- **项目是会话上面的一层。** 一个项目对应一个目录和一份 `PROJECT.md`。目标由你写、你改。进展在交接和交回时补一句，你也能改。侧栏按项目折叠里面的会话。查找先对项目名和目标，再对会话名。
- **同一个项目里交接。** 在已归入项目、并且记下钥匙的会话上，可以交给另一个已安装的助手。说明先给你看、改完再送出。对方在同一目录另开一场，开场读这份说明。交回时按原来的对话钥匙拉回，并把结果写进项目进展。

### 说明

- 项目只认 ASC 记下钥匙的会话。1.0.7 里关掉、当时没有钥匙的会话，仍然挂不进项目。
- 本版本不带代码签名。

---

### English

This release keeps a renamed session name, and adds a project above sessions. A handoff and a hand-back stay in the same project.

### Added

- **A rename follows the conversation key.** Renaming in the sidebar writes the ledger. After a CLI conversation key is saved, reopening, relaunching, and session-history search use that name. A session without a key changes only the current row until the key arrives.
- **A project sits above sessions.** One project is one directory and one `PROJECT.md`. You write and edit the goal. A handoff or hand-back appends one progress line, which you can also edit. The sidebar folds the sessions inside a project. Search matches the project name and goal, then the session name.
- **Handoff stays inside one project.** A session that belongs to a project and has a key can be handed to another installed assistant. You read and edit the brief before it is sent. The other assistant starts in the same directory and reads that brief. Handing back relaunches the original conversation key and writes the result into the project progress.

### Notes

- A project only accepts sessions whose key ASC has saved. Sessions closed under 1.0.7, before a key was saved, still cannot join a project.
- This release is not code-signed.

## [1.0.10] - 2026-10-16

这一版让程序自己检查并下载更新。下载完成后弹出确认，点一下就重启安装。

### 新增

- **打开后自己检查、自己下载。** 打包版启动后会去 GitHub Release 看有没有新版本。有的话直接下载，不再多点一次「下载更新」。
- **下完就能装。** 下载完成后弹出更新说明。主按钮是「重启并安装」，点下去会退出当前窗口并装上新版本。设置里的「检查更新」仍然可以手动再查一次；已经下完时，同一处按钮也是重启安装。

### 说明

- 1.0.9 及更早的已安装版本还不会自己下载。先从这一版开始，之后的更新才会走这条路。
- 安装包未签名。Windows 可能会提示未知发布者。
- 1.0.9 的会话接回仍然有效：打开应用会接回还在跑、并且记下了对话钥匙的会话。

---

### English

This release checks for updates and downloads them on its own. When the download finishes, one confirmation restarts the app and installs it.

### Added

- **Startup checks and downloads.** A packaged build looks at GitHub Releases after launch. A newer version downloads without a separate download click.
- **Install when the file is ready.** The update notes appear after the download. The primary button is “Restart and install”; it quits the current window and installs the new version. Settings still has a manual check. When the file is already downloaded, that same button installs it.

### Notes

- Builds already installed at 1.0.9 or earlier do not download by themselves. This path starts with this release.
- The installer is not code-signed. Windows may warn about an unknown publisher.
- The 1.0.9 session restore still applies: opening the app brings back a session that is still running and has a saved conversation key.

## [1.0.9] - 2026-10-16

这一版修正打开应用后不接回上次会话的问题。1.0.8 只重进已经退出的会话，窗口关掉但终端还在跑的那场不会出现。

### 修复

- **还在跑的会话也会在打开时接回。** 只要账本里有对话钥匙，无论状态是还在跑还是已经退出，打开应用都会把它拉起来。宿主里的终端还活着时仍然直接接上，不另开一场。

### 说明

- 1.0.7 里关掉、当时没有记下钥匙的会话，仍然不会自动出现。
- 本版本不带代码签名。

---

### English

This release fixes sessions that stayed running not coming back when the app opened. 1.0.8 only relaunched sessions that had already exited.

### Fixed

- **A still-running session is restored on open.** Any ledger row with a conversation key is relaunched, whether it is still running or already exited. A terminal that is still alive in the host is attached instead of started again.

### Notes

- Sessions closed under 1.0.7, before a key was saved, still do not come back automatically.
- This release is not code-signed.

## [1.0.8] - 2026-10-16

这一版让关掉窗口之后的会话还能接上。终端留在单独的宿主里；宿主也没了，第二天打开会按记下的对话钥匙重新拉起。

### 新增

- **关掉窗口，终端还在。** 终端改由一个单独的 Node 宿主握着。窗口关掉或崩了，再打开会接回原来那场，不新开进程。托盘里选退出，才会停掉这些终端。
- **第二天打开，按钥匙重新拉起。** 宿主也没了的时候，已经记下 CLI 对话钥匙、对话文件还在的会话，打开应用后会自己重新拉起，最多 8 场。文件不在的会跳过。这是重新打开对话，不是把昨天的进程留了一夜。
- **没答完的问题还在。** 打开后顶部列出还没答的问题。会话还活着可以直接答；已经退出的要先重进。同一题只认第一次答案。飞书 `/问题`、`/答` 和 `asc tasks` 用同一个问题编号。

### 说明

- 钩子跟着窗口。窗口没起来的那段时间，新的审批不会记进账本。
- 开机不会自己打开应用。要接上次的会话，需要先打开它。
- WorkBuddy 和桌面 Grok Bot 仍是打开客户端里的那场，不走这条恢复。
- 本版本不带代码签名。安装包体积以本次打包产物为准。

---

### English

This release keeps sessions available after the window closes. The terminal stays in a separate host; when that host is gone too, the next launch relaunches sessions from their saved conversation keys.

### Added

- **Closing the window leaves the terminal running.** A separate Node host owns the terminals. Reopening the window attaches the same session instead of starting a new process. Choosing Quit from the tray stops those terminals.
- **The next day relaunches from the saved key.** When the host is gone, sessions that have a CLI conversation key and a conversation file still on disk relaunch themselves, up to 8. A missing file is skipped. This opens the conversation again; it does not keep yesterday's process alive overnight.
- **Unanswered questions stay listed.** Open questions appear at the top. A live session can be answered directly; an exited session needs a relaunch first. The first answer wins. Feishu `/问题`, `/答`, and `asc tasks` share the same question id.

### Notes

- Hooks stay with the window. Approvals that happen while the window is closed are not written to the ledger.
- The app does not start itself at logon. Open it to pick up the previous sessions.
- WorkBuddy and the Grok Bot desktop app still open the client conversation; they do not use this resume path.
- This release is not code-signed. Installer size is the size of this build.

## [1.0.7] - 2026-10-13

这一版给侧栏会话加了会话分叉（Fork），一条对话可以从任意节点复制出另一条继续聊。

### 新增

- **Fork 会话（分支继续）。** 侧栏会话右键新增「Fork 会话（分支继续）」，把整段对话上下文复制成一条全新会话接着聊，原会话原样保留。基于 CLI 原生 `--fork-session` 能力，当前支持 Claude Code 与 Grok Build。
- **Fork 会话（连代码分叉）。** 分叉对话的同时自动创建 git worktree：仓库旁的兄弟目录 `<仓库根>-fork-<时间戳>` 配新分支 `asc-fork-<时间戳>`，分出来的会话在独立目录里改代码，两条线互不干扰。worktree 基于当前 HEAD 创建，未提交的改动不会带过去。

### 说明

- 未实测 fork 能力的 agent（Codex CLI、OpenCode、Kimi Code、Pi、Antigravity）不显示分叉入口。
- 本版本不带代码签名。安装包体积以 CI 产物为准，这里不写字节数。

---

### English

This release adds session fork to the sidebar context menu, so a conversation can branch into a new one at any point.

### Added

- **Fork session (branch from here).** Right-click any session in the sidebar to copy its full conversation context into a brand-new session; the original session stays untouched. Built on the native `--fork-session` flag, available for Claude Code and Grok Build.
- **Fork session (with git worktree).** Forking can also create a git worktree automatically: a sibling directory `<repo-root>-fork-<timestamp>` with a new branch `asc-fork-<timestamp>`, so the forked session edits code in its own directory and the two lines never interfere. The worktree is created from the current HEAD; uncommitted changes are not carried over.

### Notes

- Agents whose fork support has not been verified (Codex CLI, OpenCode, Kimi Code, Pi, Antigravity) do not show the fork entry.
- This release is not code-signed. Installer sizes come from the CI artifacts; this entry does not quote bytes.

## [1.0.6] - 2026-10-12

这一版让多台电脑共用一个飞书机器人。电脑用名字区分，会话只在拥有文件的那台打开。

### 新增

- **多台电脑共用一个飞书机器人。** 设置里给这台电脑起名。另一台手动填同一套 App ID 和 App Secret，不要再扫码；再扫会变成另一个机器人。也可以把第一台的多维表格链接贴进设置，接上同一张表。
- **飞书里仍是一个对话。** `/电脑` 看谁在线，`/列表` 按电脑列出，`/列表 电脑名` 只看那一台。`/继续 电脑名 序号` 把打开交给拥有文件的那台。会话不会在另一台电脑上打开。
- **单台电脑的用法不变。** 没有多电脑名单时，`/继续 序号` 仍在本机打开。`/打开` 和 `/dsh` 不带电脑名时，仍按原来的本机行为。

### 说明

- 继续一场会话只发生在存着那场会话文件的电脑上。另一台收到的是转交，文件不会被搬过去。
- 本版本不带代码签名。安装包体积以 CI 产物为准，这里不写字节数。

---

### English

This release lets several computers share one Feishu bot. Computers are distinguished by name, and a session opens only on the computer that has the files.

### Added

- **Several computers share one Feishu bot.** Name this computer in Settings. Another computer joins by entering the same App ID and App Secret; do not scan again, or the scan creates a different bot. You can also paste the first computer's Bitable link in Settings to join the same base.
- **One chat still covers every computer.** `/电脑` shows who is online, `/列表` groups sessions by computer, and `/列表 电脑名` shows one computer. `/继续 电脑名 序号` hands the open to the computer that has the files. A session is not opened on a different computer.
- **A single computer works as before.** Without a multi-computer roster, `/继续 序号` still opens on this machine. `/打开` and `/dsh` without a computer name keep their previous local behavior.

### Notes

- Continuing a session happens only on the computer that stores that session's files. The other computer receives a handoff; the files are not moved.
- This release is not code-signed. Installer sizes come from the CI artifacts; this entry does not quote bytes.

## [1.0.5] - 2026-10-12

这一版补上 WorkBuddy AI 的会话打开，把 AI 查找拆成两个各自开关，并拦住主窗口崩溃后的重载循环。

### 新增

- **WorkBuddy AI 进入会话历史，点开即跳进对应对话。** 列表从 `~/.workbuddy-ai`（可用 `WORKBUDDY_AI_HOME` 改）只读 `workbuddy.db`，和国内版 `~/.workbuddy` 分开。打开一场走客户端注册的深链：国内 `workbuddy://chat/<uuid>`，AI `workbuddy-ai://chat/<uuid>`。历史里列出的每一场都能开。这是跳进客户端里的那一场，不走 CLI resume。飞书 `/打开` 仍只打开最近一场国内 WorkBuddy。
- **AI 查找增加两个各自独立的开关，默认都关。** 「定期读取消息并写详细概要」打开后，主进程大约每 10 分钟读一批本机会话正文（首次约 15 秒，两次之间至少隔 30 秒）；端点、密钥、模型都填了才写详细概要。关掉它不影响搜索。「搜索标题和消息正文」打开后，本地搜索和 AI 查找同时匹配标题与已经读过的正文、概要。索引、概要和摘录只写在 ASC 自己的 userData 里，不写各 agent 的数据目录。调用模型时，摘录发到用户自己配置的端点。

### 修复

- **主窗口渲染进程崩溃后不再把恢复打成死循环。** 同一扇窗口在 60 秒内最多重载 3 次；重载前先结束这一页带起来的终端，避免刚打崩页面的会话被原样挂回去。超过次数就停，并弹出说明，指向诊断日志。悬浮窗有自己的恢复，不走这条。
- **发往已销毁渲染帧的消息不再灌爆诊断日志。** 发送先过帧闸门；由广播自身引发的日志只记在本地，不再往外推一次。此前在扫码期间刷新窗口，这条回路可以写出数百 MB 日志。

### 说明

- 两个新开关默认关。没打开「搜索标题和消息正文」时，查找仍只走标题。
- 本版本不带代码签名。安装包体积以 CI 产物为准，这里不写字节数。

---

### English

This release adds WorkBuddy AI session open, splits AI search into two independent switches, and stops a crashed main window from reloading in a loop.

### Added

- **WorkBuddy AI joins session history, and opening a row jumps into that conversation.** The list reads `workbuddy.db` from `~/.workbuddy-ai` (`WORKBUDDY_AI_HOME` overrides it), separate from the domestic `~/.workbuddy` store. Open uses the deep link the client registered: domestic `workbuddy://chat/<uuid>`, AI `workbuddy-ai://chat/<uuid>`. Every listed session can be opened. The jump lands in the client conversation; it is not a CLI resume. Feishu `/打开` still opens only the latest domestic WorkBuddy session.
- **AI search gains two independent switches, both off until you turn them on.** "Read messages on a schedule and write a detailed summary" reads a batch of local session text about every 10 minutes (first pass about 15 seconds after start, at least 30 seconds between passes). A detailed summary is written only when the endpoint, key and model are all set. Turning it off leaves search unchanged. "Search titles and message text" makes local search and AI search match titles together with transcripts and summaries already read. The index, summaries and excerpts stay in ASC's own userData and are not written into agent data directories. When a model is called, the excerpt goes to the endpoint you configured.

### Fixed

- **A crashed main renderer no longer turns recovery into a loop.** The same window reloads at most 3 times in 60 seconds. Terminals started by that page are closed before the reload, so the session that just broke the page is not attached again. Past that limit, reload stops and a dialog names the diagnostic log. The floating window has its own recovery and does not use this path.
- **A send to a disposed render frame no longer floods the diagnostic log.** Sends go through a frame gate first. A log line caused by the broadcast itself is recorded locally and is not broadcast again. Refreshing the window during a Feishu scan used to run that loop into hundreds of megabytes of log.

### Notes

- Both new switches default to off. Until "search titles and message text" is on, search still matches titles.
- This release is not code-signed. Installer sizes come from the CI artifacts; this entry does not quote bytes.

## [1.0.4] - 2026-10-11

这一版只做一件事：把安装包做小 —— 干掉应用从不加载的 Electron 运行时文件，以及 node_modules 里的死重。

### 改进

- **裁掉 Windows 版 Electron 运行时里应用从不加载的文件**：候选名单 8 个，CI 产物上实际命中 7 个（第 8 个 `debug.log` 是本地下载 Electron 时的残留，CI 上没有），合计 38,498,107 字节未压缩（36.7 MiB）/ 11,678,334 字节 LZMA。其中 `dxcompiler.dll`、`dxil.dll`、`d3dcompiler_47.dll`、`chrome_200_percent.pak` 四个：`dxcompiler.dll` 与 `dxil.dll` 是 DirectX Shader Compiler 那一对，只服务 DirectX12 / WebGPU 路径，而本应用没有 WebGPU（`navigator.gpu`、`webgpu` 在 `src/` 与 `electron/` 里零出现），GPU 进程永远不会索取它们，删掉后行为完全一致；`d3dcompiler_47.dll` 在 Windows 10/11 基线里由系统自带（`C:\WINDOWS\SYSTEM32\D3DCompiler_47.dll`），删掉应用目录里那份后进程改加载系统那份；`chrome_200_percent.pak` 用不上，因为界面由 CSS / 矢量 / 字体驱动；`debug.log` 是下载 Electron 时的残留，从不重新生成。另外 3 个是 SwiftShader 三件套 `vk_swiftshader.dll`、`vulkan-1.dll`、`vk_swiftshader_icd.json`（6,432,874 字节）—— SwiftShader 是 Chromium 的**软件 WebGL 后端**，不是合成器。实测（三件套在场 / 删除各跑一遍）：Windows 上真正走软件渲染时（`--disable-gpu`）用的是 ANGLE / D3D11 + 系统自带的 Microsoft Basic Render Driver（WARP），两次报告的 `glRenderer` **逐字相同**（`ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)`），`getContext('webgl2')` 两次都可用；唯一会变的是用户显式传 `--use-angle=swiftshader`，此时 `webgl2` 变为不可用，`src/terminal/addons.ts` 接住异常、记下 `webgl-unavailable`、回落到 DOM renderer，窗口依旧完整绘制、零报错、无崩溃。这个名单按平台门控到 Windows（`vk_swiftshader_icd.json` 这个名字各平台都有，而 Linux 没有 GPU 驱动时 SwiftShader 是真实兜底），macOS 与 Linux 上匹配不到任何文件，是空操作。
- **裁掉 node_modules 里的死重：被打包进 `app.asar` 的内容减少 13,338,390 字节（12.72 MiB），条目少 205 条**，由 `package.json` 的 `build.files` 规则裁掉：飞书 SDK 的 ESM 双胞胎 `@larksuiteoapi/node-sdk/es`（−6,220,549；包的 `main` 指向 `lib/index.js`，主进程是 CJS）、node-pty 的编译期目录 `third_party/` + `deps/` + `src/` 与 x64 包用不到的 `prebuilds/win32-arm64/`（合计 −3,063,606）、`protobufjs/dist`（−2,528,908；浏览器 bundle，Node 侧只走 `protobufjs/minimal` → `src/index-minimal`），以及全部 `*.map` 源映射（js-yaml −553,069、axios −523,197、electron-updater −327,521 等，运行时永不加载）。`prebuilds/` 里那个**匹配**当前平台架构的目录、以及 Linux 上必需的 node-pty `build/`（Linux 没有预编译产物，必须真编译）都原样保留。
- **新增门禁 `scripts/assert-node-modules-trimmed.cjs`**：在 electron-builder 的 `afterPack` 阶段读取 `app.asar` 的条目清单，命中任一被裁路径（或任何 `.map`）就中止打包，防止这些文件悄悄回来。裁剪 Electron 运行时的 `scripts/prune-electron-runtime.cjs` 与既有的资源断言，现在共用 `scripts/after-pack.cjs` 里这唯一的 `afterPack` 钩子；运行时门禁改为**直接读 pruner 导出的同一份清单**，不再维护重复列表。

### 说明

- 对照体积（一律取自发布产物，不取开发机构建，见下一条）：v1.0.3 → v1.0.4，Windows 安装包 93.95 → **81.75 MiB**，减少 **12.98%**；Linux deb 90.47 → 89.48 MiB；Linux AppImage 116.62 → 114.63 MiB；macOS arm64 dmg 109.19 → 107.50 MiB；macOS x64 dmg 110.92 → 109.20 MiB。macOS 与 Linux 只吃到 node_modules 那一份收益，Windows 还多一份运行时裁剪，所以降幅明显更大。这里只给 MiB 与百分比，不给字节数：安装包不是逐字节可复现的（同一个提交连续两次构建，实测相差 5 字节），要逐字节校验请用随产物一起发布的 `.sha256`。
- 开发机构建的产物会与上表有出入，一切以 CI 产物为准：开发机的 `node_modules` 可能留有编译残留，本次实测本地 `node-pty/build`（241,374 字节）会被打进 `app.asar`，CI 的 Windows / macOS 任务不编译 node-pty，因而没有这份内容。本条目里的体积、条目数一律引用 CI 产物的实测值。

---

### English

This release does one thing: it makes the installer smaller by dropping Electron runtime files and node_modules dead weight the app never loads.

### Changed

- **The Windows Electron runtime files the app never loads are no longer packaged** — the candidate list has eight entries and seven of them are actually present in the CI artifact (`debug.log` is residue from a local Electron download and does not exist on CI), together 38,498,107 bytes uncompressed (36.7 MiB) / 11,678,334 bytes LZMA. Four of them — `dxcompiler.dll`, `dxil.dll`, `d3dcompiler_47.dll`, `chrome_200_percent.pak` — can go because `dxcompiler.dll` and `dxil.dll` are the DirectX Shader Compiler pair, which serves only the DirectX12 / WebGPU path, and this app has no WebGPU (`navigator.gpu` and `webgpu` appear nowhere in `src/` or `electron/`), so the GPU process never asks for them and a build with them removed behaves identically; `d3dcompiler_47.dll` is provided by Windows itself on the Windows 10/11 baseline (`C:\WINDOWS\SYSTEM32\D3DCompiler_47.dll`), and the process loads the system copy once the app-local one is gone; `chrome_200_percent.pak` is unused because the UI is CSS / vector / font driven; `debug.log` is leftover noise from the Electron download and is never regenerated. The other three are the SwiftShader trio `vk_swiftshader.dll`, `vulkan-1.dll` and `vk_swiftshader_icd.json` (6,432,874 bytes) — SwiftShader is Chromium's **software WebGL backend**, not its compositor. Measured, with the files present and removed: software rendering on Windows (`--disable-gpu`) goes through ANGLE / D3D11 on the operating system's own Microsoft Basic Render Driver (WARP), and the reported `glRenderer` was byte-for-byte identical both times (`ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)`) with `getContext('webgl2')` available either way. The only configuration that changes is a user explicitly passing `--use-angle=swiftshader`: WebGL2 then reports unavailable, `src/terminal/addons.ts` catches it, records `webgl-unavailable` and falls back to the DOM renderer, and the window still paints in full with no error and no crash. The list is gated to Windows on purpose — `vk_swiftshader_icd.json` exists on every platform, and on Linux SwiftShader is the real fallback on a machine with no GPU driver — so on macOS and Linux it matches nothing and the step is a no-op.
- **node_modules dead weight is gone from the packaged app: what goes into `app.asar` is 13,338,390 bytes (12.72 MiB) smaller, 205 entries fewer**, removed by the `build.files` rules in `package.json` — the Feishu SDK's ESM twin `@larksuiteoapi/node-sdk/es` (−6,220,549; the package's `main` is `lib/index.js` and the main process is CJS), node-pty's compile-time trees `third_party/` + `deps/` + `src/` plus the `prebuilds/win32-arm64/` directory an x64 package never loads (−3,063,606 in total), `protobufjs/dist` (−2,528,908; the standalone browser bundle, while the Node side goes through `protobufjs/minimal` into `src/index-minimal`), and every `*.map` source map (js-yaml −553,069, axios −523,197, electron-updater −327,521 and so on — never loaded at run time). The one `prebuilds/` directory that **does** match the target platform and architecture is kept, and so is node-pty's `build/`, which Linux needs because node-pty ships no prebuilt binary for it.
- **A new gate, `scripts/assert-node-modules-trimmed.cjs`, reads the `app.asar` entry list during electron-builder's `afterPack` phase and aborts the build if any trimmed path (or any `.map`) comes back**, so these files cannot silently return. The Electron-runtime pruner `scripts/prune-electron-runtime.cjs` and the existing resource assertions now share the single `afterPack` hook in `scripts/after-pack.cjs`, and the runtime gate reads the pruner's own exported list instead of keeping a duplicate that can drift.

### Notes

- For scale (every figure read off the published artifacts, never off a developer build — see the next bullet): v1.0.3 → v1.0.4, the Windows installer goes 93.95 → **81.75 MiB**, a cut of **12.98%**; Linux deb 90.47 → 89.48 MiB; Linux AppImage 116.62 → 114.63 MiB; macOS arm64 dmg 109.19 → 107.50 MiB; macOS x64 dmg 110.92 → 109.20 MiB. macOS and Linux receive only the node_modules saving, while Windows also gets the runtime prune, which is why its drop is much larger. Sizes appear in MiB and percent only, never in bytes: the installer is not byte-reproducible (two consecutive builds of the same commit differ by 5 bytes here), so reach for the `.sha256` published beside each artifact when you need a byte-exact check.
- A developer build disagrees with the table above, and CI wins. A working tree can keep compile residue such as `node-pty/build` — measured at 241,374 bytes here, and it does get packed into `app.asar` — whereas the Windows and macOS CI jobs never compile node-pty and so never have it. The installer is not byte-reproducible off CI either: two consecutive local builds of the same tree differ by 63 bytes. Everything above is quoted from the CI artifact.

## [1.0.3] - 2026-10-10

### Fixed

- **16 of the 18 bundled UI themes were silently unusable.** Every theme except ASC Light and ASC Dark shipped missing exactly one color token (`bg.hover`), so the resolver rejected them at startup and the renderer fell back to the safe light palette — picking Dracula, Nord or Gruvbox in Settings still showed plain ASC Light, and nothing surfaced the failure. Each of the 16 themes now carries a hover tint derived from its own palette (light themes: their ink at 4% alpha; dark themes: white at 3%). If a token is ever missing again, the renderer now falls back to the same-type built-in theme with an explicit warning naming the inherited tokens, instead of the emergency palette. A new build-time gate (`scripts/assert-builtin-themes.mjs`, wired into `npm run build`) fails the build the moment any bundled theme lacks or misnames a token, so the registry and the JSONs cannot drift apart again.
- **Exit-time `Error sending from webFrameMain: Render frame was disposed` noise.** The main process no longer broadcasts state changes once quitting has started, so the teardown race cannot reach a disposed render frame.

## [1.0.2] - 2026-10-10

### Fixed

- **A machine where the GPU process cannot start no longer exits silently.** On affected machines (virtual displays from remote-control software, VMs, broken GPU drivers), Chromium used to print `GPU process isn't usable. Goodbye.` and exit before any window appeared — the app "flashed and vanished". The main process now listens for `child-process-gone`, records the reason and exit code into the diagnostic log (`%APPDATA%\Agent Session Center\logs\asc-diagnostic.jsonl`), and after repeated failures shows a dialog with the exact command to relaunch once with `--no-sandbox`. The app never disables the GPU sandbox on its own; that stays the user's call.

### Changed

- **Windows shortcuts are now named `ASC (Agent Session Center)`**, so typing `asc` into the Start menu finds the app. The installer reads the previous shortcut name from its registry entry and renames existing shortcuts in place during the upgrade, so nothing is duplicated.

### Documented

- **Where the Windows installer actually puts the app**: `%LOCALAPPDATA%\Programs\Agent Session Center` by default (per-user), plus how to choose Program Files instead.
- **A "the window never appears" troubleshooting section** in both READMEs, covering the `--no-sandbox` workaround and the diagnostic log path.

## [1.0.1] - 2026-10-07

### Added

- **DeepSeek Harness in session history.** DSH sessions are now read from the DeepSeek Harness home directory (`$DSH_HOME`, default `~/.dsh`) — the same directory the `dsh` CLI and DSH Desktop share — so they are listed alongside the other sources.
- **Open in DSH.** A DSH session opens directly in ASC's DSH surface with a resume intent, instead of only appearing in the list.
- **Feishu `/dsh` command.** A prompt or approval on your phone can open a DSH session in the desktop app through the new `app:open-dsh-session` channel.

### Removed

- **The built-in Live2D floating-window skin**, and with it the bundled Live2D Cubism Core runtime and the Mao sample model (48 files, 4.9 MB on disk). They leave both the repository and the installer, so the package no longer contains any non-open-source runtime. The default `builtin/default` monitor is unaffected, and a floating window whose renderer is missing falls back to it.
- **The Sunny Buddy example renderer** (`examples/`). Custom floating renderers remain supported, but the direction is now compact status surfaces rather than animated characters: the built-in creation Skill states that third-party runtimes and models are supplied and licensed by the user, never bundled here.

### Notes

- The published [v1.0.0](https://github.com/fatedawn/agent-session-center/releases/tag/v1.0.0) installer predates the Live2D removal and still carries that runtime. Release assets here are always built from this repository's own source by its own CI, but they are **not code-signed** — see the [code signing policy](https://github.com/fatedawn/agent-session-center#code-signing-policy).

## [1.0.0] - 2026-10-06
First public release. Agent Session Center (ASC) is a desktop session center for eight AI coding agents — Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy. The CLIs keep their native TUI and do all the work; ASC adds the layer usually missing around them.

### Added

- **One table for every session.** Session history reads what each CLI itself wrote to disk, across all eight sources: browse, semantic search, hide, or send to the recycle bin. The underlying session files are never modified.
- **Resume in place.** Where an agent exposes a resumable session, ASC offers one-click resume in the original working directory, with an honest split of what is resumable and why the rest is not.
- **Ask AI to find a session.** Describe what you are looking for in one sentence and ASC returns the matching sessions together with its answer. The assistant endpoint is configured by you and called directly from the desktop app.
- **Live status for six harnesses.** Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code and Pi report thinking, tool calls, approvals and completion through their official Hooks, SSE or extension APIs. DeepSeek Harness is followed through its official web surface.
- **Attention push and mobile approval.** When an agent stalls on an approval, a Feishu push brings it to your phone — one tap to approve.
- **Tokens and cost per agent**, aggregated from each CLI's own records. Cost is shown when it is known — recorded by the agent itself or priced from the model catalogue — and left blank rather than guessed when it is not.
- **Custom floating renderers** built with HTML, CSS, JavaScript, animation libraries, canvas or Live2D, through the same public interface the built-in monitor uses.
- **Read-only workspace viewer** beside the terminal: file tree, syntax-highlighted source, and Markdown preview.
- **Five UI languages** (English, 简体中文, 繁體中文, 日本語, 한국어), independent application and terminal themes, configurable terminal fonts, and two navigation modes.
- **Built-in updater.** This is the first release whose packaged clients check the GitHub Release feed at startup. Updates are announced, never installed silently; `ASC_DISABLE_UPDATES=1` skips the check entirely.

### Changed

- Project renamed to Agent Session Center: repository `grok-build-center` → `agent-session-center`, installer artifacts `GrokBuildCenter-*` → `AgentSessionCenter-*`. Resume moved into the core pitch.

### Notes

- v1.0.0 ships **Windows x64** artifacts. The macOS (arm64 dmg/zip) and Linux (AppImage/deb) targets are configured and validated by their own guarded release scripts, but those packages must be built on their matching operating systems and are not part of this release.
- Builds are not commercially code-signed yet, so Windows may show a security prompt on first launch.
- The early prototype was derived from [UniRound-Tec/hrack](https://github.com/UniRound-Tec/hrack) (Apache-2.0). ASC is an independently maintained hard fork; attribution and the change summary live in [NOTICE](./NOTICE).

## [0.4.7] - 2026-09-18
### Fixed

- Fixed newly created DSH sessions not appearing in the desktop sidebar and session changes inside DSH not updating the active sidebar entry after upgrading to DSH 0.1.5.
- Restored live DSH session title and running-state updates. Reconnecting now catches up on missed changes without overwriting newer updates, while keeping compatibility with older DSH versions.

### Changed

- Added an explicit "Choose image / GIF" option and a GIF-only file filter for terminal backgrounds, with clearer instructions in all five supported languages. Animated GIFs up to 16 MB play in both the preview and terminal, support the existing fit and opacity controls, and remain selected after restart.

## [0.4.6] - 2026-09-10
### Fixed

- Adapted to DeepSeek Harness 0.1.2+ browser authentication and Typert RPC: 本应用 now reads the process launch token, exchanges it for the signed session cookie, and uses that cookie for host ready checks, the official embedded page, wire/projector traffic, and the remote tunnel. Ready checks accept both the older `session.list` / `workspace.list` control plane and the 0.1.5 `session/list` remote. Older DSH hosts that do not print a token keep working without a cookie.
- The embedded official DSH page now recognizes 0.1.5 layout markers, and a missing default sidebar collapse no longer fails the whole surface.
- Hardened the DSH web tunnel against unauthenticated denial of service: malformed WebSocket upgrade requests no longer permanently consume the tunnel capacity quota, and relay-side stream-id accounting no longer grows without bound over a relay's lifetime.
- Fixed relay room capacity exhaustion in deployments without a reconciler: repeatedly creating and revoking rooms no longer leaves permanently revoked tombstones that block all future room creation.
- Fixed a desktop remote-control deadlock where disconnecting during session creation left the desktop stuck in a phantom "driven" state — local terminals resized to phone dimensions, local resizes blocked, and PTY output stalled until a 1 MB overflow.
- Fixed swallowed PTY exit events: closing a remotely driven terminal tab or stopping an agent session now reliably delivers the exit fact, releasing the phone's drive instead of freezing the terminal and rejecting later drives as busy.
- Page-level failures in the embedded DSH surface (load timeouts, stale session ids) no longer restart the shared DSH host and interrupt all other DSH sessions.
- Hardened the tunnel's local path fence: percent-encoded backslashes (for example `..%5c..%5c`) are now rejected; workspace browsing refuses UNC and device paths (`\\server\share`, `\\.\`), and remote launches refuse relative workspace paths instead of silently resolving them against the desktop's working directory.
- Fixed DSH host shutdown races: stopping or disposing the host can no longer race an in-flight startup into spawning a new DSH process after teardown, and the `--no-open` retry detection no longer considers output from earlier launch targets.
- Restarting DSH during startup now waits for the cancelled launch to finish before starting a fresh host.
- Clearing diagnostics waits for in-flight log writes, preventing cleared entries from reappearing after restart.
- Valid terminal history responses near the 1 MiB frame limit are delivered, and a drive is released if its response cannot be sent.
- Fixed an unhandled-exception crash path in the remote DSH preflight when a response stream resets mid-transfer.
- Fixed tunnel WebSocket streams reporting post-open local errors as open-rejections, which the gateway treated as a protocol violation and tore down the entire tunnel.
- Directories with more than 5,000 entries are now truncated for pagination instead of failing the entire listing.
- Naturally exited agent sessions are now retained with a bounded cap (latest 100) instead of accumulating for the lifetime of the main process.
- ConPTY resize handling now gives up an expectation after repeated size-mismatched redraws instead of suppressing subsequent redraws indefinitely.
- The phone app validates launch arguments against protocol limits before submitting; oversized submissions no longer cause the relay to disconnect the phone for repeated violations.
- Negative exit codes (for example `-1` on Windows) are now displayed instead of dropped.
- Fixed the remote demo page hanging when replaying cursor-sync history events.

### Changed

- Diagnostic log persistence is now serialized and asynchronous instead of synchronously writing to disk on the main thread for every console message; the Settings log panel also subscribes only while its tab is open, so other settings pages no longer re-render on every log line.
- The DSH session projector merges event-stream reconnects by generation and closes replaced sockets, so a dropped connection no longer multiplies duplicate connections and duplicated events.
- Outbound remote-control messages exceeding the 1 MiB protocol frame limit are dropped and logged instead of causing the relay to terminate the desktop connection.
- The remote-driven terminal overlay no longer blocks local scrolling or interaction; only its notification pill is interactive.
- The pairing QR code is memoized on its URL instead of being rebuilt on every pairing poll.

## [0.4.5] - 2026-08-28
### Added

- Added eight built-in UI themes with four light styles (Paper Ink, Glacier Glass, Sakura Clay, and Circuit Lime) and four dark styles (Obsidian Ember, Midnight Cobalt, Forest Signal, and Violet Arcade).

### Changed

- Refreshed the desktop, taskbar, tray, and installer branding with the updated 本应用 mark.
- Standardized adapter preparation commands on a 10-second budget so WSL cold starts and Windows-mounted filesystem access are handled consistently across Grok Build, Kimi Code, Codex, Pi, Claude Code, and OpenCode.

### Fixed

- Fixed Grok Build and Kimi Code WSL observer setup failures caused by launching user login shells to resolve hook configuration paths. Hook locations now use the same non-login environment as the actual CLI process and report specific environment failures.
- Hardened shared WSL discovery so a slow or broken login profile no longer hides an otherwise healthy distro or CLI installation; login-shell PATH remains an optional enhancement with a safe runtime fallback.
- Fixed intermittent remote terminal alignment after scrolling or viewport changes by synchronizing cursor and viewport state with remote renderers.

## [0.4.4] - 2026-08-28
### Added

- Added a selectable diagnostics panel in Settings that collects desktop, remote-control, and DSH events for easier troubleshooting without forcing an all-at-once copy action.
- Added regional relay discovery for pairing URLs, allowing the desktop client to connect automatically to the relay selected when the URL was created.

### Fixed

- Fixed DSH startup failures caused by injecting the remote directory picker more than once into the same official DSH boot configuration.
- Hardened remote and DSH connection diagnostics so regional routing and tunnel failures retain useful local context without exposing pairing credentials.

## [0.4.3] - 2026-08-27
### Fixed

- Fixed intermittent terminal corruption and misalignment after long, scrollable TUI output or window-size changes. 本应用 now suppresses only ConPTY redraw frames that carry the expected size marker, while preserving application-owned redraws from Cline, Claude Code, Kimi Code, and other terminal UIs.
- Restored copy actions in the embedded DSH interface by allowing sanitized clipboard writes only from the same-origin local DSH surface; all unrelated permissions remain denied.

### Changed

- The embedded DSH interface now keeps its native theme instead of being recolored with 本应用 theme tokens.
- Updated the public 本应用 website with device-aware visual effects that cap render cadence, pause off-screen work, reduce load on constrained devices, and respect reduced-motion preferences.

## [0.4.2] - 2026-08-26
### 新增

- 远程设置页新增连接状态面板，实时显示连接指示灯、往返延迟以及本次连接的上传/下载流量。

### 改进

- 配对 URL 持久化保存，本应用 重启后会自动重新连接；远程设置页改为直接链接官方网页创建配对 URL，并移除只能由网页完成的房间吊销入口。
- DSH 网页隧道默认启用，不再要求用户额外打开开关；远控状态和错误提示改为面向用户的明确文案。
- 官方远控服务与 DSH 网页隧道迁移到官方域名。
- 重制桌面窗口、任务栏、托盘和安装包图标，使用正确的 本应用 品牌字形与圆角底板；CLI 图标固定使用各提供方的官方品牌颜色，不再跟随主题染色。

### 修复

- 发布产物的 `latest*.yml` 直接携带 CHANGELOG 原始 Markdown，避免 GitHub Atom 将更新说明转换为 HTML 后被安全渲染器跳过。

## [0.4.1] - 2026-08-25
### 修复

- 适配 DeepSeek Harness 0.1.1 的 boot manifest 注入方式：远程能力检查改为解析 `window.__DSH_BOOT__` 和 `globalThis["__DSH_BOOT__"]` 的等价写法，再校验 manifest 内容，不再将 0.1.1 误判为“远程隧道不可用”。
- 调整 DSH 远程状态文案，不再把主机、网页表面或隧道的能力失败笼统归因于 DSH 版本。

## [0.4.0] - 2026-08-25
### 新增

- 新增完整的 本应用 Remote：桌面端可生成配对 URL / 二维码，经正式 TLS 公网中继把实时会话状态同步到手机，并支持临时接管终端输入。
- 新增 本应用 手机端配套应用：支持扫码或粘贴 URL 配对、会话列表、横屏全屏监听、状态提示音，以及从监听卡片聚焦桌面端对应会话。
- 手机端可新建 Claude Code、Codex、OpenCode 等 CLI 会话，并通过桌面端文件选择协议浏览 Windows / WSL 工作区；免审批启动、运行位置和启动参数与桌面端语义一致。
- 远程终端支持 ANSI/TUI 实时渲染、控制键、方向键、斜杠指令、持久化缩放比例，以及手机软键盘和横竖屏切换。
- 新增 DSH 官方 Web 界面的安全隧道：手机端可查看活跃 DSH 会话、创建会话、发送消息并与桌面端的会话监听及聚焦状态双向同步。
- 更新确认弹窗的「更新说明」改为 Markdown 渲染：支持标题、列表、加粗、代码块、表格等 GFM 语法；HTML 仍一律跳过，链接只展示不导航。

### 改进

- 远控协议补齐版本协商、消息方向白名单、序号与快照恢复、背压和尺寸上限；断线重连不再把历史 PTY 输出当作新流量重复播放。
- 手机终端采用与桌面端一致的网格与字符宽度语义，键盘弹出时整体平移终端而不改变 PTY 行列数，减少 TUI 重排和右侧空白。
- 横屏监听状态与桌面悬浮窗对齐，显示 CLI 图标、名称、完成 / 等待确认 / 执行中 / 异常等状态，并复用 本应用 默认提示音。
- 公网房间、设备控制权和 DSH 隧道均绑定已认证账户；加入连接撤销、凭据轮换、重连和过期清理边界。

### 修复

- 修复手机终端退出输入后无法再次聚焦、滚动时产生 `NaN` 输入、重连重复回放、字符错位和品牌字形裁切等问题。
- 修复 Android 后台切换导致 DSH 会话丢失，以及隧道重连后沿用失效凭据的问题。
- 适配新版 DSH 的 `--no-open` 差异和官方运行时桥接方式；启动失败时自动按兼容参数重试并展示可复制的错误信息。

### 发布说明

- 桌面安装包继续提供 Windows x64、macOS Apple Silicon 和 Linux x64；Windows 与 macOS 制品尚未进行商业代码签名，系统首次启动时可能显示安全提醒。
- 远程控制需配合已部署的 本应用 Remote 服务和手机端应用使用；桌面端不会在手机未主动接管时转发键盘输入。

## [0.3.6] - 2026-08-21
### 新增

- 支持重启 DSH 进程：打开 DSH 时标题栏提供「重启 DSH」，设置 → 会话里也有同一入口。安装插件后会杀掉当前 host 再拉起，并重载官方页面；本应用 的跟踪位不会被清掉。

### 修复

- 适配 DeepSeek Harness 0.1.0-rc.7+：`dsh web` 默认会打开系统浏览器，本应用 嵌入时传入 `--no-open`。WSL 上同版本 web 应用可能不认该参数，被拒绝后自动去掉再启动。
- 适配 rc.7+ 官方页面模块加载：Cordis 改为从 `window.__ModuleLoader__` 捕获，不再依赖已移除的 `__DSH_MODULES__`，避免嵌入失败后又弹出浏览器。

## [0.3.5] - 2026-08-20
### 新增

- 终端可设置背景图像：从本地选择图片，支持覆盖 / 适应 / 拉伸 / 平铺，默认不透明度 30%，设置页带小预览；背景铺满圆角留白，并隐藏多余滚动条。
- 新增可设置事件提示音：阻塞 / 需要操作、完成、异常时播放，默认内置 `resources/done.mp3`；设置页支持上传本地音频与试听。
- 发现新版本时弹出更新确认框并展示该版本的更新说明（超长说明可滚动），可选择“立即更新 / 忽略此版本 / 以后不再弹出 / 稍后”；忽略的版本不再重复提示，“以后不再弹出”会永久关闭自动弹窗。

### 修复

- 修复悬浮窗在事件更新时因高 DPI 缩放导致窗口逐次下移的问题：改为以稳定底边为锚点，并在系统量化窗口尺寸后纠正位置。

### 改进

- 启动后立即自动检查更新，不再依赖打开设置页；发现新版本时标题栏直接显示版本入口，点击直达更新设置。
- 加强悬浮窗置顶：使用更高置顶层级，并定时重新置顶，减少被其它应用覆盖的可能。
- 悬停方框特效可在设置和首次欢迎页关闭；关掉后不再跟随指针绘制方框。
- 设置页按外观 / 布局 / 终端 / 会话 / 更新分页，左侧分类导航，内容区加宽；去掉叠在真实标题上的装饰性英文眉题。

## [0.3.4] - 2026-08-19
### 新增

- 新建 CLI 会话时记住上次工作区，并用主题化下拉框提供最近 5 条工作区记录。
- 新增 OpenCode Bridge：其它本地 harness 可以创建、发送、监听、审批、回答并关闭 本应用 里已经打开的 OpenCode 标签；设置页可复制用法 Skill。
- 新增 Grok Build 会话监听，覆盖本机与 WSL。
- 支持免审批启动的 CLI 在新建会话时提供勾选，并记住上次选择。

### 修复

- 普通终端未指定工作区时改在用户主目录启动，不再落到安装目录（例如 `AppData\\Local\\Programs\\本应用`）。
- 代码阅读器刷新时不再闪屏，文件树也不会滚回顶部。
- WSL 中启动 CLI 时外层工作目录不再误用 POSIX 路径，避免 Windows `Error 267`。
- DSH 监听器现在跟踪 tool call；本轮结束后显示「本轮任务已完成」，不再直接落到「等待你的下一条指令」。
- 打包版 Windows 任务栏与开始菜单快捷方式在深色主题下改用浅色图标；安装包图标改为含 256px 的浅色 ICO，满足 electron-builder 打包门槛。
- OpenCode Bridge 管道被占用时不再挡住主窗口启动。

### 改进

- 不再随包内置 DeepSeek Harness 兜底运行时。DSH 与其它 CLI 一样先扫描本机 / WSL，没有安装就不展示入口。
- Windows / macOS / Linux 安装包去掉约 250MB 的 `dsh-runtime`，并裁掉未使用的 Electron 语言包，安装包更小、安装更快。

## [0.3.3] - 2026-08-18
### 修复

- 修复打包版内置 DSH 启动失败（HMR 报 `--expose-internals is required`）：内置 host 改以 `ELECTRON_RUN_AS_NODE` 纯 Node 模式启动，`--expose-internals` 在打包产物中同样生效，开发与打包行为一致。

### 改进

- DSH 运行时发现不再锁定唯一兼容版本：扫描如实上报本机 / WSL 安装的实际版本，任意版本均可作为候选并被 auto 优先选中（随包内置版本仅作兜底）；实际兼容性由启动时的控制面能力门禁（`session.list` / `workspace.list`）兜底。

## [0.3.2] - 2026-08-18
### 新增

- 设置页新增「主题 JSON」编辑器，可编辑并保存个人界面主题（固定 `custom.json`），保存后可在主题选择器中选用。
- 新增主题创作 Skill（`create-asc-theme`）及零依赖校验脚本（`validate-theme.cjs`），附带 WCAG 对比度检查。
- 新增 CLI 会话录制脚本（`npm run record:cli-demo`）。

### 改进

- DSH 默认共享 `~/.dsh` 历史目录，与本机 DeepSeek Harness 复用会话历史。
- DSH 界面圆角改用原生视图圆角（`setBorderRadius`），与侧栏环境色对齐；切换圆角开关不再重开会话。
- 应用深色模式下，窗口与托盘图标自动切换为浅色变体。
- 用户数据目录统一为 本应用 / 本应用 Dev，安装包 appId 更新为 `产品 appId`。

### 修复

- 修复 DSH 圆角原先依赖内容留白、关闭后圆角消失的问题，改为原生圆角实现。

## [0.3.0] - 2026-08-16
### 新增

- 产品由 Vibing 更名为当时的产品名，更新应用界面、图标、安装包与项目文档。
- 嵌入 DeepSeek Harness 官方 Web 界面，优先使用兼容的本机或 WSL DSH，随包版本仅作为兜底。
- 新增 Kimi Code 会话监听，并统一 Claude Code、Codex、OpenCode、Pi 与 Kimi 的状态覆盖语义。
- 新会话快速启动面板加入 DeepSeek Harness，并补齐已注册 CLI 的品牌图标。
- 新增 Linux x64 AppImage 与 Debian 安装包，以及 Windows、macOS、Linux 并行构建的 GitHub Release 流程。

### 改进

- DSH 侧边栏只关注当前激活会话，支持多个独立 DSH 窗口并避免重复悬浮会话。
- 修复审批完成后仍停留在“需要你的确认”、Kimi thinking 未同步、嵌入页面错位与品牌字体裁切等问题。
- DSH 运行时扫描覆盖 Windows 主机与 WSL，并明确采用“本机优先、随包兜底”的选择策略。

### 发布说明

- Windows x64 提供引导式 NSIS 安装包；macOS 提供 Apple Silicon DMG；Linux x64 提供 AppImage 与 Debian 包。
- Windows 与 macOS 产物尚未进行商业代码签名，系统首次启动时可能显示安全提醒。

## [0.2.2] - 2026-08-07
首个公开的 Windows 预览版本。

### 新增

- 面向 AI Coding CLI 的多会话终端、侧边栏状态聚合与悬浮提醒窗口。
- Claude Code、Codex CLI、OpenCode 与 Pi 的原生事件监听适配器。
- Windows 与 WSL 中的 CLI 扫描、启动、工作区选择和子终端。
- 只读文件树、代码高亮、Markdown 渲染与文件变化自动刷新。
- 深色与浅色 GUI/终端主题，以及可调节的阅读器布局。
- 会话重命名、克隆、排序和注意力优先选项。

### 修复

- 保留 WSL 中通过 NVM、Volta、asdf、mise 等工具配置的运行时环境，避免 Adapter 探测或监听失效。
- Pi 隐藏真实终端光标时，中文输入法预输入框会跟随 Pi 当前绘制的输入光标。
- 改善 TUI 重绘、窗口缩放、鼠标输入、托盘图标与安装包图标的稳定性。

### 发布说明

- 当前仅提供 Windows x64 引导式安装包。
- 安装包尚未进行商业代码签名，Windows 可能显示安全提醒。
