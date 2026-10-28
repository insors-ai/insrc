<!-- insrc:artifact TESTS-c66d49bb81925886-s1 -->

# Tests: c66d49bb81925886 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 79 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T13:10:34.571Z on commit `fddd2fc66`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/usage/__tests__/schema-contract.test.ts: compiler-backed valid/invalid v1 discriminator fixtures and HLD sc1/sc2 plus AMD-1 type compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | types preserve HLD contracts and reject invalid v1 payloads | `src/workflow/usage/__tests__/schema-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/schema-contract.test.ts` | 0 | 1 | 0.8 s |  |

## t2

Run at 2026-10-26T13:31:05.182Z on commit `8d729ba23`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/schema-contract.test.ts: closed logical schema and in-memory typed Avro round-trips, null defaults, exact counters and illegal payload cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | logical and typed Avro schemas preserve v1 payloads and reject illegal shapes | `src/workflow/usage/__tests__/schema-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/schema-contract.test.ts` | 0 | 2 | 0.9 s |  |

## t3

Run at 2026-10-26T16:37:57.126Z on commit `5805ea1dc`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/identity.test.ts: source equality versus server metadata, owner/payload conflicts, canonical key order and unsafe getter/prototype/cycle/Unicode/limit inputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | canonical source identity preserves capture data and ignores only service metadata | `src/workflow/usage/__tests__/identity.test.ts` |
| pass | canonical traversal rejects unsafe data without invoking hooks | `src/workflow/usage/__tests__/identity.test.ts` |
| pass | canonical identity enforces byte, depth, node and reference limits | `src/workflow/usage/__tests__/identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/identity.test.ts` | 0 | 3 | 0.4 s |  |

## t4

Run at 2026-10-26T16:46:17.470Z on commit `f9560ee7a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/validation.test.ts: closed shape/version/digest/counter/quality rules and scope evidence refusals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | record validation rejects unsafe shapes, versions, identities and digests without invoking hooks | `src/workflow/usage/__tests__/validation.test.ts` |
| pass | counter and quality validation preserves unknown, pending, reported and estimated distinctions | `src/workflow/usage/__tests__/validation.test.ts` |
| pass | closed scope evidence rejects fabricated completeness, bad references and inconsistent bindings | `src/workflow/usage/__tests__/validation.test.ts` |

**unit: src/workflow/usage/__tests__/source-capabilities.test.ts: malformed/unqualified declarations cannot claim native completeness**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | capability declarations reject malformed or unqualified native completeness | `src/workflow/usage/__tests__/source-capabilities.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/source-capabilities.test.ts` | 0 | 1 | 0.5 s |  |
| `src/workflow/usage/__tests__/validation.test.ts` | 0 | 3 | 0.5 s |  |

## t5

Run at 2026-10-26T16:50:44.645Z on commit `e1cca2897`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/attribution.test.ts: full positive/negative charged-subject table, context inheritance and non-additive reference cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mandatory activity table charges each exact authored or reviewed subject | `src/workflow/usage/__tests__/attribution.test.ts` |
| pass | attribution refuses missing or conflicting review, task and BUILD evidence | `src/workflow/usage/__tests__/attribution.test.ts` |
| pass | workflow context inherits explicit parent binding and never falls back to a root or summary | `src/workflow/usage/__tests__/attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/attribution.test.ts` | 0 | 3 | 0.5 s |  |

## t6

Run at 2026-10-26T17:00:37.153Z on commit `b12cf9513`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/reducer.test.ts: bounded unique/input accounting, exact bigint metrics and known/estimated/pending/unavailable partitions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded reduction deduplicates delivery while counting all input work and exact bigint metrics | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | known zero, partial counters, estimates, pending, interrupted, unavailable and missing remain distinct | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | event and call identity conflicts cannot produce a trusted contribution or mutate input | `src/workflow/usage/__tests__/reducer.test.ts` |

**integration: src/workflow/usage/__tests__/domain-contract.test.ts: truncated closure, iterator failure/cancellation, duplicate flood and no successful resource-truncated total**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | truncated closure and malformed evidence never assert a complete measured total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | iterator failure and cancellation reject without returning a successful partial total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | duplicate floods count every row and byte and never return truncated success | `src/workflow/usage/__tests__/domain-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/domain-contract.test.ts` | 0 | 3 | 1.8 s |  |
| `src/workflow/usage/__tests__/reducer.test.ts` | 0 | 3 | 0.8 s |  |

## t7

Run at 2026-10-26T17:20:41.560Z on commit `77fbd6b35`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/reconciliation.test.ts: replacement corrections, forks/cycles/missing refs, aggregate fallback/decomposition and stale/new candidate invalidation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | replacement correction heads are deterministic and missing forked cyclic or cross-call references stay unresolved | `src/workflow/usage/__tests__/reconciliation.test.ts` |
| pass | aggregate fallback and qualified complete-leaf basis never add overlapping observations | `src/workflow/usage/__tests__/reconciliation.test.ts` |
| pass | new candidates and stale corrected heads invalidate reconciliation until an explicit successor names current heads | `src/workflow/usage/__tests__/reconciliation.test.ts` |

**unit: src/workflow/usage/__tests__/reducer.test.ts: shuffled complete groups and repeated delivery retain deterministic basis/totals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded reduction deduplicates delivery while counting all input work and exact bigint metrics | `src/workflow/usage/__tests__/reducer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/reconciliation.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/usage/__tests__/reducer.test.ts` | 0 | 3 | 0.5 s |  |

## t8

Run at 2026-10-26T17:29:12.589Z on commit `74c4a0a90`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/reducer.test.ts: cumulative selected interval, reference-only cross-invocation baseline, common-baseline overlap, resets and model/session mismatches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cumulative selected intervals exclude baselines and intermediate frames including prior-invocation references | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | cumulative common-baseline endpoints require reconciliation and never add overlapping deltas | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | cumulative resets unknown buckets unqualified sessions and model mismatches never fabricate measured deltas | `src/workflow/usage/__tests__/reducer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/reducer.test.ts` | 0 | 6 | 0.6 s |  |

## t9

Run at 2026-10-26T17:57:04.992Z on commit `d44b38dc9`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/transfer-state.test.ts: same-root single commitment, cross-root phase closure, pending/conflicting owner versions and typed effectiveOwners provenance/replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | same-root single commitment changes effective artifact once and preserves immutable capture provenance | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | cross-root commitment requires matching phases and complete ownership proof; pending retains committed owner | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | transfer forks cycles wrong versions and conflicting intent IDs produce typed unresolved ownership | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | pending successors retain the latest committed owner and equivalent commit aliases advance once | `src/workflow/usage/__tests__/transfer-state.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/transfer-state.test.ts` | 0 | 4 | 0.6 s |  |

## t10

Run at 2026-10-26T17:58:53.436Z on commit `0b3556bc6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/usage/__tests__/source-capabilities.test.ts: version/source-evidence survey, Ollama absent counters, CLI aggregate/cumulative/unknown leaf and explicitly synthetic external-host cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | version/source-evidence survey distinguishes inspected wrappers from synthetic external-host cases | `src/workflow/usage/__tests__/source-capabilities.test.ts` |
| pass | Ollama source final missing-counter warm-up and zero cases preserve absent metrics without estimates | `src/workflow/usage/__tests__/source-capabilities.test.ts` |
| pass | capability declarations reject malformed or unqualified native completeness | `src/workflow/usage/__tests__/source-capabilities.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/usage/__tests__/source-capabilities.test.ts` | 0 | 3 | 0.8 s |  |

## t11

Run at 2026-10-26T18:06:01.332Z on commit `323fb900a`. Tests check: **passed**. 47 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/usage/__tests__/domain-contract.test.ts: complete public domain surface, ownership/basis consistency, replay/permutation and no sibling side effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | truncated closure and malformed evidence never assert a complete measured total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | iterator failure and cancellation reject without returning a successful partial total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | duplicate floods count every row and byte and never return truncated success | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | complete public domain surface preserves ownership basis replay and additive compatibility without sibling services | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | public reducer composes correction reconciliation cumulative and transfer accounting with qualified capability evidence | `src/workflow/usage/__tests__/domain-contract.test.ts` |

**integration: src/workflow/usage/__tests__/schema-contract.test.ts: isolated /tmp compiled-output imports with no source tree and matching schema digests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | types preserve HLD contracts and reject invalid v1 payloads | `src/workflow/usage/__tests__/schema-contract.test.ts` |
| pass | logical and typed Avro schemas preserve v1 payloads and reject illegal shapes | `src/workflow/usage/__tests__/schema-contract.test.ts` |
| pass | isolated compiled-output public imports load matching schemas and round-trip records with no source tree | `src/workflow/usage/__tests__/schema-contract.test.ts` |

**unit: src/workflow/__tests__/artifact-ids.test.ts: existing canonical identity regression suite**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | make produces the stored text for every existing kind and parse returns the same key | `src/workflow/__tests__/artifact-ids.test.ts` |
| pass | parentOf walks task, tasks and diagram to story, story to epic, and stops there | `src/workflow/__tests__/artifact-ids.test.ts` |
| pass | the per-kind required and forbidden fields and the uppercase story and task form throw InvalidArtifactKeyError | `src/workflow/__tests__/artifact-ids.test.ts` |
| pass | a folder name is not parsed as an artifact id | `src/workflow/__tests__/artifact-ids.test.ts` |
| pass | stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr | `src/workflow/__tests__/artifact-ids.test.ts` |
| pass | MissingAnchorError is an InvalidArtifactKeyError | `src/workflow/__tests__/artifact-ids.test.ts` |

**integration: npm run build and the focused src/workflow/usage/__tests__/*.test.ts suite pass or unrelated baseline blockers are explicitly identified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded reduction deduplicates delivery while counting all input work and exact bigint metrics | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | known zero, partial counters, estimates, pending, interrupted, unavailable and missing remain distinct | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | event and call identity conflicts cannot produce a trusted contribution or mutate input | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | cumulative selected intervals exclude baselines and intermediate frames including prior-invocation references | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | cumulative common-baseline endpoints require reconciliation and never add overlapping deltas | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | cumulative resets unknown buckets unqualified sessions and model mismatches never fabricate measured deltas | `src/workflow/usage/__tests__/reducer.test.ts` |
| pass | mandatory activity table charges each exact authored or reviewed subject | `src/workflow/usage/__tests__/attribution.test.ts` |
| pass | attribution refuses missing or conflicting review, task and BUILD evidence | `src/workflow/usage/__tests__/attribution.test.ts` |
| pass | workflow context inherits explicit parent binding and never falls back to a root or summary | `src/workflow/usage/__tests__/attribution.test.ts` |
| pass | canonical source identity preserves capture data and ignores only service metadata | `src/workflow/usage/__tests__/identity.test.ts` |
| pass | canonical traversal rejects unsafe data without invoking hooks | `src/workflow/usage/__tests__/identity.test.ts` |
| pass | canonical identity enforces byte, depth, node and reference limits | `src/workflow/usage/__tests__/identity.test.ts` |
| pass | same-root single commitment changes effective artifact once and preserves immutable capture provenance | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | cross-root commitment requires matching phases and complete ownership proof; pending retains committed owner | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | transfer forks cycles wrong versions and conflicting intent IDs produce typed unresolved ownership | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | pending successors retain the latest committed owner and equivalent commit aliases advance once | `src/workflow/usage/__tests__/transfer-state.test.ts` |
| pass | record validation rejects unsafe shapes, versions, identities and digests without invoking hooks | `src/workflow/usage/__tests__/validation.test.ts` |
| pass | counter and quality validation preserves unknown, pending, reported and estimated distinctions | `src/workflow/usage/__tests__/validation.test.ts` |
| pass | closed scope evidence rejects fabricated completeness, bad references and inconsistent bindings | `src/workflow/usage/__tests__/validation.test.ts` |
| pass | truncated closure and malformed evidence never assert a complete measured total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | iterator failure and cancellation reject without returning a successful partial total | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | duplicate floods count every row and byte and never return truncated success | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | complete public domain surface preserves ownership basis replay and additive compatibility without sibling services | `src/workflow/usage/__tests__/domain-contract.test.ts` |
| pass | capability declarations reject malformed or unqualified native completeness | `src/workflow/usage/__tests__/source-capabilities.test.ts` |
| pass | version/source-evidence survey distinguishes inspected wrappers from synthetic external-host cases | `src/workflow/usage/__tests__/source-capabilities.test.ts` |
| pass | Ollama source final missing-counter warm-up and zero cases preserve absent metrics without estimates | `src/workflow/usage/__tests__/source-capabilities.test.ts` |
| pass | types preserve HLD contracts and reject invalid v1 payloads | `src/workflow/usage/__tests__/schema-contract.test.ts` |
| pass | logical and typed Avro schemas preserve v1 payloads and reject illegal shapes | `src/workflow/usage/__tests__/schema-contract.test.ts` |
| pass | isolated compiled-output public imports load matching schemas and round-trip records with no source tree | `src/workflow/usage/__tests__/schema-contract.test.ts` |
| pass | replacement correction heads are deterministic and missing forked cyclic or cross-call references stay unresolved | `src/workflow/usage/__tests__/reconciliation.test.ts` |
| pass | aggregate fallback and qualified complete-leaf basis never add overlapping observations | `src/workflow/usage/__tests__/reconciliation.test.ts` |
| pass | new candidates and stale corrected heads invalidate reconciliation until an explicit successor names current heads | `src/workflow/usage/__tests__/reconciliation.test.ts` |
| pass | public reducer composes correction reconciliation cumulative and transfer accounting with qualified capability evidence | `src/workflow/usage/__tests__/domain-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-ids.test.ts` | 0 | 6 | 0.3 s |  |
| `src/workflow/usage/__tests__/attribution.test.ts` | 0 | 3 | 0.5 s |  |
| `src/workflow/usage/__tests__/domain-contract.test.ts` | 0 | 5 | 1.6 s |  |
| `src/workflow/usage/__tests__/identity.test.ts` | 0 | 3 | 0.5 s |  |
| `src/workflow/usage/__tests__/reconciliation.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/usage/__tests__/reducer.test.ts` | 0 | 6 | 0.6 s |  |
| `src/workflow/usage/__tests__/schema-contract.test.ts` | 0 | 3 | 9.7 s |  |
| `src/workflow/usage/__tests__/source-capabilities.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/usage/__tests__/transfer-state.test.ts` | 0 | 4 | 0.5 s |  |
| `src/workflow/usage/__tests__/validation.test.ts` | 0 | 3 | 0.5 s |  |
