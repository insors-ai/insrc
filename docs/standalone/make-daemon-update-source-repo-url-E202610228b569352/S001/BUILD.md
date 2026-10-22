<!-- insrc:artifact BUILD-8b5693528b025a55-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-22T12:07:31.507Z  ·  **Updated:** 2026-10-22T12:32:19.990Z

**Commit:** 6c91a7db

## Triage rationale

One story with one obvious approach: read two optional keys from the global config and pass them to the existing update paths.

## Summary

The daemon update follows a configured git remote URL and branch (daemonUpdate.repoUrl and daemonUpdate.branch in ~/.insrc/config.json). A shared validated reader feeds the daemon.update helper (new --repo-url flag on daemon-ctl.sh) and the CLI update; both fetch with an explicit refspec for the single-branch install, check the tree before touching origin, and refuse to discard local-only commits when switching.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-8b5693528b025a55-S001.json` — **insrc-build** (2026-10-22T12:32:19.990Z)
- `docs/standalone/make-daemon-update-source-repo-url-E202610228b569352/S001/CR.md` — **insrc-build** (2026-10-22T12:32:19.990Z)
