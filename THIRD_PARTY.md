# Third-party notices

Microduck Habitat is licensed under Apache-2.0 with the rest of this repository.

## Microduck model

`assets/duck.bin` is a vendored copy of the baked Microduck visual model distributed as
`robotctl/assets/duck.bin` in the parent repository. Its exact origin and digest are recorded in
[`assets/README.md`](assets/README.md). The desktop build does not embed the robot services,
firmware or ONNX control policies. The generated `resources/icon.png` is a crop of the desktop
renderer using that same asset. Both remain covered by the repository license and provenance.

## Direct dependencies

| Project | Use | License |
| --- | --- | --- |
| Three.js | 3D rendering | MIT |
| Lucide | Interface icons | ISC |
| Electron | Desktop runtime | MIT |
| electron-builder | Platform packaging | MIT |
| electron-vite and Vite | Build tooling | MIT |
| Vitest | Unit tests | MIT |
| Playwright | Electron smoke tests | Apache-2.0 |
| TypeScript | Compiler and type checker | Apache-2.0 |

Exact versions and the complete transitive dependency graph are locked in `package-lock.json`.
Platform packages include this notice, the root Apache-2.0 license, and the Three.js and Lucide
license texts alongside the application resources. Development-only tools are not redistributed in
the packaged application.
