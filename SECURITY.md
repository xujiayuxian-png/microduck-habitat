# Desktop security

Please report a suspected vulnerability privately through the repository's GitHub Security page
or directly to the maintainers. Do not include exploit details, private user data or unpublished
credentials in a public issue.

Include the affected operating system, Habitat version or commit, reproduction steps and the
security impact. Hardware-daemon reports should identify that they affect the robot rather than the
desktop application, because the two have different privilege and network boundaries.

## Trust boundary

The renderer is untrusted content. It has no Node.js integration and receives only a narrow preload
API. Main-process IPC verifies the sending web contents and validates values before changing stored
state, mouse passthrough or window motion. Navigation and new windows are denied.

Packaged executables also flip Electron's production fuses: RunAsNode, Node environment options and
CLI inspection are disabled; cookie encryption, embedded asar integrity and only-load-from-asar are
enabled. `npm run verify:package` reads these bits back from each generated executable. File-protocol
extra privileges remain enabled only because Vite's bundled `duck.bin` is loaded from the local
renderer URL; replacing `file://` with an application protocol is a future hardening step.

Disabling CLI inspection means Playwright cannot attach to the packaged main process by design.
Renderer WebGL and interaction checks therefore run against the production build with development
Electron, while `verify:launch` starts the fused executable as an ordinary process and waits for its
state file. Both checks are required in CI; neither is presented as evidence for the other's layer.

Release jobs publish `SHA256SUMS`, `release-manifest.json` and an SPDX 2.3 SBOM beside installers.
`verify:evidence` recomputes the files rather than trusting generated metadata. These unsigned
digests detect corruption and make dependency review possible; they are not a substitute for the
Windows and Apple signatures still required for an authenticated release channel.

Habitat does not need camera, microphone, screen-capture, arbitrary filesystem or network access.
A built-in companion feature reads Electron's system idle timer in the main process and reveals
only an `ownerPresent` boolean to the renderer after a four-minute threshold. It does not expose or
persist idle duration, key events, active applications, window titles or screen content, and the
tray menu can disable the signal. This narrow context is the reference pattern for future local
intelligence: minimize in the trusted process before crossing IPC.

A future model or agent integration must preserve that default and operate through the high-level
`BehaviorController` contract. Any optional capability that expands this boundary needs explicit
user consent, visible revocation and separate threat review.
