# Code review self-review: Story 66d4d41d99f805af/s1

Recorded 2026-11-14 by the controller, the party that wrote the code. The user asked for it after the daemon review's three rounds for this cycle (review `projection-scope-66d4-s1`, attempts 4-6) ended without a usable whole-story verdict. It is not an independent review.

## Why a self-review

| Attempt | Result |
| :--- | :--- |
| 4 | t1-t3 passed. t4 incomplete: the real start of the eedc4519 correction packet on the updated daemon was outstanding. |
| 5 | t1, t2 and t4 passed (t4 with one LOW). t3 changes requested: one MED, no test of a same-length non-hexadecimal listed sha. |
| 6 | t2 and t3 passed. t1 and t4 failed on the reviewer's own evidence references ("Unresolved committed evidence reference"); no finding against the code. |

Every Task passed in attempt 5 or 6. The only code changed after a Task's last pass is test code: `projection-lineage.test.ts` lines 9, 79-82, 160 and 167 (commit `4c14dd6b0`), which attempt 6 reviewed under t3.

## Scope

- The attempt 5 corrections: `5b5f21352` (SMOKE.md section 3) and `4c14dd6b0` (`requireListedShas`, non-hex and uppercase sha cases, `scope_conflict` assertions).
- t1 and t4 at the final source, which attempt 6 did not assess.
- Repository checks the daemon review does not run: the session-source inventory pins of the files this Story changed.

## Checks

- **`requireListedShas` (sources.ts).** The function's condition is the same expression that was there before, moved without change. `pathChanges` returns its result. There is one caller.
- **Tests.** With the hex check removed from `requireListedShas`, the pathChanges case fails, so the new assertions are not vacuous. Both side-branch tests now check the field and the message.
- **t1 (pinned identity).** `projection identity matches the identity pinned from the code before the change` passes at HEAD. Since its last pass the file has changed only in the import line and the tests above.
- **t4 (listing-driven continuity).** `projection.ts` has not changed since attempt 5. The SMOKE.md section 3 claims match the checkpoint:
  - attempt 4 of `board-common-model-s1` reached the capacity check, which runs only once a projection exists (`capacity.ts`, `terminalCapacity`);
  - attempt 5 stored finalScopeIdentity `56504efb…`, the identity section 1 computed offline.
- **Inventory pins.** `src/daemon/db/__tests__/fixtures/session-source-inventory.json` pins a `sourceDigest` for both `projection.ts` and `sources.ts`. Neither matched the source (see F1).

## Findings

| Id | Severity | Finding | Resolution |
| :--- | :--- | :--- | :--- |
| F1 | MED | `f42060471`, `e99aadce4` and `4c14dd6b0` changed `projection.ts` and `sources.ts` without refreshing their inventory pins. `session-source-inventory.test.ts` fails today on an earlier check (new files from other work), which hides this. Once that is fixed it would fail on these digests. `projection.ts` also gained one serialization site, the `pathChanges` cache key. | Refreshed both pins with the test's own extractor (`8ab98968b`). The new site matches the three cache keys beside it, and the file's classification (`forbidden-session-service`) is unchanged. |
| F2 | LOW | SMOKE.md section 3 presented the capacity overflow (about 4.2 MB) as a measurement. It is an estimate: the check does not print its measure. | Reworded as an estimate, with the reserve computed from `capacity.ts` (1,802,240 bytes) (`ec425b9f5`). |

## Verification

- Run at HEAD (Node 22):
  - `projection-lineage.test.ts`: 8 of 8 pass.
  - `git-path-history-full.test.ts`: 2 of 2 pass.
  - `projection.test.ts`: 12 of 12 pass.
- `tsc --noEmit` is clean.
- Not verified: `session-source-inventory.test.ts` as a whole. It fails at HEAD on files added by other work, before it reaches the digest comparison. The three refreshed entries were produced by the test's own extractor, and no other entry changed.

No open MED or HIGH findings from this self-review.
