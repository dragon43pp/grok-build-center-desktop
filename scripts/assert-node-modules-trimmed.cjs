const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { listPackage } = require('@electron/asar')

// These node_modules entries are removed by the `build.files` rules in
// package.json. Every one of them is a browser twin, a compiler input or a
// prebuilt binary for a platform this package is not being built for, and the
// runtime loader never resolves it — but if a rule is dropped or mis-typed the
// installer silently grows again, so this list is the gate that keeps them out.
// Keep it in sync with the files rules.
//
// Two things were measured rather than assumed, and both are why this list has
// no platform-scoped entries:
//
//   1. `build.<platform>.files` does not extend the root `files` — it replaces
//      it. With `build.win.files` present, electron-builder saw a pattern list
//      of nothing but exclusions, treated it as "only ignore", prepended `**/*`,
//      and packed the entire working tree: 2349 entries and 546 MB of app.asar
//      including .git, dist/ and the e2e/source trees. Every rule below is
//      therefore safe on Windows, macOS and Linux alike.
//   2. node-pty resolves its native addon through
//      `build/Release` -> `build/Debug` -> `prebuilds/<platform>-<arch>` and
//      only the matching directory is ever loaded, but `build/` itself is LIVE
//      on Linux, which has no prebuilt node-pty and compiles into
//      build/Release. So `build/` is not on this list.
const TRIMMED = [
  // The SDK's CJS entry (`main`) is lib/index.js; es/ is the ESM twin that only
  // a bundler would read, and the app is require()d from the main process.
  'node_modules/@larksuiteoapi/node-sdk/es',
  // protobufjs resolves index.js -> ./src; dist/ is the standalone browser build.
  'node_modules/protobufjs/dist',
  // node-pty's compile-time trees. Nothing in lib/ references either of them:
  // the runtime conpty copy lives in prebuilds/win32-x64/conpty/.
  'node_modules/node-pty/third_party',
  'node_modules/node-pty/deps',
  'node_modules/node-pty/src',
  // The Windows release builds x64 only, and no other platform loads win32-arm64.
  'node_modules/node-pty/prebuilds/win32-arm64'
]

/** Source maps are never loaded at run time; only a debugger reads them. */
const SOURCE_MAP_SUFFIX = '.map'

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

/** True when `entry` is the trimmed path itself or lives under it. */
function underOrEqual(entry, target) {
  return entry === target || entry.startsWith(`${target}/`)
}

exports.default = async function assertNodeModulesTrimmed(context) {
  const archivePath = join(packagedResourcesDir(context), 'app.asar')
  if (!existsSync(archivePath)) {
    throw new Error(`Packaged app archive was not found: ${archivePath}`)
  }
  const entries = listPackage(archivePath).map((entry) =>
    entry.replaceAll('\\', '/').replace(/^\/+/, '')
  )
  const hits = entries.filter(
    (entry) =>
      TRIMMED.some((target) => underOrEqual(entry, target)) ||
      entry.endsWith(SOURCE_MAP_SUFFIX)
  )
  if (hits.length > 0) {
    throw new Error(
      `Packaged app still contains node_modules that must be trimmed: ${hits
        .slice(0, 10)
        .join(', ')}`
    )
  }
}
