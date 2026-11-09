<!-- insrc:artifact PLAN-dc557863fa52ecf5-s1 -->

# Plan: STORY-dc557863fa52ecf5-s1

## Summary

**Epic:** `fix-16-pre-existing-vs-code`
**LLD run:** `wf-1794129533555-8lkc5i`
**LLD effective hash:** `814feeaf16ea...`

Restore the VS Code Tracker and approval integrations with the existing daemon contracts. Verify each implementation task with its focused tests, then run one full extension sweep and record the 16 targeted outcomes separately from unrelated failures.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Restore repository Tracker controls | M | — | — | unit: vscode-plugin/src/panels/__tests__/detail-renderers.test.ts; unit: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts; unit: vscode-plugin/src/panels/__tests__/webview-host.test.ts; unit: vscode-plugin/src/workspace/__tests__/activation.test.ts | [[c2]] [[c3]] [[c7]] |
| 2 | **`t2`** Restore daemon approvals in VS Code | M | — | — | integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts; unit: Native notifier adapter Details, dismissal and stale-click cases | [[c2]] [[c4]] [[c7]] |
| 3 | **`t3`** Repair drifted regression assertions | S | — | — | unit: vscode-plugin/src/__tests__/activation.test.ts; unit: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts; unit: vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts; unit: vscode-plugin/src/panels/__tests__/repo-config.test.ts; unit: vscode-plugin/src/chat/__tests__/ollama-routing.test.ts | [[c1]] [[c5]] [[c7]] |
| 4 | **`t4`** Verify the completed extension changes | S | — | `t1`, `t2`, `t3` | smoke: node --import tsx --test --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'; smoke: VS Code extension TypeScript check; smoke: Manual Tracker read, write and native approval notification | [[c1]] [[c5]] [[c6]] [[c7]] |

### 1.1 TASK-dc557863fa52ecf5-s1-t1 — Restore repository Tracker controls

Consume the catalog and repo settings gateway in the existing selected-repo configuration panel. Wire the host write dispatch through consent and preserve the model and provider controls.

**Acceptance checks:**
- Render escaped catalog-derived values, notes and sources. Only local fields accept editing and unavailable Tracker reads preserve the rest of the panel.
- Reject forged, invalid, unregistered and stale selection writes before mutation, including after consent. Honor scalar and clear semantics and reload authoritative values for the active repo.
- Repair all six affected Tracker renderer, catalog, dispatch and activation cases.
- Verify boolean true, false and clear, invalid enum choices, escaped catalog and payload values, unavailable policy rows and reads completing after a repo switch.

### 1.2 TASK-dc557863fa52ecf5-s1-t2 — Restore daemon approvals in VS Code

Attach one existing prompter per activation and implement the native notification adapter. Modernize the isolated IPC fixture.

**Acceptance checks:**
- Approve and Decline answer active requests once. Show details opens redacted JSON and re-prompts while live. Dismissal, cancel, disconnect and disposal guard against stale clicks.
- Verify reconnect and teardown with the current server constructor and real streaming approval RPCs. Repair all four affected cases.
- Cancel, disconnect and dispose while Details opens, and verify no re-prompt or answer. Surface stale answer rejection.

### 1.3 TASK-dc557863fa52ecf5-s1-t3 — Repair drifted regression assertions

Update only coverage that drifted from current fixture identities, taxonomy, settings activation, or provider routing.

**Acceptance checks:**
- Resolve all four UX fixtures and keep rendering and truncation checks. Derive model role groups and counts from taxonomy and verify Core floor separately.
- Verify settings pull and migration ordering. Check live Claude/Codex/Vibe registry membership independently of Claude-to-Ollama routing. Repair the six remaining targeted cases.
- Use LLD-85e6a58693579b6d-s1.json and LLD-7c219c7471d79496-s1.json. Report any missing fixture by ID.

### 1.4 TASK-dc557863fa52ecf5-s1-t4 — Verify the completed extension changes

After all implementation tasks have passed focused checks, run the extension typecheck and full VS Code sweep and record evidence.

**Acceptance checks:**
- Run the full extension sweep only after t1 through t3. Record Node version, command and outcomes for all 16 target cases. Report unrelated failures separately, including the three original isolated-rerun passes if they recur.
- Record manual Tracker and approval smoke status if an IDE is available. Retain rollout and rollback through extension replacement and host reload without a data rewrite.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Repo Configuration renderer and webview host | `t1` |
| Activation settings ordering and migration | `t3` |
| Role taxonomy groups and floor | `t3` |
| Four UX ledger fixtures and truncation | `t3` |
| Provider registry plus separate Ollama routing | `t3` |
| Subscribe, present, answer, cancel, reconnect, dispose and no duplicate answers | `t2` |
| VS Code extension tests and TypeScript | `t4` |
| Manual Tracker selection/write and approval notification checks when an IDE is available | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#summary`
- **[[c2]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#2-contract-details`
- **[[c3]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#4-error-paths`
- **[[c4]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#3-diagrams`
- **[[c5]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#5-test-strategy` — "Acceptance mapping"
- **[[c6]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#6-migration`
- **[[c7]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/LLD.md#5-test-strategy` — "Test levels and subjects"
