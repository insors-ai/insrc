<!-- insrc:artifact TESTS-dc557863fa52ecf5-s1 -->

# Tests: dc557863fa52ecf5 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 26 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T11:26:05.830Z on commit `ef63d9b9a`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/panels/__tests__/detail-renderers.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source-scan: the webview bootstraps post only the sanctioned message shapes (closed set) | `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` |
| pass | editing the ghHost row of the rendered tracker section posts repoTrackerWrite with repoPath, key and value | `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` |

**unit: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VS Code rows equal the shared catalog fixture and a new row appears | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |
| pass | Tracker validates catalog values and rechecks selection and registration after consent | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |
| pass | Tracker escapes catalog and setting text and degrades without removing model controls | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |

**unit: vscode-plugin/src/panels/__tests__/webview-host.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Tracker writes require the active repo and current rendered document | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Story s3: a throwing tracker write sink is caught and logged; errors never reach the webview | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | a delayed repo render never replaces the current selection | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Repo Configuration paints model controls while Tracker and Providers are still loading | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: vscode-plugin/src/workspace/__tests__/activation.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S007 sc9: extension.ts wires the repo renderer + the consent-gated per-repo write over the shared sc8 gateway | `vscode-plugin/src/workspace/__tests__/activation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` | 0 | 11 | 0.5 s |  |
| `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` | 0 | 3 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 43 | 0.6 s |  |
| `vscode-plugin/src/workspace/__tests__/activation.test.ts` | 0 | 8 | 0.4 s |  |

## t2

Run at 2026-11-08T11:53:32.753Z on commit `8217afd2d`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |
| pass | approval-subscribe.test.ts: a cancel frame closes the notification and the stream is reopened after a restart | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |
| pass | approval-subscribe.test.ts: the extension attaches the prompter and shows Approve and Decline | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |
| pass | approval-subscribe.test.ts: a long call keeps its length in the text, the details hold the whole call, and a late answer is reported | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |
| pass | router: approval subscriptions leave Tracker reads unblocked and answers can finish a pending request | `src/daemon/threads/__tests__/router-session.test.ts` |

**unit: Native notifier adapter Details, dismissal and stale-click cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native approval notifier opens redacted JSON, re-prompts and returns a final decision or dismissal | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |
| pass | native approval notifier ignores a late click and never re-prompts after Details is invalidated | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 22 | 1.5 s |  |
| `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` | 0 | 6 | 1.4 s |  |

## t3

Run at 2026-11-08T10:49:42.626Z on commit `f77007caa`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/__tests__/activation.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension entry runs the settings pull, the update check and onboarding only after activation has settled | `vscode-plugin/src/__tests__/activation.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2: each of the FOUR real ledger uxDefinitions renders COMPLETELY | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | t4: EVERY one of the four real records renders UNTRUNCATED — the bound never fires on authored content | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Ollama is never a registrable provider (k4) | `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` |

**unit: vscode-plugin/src/panels/__tests__/repo-config.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderRepoConfig groups the taxonomy into open critical and closed peripheral roles | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | repo-config.test.ts: global defaults render every taxonomy role and the separate Core floor | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | the core floor renders in its own <details>/section, separate from the role groups | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/ollama-routing.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ollama-routing.test.ts: initial/resumed/follow-up/title launches are Ollama-routed; vendor launches still inherit | `vscode-plugin/src/chat/__tests__/ollama-routing.test.ts` |
| pass | ollama-routing.test.ts: vendor/default and non-Claude calls do not read Ollama configuration | `vscode-plugin/src/chat/__tests__/ollama-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/__tests__/activation.test.ts` | 0 | 15 | 0.8 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 236 | 28.3 s |  |
| `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` | 0 | 5 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/ollama-routing.test.ts` | 0 | 8 | 0.5 s |  |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 21 | 1 s |  |

## t4

Run at 2026-11-08T11:00:38.256Z on commit `f698182f9`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

named tests matched no test file: Manual Tracker read, write and native approval notification (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**smoke: node --import tsx --test --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/VS-CODE-SMOKE.md and /tmp/insrc-vs16-final.tap. Serialized full sweep at f698182f9, 1695 pass, 9 skips, 0 fail.

**smoke: VS Code extension TypeScript check**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/VS-CODE-SMOKE.md. node_modules/.bin/tsc -p vscode-plugin/tsconfig.json --pretty false exited 0.

**smoke: Manual Tracker read, write and native approval notification**

Not mapped: no test case was named for this test, and nothing was run for it.
