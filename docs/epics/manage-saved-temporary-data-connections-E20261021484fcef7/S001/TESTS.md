<!-- insrc:artifact TESTS-484fcef7efaf229e-s1 -->

# Tests: 484fcef7efaf229e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 348 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-10-24T17:56:29.003Z on commit `a3f10db3e`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-E: each atomic write failure preserves prior bytes or requires reconciliation to exact committed truth | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-E: real process crashes at preparation stage write rename sync and cleanup boundaries recover exact committed truth | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: Keep retains the live generation and Clear removes it only after canonical commit | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: missing live keys and unresolved journals block writes; foreign and referenced keys cannot be cleaned | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: encoded immutable userinfo references resolve with credential escaping and no legacy regression | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: partial keychain failure preserves old effective credentials and recovery removes only owned staging | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: committed cleanup failure stays pending and retry preserves exact registry revision receipt and live generation | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S1-E: first-use recovery directory parent sync precedes staging and completion sync failures retain a blocking retry record | `src/daemon/db/__tests__/credential-generations.test.ts` |

**integration: CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-F: actual same-UID writeFile is fenced after digest validation; preopened descriptor writes only detached inode | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-F: privileged or failed permission proof disables adoption without changing the registry | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-F: an ineffective physical overwrite fence refuses adoption with exact registry bytes unchanged | `src/daemon/db/__tests__/managed-store.test.ts` |

**smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-O: managed startup refuses direct legacy writes, envelope stripping, forged proofs and missing owner | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-O: inode mode envelope and generation drift block writes instead of normalizing registry truth | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-J: v2 safe reads legacy projections and label-only edits preserve credentials without raw fields or stored references | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-management-rpc.test.ts` | 0 | 6 | 2.1 s |  |
| `src/daemon/db/__tests__/credential-generations.test.ts` | 0 | 7 | 20.8 s |  |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 6 | 7.9 s |  |

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

## t10

Run at 2026-10-24T12:44:33.247Z on commit `7ee35c01b`. Tests check: **passed**. 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-V: injected runtime and exploration aliases use safe metadata and retain actual revision leases through success and rejection | `src/analyze/__tests__/connection-consumers.test.ts` |
| pass | CM-S1-V: measure timeouts and cancelled waiters share one full-use lease until late connect/list success or rejection then clear pendingListings | `src/analyze/__tests__/measurement-leases.test.ts` |
| pass | CM-S1-V: ordinary DB tool async iteration retains full-use ownership through completion cancellation failure and nested library cleanup | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | a table test over all twenty lookup types finds a completeness record with its stated basis | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |
| pass | each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output | `src/analyze/explore/__tests__/failed-lookups.test.ts` |

**integration: CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo) | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |
| pass | honors user-pinned family but warns on mismatch | `src/daemon/db/__tests__/config.test.ts` |

**integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-M: file enumeration resolves its own directory and retains a lease throughout asynchronous filesystem walking | `src/analyze/__tests__/connection-consumers.test.ts` |
| pass | CM-S1-M: schema drift retains its revision lease through both live schema and asynchronous Prisma comparison | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | CM-S1-M: metadata discovery and access policies remain scoped and never acquire a driver before admission | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | CM-S1-M: metadata-only file listing keeps its pin until the filesystem result finishes without building a driver | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
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
| `src/analyze/__tests__/connection-consumers.test.ts` | 0 | 2 | 2 s |  |
| `src/analyze/__tests__/measurement-leases.test.ts` | 0 | 1 | 1.2 s |  |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 12 | 2.9 s |  |
| `src/analyze/explore/__tests__/failed-lookups.test.ts` | 0 | 7 | 1.7 s |  |
| `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` | 0 | 19 | 0.6 s |  |
| `src/daemon/db/__tests__/config.test.ts` | 0 | 15 | 0.4 s |  |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 12 | 1.2 s |  |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.1 s |  |
| `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` | 0 | 4 | 1.3 s |  |

## t11

Run at 2026-10-24T12:50:03.451Z on commit `9873bb472`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-V: injected runtime and exploration aliases use safe metadata and retain actual revision leases through success and rejection | `src/analyze/__tests__/connection-consumers.test.ts` |
| pass | CM-S1-V: measure timeouts and cancelled waiters share one full-use lease until late connect/list success or rejection then clear pendingListings | `src/analyze/__tests__/measurement-leases.test.ts` |
| pass | CM-S1-V: ordinary DB tool async iteration retains full-use ownership through completion cancellation failure and nested library cleanup | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | a table test over all twenty lookup types finds a completeness record with its stated basis | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |
| pass | each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output | `src/analyze/explore/__tests__/failed-lookups.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/connection-consumers.test.ts` | 0 | 2 | 1.9 s |  |
| `src/analyze/__tests__/measurement-leases.test.ts` | 0 | 1 | 1.1 s |  |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 12 | 2.3 s |  |
| `src/analyze/explore/__tests__/failed-lookups.test.ts` | 0 | 7 | 1.6 s |  |
| `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` | 0 | 4 | 1.1 s |  |

## t12

Run at 2026-10-24T13:00:09.142Z on commit `fc76d313a`. Tests check: **passed**. 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-V: injected runtime and exploration aliases use safe metadata and retain actual revision leases through success and rejection | `src/analyze/__tests__/connection-consumers.test.ts` |
| pass | CM-S1-V: measure timeouts and cancelled waiters share one full-use lease until late connect/list success or rejection then clear pendingListings | `src/analyze/__tests__/measurement-leases.test.ts` |
| pass | CM-S1-V: ordinary DB tool async iteration retains full-use ownership through completion cancellation failure and nested library cleanup | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | a table test over all twenty lookup types finds a completeness record with its stated basis | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |
| pass | each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output | `src/analyze/explore/__tests__/failed-lookups.test.ts` |
| pass | CM-S1-V: actual MSSQL sample timeout retains underlying library work through late success or failure | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | CM-S1-V: parallel driver calls settle every library request before propagating a sibling failure | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |

**integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**integration: CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-M: file enumeration resolves its own directory and retains a lease throughout asynchronous filesystem walking | `src/analyze/__tests__/connection-consumers.test.ts` |
| pass | CM-S1-M: schema drift retains its revision lease through both live schema and asynchronous Prisma comparison | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | CM-S1-M: metadata discovery and access policies remain scoped and never acquire a driver before admission | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | CM-S1-M: metadata-only file listing keeps its pin until the filesystem result finishes without building a driver | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
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
| `src/analyze/__tests__/connection-consumers.test.ts` | 0 | 2 | 1.9 s |  |
| `src/analyze/__tests__/measurement-leases.test.ts` | 0 | 1 | 1.3 s |  |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 12 | 5.3 s |  |
| `src/analyze/explore/__tests__/failed-lookups.test.ts` | 0 | 7 | 1.6 s |  |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 12 | 1.2 s |  |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.1 s |  |
| `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` | 0 | 6 | 1.1 s |  |

## t13

Run at 2026-10-24T15:27:24.726Z on commit `8d52af904`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-W: schema-first typed batches preserve declared empty and all-null schemas and isolate worksheet targets | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: batch limits cancellation required values and schema identity are enforced before row emission | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: saved Parquet uses the same declared schema and normalized rows as memory batches including zero rows | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: legacy all-sheet union rejects divergent schemas rather than reusing another worksheet schema | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: shared normalization describes dates binary nested and numeric values explicitly | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: closing a partially consumed source releases the active reader once and rejects further batches | `src/daemon/db/__tests__/typed-row-source.test.ts` |
| pass | CM-S1-W: BSON saved and memory schemas preserve full dates precise large numbers nested values rare fields and all-null data | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: fixed-width saved and memory rows share explicit empty all-null schema and complete incremental decoding | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: actual empty and all-null BSON keeps its declared fallback schema with no invented data rows | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: Avro explicit writer schemas and full normalized values match saved output with zero rows nullable fields and nested unions | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: standard avsc container encoder remains readable without saved-output staging | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: XLSX sheet names legacy slugs dates shared strings formula normalization and saved rows have complete typed parity | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX empty and all-null worksheets keep declared stub/header schemas with zero rows | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX compatible no-target union merged headers fallback names and hyperlinks retain saved semantics | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: directory XLSX conversion preserves all worksheets through its returned recursive Parquet glob | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 4 | 0.7 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.9 s |  |
| `src/daemon/db/__tests__/typed-row-source.test.ts` | 0 | 6 | 0.4 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.9 s |  |

## t14

Run at 2026-10-24T15:36:04.029Z on commit `35b08cc83`. Tests check: **passed**. 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: archive close releases abandoned entry buffers idempotently | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |

**integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-W: BSON saved and memory schemas preserve full dates precise large numbers nested values rare fields and all-null data | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: fixed-width saved and memory rows share explicit empty all-null schema and complete incremental decoding | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: actual empty and all-null BSON keeps its declared fallback schema with no invented data rows | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: Avro explicit writer schemas and full normalized values match saved output with zero rows nullable fields and nested unions | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: standard avsc container encoder remains readable without saved-output staging | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: XLSX sheet names legacy slugs dates shared strings formula normalization and saved rows have complete typed parity | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX empty and all-null worksheets keep declared stub/header schemas with zero rows | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX compatible no-target union merged headers fallback names and hyperlinks retain saved semantics | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: directory XLSX conversion preserves all worksheets through its returned recursive Parquet glob | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 7 | 0.7 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.5 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.8 s |  |

## t15

Run at 2026-10-24T16:54:05.530Z on commit `c894a5a0c`. Tests check: **passed**. 28 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: archive close releases abandoned entry buffers idempotently | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-S: Avro rejects schema field union fixed and recursive graphs before invoking avsc materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real Avro inflater failure closes actual source handles and releases admission before caller cleanup | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real inflater output chunks and concatenation are admitted before allocation including cap overshoot | `src/daemon/db/__tests__/bounded-inflate.test.ts` |
| pass | CM-S1-S: malformed nested shared strings and text outside string items cannot bypass aggregate unit admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML attribute count is rejected before any parser reservation or materialization | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |

**integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-W: Avro explicit writer schemas and full normalized values match saved output with zero rows nullable fields and nested unions | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: standard avsc container encoder remains readable without saved-output staging | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: BSON saved and memory schemas preserve full dates precise large numbers nested values rare fields and all-null data | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: fixed-width saved and memory rows share explicit empty all-null schema and complete incremental decoding | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: actual empty and all-null BSON keeps its declared fallback schema with no invented data rows | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: XLSX sheet names legacy slugs dates shared strings formula normalization and saved rows have complete typed parity | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX empty and all-null worksheets keep declared stub/header schemas with zero rows | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX compatible no-target union merged headers fallback names and hyperlinks retain saved semantics | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: directory XLSX conversion preserves all worksheets through its returned recursive Parquet glob | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-W: tiny deflate Avro records preserve saved parity within a small admitted memory budget | `src/daemon/db/__tests__/bounded-avro.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/bounded-inflate.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` | 0 | 6 | 0.9 s |  |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.5 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.8 s |  |

## t16

Run at 2026-10-24T16:42:02.674Z on commit `c0c4e1b14`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: archive close releases abandoned entry buffers idempotently | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-S: Avro rejects schema field union fixed and recursive graphs before invoking avsc materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real Avro inflater failure closes actual source handles and releases admission before caller cleanup | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real inflater output chunks and concatenation are admitted before allocation including cap overshoot | `src/daemon/db/__tests__/bounded-inflate.test.ts` |
| pass | CM-S1-S: malformed nested shared strings and text outside string items cannot bypass aggregate unit admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML attribute count is rejected before any parser reservation or materialization | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 7 | 0.7 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/bounded-inflate.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` | 0 | 6 | 1 s |  |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.8 s |  |

## t17

Run at 2026-10-24T16:56:01.865Z on commit `c894a5a0c`. Tests check: **passed**. 28 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: archive close releases abandoned entry buffers idempotently | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-S: Avro rejects schema field union fixed and recursive graphs before invoking avsc materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real Avro inflater failure closes actual source handles and releases admission before caller cleanup | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real inflater output chunks and concatenation are admitted before allocation including cap overshoot | `src/daemon/db/__tests__/bounded-inflate.test.ts` |
| pass | CM-S1-S: malformed nested shared strings and text outside string items cannot bypass aggregate unit admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML attribute count is rejected before any parser reservation or materialization | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |

**integration: CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-W: XLSX sheet names legacy slugs dates shared strings formula normalization and saved rows have complete typed parity | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX empty and all-null worksheets keep declared stub/header schemas with zero rows | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: XLSX compatible no-target union merged headers fallback names and hyperlinks retain saved semantics | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: directory XLSX conversion preserves all worksheets through its returned recursive Parquet glob | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-W: BSON saved and memory schemas preserve full dates precise large numbers nested values rare fields and all-null data | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: fixed-width saved and memory rows share explicit empty all-null schema and complete incremental decoding | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: actual empty and all-null BSON keeps its declared fallback schema with no invented data rows | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-W: Avro explicit writer schemas and full normalized values match saved output with zero rows nullable fields and nested unions | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-W: standard avsc container encoder remains readable without saved-output staging | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-W: tiny deflate Avro records preserve saved parity within a small admitted memory budget | `src/daemon/db/__tests__/bounded-avro.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 7 | 0.7 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/bounded-inflate.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` | 0 | 6 | 1 s |  |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.5 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.8 s |  |

## t18

Run at 2026-10-24T17:24:05.403Z on commit `31f275ed8`. Tests check: **passed**. 33 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-H: native CSV JSON JSONL and Parquet private resources read complete isolated tables without file writes installs or source-path errors | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: BSON and XLSX rows use private typed tables with precise values target isolation and zero cache sidecars | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: typed empty and all-null tables preserve declared types and nullability before the first batch | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: query admission rejects writes multi-statements and unapproved sources while close waits for actual use | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: unavailable local readers fail explicitly without INSTALL and close their partial instance | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: resource close waits for decoder source cleanup after native work settles and closes the source once | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-H: isolated native and converted execution leaves home cache temp config working roots and captured logs free of file or path leakage | `src/daemon/db/__tests__/file-execution.test.ts` |

**integration: CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle | `src/daemon/db/__tests__/bounded-converters.test.ts` |
| pass | CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: XLSX ZIP entry count declared totals ZIP64 and forged expansion reject before retaining over-limit output | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML text attributes comments CDATA cell accumulation encoding and entities have bounded admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: valid ExcelJS archives parse incrementally and parser callback failures release every reservation | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: archive close releases abandoned entry buffers idempotently | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables | `src/daemon/db/__tests__/typed-xlsx.test.ts` |
| pass | CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-S: Avro rejects schema field union fixed and recursive graphs before invoking avsc materialization | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real Avro inflater failure closes actual source handles and releases admission before caller cleanup | `src/daemon/db/__tests__/bounded-avro.test.ts` |
| pass | CM-S1-S: real inflater output chunks and concatenation are admitted before allocation including cap overshoot | `src/daemon/db/__tests__/bounded-inflate.test.ts` |
| pass | CM-S1-S: malformed nested shared strings and text outside string items cannot bypass aggregate unit admission | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |
| pass | CM-S1-S: XML attribute count is rejected before any parser reservation or materialization | `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` |

**integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-T: every file driver query uses its owned private resource and close disposes it without cache or source-path output | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: directory memory readers retain every matching file and single-quote CSV configuration is escaped | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: legacy transient construction uses profile materialization memory policy and awaited private cleanup without writes | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: transient drafts cannot read another credential reference and nested owned credentials use read-only materialization | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: renderer options cannot select execution policy and memory initialization errors redact source paths | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: saved file-driver roots contents revisions and converter options return correct complete rows | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-T: directory saved reads include only current sources and current XLSX sheets across content generations | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/bounded-avro.test.ts` | 0 | 7 | 0.9 s |  |
| `src/daemon/db/__tests__/bounded-converters.test.ts` | 0 | 7 | 0.9 s |  |
| `src/daemon/db/__tests__/bounded-inflate.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/db/__tests__/bounded-xlsx-archive.test.ts` | 0 | 6 | 1 s |  |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 8 | 2.5 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.6 s |  |
| `src/daemon/db/__tests__/saved-cache-identity.test.ts` | 0 | 6 | 1.4 s |  |
| `src/daemon/db/__tests__/typed-xlsx.test.ts` | 0 | 5 | 0.8 s |  |

## t19

Run at 2026-10-24T17:26:36.156Z on commit `31f275ed8`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-H: native CSV JSON JSONL and Parquet private resources read complete isolated tables without file writes installs or source-path errors | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: BSON and XLSX rows use private typed tables with precise values target isolation and zero cache sidecars | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: typed empty and all-null tables preserve declared types and nullability before the first batch | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: query admission rejects writes multi-statements and unapproved sources while close waits for actual use | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: unavailable local readers fail explicitly without INSTALL and close their partial instance | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: resource close waits for decoder source cleanup after native work settles and closes the source once | `src/daemon/db/__tests__/file-execution.test.ts` |
| pass | CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-H: isolated native and converted execution leaves home cache temp config working roots and captured logs free of file or path leakage | `src/daemon/db/__tests__/file-execution.test.ts` |

**integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-T: every file driver query uses its owned private resource and close disposes it without cache or source-path output | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: directory memory readers retain every matching file and single-quote CSV configuration is escaped | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: legacy transient construction uses profile materialization memory policy and awaited private cleanup without writes | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: transient drafts cannot read another credential reference and nested owned credentials use read-only materialization | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: renderer options cannot select execution policy and memory initialization errors redact source paths | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: saved file-driver roots contents revisions and converter options return correct complete rows | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-T: directory saved reads include only current sources and current XLSX sheets across content generations | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/file-execution.test.ts` | 0 | 8 | 2.7 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 6 | 1.6 s |  |
| `src/daemon/db/__tests__/saved-cache-identity.test.ts` | 0 | 6 | 1.4 s |  |

## t20

Run at 2026-10-24T17:46:07.120Z on commit `e1561b0e9`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-I: two roots/owners same ID/file name/size/mtime with different content return correct complete rows; saved cache freshness verifies content/source/options; converted values match saved normalization, not a lossy sample.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-I: all saved cache identity components isolate destinations sidecars inflight work and exact-owned cleanup | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-I: unchanged size and mtime cannot reuse stale contents and corrupt derived output is rebuilt without changing source | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-I: same-identity conversions join while separate roots proceed and source changes discard all staged output | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-I: cache maintenance evicts only unpinned derived generations and leaves source bytes intact | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |

**integration: CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-T: saved file-driver roots contents revisions and converter options return correct complete rows | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-T: directory saved reads include only current sources and current XLSX sheets across content generations | `src/daemon/db/__tests__/saved-cache-identity.test.ts` |
| pass | CM-S1-T: every file driver query uses its owned private resource and close disposes it without cache or source-path output | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: directory memory readers retain every matching file and single-quote CSV configuration is escaped | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: legacy transient construction uses profile materialization memory policy and awaited private cleanup without writes | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: transient drafts cannot read another credential reference and nested owned credentials use read-only materialization | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: renderer options cannot select execution policy and memory initialization errors redact source paths | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: private native and converted driver initialization issues zero INSTALL calls | `src/daemon/db/__tests__/owned-file-driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 7 | 2.1 s |  |
| `src/daemon/db/__tests__/saved-cache-identity.test.ts` | 0 | 6 | 1.6 s |  |

## t21

Run at 2026-10-24T17:53:51.398Z on commit `b7ef80379`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-C: v2 credential Keep Replace Clear and activation-only retry preserve safe exact outcomes | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |
| pass | CM-S1-C: signed tickets and keyed full-request fingerprints retain credential intent without config effects | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: malformed, tampered and wrong-target tickets reject with sanitized errors | `src/daemon/db/__tests__/management-tickets.test.ts` |
| pass | CM-S1-C: expiry remains authenticated for reconciliation and cannot authorize new replay | `src/daemon/db/__tests__/management-tickets.test.ts` |

**integration: CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-R: a v2 refresh failure retries only safe list and preserves exact committed receipt revision bytes and keys | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |

**integration: CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-U: v2 dispatch and real legacy save reject corrupt unreadable registries before every staging and writer effect | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S1-U: unmanaged legacy compatibility also rejects corrupt registry reads before password extraction | `src/daemon/db/__tests__/saved-management.test.ts` |

**integration: CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-J: v2 handshake routes remain mutation-disabled before adoption and old-daemon replies become fixed upgrade-required | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |
| pass | CM-S1-J: v2 safe reads legacy projections and label-only edits preserve credentials without raw fields or stored references | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |
| pass | CM-S1-J: malformed unknown-field wrong-root ticket and scope payloads fail safely before mutation effects | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |
| pass | CM-S1-J: legacy unmanaged success hides secret references and managed removal refuses without changing state | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-management-rpc.test.ts` | 0 | 6 | 1.9 s |  |
| `src/daemon/db/__tests__/management-tickets.test.ts` | 0 | 5 | 0.4 s |  |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 5 | 2 s |  |

## t22

Run at 2026-10-24T18:01:48.085Z on commit `823a89ac1`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-F: actual same-UID writeFile is fenced after digest validation; preopened descriptor writes only detached inode | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-F: privileged or failed permission proof disables adoption without changing the registry | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-F: an ineffective physical overwrite fence refuses adoption with exact registry bytes unchanged | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | target filesystem denies legacy subprocess writes and isolates detached descriptors | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |

**integration: CM-S1-G: reject post-adoption chmod/rename/envelope drift; no automatic replay of missing receipt after drift; maintenance requires old identified PID gone.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | maintenance metadata is protected and partial adoption blocks legacy writers | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | exclusive owner lease rejects live or unknown owners and reclaims only dead or reused identities | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | target filesystem denies legacy subprocess writes and isolates detached descriptors | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | release evidence remains disabled until the completed build supplies verified gates | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | signed restart checkpoint accepts only its exact prepared inode and rejects drift or lost signing keys | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | stopped adoption migrates fixed credentials, preserves rollback preimage and restarts with the same registry identity | `src/daemon/db/__tests__/management-adoption.test.ts` |
| pass | adoption refuses live daemon, unclassified private fields and missing release gates without credential writes | `src/daemon/db/__tests__/management-adoption.test.ts` |
| pass | CM-S1-N: adopted fixture supports create update activation failure and signed replay after restart | `src/daemon/db/__tests__/management-adoption.test.ts` |
| pass | maintenance control verifies the old daemon before stopping and never runs maintenance while it survives | `src/daemon/db/__tests__/connection-maintenance-control.test.ts` |

**smoke: CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-N: adopted fixture supports create update activation failure and signed replay after restart | `src/daemon/db/__tests__/management-adoption.test.ts` |

**smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-O: managed startup refuses direct legacy writes, envelope stripping, forged proofs and missing owner | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-O: inode mode envelope and generation drift block writes instead of normalizing registry truth | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-J: v2 safe reads legacy projections and label-only edits preserve credentials without raw fields or stored references | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-maintenance-control.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/db/__tests__/connection-management-rpc.test.ts` | 0 | 6 | 1.8 s |  |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 6 | 2.6 s |  |
| `src/daemon/db/__tests__/management-adoption.test.ts` | 0 | 3 | 2.2 s |  |
| `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` | 0 | 5 | 0.7 s |  |

## t23

Run at 2026-10-24T18:04:39.785Z on commit `da9bc0f7e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**smoke: CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-N: adopted fixture supports create update activation failure and signed replay after restart | `src/daemon/db/__tests__/management-adoption.test.ts` |

**smoke: CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-O: managed startup refuses direct legacy writes, envelope stripping, forged proofs and missing owner | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-O: inode mode envelope and generation drift block writes instead of normalizing registry truth | `src/daemon/db/__tests__/managed-store.test.ts` |
| pass | CM-S1-J: v2 safe reads legacy projections and label-only edits preserve credentials without raw fields or stored references | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-management-rpc.test.ts` | 0 | 6 | 2.1 s |  |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.6 s |  |
| `src/daemon/db/__tests__/managed-store.test.ts` | 0 | 6 | 2.5 s |  |
| `src/daemon/db/__tests__/management-adoption.test.ts` | 0 | 3 | 2.1 s |  |
