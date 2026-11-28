# Manual code review, round 2: controller-maintenance scope

- **Change:** ISSUE-e1aed06b860a76cb / BUILD-e1aed06b860a76cb-s1, *Align controller tests with retired lifecycle removal*
- **Packet:** `/tmp/.insrc/a5d5b2bb021655d0-s1-manual-review-20261128T043818Z/` (refresh of `…T041524Z`)
- **Range:** previous review head `2cf1eea1cb5c` → new head `a7f5b83f60f7`. Commits:
  - `e4210ffef`: review corrections and diagnostic evidence
  - `a7f5b83f6`: validation and disposition records
- **Inputs:** this scope's `REVIEW-UPDATE.md`, `DISPOSITION.md`, `changes/since-original-review.patch` and `S001/evidence/manual-review-20261128/`, checked against the repository at `e4210ffef` and `a7f5b83f6`
- **Reviewer:** Claude Code (controller session), 2026-11-28
- **Not done:** tests were not re-run; nothing outside this note was changed; no approval performed.

## Verdict

**Acceptable. All four round-1 findings are resolved, and there are no new findings that block approval.** BUILD-e1aed06b860a76cb-s1 can go to human approval.

## Round-1 findings: disposition check

| # | Round-1 finding | Disposition | Verified |
|---|---|---|---|
| 1 | `--test-force-exit` masked an undiagnosed non-exit in the saved-mode case | **Resolved (diagnosed).** | The method (`handles.mjs`) is sound: an `async_hooks` registry of weak references, sampled on unreferenced timers at 3 s and 10 s, listing only resources that are still referenced. In `default.tap`, after `ok 1 - CM-S3-DRIVER-LOGS…`, both samples show a referenced `WORKER` + `MESSAGEPORT` allocated by `pino()` → `pino/lib/transport.js:252` → `thread-stream/index.js:253`, with `getActiveResourcesInfo()` = PipeWrap, PipeWrap, MessagePort. The run hit its deliberate 15 s limit (`diagnostic-result.json`: `timedOut: true`). The same selection with only `INSRC_MODE=probe-worker` (the logger mode with no transport) passed and exited by itself (`diagnostic-quiet-result.json`: `code 0`, `timedOut: false`; `quiet.tap` 1/1 pass). Because the samplers are unreferenced, the quiet run's lack of samples is consistent with it exiting before 3 s. The cause is the test process's own Pino transport worker, not the driver-log policy under test. Keeping `--test-force-exit` is therefore justified, and it matches the project's existing convention. The disposition correctly limits its claim: it doesn't say every SDK path is free of leaks, and no production fix is made. |
| 2 | `assert.equal(file.coverageIncomplete, false)` could never fail | **Resolved.** | Replaced with `assert.equal(file.coverage.status, 'reported')` (`test-harness-commands.test.ts:89`). `run.mjs:72` sets `'reported'` only when the TAP output carries `# tests`, so the assertion can now fail. The pass, fail and cancelled count checks are kept. |
| 3 | Custom `testArgs` dropped `--test-concurrency=1` | **Resolved.** | `--test-concurrency=1` is restored next to `--test-force-exit` (`:84`). The argument list is otherwise identical to the harness default (`run.mjs:47`). |
| 4 | TESTS.md header shows "0 pass" | **Resolved as recommended (explained in the record).** | BUILD.md now says the header totals count named-test mappings, which are zero on the run-by-file route, and points to the per-file tables. TESTS.md still shows the zero header, as expected: no renderer change was in scope. |

## Delta review

- **Code:** the only source change since round 1 is the two-line edit to `scripts/__tests__/test-harness-commands.test.ts`. `a7f5b83f6` adds no `scripts/` or `src/` change (`git diff --stat e4210ffef a7f5b83f6 -- scripts src` is empty).
- **Snapshot:** the packet snapshot of the commands test is byte-identical to the file at both `e4210ffef` and `a7f5b83f6`.
- **Registered validation, source `e4210ffef`:**
  - Gate TAP: commands file 4/4 and consumers file 2/2 pass, with zero failures, cancellations or skips.
  - TESTS.md: run on `e4210ffef` at 2026-11-28T04:32:48Z, check passed.
- **Strict-closure proof for the commands run** (`gate-runs/a0407ef1…`):
  - 11 admissions, 11 results and 11 disposals, all with the same child-ID set.
  - Every result has code 0, no signal and no timeout, and every disposal is `closed`.
  - `cleanup.json` shows `owned-groups` and `confirmedClosed` with empty error arrays.
- **Other runs:** `validation-audit.json` correctly labels the other two gate runs as `legacy` closure, with no claim of strict proof.
- **Settings:** the three temporary build-command settings were restored to `null` through the supported service (`settings-restored.json`).
- **Packet integrity:** `PACKET-VERIFICATION.json` reports pass, and `shasum -c SHA256SUMS` shows 0 mismatches across the 571 checksummed files.
- **Honesty of the record:** the earlier 306-case regression and the UTM native proof are explicitly kept as baseline evidence pinned to their original source, not claimed as re-run at the corrected head. That is appropriate for a test-only, two-line correction.

## Advisory (not blocking)

1. **The Pino transport worker affects more than this case.** Any test process that creates the default transport logger (`src/shared/logger.ts`) keeps a referenced worker alive. That probably explains the project-wide reliance on `--test-force-exit`. If you want test files to exit naturally, consider a separate tracked item to `unref` or close the transport at test teardown, or to default test processes to the transport-free mode. That is outside this ISSUE.
2. **The diagnostic scripts only run from their original location.** `diagnose.mjs` and `diagnose-quiet.mjs` import relative to their original directory (`.insrc/tmp/controller-review-20261128/`), not their committed evidence location. DISPOSITION.md says so. It only matters if someone tries to re-run them from the docs tree.
3. **Carried over from round 1:** the interrupted isolate `d7a67629` (`/private/tmp/insrc-q5-pb8Jqt`) is still blocked and untouched. It still needs an explicit operator decision, separately from this BUILD.

## Human decision

No approval is implied by this review. BUILD-e1aed06b860a76cb-s1 remains pending your explicit approval.
