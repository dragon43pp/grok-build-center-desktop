#!/usr/bin/env node
/**
 * Build the two deployable roots for the public site.
 *
 * `docs/site/` is two pages (a product landing page and the interactive simulator)
 * with one string table for both languages, which is the right shape for authoring
 * and the wrong shape for serving: the English site should land in English for
 * someone who has never visited, and the Chinese site should land in Chinese, with
 * neither depending on localStorage or on the browser's locale.
 *
 * So this script emits two complete static roots from the single source, differing
 * in the four head fields that decide the initial language and in which language's
 * screenshots are copied in. Each page declares which string-table keys its head
 * uses (`<html data-doc-title-key="l.doc.title" data-doc-desc-key="l.doc.description">`),
 * so the landing page and the simulator can carry different titles without the
 * build script knowing either of them.
 *
 *   dist/demo-site/en/   → point the English vhost here
 *   dist/demo-site/zh/   → point the Chinese vhost here
 *
 * Both roots are fully self-contained: two pages, the stylesheet, the string table,
 * the simulator script, and real screenshots copied from `docs/shots/{en,zh}` into
 * `assets/shots/`. No build step at serve time, no network calls. A plain `rsync`
 * is the entire deployment.
 *
 * Optional environment variables, used only to emit `<link rel="alternate" hreflang>`
 * so the two sites advertise each other to crawlers. Omit them and the tags are left
 * out rather than guessed:
 *
 *   ASC_DEMO_EN_URL   e.g. https://asc.example.com/
 *   ASC_DEMO_ZH_URL   e.g. https://asc-cn.example.com/
 *
 * Usage:
 *   node scripts/build-demo-site.cjs [--out dist/demo-site]
 */

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'docs', 'site')
const PAGES = ['index.html', 'simulator.html', 'docs.html', 'changelog.html', 'download.html']
const LOCALES = [
  { dir: 'en', lang: 'en', attr: 'en' },
  { dir: 'zh', lang: 'zh', attr: 'zh-CN' }
]

function parseArgs(argv) {
  let out = path.join(ROOT, 'dist', 'demo-site')
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      out = path.resolve(argv[index + 1] || '')
      index += 1
    } else if (argv[index].startsWith('--out=')) {
      out = path.resolve(argv[index].slice('--out='.length))
    } else {
      throw new Error('unknown argument: ' + argv[index])
    }
  }
  if (!out || out === path.parse(out).root) throw new Error('refusing to write to a drive root')
  return { out }
}

/* Read the string table by executing i18n.js, rather than by re-typing the title here.
   A build that paraphrases the page it is building drifts away from it.

   The string table is split across two files: i18n.js holds the landing and simulator
   keys, and pages.js holds the keys for the docs / changelog / download pages. Both run
   in the same sandbox so the table is complete before any head is built; a missing
   pages.js is a hard error, because the alternative is shipping "pd.doc.title" as the
   page title. */
function loadStrings() {
  const sandbox = { window: { location: { search: '' } }, navigator: { language: 'en' } }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(path.join(SOURCE, 'assets', 'i18n.js'), 'utf8'), sandbox)

  const pagesPath = path.join(SOURCE, 'assets', 'pages.js')
  if (!fs.existsSync(pagesPath)) {
    throw new Error('assets/pages.js is missing; the new pages need its string table')
  }
  vm.runInContext(fs.readFileSync(pagesPath, 'utf8'), sandbox)

  const strings = sandbox.window.ASCDemo && sandbox.window.ASCDemo.i18n && sandbox.window.ASCDemo.i18n.strings
  if (!strings || !strings.en || !strings.zh) {
    throw new Error('assets/i18n.js did not expose both language packs')
  }
  return strings
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/* Which string-table keys this page's head uses, declared on the <html> tag. */
function headKeys(html, page) {
  const title = /<html\b[^>]*\bdata-doc-title-key="([^"]+)"/.exec(html)
  const description = /<html\b[^>]*\bdata-doc-desc-key="([^"]+)"/.exec(html)
  return {
    title: title ? title[1] : 'doc.title',
    description: description ? description[1] : 'doc.description'
  }
}

function buildHead(html, page, locale, strings) {
  const keys = headKeys(html, page)
  const title = strings[locale.lang][keys.title]
  const description = strings[locale.lang][keys.description]
  if (!title || !description) {
    throw new Error(page + ': the ' + locale.lang + ' pack is missing "' + keys.title + '" or "' + keys.description + '"')
  }

  let out = html

  const htmlTag = /<html\b[^>]*>/
  if (!htmlTag.test(out)) throw new Error(page + ': no <html> tag to rewrite')
  out = out.replace(htmlTag, `<html lang="${locale.attr}" data-default-lang="${locale.lang}"` +
    ` data-doc-title-key="${keys.title}" data-doc-desc-key="${keys.description}">`)

  const titleTag = /<title>[\s\S]*?<\/title>/
  if (!titleTag.test(out)) throw new Error(page + ': no <title> to rewrite')
  out = out.replace(titleTag, `<title>${escapeAttribute(title)}</title>`)

  const meta = /<meta name="description" content="[^"]*">/
  if (!meta.test(out)) throw new Error(page + ': no <meta name="description"> to rewrite')
  out = out.replace(meta, `<meta name="description" content="${escapeAttribute(description)}">`)

  /* hreflang only when both URLs are actually known. A half-filled alternate set is worse
     than none: it tells a crawler about a page that does not exist. */
  const en = process.env.ASC_DEMO_EN_URL
  const zh = process.env.ASC_DEMO_ZH_URL
  if (en && zh) {
    const links = [
      `<link rel="alternate" hreflang="en" href="${escapeAttribute(en)}">`,
      `<link rel="alternate" hreflang="zh-Hans" href="${escapeAttribute(zh)}">`,
      `<link rel="alternate" hreflang="x-default" href="${escapeAttribute(en)}">`
    ].join('\n')
    out = out.replace('</head>', links + '\n</head>')
  }

  return out
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  let files = 0
  let bytes = 0
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) {
      const nested = copyTree(source, target)
      files += nested.files
      bytes += nested.bytes
      continue
    }
    fs.copyFileSync(source, target)
    files += 1
    bytes += fs.statSync(target).size
  }
  return { files, bytes }
}

function main() {
  const { out } = parseArgs(process.argv.slice(2))

  for (const page of PAGES) {
    if (!fs.existsSync(path.join(SOURCE, page))) {
      throw new Error('docs/site/' + page + ' is missing; nothing to build')
    }
  }

  const strings = loadStrings()
  const report = []

  for (const locale of LOCALES) {
    const target = path.join(out, locale.dir)
    fs.rmSync(target, { recursive: true, force: true })

    const copied = copyTree(SOURCE, target)

    /* Real screenshots, in the right language, under assets/shots/. The landing
       page references them there; a locale with no shots would ship broken images,
       so that is a build error and not a silent 404. */
    const shotsFrom = path.join(ROOT, 'docs', 'shots', locale.dir)
    if (!fs.existsSync(shotsFrom)) {
      throw new Error('docs/shots/' + locale.dir + ' is missing; the landing page needs screenshots')
    }
    const shots = copyTree(shotsFrom, path.join(target, 'assets', 'shots'))

    /* The hero video: the real interface, recorded, one file per language. */
    const videoFrom = path.join(ROOT, 'docs', 'demo', 'asc-demo-' + locale.lang + '.mp4')
    if (!fs.existsSync(videoFrom)) {
      throw new Error('docs/demo/asc-demo-' + locale.lang + '.mp4 is missing; the landing hero needs the demo video')
    }
    fs.copyFileSync(videoFrom, path.join(target, 'assets', 'demo.mp4'))
    const videoBytes = fs.statSync(path.join(target, 'assets', 'demo.mp4')).size

    let pages = 0
    for (const page of PAGES) {
      const html = fs.readFileSync(path.join(SOURCE, page), 'utf8')
      const built = buildHead(html, page, locale, strings)
      fs.writeFileSync(path.join(target, page), built, 'utf8')
      pages += 1
    }

    report.push({
      locale,
      target,
      files: copied.files + shots.files + pages + 1,
      bytes: copied.bytes + shots.bytes + videoBytes,
      shots: shots.files
    })
  }

  console.log('built ' + path.relative(ROOT, out).replace(/\\/g, '/'))
  for (const entry of report) {
    console.log(
      '  ' + entry.locale.dir.padEnd(3) +
      String(entry.files).padStart(2) + ' files  ' +
      ((entry.bytes / 1024 / 1024)).toFixed(1).padStart(6) + ' MB  ' +
      '(' + entry.shots + ' screenshots)   ->  ' + entry.target.replace(/\\/g, '/')
    )
  }

  const en = process.env.ASC_DEMO_EN_URL || '<english host>'
  const zh = process.env.ASC_DEMO_ZH_URL || '<chinese host>'
  console.log(`
deploy with two vhosts over the same tree shape:

  # English site
  server {
    listen 443 ssl http2;
    server_name ${en.replace(/^https?:\/\//, '').replace(/\/$/, '')};
    root ${path.join(out, 'en').replace(/\\/g, '/')};
    index index.html;
    location / { try_files $uri $uri/ =404; }
  }

  # Chinese site
  server {
    listen 443 ssl http2;
    server_name ${zh.replace(/^https?:\/\//, '').replace(/\/$/, '')};
    root ${path.join(out, 'zh').replace(/\\/g, '/')};
    index index.html;
    location / { try_files $uri $uri/ =404; }
  }

Both roots are static and identical apart from their <head> and their screenshots,
so a single \`rsync -a --delete\` per host is the whole deployment. Nothing here
has a backend, a database, or an outbound request at runtime.`)
}

main()
