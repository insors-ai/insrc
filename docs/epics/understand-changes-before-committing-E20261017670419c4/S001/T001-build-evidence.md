# T001 build evidence — 2026-10-17

Status: implemented; user authorized continuing with the baseline failures recorded on 2026-10-17. Task validation remains separate. The required full-suite check is blocked by three reproducible failures in existing tests. This note is builder evidence, not a daemon validation verdict or BUILD approval.

## Changes

- `src/understanding/identity.ts`: daemon-side identity resolver, authenticated GitHub stable-ID discovery through the existing CLI transport, provider diagnostics, effective repository Git email and OS fallback, separate OS principal binding.
- `src/understanding/__tests__/identity.test.ts`: four focused tests, including real temporary Git configuration.
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/identity-sources.md`: actual source matrix and explicit missing GitLab/Jira integrations.

No daemon service registration yet: that is a later task. No new GitLab/Jira authentication flow, commit enforcement, editor or grading code. Installation-host identity is required as an injected dependency for later lifecycle integration.

## Verification

- Focused identity tests: 4 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- Required full suite: 5,793 tests; 5,662 passed, 3 failed, 125 skipped, 3 todo. Duration approximately 232 seconds.
- Isolated recheck of the three existing failing files: 24 tests; 21 passed, 3 failed.
- Runtime: Node v26.5.1. No claim that the supported Node22 runtime was checked.
- Initial sandbox invocation failed opening the test runner socket; the full suite and isolated recheck then ran outside the sandbox.

Reproducible failures:

1. `src/daemon/db/__tests__/sqlite-driver.test.ts`: temporalTrend regression reports SQLite integer overflow.
2. `src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts`: grep result includes fixture graph.lmdb and lock-file contents despite the expected exclusion.
3. `src/workflow/__tests__/review-decision.test.ts`: expected /var path differs from canonical /private/var artifact path.

The three isolated test files do not import the new understanding module. Existing tracked source was unchanged by T001. No failures were suppressed and no unrelated fixes were made.

Logs for this run: `/tmp/insrc-understanding-typecheck.log`, `/tmp/insrc-understanding-full-tests.log`, `/tmp/insrc-understanding-baseline-recheck.log`.

The implement prompt requires a green full suite before committing and says to halt on a failing required check. T001 therefore remains unfinished at that gate; t2 through t8 have not started. A decision to proceed with these baseline failures documented, or a separately tracked fix, is needed before advancing.

## Continuation authorization

User: “Continue with those baseline failures recorded”. Proceed with task-local verification and daemon validation while retaining the full-suite failures above; do not claim a green full suite or suppress the failures.
