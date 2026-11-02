<!-- insrc:artifact TESTS-e6ddcdcb3d9cf330-s3 -->

# Tests: e6ddcdcb3d9cf330 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T11:09:02.476Z on commit `bca1429c1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Cross-session and worker/direct duplicate review-id admission starts exactly one execution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cross-session and worker/direct duplicate review-id admission starts exactly one execution | `src/workflow/code-review/task-review/__tests__/ownership.test.ts` |

**integration: Different review ids overlap with serial per-review provider calls and merged CR history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Different review ids overlap with serial per-review provider calls and merged CR history | `src/workflow/code-review/task-review/__tests__/ownership.test.ts` |

**integration: Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction | `src/workflow/code-review/task-review/__tests__/recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/ownership.test.ts` | 0 | 3 | 1.2 s |  |
| `src/workflow/code-review/task-review/__tests__/recovery.test.ts` | 0 | 5 | 3.2 s |  |

## t2

Run at 2026-11-02T11:25:40.910Z on commit `7ab11caca`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes | `src/mcp/__tests__/task-review.test.ts` |

**integration: Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity | `src/mcp/__tests__/task-review.test.ts` |
| pass | each multi-turn record phases[] equals its handler accepted set (lockstep) | `src/mcp/__tests__/schema-registry.test.ts` |
| pass | T13 current code-review guidance preserves both parties and explicit task protocol | `src/mcp/__tests__/review-rule-text.test.ts` |
| pass | T13 current code-review description routes both parties without retired protocol | `src/mcp/__tests__/review-rule-text.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/review-rule-text.test.ts` | 0 | 12 | 0.6 s |  |
| `src/mcp/__tests__/schema-registry.test.ts` | 0 | 10 | 0.6 s |  |
| `src/mcp/__tests__/task-review.test.ts` | 0 | 3 | 2 s |  |

## t3

Run at 2026-11-02T11:32:58.395Z on commit `850b4cc34`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Successful story BUILD approval removes only matching fully preserved task/story checkpoints**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Successful story BUILD approval removes only matching fully preserved task/story checkpoints | `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` |

**integration: Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence | `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` |

**integration: Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup | `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` |

**integration: Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures | `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` | 0 | 5 | 2.6 s |  |

## t4

Run at 2026-11-02T11:45:54.978Z on commit `38c9d68cd`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable**

Reported by the builder, not run by the gate: **pass**. Evidence: Node22: npm run build passed /tmp/s3-final-production-build.log; node scripts/smoke-task-review.mjs passed /tmp/s3-final-production-smoke.log. Compiled actual worker/MCP/Unix IPC and child-process restart; two overlapping independent daemon reviews, serial per-review calls, duplicate refusal including live controller owner preservation, native format failure -> pointed subsequent attempt input, no auto-resume, controller explicit resume preserving t1, disabled design review, approved BUILD cleanup deleted four matching checkpoints and retained CR, no errors. Twelve fake CLI calls only; no hosted model accuracy or actual target-test coverage claim. 71 focused tests passed /tmp/s3-final-regressions.log. Author self-review /tmp/review-s3-build-self-review.md.
