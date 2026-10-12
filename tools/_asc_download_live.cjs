/* Live check of the trimmed download page: two cards, Windows and macOS only.
   Renders the real domains rather than the built files, so a stale deploy fails here. */
const { chromium } = require('playwright')

const SITES = [
  { name: 'zh', origin: 'https://asc.chupian.cloud', expectMacLabel: 'Apple 芯片', expectMeta: '支持 Windows 和 macOS' },
  { name: 'en', origin: 'https://asc-en.chupian.cloud', expectMacLabel: 'Apple silicon', expectMeta: 'for Windows and macOS' }
]
const FORBIDDEN = ['linux-x64', 'AppImage', '.deb', 'macos-x64', 'Ubuntu', 'Debian', 'sha256sum']

let failures = 0
function check(label, ok, detail) {
  if (!ok) failures += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail !== undefined ? '  [' + detail + ']' : ''))
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const outDir = 'D:/workbuudy/2026-10-04-12-59-25'

  for (const site of SITES) {
    console.log('--- ' + site.name + ' ' + site.origin + ' ---')
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
    page.on('pageerror', e => errors.push('pageerror: ' + e.message))

    await page.goto(site.origin + '/download.html', { waitUntil: 'networkidle' })

    const cards = await page.$$eval('.dl-card', els => els.map(el => ({
      label: (el.querySelector('h3') || {}).textContent || '',
      file: (el.querySelector('.dl-file') || {}).textContent || '',
      size: (el.querySelector('.dl-size') || {}).textContent || '',
      href: (el.querySelector('.dl-actions a') || {}).getAttribute ? el.querySelector('.dl-actions a').getAttribute('href') : '',
      shaHref: (el.querySelector('.dl-hash-link') || {}).getAttribute ? el.querySelector('.dl-hash-link').getAttribute('href') : '',
      hash: (el.querySelector('.dl-hash code') || {}).textContent || ''
    })))

    check('exactly two cards', cards.length === 2, String(cards.length))
    const files = cards.map(c => c.file.trim())
    check('card 1 is the Windows installer', files[0] === 'AgentSessionCenter-Setup-1.0.6.exe', files[0])
    check('card 2 is the arm64 disk image', files[1] === 'AgentSessionCenter-1.0.6-macos-arm64.dmg', files[1])
    check('Windows size', cards[0] && cards[0].size.trim() === '81.80 MiB', cards[0] && cards[0].size.trim())
    check('macOS size', cards[1] && cards[1].size.trim() === '107.54 MiB', cards[1] && cards[1].size.trim())
    check('Windows hash', cards[0] && cards[0].hash.trim() === 'e6129ce05759046e6f0f753b2d2347fca14fd15bff7162346d5817d95d463a5a')
    check('macOS hash', cards[1] && cards[1].hash.trim() === 'a68610e83d456bd7019d9b6253d0ebd77a41d430ddb539dbd5c13f8438747fe6')
    check('Windows download + sidecar links', cards[0] && cards[0].href === '/downloads/AgentSessionCenter-Setup-1.0.6.exe' && cards[0].shaHref === '/downloads/AgentSessionCenter-Setup-1.0.6.exe.sha256')
    check('macOS download + sidecar links', cards[1] && cards[1].href === '/downloads/AgentSessionCenter-1.0.6-macos-arm64.dmg' && cards[1].shaHref === '/downloads/AgentSessionCenter-1.0.6-macos-arm64.dmg.sha256')
    check('macOS card labelled for Apple silicon', cards[1] && cards[1].label.indexOf(site.expectMacLabel) !== -1, cards[1] && cards[1].label.trim())

    const body = await page.textContent('body')
    for (const token of FORBIDDEN) {
      check('page no longer mentions "' + token + '"', body.indexOf(token) === -1)
    }
    check('no leftover 1.0.3', body.indexOf('1.0.3') === -1)

    const verify = await page.textContent('[data-i18n="pdl.verify.body"]')
    check('verify section keeps certutil', verify.indexOf('certutil') !== -1)
    check('verify section keeps shasum', verify.indexOf('shasum') !== -1)
    check('verify section has no sha256sum', verify.indexOf('sha256sum') === -1)

    const unsigned = await page.textContent('[data-i18n="pdl.unsigned.body"]')
    check('unsigned section no longer mentions Linux', unsigned.indexOf('Linux') === -1)

    const steps = await page.$$eval('.doc-steps li', els => els.length)
    check('after-download steps = 2', steps === 2, String(steps))

    const meta = await page.getAttribute('meta[name="description"]', 'content')
    check('meta description updated', (meta || '').indexOf(site.expectMeta) !== -1, meta)

    // Layout: the grid used to hold five cards across three tracks, so two must not
    // leave a third of the row empty, nor stretch into a column of their own.
    const grid = await page.$eval('.dl-grid', el => {
      const style = getComputedStyle(el)
      const gap = parseFloat(style.columnGap) || 0
      const items = Array.from(el.children).map(c => c.getBoundingClientRect())
      const sum = items.reduce((total, r) => total + r.width, 0) + gap * (items.length - 1)
      return {
        tracks: style.gridTemplateColumns.split(' ').length,
        columns: style.gridTemplateColumns,
        widths: items.map(r => Math.round(r.width)),
        heights: items.map(r => Math.round(r.height)),
        container: Math.round(el.getBoundingClientRect().width),
        covered: Math.round(sum),
        sameRow: items.length === 2 && Math.abs(items[0].top - items[1].top) < 4
      }
    })
    console.log('      grid tracks=' + grid.tracks + ' columns=' + grid.columns +
      ' widths=' + JSON.stringify(grid.widths) + ' heights=' + JSON.stringify(grid.heights) +
      ' covered=' + grid.covered + '/' + grid.container)
    check('grid has exactly two tracks', grid.tracks === 2, String(grid.tracks))
    check('two cards share a row', grid.sameRow)
    check('two cards have equal width', grid.widths[0] === grid.widths[1], JSON.stringify(grid.widths))
    check('two cards fill the row, no empty third', Math.abs(grid.container - grid.covered) < 3,
      grid.covered + ' of ' + grid.container)
    check('cards are not stretched above a sane height', Math.max(...grid.heights) < 700, JSON.stringify(grid.heights))

    await page.screenshot({ path: outDir + '/dl-live-' + site.name + '-two-cards.png', fullPage: true })
    check('zero console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

    await context.close()
  }

  await browser.close()
  console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED')
  process.exit(failures === 0 ? 0 : 1)
})().catch(error => { console.error('harness error:', error.message); process.exit(2) })
