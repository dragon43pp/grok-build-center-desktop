const pruneElectronRuntime = require('./prune-electron-runtime.cjs')
const assertPackagedResources = require('./assert-packaged-resources.cjs')

// electron-builder resolves `afterPack` to a single module (its resolver only
// accepts a string path, not an array), so this is the one hook that runs both
// steps in order: trim the Electron runtime files the app never loads, then run
// the resource assertions that gate the packaged output.
exports.default = async function afterPack(context) {
  await pruneElectronRuntime.default(context)
  await assertPackagedResources.default(context)
}
