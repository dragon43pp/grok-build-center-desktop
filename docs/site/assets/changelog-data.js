/* Agent Session Center — changelog data for changelog.html.
 *
 * One entry per public release, newest first, in both languages. Written by
 * hand from the GitHub Releases and CHANGELOG.md, so this file has no build
 * step and no network call: the page renders straight from it.
 *
 * Each release must have the same number of bullets in both languages.
 */
;(function () {
  'use strict'
  window.ASCDemo = window.ASCDemo || {}

  window.ASCDemo.changelog = {
    /* ─────────────────────────── English ─────────────────────────── */
    en: [
      {
        tag: '1.0.7',
        date: '2026-10-13',
        title: 'Fork a session from the sidebar',
        bullets: [
          'Fork session (branch from here): right-click any session to copy its full conversation context into a brand-new session. The original stays untouched. Built on the native --fork-session flag, available for Claude Code and Grok Build.',
          'Fork session (with git worktree): fork the conversation and create a git worktree automatically — a sibling directory <repo-root>-fork-<timestamp> with a new branch asc-fork-<timestamp> — so both sessions edit code side by side. Created from the current HEAD; uncommitted changes are not carried over.',
          'Agents whose fork support has not been verified (Codex CLI, OpenCode, Kimi Code, Pi, Antigravity) do not show the fork entry.'
        ]
      },
      {
        tag: '1.0.6',
        date: '2026-10-12',
        title: 'Several computers share one Feishu bot',
        bullets: [
          'Name this computer in Settings. Another computer joins with the same App ID and App Secret; do not scan again, or the scan creates a different bot. Paste the first computer\'s Bitable link to join the same base.',
          'One chat covers every computer. /电脑 shows who is online, /列表 groups sessions by computer, and /继续 电脑名 序号 opens the session on the computer that has the files.',
          'A session is not opened on a different computer. Without a multi-computer roster, /继续 序号 still opens on this machine, and /打开 and /dsh without a computer name keep their previous local behavior.'
        ]
      },
      {
        tag: '1.0.5',
        date: '2026-10-12',
        title: 'WorkBuddy AI opens in place, and the crash loop stops',
        bullets: [
          'WorkBuddy AI sessions are listed from ~/.workbuddy-ai and opened with workbuddy-ai://chat/<id>. Domestic WorkBuddy uses workbuddy://chat/<id>. Every listed session can be opened. The jump lands in the client conversation.',
          'AI search gains two independent switches, both off until you turn them on: a scheduled local read that writes detailed summaries, and search that matches titles together with message text. Indexes stay in ASC userData.',
          'A send to a disposed render frame no longer floods the diagnostic log. The main window reloads at most three times in 60 seconds, closes the terminals from that page first, and stops with a dialog if it keeps crashing.'
        ]
      },
      {
        tag: '1.0.4',
        date: '2026-10-11',
        title: 'A smaller installer, and Chinese-first docs',
        bullets: [
          'The Windows installer drops from 93.95 MiB to 81.78 MiB (-12.95%) with no feature removed. Eight Electron runtime files the app never loads are gone (dxcompiler.dll, dxil.dll, d3dcompiler_47.dll, debug.log, chrome_200_percent.pak and the SwiftShader trio, 38,498,255 bytes uncompressed), along with node_modules dead weight that took app.asar from 37,777,655 to 24,439,265 bytes.',
          'What left the package: the Feishu SDK\'s ESM twin, node-pty\'s compile-time trees and its win32-arm64 prebuild, protobufjs\'s standalone browser bundle, and every source map. A new afterPack gate reads the app.asar entry list and aborts the build if any of them returns.',
          'The README, CHANGELOG and release notes now lead with Chinese, with the English half in the same document after a rule.'
        ]
      },
      {
        tag: '1.0.3',
        date: '2026-10-10',
        title: 'The 16 bundled themes that never rendered',
        bullets: [
          '16 of the 18 bundled UI themes rendered as ASC Light. Every theme except the two ASC ones was missing one color token (bg.hover), so the resolver rejected it at startup and the renderer fell back to the safe light palette — picking Dracula, Nord or Gruvbox in Settings still showed plain ASC Light. All 16 now carry a hover tint derived from their own palette.',
          'A missing token no longer falls back to the emergency palette. The renderer falls back to the same-type built-in theme and reports which tokens were inherited, and a new build-time gate (assert:themes, wired into npm run build) fails the build if any bundled theme lacks or misnames a token.',
          'The exit-time Error sending from webFrameMain: Render frame was disposed noise is gone. The main process stops broadcasting state once quitting has started.'
        ]
      },
      {
        tag: '1.0.2',
        date: '2026-10-10',
        title: 'The startup crash that now explains itself',
        bullets: [
          'A machine where the GPU process cannot start no longer exits silently. The main process records the reason and exit code into the diagnostic log and, after repeated failures, shows a dialog with the exact command to relaunch once with --no-sandbox. The app never disables the GPU sandbox on its own.',
          'Windows shortcuts are renamed to ASC (Agent Session Center), so typing asc into the Start menu finds the app. The installer renames existing shortcuts in place during the upgrade.',
          'Documented where the Windows installer puts the app by default (%LOCALAPPDATA%\\Programs\\Agent Session Center, per-user) and how to install for all users instead.',
          'Added a "the window never appears" troubleshooting section to both READMEs, covering the --no-sandbox workaround and the diagnostic log path.'
        ]
      },
      {
        tag: '1.0.1',
        date: '2026-10-07',
        title: 'DeepSeek Harness joins history, and the bundled Live2D runtime leaves',
        bullets: [
          'DeepSeek Harness sessions appear in session history, read from the DeepSeek Harness home directory ($DSH_HOME, default ~/.dsh) that the dsh CLI and DSH Desktop share.',
          'A DSH session can be opened in the ASC DSH surface with a resume intent (Open in DSH), and a Feishu /dsh command can raise one on the desktop from your phone.',
          'The bundled Live2D floating-window skins are removed, along with the Live2D Cubism Core runtime and the Mao sample model (48 files, 4.9 MB on disk). The installer no longer contains any component under a non-open-source licence.',
          'The Sunny Buddy example renderer is removed. Custom floating-window renderers still work; the direction is now compact status panels rather than animated characters.',
          'NOTICE gains the change notice required by Apache-2.0 section 4(b), and LICENSE gains an upstream attribution section. The READMEs are marked early 1.x: fine for daily use, but configuration keys and the hub/ layout may still change within the 1.x line.'
        ]
      },
      {
        tag: '1.0.0',
        date: '2026-10-06',
        title: 'First public release',
        bullets: [
          'Agent Session Center is a desktop session center for eight AI coding agents: Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy. The CLIs keep their native TUI and do all the work.',
          'One table for every session: session history reads what each CLI wrote to disk, across all eight sources. Browse, semantic search, hide, or send to the recycle bin; the underlying files are never modified.',
          'Resume in place where an agent exposes a resumable session, with an honest split of what is resumable and why the rest is not.',
          'Live status for six harnesses through their official Hooks, SSE or extension APIs, plus tokens and cost per agent, a read-only workspace viewer, custom floating renderers, five UI languages and a built-in updater.',
          'Attention push and mobile approval through Feishu, and an AI assistant you point at your own OpenAI-compatible endpoint.',
          'v1.0.0 ships Windows x64 artifacts; the macOS and Linux targets are configured but must be built on their own operating systems.'
        ]
      }
    ],

    /* ─────────────────────────── 简体中文 ─────────────────────────── */
    zh: [
      {
        tag: '1.0.7',
        date: '2026-10-13',
        title: '侧栏会话一键分叉',
        bullets: [
          'Fork 会话（分支继续）：侧栏会话右键即可把整段对话上下文复制成一条全新会话接着聊，原会话原样保留。基于 CLI 原生 --fork-session 能力，当前支持 Claude Code 与 Grok Build。',
          'Fork 会话（连代码分叉）：分叉对话的同时自动创建 git worktree —— 仓库旁的兄弟目录 <仓库根>-fork-<时间戳> 配新分支 asc-fork-<时间戳>，两个会话并行改代码互不干扰。worktree 基于当前 HEAD 创建，未提交的改动不会带过去。',
          '未实测 fork 能力的 agent（Codex CLI、OpenCode、Kimi Code、Pi、Antigravity）不显示分叉入口。'
        ]
      },
      {
        tag: '1.0.6',
        date: '2026-10-12',
        title: '多台电脑共用一个飞书机器人',
        bullets: [
          '设置里给这台电脑起名。另一台手动填同一套 App ID 和 App Secret，不要再扫码；再扫会变成另一个机器人。也可以把第一台的多维表格链接贴进设置，接上同一张表。',
          '飞书里仍是一个对话。/电脑 看谁在线，/列表 按电脑列出，/继续 电脑名 序号 在拥有文件的那台打开。',
          '会话不会在另一台电脑上打开。没有多电脑名单时，/继续 序号 仍在本机打开；/打开 和 /dsh 不带电脑名时，仍按原来的本机行为。'
        ]
      },
      {
        tag: '1.0.5',
        date: '2026-10-12',
        title: 'WorkBuddy AI 能打开对应对话，崩溃不再打成循环',
        bullets: [
          'WorkBuddy AI 的会话从 ~/.workbuddy-ai 读入列表，打开时走 workbuddy-ai://chat/<id>。国内 WorkBuddy 走 workbuddy://chat/<id>。历史里列出的每一场都能开，跳进客户端里的那一场。',
          'AI 查找增加两个各自独立的开关，默认都关：定期读本机消息并写详细概要，以及同时搜索标题和消息正文。索引留在 ASC 自己的 userData 里。',
          '发往已销毁渲染帧的消息不再灌爆诊断日志。主窗口 60 秒内最多重载 3 次，重载前先结束这一页带起来的终端；还在崩就停，并弹出指向诊断日志的说明。'
        ]
      },
      {
        tag: '1.0.4',
        date: '2026-10-11',
        title: '更小的安装包，中文优先的文档',
        bullets: [
          'Windows 安装包从 93.95 MiB 降到 81.78 MiB（−12.95%），功能一个没少。应用从不加载的 8 个 Electron 运行时文件被裁掉（dxcompiler.dll、dxil.dll、d3dcompiler_47.dll、debug.log、chrome_200_percent.pak 与 SwiftShader 三件套，未压缩合计 38,498,255 字节），再加上 node_modules 死重，app.asar 从 37,777,655 字节降到 24,439,265 字节。',
          '不再进包的东西：飞书 SDK 的 ESM 双胞胎、node-pty 的编译期目录与 win32-arm64 prebuild、protobufjs 的独立浏览器 bundle，以及全部 source map。新增的 afterPack 门禁会读取 app.asar 条目清单，一旦它们回来就直接中止打包。',
          'README、CHANGELOG 与 Release 正文改为中文优先，英文放在同一篇文档的 --- 之后。'
        ]
      },
      {
        tag: '1.0.3',
        date: '2026-10-10',
        title: '16 个一直没生效的内置主题',
        bullets: [
          '18 个内置界面主题里有 16 个实际上渲染成了 ASC Light。除两个 ASC 主题外，每个都缺了同一个颜色 token（bg.hover），解析器因此在启动时拒绝它们，渲染器回落到安全的浅色面板 —— 在设置里选 Dracula、Nord 或 Gruvbox，看到的还是 ASC Light。这 16 个现在各自带上了从自己色板推导出的悬停色。',
          '缺 token 时不再回落到应急色板。渲染器改为回落到同类型的内置主题，并明确说出继承了哪些 token；新增的构建门禁（assert:themes，接进 npm run build）会在任何内置主题缺 token 或写错 token 名时直接让构建失败。',
          '退出时的 Error sending from webFrameMain: Render frame was disposed 噪声消失。开始退出之后，主进程不再广播状态。'
        ]
      },
      {
        tag: '1.0.2',
        date: '2026-10-10',
        title: '启动闪退现在会说明原因',
        bullets: [
          'GPU 进程起不来的机器不再静默退出。主进程把 reason 和 exitCode 记进诊断日志，并在反复失败后弹窗给出用 --no-sandbox 重启一次的具体命令。应用绝不会自行关闭 GPU 沙箱。',
          'Windows 快捷方式改名为 ASC (Agent Session Center)，在开始菜单里敲 asc 就能搜到。升级时安装包会就地重命名已有快捷方式，不会留下重复项。',
          '写明 Windows 安装包默认装在哪（%LOCALAPPDATA%\\Programs\\Agent Session Center，按用户），以及怎么改成对所有用户安装。',
          '两份 README 都新增「窗口压根没出现」排查章节，覆盖 --no-sandbox 办法和诊断日志路径。'
        ]
      },
      {
        tag: '1.0.1',
        date: '2026-10-07',
        title: 'DeepSeek Harness 进入会话历史，随包 Live2D 运行时移除',
        bullets: [
          'DeepSeek Harness 会话进入会话历史，从 dsh CLI 与 DSH Desktop 共用的家目录读取（$DSH_HOME，默认 ~/.dsh）。',
          'DSH 会话可以在 ASC 的 DSH 界面里带恢复意图打开（Open in DSH）；手机上的飞书 /dsh 命令也能把一场 DSH 会话拉起到桌面端。',
          '随包携带的 Live2D 悬浮窗皮肤被移除，连同 Live2D Cubism Core 运行时与 Mao 样例模型（48 个文件，磁盘 4.9 MB）。安装包里不再有任何非开源许可的组件。',
          'Sunny Buddy 示例渲染器被移除。自定义悬浮窗渲染器仍然可用，方向转为紧凑的状态面板而非动画角色。',
          'NOTICE 补入 Apache-2.0 第 4(b) 条要求的改动声明，LICENSE 补入上游归属段。两份 README 标明项目处于 1.x 早期：可用于日常使用，但配置项命名与 hub/ 目录结构仍可能在 1.x 内调整。'
        ]
      },
      {
        tag: '1.0.0',
        date: '2026-10-06',
        title: '首个公开版本',
        bullets: [
          'Agent Session Center 是一个面向 8 个 AI Coding Agent 的桌面会话中心：Claude Code、Codex CLI、OpenCode、Grok Build、Kimi Code、Pi、Antigravity 和 WorkBuddy。原生 TUI 一点不动，干活的原样干活。',
          '一场会话一张表：会话历史读取每个 CLI 写到磁盘的记录，8 个来源全覆盖。浏览、语义搜索、隐藏，或移入回收站；底层文件永远不会被碰。',
          '在该 Agent 提供可恢复会话的地方原地恢复，并如实区分哪些能恢复、其余为什么不能。',
          '6 个 harness 经官方 Hooks、SSE 或 Extension API 上报实时状态；另有按 agent 的 token 与费用、只读工作区浏览、自定义悬浮窗渲染器、5 种界面语言和内置更新器。',
          '经飞书的注意力推送与手机审批，以及指向你自己 OpenAI 兼容端点的 AI 助手。',
          'v1.0.0 只发 Windows x64 产物；macOS 与 Linux 目标已配置，但必须在各自系统上构建。'
        ]
      }
    ]
  }
})()
