/* Live check of the cross-site language switch on the two production domains.
   Production hreflang carries the real addresses, so nothing needs rewriting here. */
const { chromium } = require('playwright')

const ZH = 'https://asc.chupian.cloud'
const EN = 'https://asc-en.chupian.cloud'

let failures = 0
function check(label, ok, detail) {
  if (!ok) failures += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''))
}

async function open(browser, url) {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  return { context, page, errors }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const allErrors = []

  // 1. Chinese site -> click EN -> must land on the English site
  {
    const { context, page, errors } = await open(browser, ZH + '/download.html')
    check('starts on the Chinese origin', new URL(page.url()).origin === ZH, page.url())
    const langBefore = await page.getAttribute('html', 'lang')
    check('starts rendered Chinese', langBefore === 'zh-CN', String(langBefore))

    await Promise.all([
      page.waitForURL(u => new URL(u).origin === EN, { timeout: 30000 }),
      page.click('.lang-btn[data-lang="en"]')
    ])
    check('zh -> EN navigated to the English origin', new URL(page.url()).origin === EN, page.url())
    check('path preserved', new URL(page.url()).pathname === '/download.html', new URL(page.url()).pathname)
    const langAfter = await page.getAttribute('html', 'lang')
    check('destination renders English', langAfter === 'en', String(langAfter))
    const h1 = (await page.textContent('.doc-hero h1')) || ''
    check('destination heading is English', /download/i.test(h1) && !/[\u4e00-\u9fff]/.test(h1), h1.trim().slice(0, 40))
    allErrors.push(...errors)
    await context.close()
  }

  // 2. English site -> click 中文 -> must land on the Chinese site
  {
    const { context, page, errors } = await open(browser, EN + '/simulator.html')
    check('starts on the English origin', new URL(page.url()).origin === EN, page.url())
    await Promise.all([
      page.waitForURL(u => new URL(u).origin === ZH, { timeout: 30000 }),
      page.click('.lang-btn[data-lang="zh"]')
    ])
    check('EN -> zh navigated to the Chinese origin', new URL(page.url()).origin === ZH, page.url())
    check('path preserved /simulator.html', new URL(page.url()).pathname === '/simulator.html', new URL(page.url()).pathname)
    const langAfter = await page.getAttribute('html', 'lang')
    check('destination renders Chinese', langAfter === 'zh-CN', String(langAfter))
    allErrors.push(...errors)
    await context.close()
  }

  // 3. ?lang= must not be carried across, or fromQuery() on the destination would win
  {
    const { context, page, errors } = await open(browser, ZH + '/download.html?lang=zh')
    await Promise.all([
      page.waitForURL(u => new URL(u).origin === EN, { timeout: 30000 }),
      page.click('.lang-btn[data-lang="en"]')
    ])
    const final = page.url()
    check('destination URL carries no lang parameter', !/[?&]lang=/.test(final), final)
    const langAfter = await page.getAttribute('html', 'lang')
    check('destination still renders English', langAfter === 'en', String(langAfter))
    allErrors.push(...errors)
    await context.close()
  }

  // 4. Clicking the language you are already in must not navigate
  {
    const { context, page, errors } = await open(browser, EN + '/docs.html')
    const before = page.url()
    await page.click('.lang-btn[data-lang="en"]')
    await page.waitForTimeout(1200)
    check('same-language click does not navigate', page.url() === before, page.url())
    allErrors.push(...errors)
    await context.close()
  }

  await browser.close()
  check('zero console errors and pageerrors', allErrors.length === 0, allErrors.slice(0, 3).join(' | '))
  console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED')
  process.exit(failures === 0 ? 0 : 1)
})().catch(error => { console.error('harness error:', error.message); process.exit(2) })
