<!-- insrc:artifact LLD-dae67bfc7da310cc-s1 -->

# LLD: STORY-dae67bfc7da310cc-s1 — Remove design and code review implementations while retaining unavailable endpoints

## Summary

**Epic:** `remove-design-code-review-implementations-while`
**HLD base run:** `wf-1794830844170-7po9fb`
**HLD effective hash:** `dae67bfc7da3...`

Remove all executable design-review and code-review implementations, keeping their public MCP and daemon IPC contracts as unavailable endpoints. Every review operation throws a family-specific Error stating that the functionality is being rewritten before review validation or side effects. Historical artifacts and generic artifact viewing/human approval remain; review-required transitions cannot silently pass. Removal includes transitive review-only workers, services, preparation, checkpoints, publication, cleanup, activation, prompts and tests.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** public

## 3. Data model changes

### 3.1 `Review runtime ownership` — invariant-change

Delete runtime review execution and ownership relationships: endpoints no longer create sessions, attempts, workers, contexts or cleanup claims. Many preserved endpoints delegate directly to one stateless error helper; no endpoint owns mutable review state. Remove review-only dependencies while retaining only schemas/types needed for endpoint inputs and historical artifact reads. Historical records, hashes and parent-child artifact relationships remain unchanged.

**Call sites:**
- `src/daemon/review-service.ts`
- `src/daemon/threads/review-workers.ts`
- `src/daemon/task-review-rpc.ts`
- `src/daemon/code-review-rpc.ts`
- `src/daemon/workflow-review-rpc.ts`

## 4. Error paths

**Error cases**

- **Any current or legacy design/code review operation is invoked** (terminal)
  - Detection: Dispatch reaches a retained review endpoint or retained internal compatibility stub.
  - Response: Throw Error with exactly 'Design review functionality is being rewritten.' or 'Code review functionality is being rewritten.' through the existing IPC/MCP error transport. Do not report success, create runtime state, call providers or touch checkpoint files.
  - User impact: Review is unavailable until rewritten; clients display the error without polling or retrying indefinitely.
- **Approval or Story completion requires review evidence that no longer exists** (recoverable)
  - Detection: The existing gate determines that required clean independent review is absent.
  - Response: Return an actionable review-unavailable refusal through the existing gate; preserve only explicit human override mechanisms already supported and record their reason. Do not auto-approve or fabricate evidence.
  - User impact: User must explicitly choose an existing permitted override or wait for the rewrite.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Existing review-id, resumable attempt, cancel, progress, cleanup, publish or activation request | Same rewritten exception; no old runtime recovery, history mutation or checkpoint cleanup. |
| Malformed review input reaching a registered handler | No review-specific parsing or execution; throw rewritten exception. Transport-level schema validation remains the existing public contract. |
| Historical review artifacts opened via generic artifact views | Remain readable with their original stored data. Retain minimal read/serialization contracts; no live review engine is reintroduced. |
| Unrelated workflow/analyze/build requests | Continue through ordinary paths without loading review engines or spawning review workers. |

**Invariants to preserve**

- Preserve public endpoint schemas and current client compatibility identified by the s1 structural/import analysis; failure replaces review behavior, not endpoint identity. [[c1]]
- Preserve workflow core and shared artifact storage identified by the s1 module profile; no historical artifact schema migration or record deletion. [[c1]]

## 5. Test strategy

**Test framework:** `Node.js node:test with tsx; *.test.ts convention`

**Test levels**

- **contract** — Prove endpoint names/input schemas remain registered and valid review calls all return the exact rewritten error, including legacy and current operation phases.
  - Subjects: `MCP insrc_review_step and insrc_code_review_step`, `Daemon designReview.*, codeReview.task.*, codeReview.run, codeReview.grounding, codeReview.freshness, workflow.review, workflow.reviewArtifact and workflow.resolveFinding`
  - Fixtures: `Frozen pre-change endpoint and MCP schema inventory`, `Valid minimal requests per preserved endpoint`
- **integration** — Prove failure happens without worker/provider/storage/cleanup work and unrelated daemon/workflow paths still operate.
  - Subjects: `Daemon handler registry and step host`, `Review worker startup/recovery shutdown wiring`, `Workflow approval and Story completion unavailable/override behavior`, `Historical generic artifact viewing`
  - Fixtures: `Fail-on-call provider/worker/file mutation seams`, `Temporary historical review artifact and unrelated artifact fixtures`
- **smoke** — Verify strict compilation, production build and current IDE error propagation after implementation deletion.
  - Subjects: `npm run build`, `Focused workflow/daemon/MCP regression suites`, `VS Code and JetBrains client contract checks`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Preserved endpoint inventory and exact rewritten exception contract` |
| `ac2` | `No review execution/preparation/recovery/cleanup side effects; import/deletion audit` |
| `ac3` | `Approval/completion never fabricate a clean review; historical artifacts remain unchanged` |

## 6. Migration

**State before:** s1.analyzeBundles[0] identifies current review modules and daemon/MCP/workflow consumers, with a partially retired helper but surviving runtime services and workers. Graph coverage is incomplete; source audit must freeze the full callable endpoint and import inventory before deletion.

**State after:** Only endpoint registrations, minimal input/historical serialization contracts and a stateless rewritten-error helper remain for design/code review. No engines, review-specific runtime resource ownership, preparation, worker processes, resume, publish, cleanup or activation execute. Historical artifacts are untouched. Review-dependent gates explicitly remain unavailable except existing human-authorized overrides.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Record endpoint/schema inventory, historical artifact hashes and dirty-file baseline; reconcile overlap with existing review edits without overwriting others' changes. — ↩ rollbackable
2. Wire preserved current and legacy endpoints to rewritten exceptions; detach live review startup, RPC service and router ownership integrations in the same buildable change. — ↩ rollbackable
3. Delete review execution/runtime modules, prompts and obsolete implementation tests; retain only necessary endpoint schemas and historical serializers. Audit imports, packages, configuration and both current IDE clients. — ↩ rollbackable
4. Adapt approval/completion to explicit unavailable behavior and existing reasoned human overrides; update operational guidance. Do not execute removed cleanup against existing checkpoints. — ↩ rollbackable
5. Run endpoint/no-side-effect contracts, focused integration suites, production build and relevant current client checks. Restart the daemon only after authorized deployment so in-flight old reviews are not interrupted without notice. — ↩ rollbackable

**Backward compat:** Public method names and MCP input schemas remain callable. Successful review outputs are intentionally replaced by transported Error messages: 'Design review functionality is being rewritten.' and 'Code review functionality is being rewritten.' No success or completion is fabricated. Existing artifacts remain readable through generic views, with no migration/deletion. Historical checkpoints remain inert. Existing IDE clients must show the error and cease polling that failed operation. Any stale generated out/ review code must be removed from build output/package so deleted sources are not shipped. Rollback restores code from version control without rewriting history.

## 7. Alternatives considered

### 7.1 a1: Direct endpoint tombstones — **CHOSEN**

Retain the registered endpoints and minimal contract types; delete implementation and wire every review operation directly to a throwing helper.

Each existing public MCP/IPC method remains registered with its current input schema and produces a consistent thrown Error explaining that its review family is being rewritten. Delete engines and runtime ownership rather than preserving disabled implementations. Historical read/render schemas remain only where required for general artifact handling. Approval/completion consumers report unavailable review evidence and require explicit existing human override paths; they never synthesize a pass.

### 7.2 a2: Dedicated unavailable review adapter

Delete implementation and route all preserved endpoints through a new adapter exposing the former service interface.

Replace the review service with an unavailable adapter implementing all former methods, while deleting engines and workers. Existing RPC wrappers retain the service-shaped dependency; review-dependent approvals receive an explicit unavailable result. Preserve historical formats and error transports.

**Rejected because:** Meets endpoint compatibility but unnecessarily retains a service interface after deleting functionality.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]` — "Analyzer completed a workflow module profile, import graph and convention pass. Review implementation resides under code-review and review; external graph consumers include daemon review-service, revi"
- **[[c2]]** `code` `src/daemon/handler-runtime.ts:699-727`
- **[[c3]]** `code` `src/daemon/design-review-rpc.ts`
- **[[c4]]** `code` `src/daemon/task-review-rpc.ts`
- **[[c5]]** `code` `src/workflow/review-unavailable.ts`
- **[[c6]]** `stakeholder` `User instruction, 2026-11-16: both design and code review functionality needs to be completely removed; only keep endpoints and raise an exception stating it is being rewritten.`
