<!-- insrc:artifact TESTS-dc557863fa52ecf5-s1 -->

# Tests: dc557863fa52ecf5 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T13:12:24.745Z on commit `9d86fb9f5`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| pass | Tracker write outcomes refresh saved values and only accepted consent reaches the daemon | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |

**unit: vscode-plugin/src/panels/__tests__/webview-host.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Tracker writes require the active repo and current rendered document | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Story s3: a throwing tracker write sink is caught and logged; errors never reach the webview | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | a delayed repo render never replaces the current selection | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Repo Configuration paints model controls while Tracker and Providers are still loading | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Tracker stays expanded across repaints and resets when the repo changes | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: vscode-plugin/src/workspace/__tests__/activation.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S007 sc9: extension.ts wires the repo renderer + the consent-gated per-repo write over the shared sc8 gateway | `vscode-plugin/src/workspace/__tests__/activation.test.ts` |
| pass | extension wiring: the repo-config panel probes mcp.status WITH the selected repo path, so the project-layer .vibe/config.toml counts for vibe | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | gateway.test.ts: panel reads forward their deadline through the VS Code read boundary | `vscode-plugin/src/config/__tests__/gateway.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 26 | 0.5 s |  |
| `vscode-plugin/src/config/__tests__/gateway.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` | 0 | 4 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 44 | 0.5 s |  |
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

Run at 2026-11-08T13:16:40.885Z on commit `dcc0f03b3`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: node --import tsx --test --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/VS-CODE-SMOKE.md; /tmp/insrc-103-final.txfKIp/vscode.tap. Started 2026-11-08T13:13:39Z, finished 2026-11-08T13:15:18Z, after the recorded passing verdicts for t1 through t3. Serial full sweep on Node 26.5.1: 1699 pass, 9 gated skips, 0 fail.

**smoke: VS Code extension TypeScript check**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/VS-CODE-SMOKE.md; /tmp/insrc-103-final.txfKIp/vscode.tap. The vscode-bundle-catalog test ran and passed the extension typecheck.

**smoke: Manual Tracker read, write and native approval notification**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/VS-CODE-SMOKE.md. The user confirmed both manual checks passed. Only automated test coverage and verification documentation changed in response to the first review.
