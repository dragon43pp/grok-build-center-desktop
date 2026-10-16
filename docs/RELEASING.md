# Release guide

Do not invoke `electron-builder` manually for a deliverable. The supported Windows release entry is:

```powershell
npm run release:win
```

`npm run build:win` is an alias of the same guarded release flow; it cannot bypass validation.

The command reads the version from `package.json`, builds into an isolated temporary directory, validates the result, and only then replaces the files in `artifacts/`.

## Changing the version

Update both `package.json` and `package-lock.json` without creating a Git tag:

```powershell
npm version 0.1.1 --no-git-tag-version
npm run release:win
```

## Hard release gates

The Windows release fails before delivery when any of these conditions is not met:

- NSIS is a guided installer (`oneClick: false`).
- The installation directory can be changed.
- The application and installer use the Agent Session Center icon rather than Electron's default icon.
- All black, white, and macOS template tray PNGs exist in the packaged resources directory.
- Remote source submodules, prior build outputs, development state, logs, and local `*.dsh` data never enter `app.asar`.
- The packaged application starts, creates a Tray instance, and loads a non-empty 16×16 image.
- The installer product version matches `package.json`.
- The installer, blockmap, and `latest.yml` all exist.
- `latest.yml` matches `package.json`, references the exact installer filename, and contains SHA-512 metadata.
- `latest.yml` carries the `## [<version>]` section of `CHANGELOG.md` as `releaseNotes`.
- The packaged `app-update.yml` points to the public `fatedawn/agent-session-center` GitHub repository and contains no credentials.

### Why the Windows packager passes `--config.npmRebuild=false`

`node-pty` 1.1.0 is an N-API addon (`node-addon-api ^7`), so its bundled prebuilt binaries
are ABI-stable and load under any Electron version. At runtime `node-pty/lib/utils.js`
resolves the addon in this order:

```text
build/Release → build/Debug → prebuilds/<platform>-<arch>
```

Rebuilding on Windows is therefore unnecessary, and on a machine without the Visual Studio
Spectre-mitigation libraries it is fatal: the generated `.vcxproj` files hard-code
`<SpectreMitigation>Spectre</SpectreMitigation>`, `MSBuild` fails with **MSB8040**, and
packaging aborts before any artifact is produced.

This applies to **Windows only**. `node-pty` ships prebuilds for `win32-x64`, `win32-arm64`,
`darwin-arm64` and `darwin-x64` — but **none for Linux**, so the Linux release script must
keep rebuilding from source.

`scripts/assert-packaged-tray-assets.cjs` runs inside electron-builder's `afterPack` phase, so even direct packaging cannot silently omit tray assets. `scripts/verify-packaged-tray.cjs` performs the runtime Tray check. `scripts/release-win.ps1` composes all release checks and copies the verified artifacts.

### When a local build disagrees with CI

The Windows and macOS CI jobs run `npm ci --ignore-scripts` and never compile `node-pty`, so their
`node_modules` holds only what the packages ship. A developer's tree can hold more, and anything that
survives the `build.files` rules gets packaged:

- `node_modules/node-pty/build` — left behind by any compile attempt. It measured 268,930 bytes on
  disk and 241,374 bytes inside `app.asar`. It is deliberately **not** excluded by the rules, because
  Linux needs it: `node-pty` ships no Linux prebuild, so the Linux job compiles into `build/Release`.
- `debug.log` in the downloaded Electron distribution — 148 bytes. It is on the pruner's list either
  way, but it exists only after a local download, so the pruner reports eight files locally and seven
  in CI while reporting a slightly different byte total.

Measured on the 1.0.4 release: the CI installer is 85,724,875 bytes, a local one 85,734,229, and two
consecutive local builds of the same tree differ from each other by 63 bytes. Two CI builds of the
same commit differ too — 85,724,875 against 85,724,880, with different SHA-256 — because packaging is
not byte-reproducible. Two consequences:

- **Never quote an installer's byte size in a document that ships inside that installer.** The
  `## [x.y.z]` section of `CHANGELOG.md` is injected into `latest.yml`, `latest-linux.yml` and
  `latest-mac.yml` as `releaseNotes` and shown in the in-app update notice, so a byte count there is
  stale the moment it is written. Give MiB and a percentage, and point at the `.sha256`.
- **Take every published size from the Release asset, never from `artifacts/`.** The workflow log only
  prints MiB to two decimals; the exact size and hash have to come from the attached file.

## Delivery checklist

1. Run `npm run release:win` and require a zero exit code.
2. For direct installer delivery, use `artifacts/AgentSessionCenter-Setup-<version>.exe`. For a GitHub Release, keep the installer, blockmap, SHA-256 file, and `latest.yml` together.
3. Include the SHA-256 printed by the release command.
4. If the signature status is not `Present`, explicitly warn that Windows may show a security prompt.
5. Never deliver an installer created before the latest source change.

The guarded macOS and Linux commands perform equivalent runtime/resource and update-metadata checks. macOS artifacts are currently unsigned, so signing/notarization is still required before production auto-install can be considered supported there.

## Code signing

**Windows installers are not code-signed today**, so the release flow ends at an unsigned
installer plus its published checksum.

Signing through the [SignPath Foundation](https://signpath.org) free program for open source
projects is planned but **not applied for**, so nothing in this section is in effect yet. It is
kept because it constrains the design: the installer must be built by CI, not by hand. A signature
would attest to exactly that, which is why an installer produced on a maintainer's laptop could
never be signed even though it passes every local gate. The conditions a signing application has
to meet are recorded in [`SIGNPATH-APPLICATION.md`](./SIGNPATH-APPLICATION.md).

```text
push tag vX.Y.Z
      │
      ▼
.github/workflows/release-windows.yml   ← runs the same scripts/*.ps1 gates as a local release
      │
      ▼
asc-windows-unsigned-<sha> (workflow artifact, UNSIGNED, nothing published)
      │
      ▼
maintainer reviews the artifact and checks its SHA-256 against the run summary
      │
      ▼
GitHub Release  (installer + .sha256 + latest.yml + blockmap)
```

So the release flow is:

1. Bump the version, add the matching `## [x.y.z]` section to `CHANGELOG.md`, commit, push.
2. Tag and push the tag.
3. Let `release-windows.yml` finish and check its summary for the unsigned SHA-256.
4. Download the artifact, verify its hash against the summary, then create the Release with the
   installer, its `.sha256`, `latest.yml` and the blockmap attached together.

Local builds stay useful for wiring and for gate debugging, but they are **not** what gets
published. If `npm run release:win` and CI disagree, CI is right.

**If signing is adopted later**, two steps are inserted between 3 and 4: submit the artifact for
signing and have the request approved by a human in the SignPath portal, then publish the
**signed** installer instead. [`SIGNPATH-APPLICATION.md`](./SIGNPATH-APPLICATION.md) has the
workflow to add and the portal values to fill in. A signature would cover only the Windows
installer; macOS and Linux stay outside any such policy, and macOS still needs its own signing
and notarization before auto-install can be trusted there.

## GitHub Release workflow

There is **no automatic publishing**. `.github/workflows/ci.yml` runs `npm run typecheck` and
`npm run build` on push and pull request; `.github/workflows/release-windows.yml` additionally
builds and packages the Windows installer and uploads it as an **unsigned** workflow artifact.
Neither of those two creates a Release. Publishing stays a manual, maintainer-confirmed step
because it is irreversible, because the maintainer verifies the artifact's hash against the run
summary before anything is announced, and because the e2e suite needs a real DeepSeek Harness host
that GitHub runners cannot provide.

### Attaching a build to a Release

`.github/workflows/publish-release.yml` is a **manual** workflow that takes an existing
`release-windows.yml` run id plus a tag, downloads that run's artifact **on the runner**, verifies
the installer against the `.sha256` shipped in the same artifact, attaches everything to the
Release, and optionally publishes it. It builds nothing and changes nothing it downloads.

It exists because moving the artifact by hand is the slow part: the installer is ~94 MB and the
round trip to a maintainer's machine runs at whatever their link gives — measured at ~22 KB/s on
this project, which is about an hour — while the runner fetches it from GitHub's own storage in
seconds. No secrets beyond the default `GITHUB_TOKEN` are needed, and it can only be reached by
hand: both inputs are required, and `publish` defaults to `false`, so a run that only attaches
assets leaves the Release as a draft.

Rehearse the whole Windows chain (tag/version gate + guarded packaging + checksum)
without touching GitHub:

```powershell
npm run release:github:win -- -TagName vX.Y.Z
```

`scripts/release-github-win.ps1` refuses to continue unless `-TagName` equals
`v<package.json version>`. It runs `npm run typecheck`, delegates to
`npm run release:win`, then writes
`artifacts/AgentSessionCenter-Setup-<version>.exe.sha256` next to the artifacts.

Publish by creating the tag and then the Release yourself, attaching every file
that `latest.yml` references:

```powershell
git tag -a v1.0.0 -m "Agent Session Center v1.0.0"
git push origin v1.0.0
gh release create v1.0.0 `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe.blockmap `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe.sha256 `
  artifacts/latest.yml `
  --title "Agent Session Center v1.0.0" --notes-file <notes.md>
```

A Release must contain, for every platform it ships, that platform's metadata file
plus every file the metadata references — or existing clients on that platform
cannot resolve an update:

- **Windows** — `latest.yml`, the NSIS installer, its `.blockmap` and its `.sha256`.
- **Linux** — `latest-linux.yml`, the `AppImage` and the `deb`, and both `.sha256` files.

Windows and Linux are both built on GitHub-hosted runners by their own workflows
(`release-windows.yml`, `release-linux.yml`), so pushing a `v*` tag produces both
without a maintainer's machine being involved. The Linux job is the only one that
must **not** skip npm lifecycle scripts, because `node-pty` ships no Linux prebuild
and therefore has to be compiled from source.

macOS assets (`latest-mac.yml`, dmg/zip and their checksums) are added when that
platform is built on its own machine. A tag with a prerelease suffix (for
example `v1.1.0-beta.1`) is published as a GitHub prerelease; stable clients ignore
prereleases.

## Application update contract

Packaged Agent Session Center clients check the public `fatedawn/agent-session-center` Release feed at startup and again every six hours. A newer release is downloaded in the background. When the file is ready, the app asks once; confirming restarts and installs it. Settings can still check, download, or install by hand. Set `ASC_DISABLE_UPDATES=1` to skip update checks entirely (useful for regression testing). Development builds do not contact the update service.

Never upload only the installer/package files. `electron-updater` discovers releases through the platform metadata file, and every file referenced by that metadata must be attached to the same GitHub Release. The guarded release scripts validate this before copying anything into `artifacts/`.

`v1.0.0` is the first release whose packaged clients contain the updater, making it the baseline that can receive subsequent updates. Every later release must keep attaching the metadata assets alongside the installer.

Create the version bump and the release commit before tagging:

```powershell
npm version 1.0.1 --no-git-tag-version
# 1. Add the matching `## [1.0.1]` section to CHANGELOG.md — release-win.ps1 fails
#    without it, because it injects that section into latest.yml.
# 2. Commit and push the release commit.
git tag -a v1.0.1 -m "Agent Session Center v1.0.1"
git push origin v1.0.1
```

`CHANGELOG.md` is a hard dependency, not documentation: `scripts/inject-release-notes.cjs`
throws when the section for the packaged version is missing.

The guarded Windows packager always passes `--publish never` to electron-builder, so
packaging can never publish on its own. Only the maintainer's `gh release create`
step uploads a GitHub Release, and it fails rather than replacing an existing
release with the same tag.

Icon validation does not require Electron's development executable to exist on
the runner. The release gate always checks the configured source icon and that
the installer and packaged application use the same icon; it additionally
compares against Electron's default icon when that local reference is available.
