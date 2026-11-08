<!-- insrc:artifact TESTS-9b04adb36cac716d-s4 -->

# Tests: 9b04adb36cac716d s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 58 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T08:14:41.970Z on commit `ce7b891ca`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U1 permanent payload integrity and digest; aggregate schemas**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | permanent payload validates exact history, party, binding, digest and version | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | host coverage diagnostics remain bounded without expanding model limitations | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | permanent history validates unfinished full prefixes before any report exists | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | permanent history validates unfinished impact selection provenance and accepted prefixes | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |

**integration: I8 full/impact 8194 limitations, >256 finding origins and bounded host diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | full and impact consolidation preserve 8194 limitations across checkpoint restart | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | impact consolidation carries more than 256 origins without weakening per-chunk findings | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` | 0 | 6 | 0.9 s |  |

## t2

Run at 2026-11-08T05:23:36.631Z on commit `870fa0c4b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: I8 exact-byte dispatch reservations, consolidation duplication, refusal and restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coordinator dispatches maximum feedback at the real ceiling and durably refuses one byte over | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | real checkpoint ceiling reserves maximum byte-valid feedback through consolidation and restart | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | encoded dispatch reservation accepts exact bound and refuses one byte below without expanding the ceiling | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | capacity refusal is durable before provider construction and does not spend retries | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | automatic retry and explicit recovery reserve capacity before charging dispatch counters | `src/workflow/review/design-review/__tests__/capacity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/capacity.test.ts` | 0 | 5 | 11.6 s |  |

## t3

Run at 2026-11-08T05:11:22.727Z on commit `6d3865ff9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U2 UTF-8 frame/journal boundaries and unknown-kind limits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | design history alone receives a bounded UTF-8 allowance in sync and async readers | `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` |

**integration: I1 deterministic-id journal crash replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deterministic history id survives append and replace crashes and rejects conflicting replay | `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` | 0 | 2 | 0.8 s |  |

## t4

Run at 2026-11-08T05:38:31.971Z on commit `6a661d6bf`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: I1 publication receipt fault recovery and zero model reruns**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | journalled publication and lost-receipt recovery preserve one exact full history without model calls | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication capacity stays pending and a raised history allowance retries persistence only | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | native review waits for durable publication and recovers failed receipt persistence without rerunning models | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication append and head-replace crashes replay the same complete history entry | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | known permanent-history minimum refuses before model work and explicitly resumes after the allowance is raised | `src/workflow/review/design-review/__tests__/publication.test.ts` |

**integration: I2 immutable baseline, exact owned delta and source mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publication refuses changed subject before write and additional edits after its exact owned delta | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | canonical edits during journal staging or log append are preserved and refuse publication | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | journalled publication and lost-receipt recovery preserve one exact full history without model calls | `src/workflow/review/design-review/__tests__/publication.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/publication.test.ts` | 0 | 7 | 1.3 s |  |

## t5

Run at 2026-11-08T06:07:40.976Z on commit `d83eecf71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U3 versioned readers and current IDE common fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | versioned readers preserve legacy shape and expose real chunk feedback through current common fields | `src/workflow/review/design-review/__tests__/readers.test.ts` |
| pass | legacy display stays unchanged and read-only across artifact content delivery and CLI | `src/workflow/review/design-review/__tests__/readers.test.ts` |
| pass | shared current IDE wire fixture preserves common fields and versioned chunk data | `src/workflow/review/design-review/__tests__/readers.test.ts` |

**integration: I6 permanent retrieval after cleanup/restart and missing locator**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh coordinator retrieves permanent pages without checkpoint, scan or provider and requires an exact artifact locator | `src/workflow/review/design-review/__tests__/readers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/readers.test.ts` | 0 | 4 | 0.9 s |  |

## t6

Run at 2026-11-08T06:47:14.831Z on commit `6d35295fc`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U4 approval applicability and truthful overrides**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal and direct design approval share permanent independent evidence and preserve idempotent approval | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | MED overrides retain the original blocked review and repeated normal approval remains idempotent | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | document changes, missing evidence and a later failed review admission cannot approve an older pass | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | active reviewer ownership excludes approval and approval fence excludes new review ownership | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | unfinished checkpoint states and missing referenced history fail closed without altering the head | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | changed authorship and workflow provenance cannot reuse independent evidence | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | document edits during publication and approval persistence fail closed through journal restart | `src/workflow/review/design-review/__tests__/persistence-fence.test.ts` |

**integration: I3 ordinary/direct lifecycle gate and actual route prerequisites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ordinary daemon and direct lifecycle approvals honor actual epic standalone and issue ancestors | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | both approval routes refuse missing or unapproved actual required ancestors | `src/workflow/review/design-review/__tests__/approval.test.ts` |
| pass | ISSUE SPEC and PLAN remain human-only approval gates through ordinary and direct routes | `src/workflow/review/design-review/__tests__/approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/approval.test.ts` | 0 | 9 | 1.4 s |  |
| `src/workflow/review/design-review/__tests__/persistence-fence.test.ts` | 0 | 1 | 0.8 s |  |

## t7

Run at 2026-11-08T08:17:29.726Z on commit `ce7b891ca`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: I4 private claims, replacement races, full-history preservation and restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval deletes only fully preserved private claims and fresh history remains readable | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | public replacements after claim and at deletion remain untouched and retain replay ownership | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | replacement immediately before claim is quarantined and restored without loss | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | crashes after claim and before deletion recover exact claims without touching replacements | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | unverified claims never clobber a replacement during no-clobber restore | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | foreign corrupt symlink unpreserved and unfinished override checkpoints are retained | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | cleanup verifies older failed attempt history as well as the final publication | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | explicit override approval retains unfinished checkpoint state truthfully | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | FIFO checkpoints and claim metadata are retained without blocking the daemon | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |

**integration: I5 cleanup concurrency, fixed lock order and foreign-scope exclusion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real coordinator start correction and publication contend with cleanup without acquiring the store queue recursively | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | actual active model work retains its artifact while another artifact in the same project progresses | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | foreign corrupt symlink unpreserved and unfinished override checkpoints are retained | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |
| pass | FIFO checkpoints and claim metadata are retained without blocking the daemon | `src/workflow/review/design-review/__tests__/cleanup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/cleanup.test.ts` | 0 | 12 | 1.7 s |  |

## t8

Run at 2026-11-08T08:21:58.741Z on commit `984a8f448`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: I7 both-party recovery/impact/provenance fixture parity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal stdio MCP and Unix IPC preserve native background work and controller connection authority | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal stdio controller failure and explicit recovery retain actual connection authority and generations | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal impact schema and IPC routing preserve authority and fresh-only coverage progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | compiled both-party publication retry mutation invalidation and truthful approval gates preserve feedback | `src/mcp/__tests__/design-review.test.ts` |

**smoke: S1 compiled normal routes and code-review regression**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compiled registered MCP and daemon qualify both parties across DEF HLD LLD publication approval cleanup and history restart | `src/mcp/__tests__/design-review.test.ts` |
| pass | compiled both-party publication retry mutation invalidation and truthful approval gates preserve feedback | `src/mcp/__tests__/design-review.test.ts` |
| pass | native adapter plus real IPC persists feedback on both routes and CLIs, and terminal resume never reruns a CLI | `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` |
| pass | both native adapters preserve feedback queued before expiry and never accept a failed checkpoint write | `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` |
| pass | shared current IDE wire fixture preserves common fields and versioned chunk data | `src/workflow/review/design-review/__tests__/readers.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: Compiled qualification is now default, not an environment assumption: host and stdio in src/mcp/__tests__/design-review.test.ts default compiled=true for every normal scenario. Current code-review smoke loads compiled CliProvider, coordinator and checkpoint modules and calls serve(...,true), which loads compiled daemon RPC/server and registers compiled Git tools. /tmp/s4-compiled-default-qualification.log: 9/9 pass. Recovery, retry exhaustion, connection authority, selective impact, publication failure/model-free retry/replay, mutation invalidation, approval refusal/override retention, successful cleanup and fresh history all exercised compiled. Exact correction snapshot 984a8f448 built successfully in isolated /tmp/insrc-s4-qualification-ce7b891ca; /tmp/s4-isolated-final-build.log. Earlier isolated all-focused 145/145 /tmp/s4-isolated-corrections-regression.log. Current IDE evidence retained: /tmp/s4-t8-ide-readers.log 4/4, /tmp/s4-jetbrains-parser-qualification.log PASS for unchanged production Kotlin parser/DTO extraction and source hashes; whole-plugin JVM build remains blocked by unrelated baseline Saved constructor issue. Synthetic fixture outputs only; live DEF qualification remains separately recorded under t9.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/design-review.test.ts` | 0 | 7 | 18 s |  |
| `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` | 0 | 2 | 3.1 s |  |
| `src/workflow/review/design-review/__tests__/readers.test.ts` | 0 | 4 | 0.8 s |  |

## t9

Run at 2026-11-08T07:22:58.481Z on commit `276949430`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: L1 installed daemon independent review, progress, permanent retrieval and human-approved cleanup**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/s4-t9-live-evidence.json. Installed daemon status confirmed a4ea9d2eebf1632ae8025dc81519387e1758be52 after user update/restart. Registered insrc_review_step reviewed existing pending sandbox DEF-0f4fedd5c524b8b6 in registered /home/subho/work/dev/insors/insrc-test, reviewId s4-t9-live-def-20261108 attempt 1. Actual Codex CliProvider gpt-6.1-sol/medium; ACK 6268ms, review 153190ms (2026-11-08T07:12:52.157Z to 07:15:25.306Z), planning plus 3 dependency-ordered chunks = 4 dispatches, 0 automatic retries. Polled meaningful progress; read all three paginated results. Final incomplete: 0 HIGH, 1 MED, 2 LOW, missing upstream citation evidence. Permanent history entry 5997490366c2061cd3c453532904fe50ec310e62604874b2d2b845c36f89c691 validated against full preservation digest and unchanged Markdown. insrc_present returned presented for DEF; user explicitly approved qualification override in chat. Registered insrc_workflow_approve at 07:21:37.160Z approved with truthful override and returned deleted:[checkpoint], retained:[], errors:[]. Checkpoint absent; registered progress now returns source:history with original incomplete/counts. A fresh compiled coordinator with provider factory throwing also retrieves history. Live hosted coverage DEF only; HLD/LLD are explicitly unverified hosted and retain T8 compiled-fixture coverage. Current code-review smoke evidence /tmp/s4-t8-final-smoke.log passed 8/8; no activation framework or raw approval IPC used.
