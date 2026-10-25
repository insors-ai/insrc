<!-- insrc:artifact TESTS-484fcef7efaf229e-s3 -->

# Tests: 484fcef7efaf229e s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 62 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T16:39:17.098Z on commit `fe5850574`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-INVENTORY: TypeScript-resolved alias/injection/factory/serializer baseline and missing-policy fail-closed tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: missing or forged execution never defaults to saved | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: explicit saved tuple is immutable, nonserializable and cancellation-bound | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: production analysis entry installs saved authority and rejects forged policy before source access | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: staged production executors refuse supplied unadmitted policy before loading state | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: lost carrier in a bound call cannot become saved or enter a provider | `src/shared/__tests__/connection-execution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 12.9 s |  |
| `src/shared/__tests__/connection-execution.test.ts` | 0 | 5 | 1.1 s |  |

## t2

Run at 2026-10-25T16:58:45.664Z on commit `9a4b23b89`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S3-AUTH: monotonic exact-deadline control lifecycle and session quota**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-AUTH: monotonic exact deadline and control generation preserve root overlays | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: quota refuses before overlay allocation and restart has no recovered state or writes | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: heartbeat and resume cannot cross the deadline between validation and commit | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: late root eligibility cannot publish an overlay under a superseded control | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: canonical registered eligibility and cancellation prevent late session publication | `src/daemon/db/__tests__/session-owner.test.ts` |

**integration: CM-S3-RECONNECT: real socket generation rollover preserves overlays**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-RECONNECT: real sockets preserve overlay data across roots and control rollover without renewing the lease | `src/daemon/db/__tests__/session-owner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-owner.test.ts` | 0 | 6 | 0.7 s |  |

## t3

Run at 2026-10-25T17:14:45.564Z on commit `19f388876`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S3-AUTH: role/root/audience token confusion,32-token quota and revocation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-AUTH: control and data capabilities cannot exchange roles roots or stored audiences | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: delegation quota multi-socket reuse and resume revoke every old data signal | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: resume and expiry invalidate all authority before synchronous abort observers | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S3-AUTH: data attachment awaiting eligibility cannot survive a control-generation change | `src/daemon/db/__tests__/session-owner.test.ts` |

**integration: CM-S3-AUTH: data sockets cannot call control RPCs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-AUTH: real data sockets cannot call control RPCs or promote restricted audience | `src/daemon/db/__tests__/session-owner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-owner.test.ts` | 0 | 11 | 1.7 s |  |

## t4

Run at 2026-10-25T17:52:22.586Z on commit `6e61c679a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-AUTH: bounded strict RPC/unknown method decoding and main-daemon routing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-AUTH: strict bounded session decoding rejects hostile shapes before eligibility | `src/daemon/db/__tests__/connection-session-rpc.test.ts` |
| pass | CM-S3-AUTH: socket session admission stays on main and refuses persistent runners and fallback | `src/daemon/db/__tests__/connection-session-rpc.test.ts` |
| pass | CM-S3-AUTH: disconnect during eligibility cannot publish a session or overlay | `src/daemon/db/__tests__/connection-session-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-session-rpc.test.ts` | 0 | 3 | 0.8 s |  |

## t5

Run at 2026-10-25T18:01:05.712Z on commit `65cbe88a9`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-STREAM: real server/router/maintenance terminal frame, disconnect, throwing delivery and delayed completion+drain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-STREAM: real socket done retains handler completion and late registered drains | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: real socket error retains handler completion and late registered drains | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: real socket disconnect retains handler completion and late registered drains | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: real socket terminal-disconnect retains handler completion and late registered drains | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: throwing progress delivery retains actual handler and cleanup | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: throwing terminal delivery retains actual handler and cleanup | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: a thrown handler emits one error but holds registered cleanup | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: worker terminal acknowledges actual completion and drain independently of delivery | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: worker cancel acknowledges actual completion and drain independently of delivery | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |
| pass | CM-S3-STREAM: worker unary-fallback acknowledges actual completion and drain independently of delivery | `src/daemon/threads/__tests__/stream-lifetime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/stream-lifetime.test.ts` | 0 | 10 | 1.8 s |  |

## t6

Run at 2026-10-25T18:10:21.974Z on commit `ea3dba90b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-MEMORY: effective keep/replace/clear config, safe projection and exact saved/keychain snapshots**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-MEMORY: owner generations keep replace clear safely with exact saved and keychain snapshots | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S3-MEMORY: file generations reuse readonly paths and retain fixed memory-only policy | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S3-MEMORY: cancellation expiry forgery and stale prepared generations cannot commit or leak prior state | `src/daemon/db/__tests__/session-entries.test.ts` |

**unit: CM-S3-REPLAY: entry/config quota refusal leaves no partial state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-REPLAY: session entry quota spans roots and commit rechecks concurrent preparations | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S3-REPLAY: cumulative config quota refuses create and update without partial state | `src/daemon/db/__tests__/session-entries.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-entries.test.ts` | 0 | 5 | 2.3 s |  |

## t7

Run at 2026-10-25T18:23:06.887Z on commit `d0fd984ae`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S3-REPLAY: same/changed payload, HMAC, ticket/receipt quotas and expiry truth**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-REPLAY: HMAC context changed payload and concurrent identical mutation preserve one receipt | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S3-REPLAY: signed lease expiry preserves committed truth and refuses unreceipted or lost sessions | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S3-REPLAY: expiry during preparation prevents entry and receipt publication | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S3-REPLAY: ticket and receipt quotas never evict live operation history | `src/daemon/db/__tests__/session-ledger.test.ts` |

**integration: CM-S3-REPLAY: concurrent real mutation and lost socket reply reconciliation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-REPLAY: real mutation sockets reconcile concurrent calls and a lost reply after control resume | `src/daemon/db/__tests__/session-ledger.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-ledger.test.ts` | 0 | 5 | 3 s |  |

## t8

Run at 2026-10-25T18:45:25.724Z on commit `2f975f568`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-COLLISION: canonical managed/unmanaged adopted/unadopted save races in both orders**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-COLLISION: managed-legacy saved-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: managed-legacy temporary-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: managed-v2 saved-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: managed-v2 temporary-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: unmanaged-legacy saved-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: unmanaged-legacy temporary-first real socket race has one winner and zero loser writes | `src/daemon/db/__tests__/connection-reservations.test.ts` |
| pass | CM-S3-COLLISION: independent workbench reservations remain until every same-ID owner ends | `src/daemon/db/__tests__/connection-reservations.test.ts` |

**integration: CM-S3-NAMESPACE: actual alias/relative/trailing-slash upsert refusal and preexisting distinct-target isolation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-NAMESPACE: alias relative and trailing writes refuse while actual saved and temporary SQLite rows stay separate | `src/daemon/db/__tests__/connection-reservations.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-reservations.test.ts` | 0 | 8 | 1.9 s |  |

## t9

Run at 2026-10-25T19:19:58.845Z on commit `ae630e99d`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-LEASE: full multi-call callback, busy update, delayed/failed construction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-LEASE: full callback pins revision through multiple calls busy update and retained-view revocation | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: failed construction keeps committed truth and activation-only retry builds once | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: late driver construction cannot publish after end and end awaits disposal | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: late rejection construction cannot publish after end and end awaits disposal | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: abandoned late iterator retains its lease and closes before end completes | `src/daemon/db/__tests__/session-resources.test.ts` |

**integration: CM-S3-ISOLATION: private owner/root/revision drivers with distinct credentials/rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-ISOLATION: private factory receives only the matching owner root and immutable credential revision | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-ISOLATION: actual private SQLite drivers return distinct rows for two owners roots and revisions | `src/daemon/db/__tests__/session-resources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-resources.test.ts` | 0 | 7 | 1.7 s |  |

## t10

Run at 2026-10-25T19:44:45.908Z on commit `966f6dd48`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S3-DRIVER-LOGS: immutable owner-only factory quiet authority, alias completeness and constructor refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-DRIVER-LOGS: owner context is immutable lazy quiet and remains quiet after authority expiry | `src/daemon/db/__tests__/driver-log-policy.test.ts` |
| pass | CM-S3-DRIVER-LOGS: missing forged copied and dropped factory policies refuse before config handoff | `src/daemon/db/__tests__/driver-log-policy.test.ts` |
| pass | CM-S3-DRIVER-LOGS: all 29 aliases forward context into 14 constructor guards before SDK creation | `src/daemon/db/__tests__/driver-log-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/driver-log-policy.test.ts` | 0 | 3 | 2.8 s |  |

## t11

Run at 2026-10-25T20:00:18.837Z on commit `73d93e5f0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-DRIVER-LOGS: actual normal daemon PG/Redis/SDK idle/reconnect/error/disposal canaries and saved marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-DRIVER-LOGS: normal daemon source and compiled SDK resources stay quiet through idle reconnect expiry and disposal while saved markers remain | `src/daemon/db/__tests__/session-driver-logs.test.ts` |
| pass | CM-S3-DRIVER-LOGS: ambient SDK debugging refuses temporary construction without disabling saved resources | `src/daemon/db/__tests__/session-driver-logs.test.ts` |
| pass | CM-S3-DRIVER-LOGS: installed SDK diagnostic controls retain reviewed source and version evidence for all 14 modules | `src/daemon/db/__tests__/session-driver-logs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-driver-logs.test.ts` | 0 | 3 | 4.8 s |  |
