<!-- insrc:artifact LLD-dc557863fa52ecf5-s1 -->

# LLD: STORY-dc557863fa52ecf5-s1

## Summary

**Epic:** `fix-16-pre-existing-vs-code`
**HLD base run:** `wf-1794129533555-8lkc5i`
**HLD effective hash:** `814feeaf16ea...`

Restore the catalog-backed Tracker section in the registered-repo panel and attach the existing approval prompter to the VS Code extension lifecycle. One panel selection targets one registered repository. One activation owns one subscription, and the daemon broker owns request lifetime and arbitration. The remaining work repairs test fixtures and assertions against current contracts.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Diagrams](#3-diagrams)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderRepoConfig`

```typescript
renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer
```

**Parameters:**
- `deps: RepoConfigRendererDeps` — Read registered repositories, model config, and existing catalog and settings gateway results

**Returns:** `RepoConfigRenderer` — Renders selected repository model and Tracker sections

**Errors:**
- `SettingsResult failure or rejected read` when Report Tracker unavailable and preserve available model controls

**Preconditions:**
- Selected repository resolves against the registered list before settings are read

**Postconditions:**
- Catalog descriptors drive local editable and status or policy read-only rows, with escaped values and notes Existing model and provider sections stay in place. Tracker is a separate section below model controls. Each row shows its catalog label, value, source or availability, and any note. Use the catalog's scalar and enum types to choose controls [c4] [c11].
- Repo-local writes use existing consent and repo settings gateway. Revalidate selected registered repo and field before mutation, including after consent. Refresh from authoritative results The host guards repoTrackerWrite carrying repoPath, key, and value, binds the request to the active selection generation, and supplies a live generation check to the consent callback. Ignore earlier settings reads after selection changes [c3] [c4].

### 2.2 `createDaemonConfigGateway`

```typescript
createDaemonConfigGateway(client: IpcClient): ConfigGateway
```

**Parameters:**
- `client: IpcClient` — Forward typed requests to daemon-owned catalog and repository settings

**Returns:** `ConfigGateway` — Existing catalog, repoSettings, and writeRepoSetting operations

**Errors:**
- `ConfigWriteResult failure or rejected IPC` when Report reason and keep the previously authoritative values

**Preconditions:**
- Writes target an editable catalog field for the selected registered repo and have consent

**Postconditions:**
- Writes call repo.settings.set with the existing scalar-or-null value contract

### 2.3 `createApprovalPrompter`

```typescript
createApprovalPrompter(opts: { client: IpcClient; notifier: ApprovalNotifier; reconnectMs?: number }): ApprovalPrompter
```

**Parameters:**
- `opts: ApprovalPrompter options` — Supply active daemon client and native VS Code notification adapter

**Returns:** `ApprovalPrompter` — Existing start, stop, and open lifecycle

**Errors:**
- `accepted false or rejected IPC` when Use existing stale-answer or transport handling without inventing a decision

**Preconditions:**
- Extension owns one prompter for the attached client

**Postconditions:**
- Start once at activation and stop on disposal. Reconnect through existing prompter
- Show the daemon's redacted gate content [c2] [c6]. Approve and Decline answer only a currently open request. Show details opens approvalDetails(request) as JSON and offers the same choices again after the JSON opens, if still active. The notifier keeps the same pending choice and handle throughout. Dismissal resolves undefined. The close hook invalidates the handle and prevents reopening or answering after cancel, stream loss or extension disposal, even if VS Code still displays the old toast. The daemon owns expiry and first accepted answer.

### 2.4 `IpcServer`

```typescript
new IpcServer(forward: ForwardRequest, now?: () => number, socketPath?: string, ownership?: DaemonRunFileOwnership)
```

**Parameters:**
- `forward: ForwardRequest` — Test-only router for existing streaming approval RPCs

**Returns:** `IpcServer` — Real current IPC fixture on isolated socket

**Errors:**
- `Connection error` when Test fixture surfaces startup or stream failure and tears down resources

**Preconditions:**
- Fixture uses current constructor and isolated socket

**Postconditions:**
- Tests preserve subscription frames and cancellation using the existing router contract

## 3. Diagrams

- [Sequence diagram](docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/S001/sequence-diagram.html)

## 4. Error paths

**Error cases**

- **Catalog or repo settings cannot load** (recoverable)
  - Detection: IPC rejection, unsuccessful SettingsResult, or absent Tracker descriptors
  - Response: Show Tracker unavailable with reload available. Keep independently loaded controls usable and disable Tracker writes
  - User impact: Model and provider controls remain usable when their reads succeed
- **Stale or forged Tracker write** (recoverable)
  - Detection: Selected repo mismatch, absent registration, unknown or read-only catalog key, invalid scalar, or selection generation changed during consent
  - Response: Reject before IPC mutation and surface a concise explanation
  - User impact: No unexpected repository changes
- **Daemon rejects a Tracker update** (recoverable)
  - Detection: Gateway reports ok false or IPC rejects
  - Response: Report failure and reload authoritative values for the current selection
  - User impact: The panel displays the persisted state
- **Approval stream fails or answer arrives too late** (recoverable)
  - Detection: Existing stream termination or answer accepted false
  - Response: Close or invalidate stale prompts on stream loss, use existing reconnect, and report stale answer
  - User impact: A stale notification cannot authorize a request

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Repo setting is unset, or user clears a local value | Use catalog default and source semantics. Use null on the existing write contract to clear |
| Repo switch while load, consent, or write is pending | Discard stale rendering, decline writes before dispatch when selection changed, and never replace the current repo view with earlier data |
| Dismissal, Details, cancellation, expiry, or reconnect while a toast is open | Show details displays the existing redacted JSON and re-prompts only while the same request is live. The choice remains pending across Details. Dismissal sends no answer. Cancel, disconnect or disposal invalidates the handle. Any clicks from an invalidated toast are ignored. |
| No registered repositories | Keep existing empty-state behavior and issue no Tracker write or selected-repo read |

**Invariants to preserve**

- Repo registry and existing scalar-or-null settings gateway remain authoritative [[c3]]
- One broker decides acceptance, expiration and cancellation [[c6]]
- Role order and criticality are sourced from taxonomy [[c7]]
- Keep CLI provider registry and Ollama transport routing contracts intact [[c9]]

## 5. Test strategy

**Test framework:** `Node.js node:test and node:assert via tsx`

**Test levels**

- **unit** — Verify rendering, guarded dispatch and activation behavior
  - Subjects: `Repo Configuration renderer and webview host`, `Activation settings ordering and migration`, `Role taxonomy groups and floor`, `Four UX ledger fixtures and truncation`, `Provider registry plus separate Ollama routing`
- **integration** — Exercise the real approval stream against the current IPC constructor
  - Subjects: `Subscribe, present, answer, cancel, reconnect, dispose and no duplicate answers`
  - Fixtures: `Isolated Unix socket and current IpcServer forwarding adapter`
- **smoke** — Run the full extension sweep after focused verification and separate unrelated failures
  - Subjects: `VS Code extension tests and TypeScript`, `Manual Tracker selection/write and approval notification checks when an IDE is available`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Repo detail renderers, repo-fields contract, webview host and workspace activation tests. Cover editability, deny/accept/reject, repo switch, and degraded reads`, `Cover boolean true, false and clear, enum rejection, escaping, unavailable policy fields, and delayed reads completing after a repo switch.` |
| `ac2` | `Approval subscriber tests with current IPC fixture and actual extension lifecycle. Exercise cancellation, stale answers, dismissal, and reconnect`, `Exercise the native notifier adapter through Show details followed by Approve or Decline. Cancel, disconnect or dispose while JSON opens and assert no re-prompt and no answer. Verify an old toast click after invalidation is inert.` |
| `ac3` | `Both docs review panel tests explicitly resolve four current ledger records and preserve rendering and truncation checks` |
| `ac4` | `Both repo config tests derive role IDs, groups, and counts from the taxonomy and separately verify Core floor` |
| `ac5` | `Activation test verifies settings pull after activation and legacy migration after pull. Registry and Ollama routing tests verify distinct contracts` |
| `ac6` | `Nine focused files cover all 16 baseline failures. Full extension sweep and TypeScript follow the focused tests Report the three initial failures that passed isolated reruns separately if they recur. Record Node version, commands and each targeted result.` |

## 6. Migration

**State before:** The s1 capability-discovery bundle and approved issue [c1] identify missing editor integration around the repo renderer [c4], existing gateway [c3] and approval prompter [c6].

**State after:** VS Code exposes existing Tracker settings and daemon approval prompts. All 16 targeted regression cases have proving coverage.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Deploy the rebuilt VS Code extension and reload the extension host to activate restored bindings — ↩ rollbackable
2. Verify the Tracker fields for a registered repo and an approval request in a disposable test workspace — ↩ rollbackable

**Backward compat:** The extension consumes existing catalog and approval IPC contracts and repo setting persistence. Extension rollback removes the restored controls and subscriber. Intentional changes to repo settings retain normal persistence and can be cleared through the existing settings contract.

## 7. Alternatives considered

### 7.1 a1: Restore the existing editor contracts — **CHOSEN**

Restore the two missing VS Code integrations using the daemon contracts and fix drifted coverage.

Use the existing config catalog and repo-settings gateway for Tracker rows and the existing approval subscriber for daemon prompts. Keep current wire and storage contracts. Update the tests for current fixture names, taxonomy, settings activation, and registry membership.

### 7.2 a2: Retire the missing editor surfaces

Treat the missing Tracker controls and approval prompt as product removals.

Define the current VS Code panel as model and provider configuration only and delegate tool approvals and Tracker configuration to other existing clients. Align client tests and documented support with those narrower contracts.

**Rejected because:** It can refresh assertions, but would remove existing user-facing coverage without product evidence that those editor capabilities were retired.

## 8. References

- **[[c1]]** `prior-artifact` `docs/standalone/fix-16-pre-existing-vs-code-E20261108dc557863/ISSUE.md`
- **[[c2]]** `doc` `docs/daemon.md`
- **[[c3]]** `code` `vscode-plugin/src/config/gateway.ts`
- **[[c4]]** `code` `vscode-plugin/src/panels/repo-config.ts`
- **[[c5]]** `code` `src/daemon/server.ts`
- **[[c6]]** `code` `vscode-plugin/src/chat/approval-subscribe.ts`
- **[[c7]]** `code` `src/config/role-taxonomy.ts`
- **[[c8]]** `code` `vscode-plugin/src/config/legacy-keys.ts`
- **[[c9]]** `code` `vscode-plugin/src/chat/cli-adapter.ts`
- **[[c10]]** `code` `vscode-plugin/src/chat/ollama-routing.ts`
- **[[c11]]** `code` `src/config/repo-fields.ts`
- **[[c12]]** `doc` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/VS-CODE-SMOKE.md`
- **[[c13]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- **[[c14]]** `code` `src/daemon/approval.ts`
