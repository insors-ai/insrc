# Plan-directed code review: opt-in protocol

`legacy` remains the default. S6 adds `plan-investigation-v1` without changing
DEF/HLD/LLD review, legacy controller frames, or already saved review states.
An unknown engine/version/state is refused; it never becomes a HEAD diff.

The daemon exposes `codeReview.investigation.capabilities`,
`codeReview.investigation` and read-only legacy `codeReview.diagnostics`.
`codeReview.run` and MCP `insrc_code_review_step` also recognize the explicit
new-engine envelope before their legacy parsers. MCP uses
`phase: "investigation"`. Use `insrc_schema` for the registered outer schema.

```json
{
  "phase": "investigation",
  "version": 1,
  "engine": "plan-investigation-v1",
  "capabilities": {
    "version": 1,
    "engines": ["legacy", "plan-investigation-v1"],
    "investigationWireVersions": [1],
    "canonicalInvestigationVersions": [1],
    "operations": ["start", "status", "resume", "cancel", "read", "impact", "progress", "reply"]
  },
  "command": {
    "version": 1,
    "engine": "plan-investigation-v1",
    "operation": "status",
    "repo": "/registered/canonical/project/path",
    "runId": "opaque-run-id"
  }
}
```

A start additionally pins its request UUID, registered repo ID, root/story/BUILD,
source mode, and selected commit/parent/scope-attestation references. The daemon
derives the independent reviewer from the canonical BUILD author. Scope comes
from separately approved canonical ISSUE evidence, never a Story trailer alone.
Controller turns require a fresh `reviewBudget` declaration on each scoped call.
The response supplies exact turn/binding, navigation references and coverage IDs.
Use only scoped reads/impact/progress/reply; checkpoint each block. A final reply
references durable ACKs and cannot introduce findings or coverage deltas.

## Authority and stored records

| Record | Authority and relationship |
| --- | --- |
| Approved scope ISSUE | Pins commit/parent, selected blocks, root/story/BUILD and BUILD source. One review may consume multiple explicit proofs. |
| Canonical BUILD | Owns the source revision and author identity; the independent party reviews it. |
| Private run descriptor and S4 journal | One immutable scope and policy per run; an owned generation appends evidence and block ACKs. They are not review artifacts. |
| Canonical CR and S5 terminal receipt | One frozen publication intent produces/reconciles the canonical CR; the receipt verifies that exact publication. |
| Approved readiness ISSUE | References version-pinned evaluation and separate installed-probe records for source-only/indexed mode. |
| Approved predecessor AMD | Permits only the explicit CODE-review exception in `RECONCILIATION_CLAUSE`; sibling LLDs/design review retain their contracts. |

Descriptors live under `.insrc/review-runs/production-v1`; the existing private
S4 namespace owns acceptance and usage outbox records. Native bindings use a
private local socket and dedicated MCP entry; no general daemon tools or DB
handles are exposed to the reviewer. Runtime directories are excluded from
source inspection even when force-added to Git.

## Activation evidence

Setting `codeReview.engine` alone does not enable starts. The daemon checks:

1. Client/daemon wire and canonical-reader versions.
2. `codeReview.investigationReadinessRef`: approved current ISSUE content matching
   `readinessSchema` in `src/daemon/review-investigation-adoption.ts`.
3. `codeReview.predecessorReconciliationRef`: a separately approved canonical
   AMD for predecessor Epic `8315a11f29fd2812`, containing the exact code-only
   reconciliation clause and an applicable predecessor performance target.
4. Evaluated engine source commit/fingerprint, provider profile, tool catalog,
   policy, fixture/oracle pins, independently approved adjudication and complete
   required defects/coverage. Live evidence/default replacement remain false.
5. A real installed-probe report for the selected mode, matching the high-tier
   `review` role's CLI, model/effort, installed binary/runtime files, isolated
   configuration, effective tool inventory and launch digest.

Approval references are `approved:<artifact-id>@<revision>#<content-digest>`;
use `approvedEvidenceReference` to compute them. Their content includes body and
citations. Reports are tracked ISSUE content: `fixIntent` contains the JSON.
For engine-wide governance in a different registered repo, the readiness config
reference may be `repo:/absolute/governance/repo::approved:...`. Nested report
and reconciliation references resolve in that same repo. No repo is registered
automatically, and review source still belongs to the active project.

Installed probes must independently demonstrate denied filesystem, shell,
network, approval, cross-run, built-in-tool, user/project MCP, plugin, hook and
repository-instruction access, multiple durable ACKs and cancellation/process
exit. Adapter flags and scripted fixtures alone do not establish isolation.
The signed report has `version:1`, `kind:"review-investigation-installed-probe"`,
`origin:"installed-probe"`, `evidence` (`NativeIsolationEvidence`) and `signature`.
The signature covers UTF-8 `JSON.stringify(snapshotValue(evidence))`, verified
with the independently provisioned Ed25519 public trust anchor
`~/.insrc/review-probe-trust.pem` (owned by the daemon user and not group/world
writable). The request/report cannot choose that key. No key or credential is
created or copied by activation. Missing proof/key means unsupported activation.

No installed binary is certified by the repository's deterministic tests.
Publishing readiness reports, provisioning an independent probe trust anchor,
approving the pending reconciliation, enabling opt-in, live model comparisons
and changing the default are separate operator decisions.

## Status, detach and rollback

Status is read-only and reports exact sc7 fields, separate diagnostics and
coverage rows. Obligation counts, durable block checkpoints and provider liveness
are distinct. Missing liveness stays null. Estimates/reserves are not observed
spend; missing counters stay null; pending outbox entries stay pending without a
qualified idempotent writer. Cumulative snapshots are not added as model calls.
Legacy diagnostics use `legacy-dimension`, no investigation generation/resume,
and explicitly unavailable accounting. Responses exceeding the transport bound
refuse instead of silently truncating coverage.

Detach returns no verdict and does not retry. Resume reuses the run's immutable
engine/scope/policy, skips reviewed work and refuses stale pins/unsupported IDs.
Only one investigation provider request runs at a time across repositories in
the daemon. A queued cancellation acquires no execution lease.

Selecting `legacy` disables new starts/resumes and revokes active scoped access;
a 250 ms local monitor drains an active provider/controller attempt into its
recoverable paused state. Cancellation and read-only status remain available.
A frozen CR publication reconciles without another model invocation even after
rollback. Receipts, accepted blocks, findings and usage outbox records survive.
Existing legacy/design reviews retain their own routes and saved-state refusal
semantics; no investigation run is converted into them.

## Pending predecessor proposal

`AMD-8315a11f29fd2812-1` is prepared through `proposeAmendment` as a pending
canonical record. It is not approved or applied and does not enable opt-in.
The historical predecessor HLD retains its original authoring checkout path;
this governance-only read verifies the known canonical ID and full history in
the registered evidence repo. Review subject adapters retain their strict
current-project path checks. The proposal changes only the predecessor's
performance target to document the explicit CODE-review exception above.

## Deterministic comparison records

`review-investigation-evaluation.ts` verifies a versioned oracle from approved
canonical ISSUE content. The history's approving actor must be a person other
than the content author and the declared record producer; a JSON adjudicator
label or a serialized oracle handle is insufficient. The repository's seeded
oracle includes executable defect/control probes. Unit fixtures use explicitly
synthetic actors; they do not create an approved production oracle.

Baseline and candidate records bind source commit/fingerprint, schema, adapter,
provider profile, policy, tool catalog, fixture version and oracle digest. Every
oracle case must remain in both records. Dropping a required defect or coverage
row fails; additional unadjudicated findings remain a failure requiring oracle
adjudication. Persisted reports are recomputed from their embedded immutable
records, not trusted from a `passed` flag or a shortened expected-ID list.

The checked-in baseline is labelled **recorded synthetic protocol fixture**.
It does not represent an installed model's review or actual cloud bill. Input
segments store hashes/character counts; repeated-input characters and scripted
call counts are diagnostic fixture metrics. Unknown real model calls, tokens,
cloud latency, recall, default quality and savings stay null. There is no live
model invocation or automatic default-selection decision in this evaluator.
Even a passing comparison requires all adoption/qualification/approval gates.

## Installation and verification matrix

The S6 matrix covers the following partitions with deterministic fixtures:

| Partition | Verification |
| --- | --- |
| Daemon/controller × source/indexed × planned/planless | Shared canonical subject, evidence, checkpoint, status and publication path |
| New/legacy capability and schema mismatch | Explicit refusal, no legacy or HEAD fallback |
| Scope attribution and index gaps | Approved parent/block proofs; missing/partial caller mapping remains required work |
| Native Claude/Codex | Private MCP catalogue, multiple ACKs, cancellation/stall/final-reply checks; fixtures do not certify installed binaries |
| Concurrent/repeated requests | One process-wide provider lane, coalesced resumes, idempotent start/checkpoint replay |
| Crash/reconnect | SIGKILL after ACK and canonical head; retained progress and frozen publication recovery without duplicate judgment |
| Rollback and predecessor installation order | Active attempt drain, preserved status/cancel/usage, unchanged legacy/design routes and stale-state refusal |
| Comparison evidence | Independent canonical oracle approval, all cases/defects/coverage retained, unknown real usage and savings null |

Installed metadata was inspected on 2026-10-29: Claude Code `2.1.310` and Codex
CLI `0.164.0`. Neither is certified for investigation by this inspection.
Independent installed-probe evidence is absent and
`AMD-8315a11f29fd2812-1` remains pending, so opt-in stays closed and legacy stays
the default. A Codex npm launcher certificate must additionally pin the selected
Node interpreter, package metadata and resolved native Rust executable; a
launcher-only fingerprint is refused. Unknown script layouts remain unsupported.

Focused test logs, the production build log and machine-specific installed
image diagnostics are retained in `/tmp` and referenced by the S6 BUILD/TESTS
records. The approved sequence companion remains accurate: qualification and
runtime-image checks remain inside its daemon-service/reviewer boundary.
The final independent code review follows the last task validation so it binds
the completed BUILD; BUILD completion still requires an explicit human approval.
