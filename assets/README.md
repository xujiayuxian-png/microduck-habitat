# Model provenance

`duck.bin` is the baked Microduck visual model used by the desktop renderer. It was copied from:

```text
Repository: https://github.com/pollen-robotics/microduck
Commit:     590b986bd8c0d50ae02cb3ea2f59c463b6828168
Path:       robotctl/assets/duck.bin
SHA-256:    1e1200053e2326706632306bc80831d5e0dfa5462d792a677fc05a43f145651e
```

The source repository distributes this baked asset under Apache-2.0. Its `scripts/bake-duck-mesh.py`
documents the binary format and how the visual meshes are generated from the robot MJCF. The source
MJCF and STL inputs are not redistributed here.

In the monorepo, `npm run verify:assets` checks this copy against the original file as well as the
recorded digest. After a standalone export, the digest check continues to protect the packaged
asset even though the parent path is absent.
