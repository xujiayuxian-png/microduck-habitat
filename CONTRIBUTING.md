# Contributing to Microduck Habitat

Habitat is small on purpose: it should feel like Microduck rather than a generic collection of pet
animations. Changes to behavior should have a reason in persistent state, a stimulus, a physical
constraint or an established Microduck trait. New random actions without a behavioral consequence
are unlikely to fit.

## Development

Use Node.js 22 and install exactly the locked dependency graph:

```sh
npm ci
npm run typecheck
npm test
npm run smoke
```

`npm run smoke` opens a real Electron process and needs a graphical session. On headless Linux, run
it through Xvfb. Changes to rendering or motion should include an updated smoke assertion or a
focused unit test in proportion to their risk.

## Boundaries

- `src/mind.ts` owns stimuli, memory and high-level activity selection. Model or agent adapters use
  `BehaviorIntent`; they do not replace safety and personality arbitration.
- `src/animation.ts` translates a `MindFrame` into joints; behavior providers do not set joints.
- `electron/` owns operating-system capabilities and exposes only validated, narrow IPC.
- The renderer must remain sandboxed, context-isolated and free of Node.js integration.
- Camera, microphone, screen capture, arbitrary file access and network access are out of scope by
  default. A proposal for one of these needs an explicit privacy and threat-model discussion.

Rules engines, local models and agent adapters must use the existing intent schema, preserve timeout
and fallback behavior, and stay inside the capability boundary described above.

Run `npm run verify:assets` after touching the model. An intentional model update must also update
the recorded digest and provenance in `assets/README.md`.

Linux intentionally keeps the compact window interactive instead of dynamically toggling mouse
passthrough. Electron does not support forwarded mouse moves on Linux, and current X11 input-region
regressions ([electron/electron#52456](https://github.com/electron/electron/issues/52456)) can leave
the window underneath targeted after passthrough is revoked. Re-enable Linux passthrough only after
real X11 click, drag and transparent-area checks succeed.

## Releases

Releases are currently built and tested manually on Linux, Windows and macOS. Follow
[`RELEASING.md`](RELEASING.md), create a draft GitHub Release, and clearly identify unsigned
artifacts until Windows signing and Apple notarization are configured.

Contributions are accepted under the Apache-2.0 license in [`LICENSE`](LICENSE).
