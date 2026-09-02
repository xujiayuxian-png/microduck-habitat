# Microduck Habitat

Microduck Habitat is the hardware-free desktop form of Microduck. It uses the robot's baked mesh,
joint hierarchy and voice ideas, but it does not start or emulate any robot daemon. One seeded duck
keeps its own temperament and trust over time, watches the pointer, reacts to touch, rests, preens
and walks around the desktop. Its calibration bench is a small mechanical place to explore rather
than a menu of canned animations: energy, curiosity and unfamiliar equipment determine where it
goes next.

This is a community-developed desktop derivative of the open-source
[Microduck robot](https://github.com/pollen-robotics/microduck). It is not an official Pollen
Robotics product and does not imply endorsement by Pollen Robotics. The application code is
maintained by [xujiayu](https://github.com/xujiayuxian-png); upstream asset provenance is preserved
in [`assets/README.md`](assets/README.md) and [`THIRD_PARTY.md`](THIRD_PARTY.md).

The application has no Rust workspace dependency. It uses Electron, Three.js and TypeScript, and
can be built independently on Windows, macOS and Linux.

## Run it

Node.js 22 and npm 10 or newer are required. Other Node.js major versions are not supported.

From the repository root, run:

```sh
npm ci
npm run dev
```

The pointer passes through transparent parts of the 240x280 window. Move over Microduck to interact,
and drag the grip below its feet to move it. The compact menu in the upper-right corner can mute it,
put it to sleep or wake it, return it to the current screen's home corner, open its calibration
bench, and hide it. On the bench it independently visits the charge pad, balance rail and signal
beacon. Clicking a fixture invites it over; the three indicator lights record discoveries across
launches. The tray menu can show it again, quit it, or opt into launch at login. It can also respond
to coarse system idle time: after four inactive minutes it settles into quiet local behavior, then
greets a return according to its temperament and trust. This is disabled at any time from the tray
menu.

Useful checks:

```sh
npm run typecheck
npm test
npm run audit:dependencies
npm run smoke
npm run capture:activities
npm run dist
npm run verify:package
npm run verify:launch
npm run verify:appimage # Linux only
npm run release:evidence
npm run verify:evidence
```

`smoke` launches the real Electron application and checks the WebGL image, animation and controls.
`capture:activities` writes all seven high-level poses to `artifacts/activities/` for visual review.
`verify:package` reads security fuses and required notices back from packaged executables. `dist`
creates those packages, and `verify:launch` starts the current platform's hardened executable and
waits for its persistent state to prove the main process reached readiness. On Linux,
`verify:appimage` applies the same check to the final AppImage payload without requiring FUSE. Build
each platform on that platform; the GitHub
Actions workflow does this for Linux, Windows and macOS. CI packages are currently unsigned and
not notarized, so downloaded builds can trigger operating-system warnings.

After collecting the platform artifacts, `release:evidence` creates a structured manifest, standard
`SHA256SUMS` and an SPDX 2.3 SBOM directly from `package-lock.json`; `verify:evidence` recomputes every
digest and requires all three descriptions to agree. Tagged standalone builds attach this evidence
to the unsigned draft release. Dependabot handles weekly npm updates and monthly Actions updates.

## Platform behavior

| Platform | Packages | Desktop behavior |
| --- | --- | --- |
| Windows | NSIS | Transparent click-through, tray and desktop walking |
| macOS (Intel and Apple silicon) | DMG, ZIP | Transparent click-through, menu-bar tray and desktop walking |
| Linux | AppImage, deb | Reliable full-window input and tray; desktop walking on X11 |

Linux keeps the compact `240×280` window interactive because Electron cannot reliably switch an
X11 transparent window from mouse passthrough back to input without another pointer movement. The
transparent pixels remain visually transparent but occupy their small input rectangle. Windows and
macOS retain transparent-area click-through.

Wayland compositors intentionally decide where top-level windows live. Under a native Wayland
session Microduck therefore walks in place inside its habitat instead of trying to move the window.
This is a graceful platform limitation, not a request for compositor privileges. Some Linux
desktops also require their normal AppIndicator extension before tray icons are visible.

Chromium can log VAAPI or Vulkan capability warnings on older Wayland graphics stacks even when the
Three.js canvas is using a working path. The Electron smoke test checks actual canvas pixels; these
messages are non-fatal when that test and the visible window render normally.

## Behavior boundary

`src/mind.ts` owns the long-lived state and implements the pure TypeScript `BehaviorController`
interface. It accepts small, sanitized stimuli and returns a `MindFrame` containing a high-level
activity, attention and direction. `src/animation.ts` alone translates that frame into joint poses.
`src/workbench.ts` plans exploration from the same frame: low energy favors the charge pad, high
curiosity favors the beacon, and visit history prevents one fixture from becoming a random loop.

That boundary is where a future rules engine, local model or agent belongs. An asynchronous provider
can submit a `BehaviorIntent` through `suggest`; `PetMind` then accepts or refuses it according to
confidence, energy, personality and forced rest. Reactive states such as delight and startle are not
agent-controllable. This preserves `PetMind` as the offline authority and fallback. A provider should
not receive Node.js access, Electron IPC, arbitrary screen contents, filesystem paths or direct
control of joint arrays. Any such provider must preserve this capability boundary and include tests
for timeout, fallback and rejected-intent behavior.

## Privacy and security

Habitat works offline. It does not request camera, microphone, screen-capture, file or network
permissions. Its only persistent data is a small `habitat.json` in Electron's per-user application
data directory containing a random seed, quiet mode, trust, encounter count, bench visibility and a
three-bit discovery mask, plus whether idle-time responses are enabled.

The Electron main process reduces system idle state to one `ownerPresent` boolean. The renderer does
not receive an idle duration, active application, window title, keyboard event or screen content,
and presence is not written to disk. The tray setting `Respond to idle time` revokes this input.

The renderer runs with context isolation and Chromium sandboxing enabled, Node integration off, a
Content Security Policy, denied pop-up windows and an allowlisted preload bridge. See
[`SECURITY.md`](SECURITY.md) for reporting and the trust boundary.

## Assets and license

The 3D resource is bundled from `assets/duck.bin`; no hardware-only service or policy is included in
desktop packages. `npm run verify:assets` verifies the vendored model's recorded digest. The project
is licensed under Apache-2.0; see [`LICENSE`](LICENSE). Dependency and asset notices are in
[`THIRD_PARTY.md`](THIRD_PARTY.md).
