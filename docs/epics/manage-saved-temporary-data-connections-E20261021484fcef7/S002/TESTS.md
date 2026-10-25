<!-- insrc:artifact TESTS-484fcef7efaf229e-s2 -->

# Tests: 484fcef7efaf229e s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 58 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T19:47:18.477Z on commit `dcce991fd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S2-A1: strict public and private test payloads reject malformed unknown oversized and spoofed identity or runtimeAuth fields; exact sanitized correlation shape.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A1: strict public test requests reject malformed oversized and forged fields | `src/shared/__tests__/draft-test-wire.test.ts` |
| pass | CM-S2-A1: private worker messages validate auth and exact nonce correlation without raw errors | `src/shared/__tests__/draft-test-wire.test.ts` |
| pass | CM-S2-A1: result validator admits only fixed sanitized response shapes | `src/shared/__tests__/draft-test-wire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/draft-test-wire.test.ts` | 0 | 3 | 0.6 s |  |

## t2

Run at 2026-10-25T05:57:35.948Z on commit `330f3e107`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A2: fresh compiled and tsx worker logging bootstrap performs zero directory config log or output writes with canaries, preserving standard logger modes.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A2: fresh compiled and tsx probe loggers perform no config directory or output writes | `src/shared/__tests__/probe-worker-logger.test.ts` |
| pass | CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle | `src/daemon/db/__tests__/probe-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/probe-worker.test.ts` | 0 | 3 | 13.8 s |  |
| `src/shared/__tests__/probe-worker-logger.test.ts` | 0 | 1 | 2.4 s |  |

## t3

Run at 2026-10-24T19:54:39.027Z on commit `1a97d3cd4`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-E1: activation and probes resolve relative file SQLite URL and schema paths from another cwd identically; reject outside-root or missing paths without writes.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-E1: activation and probe runtime paths agree across cwd SQLite URLs and pinned families without writes | `src/daemon/db/__tests__/runtime-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/runtime-config.test.ts` | 0 | 1 | 1.6 s |  |

## t4

Run at 2026-10-24T19:59:45.522Z on commit `08ac7fa6a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-F1: production metadata admission rejects missing stale duplicate and drifted drafts before any keychain call; valid Keep Replace Clear only reads owned target with zero pool reload or persistence.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-F1: production metadata admission precedes secrets and prepares only selected owned credentials without effects | `src/daemon/db/__tests__/draft-preparation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/draft-preparation.test.ts` | 0 | 1 | 1.8 s |  |

## t5

Run at 2026-10-25T06:58:09.501Z on commit `5758f5fbc`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-E2: Dynamo test and activation use same environment session-token and profile identity through private auth IPC; late expired rejected or malformed auth cannot fall back or leak.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-E2: Dynamo activation and private auth IPC preserve environment token and profile identity without fallback | `src/daemon/db/__tests__/dynamo-identity.test.ts` |
| pass | CM-S2-A9: parent AWS identity reaches actual isolated workers for environment and profile sources without fallback | `src/daemon/db/__tests__/dynamo-identity.test.ts` |
| pass | CM-S2-E2: actual workers reject missing malformed or expired Dynamo auth without fallback or canary output | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-B1: supervisor bounds preparation capacity cancellation and late spawn with true drain | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/draft-test-supervisor.test.ts` | 0 | 6 | 32.1 s |  |
| `src/daemon/db/__tests__/dynamo-identity.test.ts` | 0 | 2 | 1.4 s |  |
| `src/daemon/db/__tests__/probe-worker.test.ts` | 0 | 5 | 18.6 s |  |

## t6

Run at 2026-10-24T20:05:26.850Z on commit `c12a0d16a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A3: postgres cockroachdb mysql mariadb await SELECT1 and fail unreachable or bad-auth after successful lazy construction; close completes without schema discovery.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A3: registered SQL probes authenticate and await SELECT1 rather than lazy construction | `src/daemon/db/__tests__/sql-draft-probes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/sql-draft-probes.test.ts` | 0 | 1 | 0.7 s |  |

## t7

Run at 2026-10-25T07:30:23.557Z on commit `a26c1b89b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A4: sqlite mssql oracle clickhouse perform actual read-only probes, refuse unavailable sources, and dispose; SQLite never creates a missing database.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A4: SQLite and ClickHouse await readonly probes and reject missing or inaccessible sources | `src/daemon/db/__tests__/remaining-sql-probes.test.ts` |
| pass | CM-S2-A4: MSSQL and Oracle SDK-boundary probes await execution and release connections on failure | `src/daemon/db/__tests__/remaining-sql-probes.test.ts` |
| pass | CM-S2-A4: Oracle actual service authenticates SELECT1 and closes without exposing database rows | `src/daemon/db/__tests__/oracle-live-probe.test.ts` |
| pass | CM-S2-A4: ClickHouse actual service authenticates SELECT1 and rejects invalid or unavailable connections | `src/daemon/db/__tests__/clickhouse-live-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/clickhouse-live-probe.test.ts` | 0 | 1 | 5.1 s |  |
| `src/daemon/db/__tests__/oracle-live-probe.test.ts` | 0 | 1 | 24.3 s |  |
| `src/daemon/db/__tests__/remaining-sql-probes.test.ts` | 0 | 2 | 1 s |  |

## t8

Run at 2026-10-25T04:54:59.098Z on commit `5599a6365`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A5: redis valkey keydb explicitly connect and ping and MongoDB pings; construction alone cannot succeed unreachable or bad credentials.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A5: Redis aliases and MongoDB authenticate real readonly probes and reject bad credentials or closed ports | `src/daemon/db/__tests__/redis-mongo-probes.test.ts` |
| pass | CM-S2-A5: an established silent Redis endpoint cannot hang PING or QUIT cleanup | `src/daemon/db/__tests__/redis-mongo-probes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/redis-mongo-probes.test.ts` | 0 | 2 | 25.7 s |  |

## t10

Run at 2026-10-25T06:20:41.814Z on commit `9215532f4`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A7: all native and converted file kinds load actual private readers before reachable; malformed sources fail and empty valid sheets succeed without cache spill INSTALL logs or source writes.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A7: all file probe aliases load owned readers with actual targets and no persistent effects | `src/daemon/db/__tests__/file-draft-probes.test.ts` |
| pass | CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: actual private resource close is awaited and cleanup failures cannot produce reachable | `src/daemon/db/__tests__/probe-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/file-draft-probes.test.ts` | 0 | 1 | 1.4 s |  |
| `src/daemon/db/__tests__/probe-worker.test.ts` | 0 | 5 | 19.2 s |  |

## t9

Run at 2026-10-25T05:59:31.026Z on commit `330f3e107`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A6: cassandra nats dynamodb etcd memcached await minimal actual operations with failure sanitization, no writes or exposed data, and deterministic close.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A6: Cassandra NATS etcd and Memcached perform actual readonly server probes and close | `src/daemon/db/__tests__/other-kv-probes.test.ts` |
| pass | CM-S2-A6: Dynamo probe sends only authenticated ListTables Limit1 and exposes no table data | `src/daemon/db/__tests__/other-kv-probes.test.ts` |
| pass | CM-S2-A6: Memcached absent credentials stay cleared despite ambient SDK environment | `src/daemon/db/__tests__/other-kv-probes.test.ts` |
| pass | CM-S2-A9: parent AWS identity reaches actual isolated workers for environment and profile sources without fallback | `src/daemon/db/__tests__/dynamo-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/dynamo-identity.test.ts` | 0 | 2 | 1.7 s |  |
| `src/daemon/db/__tests__/other-kv-probes.test.ts` | 0 | 3 | 70.3 s |  |

## t11

Run at 2026-10-25T05:53:26.114Z on commit `330f3e107`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S2-F2: unary complete seal and drain are once-only; registered pending work survives timeout reply and signal abort until cleanup, with internal-only completion.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-F2: completion seals once while aborted admitted work retains drain until cleanup | `src/daemon/__tests__/request-lifetime.test.ts` |
| pass | CM-S2-F2: direct unary dispatch preserves internal completion after disconnect and delivery failure | `src/daemon/__tests__/request-lifetime.test.ts` |
| pass | CM-S2-F2: a timeout reply completes while registered cleanup remains pending after abort | `src/daemon/__tests__/request-lifetime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/request-lifetime.test.ts` | 0 | 3 | 0.6 s |  |

## t12

Run at 2026-10-25T05:54:10.229Z on commit `330f3e107`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-G1: local lifecycle projects to cloneable channel identity without promises signals callbacks; remote completion and stream behavior remain compatible.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-G1: production router projects cloneable identity and completes remote reply error and queued cancellation | `src/daemon/threads/__tests__/local-lifetime.test.ts` |
| pass | CM-S2-G1: routed streams retain frame cancellation behavior and crashed unary lifetimes complete | `src/daemon/threads/__tests__/local-lifetime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/local-lifetime.test.ts` | 0 | 4 | 0.8 s |  |

## t13

Run at 2026-10-25T05:55:10.707Z on commit `330f3e107`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-G2: production maintenance holds and router activity span completed plus drained; timeout disconnect refusal queued cancel acquisition failure and unknown handler release exactly once.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-G2: real maintenance ownership and activity retain admitted drain and release every non-admitted path | `src/daemon/threads/__tests__/local-lifetime.test.ts` |
| pass | CM-S2-G2: real socket disconnect after admission retains timeout cleanup maintenance and activity | `src/daemon/threads/__tests__/local-lifetime.test.ts` |
| pass | CM-S2-F2: a timeout reply completes while registered cleanup remains pending after abort | `src/daemon/__tests__/request-lifetime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/request-lifetime.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/threads/__tests__/local-lifetime.test.ts` | 0 | 4 | 0.6 s |  |

## t14

Run at 2026-10-25T06:59:47.613Z on commit `5758f5fbc`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A8: fresh compiled and development one-shot workers admit exactly29 probe kinds through private IPC, await actual probe and cleanup, and reject malformed startup without logging credentials.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: source and compiled private IPC admit all registered kinds and reject unlisted kinds | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: cleared PostgreSQL credentials cannot fall back to HOME pgpass in either worker mode | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: actual private resource close is awaited and cleanup failures cannot produce reachable | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-E2: actual workers reject missing malformed or expired Dynamo auth without fallback or canary output | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: admitted KV drivers propagate SDK disposal failures instead of reporting successful cleanup | `src/daemon/db/__tests__/probe-disposal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/probe-disposal.test.ts` | 0 | 1 | 0.8 s |  |
| `src/daemon/db/__tests__/probe-worker.test.ts` | 0 | 5 | 18.9 s |  |

## t15

Run at 2026-10-25T06:24:41.279Z on commit `9215532f4`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-B1: parent10s deadline spans preparation spawn init and close; cancel250ms grace forcibly reaps owned child, rejects repeats or over4 capacity and suppresses late spawn/replies while registered drain retains ownership.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-B1: supervisor bounds preparation capacity cancellation and late spawn with true drain | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | CM-S2-B1: real worker cleanup precedes success and ten second response keeps stalled preparation reserved | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | CM-S2-B1: disconnect cancels a real stalled worker and waits owned child reaping | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | CM-S2-B1: actual owned children enforce init and close deadlines and SIGKILL after 250ms grace | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | CM-S2-B1: a late actual worker success cannot overwrite cancellation while exit still drains | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/draft-test-supervisor.test.ts` | 0 | 6 | 32.4 s |  |

## t16

Run at 2026-10-25T07:36:17.454Z on commit `a26c1b89b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-C1: actual v2 and legacy IPC routes share trusted supervisor context and exact safe projections; owner cancellation isolated, main-daemon classification and saved-local compatibility preserved.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-C1: actual v2 legacy IPC routes share main-owned probes and isolate cancellation by socket | `src/daemon/db/__tests__/draft-test-routes.test.ts` |
| pass | CM-S2-A9: adopted saved SQL and converted file probes cross real IPC child metadata and maintenance boundaries without persistence | `src/daemon/db/__tests__/actual-probe-acceptance.test.ts` |
| pass | CM-S2-A9: composed daemon and child logs contain no source credential or data canaries | `src/daemon/db/__tests__/composed-probe-logs.test.ts` |
| pass | CM-S1-T: legacy transient construction uses profile materialization memory policy and awaited private cleanup without writes | `src/daemon/db/__tests__/owned-file-driver.test.ts` |
| pass | CM-S1-T: transient drafts cannot read another credential reference and nested owned credentials use read-only materialization | `src/daemon/db/__tests__/owned-file-driver.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/actual-probe-acceptance.test.ts` | 0 | 1 | 3.9 s |  |
| `src/daemon/db/__tests__/composed-probe-logs.test.ts` | 0 | 1 | 3.5 s |  |
| `src/daemon/db/__tests__/draft-test-routes.test.ts` | 0 | 2 | 2.1 s |  |
| `src/daemon/db/__tests__/owned-file-driver.test.ts` | 0 | 7 | 1.5 s |  |

## t17

Run at 2026-10-25T07:03:38.521Z on commit `5758f5fbc`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-C2: supervisor startup shutdown and disconnect stop admission cancel and drain owned work; capability remains disabled for absent S001 or S002 evidence and no live daemon operations run.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-C2: shutdown stops admission immediately and retains uncancelable preparation until it drains | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | release evidence remains disabled until the completed build supplies verified gates | `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` |
| pass | CM-S2-C2: actual IPC disconnect cancels owned preparation while its maintenance hold remains until drain | `src/daemon/db/__tests__/draft-test-routes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/draft-test-routes.test.ts` | 0 | 2 | 2.9 s |  |
| `src/daemon/db/__tests__/draft-test-supervisor.test.ts` | 0 | 6 | 32.1 s |  |
| `src/daemon/db/__tests__/management-maintenance-foundation.test.ts` | 0 | 5 | 0.8 s |  |

## t18

Run at 2026-10-25T07:23:32.021Z on commit `7910b8088`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S2-A9: composed actual-process SQL KV and native/converted fixtures prove Save/Test parity, zero persistent drafts, sanitized canaries, bounded cancellation and zero residual resources under real IPC and maintenance locks.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S2-A9: adopted saved SQL and converted file probes cross real IPC child metadata and maintenance boundaries without persistence | `src/daemon/db/__tests__/actual-probe-acceptance.test.ts` |
| pass | CM-S2-A9: parent AWS identity reaches actual isolated workers for environment and profile sources without fallback | `src/daemon/db/__tests__/dynamo-identity.test.ts` |
| pass | CM-S2-A8: source and compiled private IPC admit all registered kinds and reject unlisted kinds | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle | `src/daemon/db/__tests__/probe-worker.test.ts` |
| pass | CM-S2-B1: actual owned children enforce init and close deadlines and SIGKILL after 250ms grace | `src/daemon/db/__tests__/draft-test-supervisor.test.ts` |
| pass | CM-S2-A9: composed daemon and child logs contain no source credential or data canaries | `src/daemon/db/__tests__/composed-probe-logs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/actual-probe-acceptance.test.ts` | 0 | 1 | 4.2 s |  |
| `src/daemon/db/__tests__/composed-probe-logs.test.ts` | 0 | 1 | 3.9 s |  |
| `src/daemon/db/__tests__/draft-test-supervisor.test.ts` | 0 | 6 | 32.1 s |  |
| `src/daemon/db/__tests__/dynamo-identity.test.ts` | 0 | 2 | 1.6 s |  |
| `src/daemon/db/__tests__/probe-worker.test.ts` | 0 | 5 | 19.6 s |  |

## t19

Run at 2026-10-25T07:31:53.959Z on commit `a26c1b89b`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

no test files to run; reported as failed by the builder: CM-S2-SWEEP: after all S002 tasks are built run final build and full test sweep; record actual failures skips and timeouts and keep release disabled for unmet prerequisites.

**smoke: CM-S2-SWEEP: after all S002 tasks are built run final build and full test sweep; record actual failures skips and timeouts and keep release disabled for unmet prerequisites.**

Reported by the builder, not run by the gate: **fail**. Evidence: docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S002/evidence/t19-post-sweep.json; t19-regression.json; t19-clickhouse-followup.json
