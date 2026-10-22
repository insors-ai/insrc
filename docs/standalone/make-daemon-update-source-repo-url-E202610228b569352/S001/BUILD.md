<!-- insrc:artifact BUILD-8b5693528b025a55-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-22T12:07:31.507Z  ·  **Updated:** 2026-10-22T12:07:31.507Z

**Commit:** f37a2c2e

## Triage rationale

One story with one obvious approach: read two optional keys from the global config and pass them to the existing update paths.

## Summary

The daemon update follows a configured git remote URL and branch (daemonUpdate.repoUrl and daemonUpdate.branch in ~/.insrc/config.json). A shared validated reader feeds the daemon.update helper (new --repo-url flag on daemon-ctl.sh) and the CLI update; both fetch with an explicit refspec for the single-branch install, check the tree before touching origin, and refuse to discard local-only commits when switching.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/daemon.md` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `docs/standalone/make-daemon-update-source-repo-url-E202610228b569352/S001/LLD.md` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/cli/__tests__/maintenance-source.test.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/daemon/__tests__/daemon-ctl-source.test.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/daemon/__tests__/helpers-update-fixture.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/daemon/__tests__/update-runner.test.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/daemon/update-runner.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/shared/__tests__/update-source.test.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
- `src/shared/update-source.ts` — **insrc-build** (2026-10-22T12:07:31.507Z)
