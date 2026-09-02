# Releasing Microduck Habitat

Build and test release artifacts on the operating system that will run them. Do not publish a tag
until Ubuntu, Windows and macOS have all passed the checklist below. The current release workflow is
manual; pushing a tag does not start CI or create a GitHub Release.

## 1. Prepare the release commit

1. Start from a clean `main` branch and pull the latest changes.
2. Set the intended semantic version in `package.json` and `package-lock.json` with
   `npm version <version> --no-git-tag-version`.
3. Review `README.md`, `THIRD_PARTY.md` and the changelog text intended for GitHub Releases.
4. Regenerate the committed browser demo with `npm run build:web`.
5. Run the core checks below and commit the version change.

All platforms require Node.js 22 and npm 10 or newer:

```sh
npm ci
npm run audit:dependencies
npm run typecheck
npm test
npm run smoke
```

`npm run smoke` launches a real Electron window, so it must run inside a graphical desktop session.

## 2. Ubuntu build and test

Use a supported Ubuntu desktop, preferably both an X11 session and a Wayland session for manual
interaction checks.

```sh
npm ci
npm run audit:dependencies
npm run typecheck
npm test
npm run smoke
npm run dist
npm run verify:package
npm run verify:launch
npm run verify:appimage
```

Test both files in `release/`:

- Launch the AppImage, move the window with the bottom grip, click Microduck and open the bench.
- Install the deb, launch it from the application menu, and confirm the tray menu works.
- Confirm hiding, restoring, quitting and relaunching preserve the expected state.
- On X11, confirm desktop walking moves the habitat. On Wayland, confirm it walks in place.

## 3. Windows build and test

Run the following in PowerShell from a normal Windows checkout:

```powershell
npm ci
npm run audit:dependencies
npm run typecheck
npm test
npm run smoke
npm run dist
npm run verify:package
npm run verify:launch
```

Install the generated NSIS `.exe` and verify:

- The installer supports the chosen installation directory and uninstall completes cleanly.
- Transparent areas pass clicks through to the desktop.
- Clicking Microduck, opening the menu and dragging the bottom grip all work.
- The tray icon can hide, show and quit the habitat.
- Launch-at-login can be enabled and disabled, then survives a sign-out/sign-in test.
- The calibration bench fits completely inside the window at 100%, 125% and 150% display scaling.

Unsigned Windows builds can trigger SmartScreen. State this clearly in the release notes until a
code-signing certificate is configured.

## 4. macOS build and test

Run on macOS from Terminal:

```sh
npm ci
npm run audit:dependencies
npm run typecheck
npm test
npm run smoke
npm run dist
npm run verify:package
npm run verify:launch
```

Test the generated DMG and ZIP on the architectures they claim to support:

- Open the DMG, copy the app to Applications and launch that installed copy.
- Extract the ZIP separately and confirm its app launches.
- Verify transparent click-through, dragging, touch interaction and the calibration bench.
- Verify menu-bar hide, show, quit and launch-at-login behavior.
- Relaunch and confirm saved state is restored.

Unsigned and unnotarized macOS builds can be blocked by Gatekeeper. State this clearly in the
release notes until Developer ID signing and notarization are configured.

## 5. Collect and verify artifacts

Copy the Ubuntu, Windows and macOS packages into one clean `release/` directory. Keep only the files
intended for the release, then run:

```sh
npm run release:evidence
npm run verify:evidence
```

This produces `SHA256SUMS`, `release-manifest.json` and an SPDX 2.3 SBOM. Review the manifest and
verify that every installer appears exactly once.

## 6. Publish the GitHub Release

After all platform checks pass:

```sh
git tag -a v0.1.0 -m "Microduck Habitat v0.1.0"
git push origin main
git push origin v0.1.0
```

Replace `v0.1.0` with the version being released. On GitHub, create a new Release from that tag and
upload:

- Ubuntu AppImage and deb
- Windows NSIS exe
- macOS DMG and ZIP files
- `SHA256SUMS`
- `release-manifest.json`
- SPDX SBOM

Create it as a draft first. Include highlights, known limitations, unsigned-build warnings and the
checksums. Download every uploaded file once, verify the hashes, then publish the draft.
