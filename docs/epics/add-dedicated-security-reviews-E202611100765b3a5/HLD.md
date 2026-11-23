<!-- insrc:artifact HLD-0765b3a578e43eec -->

# HLD: add-dedicated-security-reviews

## Summary

**Tracker:** [insors-ai/insrc#155](https://github.com/insors-ai/insrc/issues/155)

A new, standalone security-review orchestration module pins one content identity for the whole review, resolves the configured security model, and runs the dependency-advisory collection and the code-vulnerability pass with the SAME host access the controller itself already has -- no sandboxing or network/filesystem confinement is attempted, since constraining the reviewer's access would itself degrade the accuracy of the review (explicit user direction, applied across the Epic's design). Both passes run against that one pinned content identity and record, for audit, which destinations were reached and what was disclosed -- observability, not an enforced boundary. Both passes assemble into the already-typed SecurityFinding/VerificationReceipt shapes plus a supplemental report structure -- plugging into the shared review-round driver through its reserved security hook rather than redesigning any of that.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. Problem context

> See **DEF-0765b3a578e43eec** § 1. Problem

## 2. Framework summary

The Epic adds a standalone orchestration module (outside src/workflow/review-round/) that owns model selection, dependency-advisory collection, code-assessment execution, and reporting, and supplies review-round's existing RoundDriverHooks.security hook as a thin adapter. review-round itself stays unchanged except for the one call site invoking that hook; the data shapes it already exports (SecurityFinding, SecurityLocator, EvidenceProvider, VerificationReceipt) are populated, never redefined.

## 3. Architecture shape

Before any Story runs, the caller pins a SecurityReviewSnapshot identified by a `contentIdentity`: a content hash covering the pinned commit plus every permitted dirty/untracked input, computed by hashing the complete, required input set's actual bytes directly -- never inferred from git status alone, since a tracked file marked assume-unchanged can diverge from HEAD while git status stays empty. A repository path, commit SHA and a boolean dirty flag do NOT uniquely identify the reviewed files, so `contentIdentity` is the one value both s2 and s3 execute against and the one value s3 recomputes/verifies before trusting s2's evidence, refusing on a mismatch rather than silently combining evidence from two different trees. This is a CORRECTNESS invariant, independent of the access-level decision below.

Three Stories then map to three responsibilities, split along a model/no-model line the existing providers actually support (confirmed by reading src/agent/providers/cli-provider.ts and src/agent/read-only-tool-loop.ts): s1 resolves and records the configured security model, dispatched LATER through CliProvider.runReadOnlySession.

s2 is entirely controller-side, deterministic code with NO model involvement, and runs with the SAME host access as the controller itself -- no sandboxing, no network or filesystem confinement is attempted anywhere in this Epic. This is a deliberate, explicit choice: constraining what the reviewer's audit tools can reach would risk degrading the review's own correctness (a confined pip-audit/govulncheck run can miss what a real resolution against the actual environment would catch), and this codebase has no existing sandbox/network-namespace infrastructure to build that confinement on in any case. s2 instead OWNS two fixed responsibilities, reframed accordingly: (1) OBSERVABILITY -- s2 records which destination each manager's audit actually reached and what it disclosed, attaching that to SecurityAdvisoryEvidence for the final report; this is audit-trail information, not a basis for refusing to run a manager. (2) a documented per-manager INPUT/MODE mapping, retained because it is a CORRECTNESS requirement independent of isolation: npm/pnpm/yarn/cargo read their own manifest+lockfile directly; pip-audit audits the ACTIVE Python environment by default and does NOT select the repository's requirements file merely because cwd points there, so s2 must point it at the repository's own resolved environment/requirements explicitly; govulncheck performs source-level analysis across the module (`./...`), not a manifest read, so a go audit runs directly against the repository's own module source. A manager s2 cannot correctly TARGET under this mapping (not: cannot confine) produces an explicit coverage gap, never a mis-targeted run.

s3 (depending on s1 and s2) owns the end-to-end sequence. The code-vulnerability pass is dispatched through CliProvider.runReadOnlySession with the SAME host access every other CLI-backed session in this codebase already has -- no additional credential-denial, out-of-scope-read-denial, or MCP-authorization gate is layered on top of what runReadOnlySession's own existing mechanism provides, for the same reason as s2: a model reviewing code for vulnerabilities needs the same real access to the repository the controller's own sessions already have, and sandboxing it would risk the review missing real findings. s3 also invokes runReviewRound (review-round/driver.ts, which only calls ground + the optional security hook and merges their findings -- it does not itself execute a sandbox/mutation checkpoint, reconcile rounds, or persist anything), executes and owns that checkpoint, calls reconciliation, maps the review's pinned contentIdentity onto an epicHash/storyId identity (persistVerificationReceipt, receipt-record.ts, hard-requires both), persists VerificationReceipt entries through it, and owns checkpoint cleanup. s3 assembles SecurityFinding/SecurityEvidence from the code pass and a supplemental report structure from s2's SecurityAdvisoryEvidence, because SecurityFinding's own schema is additionalProperties:false and has no dedicated exploit-prerequisite/remediation/advisory-provenance fields.

The module imports review-round's types; review-round never imports the new module, keeping the dependency direction one-way and the shared driver generic across every review type.

## 4. Shared contracts

### 4.1 sc1: SecurityModelSelection

**Owner Story:** `s1`
**Consumed by:** `s3`

**Purpose:** Carries s1's resolved security-model identity (or its unavailability) across the boundary so s3 can dispatch the code-vulnerability pass through CliProvider.runReadOnlySession with that exact model, record the effective model in the report without re-resolving it, and refuse with the blocker reason rather than falling back silently.

**Interface sketch (type-level):**

```
interface SecurityModelSelection {
	readonly status: 'configured' | 'unavailable';
	readonly modelId?: string;
	readonly provider: 'cli-claude' | 'cli-codex' | 'cli-vibe';
	readonly blockerReason?: string;
}
```

**Assumptions cited:** [[k2]]

### 4.2 sc2: SecurityAdvisoryEvidence

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** Carries s2's dependency-advisory collection outcome (controller-side, no model) across the boundary: the pinned contentIdentity it was collected against (so s3 can verify it recomputes/matches the same identity before trusting this evidence), the queried coordinates, the actual advisory matches with affected versions and provenance, the per-match advisory destination actually reached (recorded for audit, not enforced -- s2 runs with controller-equivalent access, no sandboxing), the per-manager input mode used (manifest-scoped | isolated-environment | confined-source-copy | unsupported, retained as a correctness/targeting concern, not an isolation one), and the dependencies/sources that stayed unresolved, unavailable or unsupported -- so s3 can report confirmed affected dependencies and unverified coverage as DISTINCT values bound to the SAME content identity as its own code findings. Additive at revision 6: contentStable (top-level) records whether s2's own post-audit re-verification of contentIdentity matched its pre-audit value -- a concurrent mutation-and-restore during collection is caught within s2's own run, narrowing (not eliminating) the window a live, unconfined audit leaves open. Each perManagerMode[] entry additionally carries configuredDestination (the manager's own CONFIGURED target, e.g. its default registry/service) -- explicitly a configured value, never claimed as independently observed, since pkg_audit's own output (manager, exitCode, parsed, stdout, stderr) carries no network trace to observe from.

**Interface sketch (type-level):**

```
interface SecurityAdvisoryMatch {
	readonly coordinate: string;
	readonly advisoryId: string;
	readonly affectedVersions: string;
	readonly severity: string;
	readonly provenance: string;
	readonly advisoryDestination: string;
}

interface SecurityAdvisoryEvidence {
	readonly contentIdentity: string;
	readonly contentStable: boolean;
	readonly readOnly: true;
	readonly queriedCoordinates: readonly string[];
	readonly matches: readonly SecurityAdvisoryMatch[];
	readonly perManagerMode: readonly { readonly manager: string; readonly mode: 'manifest-scoped' | 'isolated-environment' | 'confined-source-copy' | 'unsupported'; readonly configuredDestination?: string; }[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
}
```

**Assumptions cited:** [[k2]]

### 4.3 sc3: SecurityReviewEntryPoint

**Owner Story:** `s3`

**Purpose:** The daemon IPC method + MCP tool (insrc_security_review_step) that is the actual trigger for a security review -- mirroring insrc_code_review_step's phase-driven shape and its confirm_wait-on-stale-index pattern, since nothing in this Epic previously assigned any Story the entry point a caller actually invokes (this HLD's own a1-alternative text named the gap -- 'a daemon RPC/MCP entry point supplies it when a caller asks for a security-only review' -- but never assigned it to a Story until this amendment). Unlike insrc_code_review_step's two branches (who authored the code under review), a security review has exactly one path: the pinned security model always performs the actual assessment, never the controller, so phase='start' runs runSecurityReview synchronously end-to-end and returns next:'done' in the same call -- the same shape as code-review's 'you wrote the code' branch, which asks the daemon to review and waits. epicHash/storyId are OPTIONAL on the request: when the caller supplies them (reviewing inside an existing tracked Epic/Story), persistVerificationReceipt's ident uses them directly with standalone left unset; when omitted, s3 derives them deterministically from contentIdentity (per q860d1b4e's resolution) and sets standalone:true -- matching receipt-record.ts's own ident.standalone? field, which exists for exactly this distinction.

**Interface sketch (type-level):**

```
type SecurityReviewStepRequest =
	| { readonly phase: 'start'; readonly repo?: string; readonly targets: ReviewTargets; readonly epicHash?: string; readonly storyId?: string }
	| { readonly phase: 'start'; readonly state: string; readonly proceed: boolean };

type SecurityReviewStepResponse =
	| { readonly next: 'confirm_wait'; readonly state: string; readonly guidance: string }
	| { readonly next: 'done'; readonly report: SecurityReviewReport; readonly markdown: string };
```

**Assumptions cited:** [[k2]]

## 5. Story boundaries

### 5.1 Story STORY-0765b3a578e43eec-s1

**Owns:** `sc1`

Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question.

### 5.2 Story STORY-0765b3a578e43eec-s2

**Owns:** `sc2`

pkg_audit's package-manager resolution; s2 runs with the SAME host access as the controller itself -- no network or filesystem sandboxing is attempted (explicit user direction: constraining the reviewer degrades review accuracy). s2 instead RECORDS, per manager, which destination was actually reached and what was disclosed (observability for the final report, not a basis for refusal); the documented per-manager input/mode mapping (npm/pnpm/yarn/cargo: manifest+lockfile scope; pip/pipenv/poetry: the repository's own resolved environment, never the ambient active environment pip-audit defaults to; go: the repository's own module source directly, since govulncheck performs source-level analysis, not a manifest read) is retained as a CORRECTNESS/targeting requirement, with an explicit coverage gap for any manager s2 cannot correctly target under that mapping; and the advisory-match collection that populates SecurityAdvisoryEvidence (stamped with the pinned contentIdentity, computed by hashing the complete required input set's actual bytes directly) stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all. ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager nonZeroOk:true) from an EXECUTION GAP (spawn failure, unparseable output, an unsupported manager, or a manager s2's input/mode mapping cannot correctly target) -- these are never conflated.

### 5.3 Story STORY-0765b3a578e43eec-s3

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a content MISMATCH only -- never on an access/enforcement question), using s1's resolved model, with the SAME host access every other CLI-backed session in this codebase already has (no additional credential/out-of-scope/MCP denial gate; explicit user direction, applied across the Epic's design). The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report. s3 also owns sc3, the daemon IPC method + MCP tool (insrc_security_review_step) that a caller actually invokes to trigger a review -- the entry point this HLD previously left unassigned (amendment, revision 7). It mirrors insrc_code_review_step's phase-driven shape, including its confirm_wait-on-stale-index resumption pattern, collapsed to its single always-daemon-reviews branch since a security review's assessment is always performed by the pinned model, never the controller.

## 6. Non-functional targets

- **Performance:** Not a stated constraint for this Epic; the new module's cost is bounded by one pkg_audit invocation (per targeted manager) and one CLI read-only session per request, not a new background job.
- **Security:** s2 and s3 run with the SAME host access as the controller itself (explicit user direction: sandboxing or constraining the reviewer degrades the review's own accuracy, applied across this Epic's design) -- neither attempts network or filesystem confinement, and this codebase has no sandbox/network-namespace infrastructure to build such confinement on in any case. s2 records, per manager, which destination was actually reached and what was disclosed, attaching that to SecurityAdvisoryEvidence for audit; this is observability, not an enforced boundary, and is NOT a basis for refusing to run a manager. s2's per-manager input/mode mapping (manifest-scoped for npm/pnpm/yarn/cargo; the repository's own resolved environment for pip/pipenv/poetry, since pip-audit otherwise audits the ambient active environment; the repository's own module source for go, since govulncheck performs source-level analysis) is retained as a CORRECTNESS requirement -- pointing each tool at the right target -- not an isolation one; a manager outside that mapping is still an explicit coverage gap, because s2 cannot correctly target it, not because it cannot be confined. s3's code-vulnerability pass is dispatched through CliProvider.runReadOnlySession with the same access level every other CLI-backed session in this codebase already has; no additional credential/out-of-scope/MCP denial or negative-access test gates dispatch. contentIdentity remains a hard, non-negotiable CORRECTNESS invariant, unrelated to the access-level decision: s2 and s3 must operate against the exact same pinned content, computed by hashing the complete, required input set's actual bytes directly (never inferred from git status alone, which can miss a tracked file marked assume-unchanged) -- s3 recomputes and verifies this identity before trusting s2's evidence, refusing ONLY on an actual content mismatch.
- **Observability:** Every checkpoint run -- pass or fail, whether or not a SecurityFinding corroborates it -- is recorded as a VerificationReceipt (already built, src/workflow/review-round/receipt-record.ts), so a security review's execution is auditable independent of its findings. s3 owns stamping that record with the epicHash/storyId persistVerificationReceipt requires, mapped from the review's own pinned contentIdentity. s2's per-manager recorded destinations/disclosures (see nonFunctional.security) are the equivalent audit trail for the dependency-advisory pass.
- **Durability:** No new persistent storage is introduced for s1/s2's own outputs (SecurityModelSelection, SecurityAdvisoryEvidence are transient per-review values); the durable records are the already-typed SecurityFinding/VerificationReceipt heads the shared round-driver machinery (Epic 03f4fd3b9102aab8) persists, plus s3's new supplemental report structure (not yet a stored artifact type; its persistence mechanism is an open question for the s3 LLD).

## 7. Rollout

**Phase A -- foundational contracts (model selection and dependency-advisory collection)**

**Stories:** `s1`, `s2`

s1 (SecurityModelSelection) and s2 (SecurityAdvisoryEvidence) are the two shared contracts s3 depends on; neither depends on the other, so they can land in either order or in parallel, but both must exist before s3 is buildable.

**Backward compat:** No existing behavior changes: s1 adds a new, independently-selectable model binding beside core/mid/cheap; s2 runs entirely controller-side with a correctly-targeted, per-manager-scoped pkg_audit invocation against the pinned content identity and touches no existing caller.

**Phase B -- run and report the security-only review**

**Stories:** `s3`
**Flag:** `security-only-review`

s3 depends on both s1 and s2 per the Epic's own dependency graph and consumes both shared contracts (sc1, sc2); it cannot start until Phase A lands.

**Backward compat:** s3 adds the RoundDriverHooks.security adapter and the one new call site into runReviewRound; review-round's existing behavior for other review types (code, design) is unchanged since the hook is optional and currently unset.

**Ordering rationale:** Phase ordering follows the Epic's own Story dependency edges: s3 declares dependsOn [s1, s2], and the HLD's shared contracts (sc1 owned by s1, sc2 owned by s2, both consumed only by s3) confirm s3 has nothing to consume until both land. s1 and s2 have no dependency between them and own disjoint contracts, so they are grouped into one phase rather than sequenced against each other.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Independently-selectable security model (s1) | Adding a role-taxonomy.ts entry alone still resolves to one of the existing core/mid/cheap tier's already-configured models; it does not by itself create a FOURTH, independently-bindable model axis, and its interaction with coreFloor enforcement and unavailable-model handling is undecided. | s1's LLD must specify the actual configuration contract for the independent binding before any build task starts. |
| Per-manager input/mode correctness (s2) | govulncheck needs the module's source tree (not a manifest) and pip-audit defaults to the ambient active environment (not the repo's own requirements) -- a manifest-only scope would make these audits fail or assess the wrong target entirely. | s2's build must implement and test the documented per-manager mode (manifest-scoped / isolated-environment / confined-source-copy) for every supported manager, with an explicit coverage gap for any manager outside that mapping. |
| Content-identity consistency between advisory and code evidence (s2/s3) | A commit SHA plus a dirty boolean does not uniquely identify the reviewed files -- two different dirty trees can share both -- and hashing only git-status-reported dirty/untracked files misses a tracked file marked assume-unchanged whose content has actually diverged from HEAD. | contentIdentity is computed by hashing the complete required input set's actual bytes directly (never inferred from git status alone) before either Story runs; s3 recomputes/verifies the SAME contentIdentity against SecurityAdvisoryEvidence before trusting it, refusing on a mismatch. |
| Controller-equivalent access tradeoff (s2/s3) | Running the reviewer with the same unconfined host access as the controller (explicit user direction, chosen over sandboxing to preserve review accuracy) means the review's own reports of which destinations were reached and what was disclosed are self-reported by the native tools, not independently verified by an enforced boundary -- a malicious or misbehaving dependency's tooling could, in principle, do more than reported. | s2/s3 record and surface the actual destinations/disclosures per manager/backend in the final report so a human reader can assess trust explicitly; this tradeoff is documented here rather than silently assumed, and is not presented as an enforcement guarantee the design does not provide. |

## 8. Alternatives considered

### 8.1 a1: Security-hook module inside review-round

Add a new sibling file in src/workflow/review-round/ that implements RoundDriverHooks.security directly, alongside the existing extension-point files.

A new file (e.g. security-review.ts) sits beside security-finding.ts/security-locator.ts/evidence-provider.ts/receipt-record.ts inside src/workflow/review-round/, implementing the reserved RoundDriverHooks.security?(targets, round) hook from types.ts. It owns FR001-FR003 directly. runReviewRound (driver.ts) already accepts the hook; a daemon RPC/MCP entry point supplies it when a caller asks for a security-only review.

Because review-round's own import-graph shows totalInDegree 0 (nothing imports it as a module today; it is reached only via daemon RPC), colocating keeps every security-aware file under one directory and one set of naming/test conventions without inventing a new module boundary.

**Pros:**
- Reuses the EXACT reserved extension point (RoundDriverHooks.security) the prior Story built for this purpose -- no new wiring contract needed on the driver side.
- All security-aware code lives under one directory with one naming convention.
- Smallest new-module surface: no new top-level directory, no new import-graph edge class to maintain.

**Cons:**
- Grows review-round's own entity count with security-specific orchestration logic that the OTHER review types never touch, diluting the directory's generic-round-driver identity.
- Model-selection, network-enforcement and filesystem-isolation concerns are themselves cross-cutting and arguably belong nearer src/config/role-taxonomy.ts and the controller-side orchestration code than inside review-round.

**Cost estimate:** M

**Rejected because:** Reuses the reserved hook with the least new surface, but concentrates cross-cutting model-selection/orchestration concerns in a directory that should stay generic, per the structural-map bundle (review-round currently has 0 indexed importers and a uniform convention this would blur with orchestration logic).

### 8.2 a2: Standalone security-review orchestration module, adapting into the hook — **CHOSEN**

A new sibling module owns model selection, controller-side advisory collection against a pinned content identity, code-pass execution, and reporting, and supplies review-round's RoundDriverHooks.security as a thin adapter.

FR001-FR003's actual logic lives in a new module outside review-round, which imports review-round's existing types and populates them, then exposes a thin function matching RoundDriverHooks.security's signature that driver.ts's runReviewRound calls. Model selection (FR001) is an independently-bindable configuration; dependency-advisory collection (FR002) is controller-side code with a correctly-targeted, per-manager-scoped pkg_audit invocation against the pinned content identity, with no model involvement at all; reporting (FR003) assembles the existing SecurityFinding/VerificationReceipt shapes plus a supplemental structure.

This keeps review-round itself unchanged except for the one call site that invokes the hook, preserving its role as generic round-driver machinery shared across review types (per Epic review-rounds-reconciliation-recovery, epicHash 03f4fd3b9102aab8).

**Pros:**
- review-round stays purely generic (data shapes + shared round driver); security-specific orchestration is isolated in its own module, easier to review and test without touching the shared driver's test suite.
- Model selection and per-manager targeting logic sits nearer the config machinery and the controller-side process boundary they actually extend, rather than being colocated with the generic driver.

**Cons:**
- Adds a new top-level module boundary and import-graph edge class (review-round currently has 0 indexed importers; this reverses that by making review-round importED-from this new module).
- Slightly more plumbing: the adapter function has to keep the hook signature and the new module's own API in sync as both evolve.

**Cost estimate:** M

### 8.3 a3: Separate security-review pipeline outside the round-driver framework

Build FR001-FR003 as an independent pipeline that does not use runReviewRound/RoundDriverHooks at all, duplicating checkpoint/reconciliation/reporting for the security case.

A fully separate pipeline re-implements round cycling, checkpointing and reconciliation for security reviews only, never calling into driver.ts or RoundDriverHooks.security. It would still populate SecurityFinding/VerificationReceipt for output compatibility, but would not reuse checkpoint.ts, reconciliation.ts, or review-report.ts's rendering.

This avoids any coupling to the shared round-driver Epic (03f4fd3b9102aab8) at the cost of rebuilding machinery that Epic already generalized across review types.

**Pros:**
- Zero coupling risk to the shared round-driver's own test suite or future changes -- a bug in the security pipeline cannot regress code/design reviews.

**Cons:**
- Duplicates checkpoint/reconciliation/review-report machinery the review-rounds-reconciliation-recovery Epic (03f4fd3b9102aab8) already built generically for every review type, directly contradicting that Epic's own purpose.
- The reserved RoundDriverHooks.security hook (types.ts) and the per-review-type checkpoint lifecycle it was built to support would go unused, wasting completed work from two prior Epics.
- Reviewers get two different round-cycle behaviors to reason about instead of one, raising long-term maintenance cost for no stated benefit.

**Cost estimate:** L

**Rejected because:** Duplicates machinery the review-rounds-reconciliation-recovery Epic (03f4fd3b9102aab8) already generalized, leaving the reserved RoundDriverHooks.security hook unused and raising long-term maintenance cost for no constraint benefit over a1/a2.

## 9. References

- **[[c1]]** `analyze-bundle` `insrc_analyze_step structural-map run (answerType structural-map) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "review-round is a 65-entity, 106,386-byte directory ... Import-graph: totalInDegree 0 ... totalOutDegree 15, heaviest on src/daemon/steps/resolve-repo.ts (6 edges) and src/workflow/artifact-core/types"
- **[[c2]]** `analyze-bundle` `insrc_analyze_step capability-discovery run (answerType capability-discovery) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "28 candidates evaluated in review-round: 0 clear-match, 7 partial-match (all data-shape only) ... No file selects a security model, isolates reviewer access, fetches a dependency advisory, or runs an "
- **[[c3]]** `code` `src/workflow/review-round/types.ts` — "RoundDriverHooks carries an optional security? hook, reserved and unimplemented."
- **[[c4]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "pkg_audit shells out via runShell, which inherits the host environment; it accepts only cwd and manager, with no approved-coordinate input or access policy."
- **[[c5]]** `code` `src/config/role-taxonomy.ts` — "RoleId is a plain string resolved to one of three tiers (core/mid/cheap, subject to the coreFloor clamp); there is no fourth, independently-selectable model axis."
- **[[c6]]** `prior-artifact` `BUILD-779e9a08142cb057-s1`
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts` — "toolCalling: false -- the CLI runs tools internally; complete() returns text and end_turn, never a tool call."
- **[[c8]]** `code` `src/shared/types.ts` — "ReadOnlySessionOpts carries only mode, connectionExecution, cwd, deadlineMs, internalRetry, stallMs and signal -- no tool-allowlist or access-policy field."
- **[[c9]]** `code` `src/daemon/tools/builtins/shell/access-policies.ts` — "SHELL_EXEC_ACCESS governs the human-approval gate for shell_* tool calls (kind: 'shell-command', severity: 'destructive'); it does not constrain a command's own network or filesystem effects once appr"
- **[[c10]]** `code` `src/workflow/review-round/driver.ts` — "runRound calls hooks.ground(targets, round), then optionally hooks.security.call(...), and merges the two finding arrays -- nothing else. No checkpoint execution, reconciliation or persistence happens"
- **[[c11]]** `code` `src/workflow/review-round/receipt-record.ts` — "persistVerificationReceipt(repoPath, ident: { epicHash, storyId, now, standalone? }, receipt, through?) -- epicHash and storyId are required, non-optional fields of ident."
- **[[c12]]** `code` `src/agent/read-only-tool-loop.ts` — "The generic read-only tool loop: a model reads the repository through tools, turn by turn, until it stops asking for tools -- this requires a provider whose complete() returns tool calls."
- **[[c13]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "auditArgv: every supported manager (npm, pnpm, yarn, pip, pipenv, poetry, go, cargo) is marked nonZeroOk: true; the go case runs ['govulncheck', './...'], a source-tree walk, not a package-registry qu"
- **[[c14]]** `code` `src/agent/providers/cli-provider.ts` — "runReadOnlySession's own doc comment: claude uses --tools Read,Grep,Glob plus --allowedTools for the two insrc analyze tools; codex uses --sandbox read-only with its registered insrc MCP server still "
- **[[c15]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "auditArgv's pip case runs ['pip-audit', '-f', 'json'] -- no -r/--path argument naming the repository's own requirements file; pip-audit audits the active Python environment by default."
- **[[c16]]** `stakeholder` `Reviewer finding (HLD revision-3 review): govulncheck's and pip-audit's documented behavior` — "govulncheck normally queries vuln.go.dev [and requires source analysis], rather than a package registry. pip-audit audits the active Python environment by default; it does not select the repository's "
- **[[c17]]** `stakeholder` `User direction (this session, after 3 external review rounds on s2 LLD all finding the enforced-boundary/negative-access-test invariants unachievable without new sandbox infrastructure): the reviewer must have the same access privileges as the controller; sandboxing or constraining it would degrade review accuracy. Applied across the Epic design (s2 and s3).`
- **[[c18]]** `code` `src/mcp/server.ts` — "insrc_code_review_step / insrc_review_step are registered but stubbed: description 'Code/Design review functionality is being rewritten. This compatibility endpoint always returns an error without sta"
- **[[c19]]** `stakeholder` `User direction (this session): the security review needs its own new entry point (daemon IPC + MCP tool) mirroring insrc_code_review_step's phase-driven shape, since the general review orchestration this Epic could otherwise have embedded into does not exist yet.`

## 10. Open questions

- (s3 LLD) The epicHash/storyId mapping persistVerificationReceipt requires has no documented derivation from the Epic's pinned content identity; the s3 LLD must specify it explicitly before the persistence call can be implemented.
- (s3 LLD) The supplemental report structure carrying FR003's exploit-prerequisite/remediation/advisory-provenance content has no persistence mechanism specified yet -- the s3 LLD must decide whether it is a new stored artifact type or an in-memory assembly over the existing SecurityFinding/VerificationReceipt records.

## Resolved questions

- `q860d1b4e` — (s3 LLD) The epicHash/storyId mapping persistVerificationReceipt requires has no documented derivation from the Epic's pinned content identity; the s3 LLD must specify it explicitly before the persistence call can be implemented.
  - **resolved**: Derive identifiers deterministically — A security review is requested standalone (not necessarily tied to an in-progress insrc Epic/Story), so there is no natural existing epicHash/storyId to reuse, and persisting a NEW mapping table would be new persistent storage the HLD's own durability section explicitly rules out for this Epic. epicHash/storyId are instead derived purely as a function of the review's own pinned contentIdentity (sha256("security-review:" + contentIdentity) truncated for epicHash; a fixed storyId sentinel), so the same contentIdentity always re-derives the identical pair -- idempotent, no new storage, directly satisfying persistVerificationReceipt's required fields. _(2026-11-23T04:35:19.745Z)_
- `qfab24fea` — (s3 LLD) The supplemental report structure carrying FR003's exploit-prerequisite/remediation/advisory-provenance content has no persistence mechanism specified yet -- the s3 LLD must decide whether it is a new stored artifact type or an in-memory assembly over the existing SecurityFinding/VerificationReceipt records.
  - **resolved**: In-memory report assembly — The HLD's own durability section already states no new persistent storage is introduced for this Epic; the supplemental report is the review's RETURNED OUTPUT (like a build/validate result), not a tracked workflow artifact that needs its own lifecycle. Exploit-prerequisite/remediation/advisory-provenance content is carried in SecurityFinding's existing optional fixability field (already used this way elsewhere) plus sc2's SecurityAdvisoryEvidence; s3 assembles the final report shape by combining SecurityFinding[] and SecurityAdvisoryEvidence at render time, in-memory only. _(2026-11-23T04:35:29.250Z)_
- `q662db3c3` — (s3 LLD) The exact per-provider mechanism satisfying the three fixed denials (credential-location reads, out-of-scope reads, unauthorized MCP operations) must be specified and verified by a negative-access test per provider (claude, codex, vibe).
  - **retired**: (no choice) — Tagged (s3 LLD) in the HLD; out of s1's scope. Will resurface via review_deferred when authoring s3's LLD. SUPERSEDED at HLD revision 5: per explicit user direction, s3 dispatches through CliProvider.runReadOnlySession with the same access level every other CLI-backed session has; no additional denial/negative-access-test gate is specified. The underlying invariant this question answered no longer exists in the HLD. _(2026-11-22T06:28:19.541Z)_
- `q999e6e29` — (s2 LLD) The exact per-manager network-enforcement mechanism (process-level network confinement, an allowlisting proxy, or equivalent) satisfying the fixed pre-transmission-enforcement invariant must be chosen and tested.
  - **retired**: Mandatory allowlisting proxy — Confirmed via code search: this codebase has ZERO existing network-namespace/firewall/sandbox infrastructure (no netns, iptables, or process-confinement capability anywhere), so true OS-level process-level confinement is infeasible to build within this Story -- it would require root privileges and platform-specific code far beyond scope. A locally-run allowlisting proxy is buildable in pure Node, and every targeted package manager (npm/pnpm/yarn, pip/pipenv/poetry, go, cargo) already supports standard HTTP_PROXY/HTTPS_PROXY-style proxy configuration as a FIRST-CLASS, documented feature of that manager -- not a repurposed mechanism. s2 will additionally require a per-manager verification step (a decoy-destination connectivity probe against the local proxy with default-deny) before trusting that manager's traffic is actually confined; a manager whose proxy-respecting behavior cannot be verified is an explicit coverage gap (refused, never run unconfined), extending the per-manager mapping pattern the HLD already establishes. SUPERSEDED at HLD revision 5: per explicit user direction, the reviewer runs with the same host access as the controller across the whole Epic design; no network enforcement mechanism (proxy or otherwise) is built. The underlying invariant this question answered no longer exists in the HLD. _(2026-11-22T09:44:04.364Z)_
- `q7798674d` — (s2 LLD) Whether contentIdentity is implemented as an immutable materialized snapshot or a content hash over the pinned commit plus permitted dirty/untracked inputs is not decided here; either satisfies this HLD's invariant, but the choice and its change-detection behavior must be made explicit.
  - **resolved**: Deterministic content hash — A content hash over the pinned commit SHA plus a canonical (sorted, explicitly-scoped) representation of permitted dirty/untracked inputs is simpler and more directly testable than a materialized snapshot (no second on-disk copy of the repo to create/clean up), and change detection is just recomputation + comparison -- directly satisfying the HLD's fixed contentIdentity invariant without new storage. _(2026-11-22T09:44:19.592Z)_

## Citations

- **[[c1]]** `analyze-bundle` `insrc_analyze_step structural-map run (answerType structural-map) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "review-round is a 65-entity, 106,386-byte directory ... Import-graph: totalInDegree 0 ... totalOutDegree 15, heaviest on src/daemon/steps/resolve-repo.ts (6 edges) and src/workflow/artifact-core/types"
- **[[c2]]** `analyze-bundle` `insrc_analyze_step capability-discovery run (answerType capability-discovery) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "28 candidates evaluated in review-round: 0 clear-match, 7 partial-match (all data-shape only) ... No file selects a security model, isolates reviewer access, fetches a dependency advisory, or runs an "
- **[[c3]]** `code` `src/workflow/review-round/types.ts` — "RoundDriverHooks carries an optional security? hook, reserved and unimplemented."
- **[[c4]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "pkg_audit shells out via runShell, which inherits the host environment; it accepts only cwd and manager, with no approved-coordinate input or access policy."
- **[[c5]]** `code` `src/config/role-taxonomy.ts` — "RoleId is a plain string resolved to one of three tiers (core/mid/cheap, subject to the coreFloor clamp); there is no fourth, independently-selectable model axis."
- **[[c6]]** `prior-artifact` `BUILD-779e9a08142cb057-s1`
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts` — "toolCalling: false -- the CLI runs tools internally; complete() returns text and end_turn, never a tool call."
- **[[c8]]** `code` `src/shared/types.ts` — "ReadOnlySessionOpts carries only mode, connectionExecution, cwd, deadlineMs, internalRetry, stallMs and signal -- no tool-allowlist or access-policy field."
- **[[c9]]** `code` `src/daemon/tools/builtins/shell/access-policies.ts` — "SHELL_EXEC_ACCESS governs the human-approval gate for shell_* tool calls (kind: 'shell-command', severity: 'destructive'); it does not constrain a command's own network or filesystem effects once appr"
- **[[c10]]** `code` `src/workflow/review-round/driver.ts` — "runRound calls hooks.ground(targets, round), then optionally hooks.security.call(...), and merges the two finding arrays -- nothing else. No checkpoint execution, reconciliation or persistence happens"
- **[[c11]]** `code` `src/workflow/review-round/receipt-record.ts` — "persistVerificationReceipt(repoPath, ident: { epicHash, storyId, now, standalone? }, receipt, through?) -- epicHash and storyId are required, non-optional fields of ident."
- **[[c12]]** `code` `src/agent/read-only-tool-loop.ts` — "The generic read-only tool loop: a model reads the repository through tools, turn by turn, until it stops asking for tools -- this requires a provider whose complete() returns tool calls."
- **[[c13]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "auditArgv: every supported manager (npm, pnpm, yarn, pip, pipenv, poetry, go, cargo) is marked nonZeroOk: true; the go case runs ['govulncheck', './...'], a source-tree walk, not a package-registry qu"
- **[[c14]]** `code` `src/agent/providers/cli-provider.ts` — "runReadOnlySession's own doc comment: claude uses --tools Read,Grep,Glob plus --allowedTools for the two insrc analyze tools; codex uses --sandbox read-only with its registered insrc MCP server still "
- **[[c15]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "auditArgv's pip case runs ['pip-audit', '-f', 'json'] -- no -r/--path argument naming the repository's own requirements file; pip-audit audits the active Python environment by default."
- **[[c16]]** `stakeholder` `Reviewer finding (HLD revision-3 review): govulncheck's and pip-audit's documented behavior` — "govulncheck normally queries vuln.go.dev [and requires source analysis], rather than a package registry. pip-audit audits the active Python environment by default; it does not select the repository's "
- **[[c17]]** `stakeholder` `User direction (this session, after 3 external review rounds on s2 LLD all finding the enforced-boundary/negative-access-test invariants unachievable without new sandbox infrastructure): the reviewer must have the same access privileges as the controller; sandboxing or constraining it would degrade review accuracy. Applied across the Epic design (s2 and s3).`
- **[[c18]]** `code` `src/mcp/server.ts` — "insrc_code_review_step / insrc_review_step are registered but stubbed: description 'Code/Design review functionality is being rewritten. This compatibility endpoint always returns an error without sta"
- **[[c19]]** `stakeholder` `User direction (this session): the security review needs its own new entry point (daemon IPC + MCP tool) mirroring insrc_code_review_step's phase-driven shape, since the general review orchestration this Epic could otherwise have embedded into does not exist yet.`
