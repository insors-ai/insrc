<!-- insrc:artifact TESTS-a84e610b0a910d49-s1 -->

# Tests: a84e610b0a910d49 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T09:17:31.517Z on commit `476719490`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: any subset of the four document roles decodes and a fifth key is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: any subset of the four document roles decodes and a fifth key is refused | `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: a packet, checkpoint and review summary written before the change still decode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: a packet, checkpoint and review summary written before the change still decode | `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-11-03T09:21:55.800Z on commit `93bd88c86`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a Plan route is validated with the same documents, units and messages as without a route**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a Plan route is validated with the same documents, units and messages as without a route | `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: an LLD-only, an ISSUE-only and a no-document route accept exactly their set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-documents.test.ts: an LLD-only, an ISSUE-only and a no-document route accept exactly their set | `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: the story role is required only when a DEF exists**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-documents.test.ts: the story role is required only when a DEF exists | `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a document set that differs from the route, or a document of the wrong workflow, epicHash, issueHash or story, is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a document set that differs from the route, or a document of the wrong workflow, epicHash, issueHash or story, is refused | `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` | 0 | 4 | 1 s |  |

## t3

Run at 2026-11-03T09:24:10.156Z on commit `ce8e0bb81`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: each Plan-less route derives one unit with the BUILD task id and checks from its design record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: each Plan-less route derives one unit with the BUILD task id and checks from its design record | `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: the unit size follows the number of selected changed files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: the unit size follows the number of selected changed files | `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: a Plan-less route with a multi-task BUILD is refused and all changes and tests attribute to the one unit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: a Plan-less route with a multi-task BUILD is refused and all changes and tests attribute to the one unit | `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` | 0 | 3 | 1.2 s |  |

## t4

Run at 2026-11-03T10:55:14.119Z on commit `814a8ce0f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story's stored artifacts and refuses a packet that does not match it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story's stored artifacts and refuses a packet that does not match it | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route | `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` |

**integration: src/daemon/__tests__/task-review-plan-path.test.ts: the plan-path identity check rejects a wrong plan document and is skipped when the packet has none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/task-review-plan-path.test.ts: the plan-path identity check rejects a wrong plan document and is skipped when the packet has none | `src/daemon/__tests__/task-review-plan-path.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/task-review-plan-path.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` | 0 | 3 | 0.9 s |  |

## t5

Run at 2026-11-03T09:33:03.516Z on commit `1f1584ab8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the advertised packet schema accepts the four optional roles and matches the stored schema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the advertised packet schema accepts the four optional roles and matches the stored schema | `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the guide text states the documents per route**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the guide text states the documents per route | `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` | 0 | 2 | 0.8 s |  |

## t6

Run at 2026-11-03T09:43:33.478Z on commit `c2b737bf9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a passing whole-story review of a derived unit lets inspectTaskCompletion pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a passing whole-story review of a derived unit lets inspectTaskCompletion pass | `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a task-only, non-passing or stale-fingerprint derived-unit review is withheld**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a task-only, non-passing or stale-fingerprint derived-unit review is withheld | `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` | 0 | 2 | 0.7 s |  |
