/* Agent Session Center — interactive demo: the simulator.
 *
 * The page has one job: show that a status is derived from events rather than read off
 * a terminal. So the simulator replays eight steps of the real pipeline over one
 * fabricated event, then over a second one, and lets the reader stop anywhere.
 *
 * Two kinds of content live in this file and they are kept apart on purpose:
 *
 *   Quoted from the source (do not "improve" without checking the source again)
 *     · the six states and their order          shared/agent-events.ts
 *     · the eight event sources                 shared/agent-events.ts
 *     · observerHealth / statusConfidence       shared/agent-events.ts
 *     · the capability levels per harness       electron/agents/adapters/*&#47;types.ts
 *                                               electron/dsh-host/DshProjectionBridge.ts
 *     · the four stage names and their jobs     electron/agents/AgentEvent*.ts
 *     · event kinds and payload fields          shared/agent-events.ts
 *
 *   Invented for this page (every session, path, timestamp, token count, request id)
 *     · SESSIONS, BASELINE, and the `detail` strings inside STEPS
 *
 * The simulator never touches the network and never reads anything from disk. It is a
 * pure function of the step index: render() recomputes the whole scene from
 * STEPS.slice(0, index), so any state the reader can reach is a state they can explain.
 */
;(function () {
  'use strict'

  var demo = window.ASCDemo
  if (!demo || !demo.i18n) throw new Error('i18n.js must load before app.js')
  var i18n = demo.i18n
  var t = i18n.t

  /* ─────────────────────────────── quoted from the source ─────────────────────── */

  /* shared/agent-events.ts — the projection is a closed set of six, and exposing a
     seventh would mean the observer guessed. */
  var STATUSES = ['needs-you', 'working', 'done', 'error', 'idle', 'exited']

  /* shared/agent-events.ts — AgentEventSource, minus `fixture` (tests only) and plus
     `lifecycle` folded into the platform lane, which is how the README diagram draws it. */
  var EVENT_SOURCES = ['native-stream', 'jsonl', 'rpc · acp', 'hook', 'transcript', 'lifecycle']

  /* shared/agent-events.ts — ObserverCapabilities. The array order is the depth order;
     the index doubles as the bar length. */
  var CAPABILITY_LEVELS = {
    thinking: ['none', 'phase', 'summary'],
    tools: ['none', 'lifecycle', 'progress'],
    approvals: ['none', 'structured'],
    inputRequests: ['none', 'structured'],
    usage: ['none', 'tokens', 'context', 'tokens-and-context'],
    messages: ['none', 'summary']
  }

  var CAPABILITY_COLUMNS = [
    'thinking',
    'tools',
    'approvals',
    'inputRequests',
    'usage',
    'messages'
  ]

  /* Verbatim from the adapters, except for the ids: the adapter registry names are
     `claude-code`, `codex`, `grok`, `kimi`, `opencode`, `pi` (GrokObserverAdapter.ts:196
     and friends), and DeepSeek Harness declares its own set one subsystem over, in
     DshProjectionBridge.apply() — it is not in the adapter registry at all. */
  var CAPABILITIES = [
    { agent: 'claude-code', thinking: 'phase', tools: 'lifecycle', approvals: 'structured', inputRequests: 'structured', usage: 'none', messages: 'none' },
    { agent: 'codex', thinking: 'phase', tools: 'lifecycle', approvals: 'structured', inputRequests: 'none', usage: 'none', messages: 'none' },
    { agent: 'grok', thinking: 'phase', tools: 'lifecycle', approvals: 'structured', inputRequests: 'none', usage: 'none', messages: 'none' },
    { agent: 'kimi', thinking: 'phase', tools: 'lifecycle', approvals: 'structured', inputRequests: 'none', usage: 'none', messages: 'none' },
    { agent: 'opencode', thinking: 'phase', tools: 'progress', approvals: 'structured', inputRequests: 'structured', usage: 'tokens', messages: 'summary' },
    { agent: 'pi', thinking: 'phase', tools: 'progress', approvals: 'none', inputRequests: 'none', usage: 'tokens-and-context', messages: 'none' },
    { agent: 'dsh', thinking: 'phase', tools: 'lifecycle', approvals: 'structured', inputRequests: 'structured', usage: 'none', messages: 'none' }
  ]

  /* ──────────────────────────────── invented for this page ────────────────────── */

  var SESSIONS = [
    { id: 'grok-blog', agent: 'grok', workspace: 'blog-engine', turn: 7, age: '2m', tokens: '12.1k' },
    { id: 'claude-api', agent: 'claude-code', workspace: 'api-server', turn: 12, age: 'now', tokens: '18.4k' },
    { id: 'codex-hook', agent: 'codex', workspace: 'webhook-relay', turn: 3, age: '11m', tokens: '4.9k' },
    { id: 'opencode-pt', agent: 'opencode', workspace: 'pt-toolkit', turn: 21, age: '1h', tokens: '64.2k' },
    { id: 'kimi-blog', agent: 'kimi', workspace: 'blog-engine', turn: 9, age: '26m', tokens: '21.7k' },
    { id: 'pi-asc', agent: 'pi', workspace: 'agent-session-center', turn: 2, age: '4m', tokens: '3.1k' }
  ]

  /* The projection the reader sees before pressing anything: five of the six states are
     already on screen, so the vocabulary is legible before the mechanism is. */
  var BASELINE = {
    'grok-blog': { status: 'working', confidence: 'high', health: 'healthy' },
    'claude-api': { status: 'working', confidence: 'high', health: 'healthy' },
    'codex-hook': { status: 'error', confidence: 'high', health: 'healthy' },
    'opencode-pt': { status: 'done', confidence: 'high', health: 'healthy' },
    'kimi-blog': { status: 'exited', confidence: 'high', health: 'lifecycle-only' },
    'pi-asc': { status: 'idle', confidence: 'high', health: 'healthy' }
  }

  /* Every column is one wider than its longest value, because pad() only pads: a value
     that exactly fills its column would run straight into the next one. `native-stream`
     is exactly 13 characters, which is how this was found. */
  var LABEL_WIDTH = 28
  var SOURCE_WIDTH = 14
  var STAGE_WIDTH = 12
  var HOLD_MS = 1600
  var HOLD_LONG_MS = 2800

  function ev(seq, source, stage, detail, tone) {
    return { seq: seq, source: source, stage: stage, detail: detail, tone: tone || '' }
  }

  /* A continuation line of the same event: the columns stay aligned, the head goes blank. */
  function cont(stage, detail, tone) {
    return { seq: null, source: '', stage: stage, detail: detail, tone: tone || '' }
  }

  function projectionLine(sessionId, status, confidence, health) {
    var session = sessionById(sessionId)
    return (
      pad(session.agent + ' · ' + session.workspace, LABEL_WIDTH) +
      pad(status, 12) +
      'confidence=' + pad(confidence, 7) +
      'observer=' + health
    )
  }

  /* Event A: a tool call. Steps 1–4. */
  var STEP_A_NORMALIZE = {
    stage: 'normalizer',
    source: 'hook',
    narrator: 'n.1',
    hold: HOLD_MS,
    lines: [
      ev(41, 'hook', 'normalizer', 'native "PreToolUse"  ->  AgentEvent'),
      cont('normalizer', 'kind=tool.started  session=claude-api  nativeId=hook_8f21c'),
      cont('normalizer', 'payload  callId=call_7f3  name=Edit  category=edit  turnId=turn_12')
    ]
  }

  var STEP_A_QUEUE = {
    stage: 'queue',
    source: 'hook',
    narrator: 'n.2',
    hold: HOLD_MS,
    lines: [
      cont('queue', 'admit  seq=41  monotonic per session; occurredAt is never consulted'),
      cont('queue', 'dedupe  nativeId=hook_8f21c  seen=0  ->  accept')
    ]
  }

  var STEP_A_REDUCE = {
    stage: 'reducer',
    source: 'hook',
    narrator: 'n.3',
    hold: HOLD_MS,
    lines: [
      cont('reducer', 'activeTools[call_7f3] = { name: Edit, turnId: turn_12 }'),
      cont('reducer', 'pendingApprovals={}  pendingInput={}  idleOverride=false  exited=false')
    ]
  }

  var STEP_A_PROJECT = {
    stage: 'projector',
    source: 'hook',
    narrator: 'n.4',
    hold: HOLD_LONG_MS,
    projection: { session: 'claude-api', status: 'working', confidence: 'high', health: 'healthy' },
    lines: [
      cont('projector', 'projecting 6 sessions'),
      cont('', projectionLine('grok-blog', 'working', 'low', 'stale')),
      cont('', projectionLine('claude-api', 'working', 'high', 'healthy')),
      cont('', projectionLine('codex-hook', 'error', 'high', 'healthy')),
      cont('', projectionLine('opencode-pt', 'done', 'high', 'healthy')),
      cont('', projectionLine('kimi-blog', 'exited', 'high', 'lifecycle-only')),
      cont('', projectionLine('pi-asc', 'idle', 'high', 'healthy'))
    ],
    /* grok-build reported healthy in the last projection and cannot be trusted now. The
       observer says so instead of holding its last confident answer. */
    patch: {
      'grok-blog': { health: 'stale', confidence: 'low' },
      'kimi-blog': { health: 'lifecycle-only' }
    }
  }

  /* Event B: an approval request on the same session. Steps 5–8. */
  var STEP_B_NORMALIZE = {
    stage: 'normalizer',
    source: 'native-stream',
    narrator: 'n.5',
    hold: HOLD_MS,
    lines: [
      ev(42, 'native-stream', 'normalizer', 'approval.requested'),
      cont('normalizer', 'requestId=req_9a  category=command  callId=call_9d1  turnId=turn_12'),
      cont('normalizer', 'summary  "rm -rf .next && pnpm build"')
    ]
  }

  var STEP_B_QUEUE = {
    stage: 'queue',
    source: 'native-stream',
    narrator: 'n.6',
    hold: HOLD_MS,
    lines: [
      cont('queue', 'admit  seq=42'),
      cont('queue', 'occurredAt is 412ms EARLIER than seq=41 — seq still decides the order')
    ]
  }

  var STEP_B_REDUCE = {
    stage: 'reducer',
    source: 'native-stream',
    narrator: 'n.7',
    hold: HOLD_MS,
    lines: [
      cont('reducer', 'pendingApprovals[req_9a] = { category: command, turnId: turn_12 }'),
      cont('reducer', 'correlated with activeTurn=turn_12  ->  1 request waiting on a human')
    ]
  }

  var STEP_B_PROJECT = {
    stage: 'projector',
    source: 'native-stream',
    narrator: 'n.8',
    hold: HOLD_LONG_MS,
    coral: true,
    projection: { session: 'claude-api', status: 'needs-you', confidence: 'high', health: 'healthy' },
    lines: [
      cont('', projectionLine('claude-api', 'needs-you', 'high', 'healthy'), 'l-coral'),
      cont('projector', 'pendingAttentionCount=1  ->  needs-you'),
      cont('', 'sidebar · floating window · Feishu push  —  the surfaces that find you', 'l-dim'),
      cont('', 'the PTY and its native TUI were never touched', 'l-dim')
    ],
    patch: {
      'claude-api': { status: 'needs-you', confidence: 'high', health: 'healthy' }
    }
  }

  var STEPS = [
    STEP_A_NORMALIZE,
    STEP_A_QUEUE,
    STEP_A_REDUCE,
    STEP_A_PROJECT,
    STEP_B_NORMALIZE,
    STEP_B_QUEUE,
    STEP_B_REDUCE,
    STEP_B_PROJECT
  ]

  /* ──────────────────────────────── helpers ───────────────────────────────────── */

  function pad(value, width) {
    var text = String(value)
    while (text.length < width) text += ' '
    return text
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function sessionById(id) {
    for (var index = 0; index < SESSIONS.length; index += 1) {
      if (SESSIONS[index].id === id) return SESSIONS[index]
    }
    return null
  }

  function merge(base, extra) {
    var out = {}
    Object.keys(base).forEach(function (key) {
      out[key] = base[key]
    })
    Object.keys(extra || {}).forEach(function (key) {
      out[key] = extra[key]
    })
    return out
  }

  /* ──────────────────────────────── state ─────────────────────────────────────── */

  var state = { index: 0, playing: false, timer: null }

  var nodes = {
    sessions: document.getElementById('sessions'),
    sources: document.getElementById('sources'),
    stages: document.getElementById('stages'),
    projection: document.getElementById('projection-value'),
    tally: document.getElementById('tally'),
    log: document.getElementById('log'),
    legend: document.getElementById('legend'),
    caps: document.getElementById('caps'),
    counter: document.getElementById('step-counter'),
    narrator: document.getElementById('narrator'),
    play: document.getElementById('btn-play'),
    step: document.getElementById('btn-step'),
    reset: document.getElementById('btn-reset')
  }

  function applied() {
    return STEPS.slice(0, state.index)
  }

  /* Recompute the whole scene from the step index. Nothing is mutated in place, which is
     why Reset can never leave a stale dot behind. */
  function projectionAt(count) {
    var map = {}
    Object.keys(BASELINE).forEach(function (id) {
      map[id] = merge(BASELINE[id], null)
    })
    STEPS.slice(0, count).forEach(function (step) {
      Object.keys(step.patch || {}).forEach(function (id) {
        map[id] = merge(map[id], step.patch[id])
      })
    })
    return map
  }

  /* ──────────────────────────────── rendering ─────────────────────────────────── */

  function renderSessions() {
    var projection = projectionAt(state.index)
    var html = SESSIONS.map(function (session) {
      var entry = projection[session.id]
      var meta = ['<span class="session-status">' + esc(entry.status) + '</span>']
      if (entry.health !== 'healthy') {
        meta.push('<span class="session-note">observer=' + esc(entry.health) + '</span>')
      }
      if (entry.confidence === 'low') {
        meta.push('<span class="session-note">confidence=low</span>')
      }
      return (
        '<li class="session" data-status="' + esc(entry.status) +
        '" data-degraded="' + (entry.confidence === 'low' ? 'true' : 'false') + '">' +
        '<span class="session-dot"></span>' +
        '<span class="session-text">' +
        '<span class="session-name">' + esc(session.agent + ' · ' + session.workspace) + '</span>' +
        '<span class="session-path">' +
        esc('turn ' + session.turn + '  ·  ' + session.age + '  ·  ' + session.tokens + ' tok') +
        '</span>' +
        '</span>' +
        '<span class="session-meta">' + meta.join('') + '</span>' +
        '</li>'
      )
    })
    nodes.sessions.innerHTML = html.join('')
  }

  function renderSources() {
    var last = state.index > 0 ? STEPS[state.index - 1] : null
    nodes.sources.innerHTML = EVENT_SOURCES.map(function (source) {
      var active = last && last.source === source
      return (
        '<span class="source' + (active ? ' is-active' : '') + '">' + esc(source) + '</span>'
      )
    }).join('')
  }

  function renderStages() {
    var last = state.index > 0 ? STEPS[state.index - 1] : null
    var stageNodes = nodes.stages.querySelectorAll('.stage')
    for (var index = 0; index < stageNodes.length; index += 1) {
      var node = stageNodes[index]
      var active = last && node.getAttribute('data-stage') === last.stage
      node.classList.toggle('is-active', Boolean(active))
    }
  }

  function renderProjection() {
    var last = state.index > 0 ? STEPS[state.index - 1] : null
    if (!last) {
      nodes.projection.innerHTML = '<span class="is-faint">— · no events yet</span>'
      return
    }
    if (!last.projection) {
      nodes.projection.innerHTML =
        '<span class="is-faint">— · stage=' + esc(last.stage) + ' · no projection yet</span>'
      return
    }
    var target = last.projection
    var session = sessionById(target.session)
    var status =
      target.status === 'needs-you'
        ? '<span class="is-coral">needs-you</span>'
        : '<strong>' + esc(target.status) + '</strong>'
    nodes.projection.innerHTML =
      esc(session.agent + ' · ' + session.workspace) +
      '  →  ' + status +
      '  ·  confidence=' + esc(target.confidence) +
      '  ·  observer=' + esc(target.health)
  }

  /* The projection is a closed set of six, so the counts have to add up to the number of
     sessions at every step. That is the cheapest possible proof that no seventh state
     was quietly invented to describe a situation the observer could not name. */
  function renderTally() {
    var projection = projectionAt(state.index)
    var counts = {}
    STATUSES.forEach(function (status) {
      counts[status] = 0
    })
    Object.keys(projection).forEach(function (id) {
      var status = projection[id].status
      if (counts[status] !== undefined) counts[status] += 1
    })
    nodes.tally.innerHTML = STATUSES.map(function (status) {
      return (
        '<span class="tally-item" data-status="' + status +
        '" data-zero="' + (counts[status] === 0 ? 'true' : 'false') + '">' +
        '<i class="tally-dot"></i>' +
        '<span class="tally-count mono">' + counts[status] + '</span>' +
        '<span class="tally-name">' + esc(status) + '</span>' +
        '</span>'
      )
    }).join('')
  }

  function renderLog() {
    var lines = []
    applied().forEach(function (step) {
      step.lines.forEach(function (line) {
        lines.push(line)
      })
    })
    if (lines.length === 0) {
      nodes.log.innerHTML = '<span class="l-dim">' + esc(t('sim.logEmpty')) + '</span>'
      return
    }
    var html = lines.map(function (line) {
      var head = line.seq === null ? '    ' : '#' + pad(line.seq, 3)
      var body =
        head + '  ' + pad(line.source, SOURCE_WIDTH) + pad(line.stage, STAGE_WIDTH) + line.detail
      var rendered = esc(body)
      return line.tone ? '<span class="' + line.tone + '">' + rendered + '</span>' : rendered
    })
    nodes.log.innerHTML = html.join('\n')
    nodes.log.scrollTop = nodes.log.scrollHeight
  }

  function renderCounter() {
    nodes.counter.textContent = state.index + ' / ' + STEPS.length
  }

  function renderNarrator() {
    if (state.index === 0) {
      nodes.narrator.textContent = t('ctl.atStart')
      nodes.narrator.classList.remove('is-coral')
      return
    }
    var last = STEPS[state.index - 1]
    var html = esc(t(last.narrator))
    if (state.index === STEPS.length && !state.playing) {
      html += '<span class="narrator-tail">' + esc(t('ctl.atEnd')) + '</span>'
    }
    nodes.narrator.innerHTML = html
    nodes.narrator.classList.toggle('is-coral', Boolean(last.coral))
  }

  function renderControls() {
    nodes.play.textContent = state.playing ? t('ctl.pause') : t('ctl.play')
    nodes.play.setAttribute('aria-pressed', state.playing ? 'true' : 'false')
    nodes.step.disabled = state.playing || state.index >= STEPS.length
    nodes.reset.disabled = false
  }

  function renderLegend() {
    nodes.legend.innerHTML = STATUSES.map(function (status) {
      return (
        '<li data-status="' + status + '">' +
        '<span class="legend-dot"></span>' +
        '<span>' +
        '<span class="legend-name">' + esc(status) + '</span>' +
        '<span class="legend-body">' + esc(t('legend.' + status + '.body')) + '</span>' +
        '</span>' +
        '</li>'
      )
    }).join('')
  }

  function depthOf(column, level) {
    var levels = CAPABILITY_LEVELS[column]
    var index = levels.indexOf(level)
    return index < 0 ? 0 : index
  }

  function renderCapabilities() {
    var head =
      '<thead><tr><th scope="col"><span class="mono">' + esc(t('caps.col.harness')) + '</span>' +
      '<span class="th-gloss">' + esc(t('caps.gloss.harness')) + '</span></th>' +
      CAPABILITY_COLUMNS.map(function (column) {
        return (
          '<th scope="col">' +
          '<span class="mono">' + esc(t('caps.col.' + column)) + '</span>' +
          '<span class="th-gloss">' + esc(t('caps.gloss.' + column)) + '</span>' +
          '</th>'
        )
      }).join('') +
      '</tr></thead>'

    var body = '<tbody>' + CAPABILITIES.map(function (row) {
      var cells = CAPABILITY_COLUMNS.map(function (column) {
        var level = row[column]
        var max = CAPABILITY_LEVELS[column].length - 1
        var percent = Math.round((depthOf(column, level) / max) * 100)
        return (
          '<td' + (level === 'none' ? ' class="none"' : '') + '>' +
          '<span class="depth" aria-hidden="true"><i style="width:' + percent + '%"></i></span>' +
          esc(level) +
          '</td>'
        )
      }).join('')
      return '<tr><th scope="row">' + esc(row.agent) + '</th>' + cells + '</tr>'
    }).join('') + '</tbody>'

    nodes.caps.innerHTML = head + body
  }

  function render() {
    renderSessions()
    renderSources()
    renderStages()
    renderProjection()
    renderTally()
    renderLog()
    renderCounter()
    renderNarrator()
    renderControls()
  }

  function announce() {
    /* The narrator is aria-live="polite", so replacing its text is the whole announcement. */
    renderNarrator()
    renderControls()
  }

  /* ──────────────────────────────── playback ─────────────────────────────────── */

  function stop() {
    state.playing = false
    if (state.timer) {
      window.clearTimeout(state.timer)
      state.timer = null
    }
  }

  function advance() {
    if (!state.playing) return
    if (state.index >= STEPS.length) {
      stop()
      render()
      return
    }
    var step = STEPS[state.index]
    state.index += 1
    render()
    state.timer = window.setTimeout(advance, step.hold)
  }

  function togglePlay() {
    if (state.playing) {
      stop()
      announce()
      return
    }
    if (state.index >= STEPS.length) state.index = 0
    state.playing = true
    advance()
  }

  function stepOnce() {
    if (state.playing || state.index >= STEPS.length) return
    state.index += 1
    render()
  }

  function reset() {
    stop()
    state.index = 0
    render()
  }

  /* ──────────────────────────────── wiring ───────────────────────────────────── */

  if (
    !nodes.sessions || !nodes.sources || !nodes.stages || !nodes.projection ||
    !nodes.tally || !nodes.log || !nodes.legend || !nodes.caps || !nodes.counter ||
    !nodes.narrator
  ) {
    throw new Error('the demo markup is incomplete; refusing to render half a page')
  }

  nodes.play.addEventListener('click', togglePlay)
  nodes.step.addEventListener('click', stepOnce)
  nodes.reset.addEventListener('click', reset)

  document.addEventListener('keydown', function (event) {
    if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return
    var key = event.key || ''
    if (key === ' ' || key === 'Enter') {
      /* Let the focused control handle its own activation. */
      if (event.target === nodes.play || event.target === nodes.step || event.target === nodes.reset) {
        return
      }
      event.preventDefault()
      togglePlay()
    } else if (key === 'ArrowRight') {
      event.preventDefault()
      stop()
      stepOnce()
    } else if (key === 'r' || key === 'R') {
      reset()
    }
  })

  var buttons = document.querySelectorAll('.lang-btn')
  for (var index = 0; index < buttons.length; index += 1) {
    buttons[index].addEventListener('click', function (event) {
      i18n.switchTo(event.currentTarget.getAttribute('data-lang'))
    })
  }

  /* The legend and the capability table are prose, so a language switch rebuilds them.
     The log, the session list and the pipeline are machine text and survive untouched,
     which is itself the point of the page. */
  i18n.onChange(function () {
    renderLegend()
    renderCapabilities()
    renderNarrator()
    renderControls()
  })

  /* apply() fires the listener above, so the two prose sections are already built by the
     time render() fills in everything else. */
  i18n.apply(i18n.resolve())
  render()
})()

