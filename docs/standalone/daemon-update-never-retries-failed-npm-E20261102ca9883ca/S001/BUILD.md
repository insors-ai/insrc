<!-- insrc:artifact BUILD-ca9883ca42f4d73f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-02T12:14:26.040Z  ·  **Updated:** 2026-11-02T13:06:49.464Z

**Commit:** 81da97b73

## Summary

Clean install of the repository under Node 22 through daemon-ctl.sh built fs-ext and every native module (fs-ext previously failed with the same toolchain); the installed daemon's update installed once then skipped. Finding: a hand-run --ignore-scripts install (the s9 workaround) left fs-ext unbuilt, which a successful npm install does not repair; repaired with npm rebuild, and a genuinely failed install is rolled back by npm and retried correctly. Full sweep per directory: 7356 tests, 25 failures, all pre-existing and classified.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `src/config/__tests__/installer-defs.test.ts` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca/S001/full-sweep-t4.txt` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca/S001/smoke-clean-install-t4.md` — **insrc-build** (2026-11-02T13:06:49.464Z)
- `docs/standalone/daemon-update-never-retries-failed-npm-E20261102ca9883ca/S001/smoke-installed-update-t4.md` — **insrc-build** (2026-11-02T13:06:49.464Z)
