<p align="right">
  <a href="#english">English</a>
</p>

## 中文

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/readme/asc-wordmark-dark.png">
    <img src="./assets/readme/asc-wordmark-light.png" width="370" alt="Agent Session Center">
  </picture>

  <h3>一个中心管 8 个 Coding Agent</h3>
  <p>查找、恢复、分叉、接力每场会话——审批直接推到手机上。</p>

  <p>
    <a href="./LICENSE"><img alt="开源协议：Apache-2.0" src="https://img.shields.io/github/license/fatedawn/agent-session-center?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/releases"><img alt="最新版本" src="https://img.shields.io/github/v/release/fatedawn/agent-session-center?style=flat-square&label=release"></a>
    <a href="https://github.com/fatedawn/agent-session-center/releases"><img alt="下载量" src="https://img.shields.io/github/downloads/fatedawn/agent-session-center/total?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/stargazers"><img alt="Star 数" src="https://img.shields.io/github/stars/fatedawn/agent-session-center?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/commits/main"><img alt="最近提交" src="https://img.shields.io/github/last-commit/fatedawn/agent-session-center?style=flat-square"></a>
  </p>

  <img src="./docs/demo/asc-demo-zh.gif" width="1100" alt="Agent Session Center：8 个 Coding Agent 的会话历史、AI 会话查找、一键恢复、按 Agent 统计用量，以及飞书推送到手机审批">
  <p><sub>会话历史 → AI 查找 → 一键恢复 → 用量与费用 → 飞书审批。 <a href="./docs/demo/asc-demo-zh.mp4">看完整 46 秒视频</a>。</sub></p>
</div>

**Agent Session Center（ASC）** 是一个面向 **8 个 AI Coding Agent** 的桌面会话中心——Claude Code、Codex CLI、OpenCode、Grok Build、Kimi Code、Pi、Antigravity 和 WorkBuddy。浏览并搜索每个 CLI 写到磁盘的会话，一键恢复；当 Agent 停在审批上时，飞书推送把它送到你的手机上——点一下就放行。

干活的原生 TUI 一点不动，ASC 补上的正是外围缺失的那一层：实时状态、注意力提醒、悬浮监控、快速启动和只读工作区浏览。Python 会话工具和飞书助手是同一套产品，在 [`hub/`](./hub)。

## 上游

早期原型源自 [UniRound-Tec/hrack](https://github.com/UniRound-Tec/hrack)（Apache-2.0），该项目与本项目无隶属关系。Agent Session Center 是一个独立维护的硬分叉（hard fork）——拥有自己的身份、路线图和发布渠道，不跟随上游的代码、分支或 Release。本仓库内的全部文件均由本项目维护。署名、改动摘要与继承范围的实测数据见 [NOTICE](./NOTICE)。

上游不发布任何已签名的构建；本项目也不会用本项目的证书去签上游的二进制，更不会以上游名义或本项目名义再分发上游二进制。

## 解决什么问题？

不同 Coding Agent 各有所长，所以一个终端很快就会变成好几个。真正麻烦的不是把它们启动起来，而是一直看着它们：

- 切去做别的事，过一会儿回来，才发现 Agent 一直停在权限确认上白等。Codex 和 Gemini CLI 的用户都提出过类似的提醒需求（[Codex](https://github.com/openai/codex/issues/10081)、[Gemini CLI](https://github.com/google-gemini/gemini-cli/issues/14696)）。
- 同时跑几个 Agent 以后，人又开始在终端标签页之间来回找：“到底哪个在等我？”类似问题也出现在 [HN 的多 Agent 工作流讨论](https://news.ycombinator.com/item?id=47268777) 和 [tmux-claude-session-manager](https://github.com/craftzdog/tmux-claude-session-manager) 这类工具里。
- 有通知也不一定管用：它可能根本没触发（[Codex #8929](https://github.com/openai/codex/issues/8929)），不知道 Agent 正在等回答（[Codex #13478](https://github.com/openai/codex/issues/13478)），或者漏掉交互式 Shell 的输入等待（[Gemini CLI #19527](https://github.com/google-gemini/gemini-cli/issues/19527)）。

Agent Session Center 想解决的就是这些每天都会碰到的小麻烦：把会话放在一起，告诉你谁需要处理，再把你带回正确的位置。真正干活的仍然是原来的 CLI，Agent Session Center 只是让你不用一直盯着它。

## 怎么解决？

第一次启动时，Agent Session Center 会自动扫描主机和 WSL 中兼容的 CLI；之后直接使用缓存快速启动，也可以随时手动重扫。每个已支持的 Harness 都有自己的 Adapter，把官方 Hooks、SSE、Extension API 或运行时事件收敛成同一套事件，再从事件推导状态——而不是从终端屏幕上猜。

<div align="center">
  <img src="./assets/readme/architecture-zh.svg" width="1100" alt="架构：CLI 的原生 TUI 留在 PTY 里，Hooks、JSONL、RPC/ACP、原生流、transcript 与生命周期事件另行汇入 normalizer、按 seq 排序的 queue、reducer 和 projector，再驱动侧边栏、悬浮窗、会话历史与飞书推送">
</div>

这个形状带来三条性质，它们比任何功能清单都更重要：

- **终端字符流从不被解析。** CLI 的 TUI 里全是制表符、转圈动画和颜色。状态一个字节都不从那里读，Observer 订阅的是结构化事件。
- **顺序来自 `seq`，不来自墙上时间。** Hook 会重放、RPC 会断线重连、transcript 可能被 tail 两遍。每个事件都带每会话单调递增的序号和原生 id，靠它们去重并还原真实顺序。
- **Observer 挂掉不会带走你的会话。** 它挂掉时 PTY 照常运行，ASC 降级的是**显示**——`observerHealth` 变 `stale`、`statusConfidence` 降到 `low`——而不是你正在用的那个 CLI。

## 它只被允许说什么

状态是事实的投影，不是猜测。一共只有六个状态，其中只有一个会来问你。

<div align="center">
  <img src="./assets/readme/status-zh.svg" width="1100" alt="六个状态 —— needs-you、working、done、error、idle、exited，其中只有 needs-you 会发光">
</div>

珊瑚色 `#FF6B4A` 是整个产品里唯一会发光的颜色，它只代表一件事：**这场会话卡在等你确认。** 其余全是实心圆点。这条规则是刻意的——如果好几个东西同时抢注意力，那就等于没有注意力。

## 注意力闭环

整个产品就这一张图。六个 Agent，一杯咖啡的时间。

<div align="center">
  <img src="./assets/readme/attention-zh.svg" width="1100" alt="六个会话并排跑：五个从不打扰你，一个卡在审批上，经飞书到达手机，一次点击后回到同一个 PTY 继续">
</div>

你不在的这段时间，另外五个照常干活，从不打扰你。卡在审批上的那一个会以卡片形式到达你的手机；在那里放行之后，决定会回到同一个 PTY，这一轮继续往下走——没有重启，也没有丢东西。

## 每个 Agent 能报告到什么程度

各家 Harness 的可观测程度并不一样，而假装一样是一篇 README 最容易撒的谎。每个 Adapter 只声明它**在眼前这场会话里能证明**的能力，界面展示的是这个实际级别，而不是一句品牌宣传。

<div align="center">
  <img src="./assets/readme/capabilities-zh.svg" width="1100" alt="能力矩阵：DeepSeek Harness、Claude Code、Codex CLI、Grok Build、Kimi Code、OpenCode、Pi 在 thinking、tools、approvals、input requests、usage、messages 六个维度上的实际级别">
</div>

先看右边的三列，差距在那里。**OpenCode** 走得最远，也是唯一会报告消息摘要的一个；**Pi** 则是唯一同时报告 tokens 与 context、而不是只给一个数字的。左边的列是所有 Harness 都有的：思考阶段与工具生命周期，家家都有。

实时观测与会话历史是分开的两层。读一个 CLI 写到磁盘上的东西，并不需要它的运行时暴露任何接口：

| 来源 | 实时状态 | 会话历史 |
| --- | --- | --- |
| DeepSeek Harness、Claude Code、Codex CLI、OpenCode、Pi、Kimi Code、Grok Build | 有 | 有 |
| Antigravity、WorkBuddy | 暂无 | 有 |

九个来源都能读历史会话——8 个 Coding Agent 加上 DeepSeek Harness。浏览、搜索、token 用量，以及在该 Agent 提供可恢复会话时的恢复。这两层是分开的 —— 能读历史，不代表能读到它的运行时事件流。

### 接入方式明细

| Harness | 接入方式 | Agent Session Center 可获得的状态 | 运行环境 |
| --- | --- | --- | --- |
| DeepSeek Harness | 官方 Web 页面 + Runtime Bridge | 已关注会话与生命周期 | 主机、WSL |
| Claude Code | 官方 Hooks | 思考、工具、审批、完成状态 | 主机、WSL |
| Codex CLI | Stable Hooks | 回合、工具、审批、上下文压缩 | 主机、WSL |
| OpenCode | Server + SSE | 会话、思考、工具、问题、权限 | 主机、WSL |
| Pi | Extension API | 思考、回复、工具、回合 | 主机、WSL |
| Kimi Code | 官方 Hooks | 回合、思考、工具、审批 | 主机、WSL |
| Grok Build | 官方 Hooks | 回合、思考、工具、审批 | 主机、WSL |

Agent Session Center 还可以扫描并启动 Devin CLI、Cline、Qwen Code、Amp、Aider、Goose、Kiro CLI、GitHub Copilot CLI 等注册表入口。仅启动接入的 CLI 暂时不会提供同等级别的状态细节。

字段深度因来源而异。标题、时间、轮数、token 用量各家都有。费用只在算得出时显示 —— 要么是 Agent 自己记的，要么按模型价目表估算；模型不在价目表里时宁可空着也不猜。逐轮 recap 与代码漂移检测目前只有 Grok Build 支撑，因为它来自 `summary.json`；其他几家的会话文件里根本没记这些数据，无从读起。这是上游数据格式的限制，不是待办事项。

## 特性

### 一句话让 AI 帮你找会话

用一句话描述你要找什么——「把飞书审批卡片接起来的那场会话」——ASC 会把命中的会话和它的回答一起给你。助手端点由你自己配置，桌面端直连，不经第三方服务中转。

<div align="center">
  <img src="./docs/shots/zh/03-ai-search.png" width="1100" alt="Agent Session Center 用一句话检索会话，并列出命中的会话">
</div>

### 原地恢复，恢复不了就直说

Agent 提供可恢复会话时，ASC 支持一键在原工作目录恢复；原目录已经不在时，它会说明这一点，让你另选一个，而不是静默失败。

<div align="center">
  <img src="./docs/shots/zh/04-resume.png" width="1100" alt="Agent Session Center 一键恢复可恢复会话">
  <img src="./docs/shots/zh/04b-resume-missing-cwd.png" width="1100" alt="Agent Session Center 说明某个会话因原工作目录已不存在而无法恢复">
</div>

### Token 与费用，按 Agent 分列

用量从每个 CLI 自己的记录聚合而来。Grok Build 自己记账；其余家的费用在模型已知时按模型价目表估算，模型不在价目表里时宁可空着也不猜。

<div align="center">
  <img src="./docs/shots/zh/05-usage.png" width="1100" alt="Agent Session Center 按 Agent 与按模型统计的 token 用量与费用">
</div>

### 审批直接推到手机上

飞书扫码接一次即可。之后遇到卡在权限确认上的会话，它会给你发一张卡片，你在手机上就能放行，不必回到工位。

<div align="center">
  <img src="./docs/shots/zh/06-feishu.png" width="1100" alt="Agent Session Center 通过扫码连接飞书">
</div>

### 每场会话，一张表

会话历史读取的是每个 CLI 自己写到磁盘上的记录——所有来源全覆盖。浏览、一句话语义搜索、隐藏或移入回收站；底层文件永远不会被碰。

<div align="center">
  <img src="./docs/shots/zh/02-session-history.png" width="1100" alt="Agent Session Center 会话历史：汇总 8 个 Coding Agent 的会话">
</div>

### 没有截图的那些

- **悬浮窗由你定义。** 默认悬浮监控本身就是一个内置 Renderer。自定义 Renderer 通过同一套公开接口接收真实会话状态，可以用 HTML、CSS、JavaScript、动画库或 Canvas 构建；设置页内置一份简短 Skill，交给你的 Coding Agent 就能帮你创建并安装自己的悬浮窗。
- **不离开会话也能阅读代码。** 在终端旁打开只读文件树，查看语法高亮的源码并预览 Markdown，Agent 的原生 TUI 仍然保留。
- **主题、字体和布局。** 应用主题与终端主题彼此独立；调整终端字体与字号、切换导航模式、配置悬浮窗 Renderer，都在同一个设置页。
- **跨运行环境快速启动。** 从 Home 或快速启动面板打开 Shell 或扫描到的 Coding CLI，支持主机安装和兼容的 WSL 发行版。DeepSeek Harness 只在扫描到本机或 WSL 安装后才显示。

<div align="center">
  <img src="./docs/shots/zh/01-home.png" width="1100" alt="Agent Session Center 的 Home 界面，提供多个 Coding Agent 供启动">
</div>

## 安装

> **状态：1.x 早期版本。** 可用于日常使用，但配置项命名与 `hub/` 目录结构仍可能在 1.x 内调整；需要长期稳定请锁定具体版本。

从 [GitHub Releases](https://github.com/fatedawn/agent-session-center/releases/latest) 下载最新版本：

- **Windows x64** —— `AgentSessionCenter-Setup-x.y.z.exe`，引导式 NSIS 安装包，可选安装目录。
- **Linux x64** —— `AgentSessionCenter-x.y.z-linux-x64.AppImage`（免安装：下载后 `chmod +x` 直接运行）或 `AgentSessionCenter-x.y.z-linux-x64.deb`（用 `apt` 安装）。
- **macOS Apple Silicon** —— `AgentSessionCenter-x.y.z-macos-arm64.dmg`；想自己放到位就用同名的 `.zip`。
- **macOS Intel** —— `AgentSessionCenter-x.y.z-macos-x64.dmg`；同上，另有 `.zip`。

每个版本都会在每个可安装文件旁附上 SHA-256 校验值；这个哈希能证明什么、不能证明什么，见 [验证下载](#验证下载)。

**所有可下载的构建都没有代码签名。** Windows 首次启动会走 SmartScreen 提示，macOS 会直接拦下直到你放行，Linux 包则本来就不需要签名。这几件事都不是疏忽 —— 见 [代码签名政策](#代码签名政策)。

### Windows：装到哪了

安装包默认**按用户安装**：什么都不改的话，程序装在 `%LOCALAPPDATA%\Programs\Agent Session Center`，**不在** `C:\Program Files` 下。想装进 Program Files，请在安装向导第一页选**为所有用户安装**（这一项会请求管理员授权）。

开始菜单和桌面快捷方式的名称是 **ASC (Agent Session Center)** —— 开始菜单里敲 `asc` 就能搜到。

### macOS：怎么过 Gatekeeper

macOS 构建**未签名、也未公证**，所以第一次启动会被系统拦下。放行方式取决于系统版本：

在 **macOS 15（Sequoia）及之后的版本**（含 macOS 26），老的「右键 → 打开」已经绕不过 Gatekeeper。先尝试打开一次应用，然后进入**系统设置 → 隐私与安全性**，下拉到**安全性**，找到那条关于被拦截应用的提示，点**仍要打开**，再按提示验证指纹或密码。这个按钮**只有在你被拦过一次之后**才会出现。

在 **macOS 10.14 到 14** 上，「右键 → 打开」依然有效，而且更快。

不想点界面的话，可以直接去掉你安装的那个 bundle 的隔离标记：

```bash
xattr -d com.apple.quarantine "/Applications/Agent Session Center.app"
```

它只作用于你指定的这一个 bundle —— 不是系统级改动，也不会动任何安全设置。请在核对过公布的 SHA-256 **之后**再执行，而不是之前。

彻底消除这个提示需要公证（notarization），而公证需要付费的 Apple Developer Program 会员。本项目没有，所以 macOS 版本是**有意**保持未签名，不是漏了这一步。

### 窗口压根没出现

如果应用是「闪一下就没了」，多半是 GPU 进程起不来。装了远程控制软件虚拟显示器、跑在虚拟机里、或显卡驱动有问题的机器都可能触发：Chromium 重试几次 GPU 进程后就放弃并退出，窗口根本来不及创建。

可以按顺序试两件事：

1. **关闭 GPU 沙箱启动一次：**

   ```powershell
   & "$env:LOCALAPPDATA\Programs\Agent Session Center\Agent Session Center.exe" --no-sandbox
   ```

   （装在别的目录就换成那个路径。）这样能打开的话，触发源大概率是虚拟显示器驱动。

2. **看诊断日志**：`%APPDATA%\Agent Session Center\logs\asc-diagnostic.jsonl`。GPU 进程的崩溃会带着 reason 和 exitCode 记在里面；应用内「设置」里也能看到同一份日志。

从 v1.0.2 起，应用自己会检测到这种情况，弹窗给出上面的指引，而不是静默退出。

### 第一次启动

1. 启动 Agent Session Center，等待第一次 CLI 扫描完成。
2. 选择普通终端或 Coding CLI。
3. 选择运行环境和工作区。
4. 创建会话。原生 TUI 会显示在主区域，Agent Session Center 负责在外围同步状态。

如果 Codex 提示需要审核 Hooks，请打开 `/hooks`，检查并信任 Agent Session Center 的 Hook 定义。对于 Kimi Code，Agent Session Center 会在当前生效的用户 `config.toml` 中维护一个带版本的托管块，并保留托管块之外的内容。Grok Build 会在 `~/.grok/hooks/`（或 `$GROK_HOME/hooks` / 对应 WSL 家目录）写入专用的 `asc-observer.json`，属于 Grok 始终信任的用户级 Hook。

## 本地开发

桌面程序在仓库根目录（`src/` + `electron/`）。

```bash
git clone https://github.com/fatedawn/agent-session-center.git
cd agent-session-center
npm install
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run build
```

端到端测试不在 GitHub CI 里跑 —— 它需要真实的 DeepSeek Harness 宿主和桌面会话。改到 observer 或终端层时，可以在本地用 `npm run e2e:only` 跑。

Windows、macOS、Linux 安装包需要在对应系统上通过 `npm run release:win`、`npm run release:mac` 和 `npm run release:linux` 构建。Windows 与 Linux 包也会由 GitHub 托管的 Runner 在 CI 上构建；macOS 走双架构矩阵，arm64 与 x64 各自在原生架构的 Runner 上完成构建与校验。DSH e2e 会通过 `npm run ensure:dsh` 安装隔离且不入库的 `dsh-runtime` 夹具，它不会打进发行包。完整的发版门禁见 [docs/RELEASING.md](./docs/RELEASING.md)。

## 参与贡献

欢迎提交 Bug、可复现的边界情况和范围明确的 Pull Request。修改 Observer 时，请补充 fixture 或 Runtime 测试来证明事件顺序和降级行为。大型功能建议先开一个 [Issue](https://github.com/fatedawn/agent-session-center/issues)。

本地环境、分支命名和 commit 规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 代码签名政策

**目前没有任何一个平台带代码签名。** Windows 安装包、macOS 磁盘映像和 Linux 包都以未签名的形式构建和发布，因此首次启动时系统会拦一下，需要你放行。这里让下载可核对的东西不是签名，而是公布的 SHA-256，加上「这次构建确实跑在本仓库的 CI 上」这个事实 —— 见 [验证下载](#验证下载)。

如果将来加上了签名，它只说明一件事：**这个文件是由本仓库里的发布流水线、基于本仓库的源码自动构建出来的。** 它不代表发布者身份，也不构成任何担保。

### 计划中的签名

本项目计划通过 [SignPath Foundation](https://signpath.org) 为其 Windows 安装包签名。该证书是签发给 SignPath Foundation 本身、而不是签发给我们项目的，**申请尚未提交**，因此当前没有任何版本带签名。一旦启用，需要满足的条件（团队角色、可签名范围、逐次审批方式）记录在 [`docs/SIGNPATH-APPLICATION.md`](./docs/SIGNPATH-APPLICATION.md)。

要给 macOS 构建签名则需要通过付费的 Apple Developer Program 做公证（notarization）。通往「已公证的 macOS 构建」没有免费路径，所以 macOS 版本保持未签名，上面那套 [Gatekeeper 步骤](#macos怎么过-gatekeeper)就是受支持的运行方式。

### 团队角色

Agent Session Center 目前由一人维护，因此签名政策要求的三个角色会由同一位维护者兼任。若之后有新的维护者加入，本表会同步更新，且签名审批改为双人流程 —— 该版本的提交者不能同时审批该版本的发签请求。

| 角色 | 职责 | 成员 |
| --- | --- | --- |
| Authors（提交者） | 可不经额外评审直接修改本仓库源码 | [`@fatedawn`](https://github.com/fatedawn) |
| Reviewers（评审者） | 评审一切由无提交权限者提出的改动 | [`@fatedawn`](https://github.com/fatedawn) |
| Approvers（审批者） | 将逐次审批每个代码签名请求 | [`@fatedawn`](https://github.com/fatedawn) |

全体成员均已对 GitHub 开启多因素认证（MFA）。目前还没有 SignPath 账号，所以这项要求的另一半尚未生效 —— 启用签名时它才生效。

### 计划中的可签名范围

- 只有由本仓库发布流水线构建出的 Windows NSIS 安装包，且每次都必须经人工**审批**。工作流本身无法自行触发签名。
- macOS 与 Linux 包由各自的脚本构建发布，不在任何签名政策范围内。
- 与该版本配套的 `latest.yml`、`latest-linux.yml`、`latest-mac.yml` 更新元数据与 `.blockmap` 不同步签名，由公布的 SHA-256 覆盖。

任何来自上游项目的东西永远不签名。本代码库所源自的上游 [UniRound-Tec/hrack](https://github.com/UniRound-Tec/hrack) 只发布未签名构建，且与本项目无隶属关系；不存在任何源自它的二进制会被我们的证书签名，或以我们的名义再分发。Electron、`node-pty` 等随包分发的库保留其自身签名，或在我们安装包内保持未签名状态。

### 发布构建流程

1. 维护者提交版本号变更，并在 `CHANGELOG.md` 中写入对应的 `## [x.y.z]` 段落，然后推送 `vX.Y.Z` 标签。
2. 发布工作流在 GitHub 托管的 Runner 上运行 —— [Windows](./.github/workflows/release-windows.yml) 与 [Linux](./.github/workflows/release-linux.yml) 走 x64，[macOS](./.github/workflows/release-mac.yml) 走双架构矩阵，好让每个包都在原生架构的 Runner 上被校验。每个工作流都执行 `npm ci` → `npm run build` → 仓库自带的打包脚本，打包脚本会跑完全部门禁（产物资源断言、更新元数据断言、打包后应用启动测试、图标校验）。
3. 每个工作流把**未签名**的安装包上传为构建产物。这一步不发布任何东西。
4. 维护者审阅产物与它们的 SHA-256，然后运行[挂载工作流](./.github/workflows/publish-release.yml)，它会把每个产物与校验值重新比对一遍，再挂到 Release 上。

一切能影响最终发布内容的东西 —— 构建脚本、CI 工作流、打包配置、发布门禁 —— 都在本仓库内，并与应用代码同等对待评审。

### 验证下载

```powershell
# Windows —— 哈希值必须与发行说明里公布的一致
Get-FileHash .\AgentSessionCenter-Setup-x.y.z.exe -Algorithm SHA256
```

```bash
# Linux 与 macOS
shasum -a 256 AgentSessionCenter-x.y.z-macos-arm64.dmg
```

哈希对得上，说明下载完整、且就是维护者发布的那个文件。但它本身不能证明「是谁构建的」—— 那恰恰是代码签名唯一能补上的东西，而我们现在还没有签名：

```powershell
# 签名到位后，这条命令会额外报告 Status: Valid
Get-AuthenticodeSignature .\AgentSessionCenter-Setup-x.y.z.exe | Format-List Status, SignerCertificate
```

### 隐私

Agent Session Center 不会把任何信息传输到用户未指定的其他联网系统。唯一会自动发起的请求是向本仓库自身的 Release 检查更新，可用 `ASC_DISABLE_UPDATES=1` 关闭。应用可能发起的每一个网络请求、触发条件、携带内容与关闭方式，全部列在 [PRIVACY.md](./PRIVACY.md)。

## 友情链接

- [LINUX DO](https://linux.do/)

## 开源协议

Agent Session Center 使用 [Apache License 2.0](./LICENSE) 开源。

---

<div align="center">
  <sub>解放心智，回到真正的氛围编程。</sub>
</div>

---

## English

<p align="right">
  <a href="#中文">简体中文</a>
</p>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/readme/asc-wordmark-dark.png">
    <img src="./assets/readme/asc-wordmark-light.png" width="370" alt="Agent Session Center">
  </picture>

  <h3>One center for 8 coding agents</h3>
  <p>Find, resume, fork and hand off every session — and approve from your phone.</p>

  <p>
    <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/github/license/fatedawn/agent-session-center?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/fatedawn/agent-session-center?style=flat-square&label=release"></a>
    <a href="https://github.com/fatedawn/agent-session-center/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/fatedawn/agent-session-center/total?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/fatedawn/agent-session-center?style=flat-square"></a>
    <a href="https://github.com/fatedawn/agent-session-center/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/fatedawn/agent-session-center?style=flat-square"></a>
  </p>

  <img src="./docs/demo/asc-demo-en.gif" width="1100" alt="Agent Session Center: session history across 8 coding agents, AI session search, one-click resume, per-agent usage, and Feishu approval on your phone">
  <p><sub>Session history → AI search → one-click resume → usage and cost → Feishu approval. <a href="./docs/demo/asc-demo-en.mp4">Watch the full 46-second video</a>.</sub></p>
</div>

**Agent Session Center (ASC)** is a desktop session center for **8 AI coding agents** — Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy. Browse and search every session a CLI has written to disk, resume it in one click, and when an agent stalls on an approval, a Feishu push brings it to your phone — one tap to approve.

The CLI keeps its native TUI and does all the work. ASC adds the layer that is usually missing around it: live status, attention cues, a floating monitor, quick launch, and a read-only workspace viewer. The Python session tools and Feishu helper are the same product, in [`hub/`](./hub).

## Upstream

The early prototype was derived from [UniRound-Tec/hrack](https://github.com/UniRound-Tec/hrack) (Apache-2.0), a project with no affiliation to this one. Agent Session Center is an independently maintained hard fork — its own identity, roadmap, and release channel; no code, branch, or release is tracked from upstream. Every file in this repository is maintained here. Attribution, the change summary, and the measured extent of the inheritance live in [NOTICE](./NOTICE).

No upstream build is signed. The upstream project publishes unsigned builds only, and no upstream binary is ever signed with this project's certificate or redistributed under this project's name.

## The problem

Different coding agents are useful for different jobs, so one terminal quickly becomes several. The friction is not starting them — it is keeping track of them:

- You switch away, come back later, and discover that an agent has been waiting on a permission prompt the whole time. Codex and Gemini CLI users have both asked for better attention signals ([Codex](https://github.com/openai/codex/issues/10081), [Gemini CLI](https://github.com/google-gemini/gemini-cli/issues/14696)).
- Once several agents run in parallel, you start hunting through tabs for the one that needs you. The same problem shows up in [multi-agent workflow discussions](https://news.ycombinator.com/item?id=47268777) and tools such as [tmux-claude-session-manager](https://github.com/craftzdog/tmux-claude-session-manager).
- A notification alone is not enough if it never fires ([Codex #8929](https://github.com/openai/codex/issues/8929)), cannot tell that the agent is waiting for an answer ([Codex #13478](https://github.com/openai/codex/issues/13478)), or misses an interactive shell waiting for input ([Gemini CLI #19527](https://github.com/google-gemini/gemini-cli/issues/19527)).

Agent Session Center keeps those sessions together, tells you which one needs attention, and takes you back to the right place. The original CLI still does all the work; Agent Session Center simply means you do not have to stare at it.

## How it works

On first launch, Agent Session Center discovers compatible CLIs on the host and in WSL. The result is cached for fast startup and can be rescanned manually. Each supported harness has an adapter that turns its official Hooks, SSE stream, extension API, or runtime events into one shared vocabulary — and then derives status from those events rather than from the terminal.

<div align="center">
  <img src="./assets/readme/architecture-en.svg" width="1100" alt="Architecture: the CLI keeps its native TUI in a PTY, while hooks, JSONL, RPC/ACP, native streams, transcripts and lifecycle events feed a normalizer, a seq-ordered queue, a reducer and a projector that drive the sidebar, floating window, session history and Feishu push">
</div>

Three properties fall out of that shape, and all three matter more than the feature list:

- **The terminal is never parsed.** A CLI's TUI is full of box drawing, spinners and colour. Nothing about status is read from those bytes; the observer subscribes to structured events instead.
- **Order comes from `seq`, not from wall-clock time.** Hooks replay, RPC connections drop and reconnect, and a transcript can be tailed twice. Every event carries a monotonic per-session sequence number and a native id, both of which are used to drop duplicates and to keep the true order.
- **An observer can die without killing your session.** If it does, the PTY keeps running. ASC degrades the *display* — `observerHealth` goes `stale`, `statusConfidence` drops to `low` — instead of breaking the CLI you are working in.

## What it is allowed to tell you

Status is a projection of facts, not a guess. There are exactly six states, and only one of them asks for you.

<div align="center">
  <img src="./assets/readme/status-en.svg" width="1100" alt="The six states — needs-you, working, done, error, idle, exited — with only needs-you glowing">
</div>

Coral `#FF6B4A` is the one colour in the product that glows, and it means one thing: **this session is blocked on your confirmation.** Everything else is a flat dot. The rule is deliberate — if several things compete for attention, none of them gets it.

## The attention loop

This is the whole idea in one picture. Six agents, one coffee break.

<div align="center">
  <img src="./assets/readme/attention-en.svg" width="1100" alt="Six sessions running side by side: five never interrupt, one blocks on an approval, reaches the phone through Feishu, and resumes in the same PTY after one tap">
</div>

While you are away the other five keep working and never interrupt you. The one that blocks on an approval reaches your phone as a card; approving it from there sends the decision back into the same PTY, and the turn continues — nothing was restarted, and nothing was lost.

## What each agent can report

Harnesses are not equally observable, and pretending otherwise would be the easiest lie in a README. Each adapter declares the capabilities it can actually prove for the session in front of you, and the UI shows the level it is at rather than a brand claim.

<div align="center">
  <img src="./assets/readme/capabilities-en.svg" width="1100" alt="Capability matrix across thinking, tools, approvals, input requests, usage and messages for DeepSeek Harness, Claude Code, Codex CLI, Grok Build, Kimi Code, OpenCode and Pi">
</div>

Read the right-hand columns first — that is where the sources separate. **OpenCode** goes furthest overall and is the only one that reports message summaries; **Pi** is the only one that reports tokens *and* context rather than a single number. Read the left-hand columns to see what every harness gets: a thinking phase and tool lifecycle, everywhere.

Live observation and session history are two separate layers. Reading what a CLI wrote to disk does not require its runtime to expose anything:

| Source | Live status | Session history |
| --- | --- | --- |
| DeepSeek Harness, Claude Code, Codex CLI, OpenCode, Pi, Kimi Code, Grok Build | Yes | Yes |
| Antigravity, WorkBuddy | Not yet | Yes |

Session history is available for all nine sources — the eight coding agents plus DeepSeek Harness. Browse, search, token usage, and resume where the source exposes a resumable session. The two layers are separate on purpose — a source can be readable without exposing its runtime event stream.

### Integration detail

| Harness | Integration | Status available to ASC | Runtimes |
| --- | --- | --- | --- |
| DeepSeek Harness | Official Web surface + runtime bridge | Followed session and lifecycle | Host, WSL |
| Claude Code | Official Hooks | Thinking, tools, approvals, completion | Host, WSL |
| Codex CLI | Stable Hooks | Turns, tools, approvals, compaction | Host, WSL |
| OpenCode | Server + SSE | Sessions, thinking, tools, questions, permissions | Host, WSL |
| Pi | Extension API | Thinking, responses, tools, turns | Host, WSL |
| Kimi Code | Official Hooks | Turns, thinking, tools, approvals | Host, WSL |
| Grok Build | Official Hooks | Turns, thinking, tools, approvals | Host, WSL |

Agent Session Center can also discover and launch Devin CLI, Cline, Qwen Code, Amp, Aider, Goose, Kiro CLI, GitHub Copilot CLI, and other registered CLIs. Launch-only integrations do not expose the same level of status detail yet.

Field depth varies by source. Title, time, turn count, and token usage are available for all of them. Cost is shown when it is known — either recorded by the agent itself or priced from the model catalogue, and left out rather than guessed when the model is not in that catalogue. Per-turn recaps and git-drift detection are currently backed by Grok Build's `summary.json`; the other agents' session files do not record that data, so there is nothing to read. That is a limit of the upstream formats, not a queued feature.

## Highlights

### Ask in one sentence

Describe what you are looking for — "the session where the Feishu approval card was wired up" — and ASC returns the matching sessions along with its answer. The assistant endpoint is configured by you and called directly from the desktop app.

<div align="center">
  <img src="./docs/shots/en/03-ai-search.png" width="1100" alt="Agent Session Center answering a natural-language query and listing the sessions that match">
</div>

### Resume in place, and admit when you cannot

Where the agent exposes a resumable session, ASC offers one-click resume in the original working directory. When that directory is gone, it says so and asks you to pick another one instead of failing silently.

<div align="center">
  <img src="./docs/shots/en/04-resume.png" width="1100" alt="Resuming a session in Agent Session Center, with a notice that the original directory is gone and a replacement workspace to choose">
</div>

### Tokens and cost, per agent

Usage is aggregated from each CLI's own records. Grok Build records its own bill; cost for the others is priced from the model catalogue when the model is known, and left out rather than guessed when it is not.

<div align="center">
  <img src="./docs/shots/en/05-usage.png" width="1100" alt="Per-agent token usage, per-model breakdown and recorded cost in Agent Session Center">
</div>

### Approve from your phone

Connect Feishu once with a QR scan. From then on, a session that stalls on a permission prompt sends you a card you can act on without going back to the desk.

<div align="center">
  <img src="./docs/shots/en/06-feishu.png" width="1100" alt="Connecting Feishu in Agent Session Center by scanning a QR code">
</div>

### Every session, one table

Session history reads what each CLI itself wrote to disk — across every source. Browse, semantic-search, hide, or send to the recycle bin; the underlying files are never touched.

<div align="center">
  <img src="./docs/shots/en/02-session-history.png" width="1100" alt="Session history listing sessions from eight coding agents in Agent Session Center">
</div>

### The parts without screenshots

- **Floating window.** A always-on-top status surface, itself a built-in renderer. Custom renderers use the same public interface and can be built with HTML, CSS, JavaScript, animation libraries, or canvas; settings ship a short built-in skill you can hand to your coding agent to create and install one.
- **Read-only workspace viewer.** A file tree beside the terminal, with highlighted source and Markdown preview, while the agent keeps its native TUI.
- **Themes, fonts, and layout.** Independent application and terminal themes, terminal font and sizing, navigation modes, and the floating renderer — all on one settings page.
- **Fast launch across runtimes.** Start a shell or a detected CLI from the Home screen or the quick-launch panel, on host installations and compatible WSL distributions. DeepSeek Harness appears only after a local or WSL install is found.

<div align="center">
  <img src="./docs/shots/en/01-home.png" width="1100" alt="The Home screen of Agent Session Center, offering eight coding agents to launch">
</div>

## Install

> **Status: early 1.x.** Stable for daily use, but configuration keys and the `hub/` layout may still change within the 1.x line. Pin a version if you need that guarantee.

Download the latest build from [GitHub Releases](https://github.com/fatedawn/agent-session-center/releases/latest):

- **Windows x64** — `AgentSessionCenter-Setup-x.y.z.exe`, a guided NSIS installer, so you can choose the installation directory.
- **Linux x64** — `AgentSessionCenter-x.y.z-linux-x64.AppImage` (portable: download, `chmod +x`, run) or `AgentSessionCenter-x.y.z-linux-x64.deb` (installs with `apt`).
- **macOS Apple Silicon** — `AgentSessionCenter-x.y.z-macos-arm64.dmg`, or the `.zip` if you want to drop the app in place yourself.
- **macOS Intel** — `AgentSessionCenter-x.y.z-macos-x64.dmg`, or the `.zip`.

Every release publishes a SHA-256 checksum beside each installable file; see [Verifying a download](#verifying-a-download) for what that does and does not prove.

**No downloadable build is code-signed.** Windows shows a SmartScreen prompt on first launch, macOS blocks the app until you allow it, and Linux packages need no signature at all. None of that is an oversight — see the [code signing policy](#code-signing-policy).

### Windows: where it installs

The installer defaults to **per-user**: without touching anything it installs to `%LOCALAPPDATA%\Programs\Agent Session Center`, and you will not find it under `C:\Program Files`. To install into Program Files instead, pick **Install for all users** on the installer's first page (that choice asks for administrator approval).

The Start-menu and desktop shortcuts are named **ASC (Agent Session Center)** — typing `asc` into the Start menu finds it.

### macOS: getting past Gatekeeper

macOS builds are **unsigned and not notarized**, so the first launch is blocked. How you allow it depends on your version:

On **macOS 15 (Sequoia) and later** — including macOS 26 — the old *right-click → Open* shortcut no longer bypasses Gatekeeper. Try to open the app once, then go to **System Settings → Privacy & Security**, scroll to **Security**, find the notice about the blocked app, and choose **Open Anyway**. You will be asked to authenticate. That button only appears *after* a blocked attempt.

On **macOS 10.14 through 14**, *right-click → Open* still works and is the faster path.

If you would rather not click through the UI, remove the quarantine flag from the bundle you installed:

```bash
xattr -d com.apple.quarantine "/Applications/Agent Session Center.app"
```

That touches only the bundle you name — it is not a system-wide change and it does not alter any security setting. Do it after checking the published SHA-256, not before.

Removing the prompt entirely requires notarization, which requires a paid Apple Developer Program membership. This project does not have one, so macOS releases stay unsigned by design rather than by omission.

### If the window never appears

If the app flashes and exits on launch, the GPU process most likely cannot start. This happens on some machines with the virtual displays that remote-control software installs, inside VMs, or with broken GPU drivers: Chromium retries the GPU process a few times, gives up, and exits before any window is created.

Two things to try:

1. **Start it once with the GPU sandbox disabled:**

   ```powershell
   & "$env:LOCALAPPDATA\Programs\Agent Session Center\Agent Session Center.exe" --no-sandbox
   ```

   (Adjust the path if you installed elsewhere.) If the app opens this way, a virtual-display driver is the likely trigger.

2. **Read the diagnostic log** at `%APPDATA%\Agent Session Center\logs\asc-diagnostic.jsonl`. GPU-process failures are recorded there with their reason and exit code; the same log is surfaced in Settings.

Since v1.0.2 the app detects this condition itself and shows a dialog with these instructions instead of exiting silently.

### First run

1. Start Agent Session Center and let the initial CLI scan finish.
2. Pick a terminal or coding CLI.
3. Choose its runtime and workspace.
4. Start the session. Agent Session Center keeps the native TUI in the main pane and publishes its status around it.

If Codex asks you to review Hooks, open `/hooks`, inspect the Agent Session Center definition, and trust it. For Kimi Code, Agent Session Center maintains a versioned managed block in the effective user `config.toml`; content outside that block is preserved. Grok Build installs a dedicated `asc-observer.json` under `~/.grok/hooks/` (or `$GROK_HOME/hooks` / the matching WSL home), which Grok treats as a trusted user hook.

## Development

The desktop app lives in the repository root (`src/` + `electron/`).

```bash
git clone https://github.com/fatedawn/agent-session-center.git
cd agent-session-center
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
```

End-to-end tests are not part of the GitHub CI pipeline — they need a real DeepSeek Harness host and a desktop session. Run them locally with `npm run e2e:only` if you touch an observer or the terminal layer.

Windows, macOS, and Linux release packages must be built on their matching operating systems through `npm run release:win`, `npm run release:mac`, and `npm run release:linux`. Windows and Linux packages are also built by CI on GitHub-hosted runners; the macOS matrix builds and verifies arm64 and x64 on native runners of each architecture. DSH e2e tests install an isolated, gitignored `dsh-runtime` fixture via `npm run ensure:dsh`; it is not packaged into releases. See [docs/RELEASING.md](./docs/RELEASING.md) for the full list of release gates.

## Contributing

Bug reports, reproducible edge cases, and focused pull requests are welcome. Observer changes should include a fixture or runtime test that proves event ordering and fallback behavior. Please open an [issue](https://github.com/fatedawn/agent-session-center/issues) before starting a large feature.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the local setup, branch naming, and commit conventions.

## Code signing policy

**No release is code-signed today — on any platform.** The Windows installer, the macOS disk images, and the Linux packages are all built and published unsigned, so the operating system will interrupt the first launch and you have to allow it through. What makes a download checkable here is not a signature but the published SHA-256 together with the fact that the build ran in this repository's CI — see [Verifying a download](#verifying-a-download).

Should a signature be added later, it will mean exactly one thing: **this file is an automated build produced from this public repository by the release workflow in it.** It is not a claim about the publisher's identity and it is not a warranty.

### Planned signing

Agent Session Center intends to sign its Windows installer through [SignPath Foundation](https://signpath.org), whose certificate is issued to SignPath Foundation itself rather than to this project. **That application has not been submitted**, so no release carries a signature today. The conditions that would apply once it is in place — team roles, what may be signed, and how each release is approved — are recorded in [`docs/SIGNPATH-APPLICATION.md`](./docs/SIGNPATH-APPLICATION.md).

Signing the macOS builds would require notarization through the paid Apple Developer Program. There is no free path to a notarized macOS build, so macOS releases stay unsigned and the [Gatekeeper steps](#macos-getting-past-gatekeeper) above are the supported way to run them.

### Team roles

Agent Session Center is maintained by one person, so the three roles a signing policy requires would be held by the same maintainer. If more maintainers join, this table is updated and signing approval becomes a two-person step — the committer of a release cannot also approve that release's signing request.

| Role | Responsibility | Members |
| --- | --- | --- |
| Authors (committers) | May modify source in this repository without additional review | [`@fatedawn`](https://github.com/fatedawn) |
| Reviewers | Reviews every change proposed by someone without commit access | [`@fatedawn`](https://github.com/fatedawn) |
| Approvers | Would approve each individual code signing request | [`@fatedawn`](https://github.com/fatedawn) |

Every team member has multi-factor authentication enabled on GitHub. There is no SignPath account yet, so that half of the requirement is not in effect — it takes effect if and when signing is adopted.

### What a signature would cover

- Only the Windows NSIS installer built from this repository by the release workflow, and only after a human approves that specific request. A workflow run could not sign itself.
- macOS and Linux packages are built and published by their own scripts and stay outside any signing policy.
- The `latest.yml`, `latest-linux.yml` and `latest-mac.yml` update metadata and the `.blockmap` files belong to the same release but are not signed; they are covered by the published SHA-256.

Nothing from an upstream project is ever signed. The one upstream this codebase derives from — [UniRound-Tec/hrack](https://github.com/UniRound-Tec/hrack) — publishes unsigned builds and is unaffiliated with this project; no binary originating there is signed with our certificate or redistributed under our name. Electron, `node-pty`, and the other bundled libraries keep their own signatures or stay unsigned inside our installer.

### Release build process

1. The maintainer commits the version bump and the matching `## [x.y.z]` section in `CHANGELOG.md`, then pushes a `vX.Y.Z` tag.
2. A release workflow runs on GitHub-hosted runners — [Windows](./.github/workflows/release-windows.yml) and [Linux](./.github/workflows/release-linux.yml) on x64, [macOS](./.github/workflows/release-mac.yml) as a two-architecture matrix so each build is verified on a native runner. Each runs `npm ci`, `npm run build`, and then the repository's own packaging script, which runs every release gate (packaged-resource assertions, update-metadata assertions, a launch test of the packaged app, and an icon check).
3. Each workflow uploads its unsigned packages as build artifacts. Nothing is published by this step.
4. The maintainer reviews the artifacts and their SHA-256 values, then runs the [publish workflow](./.github/workflows/publish-release.yml), which re-verifies every artifact against its checksum and attaches them to the Release.

Everything that can influence what gets published — the build scripts, the CI workflows, the packaging configuration, and the release gates — lives in this repository and is reviewed with the same care as the application code itself.

### Verifying a download

```powershell
# Windows — the hash must match the one published in the release notes.
Get-FileHash .\AgentSessionCenter-Setup-x.y.z.exe -Algorithm SHA256
```

```bash
# Linux and macOS
shasum -a 256 AgentSessionCenter-x.y.z-macos-arm64.dmg
```

A matching hash proves the download is intact and is the file the maintainer published. It does not by itself prove who built it — that is the one thing a code signature would add, and it is not available yet:

```powershell
# Once signing is in place, this will additionally report Status: Valid.
Get-AuthenticodeSignature .\AgentSessionCenter-Setup-x.y.z.exe | Format-List Status, SignerCertificate
```

### Privacy

Agent Session Center does not transfer any information to other networked systems unless specifically requested by the user. The one automatic request — an update check against this repository's own releases — can be switched off with `ASC_DISABLE_UPDATES=1`. Every outbound request the application is capable of making, what triggers it, what it carries, and how to turn it off is listed in [PRIVACY.md](./PRIVACY.md).

## Friends

- [LINUX DO](https://linux.do/)

## License

Agent Session Center is licensed under the [Apache License 2.0](./LICENSE).

---

<div align="center">
  <sub>Free your mind. Get back to vibe coding.</sub>
</div>
