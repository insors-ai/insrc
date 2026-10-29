<!-- insrc:artifact TESTS-484fcef7efaf229e-s4 -->

# Tests: 484fcef7efaf229e s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 62 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T10:08:25.734Z on commit `1df739847`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-INPUT: extend src/shared/__tests__/connection-management.test.ts for exact cleanup/status decoders, wrong mode/target and unchanged receipt keys.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-INPUT: removal state and cleanup accept only a bounded exact remove ticket | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S4-INPUT: existing remove target validation and persisted outcome shape stay unchanged | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-J: protocol declarations compile in strict NodeNext including negative secret-field assignments | `src/shared/__tests__/connection-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-management.test.ts` | 0 | 6 | 4 s |  |

## t2

Run at 2026-10-29T10:12:55.214Z on commit `08f5e1719`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-CONFIRM/STATE: proposed pure-state tests for exact repository/ID/scope, zero-effect cancellation, unknown outcomes and independent cleanup phases.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-CONFIRM: cancellation creates no command or ticket and confirmation captures the exact generation | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: uncertain status and missing rows never become successful removal | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: committed removal tracks credential and runtime cleanup independently | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: unrelated outcomes cannot assert removal and projections never copy unsafe fields | `src/shared/__tests__/connection-removal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-removal.test.ts` | 0 | 4 | 0.3 s |  |

## t3

Run at 2026-10-29T10:16:22.549Z on commit `0ce46e23e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-RETIRE: proposed private retirement-owner tests for exact tokens, 64/65 root and 256/257 daemon capacity, cancellation and already-owned shutdown drains.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-RETIRE: shared budget enforces 64 per root and 256 daemon-wide without eviction | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: opaque tokens bind owner, operation and revision and only uncommitted reservations cancel | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: failed close retains exact ownership and concurrent retries share one attempt | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: shutdown drains already-owned resources at capacity and keeps failures for retry | `src/daemon/db/__tests__/removal-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/removal-retirement.test.ts` | 0 | 4 | 0.5 s |  |

## t4

Run at 2026-10-29T10:21:30.021Z on commit `5d42177e7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-RETIRE/INVALIDATE: extend src/daemon/db/__tests__/connection-leases.test.ts with paused/failed SDK close, late construction, exact revision detachment and retained retry handles.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-INVALIDATE: removal detaches an unused revision synchronously without constructing it | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: failed and paused removal cleanup retains the old handle across same-ID recreation | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: late raw construction cannot escape a removed revision and is strictly closed | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: cancellation preserves generation and unresolved preparation blocks reload and shutdown | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: failed idle close retains its exact driver for later strict removal retry | `src/daemon/db/__tests__/connection-leases.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 17 | 1.7 s |  |

## t5

Run at 2026-10-29T10:33:28.336Z on commit `dac5143e6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-RETIRE/TEMP: extend src/daemon/db/__tests__/session-resources.test.ts and src/daemon/db/__tests__/session-cleanup.test.ts for retained resource slots, cross-root pressure and expiry drains.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-TEMP: retired resources retain a shared slot across roots and failed cleanup does not poison other owners | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S4-TEMP: exact private file failures remain owned and retain the slot until file and SDK close complete | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S4-TEMP: shutdown drains retained resources at capacity and retries failed close without new admission | `src/daemon/db/__tests__/session-cleanup.test.ts` |
| pass | CM-S4-TEMP: cancellation and owner expiry preserve exact late-construction cleanup | `src/daemon/db/__tests__/session-cleanup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-cleanup.test.ts` | 0 | 4 | 15.1 s |  |
| `src/daemon/db/__tests__/session-resources.test.ts` | 0 | 9 | 1.8 s |  |

## t6

Run at 2026-10-29T10:38:24.577Z on commit `386d5fd7f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-CREDENTIALS: extend src/daemon/db/__tests__/credential-generations.test.ts with empty-staging removal, own/foreign/shared/live references and journal/finalization failures.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-CREDENTIALS: removal prepares an empty journal and precommit recovery without reading plaintext | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S4-CREDENTIALS: removal preserves foreign and shared live refs through restart and cleanup finalization failures | `src/daemon/db/__tests__/credential-generations.test.ts` |
| pass | CM-S4-CREDENTIALS: stale removal and journal preparation failure preserve registry and credentials | `src/daemon/db/__tests__/credential-generations.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/credential-generations.test.ts` | 0 | 10 | 13.9 s |  |

## t7

Run at 2026-10-29T10:44:21.065Z on commit `7afe40883`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-SAVED/REPLAY: extend src/daemon/db/__tests__/saved-management.test.ts for atomic row/revision/receipt removal, exact replay and unrelated-document preservation.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-SAVED: removal atomically drops selected row and revision while preserving source and unrelated document | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-REPLAY: concurrent identical removal and recreated-ID replay preserve exact original operation | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-SAVED: busy stale and missing removals preserve registration credentials and receipts | `src/daemon/db/__tests__/saved-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 8 | 2.8 s |  |

## t8

Run at 2026-10-29T10:52:17.847Z on commit `fde043bdb`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-REPLAY/RACES: saved-management and credential crash/restart fixtures for rename/fsync ambiguity, response loss, held barriers, receipt expiry/pruning and same-ID recreation.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-REPLAY: ambiguous rename and fsync failures retain the barrier until same-ticket classification | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-REPLAY: expired and pruned removal receipts cannot delete a recreated generation | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-REPLAY: real process crash before or after rename recovers removal truth on restart | `src/daemon/db/__tests__/saved-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 11 | 6 s |  |

## t9

Run at 2026-10-29T10:59:03.604Z on commit `92b13b4cc`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-STATE/CREDENTIALS/RETIRE: saved owner state/retry tests for independent phases, authenticated same-ticket cleanup and restart journal recovery.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-STATE: Saved removal state authenticates before registry lookup and never infers absent success | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-CREDENTIALS: Saved removal state survives credential cleanup failure and restart independently of runtime cleanup | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-RETIRE: Saved cleanup retries leave new generations usable and retain expired pending receipts | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-STATE: committed truth stays observable while original credential cleanup is still in flight | `src/daemon/db/__tests__/saved-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 15 | 6.1 s |  |

## t10

Run at 2026-10-29T11:03:27.461Z on commit `7d6467db5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-TEMP-REPLAY: extend src/daemon/db/__tests__/session-ledger.test.ts for remove admission, no fabricated row, 16384-record boundaries and atomic callback/receipt behavior.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-TEMP-REPLAY: remove commits revision-only truth and replay cannot select a recreated row | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S4-TEMP-REPLAY: postcommit apply failure returns the existing removal receipt without payload leakage | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S4-TEMP-REPLAY: ticket owner and request-generation expiry prevent removal publication after awaits | `src/daemon/db/__tests__/session-ledger.test.ts` |
| pass | CM-S4-TEMP-REPLAY: 16384 remove receipts retain history at expiry without a separate tombstone quota | `src/daemon/db/__tests__/session-ledger.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-ledger.test.ts` | 0 | 9 | 5.5 s |  |

## t11

Run at 2026-10-29T11:14:28.803Z on commit `ebfd418c3`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-TEMP/INVALIDATE: extend src/daemon/db/__tests__/session-entries.test.ts for exact owner/root/revision, atomic budgets, opaque tokens, stale CAS and retained-ID reservations.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-TEMP: exact overlay removal publishes revision-only receipt and invalidates private staged edits | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S4-TEMP: pending removal retains shared session slot and ID reservation across roots until exact close | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S4-TEMP: removed config bytes are released immediately while runtime slot cleanup stays pending | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S4-TEMP: stale canceled forged and expired removal tokens have no publication effects | `src/daemon/db/__tests__/session-entries.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-entries.test.ts` | 0 | 9 | 2.3 s |  |

## t12

Run at 2026-10-29T11:24:27.864Z on commit `cb3e917ee`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-TEMP-REPLAY/NO-PERSIST/STATE: extend src/daemon/db/__tests__/session-owner.test.ts and src/daemon/db/__tests__/session-cleanup.test.ts for retry, expiry/end/resume/restart and zero persistent-port access.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-NO-PERSIST: temporary state and retry use only exact owner receipts without registry keychain or file ports | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S4-STATE: resume preserves temporary receipt truth but expiry end and a new epoch revoke it | `src/daemon/db/__tests__/session-owner.test.ts` |
| pass | CM-S4-STATE: temporary cleanup retry survives resume privately but cannot reply through a revoked generation | `src/daemon/db/__tests__/session-cleanup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-cleanup.test.ts` | 0 | 5 | 37.1 s |  |
| `src/daemon/db/__tests__/session-owner.test.ts` | 0 | 13 | 4 s |  |

## t13

Run at 2026-10-29T11:33:11.932Z on commit `2256f0d8e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-INPUT/RPC: extend src/daemon/db/__tests__/connection-management-rpc.test.ts and src/daemon/db/__tests__/connection-session-rpc.test.ts for both scopes, malformed requests, unverified MCP and explicit-saved downgrade refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-INPUT/RPC: saved removal requires sc6 and accepts only exact authenticated ticket requests | `src/daemon/db/__tests__/connection-management-rpc.test.ts` |
| pass | CM-S4-INPUT/RPC: temporary socket removal enforces sc6 owner audience root and no saved downgrade | `src/daemon/db/__tests__/connection-session-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-management-rpc.test.ts` | 0 | 7 | 2 s |  |
| `src/daemon/db/__tests__/connection-session-rpc.test.ts` | 0 | 4 | 0.9 s |  |

## t14

Run at 2026-10-29T11:36:59.958Z on commit `b8e836d4e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-RPC/GATE: extend src/daemon/threads/__tests__/method-class.test.ts and actual socket fixtures for handler/allowlist/main routing, old-feature refusal and compiled/source agreement.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-RPC/GATE: source and freshly compiled removal methods agree with handlers and main ownership | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | CM-S4-RPC/GATE: actual sockets keep both removal scopes on main and refuse absent feature without worker fallback | `src/daemon/db/__tests__/connection-session-rpc.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 2 | 0.8 s |  |
| `src/daemon/db/__tests__/connection-session-rpc.test.ts` | 0 | 5 | 1.2 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 7 | 1 s |  |

## t15

Run at 2026-10-29T11:45:03.414Z on commit `aa9bebe00`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-BUSY: extend src/daemon/db/__tests__/draft-preparation.test.ts and src/daemon/db/__tests__/probe-disposal.test.ts for full edit-probe lease lifetime through child cancellation/timeout/drain.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-F1: production metadata admission precedes secrets and prepares only selected owned credentials without effects | `src/daemon/db/__tests__/draft-preparation.test.ts` |
| pass | CM-S4-BUSY: actual temporary edit probe holds its revision through cancel timeout late result and child failure drain | `src/daemon/db/__tests__/probe-disposal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/draft-preparation.test.ts` | 0 | 1 | 1.7 s |  |
| `src/daemon/db/__tests__/probe-disposal.test.ts` | 0 | 2 | 11.8 s |  |

## t16

Run at 2026-10-29T11:51:40.651Z on commit `bf60275a8`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-BUSY/INVALIDATE/RETIRE/RACES: controlled callback/iterator/constructor and both-owner interleavings; use explicit fixture barriers and TAP child reporting.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-RACES: saved remove update remove and acquire interleave at the existing writer barrier | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-REPLAY: ambiguous rename and fsync failures retain the barrier until same-ticket classification | `src/daemon/db/__tests__/saved-management.test.ts` |
| pass | CM-S4-RACES: temporary remove replay and cleanup create races invalidate access before paused close | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: full callback pins revision through multiple calls busy update and retained-view revocation | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: abandoned late iterator retains its lease and closes before end completes | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S3-LEASE: late driver construction cannot publish after end and end awaits disposal | `src/daemon/db/__tests__/session-resources.test.ts` |
| pass | CM-S4-RETIRE: late raw construction cannot escape a removed revision and is strictly closed | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-TEMP: pending removal retains shared session slot and ID reservation across roots until exact close | `src/daemon/db/__tests__/session-entries.test.ts` |
| pass | CM-S4-BUSY: actual temporary edit probe holds its revision through cancel timeout late result and child failure drain | `src/daemon/db/__tests__/probe-disposal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 17 | 1.6 s |  |
| `src/daemon/db/__tests__/probe-disposal.test.ts` | 0 | 2 | 11.9 s |  |
| `src/daemon/db/__tests__/saved-management.test.ts` | 0 | 16 | 6.2 s |  |
| `src/daemon/db/__tests__/session-entries.test.ts` | 0 | 9 | 5.2 s |  |
| `src/daemon/db/__tests__/session-resources.test.ts` | 0 | 10 | 1.8 s |  |

## t17

Run at 2026-10-29T11:57:57.836Z on commit `fceafd0ec`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: CM-S4-SOURCE: extend src/daemon/db/__tests__/session-service-isolation.test.ts and existing disposable service fixtures for real PostgreSQL/Redis data preservation and actual connection closure; unavailable prerequisites remain pending.**

Reported by the builder, not run by the gate: **pass**. Evidence: Commit fceafd0ec; docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/evidence/t17/result.json and full-relevant-pass.tap: Node22 actual PostgreSQL 17.10 + Redis 7.4, 2 tests pass, zero fail/skip/TODO. Both-scope SQL/KV remove, real SDK close failure/retry, live observer drain, source preservation and same-ID recreation. Original startup/joined-attempt failures retained. SQL Server, foundation/provider and client prerequisites remain pending; shipped gates unchanged.

## t18

Run at 2026-10-29T12:09:06.306Z on commit `e9233ca80`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: CM-S4-FILES/NO-PERSIST: extend src/daemon/db/__tests__/session-file-matrix.test.ts and src/daemon/db/__tests__/session-file-resources.test.ts for actual native/converted source hashes, private runtime cleanup and filesystem canaries.**

Reported by the builder, not run by the gate: **pass**. Evidence: Commits 3dbb2876a and e9233ca80; docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/evidence/t18/result.json, source-compiled-relevant-pass.tap and node22-build.log. Fresh Node22 build; affected suites 4/4 pass, zero fail/skip/TODO. Actual source + compiled modules, ten supported native/converted kinds and CSV directories in both scopes, hashes/poisoned source mutation ports, 11 temporary and 11 saved actual closes per mode, private DuckDB zero counters/no spill/unchanged temporary state tree. Arrow/Feather negative controls retained. Original filesystem notification assertion failure preserved; no release activation.

## t19

Run at 2026-10-29T12:16:24.135Z on commit `99b3e402c`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: CM-S4-AFFINITY: production analysis/tool/probe owner-affinity acceptance in single-thread and threads-enabled modes, or explicit pre-use refusal; unsupported architecture remains pending.**

Reported by the builder, not run by the gate: **pass**. Evidence: Commit 99b3e402c; S004/evidence/t19/result.json, production-refusal-pass.tap and analyzer-result.json. Node22 real single-thread and threads-enabled daemons: 2 tests pass, no skips. Both modes advertise no sc6 and refuse removal/private analysis/step/tool/edit-probe admission before use. This is refusal proof only: positive all-consumer Saved worker lease identity explicitly remains pending and release-blocking. Existing main/session callback/iterator/constructor/probe positive evidence stays scoped to t15/t16. No architecture or shipped gate changes; original 115-byte socket-path startup failure retained.

## t20

Run at 2026-10-29T12:30:29.035Z on commit `9e6c3cc25`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-PRIVACY/NO-PERSIST: extend src/daemon/db/__tests__/session-driver-logs.test.ts and src/daemon/db/__tests__/composed-probe-logs.test.ts with fixed SDK/journal canaries and poisoned persistence ports.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-PRIVACY/NO-PERSIST: source and compiled removal replies and rotating logs hide SDK journal and capability canaries | `src/daemon/db/__tests__/session-driver-logs.test.ts` |
| pass | CM-S4-PRIVACY/NO-PERSIST: composed removal keeps temporary persistence poisoned and owner loss unrecoverable | `src/daemon/db/__tests__/composed-probe-logs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/composed-probe-logs.test.ts` | 0 | 2 | 4.4 s |  |
| `src/daemon/db/__tests__/session-driver-logs.test.ts` | 0 | 4 | 8.5 s |  |
