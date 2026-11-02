<!-- insrc:artifact BUILD-ca9883ca42f4d73f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-02T12:14:26.040Z  ·  **Updated:** 2026-11-02T12:17:38.611Z

**Commit:** 15f44dc79

## Summary

daemon-ctl.sh npm_install_if_needed now uses the same install marker as maintenance.update (removed before npm install, written after a successful one) and builds with -std=c++17 appended to CXXFLAGS; SYNC_LOCK_HASH_BEFORE removed. Integration tests drive the real script over a scratch checkout with a fake npm, including cross-compatibility with maintenance.update; mutation-checked.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-02T12:17:38.611Z)
- `src/cli/services/__tests__/daemon-ctl-install-marker.test.ts` — **insrc-build** (2026-11-02T12:17:38.611Z)
