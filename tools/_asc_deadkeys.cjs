/* Which string-table keys exist but nothing asks for. A key that only the table knows
   about is a sentence nobody can read, and after a page is deleted that is exactly what
   the keys that lived on it become. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SITE = path.join(__dirname, '..', 'docs', 'site')

const sandbox = { window: { location: { search: '' } }, navigator: { language: 'en' } }
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync(path.join(SITE, 'assets', 'i18n.js'), 'utf8'), sandbox)
vm.runInContext(fs.readFileSync(path.join(SITE, 'assets', 'pages.js'), 'utf8'), sandbox)
const strings = sandbox.window.ASCDemo.i18n.strings

const used = new Set()
const prefixes = new Set()
function harvest(text) {
  /* data-i18n, and the two head keys the build script reads off <html>. */
  for (const m of text.matchAll(/data-(?:i18n|doc-title-key|doc-desc-key)="([^"]+)"/g)) used.add(m[1])
  /* String lookups from the scripts: t('...'), and bare quoted keys passed around. */
  for (const m of text.matchAll(/['"]([a-z]+(?:\.[A-Za-z0-9-]+)+)['"]/g)) {
    if (Object.prototype.hasOwnProperty.call(strings.en, m[1])) used.add(m[1])
  }
  /* Keys built by concatenation, like t('legend.' + status + '.body'). No amount of
     literal matching finds those, so a quoted fragment that ends in a dot is read as a
     namespace prefix and everything under it is treated as referenced. */
  for (const m of text.matchAll(/['"]([a-z]+(?:\.[A-Za-z0-9-]+)*\.)['"]/g)) prefixes.add(m[1])
}

/* The two table files are where the keys are defined, so anything in them counts as a
   reference to itself and nothing would ever look unreferenced. They are the thing being
   audited, not evidence about it. */
const TABLES = new Set(['i18n.js', 'pages.js'])

for (const f of fs.readdirSync(SITE)) {
  if (f.endsWith('.html')) harvest(fs.readFileSync(path.join(SITE, f), 'utf8'))
}
for (const f of fs.readdirSync(path.join(SITE, 'assets'))) {
  if (!f.endsWith('.js') || TABLES.has(f)) continue
  harvest(fs.readFileSync(path.join(SITE, 'assets', f), 'utf8'))
}
/* The build script names its fallback keys. */
harvest(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-demo-site.cjs'), 'utf8'))

const en = Object.keys(strings.en)
const zh = Object.keys(strings.zh)
const dead = en.filter(k => !used.has(k) && !Array.from(prefixes).some(p => k.startsWith(p)))
console.log('en keys ' + en.length + '   zh keys ' + zh.length +
  '   symmetric=' + (en.length === zh.length && zh.every(k => used.has(k) || !used.has(k)) && en.every(k => Object.prototype.hasOwnProperty.call(strings.zh, k))))
console.log('referenced ' + used.size + '   unreferenced ' + dead.length)
for (const k of dead) console.log('  DEAD  ' + k + '  en=' + JSON.stringify(strings.en[k]).slice(0, 60))
