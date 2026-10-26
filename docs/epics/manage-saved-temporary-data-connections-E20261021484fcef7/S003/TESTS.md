<!-- insrc:artifact TESTS-484fcef7efaf229e-s3 -->

# Tests: 484fcef7efaf229e s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 95 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

Run at 2026-10-25T20:11:53.125Z on commit `eef7a2a3f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-DRIVER-LOGS: actual normal daemon PG/Redis/SDK idle/reconnect/error/disposal canaries and saved marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-DRIVER-LOGS: normal daemon source and compiled SDK resources stay quiet through idle reconnect expiry and disposal while saved markers remain | `src/daemon/db/__tests__/session-driver-logs.test.ts` |
| pass | CM-S3-DRIVER-LOGS: ambient SDK debugging refuses temporary construction without disabling saved resources | `src/daemon/db/__tests__/session-driver-logs.test.ts` |
| pass | CM-S3-DRIVER-LOGS: installed SDK diagnostic controls retain reviewed source and version evidence for all 14 modules | `src/daemon/db/__tests__/session-driver-logs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-driver-logs.test.ts` | 0 | 3 | 8.6 s |  |

## t12

Run at 2026-10-25T20:30:25.887Z on commit `47507bad6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-FILES: native/converted resource identity,256MiB budget, zero spill/cache/INSTALL and cancellation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-FILES: isolated production file matrix verifies owner identity budget no-write refusal and cancellation without skipped cases | `src/daemon/db/__tests__/session-file-resources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-file-resources.test.ts` | 0 | 1 | 2.1 s |  |

## t13

Run at 2026-10-25T20:43:00.361Z on commit `b0f4ecf01`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-COMPAT: prepareTemporary edit/new draft source and compiled probe cancellation, zero commit writes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-COMPAT: actual source and compiled temporary edit and new draft workers validate owner revision cancel and drain without commits | `src/daemon/db/__tests__/session-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-probe.test.ts` | 0 | 1 | 4 s |  |

## t14

Run at 2026-10-25T21:04:02.362Z on commit `1caf36b1d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-MCP: private pipe bootstrap, every fresh socket attach, trusted fourth host argument and epoch/root mismatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-MCP: trusted fourth host argument is frozen nonserializable owner authority and caller JSON cannot replace it | `src/daemon/steps/__tests__/session-host-bootstrap.test.ts` |
| pass | CM-S3-MCP: real private inherited pipe attaches every fresh socket and refuses wrong epoch root audience control tokens and lost bootstrap | `src/daemon/steps/__tests__/session-host-bootstrap.test.ts` |
| pass | CM-S3-MCP: current control refreshes only the data delegation on the same private pipe after resume | `src/daemon/steps/__tests__/session-host-bootstrap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/session-host-bootstrap.test.ts` | 0 | 3 | 2.2 s |  |

## t15

Run at 2026-10-25T21:22:28.740Z on commit `029156e6b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-CLIENT-EGRESS: real forwardStep all analysis phases/one-shot deny before state/provider/output; all channels captured**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CLIENT-EGRESS: direct one-shot all phases answer-turn and host refuse before input state prompt provider trace or error-evidence reads | `src/daemon/steps/__tests__/analysis-client-refusal.test.ts` |
| pass | CM-S3-CLIENT-EGRESS: actual private forwardStep and host deny every unverified analysis phase and one-shot without runner or data-bearing channels | `src/daemon/steps/__tests__/analysis-client-refusal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/analysis-client-refusal.test.ts` | 0 | 2 | 3.3 s |  |

## t16

Run at 2026-10-26T04:44:23.461Z on commit `f0e7fae2b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-CONTEXT: actual db/data tools, schema-drift, runtime and exploration resolver callbacks with saved positive controls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CONTEXT: actual tools runtimes and exploration retain exact owner authority | `src/daemon/steps/__tests__/tool-owner-context.test.ts` |
| pass | CM-S1-M: schema drift retains its revision lease through both live schema and asynchronous Prisma comparison | `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` |
| pass | a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo) | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` | 0 | 19 | 0.9 s |  |
| `src/daemon/steps/__tests__/tool-owner-context.test.ts` | 0 | 1 | 1.8 s |  |
| `src/daemon/tools/builtins/db/__tests__/leased-tools.test.ts` | 0 | 6 | 1.5 s |  |

## t17

Run at 2026-10-26T04:54:11.092Z on commit `e0feeedcc`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-SCOPE: classifier/targetHint/prepareScope/stepScope/task-scope rootA temporary versus rootB saved ambiguity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-SCOPE: production scope paths bind to the authenticated root and preserve saved compatibility | `src/daemon/steps/__tests__/root-bound-scope.test.ts` |
| pass | resolveScope connection cases: one, none, two, unparseable connections file | `src/analyze/context/__tests__/scope.test.ts` |
| pass | resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched | `src/analyze/context/__tests__/prepare-scope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/prepare-scope.test.ts` | 0 | 8 | 1 s |  |
| `src/analyze/context/__tests__/scope.test.ts` | 0 | 8 | 0.6 s |  |
| `src/daemon/steps/__tests__/root-bound-scope.test.ts` | 0 | 1 | 1.7 s |  |

## t18

Run at 2026-10-26T05:03:06.670Z on commit `389675d84`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-CONTEXT: owner-private measurement slot, both branches and saved pending map compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CONTEXT: owner-private measurement slots and source/pool branches | `src/daemon/steps/__tests__/owner-measurement.test.ts` |
| pass | CM-S1-V: measure timeouts and cancelled waiters share one full-use lease until late connect/list success or rejection then clear pendingListings | `src/analyze/__tests__/measurement-leases.test.ts` |

**integration: CM-S3-LEASE: measure timeout/late rejection retains actual work and drain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-LEASE: measurement timeout retains actual work through late success or rejection | `src/daemon/steps/__tests__/owner-measurement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measurement-leases.test.ts` | 0 | 1 | 1.8 s |  |
| `src/daemon/steps/__tests__/owner-measurement.test.ts` | 0 | 2 | 1.3 s |  |

## t19

Run at 2026-10-26T05:39:46.239Z on commit `cfa11cedf`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-FREEFORM: explicit/forced fallback, requestSize variants, direct/task loops and same tuple at every relay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-FREEFORM: actual explicit forced and measured owner relays plus saved tool-loop compatibility | `src/daemon/steps/__tests__/freeform-owner-relay.test.ts` |
| pass | a module request keeps its own directory, and a bare repo path stands for a workspace scope | `src/analyze/explore/__tests__/freeform-probe-scope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/freeform-probe-scope.test.ts` | 0 | 3 | 1.5 s |  |
| `src/daemon/steps/__tests__/freeform-owner-relay.test.ts` | 0 | 1 | 2.3 s |  |

## t20

Run at 2026-10-26T06:13:01.345Z on commit `de770ef58`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-CACHE: warm exploration/context saved/A/B caches, revision/owner/expiry denial before persistent get/set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CACHE: warm exploration/context saved/A/B caches, revision/owner/expiry denial before persistent get/set | `src/daemon/steps/__tests__/private-cache.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/private-cache.test.ts` | 0 | 1 | 2.4 s |  |

## t21

Run at 2026-10-26T06:30:28.548Z on commit `6b25e6cbf`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-RECURSION: root runStages/completeRun/repair success and failures, same runId two owners, no run record IO**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-RECURSION: root runStages/completeRun/repair success and failures, same runId two owners, no run record IO | `src/daemon/steps/__tests__/root-run-memory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/root-run-memory.test.ts` | 0 | 1 | 2.1 s |  |

## t22

Run at 2026-10-26T07:05:50.981Z on commit `80648023e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-RECURSION: nested planner measure/execute/aggregate/resume and no attempt/feedback/final-plan IO**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-RECURSION: nested planner measure/execute/aggregate/resume and no attempt/feedback/final-plan IO | `src/daemon/steps/__tests__/nested-planner-memory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/nested-planner-memory.test.ts` | 0 | 1 | 2.1 s |  |

## t23

Run at 2026-10-26T08:27:38.643Z on commit `11d7d4a0e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-CACHE: task/report/checkpoint/history/trace/Lance canaries, error repair, saved positive persistence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CACHE: task/report/checkpoint/history/trace/Lance canaries, error repair, saved positive persistence | `src/daemon/steps/__tests__/task-persistence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/task-persistence.test.ts` | 0 | 1 | 2.2 s |  |

## t24

Run at 2026-10-26T10:11:31.210Z on commit `a4df478e8`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: CM-S3-PROVIDER: actual factory/direct/injected/cache/loop/aggregate pre-send denial and expiry guards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-PROVIDER: actual factory/direct/injected/cache/loop/aggregate pre-send denial and expiry guards | `src/daemon/steps/__tests__/provider-admission.test.ts` |
| pass | memory-only Ollama transport rejects malformed frames before SDK console diagnostics | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |
| pass | memory-only Ollama transport retains completion until actual HTTP EOF after terminal frame | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |
| pass | memory-only Ollama transport rejects non-JSON HTTP failures before SDK error diagnostics | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |
| pass | admitted Session expiry during real structured validation prevents the next SDK retry | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |
| pass | memory-only adapter refuses internal helper substitution before native construction | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |
| pass | issued proof from an actual changed artifact generation refuses with zero filesystem or spawn calls | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |

**live: CM-S3-PROVIDER: actual admitted local Ollama no-persistence smoke; unavailable evidence is pending and admission stays refused**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/task24-provider-admission.md; final actual isolated Ollama source/compiled runs each pass zero skips (task24-live-source-output.txt, task24-live-compiled-output.txt), using src/daemon/steps/__tests__/provider-admission.live.test.ts with INSRC_PROVIDER_LIVE=1 then INSRC_PROVIDER_MODE=compiled, Node22. Actual complete/completeStructured, callback persistence denial, immutable method/profile proof, cancellation/expiry and private output snapshots through server close. Production configured-service proof stays pending; release disabled.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-private-transport.test.ts` | 0 | 6 | 1.9 s |  |
| `src/daemon/steps/__tests__/provider-admission.test.ts` | 0 | 2 | 0.7 s |  |

## t25

Run at 2026-10-26T10:35:13.787Z on commit `9a9e14ad5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-PROVIDER: structured retry inner authority guard and nonretryable refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-PROVIDER: structured retry inner authority guard and nonretryable refusal | `src/daemon/steps/__tests__/provider-diagnostics.test.ts` |
| pass | admitted Session expiry during real structured validation prevents the next SDK retry | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |

**integration: CM-S3-CONSUMER-LOGS: actual provider prompt/retry/late-stream trace sink and saved control**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CONSUMER-LOGS: actual provider prompt/retry/late-stream trace sink and saved control | `src/daemon/steps/__tests__/provider-diagnostics.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-private-transport.test.ts` | 0 | 6 | 1.6 s |  |
| `src/daemon/steps/__tests__/provider-diagnostics.test.ts` | 0 | 2 | 1.1 s |  |

## t26

Run at 2026-10-26T11:02:19.774Z on commit `1f0151e05`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-EMBED-DENY: docs/vector/hybrid/lineage/graph routes zero Ollama/ONNX/injected/SDK query calls and no fallback success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-EMBED-DENY: docs/vector/hybrid/lineage/graph routes zero Ollama/ONNX/injected/SDK query calls and no fallback success | `src/daemon/steps/__tests__/embedding-denial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/embedding-denial.test.ts` | 0 | 1 | 0.9 s |  |
