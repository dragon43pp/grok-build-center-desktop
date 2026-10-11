const { existsSync, readdirSync, statSync, unlinkSync } = require('node:fs')
const { join } = require('node:path')

// Every Electron distribution ships these five files next to the executable,
// but the Windows build of this app never loads any of them. The DirectX Shader
// Compiler pair (dxcompiler/dxil) only serves the DirectX12/WebGPU path, and the
// app has no WebGPU: navigator.gpu and webgpu appear nowhere in src/ or
// electron/. A packaged build that has had them removed is byte-for-byte
// identical in behaviour to one that has not, because the GPU process simply
// never asks for them. d3dcompiler_47.dll is provided by Windows itself on the
// Windows 10/11 baseline, and the process loads the System32 copy once ours is
// gone. debug.log is leftover noise from the Electron download and is never
// regenerated. chrome_200_percent.pak is unused even on a 2x display because the
// UI is CSS, vector and font driven.
//
// All five names are Windows-only, so on macOS and Linux this list matches
// nothing and the step is a no-op.
const PRUNABLE_FILES = [
  'dxcompiler.dll',
  'dxil.dll',
  'd3dcompiler_47.dll',
  'debug.log',
  'chrome_200_percent.pak'
]

// Chromium's software WebGL backend. It is NOT the software compositor: when the
// GPU process cannot start, Windows renders through ANGLE on D3D11 with the
// Microsoft Basic Render Driver (WARP), which comes from the operating system.
// That path was measured with and without these three files while forcing
// software rendering (`--disable-gpu`) and the reported renderer string was
// byte-for-byte identical — ANGLE (Microsoft, Microsoft Basic Render Driver
// (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11) — with WebGL2 available either
// way. The only configuration that changes is a user explicitly passing
// `--use-angle=swiftshader`: WebGL2 then reports unavailable, src/terminal/
// addons.ts catches it, records `webgl-unavailable` and falls back to the DOM
// renderer, and the window still paints in full with no error. Removing them
// therefore costs nothing on the default path and degrades gracefully on the one
// path that names SwiftShader.
//
// Kept Windows-only on purpose: `vk_swiftshader_icd.json` exists on every
// platform, and on Linux SwiftShader is the real fallback on machines with no
// GPU driver, so the pruning must not reach it there.
const WINDOWS_ONLY_PRUNABLE_FILES = [
  'vk_swiftshader.dll',
  'vulkan-1.dll',
  'vk_swiftshader_icd.json'
]

/** The files this platform's package is allowed to drop. */
function prunableFiles(platformName) {
  if (platformName === 'win32') {
    return [...PRUNABLE_FILES, ...WINDOWS_ONLY_PRUNABLE_FILES]
  }
  return PRUNABLE_FILES
}

// Exported so the afterPack gate reads the same list instead of keeping a
// duplicate that can drift out of sync with this one.
exports.prunableFiles = prunableFiles

// The files above sit beside the executable, which for Windows is
// context.appOutDir and for macOS is the MacOS directory inside the .app
// bundle. This mirrors packagedResourcesDir in assert-packaged-resources.cjs.
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

exports.default = async function pruneElectronRuntime(context) {
  const runtimeDir = packagedRuntimeDir(context)
  const removed = []
  let removedBytes = 0
  for (const filename of prunableFiles(context.electronPlatformName)) {
    const filePath = join(runtimeDir, filename)
    if (!existsSync(filePath)) continue
    removedBytes += statSync(filePath).size
    unlinkSync(filePath)
    removed.push(filename)
  }
  if (removed.length > 0) {
    console.log(
      `Pruned ${removed.length} unused Electron runtime file(s): ` +
        `${removed.join(', ')} (${removedBytes} bytes)`
    )
  }
  return removedBytes
}
