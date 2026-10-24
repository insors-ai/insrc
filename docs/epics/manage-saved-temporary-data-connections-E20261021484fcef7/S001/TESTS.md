<!-- insrc:artifact TESTS-484fcef7efaf229e-s1 -->

# Tests: 484fcef7efaf229e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 84 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T08:30:48.653Z on commit `119d66734`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-A: every registered kind has a grounded fail-closed field classification and preservation fixture | `src/daemon/db/__tests__/driver-field-audit.test.ts` |
| pass | SQLite file URLs preserve encoded pathname text and explicit path takes precedence | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.2 s |  |

## t2

Run at 2026-10-24T08:57:06.202Z on commit `755c254da`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-J: v2 wire rejects malformed and mismatched tickets without returning draft values | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-J: legacy document remains readable and v2 declarations preserve safe outcome boundaries | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-J: protocol declarations compile in strict NodeNext including negative secret-field assignments | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-J: real legacy save replies retain their shape and v2 errors never return stored credentials | `src/shared/__tests__/connection-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-management.test.ts` | 0 | 4 | 2.7 s |  |

## t4

Run at 2026-10-24T09:14:43.578Z on commit `c31108f46`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-C: signed tickets and keyed full-request fingerprints retain credential intent without config effects | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: malformed, tampered and wrong-target tickets reject with sanitized errors | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: expiry remains authenticated for reconciliation and cannot authorize new replay | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: missing, changed or malformed adopted keys never rotate; initialization joins once | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: canonical JSON hashes complete JSON values without lossy or ambiguous coercion | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-A: every registered kind has a grounded fail-closed field classification and preservation fixture | `src/daemon/db/__tests__/driver-field-audit.test.ts` |
| pass | CM-S1-J: real legacy save replies retain their shape and v2 errors never return stored credentials | `src/shared/__tests__/connection-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.1 s |  |
| `src/daemon/db/__tests__/management-tickets.test.ts` | 0 | 5 | 0.4 s |  |
| `src/shared/__tests__/connection-management.test.ts` | 0 | 4 | 2.4 s |  |

## t3

Run at 2026-10-24T10:22:20.952Z on commit `de41aee2a`. Tests check: **passed**. 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-A: every registered profile has positive and negative drafts, safe projection, and retained config preservation | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-A: unclassified private fields and unsupported URI dialects remain redacted and read-only | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-A: credential-bearing URI text is refused in public fields even when a private replacement is supplied | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-A: unsupported semicolon connection strings and encoded reference paths never enter public endpoints | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-A: private endpoint lists reject unrepresented DSN text and credential clear updates presence truthfully | `src/daemon/db/__tests__/driver-profiles.test.ts` |

**unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-C: Keep Replace Clear use one effective draft and preserve pinned families without credential/reference projection | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-C: internal credential slot mapping preserves endpoints and supports opaque generation references without effects | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-C: explicitly classified non-secret URI parameters survive label and credential edits exactly | `src/daemon/db/__tests__/driver-profiles.test.ts` |
| pass | CM-S1-C: signed tickets and keyed full-request fingerprints retain credential intent without config effects | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: malformed, tampered and wrong-target tickets reject with sanitized errors | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: expiry remains authenticated for reconciliation and cannot authorize new replay | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: missing, changed or malformed adopted keys never rotate; initialization joins once | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: canonical JSON hashes complete JSON values without lossy or ambiguous coercion | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-J: real legacy save replies retain their shape and v2 errors never return stored credentials | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-A: private endpoint lists reject unrepresented DSN text and credential clear updates presence truthfully | `src/daemon/db/__tests__/driver-profiles.test.ts` |

**unit: CM-S1-P: create/edit materialization and safe read followed by cancel/abandon before mutate leave registry bytes, revision/receipt map and every keychain value unchanged; no writer or keychain-write call. This tests the foundation boundary, not S005 UI.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-P: abandoning safe reads and materialized create/edit drafts leaves exact registry and vault state untouched | `src/daemon/db/__tests__/driver-profiles.test.ts` |

**integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo) | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |
| pass | honors user-pinned family but warns on mismatch | `src/daemon/db/__tests__/config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` | 0 | 19 | 0.7 s |  |
| `src/daemon/db/__tests__/config.test.ts` | 0 | 15 | 0.4 s |  |
| `src/daemon/db/__tests__/driver-profiles.test.ts` | 0 | 9 | 1.4 s |  |
| `src/daemon/db/__tests__/management-tickets.test.ts` | 0 | 5 | 0.3 s |  |
| `src/shared/__tests__/connection-management.test.ts` | 0 | 4 | 2.2 s |  |

## t5

Run at 2026-10-24T10:25:53.632Z on commit `26f01a2da`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-E: each atomic write failure preserves prior bytes or requires reconciliation to exact committed truth | `src/daemon/db/__tests__/managed-store.test.ts` |

**integration: CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-F: actual same-UID writeFile is fenced after digest validation; preopened descriptor writes only detached inode | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-F: privileged or failed permission proof disables adoption without changing the registry | `src/daemon/db/__tests__/managed-store.test.ts` |

**smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-O: managed startup refuses direct legacy writes, envelope stripping, forged proofs and missing owner | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-O: inode mode envelope and generation drift block writes instead of normalizing registry truth | `src/daemon/db/__tests__/managed-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 5 | 1.8 s |  |

## t6

Run at 2026-10-24T10:43:56.294Z on commit `ca1e842d0`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-E: real process crashes at preparation stage write rename sync and cleanup boundaries recover exact committed truth | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: Keep retains the live generation and Clear removes it only after canonical commit | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: missing live keys and unresolved journals block writes; foreign and referenced keys cannot be cleaned | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: encoded immutable userinfo references resolve with credential escaping and no legacy regression | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: partial keychain failure preserves old effective credentials and recovery removes only owned staging | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: committed cleanup failure stays pending and retry preserves exact registry revision receipt and live generation | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: each atomic write failure preserves prior bytes or requires reconciliation to exact committed truth | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-E: first-use recovery directory parent sync precedes staging and completion sync failures retain a blocking retry record | `src/daemon/db/__tests__/credential-generations.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/credential-generations.test.ts` | 0 | 7 | 12.4 s |  |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 6 | 1.4 s |  |

## t9

Run at 2026-10-24T11:29:53.251Z on commit `6c22caf74`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-B: duplicate missing stale and busy mutation barriers reject before factory credential or writer effects | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-B: actual mutation path rejects duplicate stale missing and busy intent before credential or writer ports | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-B: legacy upsert is serialized through the same managed gate and preserves private fields and pinned family | `src/daemon/db/__tests__/saved-management.test.ts` |

**integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo) | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |
| pass | honors user-pinned family but warns on mismatch | `src/daemon/db/__tests__/config.test.ts` |

**integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-M: nested full-use callbacks block mutations and idle close; retained driver views are revoked | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: callback timeout and abandoned async work retain one lease until actual settle or rejection | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: asynchronous iterator lifetime survives cancellation of a waiter and releases exactly once on late settle | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: callback errors and shutdown wait for active use; reload never closes a leased revision | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: safe resolver keeps own-directory lookup and permits an injected session overlay without implementing session storage | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: a lease arriving during idle close waits for close and rebuild before driver use | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: late iterator creation is closed before release and nested raw driver results cannot escape | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: accessor inherited and collection-held raw drivers reject before callback results escape | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: early iterator return and abort while a read is pending release only after underlying cancellation completes | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: executable function-held references reject while date binary and database JSON values retain wire semantics | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S1-M: sync throws promise rejections iterator failures metadata getters and factory failures cannot carry source objects out | `src/daemon/db/__tests__/connection-leases.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` | 0 | 19 | 0.8 s |  |
| `src/daemon/db/__tests__/config.test.ts` | 0 | 15 | 0.4 s |  |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 12 | 1.6 s |  |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 5 | 1.4 s |  |

## t7

Run at 2026-10-24T11:42:08.399Z on commit `b82d9190d`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-B: actual mutation path rejects duplicate stale missing and busy intent before credential or writer ports | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-B: legacy upsert is serialized through the same managed gate and preserves private fields and pinned family | `src/daemon/db/__tests__/saved-management.test.ts` |

**integration: CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-D: same-root concurrent creates commit once and independent roots do not share serialization | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-D: simultaneous identical replay joins one mutation and restart replays the exact durable outcome without effects | `src/daemon/db/__tests__/saved-replay.test.ts` |
| pass | CM-S1-D: expired signed tickets reconcile missing or pruned receipts and can never authorize a new replay | `src/daemon/db/__tests__/saved-replay.test.ts` |
| pass | CM-S1-D: a full service process exits after commit without a response and the restarted owner reconciles one receipt | `src/daemon/db/__tests__/saved-replay.test.ts` |

**integration: CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-U: v2 dispatch and real legacy save reject corrupt unreadable registries before every staging and writer effect | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-U: unmanaged legacy compatibility also rejects corrupt registry reads before password extraction | `src/daemon/db/__tests__/saved-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 5 | 2.1 s |  |
| `src/daemon/db/__tests__/saved-replay.test.ts` | 0 | 6 | 2.1 s |  |

## t8

Run at 2026-10-24T11:49:32.000Z on commit `b53943496`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-D: same-root concurrent creates commit once and independent roots do not share serialization | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-D: simultaneous identical replay joins one mutation and restart replays the exact durable outcome without effects | `src/daemon/db/__tests__/saved-replay.test.ts` |
| pass | CM-S1-D: expired signed tickets reconcile missing or pruned receipts and can never authorize a new replay | `src/daemon/db/__tests__/saved-replay.test.ts` |
| pass | CM-S1-D: a full service process exits after commit without a response and the restarted owner reconciles one receipt | `src/daemon/db/__tests__/saved-replay.test.ts` |

**integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-E: uncertain initial and final receipt rename results reconcile in place without staging another generation | `src/daemon/db/__tests__/saved-replay.test.ts` |
| pass | CM-S1-E: real process crashes at preparation stage write rename sync and cleanup boundaries recover exact committed truth | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: Keep retains the live generation and Clear removes it only after canonical commit | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: missing live keys and unresolved journals block writes; foreign and referenced keys cannot be cleaned | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: encoded immutable userinfo references resolve with credential escaping and no legacy regression | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: partial keychain failure preserves old effective credentials and recovery removes only owned staging | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: committed cleanup failure stays pending and retry preserves exact registry revision receipt and live generation | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: first-use recovery directory parent sync precedes staging and completion sync failures retain a blocking retry record | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: each atomic write failure preserves prior bytes or requires reconciliation to exact committed truth | `src/daemon/db/__tests__/managed-store.test.ts` |

**integration: CM-S1-Q: successful commit with failed activation then activation-only retry preserves exact config bytes, revision, receipt and credential generation; writer/keychain-stage call count remains zero during retry.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-Q: activation-only retry preserves exact registry revision receipt and credential generation | `src/daemon/db/__tests__/saved-replay.test.ts` |

**integration: CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-R: a failed safe-list refresh retries only list without another ticket mutation stage or registry write | `src/daemon/db/__tests__/saved-replay.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/credential-generations.test.ts` | 0 | 7 | 19.4 s |  |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 6 | 1.5 s |  |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 5 | 1.4 s |  |
| `src/daemon/db/__tests__/saved-replay.test.ts` | 0 | 6 | 2.1 s |  |
