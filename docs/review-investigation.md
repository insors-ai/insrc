# Plan-directed code review: opt-in protocol

## Live operator probes

Build first with `npm run build`, then update/restart the installed daemon. The
IPC-only operator client does not sign, approve, edit configuration or invoke
production review. Supply a fresh request UUID deliberately; reusing the same
UUID and payload returns the existing probe without another invocation.

```bash
node scripts/review-investigation-probe.mjs prerequisites --repo /absolute/registered/project
node scripts/review-investigation-probe.mjs start --repo /absolute/registered/project --mode source-only --request-id <UUID>
node scripts/review-investigation-probe.mjs status --repo /absolute/registered/project --probe-id <returned-probe-UUID>
node scripts/review-investigation-probe.mjs cancel --repo /absolute/registered/project --probe-id <returned-probe-UUID>
node scripts/review-investigation-probe.mjs export --repo /absolute/registered/project --probe-id <returned-probe-UUID>
```

Start the indexed-impact probe separately with its own explicit UUID. Each
start uses the currently selected high-tier review role; changing providers
is a separate operator configuration decision. There are no automatic retries.
The shared provider lane serializes probes and investigation reviews across
repositories. A queued cancellation invokes no provider; active cancellation
retains ownership until the real process and bridge have drained.

The main daemon owns `codeReview.investigation.probe` start/status/cancel/export,
including worker-originated connections. Its private fsynced status records live
under `~/.insrc/review-probes`. A restart marks queued/running work interrupted;
it never resumes the model call or promotes partial evidence. Replaying that
UUID returns the interrupted record. Launch identity is pinned durably before
invocation. Request/report responses are bounded to 2 MiB, runtime observations
and captured CLI output to 8 MiB; exceeding a bound fails explicitly rather
than truncating proof.

Raw output, configuration and checkpoint files remain in a private
`/tmp/insrc-p-*` fixture root (the platform temporary directory when different).
Exports list their exact paths, sizes and hashes. Export rechecks those bytes;
a changed/missing file cannot silently become evidence. The operator client
places exported JSON in its own private temporary directory. Do not save these
temporary reports in the Epic/Story folder. Retain the fixture root while
independent inspection/qualification requires its pinned configuration files.

The Claude `2.1.310` and Codex `0.164.0` collectors recognize limited runtime
diagnostics. They deliberately do **not** certify a complete effective inventory:
result/agent-message claims, requested flags, absent calls and silence do not
prove denied access. Observed unwanted capabilities fail isolation; unverifiable
facts leave the installation unsupported, with no candidate. Actual durable
ACKs and a host-requested SIGKILL exit are required for progress/cancellation
observations. A naturally completed process cannot be labelled cancelled.
Subprocess counts are not model-call counts; unavailable counters remain null.

Activation handoff, in order:

1. Inspect the bounded raw files and independently establish **every** required
   inventory/denial/progress/cancellation fact for the exact installation, mode,
   launch and configuration. An unsupported report alone is insufficient.
2. Record the verified evidence in the installed-probe format described below.
   No cryptographic signature, external signer or trust-key provisioning is
   required. Do not relabel scripted fixtures or fill in unobserved facts.
3. Publish version-pinned canonical probe, oracle/evaluation and readiness
   records through the tracked workflows and obtain explicit approvals. The
   oracle requires a real independent person actor; a system approval or a JSON
   actor label cannot be represented as that person.
4. Obtain approval of predecessor `AMD-8315a11f29fd2812-1`, and approved explicit
   commit/parent/block scope evidence for a real subject whose BUILD tasks all
   passed. The prior S6 review override did not turn its failed task into a pass.
5. Authorize bounded test opt-in, then use normal production admission for the
   exact subject. Verify findings/coverage, durable per-block progress,
   cancellation/reconnect, canonical CR publication/receipt and observed usage.
   Synthetic indexed probe work does not establish real caller-impact coverage.
6. Present that evidence for explicit activation signoff. Only afterward start
   the separately tracked deletion of the legacy **CODE** review engine,
   preserving design review and required historical diagnostics.

The client's prerequisite list states what still needs independent verification;
it does not claim to have audited configured approvals or activation readiness.
No probe, export or passing software test changes `codeReview.engine`.

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
The report has `version:1`, `kind:"review-investigation-installed-probe"`,
`origin:"installed-probe"` and `evidence` (`NativeIsolationEvidence`). It must be
stored in an approved, revision-and-digest-pinned canonical ISSUE. The daemon
rechecks canonical approval and evidence digest whenever qualification is used,
alongside the unchanged runtime identity, isolation, file and expiry checks.
No signing key or signature is required or read. A legacy `signature` field is
accepted only as optional bounded metadata, never as authority. Raw diagnostic
exports do not grant qualification. Missing runtime proof still prevents activation.

No installed binary is certified by the repository's deterministic tests.
Publishing readiness reports, approving the pending reconciliation,
enabling opt-in, live model comparisons
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

Native broker bindings use per-invocation capability filenames. The static MCP
configuration names a logical prefix; the trusted launcher injects the current
binding identity as private runtime data. Ambient values are discarded. A
restarted daemon can retain stale capability files without overwriting them or
blocking a fresh invocation, and an older MCP process cannot discover the new
capability through a shared filename. Normal teardown removes only its own file.
