/* Agent Session Center — interactive demo: the string table.
 *
 * Two languages, one key space. Everything the page says in prose lives here; the
 * machine-shaped text (status ids, event fields, capability levels, the log itself)
 * deliberately does not, because it is a quotation of what the product would print
 * rather than a sentence about it.
 *
 * Voice rules, borrowed from hub/docs/brand.md: no contractions, no exclamation marks,
 * and never a claim about the product that the source does not support.
 *
 * Initial language resolution order:
 *   1. ?lang=zh | ?lang=en
 *   2. localStorage
 *   3. <html data-default-lang>   ← patched per deploy by scripts/build-demo-site.cjs
 *   4. navigator.language
 */
;(function () {
  'use strict'

  var STORAGE_KEY = 'asc-demo-lang'
  var LANGUAGES = ['en', 'zh']

  var STRINGS = {
    /* ─────────────────────────── English ─────────────────────────── */
    en: {
      'doc.title': 'Agent Session Center — interactive demo',
      'doc.description':
        'An interactive, entirely fabricated demo of Agent Session Center: watch an agent event become a session status, and watch one session ask for you.',

      /* ── landing page (index.html). The simulator keeps its own keys below. ── */
      'l.doc.title': 'Agent Session Center — one home for every coding agent',
      'l.doc.description':
        'Agent Session Center gathers the sessions of 8 AI coding agents — Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy — into one desktop app: browse, search, resume, and approve on your phone through Feishu.',
      'l.nav.home': 'Home',
      'l.nav.features': 'Features',
      'l.nav.changelog': 'Changelog',
      'l.nav.docs': 'Docs',
      'l.nav.download': 'Download',
      'l.nav.theme': 'Toggle theme',
      'l.hero.cta.docs': 'Read the docs',
      'l.hero.kicker': 'Open source · Apache-2.0 · Windows / Linux / macOS',
      'l.hero.title': 'Eight coding agents. One place where every session is findable.',
      'l.hero.cta.download': 'Download v1.0.4',
      'l.hero.note':
        'The downloads are unsigned; the release page publishes SHA-256 for every asset. Your terminals stay exactly as they are — ASC reads event streams, not your screen.',
      'l.pain.title': 'Does this sound familiar?',
      'l.pain1.title': 'Which folder was that session in?',
      'l.pain1.body':
        'You run several agents a day across many project folders. When something breaks two days later, finding the right session means guessing the CLI, the project and the date — all three.',
      'l.pain2.title': 'Where did I leave off?',
      'l.pain2.body':
        'Long sessions outlive your memory of them. Opening a CLI only shows the newest transcript of whichever folder you happened to open.',
      'l.pain3.title': 'You walk away, the agent stalls.',
      'l.pain3.body':
        'An agent stopped on a permission prompt waits forever, silently. Away from the desk, there is nothing you can do about it.',
      'l.feat.title': 'What it does',
      'l.f1.tag': 'Session history',
      'l.f1.title': 'Every session, from every agent, in one list',
      'l.f1.body':
        'Claude Code, Codex CLI, OpenCode, Grok Build, Kimi Code, Pi, Antigravity and WorkBuddy appear in one view — with workspace path, duration and status. Workspaces are scanned read-only; nothing is modified.',
      'l.f2.tag': 'AI search',
      'l.f2.title': 'Ask in plain language, get the session back',
      'l.f2.body':
        'Say what you remember — the task, the file, roughly when — and search narrows across every agent at once. You do not have to remember which CLI you used.',
      'l.f3.tag': 'Resume',
      'l.f3.title': 'One click back into the conversation',
      'l.f3.body':
        'Resume is offered where it has been verified: Claude Code, Codex CLI and Grok Build. Everywhere else the resume button is greyed out and the button itself carries the reason, because an unverified capability is never dressed up as a working one.',
      'l.f4.tag': 'Usage',
      'l.f4.title': 'Tokens and cost, per agent, per day',
      'l.f4.body':
        'See which agent burned what, and when. The numbers are read from local session files; nothing is sent anywhere.',
      'l.f5.tag': 'Feishu',
      'l.f5.title': 'Approvals on your phone, from anywhere',
      'l.f5.body':
        'When an agent stops on a permission prompt, Feishu pushes a card carrying the actual question. Approve or deny from your phone — at lunch, on the sofa, away from the desk.',
      'l.truth.title': 'Where it draws the line',
      'l.truth1.title': 'It never reads your terminal',
      'l.truth1.body':
        'Status comes from structured events — hooks, SSE, RPC, transcripts — never from parsing the TUI. The CLI keeps its own interface; ASC adds the layer around it.',
      'l.truth2.title': 'It reports capability honestly',
      'l.truth2.body':
        'Each agent can report a different depth. ASC declares, in source, what each one can and cannot see, and marks low confidence instead of guessing.',
      'l.truth3.title': 'Unsigned, hashed, inspectable',
      'l.truth3.body':
        'The builds are unsigned; every release publishes SHA-256 so you can verify what you run. The whole product is Apache-2.0 on GitHub.',
      'l.dl.title': 'Download',
      'l.dl.lede':
        'v1.0.4 for Windows, Linux and macOS. Download, run, and it finds the agents already on your machine — the first scan takes seconds, and nothing leaves your computer.',
      'l.dl.cta': 'Get the latest release',
      'l.foot.upstream':
        'Early prototype from UniRound-Tec/hrack (Apache-2.0); Agent Session Center is an independently maintained hard fork — see NOTICE.',
      'l.foot.demo':
        'Screenshots show the real interface; the simulator page runs on fabricated data.',
      'l.foot.line':
        'Agent Session Center · Apache-2.0 · this site is a static page with no network calls.',

      'nav.home': 'Home',

      'badge.fake': 'Fabricated data',

      'hero.kicker': 'Interactive demo',
      'hero.title': 'Six sessions. One of them needs you.',
      'hero.lede':
        'Everything on this page is invented — the sessions, the turn counts, the token counts, the timestamps. What is not invented is the mechanism: press play and watch a single agent event travel through the four stages that turn it into a status, and watch one session begin asking for you.',
      'hero.note':
        'Coral means one thing only: this session is blocked on your confirmation. It is the only colour in the product that glows.',

      'sim.title': 'The pipeline, one step at a time',
      'sim.step': 'Step',
      'sim.sessions': 'Sessions',
      'sim.pipeline': 'Event pipeline',
      'sim.projection': 'Projection',
      'sim.tally': 'Every session, accounted for',
      'sim.log': 'Event log',
      'sim.logHint':
        'Every line is fabricated, but the shape is the real contract.',
      'sim.sourcesNote':
        'Six of the eight event sources the contract allows. The contract additionally has fixture, which exists only in tests, and the platform adds lifecycle for processes it started itself.',
      'sim.logEmpty': 'waiting for the first event',

      'stage.normalizer': 'native protocol → AgentEvent',
      'stage.queue': 'ordered by seq, never by clock',
      'stage.reducer': 'correlates tools, approvals, input',
      'stage.projector': 'six states, confidence, capabilities',

      'ctl.play': 'Play',
      'ctl.pause': 'Pause',
      'ctl.step': 'Step',
      'ctl.reset': 'Reset',
      'ctl.atStart': 'Ready. Press play, or step through it one stage at a time.',
      'ctl.atEnd':
        'One event became a status, and one session is now blocked on you. The session in the terminal never noticed.',

      'legend.title': 'Six states, one of them glows',
      'legend.lede':
        'The status vocabulary is exactly these six values, and they are a projection of events rather than a reading of the terminal. When the observer cannot be sure, it says so with a confidence flag instead of inventing a seventh state.',
      'legend.working.body': 'Streaming output. Nothing for you to do.',
      'legend.needs-you.body':
        'Blocked on your confirmation. This is the one that finds you.',
      'legend.done.body': 'Finished. Collect the result.',
      'legend.error.body': 'Failed. Needs a human.',
      'legend.idle.body': 'Alive, nothing happening right now.',
      'legend.exited.body': 'Process gone. Still recoverable from history.',
      'legend.note':
        'Exited is deliberately not an error: a process that ended cleanly is a different fact from one that failed, and the difference is what tells you whether to intervene.',

      'caps.title': 'What each agent can actually report',
      'caps.lede':
        'Harnesses are not equally observable. Every level below is declared in the source — electron/agents/adapters/*/types.ts for the six harnesses, and electron/dsh-host/DshProjectionBridge.ts for DeepSeek Harness — rather than invented for this page.',
      'caps.note':
        'Read the right-hand columns first, because that is where the sources separate: OpenCode goes furthest overall and is the only one that reports message summaries, and Pi is the only one that reports tokens and context rather than a single number. Read the left-hand columns to see what every harness with a live path gets — a thinking phase and a tool lifecycle. Antigravity and WorkBuddy have no live path at all; they appear in session history only.',
      'caps.headNote':
        'Bar length is how deep that dimension goes. A full bar means this harness reaches the top level for that column.',
      'caps.col.harness': 'harness',
      'caps.gloss.harness': 'the observer that declares the row',
      'caps.col.thinking': 'thinking',
      'caps.col.tools': 'tools',
      'caps.col.approvals': 'approvals',
      'caps.col.inputRequests': 'inputRequests',
      'caps.col.usage': 'usage',
      'caps.col.messages': 'messages',
      'caps.gloss.thinking': 'how much of the reasoning phase is visible',
      'caps.gloss.tools': 'whether tool calls are counted or just started',
      'caps.gloss.approvals': 'structured approval prompts',
      'caps.gloss.inputRequests': 'structured questions back to you',
      'caps.gloss.usage': 'tokens, context window, or neither',
      'caps.gloss.messages': 'assistant message summaries',

      'truth.title': 'What is real here, and what is not',
      'truth.realLabel': 'Real:',
      'truth.real':
        'the four pipeline stages, the six states, the event fields in the log (<span class="mono">seq</span>, <span class="mono">nativeId</span>, <span class="mono">observerHealth</span>, <span class="mono">statusConfidence</span>), the capability levels, and the degradation behaviour when an observer dies.',
      'truth.fakeLabel': 'Fabricated:',
      'truth.fake':
        'every session name, turn count, timestamp, token count and cost. Nothing on this page contacted a CLI, there is no backend, and no file was read.',
      'truth.noneLabel': 'Not shown:',
      'truth.none':
        'the terminal itself. In the real application the CLI keeps its native TUI in the main pane — the whole point is that ASC never parses those bytes.',

      'try.title': 'Try it for real',
      'try.lede':
        'This page is a demonstration, not the application. The desktop app is an unsigned download for Windows, Linux and macOS, and this repository is where it is built.',
      'try.download': 'Download the latest release',
      'try.repo': 'Read the source',

      'foot.line':
        'Agent Session Center · Apache-2.0 · this demo is a static page with no network calls.',

      /* One sentence per step. These are the narration, not the log. */
      'n.1':
        'Raw protocol in, a typed AgentEvent out. The normalizer is the only place in the system that knows what "PreToolUse" means.',
      'n.2':
        'The queue orders by seq and drops anything it has already seen — hooks replay, and an RPC reconnect delivers twice.',
      'n.3':
        'The reducer keeps a per-session set of facts: parallel tools, pending approvals, the idle override. It still refuses to name a status.',
      'n.4':
        'Now the facts become a status, for every session at once. Note grok-build: its observer went quiet, so the status is reported at low confidence rather than guessed.',
      'n.5':
        'A second event, arriving over a different channel. Same four stages, no special case.',
      'n.6':
        'Ordered again. The timestamp on this one is older than the one before it, and that changes nothing.',
      'n.7':
        'The reducer pairs the request with the turn that is waiting on it. One session now has an unresolved approval.',
      'n.8':
        'The projector promotes that session to needs-you. Coral, and the only glow on the page — because being blocked on a human is the one thing worth interrupting you for.'
    },

    /* ─────────────────────────── 简体中文 ─────────────────────────── */
    zh: {
      'doc.title': 'Agent Session Center —— 交互式演示',
      'doc.description':
        'Agent Session Center 的交互式演示：所有内容均为虚构。看一条 agent 事件如何变成一个会话状态，以及某个会话如何开始找你。',

      /* ── 落地页（index.html）。模拟器页的词条在下面，互不混用。 ── */
      'l.doc.title': 'Agent Session Center —— 8 个 Coding Agent 的会话中心',
      'l.doc.description':
        'Agent Session Center 把 8 个 AI Coding Agent（Claude Code、Codex CLI、OpenCode、Grok Build、Kimi Code、Pi、Antigravity、WorkBuddy）的会话收进一个桌面应用：浏览、搜索、一键恢复，审批通过飞书推到手机上。',
      'l.nav.home': '首页',
      'l.nav.features': '功能',
      'l.nav.changelog': '更新日志',
      'l.nav.docs': '文档',
      'l.nav.download': '下载',
      'l.nav.theme': '切换主题',
      'l.hero.cta.docs': '查看文档',
      'l.hero.kicker': '开源 · Apache-2.0 · Windows / Linux / macOS',
      'l.hero.title': '8 个 Coding Agent，一个找得到每场会话的地方。',
      'l.hero.cta.download': '下载 v1.0.4',
      'l.hero.note':
        '下载包未签名，Release 页公布每个资产的 SHA-256。你的终端原样不动 —— ASC 读的是事件流，不是你的屏幕。',
      'l.pain.title': '这些场景眼熟吗？',
      'l.pain1.title': '那个会话在哪个文件夹来着？',
      'l.pain1.body':
        '一天用几个 agent，散在好多工程文件夹里。两天后出了问题，想找回那场会话，得同时猜对 CLI、项目和日期 —— 三样都得对。',
      'l.pain2.title': '上次做到哪了？',
      'l.pain2.body':
        '长会话比你的记忆活得久。打开 CLI 只能看到你碰巧打开的那个文件夹里最新的记录。',
      'l.pain3.title': '人一走开，agent 就卡住。',
      'l.pain3.body':
        '停在权限确认上的 agent 会永远白等，一声不吭。人不在电脑前，就一点办法都没有。',
      'l.feat.title': '它能做什么',
      'l.f1.tag': '会话历史',
      'l.f1.title': '所有 agent 的所有会话，一个列表',
      'l.f1.body':
        'Claude Code、Codex CLI、OpenCode、Grok Build、Kimi Code、Pi、Antigravity、WorkBuddy 出现在同一个视图里 —— 带工作区路径、时长和状态。工作区只读扫描，不改任何东西。',
      'l.f2.tag': 'AI 查找',
      'l.f2.title': '用人话问，把会话找回来',
      'l.f2.body':
        '说得出大概 —— 做过什么、碰过哪个文件、大概什么时间 —— 查找就能跨所有 agent 一起缩小范围。不用记得当时用的是哪个 CLI。',
      'l.f3.tag': '一键恢复',
      'l.f3.title': '一下回到那段对话',
      'l.f3.body':
        '只有验证过的三家提供恢复：Claude Code、Codex CLI 和 Grok Build。其余地方的恢复按钮是灰的，原因直接写在按钮上 —— 没验证过的能力，绝不假装能用。',
      'l.f4.tag': '用量统计',
      'l.f4.title': 'token 和费用，按 agent、按天',
      'l.f4.body':
        '看清楚哪个 agent 什么时候烧了多少。数字读自本地会话文件，什么都不外发。',
      'l.f5.tag': '飞书通道',
      'l.f5.title': '审批推到手机，人在哪都行',
      'l.f5.body':
        'agent 停在权限确认上时，飞书把那张带着真实问题的卡片推过来。手机上点一下放行 —— 吃饭时、沙发上、离开电脑都行。',
      'l.truth.title': '它的边界画在哪',
      'l.truth1.title': '从不读你的终端',
      'l.truth1.body':
        '状态来自结构化事件 —— hooks、SSE、RPC、transcript —— 从不解析 TUI。CLI 保留自己的界面，ASC 补的是外围那一层。',
      'l.truth2.title': '能力有多少说多少',
      'l.truth2.body':
        '每个 agent 能上报的深度不同。ASC 在源码里声明各家能看见什么、看不见什么，拿不准就标低置信度，而不是猜。',
      'l.truth3.title': '未签名，但有哈希，可审查',
      'l.truth3.body':
        '构建未签名；每个 Release 公布 SHA-256，跑什么自己核得清。整个产品在 GitHub 上，Apache-2.0。',
      'l.dl.title': '下载',
      'l.dl.lede':
        'v1.0.4，Windows、Linux、macOS。下载即用，它会自己找到机器上已有的 agent —— 首次扫描几秒钟，数据不离开你的电脑。',
      'l.dl.cta': '获取最新版本',
      'l.foot.upstream':
        '早期原型源自 UniRound-Tec/hrack（Apache-2.0）；Agent Session Center 是独立维护的硬分叉，见 NOTICE。',
      'l.foot.demo': '截图为真实界面；模拟器页面的数据是编的。',
      'l.foot.line':
        'Agent Session Center · Apache-2.0 · 本站是静态页面，不发起任何网络请求。',

      'nav.home': '首页',

      'badge.fake': '全部为假数据',

      'hero.kicker': '交互式演示',
      'hero.title': '六个会话，其中一个在等你。',
      'hero.lede':
        '这一页上的东西全是编的 —— 会话、轮次、token 数、时间戳。没有编的是机制：点播放，看一条 agent 事件穿过四个阶段变成一个状态，并看着某个会话开始找你。',
      'hero.note':
        '珊瑚色只代表一件事：这个会话卡在等你确认。它是整个产品里唯一会发光的颜色。',

      'sim.title': '流水线，一步一步走',
      'sim.step': '进度',
      'sim.sessions': '会话',
      'sim.pipeline': '事件流水线',
      'sim.projection': '投影',
      'sim.tally': '每个会话都被算到',
      'sim.log': '事件日志',
      'sim.logHint': '每一行都是编的，但字段形状是真实的契约。',
      'sim.sourcesNote':
        '契约允许八种事件源，这里画了六种。另外两种是 fixture（只存在于测试里）和平台自己补的 lifecycle。',
      'sim.logEmpty': '等待第一条事件',

      'stage.normalizer': '原生协议 → AgentEvent',
      'stage.queue': '只按 seq 排序，不认时钟',
      'stage.reducer': '关联工具、审批、输入',
      'stage.projector': '六个状态、置信度、能力',

      'ctl.play': '播放',
      'ctl.pause': '暂停',
      'ctl.step': '单步',
      'ctl.reset': '重置',
      'ctl.atStart': '就绪。点播放，或者一次只走一个阶段。',
      'ctl.atEnd':
        '一条事件变成了一个状态，而有一个会话现在卡在等你。终端里的那个会话对这一切毫无察觉。',

      'legend.title': '六个状态，只有一颗灯是亮的',
      'legend.lede':
        '状态词汇恰好就是这六个值，而且它们是事件的投影，不是对终端屏幕的读图。观测者拿不准的时候会标记置信度，而不是编出第七个状态。',
      'legend.working.body': '正在输出。没你什么事。',
      'legend.needs-you.body': '卡在等你确认。会主动找到你的那一个。',
      'legend.done.body': '跑完了，可以收结果。',
      'legend.error.body': '炸了，需要人介入。',
      'legend.idle.body': '活着，但此刻没动静。',
      'legend.exited.body': '进程退了。历史里还能捞回来。',
      'legend.note':
        'exited 故意不等同于 error：干净退出与失败退出是两个不同的事实，而正是这个差别在告诉你该不该介入。',

      'caps.title': '每个 agent 实际上能汇报什么',
      'caps.lede':
        '各家 harness 的可见度并不相同。下面每一档都是在源码里声明的 —— 六个 harness 看 electron/agents/adapters/*/types.ts，DeepSeek Harness 看 electron/dsh-host/DshProjectionBridge.ts —— 不是为这一页编的。',
      'caps.note':
        '先看右边的列，差别都在那儿：OpenCode 整体走得最远，而且是唯一会汇报消息摘要的；Pi 是唯一同时报 token 和上下文的，不是只给一个数。再看左边的列，那是每个有实时通道的 harness 都有的 —— 思考阶段和工具生命周期。Antigravity 和 WorkBuddy 完全没有实时通道，只出现在会话历史里。',
      'caps.headNote': '条长表示这个维度能探到多深。满格意味着该 harness 在这一列达到了最高档。',
      'caps.col.harness': 'harness',
      'caps.gloss.harness': '声明这一行的观测方',
      'caps.col.thinking': 'thinking',
      'caps.col.tools': 'tools',
      'caps.col.approvals': 'approvals',
      'caps.col.inputRequests': 'inputRequests',
      'caps.col.usage': 'usage',
      'caps.col.messages': 'messages',
      'caps.gloss.thinking': '思考阶段能看到多少',
      'caps.gloss.tools': '工具调用是只报开始，还是报进度',
      'caps.gloss.approvals': '是否有结构化的审批请求',
      'caps.gloss.inputRequests': '是否有结构化的问题回给你',
      'caps.gloss.usage': 'token、上下文窗口，或两者都没有',
      'caps.gloss.messages': '助手消息摘要',

      'truth.title': '这一页里哪些是真的，哪些不是',
      'truth.realLabel': '真的：',
      'truth.real':
        '四个流水线阶段、六个状态、日志里的那些事件字段（<span class="mono">seq</span>、<span class="mono">nativeId</span>、<span class="mono">observerHealth</span>、<span class="mono">statusConfidence</span>）、能力档位，以及观测者死亡时的降级行为。',
      'truth.fakeLabel': '编的：',
      'truth.fake':
        '每一个会话名、轮次、时间戳、token 数和费用。这一页没有接触任何 CLI，没有后端，也没有读过任何文件。',
      'truth.noneLabel': '没有展示：',
      'truth.none':
        '终端本身。在真实应用里，CLI 的主面板跑的是它自己的原生 TUI —— 重点就在于 ASC 从不解析那些字节。',

      'try.title': '去用真家伙',
      'try.lede':
        '这一页是演示，不是应用。桌面版是 Windows、Linux、macOS 的未签名下载包，而这个仓库就是它被构建出来的地方。',
      'try.download': '下载最新版本',
      'try.repo': '看源码',

      'foot.line':
        'Agent Session Center · Apache-2.0 · 本演示是一个静态页面，不发起任何网络请求。',

      'n.1':
        '原生协议进，带类型的 AgentEvent 出。normalizer 是整个系统里唯一知道 "PreToolUse" 是什么意思的地方。',
      'n.2':
        '队列按 seq 排序，并丢掉已经见过的那些 —— hook 会重放，RPC 重连会重复投递。',
      'n.3':
        'reducer 为每个会话维护一组事实：并行的工具、待处理的审批、idle 覆盖。它到这里仍然拒绝给出状态。',
      'n.4':
        '现在事实变成状态了，而且是所有会话一起。注意 grok-build：它的观测者失联了，所以状态以低置信度上报，而不是猜一个。',
      'n.5':
        '第二条事件，走的是另一条通道。同样四个阶段，没有特例。',
      'n.6':
        '再次排队。这一条的时间戳比上一条还早，而这没有改变任何事。',
      'n.7':
        'reducer 把这个请求和正在等它的那一轮配上了。现在有一个会话带着未解决的审批。',
      'n.8':
        'projector 把这个会话提升为 needs-you。珊瑚色，也是整页唯一的光晕 —— 因为「卡在等人」是唯一值得打断你的事。'
    }
  }

  var current = 'en'

  function isLanguage(value) {
    return LANGUAGES.indexOf(value) !== -1
  }

  function fromQuery() {
    try {
      var match = /[?&]lang=([A-Za-z-]+)/.exec(window.location.search)
      if (!match) return null
      var value = match[1].toLowerCase()
      if (value.indexOf('zh') === 0 || value === 'cn') return 'zh'
      if (value.indexOf('en') === 0) return 'en'
    } catch (error) {
      /* A blocked cookie jar or a sandboxed iframe is not a reason to stop. */
    }
    return null
  }

  function fromStorage() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY)
      return isLanguage(value) ? value : null
    } catch (error) {
      return null
    }
  }

  function fromDocument() {
    var value = document.documentElement.getAttribute('data-default-lang')
    return isLanguage(value) ? value : null
  }

  function fromNavigator() {
    var value = (navigator.language || '').toLowerCase()
    return value.indexOf('zh') === 0 ? 'zh' : 'en'
  }

  function resolve() {
    return fromQuery() || fromStorage() || fromDocument() || fromNavigator()
  }

  var listeners = []

  function t(key, language) {
    var pack = STRINGS[language || current] || STRINGS.en
    if (Object.prototype.hasOwnProperty.call(pack, key)) return pack[key]
    if (Object.prototype.hasOwnProperty.call(STRINGS.en, key)) return STRINGS.en[key]
    return key
  }

  function apply(language) {
    current = isLanguage(language) ? language : 'en'

    var pack = STRINGS[current]
    document.documentElement.setAttribute('lang', current === 'zh' ? 'zh-CN' : 'en')
    /* The landing page and the simulator page ship different titles, so the key is
       declared on <html data-doc-title-key> and falls back to the simulator's. */
    document.title = t(document.documentElement.getAttribute('data-doc-title-key') || 'doc.title')

    var description = document.querySelector('meta[name="description"]')
    if (description) {
      description.setAttribute(
        'content',
        t(document.documentElement.getAttribute('data-doc-desc-key') || 'doc.description')
      )
    }

    var nodes = document.querySelectorAll('[data-i18n]')
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index]
      var key = node.getAttribute('data-i18n')
      if (!Object.prototype.hasOwnProperty.call(pack, key) &&
          !Object.prototype.hasOwnProperty.call(STRINGS.en, key)) {
        continue
      }
      /* The table is authored, ships with the page, and two entries carry inline
         markup on purpose, so this is innerHTML and not textContent. */
      node.innerHTML = t(key)
    }

    var buttons = document.querySelectorAll('.lang-btn')
    for (var index2 = 0; index2 < buttons.length; index2 += 1) {
      var button = buttons[index2]
      button.setAttribute(
        'aria-pressed',
        button.getAttribute('data-lang') === current ? 'true' : 'false'
      )
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, current)
    } catch (error) {
      /* Private mode. The language still applies for this page view. */
    }

    for (var index3 = 0; index3 < listeners.length; index3 += 1) {
      listeners[index3](current)
    }
  }

  /* Switching language is switching sites, not swapping strings in place.
   *
   * The two roots are built from one source and declared against each other with
   * hreflang, so the URL is meant to carry the language: the Chinese host serves
   * Chinese, the English host serves English, and a link copied out of either one
   * lands a fresh visitor in the language the URL promised. Swapping strings in
   * place breaks that promise, and because resolve() ranks localStorage above the
   * domain default, a single in-place switch would stick for good. So the control
   * navigates to the counterpart origin when one is declared, carrying the path and
   * hash and dropping any ?lang= (a query parameter outranks the domain default, so
   * a carried ?lang=zh would render the English site in Chinese). With no declared
   * counterpart — local development, or a build that omitted the two host variables
   * — there is nowhere to go, and it falls back to the in-place switch. */
  function switchTo(language) {
    if (!isLanguage(language)) return
    if (language === current) return

    var selector = language === 'en'
      ? 'link[rel="alternate"][hreflang="en"]'
      : 'link[rel="alternate"][hreflang="zh-Hans"]'
    var link = document.querySelector(selector)
    var origin = null
    if (link && link.getAttribute('href')) {
      try {
        var resolved = new URL(link.getAttribute('href'), window.location.href)
        if (resolved.origin && resolved.origin !== window.location.origin) {
          origin = resolved.origin
        }
      } catch (error) {
        origin = null
      }
    }

    if (!origin) {
      apply(language)
      return
    }

    var target = new URL(window.location.pathname + window.location.search + window.location.hash, origin)
    target.searchParams.delete('lang')
    window.location.href = target.href
  }

  window.ASCDemo = window.ASCDemo || {}
  window.ASCDemo.i18n = {
    LANGUAGES: LANGUAGES,
    strings: STRINGS,
    t: t,
    apply: apply,
    switchTo: switchTo,
    get language() {
      return current
    },
    resolve: resolve,
    onChange: function (listener) {
      listeners.push(listener)
    }
  }
})()
