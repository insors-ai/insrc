<!-- insrc:artifact BUILD-ca9883ca42f4d73f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-02T12:14:26.040Z  ·  **Updated:** 2026-11-02T12:20:21.207Z

**Commit:** 4d2eeda98

## Summary

Both identical installer copies run npm install with -std=c++17 appended to CXXFLAGS, remove an earlier install marker first and write the lockfile blob hash marker after the install. The test dry-runs the installer's real step-3 block with a fake npm; mutations applied to both copies at once.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-02T12:20:21.207Z)
- `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` — **insrc-build** (2026-11-02T12:20:21.207Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-02T12:20:21.207Z)
- `src/config/__tests__/installer-defs.test.ts` — **insrc-build** (2026-11-02T12:20:21.207Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-11-02T12:20:21.207Z)
