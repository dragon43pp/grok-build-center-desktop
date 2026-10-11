/* Live check of the reshaped landing page and the new features page, on both real
   domains. Renders the deployed bytes rather than the built files, so a stale deploy
   fails here instead of in front of a visitor.

   The landing page is now three blocks — the recording, the download, the docs — and
   the long explanation moved to features.html. This asserts both halves: that the
   explanation is really gone from the landing page, and that it really arrived, with
   its screenshots, on the page it moved to. */
const { chromium } = require('playwright')

/* The two hosts are overridable so the same assertions can smoke the build locally
   (point them at a throwaway static server over dist/demo-site) before anything is
   deployed, and then run again against the domains that are actually serving. */
const SITES = [
  { name: 'zh', origin: process.env.ASC_SITE_ZH || 'https://asc.chupian.cloud', lang: 'zh-CN' },
  { name: 'en', origin: process.env.ASC_SITE_EN || 'https://asc-en.chupian.cloud', lang: 'en' }
]

/* Strings from the sections that moved. If any of these is still on the landing page,
   the move did not happen. Checked as rendered text, not as markup. */
const MOVED_AWAY = ['Does this sound familiar?', '这些场景眼熟吗？', 'Where it draws the line', '它的边界画在哪', 'Watch it run', '看它跑起来']

let failures = 0
function check(label, ok, detail) {
  if (!ok) failures += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail !== undefined ? '  [' + detail + ']' : ''))
}

function box(rect) {
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const outDir = 'D:/workbuudy/2026-10-04-12-59-25'

  for (const site of SITES) {
    console.log('\n=== ' + site.name + '  ' + site.origin + ' ===')

    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })

    /* Collect every non-2xx response, and report per domain so a failure names the host
       that served it — a missing icon is the failure mode this whole check exists for. */
    const bad = []
    context.on('response', r => {
      if (r.status() >= 400) bad.push(r.status() + ' ' + r.url())
    })

    /* ───────────────────────── landing page ───────────────────────── */

    const page = await context.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
    page.on('pageerror', e => errors.push('pageerror: ' + e.message))

    await page.goto(site.origin + '/', { waitUntil: 'networkidle' })

    check('html lang is ' + site.lang, await page.getAttribute('html', 'lang') === site.lang,
      await page.getAttribute('html', 'lang'))

    /* Exactly three blocks, in order. */
    const sections = await page.$$eval('main > section', els => els.map(el => el.className))
    console.log('      main sections: ' + JSON.stringify(sections))
    check('landing page has exactly three blocks', sections.length === 3, String(sections.length))
    check('block 1 is the hero', /lp-hero/.test(sections[0] || ''), sections[0])
    check('block 2 is the download block', /lp-download/.test(sections[1] || ''), sections[1])
    check('block 3 is the docs block', /(^|\s)lp-docs(\s|$)/.test(sections[2] || ''), sections[2])

    /* The recording is the point of the page now, so give it a chance to report its own
       dimensions before anything is measured — preload="metadata" should make that
       immediate, but a slow first byte must not be read as a broken video. */
    await page.waitForFunction(() => {
      const video = document.querySelector('.lp-hero-shot video')
      return video !== null && video.videoWidth > 0
    }, { timeout: 20000 })

    /* The hero is two columns and the text column comes first — the layout that used to
       swap them with a CSS order is what this guards. */
    const hero = await page.evaluate(() => {
      const el = document.querySelector('.lp-hero')
      const style = getComputedStyle(el)
      const text = document.querySelector('.lp-hero-text')
      const media = document.querySelector('.lp-hero-media')
      const video = document.querySelector('.lp-hero-shot video')
      const icon = document.querySelector('.lp-hero-icon')
      return {
        columns: style.gridTemplateColumns,
        tracks: style.gridTemplateColumns.split(' ').length,
        text: text ? text.getBoundingClientRect().toJSON() : null,
        media: media ? media.getBoundingClientRect().toJSON() : null,
        video: video ? {
          width: video.getBoundingClientRect().width,
          height: video.getBoundingClientRect().height,
          videoWidth: video.videoWidth,
          paused: video.paused,
          controls: video.hasAttribute('controls'),
          src: (video.querySelector('source') || {}).src || ''
        } : null,
        icon: icon ? { box: icon.getBoundingClientRect().toJSON(), natural: icon.naturalWidth, src: icon.currentSrc } : null,
        h1Size: Math.round(parseFloat(getComputedStyle(document.querySelector('.lp-hero h1')).fontSize)),
        h2Size: Math.round(parseFloat(getComputedStyle(document.querySelector('.lp-docs h2')).fontSize)),
        balance: getComputedStyle(document.querySelector('.lp-hero h1')).textWrap || getComputedStyle(document.querySelector('.lp-hero h1')).textWrapStyle || ''
      }
    })
    console.log('      hero tracks=' + hero.tracks + ' ' + hero.columns)
    console.log('      hero text=' + JSON.stringify(box(hero.text)) + ' media=' + JSON.stringify(box(hero.media)))
    console.log('      video=' + JSON.stringify(hero.video && { w: Math.round(hero.video.width), h: Math.round(hero.video.height), vw: hero.video.videoWidth }))

    check('hero is two columns on a 1280 viewport', hero.tracks === 2, String(hero.tracks))
    check('text column is on the left', hero.text && hero.media && hero.text.x < hero.media.x,
      hero.text && hero.media ? box(hero.text).x + ' < ' + box(hero.media).x : 'missing')
    check('media column is the wider one', hero.media && hero.text && hero.media.width > hero.text.width,
      hero.media && hero.text ? Math.round(hero.media.width) + ' > ' + Math.round(hero.text.width) : 'missing')
    check('the recording is enlarged, not the old narrow column', hero.video && hero.video.width >= 650, hero.video && Math.round(hero.video.width))
    check('the recording starts playing', hero.video && hero.video.paused === false, hero.video && String(hero.video.paused))
    check('the recording is operable', hero.video && hero.video.controls === true)
    check('the recording has decoded dimensions', hero.video && hero.video.videoWidth > 0, hero.video && String(hero.video.videoWidth))
    check('the recording is the site video', hero.video && /\/assets\/demo\.mp4$/.test(hero.video.src), hero.video && hero.video.src)

    check('the hero shows the application icon', hero.icon && hero.icon.natural === 256,
      hero.icon ? hero.icon.natural + ' ' + hero.icon.src : 'missing')
    check('the hero icon is a 96px square', hero.icon && Math.round(hero.icon.box.width) === 96 && Math.round(hero.icon.box.height) === 96,
      hero.icon ? Math.round(hero.icon.box.width) + 'x' + Math.round(hero.icon.box.height) : 'missing')
    console.log('      home type: h1=' + hero.h1Size + ' section h2=' + hero.h2Size + ' wrap=' + hero.balance)
    check('the hero headline outranks the section headings on its own page', hero.h1Size > hero.h2Size,
      hero.h1Size + ' > ' + hero.h2Size)
    check('the hero headline balances its lines', /balance/.test(hero.balance), hero.balance)

    /* The header brand image must be the real icon now, and the favicon must stay svg. */
    const brand = await page.$eval('a.brand img', el => ({ src: el.currentSrc, natural: el.naturalWidth, w: Math.round(el.getBoundingClientRect().width) }))
    check('header brand image is the application icon', /app-icon-64\.png$/.test(brand.src), brand.src)
    check('header brand image decoded', brand.natural === 64, String(brand.natural))
    check('header brand image keeps its 26px box', brand.w === 26, String(brand.w))
    const favicon = await page.getAttribute('link[rel="icon"]', 'href')
    check('favicon stays the svg mark', favicon === './assets/mark.svg', favicon)

    /* The fullscreen control, renamed with the section it moved into. */
    const full = await page.$('.lp-hero-full')
    check('the fullscreen control moved into the hero', full !== null)
    check('no stale demo-section control', await page.$('.lp-demo-full') === null)
    check('no demo section left on the page', await page.$('#demo') === null)

    /* The explanation really left. */
    const body = await page.textContent('body')
    for (const text of MOVED_AWAY) {
      check('landing page no longer says "' + text + '"', body.indexOf(text) === -1)
    }
    check('landing page carries no feature blocks', await page.$$eval('.lp-block', els => els.length) === 0)
    check('landing page carries no card grid', await page.$$eval('.lp-cards', els => els.length) === 0)
    check('the recording appears exactly once', await page.$$eval('video', els => els.length) === 1)

    /* Navigation: five items, features.html among them, no Demo. */
    const nav = await page.$$eval('.lp-nav a', els => els.map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim() })))
    console.log('      nav: ' + JSON.stringify(nav.map(n => n.href)))
    check('navigation has five items', nav.length === 5, String(nav.length))
    check('navigation is home, features, docs, changelog, download',
      nav.map(n => n.href).join(',') === './index.html,./features.html,./docs.html,./changelog.html,./download.html',
      nav.map(n => n.href).join(','))
    check('no Demo item remains', nav.every(n => !/Demo|演示/.test(n.text)))

    /* Both buttons the hero promises, and the docs block's three. */
    const heroCtas = await page.$$eval('.lp-hero-cta a', els => els.map(el => el.getAttribute('href')))
    check('hero offers download and docs', heroCtas.join(',') === './download.html,./docs.html', heroCtas.join(','))
    const docsCtas = await page.$$eval('.lp-docs-cta a', els => els.map(el => el.getAttribute('href')))
    check('docs block offers docs, changelog, the demo',
      docsCtas.join(',') === './docs.html,./changelog.html,./simulator.html', docsCtas.join(','))

    await page.screenshot({ path: outDir + '/home-live-' + site.name + '.png', fullPage: true })

    /* ───────────────────────── features page ───────────────────────── */

    const featurePage = await context.newPage()
    const featureErrors = []
    featurePage.on('console', m => { if (m.type() === 'error') featureErrors.push('console: ' + m.text()) })
    featurePage.on('pageerror', e => featureErrors.push('pageerror: ' + e.message))

    const featureResponse = await featurePage.goto(site.origin + '/features.html', { waitUntil: 'networkidle' })
    check('features.html is served', featureResponse !== null && featureResponse.status() === 200,
      featureResponse ? String(featureResponse.status()) : 'no response')

    check('features page keeps the language', await featurePage.getAttribute('html', 'lang') === site.lang,
      await featurePage.getAttribute('html', 'lang'))

    const h1 = await featurePage.textContent('h1')
    check('features page has its own headline', (h1 || '').trim().length > 0, (h1 || '').trim())
    const featureTitle = await featurePage.title()
    check('features page has its own document title', /Features|功能/.test(featureTitle), featureTitle)
    check('features page has its own meta description',
      ((await featurePage.getAttribute('meta[name="description"]', 'content')) || '').length > 40)

    /* Everything that left the landing page arrived here. */
    const groups = await featurePage.$$eval('.lp-cards', els => els.map(el => el.children.length))
    console.log('      card groups: ' + JSON.stringify(groups))
    check('two card groups, three cards each', groups.join(',') === '3,3', groups.join(','))
    const blocks = await featurePage.$$eval('.lp-block', els => els.length)
    check('five feature blocks', blocks === 5, String(blocks))
    const tagged = await featurePage.$$eval('.lp-block .lp-tag', els => els.map(el => el.textContent.trim()))
    console.log('      tags: ' + JSON.stringify(tagged))
    check('every feature block is tagged', tagged.length === 5 && tagged.every(t => t.length > 0), tagged.join('|'))

    /* Screenshots: all five load, alternately placed, and the shot column is the wider
       one — that is what "enlarged" means on this page.

       Four of the five sit below the fold and carry loading="lazy", so they have not been
       requested yet and honestly report naturalWidth 0 until they scroll into view. Walk
       the page down and back before measuring, then wait for every image to finish. */
    await featurePage.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8)
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise(resolve => setTimeout(resolve, 60))
      }
      window.scrollTo(0, 0)
    })
    await featurePage.waitForFunction(
      () => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0),
      { timeout: 20000 }
    )

    const shots = await featurePage.$$eval('.lp-block-shot img', els => els.map(el => ({
      natural: el.naturalWidth,
      w: Math.round(el.getBoundingClientRect().width),
      alt: el.getAttribute('alt'),
      src: el.getAttribute('src')
    })))
    check('five screenshots', shots.length === 5, String(shots.length))
    /* The Chinese shots were captured at 2x, the English ones at 1x, so the bar is
       "a real capture", not one exact pixel width. */
    check('every screenshot decoded at full size', shots.every(s => s.natural >= 1280),
      JSON.stringify(shots.map(s => s.natural)))
    console.log('      screenshot widths: ' + JSON.stringify(shots.map(s => s.w)))
    check('every screenshot is the same rendered width', new Set(shots.map(s => s.w)).size === 1,
      JSON.stringify(shots.map(s => s.w)))
    /* Equal to each other is not enough: a flipped row used to render every screenshot at
       the width of the narrow track, and all of them would have agreed on that. */
    check('every screenshot is rendered wide, not at the narrow track', shots.every(s => s.w >= 780),
      JSON.stringify(shots.map(s => s.w)))

    const layout = await featurePage.$$eval('.lp-block', els => els.map(el => {
      const text = el.querySelector('.lp-block-text').getBoundingClientRect()
      const shot = el.querySelector('.lp-block-shot').getBoundingClientRect()
      return {
        flipped: el.classList.contains('lp-flip'),
        textFirst: text.x < shot.x,
        shotWidth: Math.round(shot.width),
        textWidth: Math.round(text.width),
        bodySize: parseFloat(getComputedStyle(el.querySelector('.lp-body')).fontSize)
      }
    }))
    console.log('      block layout: ' + JSON.stringify(layout.map(l => ({ flip: l.flipped, textFirst: l.textFirst, shot: l.shotWidth, text: l.textWidth, body: l.bodySize }))))
    check('odd blocks put the text first', layout.filter((_, i) => i % 2 === 0).every(l => l.textFirst))
    check('even blocks put the screenshot first', layout.filter((_, i) => i % 2 === 1).every(l => l.textFirst === false))
    check('the screenshot column is the wider one in every block', layout.every(l => l.shotWidth > l.textWidth))
    check('the prose is a size up from the landing page', layout.every(l => l.bodySize >= 15.5),
      JSON.stringify(layout.map(l => l.bodySize)))

    /* The enlarged prose must not have flattened the outline: a page title still ranks
       below the landing hero, a section heading above the blocks it introduces, and a
       block heading above the paragraph under it. */
    const scale = await featurePage.evaluate(() => {
      const size = selector => {
        const el = document.querySelector(selector)
        return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null
      }
      return {
        pageTitle: size('.lp-features-hero h1'),
        sectionHead: size('.blocks:not(.lp-download) h2'),
        blockHead: size('.lp-block h3'),
        body: size('.lp-body')
      }
    })
    console.log('      features type: h1=' + scale.pageTitle + ' section h2=' + scale.sectionHead +
      ' block h3=' + scale.blockHead + ' body=' + scale.body)
    check('the page title ranks below the landing hero', scale.pageTitle < hero.h1Size,
      scale.pageTitle + ' < ' + hero.h1Size)
    check('the section heading outranks its block headings', scale.sectionHead > scale.blockHead,
      scale.sectionHead + ' > ' + scale.blockHead)
    check('a block heading outranks the prose under it', scale.blockHead > scale.body,
      scale.blockHead + ' > ' + scale.body)

    check('no video on the features page', await featurePage.$$eval('video', els => els.length) === 0)

    const featureNav = await featurePage.$$eval('.lp-nav a', els => els.map(el => el.getAttribute('href')))
    check('features page carries the same navigation',
      featureNav.join(',') === './index.html,./features.html,./docs.html,./changelog.html,./download.html',
      featureNav.join(','))

    await featurePage.screenshot({ path: outDir + '/features-live-' + site.name + '.png', fullPage: true })

    /* ───────────────────────── shared verdicts ───────────────────────── */

    check('no console errors on the landing page', errors.length === 0, errors.slice(0, 2).join(' | '))
    check('no console errors on the features page', featureErrors.length === 0, featureErrors.slice(0, 2).join(' | '))
    check('no response on this domain was 4xx or 5xx', bad.length === 0, bad.slice(0, 5).join(' | '))

    await featurePage.close()
    await page.close()
    await context.close()
  }

  await browser.close()
  console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED')
  process.exit(failures === 0 ? 0 : 1)
})().catch(error => { console.error('harness error:', error.message); process.exit(2) })
