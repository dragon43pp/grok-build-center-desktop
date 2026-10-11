const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { listPackage } = require('@electron/asar')
const assertPackagedTrayAssets = require('./assert-packaged-tray-assets.cjs')

function packagedResourcesDir(context) {
  if (context.electronPlatformName !== 'darwin') {
    return join(context.appOutDir, 'resources')
  }
  const appBundle = readdirSync(context.appOutDir).find((name) =>
    name.endsWith('.app')
  )
  if (!appBundle) throw new Error('Packaged macOS app bundle was not found')
  return join(context.appOutDir, appBundle, 'Contents', 'Resources')
}

// Mirrors the resolution above, but points at the directory holding the
// executable instead of `resources`. The pruner in prune-electron-runtime.cjs
// works on the same directory.
function packagedRuntimeDir(context) {
  if (context.electronPlatformName !== 'darwin') {
    return context.appOutDir
  }
  const appBundle = readdirSync(context.appOutDir).find((name) =>
    name.endsWith('.app')
  )
  if (!appBundle) throw new Error('Packaged macOS app bundle was not found')
  return join(context.appOutDir, appBundle, 'Contents', 'MacOS')
}

// scripts/prune-electron-runtime.cjs removes these five from the packaged
// runtime. None of them is ever loaded by the Windows build, but if one comes
// back (for example because the pruner stops running) the installer silently
// grows again, so this list is the gate that keeps them out. Keep it in sync
// with that script.
const PRUNED_RUNTIME_FILES = [
  'dxcompiler.dll',
  'dxil.dll',
  'd3dcompiler_47.dll',
  'debug.log',
  'chrome_200_percent.pak'
]

function assertRuntimePruned(context) {
  const runtimeDir = packagedRuntimeDir(context)
  const present = PRUNED_RUNTIME_FILES.filter((filename) =>
    existsSync(join(runtimeDir, filename))
  )
  if (present.length > 0) {
    throw new Error(
      `Packaged runtime still contains files that must be pruned: ${present.join(
        ', '
      )}`
    )
  }
}

function assertNoBundledDshRuntime(context) {
  const runtimeRoot = join(packagedResourcesDir(context), 'dsh-runtime')
  if (existsSync(runtimeRoot)) {
    throw new Error(`Packaged app must not include a bundled DSH runtime: ${runtimeRoot}`)
  }
}

// The packaged app only loads `out/` (bundled main + preload + renderer),
// `resources/`, the licence files and the production node_modules. Everything
// listed here is a development tree or a build leftover that must never reach a
// release artifact. Keep this list in sync with `build.files` in package.json:
// the exclusion saves ~50 MiB, and this gate is what stops it coming back.
const FORBIDDEN_ROOTS = new Set([
  '.claude',
  '.dev-run',
  '.dev-shots',
  '.github',
  '.theme-check',
  'dist',
  'e2e',
  'electron',
  'examples',
  'logs',
  'preload',
  'prototype',
  'remotes',
  'scripts',
  'shared',
  'src',
  'tools'
])

const FORBIDDEN_ROOT_FILES = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'electron.vite.config.ts',
  'index.html',
  'playwright.config.ts',
  'renovate.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.node.tsbuildinfo',
  'tsconfig.web.json',
  'tsconfig.web.tsbuildinfo'
])

/** Stale renderer builds kept next to the live one by the dev build script. */
const STALE_RENDERER_BUILD = /^out\/renderer\.stale-/

/** Returns the offending path when it must not ship, otherwise null. */
function findForbiddenEntry(normalized) {
  const root = normalized.split('/')[0]
  if (FORBIDDEN_ROOTS.has(root)) return normalized
  if (root.startsWith('release-')) return normalized
  if (root.toLowerCase().endsWith('.dsh')) return normalized
  if (FORBIDDEN_ROOT_FILES.has(normalized)) return normalized
  if (/^electron\.vite\.config\..+\.mjs$/.test(normalized)) return normalized
  if (STALE_RENDERER_BUILD.test(normalized)) return normalized
  return null
}

function assertNoDevelopmentTrees(context) {
  const archivePath = join(packagedResourcesDir(context), 'app.asar')
  if (!existsSync(archivePath)) {
    throw new Error(`Packaged app archive was not found: ${archivePath}`)
  }
  const forbidden = listPackage(archivePath)
    .map((entry) => findForbiddenEntry(entry.replaceAll('\\', '/').replace(/^\/+/, '')))
    .filter(Boolean)
  if (forbidden.length > 0) {
    throw new Error(
      `Packaged app contains development or local-data trees: ${forbidden
        .slice(0, 5)
        .join(', ')}`
    )
  }
}

exports.default = async function assertPackagedResources(context) {
  await assertPackagedTrayAssets.default(context)
  assertRuntimePruned(context)
  assertNoBundledDshRuntime(context)
  assertNoDevelopmentTrees(context)
}
