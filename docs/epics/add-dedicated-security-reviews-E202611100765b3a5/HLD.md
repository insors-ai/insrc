<!-- insrc:artifact HLD-0765b3a578e43eec -->

# HLD: add-dedicated-security-reviews

## Summary

**Tracker:** [insors-ai/insrc#155](https://github.com/insors-ai/insrc/issues/155)

A new, standalone security-review orchestration module pins one content identity for the whole review, resolves the configured security model, and enforces -- not merely records -- a per-manager network boundary while collecting dependency advisories in controller-side code against that pinned identity. The code-vulnerability pass runs as a CLI read-only session required to deny credential-location reads, out-of-scope reads, and unauthorized MCP operations (refusing a backend that cannot), against the SAME pinned identity. Both passes assemble into the already-typed SecurityFinding/VerificationReceipt shapes plus a supplemental report structure -- plugging into the shared review-round driver through its reserved security hook rather than redesigning any of that.

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

Before any Story runs, the caller pins a SecurityReviewSnapshot identified by a `contentIdentity`: EITHER an immutable materialized copy (a git worktree checked out once and left untouched for the whole review) OR a content hash covering the pinned commit plus every permitted dirty/untracked input -- a repository path, commit SHA and a boolean dirty flag do NOT uniquely identify the reviewed files (two different dirty trees can share a commit and dirty status), so `contentIdentity` is the one value both s2 and s3 execute against and the one value s3 recomputes/verifies before trusting s2's evidence, refusing on a mismatch rather than silently combining evidence from two different trees.

Three Stories then map to three responsibilities, split along a model/no-model line the existing providers actually support (confirmed by reading src/agent/providers/cli-provider.ts and src/agent/read-only-tool-loop.ts): s1 resolves and records the configured security model, dispatched LATER through CliProvider.runReadOnlySession.

s2 is entirely controller-side, deterministic code with NO model involvement, and OWNS two fixed invariants (mechanism deferred to the s2 LLD, but the invariant and the ownership are fixed here): (1) ENFORCEMENT, not mere recording, of each manager's approved destination -- the boundary must block any request to an unapproved destination BEFORE it leaves the process, covering redirects and secondary requests a native tool itself makes (e.g. a registry's own metadata-then-tarball fetch, or govulncheck's own vulnerability-database fetch); if that boundary cannot be established for a given manager/environment, s2 refuses to run that manager's audit rather than running it unconfined and only logging the destination afterward. (2) a documented per-manager INPUT/MODE mapping, because "scope the filesystem to the manifest/lockfile" does not fit every supported manager: npm/pnpm/yarn/cargo read only their own manifest+lockfile and fit that scope directly; pip-audit audits the ACTIVE Python environment by default and does NOT select the repository's requirements file merely because cwd points there, so s2 must build and point it at an isolated environment resolved from the pinned manifest, not rely on cwd; govulncheck performs source-level analysis across the module (`./...`), not a manifest read, so a go audit runs against a confined COPY of the pinned snapshot's module source, never a manifest-only view. A manager s2 cannot correctly scope or confine under this mapping produces an explicit coverage gap, never an unconfined or mis-targeted run.

s3 (depending on s1 and s2) owns the end-to-end sequence, and fixes a MINIMUM read-boundary requirement every CLI backend it dispatches through must meet (the exact per-provider flags are an s3 LLD decision, but the three denials and the refuse-if-unverifiable rule are fixed here): deny reads of credential locations, deny reads outside the pinned snapshot's own scope, and deny any MCP operation not explicitly authorized for this review -- verified by an actual NEGATIVE-access test per backend (attempting each denied action and confirming refusal), never by only checking that a restricting flag was supplied. s3 refuses to dispatch the code pass through a backend for which these three denials cannot be verified. s3 also invokes runReviewRound (review-round/driver.ts, which only calls ground + the optional security hook and merges their findings -- it does not itself execute a sandbox/mutation checkpoint, reconcile rounds, or persist anything), executes and owns that checkpoint, calls reconciliation, maps the review's pinned contentIdentity onto an epicHash/storyId identity (persistVerificationReceipt, receipt-record.ts, hard-requires both), persists VerificationReceipt entries through it, and owns checkpoint cleanup. s3 assembles SecurityFinding/SecurityEvidence from the code pass and a supplemental report structure from s2's SecurityAdvisoryEvidence, because SecurityFinding's own schema is additionalProperties:false and has no dedicated exploit-prerequisite/remediation/advisory-provenance fields.

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

**Purpose:** Carries s2's dependency-advisory collection outcome (controller-side, no model) across the boundary: the pinned contentIdentity it was collected against (so s3 can verify it recomputes/matches the same identity before trusting this evidence), the queried coordinates, the actual advisory matches with affected versions and provenance, the per-match advisory destination enforced (not merely observed), the per-manager input mode used (manifest-scoped | isolated-environment | confined-source-copy | unsupported), and the dependencies/sources that stayed unresolved, unavailable or unsupported -- so s3 can report confirmed affected dependencies and unverified coverage as DISTINCT values bound to the SAME content identity as its own code findings.

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
	readonly readOnly: true;
	readonly queriedCoordinates: readonly string[];
	readonly matches: readonly SecurityAdvisoryMatch[];
	readonly perManagerMode: readonly { readonly manager: string; readonly mode: 'manifest-scoped' | 'isolated-environment' | 'confined-source-copy' | 'unsupported'; }[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
}
```

**Assumptions cited:** [[k2]]

## 5. Story boundaries

### 5.1 Story STORY-0765b3a578e43eec-s1

**Owns:** `sc1`

Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question.

### 5.2 Story STORY-0765b3a578e43eec-s2

**Owns:** `sc2`

pkg_audit's package-manager resolution; the ENFORCED (not merely recorded) per-manager network boundary -- blocking any request to an unapproved destination before it leaves the process, including redirects and a tool's own secondary requests, and refusing to run a manager's audit at all when that enforcement cannot be established; the documented per-manager input/mode mapping (npm/pnpm/yarn/cargo: manifest+lockfile scope; pip/pipenv/poetry: an isolated environment resolved from the pinned manifest, never the ambient active environment pip-audit defaults to; go: a confined copy of the pinned snapshot's module source, since govulncheck performs source-level analysis, not a manifest read) with an explicit coverage gap for any manager s2 cannot correctly scope under that mapping; and the advisory-match collection that populates SecurityAdvisoryEvidence (stamped with the pinned contentIdentity) stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all. ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager nonZeroOk:true) from an EXECUTION GAP (spawn failure, unparseable output, an unsupported manager, or a manager s2's input/mode mapping cannot correctly scope) -- these are never conflated.

### 5.3 Story STORY-0765b3a578e43eec-s3

**Depends on:** `sc1`, `sc2`

The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a mismatch), using s1's resolved model, under a backend REQUIRED to deny credential-location reads, out-of-scope reads and unauthorized MCP operations -- verified per backend by an actual negative-access test (not merely confirming a restricting flag was passed), with s3 refusing to dispatch through a backend that cannot be so verified; the exact per-provider mechanism is an s3 LLD decision, the three denials and the refuse-if-unverifiable rule are fixed here. The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 6. Non-functional targets

- **Performance:** Not a stated constraint for this Epic; the new module's cost is bounded by one pkg_audit invocation (per confined manager) and one CLI read-only session per request, not a new background job.
- **Security:** The per-manager network boundary in s2 is ENFORCED before any request leaves the process (blocking unapproved destinations, redirects and a tool's own secondary requests), not merely observed and recorded afterward; a manager for which that boundary cannot be established is refused, not run unconfined. s2's filesystem/environment scope follows a documented per-manager mode (manifest-scoped for npm/pnpm/yarn/cargo; an isolated resolved environment for pip/pipenv/poetry, since pip-audit otherwise audits the ambient active environment; a confined source copy for go, since govulncheck performs source-level analysis) -- a manager outside that mapping is an explicit coverage gap, never a best-effort run against the wrong target. This is SEPARATE from the configured CLI model's own inference traffic (k1: routes through the installed CLI provider), which is expected and unrelated to dependency-advisory egress. s3's code-vulnerability pass is dispatched only through a CLI backend REQUIRED to deny credential-location reads, out-of-scope reads (outside the pinned contentIdentity), and unauthorized MCP operations -- each denial verified by a real negative-access test, not by checking that a flag exists; a backend that cannot be so verified is refused. The exact per-provider enforcement mechanism for both s2's and s3's boundaries is an s2/s3 LLD decision; the invariants, the owners, and the refuse-if-unenforceable rule are fixed by this HLD.
- **Observability:** Every checkpoint run -- pass or fail, whether or not a SecurityFinding corroborates it -- is recorded as a VerificationReceipt (already built, src/workflow/review-round/receipt-record.ts), so a security review's execution is auditable independent of its findings. s3 owns stamping that record with the epicHash/storyId persistVerificationReceipt requires, mapped from the review's own pinned contentIdentity.
- **Durability:** No new persistent storage is introduced for s1/s2's own outputs (SecurityModelSelection, SecurityAdvisoryEvidence are transient per-review values); the durable records are the already-typed SecurityFinding/VerificationReceipt heads the shared round-driver machinery (Epic 03f4fd3b9102aab8) persists, plus s3's new supplemental report structure (not yet a stored artifact type; its persistence mechanism is an open question for the s3 LLD).

## 7. Rollout

**Phase A -- foundational contracts (model selection and enforced advisory collection)**

**Stories:** `s1`, `s2`

s1 (SecurityModelSelection) and s2 (SecurityAdvisoryEvidence) are the two shared contracts s3 depends on; neither depends on the other, so they can land in either order or in parallel, but both must exist before s3 is buildable.

**Backward compat:** No existing behavior changes: s1 adds a new, independently-selectable model binding beside core/mid/cheap; s2 runs entirely controller-side with an enforced, per-manager-scoped pkg_audit invocation against the pinned content identity and touches no existing caller.

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
| Enforced (not observed) network boundary for pkg_audit (s2) | Recording a destination after a request is sent is not a boundary; without a real enforcement mechanism (process-level network confinement, an allowlisting proxy, or equivalent), the design would only document what happened, not prevent an unapproved disclosure, including redirects and a tool's own secondary requests. | s2's build must implement and test an ACTUAL pre-transmission enforcement mechanism per manager, and refuse (not run unconfined) any manager for which that mechanism cannot be established. |
| Per-manager input/mode correctness (s2) | govulncheck needs the module's source tree (not a manifest) and pip-audit defaults to the ambient active environment (not the repo's own requirements) -- a manifest-only scope would make these audits fail or assess the wrong target entirely. | s2's build must implement and test the documented per-manager mode (manifest-scoped / isolated-environment / confined-source-copy) for every supported manager, with an explicit coverage gap for any manager outside that mapping. |
| Minimum CLI read boundary verified by negative test (s3) | Confirming a restricting flag was passed to a CLI backend does not prove it refuses a credential-location read, an out-of-scope read, or an unauthorized MCP call -- only an actual attempt-and-confirm-refusal test does. | Gate s3's build behind negative-access tests (per supported provider) that attempt each of the three denied actions and assert refusal, not merely that an allowlist flag was supplied; refuse to ship dispatch through a provider that fails any of the three. |
| Content-identity consistency between advisory and code evidence (s2/s3) | A commit SHA plus a dirty boolean does not uniquely identify the reviewed files -- two different dirty trees can share both -- so comparing only those would not reliably catch evidence collected against two different trees. | The caller pins a contentIdentity (an immutable materialized snapshot, or a content hash covering the commit plus every permitted dirty/untracked input) before either Story runs; s3 recomputes/verifies the SAME contentIdentity against SecurityAdvisoryEvidence before trusting it, refusing on a mismatch. |

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

**Rejected because:** Reuses the reserved hook with the least new surface, but concentrates cross-cutting model-selection/isolation concerns in a directory that should stay generic, per the structural-map bundle (review-round currently has 0 indexed importers and a uniform convention this would blur with orchestration logic).

### 8.2 a2: Standalone security-review orchestration module, adapting into the hook — **CHOSEN**

A new sibling module owns model selection, enforced controller-side advisory collection against a pinned content identity, code-pass execution under a verified minimum read boundary, and reporting, and supplies review-round's RoundDriverHooks.security as a thin adapter.

FR001-FR003's actual logic lives in a new module outside review-round, which imports review-round's existing types and populates them, then exposes a thin function matching RoundDriverHooks.security's signature that driver.ts's runReviewRound calls. Model selection (FR001) is an independently-bindable configuration; dependency-advisory collection (FR002) is controller-side code with an enforced, per-manager-scoped pkg_audit invocation against the pinned content identity, with no model involvement at all; reporting (FR003) assembles the existing SecurityFinding/VerificationReceipt shapes plus a supplemental structure.

This keeps review-round itself unchanged except for the one call site that invokes the hook, preserving its role as generic round-driver machinery shared across review types (per Epic review-rounds-reconciliation-recovery, epicHash 03f4fd3b9102aab8).

**Pros:**
- review-round stays purely generic (data shapes + shared round driver); security-specific orchestration is isolated in its own module, easier to review and test without touching the shared driver's test suite.
- Model selection and network/filesystem-isolation logic sits nearer the config machinery and the controller-side process boundary they actually extend, rather than being colocated with the generic driver.

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

## 10. Open questions

- (s3 LLD) The epicHash/storyId mapping persistVerificationReceipt requires has no documented derivation from the Epic's pinned content identity; the s3 LLD must specify it explicitly before the persistence call can be implemented.
- (s3 LLD) The supplemental report structure carrying FR003's exploit-prerequisite/remediation/advisory-provenance content has no persistence mechanism specified yet -- the s3 LLD must decide whether it is a new stored artifact type or an in-memory assembly over the existing SecurityFinding/VerificationReceipt records.
- (s3 LLD) The exact per-provider mechanism satisfying the three fixed denials (credential-location reads, out-of-scope reads, unauthorized MCP operations) must be specified and verified by a negative-access test per provider (claude, codex, vibe).
- (s2 LLD) The exact per-manager network-enforcement mechanism (process-level network confinement, an allowlisting proxy, or equivalent) satisfying the fixed pre-transmission-enforcement invariant must be chosen and tested.
- (s2 LLD) Whether contentIdentity is implemented as an immutable materialized snapshot or a content hash over the pinned commit plus permitted dirty/untracked inputs is not decided here; either satisfies this HLD's invariant, but the choice and its change-detection behavior must be made explicit.

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
