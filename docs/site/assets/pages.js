/* Agent Session Center — product-site pages: the string table for docs.html,
 * download.html and changelog.html, plus the landing page demo block.
 *
 * This file extends the table in i18n.js at load time rather than shipping a
 * second table, so the site keeps one vocabulary and one language switch. The
 * page shells load it directly after i18n.js; the build script loads both in
 * the same sandbox, so the two packs must stay key-for-key identical.
 *
 * Voice rules, borrowed from docs/brand.md: no contractions, no exclamation
 * marks, and never a claim about the product that the source does not support.
 */
;(function () {
  'use strict'
  var strings = window.ASCDemo && window.ASCDemo.i18n && window.ASCDemo.i18n.strings
  if (!strings) return

  /* ─────────────────────────── English ─────────────────────────── */
  Object.assign(strings.en, {
    /* ── docs.html ── */
    'pd.doc.title': 'Documentation — Agent Session Center',
    'pd.doc.description':
      'Agent Session Center documentation: what it does, the 8 coding agents it supports, how to install it on Windows, Linux and macOS, and how to troubleshoot.',
    'pd.h1': 'Documentation',
    'pd.lede':
      'Agent Session Center (ASC) is an open-source desktop app for Windows, Linux and macOS. It gathers the session history of eight AI coding agents into one place: browse and search sessions, resume one in place, watch tokens and cost per agent, and push a permission prompt to your phone through Feishu.',
    'pd.toc.title': 'On this page',

    'pd.s1.title': 'What it is, and the problem it solves',
    'pd.s1.p1':
      'Different agents are good at different jobs, so one terminal quickly becomes several. Each CLI keeps its sessions in its own format, in its own directory. The friction is not starting an agent — it is finding the session again later. Two days on, you have to remember which CLI you used, which folder it ran in, and roughly when.',
    'pd.s1.p2':
      'ASC reads the session history each CLI already writes to disk and shows it in one window. The CLI keeps its native terminal and does all the work; ASC adds the layer around it — live status, attention cues, a floating monitor and a read-only workspace viewer. It never parses the terminal. It reads the event streams and session files the CLIs already produce, then derives status from those events.',

    'pd.s2.title': 'Which agents are supported',
    'pd.s2.p':
      'Eight coding agents appear in session history: Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy. Six of them also report live status while they run. DeepSeek Harness is read as well when its home directory is present, through its own projection channel.',
    'pd.s2.note':
      'Harnesses are not equally observable, and ASC does not pretend that they are. Each adapter declares what it can actually prove for the session in front of you, and the interface shows that level rather than a brand claim. The interactive demo carries the full capability matrix, column by column. The list below is the short version.',

    'pd.agents.r1.name': 'Claude Code',
    'pd.agents.r1.detail':
      'Official Hooks. Live status covers thinking, tools, approvals and completion. One-click resume.',
    'pd.agents.r2.name': 'Codex CLI',
    'pd.agents.r2.detail':
      'Stable Hooks. Turns, tools, approvals and compaction. One-click resume.',
    'pd.agents.r3.name': 'OpenCode',
    'pd.agents.r3.detail':
      'Server plus SSE. The deepest source: sessions, thinking, tools, questions and permissions, and the only one that reports message summaries. No verified resume command.',
    'pd.agents.r4.name': 'Grok Build',
    'pd.agents.r4.detail':
      'Official Hooks. Turns, thinking, tools and approvals. One-click resume. It records its own cost in its usage file.',
    'pd.agents.r5.name': 'Kimi Code',
    'pd.agents.r5.detail':
      'Official Hooks. Turns, thinking, tools and approvals. No verified resume command.',
    'pd.agents.r6.name': 'Pi',
    'pd.agents.r6.detail':
      'Extension API. Thinking, responses, tools and turns. The only source that reports tokens and context together rather than a single number.',
    'pd.agents.r7.name': 'Antigravity',
    'pd.agents.r7.detail':
      'Session history only. It exposes no live event stream, so it has no live status.',
    'pd.agents.r8.name': 'WorkBuddy',
    'pd.agents.r8.detail':
      'Session history only. The most recent WorkBuddy session can be opened in the WorkBuddy client.',

    'pd.s3.title': 'Install',
    'pd.s3.p':
      'Every build is self-contained and unsigned. Signatures are not available yet, so each operating system interrupts the first launch, and it is worth checking the published SHA-256 before you run an installer. The download page lists each file with its size and hash.',
    'pd.s3.win':
      'Windows 10 and 11 on x64 use the guided NSIS installer, which installs per-user to <span class="mono">%LOCALAPPDATA%\\Programs\\Agent Session Center</span> unless you choose Install for all users on its first page. Windows SmartScreen prompts once: choose More info, then Run anyway. The Start-menu shortcut is named ASC (Agent Session Center), so typing asc finds it.',
    'pd.s3.mac':
      'macOS builds are unsigned and not notarized, so Gatekeeper blocks the first launch. On macOS 15 and later, open System Settings, go to Privacy &amp; Security, and choose Open Anyway after a blocked attempt; on macOS 10.14 through 14, right-click the app and choose Open. Drag the app from the disk image to Applications first.',
    'pd.s3.linux':
      'On x64 Linux, the <span class="mono">.deb</span> installs with apt and the AppImage is portable: make it executable with <span class="mono">chmod +x</span> and run it. Linux packages carry no signature requirement, so there is no launch prompt. After it starts, let the initial CLI scan finish.',

    'pd.s4.title': 'First run',
    'pd.s4.p1':
      'On first launch ASC scans the machine for compatible CLIs, on the host and in compatible WSL distributions, and caches the result so later startups are fast. The scan reads directories the CLIs already own and installs nothing. You can run a rescan from the app at any time.',
    'pd.s4.p2':
      'The first scan takes seconds. Nothing leaves the machine: there is no account, no telemetry and no server of the project, and the session files stay where the CLIs put them. Afterwards, pick an agent, choose its runtime and workspace, and start the session — the native terminal runs in the main pane and ASC publishes its status around it.',

    'pd.s5.title': 'What it does',
    'pd.s5.p': 'Five things, in the order a session moves through them.',
    'pd.s5.f1.title': 'Session history, in one table',
    'pd.s5.f1.body':
      'Every session from every supported agent, with workspace path, duration and status. Browse, search, hide, or send a session to the recycle bin. The underlying files are read-only and are never modified.',
    'pd.s5.f2.title': 'AI search in plain language',
    'pd.s5.f2.body':
      'Describe what you remember — the task, a file, roughly when — and search narrows across every agent at once. You point ASC at your own OpenAI-compatible endpoint in Settings, and the desktop app calls it directly.',
    'pd.s5.f3.title': 'One-click resume',
    'pd.s5.f3.body':
      'Where a tested resume command exists, ASC reopens the session in its original working directory with the same session id. Where that directory is gone, it says so and asks you to pick another instead of failing silently.',
    'pd.s5.f4.title': 'Tokens and cost, per agent',
    'pd.s5.f4.body':
      'Usage is aggregated from the records each CLI keeps and shown per agent and per model. Cost is shown when it is known — recorded by the agent itself, or priced from a model catalogue — and left out rather than guessed when it is not.',
    'pd.s5.f5.title': 'Approvals on your phone, through Feishu',
    'pd.s5.f5.body':
      'Connect Feishu once with a QR scan. From then on, a session that stalls on a permission prompt sends a card you can act on from your phone; the decision returns to the same terminal, and the turn continues.',

    'pd.s6.title': 'The boundary of one-click resume',
    'pd.s6.p1':
      'One-click resume is implemented for three agents: Claude Code, Codex CLI and Grok Build. Each of those commands was verified against the <span class="mono">--help</span> output of the CLI on a real machine before it was offered, and the button runs in the original working directory of the session with its original session id.',
    'pd.s6.p2':
      'For every other agent the row still carries a resume button, but it is greyed out, and the reason is written on the button itself: the resume command of this CLI has not been verified on this machine, so it is not offered. A guessed command would start a new session in the wrong place and spend a turn, so the app states the gap rather than dressing an untested capability up as a working one. WorkBuddy is a partial exception: its most recent session can be opened in the WorkBuddy client.',

    'pd.s7.title': 'Data and privacy',
    'pd.s7.p1':
      'ASC reads structured events, not the screen. Status comes from the official Hooks, SSE stream, extension API or runtime events of each CLI, never from parsing the terminal bytes. An observer can go quiet without stopping your session; when it does, ASC lowers the confidence it reports rather than guessing.',
    'pd.s7.p2':
      'Nothing is uploaded to the project. There is no telemetry, no analytics, no crash reporting and no account. Session transcripts stay on the machine and are read only to build the list, total the usage and render a transcript you open.',
    'pd.s7.p3':
      'The one automatic request is an update check against this project on GitHub Releases, which <span class="mono">ASC_DISABLE_UPDATES=1</span> turns off. The AI assistant and the Feishu integration are both off until you configure them, and the Feishu connection is your own self-built app on your own tenant, not a service of the project. The complete list of outbound requests is in PRIVACY.md.',

    'pd.s8.title': 'Troubleshooting',
    'pd.s8.q1': 'The window never appears — the app flashes and exits.',
    'pd.s8.a1':
      'The GPU process most likely cannot start. This happens with virtual displays installed by remote-control software, inside VMs, and with broken GPU drivers: Chromium retries the GPU process, gives up, and exits before a window exists. Start it once with the GPU sandbox disabled: <span class="mono">&amp; "$env:LOCALAPPDATA\\Programs\\Agent Session Center\\Agent Session Center.exe" --no-sandbox</span>. Since v1.0.2 the app detects this itself and offers the same command; it never disables the GPU sandbox on its own.',
    'pd.s8.q2': 'Where does it write a log, and what is in it?',
    'pd.s8.a2':
      'The diagnostic log is at <span class="mono">%APPDATA%\\Agent Session Center\\logs\\asc-diagnostic.jsonl</span>, and the same log is shown in Settings. A GPU-process failure is recorded there with its reason and exit code, which is the fastest way to tell a GPU problem from anything else.',
    'pd.s8.q3': 'macOS blocks the app on first launch.',
    'pd.s8.a3':
      'The macOS build is unsigned and not notarized, so Gatekeeper stops it. On macOS 15 and later, try to open it once, then go to System Settings, Privacy &amp; Security, and choose Open Anyway; that button appears only after a blocked attempt. On macOS 10.14 through 14, right-click the app and choose Open. Removing the prompt for good would need notarization, which needs a paid Apple Developer Program membership this project does not have.',
    'pd.s8.q4': 'Windows or macOS warns that the file is unsigned.',
    'pd.s8.a4':
      'That is expected: no release is code-signed on any platform. Check the SHA-256 against the sidecar published beside the file on the download page, then allow it through — on Windows, More info and then Run anyway; on macOS, the Gatekeeper steps above. A matching hash proves the download is intact and is the file that was published; what it does not prove is who built it, which is the one thing a signature would add.',
    'pd.s8.q5': 'The scan does not find a CLI I just installed.',
    'pd.s8.a5':
      'The CLI scan runs at startup and is cached, so a freshly installed CLI may be missing until you rescan. Install the CLI first, then run a rescan from the app; ASC does not install agents for you. Some agents also need a one-time confirmation — Codex, for example, asks you to review and trust the ASC hook before it reports status.',

    'pd.s9.title': 'Build from source, and contribute',
    'pd.s9.p':
      'The desktop app lives at <span class="mono">github.com/fatedawn/agent-session-center</span>. Clone it, then run <span class="mono">npm install</span> and <span class="mono">npm run dev</span>; <span class="mono">npm run typecheck</span> and <span class="mono">npm run build</span> are the routine checks. Release packages must be built on their matching operating system through <span class="mono">npm run release:win</span>, <span class="mono">release:mac</span> and <span class="mono">release:linux</span>. Bug reports, reproducible edge cases and focused pull requests are welcome on GitHub; observer changes should come with a test that proves event ordering and fallback behavior. The project is Apache-2.0. This is the one section whose links point at GitHub.',

    'pd.s10.title': 'Frequently asked questions',
    'pd.s10.q1': 'How is cost counted?',
    'pd.s10.a1':
      'Usage is aggregated from the records each CLI keeps. Grok Build, Kimi Code and OpenCode bring their own recorded cost; for the rest, cost is priced from a model catalogue when the model is known, and left out rather than guessed when it is not.',
    'pd.s10.q2': 'Why does a CLI have to be started from ASC to show live status?',
    'pd.s10.a2':
      'Live status comes from hooks and environment variables ASC injects when it launches a CLI. An agent that was already running when ASC started, or one started from your own terminal, has no observer attached: it still appears in session history, but it will not show live status. Start it from ASC, or relaunch it there, to attach one.',
    'pd.s10.q3': 'Does it work with WSL, and where does it look for the CLIs?',
    'pd.s10.a3':
      'ASC discovers compatible CLIs on the host and in compatible WSL distributions, and can start sessions in either. Remote and multi-machine setups are not covered here; this documentation describes the desktop app on the machine where the agents run.',
    'pd.s10.q4': 'What happens to sessions after a reboot?',
    'pd.s10.a4':
      'History survives a reboot. Session files live on disk where the CLI wrote them, and ASC reads them again on the next launch, so past sessions remain browsable, searchable and resumable. Live status does not survive, because it describes a running process; after a reboot a session is history again until you resume it.',

    'pd.foot.note':
      'The documentation, the changelog and the downloads all live here; the GitHub icons in the header and footer link to the repository.',

    /* ── download.html ── */
    'pdl.doc.title': 'Download — Agent Session Center',
    'pdl.doc.description':
      'Download Agent Session Center 1.0.4 for Windows, Linux and macOS. Each file with its size and SHA-256, and how to verify it before you run it.',
    'pdl.h1': 'Download',
    'pdl.lede':
      'Every build is self-contained and unsigned. Pick the file for your system, check its hash against the sidecar served next to it, and run it. If you are unsure which one you need, the notes under each file say exactly what it is.',
    'pdl.version.line': 'Version 1.0.4 — released 2026-10-11',
    'pdl.os1.label': 'Windows 10 / 11 — x64',
    'pdl.os1.note':
      'Guided NSIS installer. Installs per-user by default; choose Install for all users on its first page to use Program Files instead. Unsigned, so SmartScreen prompts once.',
    'pdl.os2.label': 'Ubuntu / Debian — x64',
    'pdl.os2.note':
      'The .deb package installs with apt and adds ASC to your application menu.',
    'pdl.os3.label': 'Linux — x64',
    'pdl.os3.note':
      'Portable AppImage. Make it executable with chmod +x and run it; nothing is installed.',
    'pdl.os4.label': 'macOS — Apple silicon',
    'pdl.os4.note':
      'Disk image for arm64 Macs. Unsigned and not notarized, so Gatekeeper blocks the first launch until you allow it.',
    'pdl.os5.label': 'macOS — Intel',
    'pdl.os5.note':
      'Disk image for x64 Macs. As above: unsigned, and Gatekeeper blocks the first launch until you allow it.',
    'pdl.verify.title': 'Verify the download',
    'pdl.verify.body':
      'Every file below has a sidecar published beside it, served from this site. After downloading, check the hash. On Windows: <span class="mono">certutil -hashfile &lt;file&gt; SHA256</span>. On Linux, with the sidecar in the same directory: <span class="mono">sha256sum -c &lt;file&gt;.sha256</span>. On macOS: <span class="mono">shasum -a 256 &lt;file&gt;</span>. Replace &lt;file&gt; with the name shown on the card. A matching hash proves the download is intact and is the file that was published; it does not prove who built it.',
    'pdl.unsigned.title': 'About the unsigned warning',
    'pdl.unsigned.body':
      'No release is code-signed on any platform, so the operating system will interrupt the first launch. On Windows, SmartScreen shows a prompt: choose More info, then Run anyway. On macOS, Gatekeeper blocks the app: on macOS 15 and later, open System Settings, Privacy &amp; Security, and choose Open Anyway after a blocked attempt; on macOS 10.14 through 14, right-click the app and choose Open. Linux packages need no signature. None of this is an oversight — signing is planned but not applied for, and the SHA-256 sidecar is what makes a download checkable in the meantime.',
    'pdl.autoupdate':
      'The app checks the GitHub Releases of the project at startup and announces a new version in-app; it never installs silently. This page serves the installers themselves. <span class="mono">ASC_DISABLE_UPDATES=1</span> skips that check entirely.',
    'pdl.steps.title': 'After you download',
    'pdl.steps.win':
      'Run the installer and, if SmartScreen prompts, choose More info and then Run anyway. Launch ASC from the Start menu (type asc) and let the first CLI scan finish. Pick an agent and start a session.',
    'pdl.steps.mac':
      'Open the disk image and drag ASC to Applications. On first launch allow it through Gatekeeper (Open Anyway on macOS 15 and later, or right-click and Open on older versions), then let the scan finish and start a session.',
    'pdl.steps.linux':
      'For the AppImage, make it executable with chmod +x and run it; for the .deb, install it with apt. Launch ASC, let the first scan finish, then start a session.',
    'pdl.note':
      'The documentation, the changelog and the downloads all live here; the GitHub icons in the header and footer link to the repository.',

    /* ── changelog.html ── */
    'pc.doc.title': 'Changelog — Agent Session Center',
    'pc.doc.description':
      'Release notes for Agent Session Center, newest first: what changed in versions 1.0.0 through 1.0.4.',
    'pc.h1': 'Changelog',
    'pc.lede':
      'Every public release from 1.0.0 on, newest first. The same list is kept in the CHANGELOG.md of the repository, which also carries the pre-1.0 history.',
    'pc.noRelease.title': 'No releases to show',
    'pc.noRelease.body':
      'The release data could not be loaded. The repository CHANGELOG.md carries the full history, including the pre-1.0 releases, and the installers are on the download page.',
    'pc.downloadCta': 'Download the latest version',
    'pc.foot.note':
      'Release notes for the desktop app, in both languages. The changelog data on this page is built into the site.',

    /* ── landing page demo block (index.html) ── */
    'pld.demo.title': 'Watch it run',
    'pld.demo.body':
      'The recording below follows the real flow in 46 seconds: session history, AI search, one-click resume, per-agent usage, and a Feishu approval on a phone.',
    'pld.demo.play': 'Play full screen',
    'pld.demo.simulator': 'Open the interactive demo',
    'pld.demo.note': 'The recording is the real application.'
  })

  /* ─────────────────────────── 简体中文 ─────────────────────────── */
  Object.assign(strings.zh, {
    /* ── docs.html ── */
    'pd.doc.title': 'Agent Session Center —— 文档',
    'pd.doc.description':
      'Agent Session Center 文档：它做什么、支持哪 8 个 Coding Agent、在 Windows、Linux 和 macOS 上怎么装，以及出问题怎么排查。',
    'pd.h1': '文档',
    'pd.lede':
      'Agent Session Center（ASC）是一个开源桌面应用，支持 Windows、Linux 和 macOS。它把 8 个 AI Coding Agent 的会话历史收进一个地方：浏览和搜索会话、原地一键恢复、按 agent 查看 token 与费用，并在 agent 卡在权限确认时通过飞书把提示推到你的手机上。',
    'pd.toc.title': '本页目录',

    'pd.s1.title': '它是什么，解决什么问题',
    'pd.s1.p1':
      '不同的 agent 擅长不同的事，所以一个终端很快会变成好几个。每个 CLI 都把自己的会话按自己的格式存在自己的目录里。麻烦的从来不是启动 agent，而是过两天再想把那场会话找回来：你得同时记得用的哪个 CLI、在哪个目录、大概什么时间。',
    'pd.s1.p2':
      'ASC 读取每个 CLI 已经写在磁盘上的会话历史，在一个窗口里展示。CLI 保留自己的原生终端、继续干所有的活，ASC 补的是外围那一层 —— 实时状态、注意力提醒、悬浮监控和只读工作区浏览。它从不解析终端屏幕，只读 CLI 本来就在产生的事件流和会话文件，再从这些事件推导状态。',

    'pd.s2.title': '支持哪些 Agent',
    'pd.s2.p':
      '会话历史覆盖 8 个 Coding Agent：Claude Code、Codex CLI、OpenCode、Grok Build、Kimi Code、Pi、Antigravity 和 WorkBuddy。其中 6 个在运行时还能上报实时状态。只要 DeepSeek Harness 的 home 目录存在，它的会话也会被读到 —— 它有自己的一条观测通道。',
    'pd.s2.note':
      '各家 Harness 的可观测程度并不相同，ASC 也不会假装它们一样。每个 Adapter 只声明它在眼前这场会话里确实能证明的东西，界面展示的是这个实际档位，而不是一句品牌宣传。完整的逐列能力矩阵在交互式演示里，下面只列要点。',

    'pd.agents.r1.name': 'Claude Code',
    'pd.agents.r1.detail':
      '官方 Hooks。实时状态覆盖思考、工具、审批和完成。支持一键恢复。',
    'pd.agents.r2.name': 'Codex CLI',
    'pd.agents.r2.detail':
      'Stable Hooks。回合、工具、审批和上下文压缩。支持一键恢复。',
    'pd.agents.r3.name': 'OpenCode',
    'pd.agents.r3.detail':
      'Server + SSE。能力最深的一家：会话、思考、工具、问题和权限，也是唯一会上报消息摘要的。没有实测过的恢复命令。',
    'pd.agents.r4.name': 'Grok Build',
    'pd.agents.r4.detail':
      '官方 Hooks。回合、思考、工具、审批。支持一键恢复。它自己在用量文件里记账。',
    'pd.agents.r5.name': 'Kimi Code',
    'pd.agents.r5.detail':
      '官方 Hooks。回合、思考、工具、审批。没有实测过的恢复命令。',
    'pd.agents.r6.name': 'Pi',
    'pd.agents.r6.detail':
      'Extension API。思考、回复、工具、回合。它是唯一同时上报 token 和上下文的，而不是只给一个数。',
    'pd.agents.r7.name': 'Antigravity',
    'pd.agents.r7.detail':
      '只有会话历史。它不暴露实时事件流，因此没有实时状态。',
    'pd.agents.r8.name': 'WorkBuddy',
    'pd.agents.r8.detail':
      '只有会话历史。最近一场 WorkBuddy 会话可以在 WorkBuddy 客户端里打开。',

    'pd.s3.title': '安装',
    'pd.s3.p':
      '每个构建都自包含、且未签名。目前还没有可用的签名，所以每个系统都会在首次启动时拦一下；运行安装包之前，值得先核对公布的 SHA-256。下载页列出了每个文件的大小和哈希。',
    'pd.s3.win':
      'Windows 10 / 11 x64 用引导式 NSIS 安装包，默认按用户安装到 <span class="mono">%LOCALAPPDATA%\\Programs\\Agent Session Center</span>；想在 Program Files 里装，就在向导第一页选「为所有用户安装」。Windows SmartScreen 会提示一次，选「更多信息」再选「仍要运行」。开始菜单快捷方式叫 ASC (Agent Session Center)，敲 asc 就能搜到。',
    'pd.s3.mac':
      'macOS 构建未签名、也未公证，所以 Gatekeeper 会拦下第一次启动。在 macOS 15 及之后，被拦一次后进入「系统设置 → 隐私与安全性」，点「仍要打开」；在 macOS 10.14 到 14 上，右键点应用选「打开」。先把应用从磁盘映像拖进 Applications。',
    'pd.s3.linux':
      '在 x64 Linux 上，<span class="mono">.deb</span> 用 apt 安装，AppImage 则免安装：<span class="mono">chmod +x</span> 之后直接运行。Linux 包本来就不需要签名，所以没有启动提示。启动后等第一次 CLI 扫描跑完。',

    'pd.s4.title': '第一次启动',
    'pd.s4.p1':
      '首次启动时 ASC 会扫描本机中兼容的 CLI，覆盖主机和兼容的 WSL 发行版，并把结果缓存下来，之后启动就很快。扫描只读 CLI 自己拥有的目录，不安装任何东西。你随时可以在应用里重新扫描。',
    'pd.s4.p2':
      '首次扫描几秒钟。什么都不离开这台机器：没有账号、没有埋点、也没有项目自己的服务器，会话文件留在 CLI 写它们的地方。之后选一个 agent、选运行环境和工作区、创建会话 —— 原生终端跑在主区域，ASC 在外围同步它的状态。',

    'pd.s5.title': '它能做什么',
    'pd.s5.p': '五件事，按一场会话流经它们的顺序。',
    'pd.s5.f1.title': '会话历史，一张表',
    'pd.s5.f1.body':
      '所有受支持 agent 的每一场会话，带工作区路径、时长和状态。浏览、搜索、隐藏，或把某场会话移入回收站。底层文件只读，永远不会被修改。',
    'pd.s5.f2.title': '用自然语言做 AI 查找',
    'pd.s5.f2.body':
      '说得出你记得的东西 —— 做过什么、碰过哪个文件、大概什么时间 —— 查找就能跨所有 agent 一起缩小范围。在设置里把 ASC 指向你自己的 OpenAI 兼容端点，桌面端直连。',
    'pd.s5.f3.title': '一键恢复',
    'pd.s5.f3.body':
      '在存在实测恢复命令的地方，ASC 用同一个会话 id 在原工作目录重新打开这场会话。原目录已经不在时，它会说明这一点，让你另选一个，而不是静默失败。',
    'pd.s5.f4.title': 'token 与费用，按 agent',
    'pd.s5.f4.body':
      '用量从每个 CLI 自己的记录聚合，按 agent、按模型展示。费用只在算得出时显示 —— 要么 agent 自己记的，要么按模型价目表估算；算不出时宁可空着也不猜。',
    'pd.s5.f5.title': '审批推到手机上，经飞书',
    'pd.s5.f5.body':
      '飞书扫码接一次即可。之后卡在权限确认上的会话会给你发一张卡片，你在手机上就能处理；决定会回到同一个终端，这一轮继续往下走。',

    'pd.s6.title': '一键恢复的边界',
    'pd.s6.p1':
      '一键恢复只对三家实现：Claude Code、Codex CLI 和 Grok Build。这三条恢复命令都是在真机上对着 CLI 自己的 <span class="mono">--help</span> 实测过之后才拿出来的，按钮会在原工作目录里带着原来的会话 id 恢复。',
    'pd.s6.p2':
      '其余 agent 那行仍然有恢复按钮，但它是灰的，按钮上直接写着原因：这个 CLI 的恢复命令没有在本机验证过，因此不提供。凭猜的命令会在错误的目录里起一场新会话，还白白花掉一轮额度，所以应用把这个缺口直说出来，而不是把没验证过的能力包装成能用的。WorkBuddy 算半个例外：它的最近一场会话可以在 WorkBuddy 客户端里打开。',

    'pd.s7.title': '数据与隐私',
    'pd.s7.p1':
      'ASC 读的是结构化事件，不是屏幕。状态来自每个 CLI 官方的 Hooks、SSE 流、Extension API 或运行时事件，从不解析终端的字节流。观测者失联不会带走你的会话；真的失联时，ASC 会降低上报的置信度，而不是猜一个。',
    'pd.s7.p2':
      '不会向项目方上传任何东西。没有埋点、没有分析、没有崩溃上报、没有账号。会话记录留在本机，只用来生成列表、汇总用量，以及渲染你自己打开的那份记录。',
    'pd.s7.p3':
      '唯一自动发起的请求是向项目在 GitHub 上的 Release 检查更新，可用 <span class="mono">ASC_DISABLE_UPDATES=1</span> 关掉。AI 助手和飞书集成在你配置之前都是关闭的，飞书连的是你自己自建的应用、你自己的租户，不是项目方的服务。全部对外请求的清单在 PRIVACY.md。',

    'pd.s8.title': '排查问题',
    'pd.s8.q1': '窗口压根没出现 —— 应用闪一下就退了。',
    'pd.s8.a1':
      '多半是 GPU 进程起不来。装了远程控制软件的虚拟显示器、跑在虚拟机里、或显卡驱动有问题时都可能触发：Chromium 重试几次 GPU 进程后放弃，窗口还没创建就退出了。可以用关闭 GPU 沙箱的方式启动一次：<span class="mono">&amp; "$env:LOCALAPPDATA\\Programs\\Agent Session Center\\Agent Session Center.exe" --no-sandbox</span>。从 v1.0.2 起应用自己会检测到这种情况并给出同一条命令；它绝不会自行关闭 GPU 沙箱。',
    'pd.s8.q2': '它把日志写在哪，里面有什么？',
    'pd.s8.a2':
      '诊断日志在 <span class="mono">%APPDATA%\\Agent Session Center\\logs\\asc-diagnostic.jsonl</span>，同一份日志在设置里也能看到。GPU 进程的失败会带着 reason 和 exitCode 记在里面，这是分辨「是不是 GPU 问题」最快的办法。',
    'pd.s8.q3': 'macOS 在第一次启动时拦下了应用。',
    'pd.s8.a3':
      'macOS 构建未签名也未公证，所以 Gatekeeper 会拦住它。在 macOS 15 及之后，先尝试打开一次，然后进「系统设置 → 隐私与安全性」点「仍要打开」；这个按钮只有在你被拦过一次之后才会出现。在 macOS 10.14 到 14 上，右键点应用选「打开」。要彻底消除提示就得做公证，而公证需要付费的 Apple Developer Program 会员，本项目没有。',
    'pd.s8.q4': 'Windows 或 macOS 提示文件未签名。',
    'pd.s8.a4':
      '这是预期内的：没有任何平台带代码签名。先拿下载页文件旁边公布的 .sha256 校验文件核对哈希，再放行 —— Windows 上选「更多信息」再选「仍要运行」，macOS 上走上面的 Gatekeeper 步骤。哈希对得上只能证明下载完整、且就是被发布的那个文件；它证明不了是谁构建的，而那正是签名才能补上的一件事。',
    'pd.s8.q5': '扫描找不到我刚装好的 CLI。',
    'pd.s8.a5':
      'CLI 扫描只在启动时跑一次并缓存结果，所以刚装好的 CLI 可能要重新扫描才会出现。先装好 CLI，再从应用里重新扫描一次；ASC 不会替你安装 agent。部分 agent 还需要一次人工确认 —— 比如 Codex 会要求你检查并信任 ASC 的 Hook，之后才会上报状态。',

    'pd.s9.title': '从源码构建，以及参与贡献',
    'pd.s9.p':
      '桌面程序在 <span class="mono">github.com/fatedawn/agent-session-center</span>。克隆下来后跑 <span class="mono">npm install</span> 和 <span class="mono">npm run dev</span>；<span class="mono">npm run typecheck</span> 和 <span class="mono">npm run build</span> 是常规检查。发布包必须在对应系统上通过 <span class="mono">npm run release:win</span>、<span class="mono">release:mac</span>、<span class="mono">release:linux</span> 构建。欢迎在 GitHub 上提 Bug、可复现的边界情况和小范围 PR；改观测者时请附上能证明事件顺序和降级行为的测试。项目使用 Apache-2.0。这是唯一一处链接指向 GitHub 的章节。',

    'pd.s10.title': '常见问题',
    'pd.s10.q1': '费用是怎么算出来的？',
    'pd.s10.a1':
      '用量从每个 CLI 自己的记录聚合。Grok Build、Kimi Code 和 OpenCode 会把自己记的费用带出来；其余各家的费用在模型已知时按模型价目表估算，不知道时宁可空着也不猜。',
    'pd.s10.q2': '为什么 CLI 要由 ASC 启动才有实时状态？',
    'pd.s10.a2':
      '实时状态来自 ASC 启动 CLI 时注入的 hook 和环境变量。ASC 启动之前就已经在跑的 agent、或你在自己终端里起的 agent，都没有挂上观测者：它仍会出现在会话历史里，但不会有实时状态。要挂上观测者，就从 ASC 启动它，或在 ASC 里重新启动。',
    'pd.s10.q3': '支持 WSL 吗？它去哪里找 CLI？',
    'pd.s10.a3':
      'ASC 会扫描主机和兼容的 WSL 发行版里的 CLI，两边都能启动会话。本页不覆盖远程和多机部署；这里描述的是「agent 跑在哪台机器上、应用就在哪台机器上」的桌面用法。',
    'pd.s10.q4': '重启电脑之后会话会怎样？',
    'pd.s10.a4':
      '历史不受影响。会话文件留在磁盘上 CLI 写它们的位置，ASC 下次启动会重新读取，所以过去的会话仍然可浏览、可搜索、可恢复。实时状态不会保留，因为它描述的是一个正在运行的进程；重启之后，一场会话在恢复之前就又属于历史了。',

    'pd.foot.note':
      '文档、更新日志和下载都在本站内；页头与页脚的 GitHub 图标指向仓库。',

    /* ── download.html ── */
    'pdl.doc.title': 'Agent Session Center —— 下载',
    'pdl.doc.description':
      '下载 Agent Session Center 1.0.4，支持 Windows、Linux 和 macOS。每个文件都带大小和 SHA-256，以及运行前的校验方法。',
    'pdl.h1': '下载',
    'pdl.lede':
      '每个构建都自包含、且未签名。按你的系统挑一个文件，先用旁边那份 .sha256 校验文件核对哈希，再运行。不确定该下哪个，就看每个文件下面的说明。',
    'pdl.version.line': '版本 1.0.4 —— 发布于 2026-10-11',
    'pdl.os1.label': 'Windows 10 / 11 —— x64',
    'pdl.os1.note':
      '引导式 NSIS 安装包。默认按用户安装；想在 Program Files 里装，就在向导第一页选「为所有用户安装」。未签名，SmartScreen 会提示一次。',
    'pdl.os2.label': 'Ubuntu / Debian —— x64',
    'pdl.os2.note':
      '.deb 包用 apt 安装，并会把 ASC 加进应用菜单。',
    'pdl.os3.label': 'Linux —— x64',
    'pdl.os3.note':
      '免安装 AppImage。用 chmod +x 让它可执行后直接运行，不写入系统。',
    'pdl.os4.label': 'macOS —— Apple 芯片',
    'pdl.os4.note':
      '给 arm64 Mac 的磁盘映像。未签名也未公证，首次启动会被 Gatekeeper 拦下，需手动放行。',
    'pdl.os5.label': 'macOS —— Intel',
    'pdl.os5.note':
      '给 x64 Mac 的磁盘映像。同上：未签名，首次启动会被 Gatekeeper 拦下，需手动放行。',
    'pdl.verify.title': '校验下载',
    'pdl.verify.body':
      '下面每个文件都配了一份同样命名的 .sha256 校验文件，由本站提供。下载完成后核对哈希。Windows：<span class="mono">certutil -hashfile &lt;file&gt; SHA256</span>。Linux，把校验文件放在同一目录：<span class="mono">sha256sum -c &lt;file&gt;.sha256</span>。macOS：<span class="mono">shasum -a 256 &lt;file&gt;</span>。把 &lt;file&gt; 换成卡片上显示的文件名。哈希对得上只能证明下载完整、且就是被发布的那个文件；它证明不了是谁构建的。',
    'pdl.unsigned.title': '关于未签名提示',
    'pdl.unsigned.body':
      '没有任何平台带代码签名，所以系统会在首次启动时拦一下。Windows 上 SmartScreen 会弹提示：选「更多信息」，再选「仍要运行」。macOS 上 Gatekeeper 会拦下应用：macOS 15 及之后，被拦一次后进「系统设置 → 隐私与安全性」点「仍要打开」；macOS 10.14 到 14 上，右键点应用选「打开」。Linux 包本来就不需要签名。这些都不是疏忽 —— 签名有计划但尚未申请，在此之前，让下载可核对的东西是那份 SHA-256。',
    'pdl.autoupdate':
      '应用在启动时检查项目的 GitHub Releases，并在应用内提示新版本；它绝不静默安装。本站提供的是安装包本身。设 <span class="mono">ASC_DISABLE_UPDATES=1</span> 可以完全跳过这次检查。',
    'pdl.steps.title': '下载之后',
    'pdl.steps.win':
      '运行安装包；SmartScreen 提示时选「更多信息」再选「仍要运行」。从开始菜单启动 ASC（敲 asc 就能搜到），等第一次 CLI 扫描跑完。选一个 agent，创建会话。',
    'pdl.steps.mac':
      '打开磁盘映像，把 ASC 拖进 Applications。首次启动时过一遍 Gatekeeper（macOS 15 及以上点「仍要打开」，更早的版本右键选「打开」），然后等扫描结束，开始一场会话。',
    'pdl.steps.linux':
      'AppImage 的话，先让它可执行再运行；.deb 的话用 apt 安装。启动 ASC，等第一次扫描结束，然后开始一场会话。',
    'pdl.note':
      '文档、更新日志和下载都在本站内；页头与页脚的 GitHub 图标指向仓库。',

    /* ── changelog.html ── */
    'pc.doc.title': 'Agent Session Center —— 更新日志',
    'pc.doc.description':
      'Agent Session Center 的版本说明，最新在前：1.0.0 到 1.0.4 分别改了什么。',
    'pc.h1': '更新日志',
    'pc.lede':
      '从 1.0.0 起的每一次公开发布，最新在前。同一份列表也维护在仓库的 CHANGELOG.md 里，那里还包含 1.0 之前的历史。',
    'pc.noRelease.title': '没有可显示的版本',
    'pc.noRelease.body':
      '版本数据没能加载出来。完整历史（含 1.0 之前）在仓库的 CHANGELOG.md 里，安装包在下载页。',
    'pc.downloadCta': '下载最新版本',
    'pc.foot.note':
      '这是桌面应用的版本说明，中英双语。本页的更新数据随站点一起构建。',

    /* ── 落地页演示区块（index.html） ── */
    'pld.demo.title': '看它跑起来',
    'pld.demo.body':
      '下面这段录屏用 46 秒走了一遍真实操作：会话历史、AI 查找、一键恢复、按 agent 的用量，以及手机上的一次飞书审批。',
    'pld.demo.play': '全屏播放',
    'pld.demo.simulator': '打开交互式演示',
    'pld.demo.note': '录屏是真实应用。'
  })
})()
