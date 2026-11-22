<!-- insrc:artifact HLD-0765b3a578e43eec -->

# HLD: add-dedicated-security-reviews

## Summary

**Tracker:** [insors-ai/insrc#155](https://github.com/insors-ai/insrc/issues/155)

A new, standalone security-review orchestration module pins one snapshot identity for the whole review, resolves the configured security model, collects dependency advisories entirely in controller-side code (an isolated subprocess with no ambient credentials or config files, against each manager's own documented advisory destination) against that snapshot, runs the code-vulnerability pass as a CLI read-only session against the SAME snapshot, and assembles both into the already-typed SecurityFinding/VerificationReceipt shapes plus a supplemental report structure -- plugging into the shared review-round driver through its reserved security hook rather than redesigning any of that.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [Sequence](#9-sequence)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Problem context

> See **DEF-0765b3a578e43eec** § 1. Problem

## 2. Framework summary

The Epic adds a standalone orchestration module (outside src/workflow/review-round/) that owns model selection, dependency-advisory collection, code-assessment execution, and reporting, and supplies review-round's existing RoundDriverHooks.security hook as a thin adapter. review-round itself stays unchanged except for the one call site invoking that hook; the data shapes it already exports (SecurityFinding, SecurityLocator, EvidenceProvider, VerificationReceipt) are populated, never redefined.

## 3. Architecture shape

Before any Story runs, the caller pins a **SecurityReviewSnapshot** (repository path, resolved revision/commit identity, and a dirty-working-tree policy: refuse, or proceed and record the tree as dirty) -- both s2's advisory collection and s3's code pass execute against that SAME identity, never against whatever the working tree happens to be when each runs independently.

Three Stories then map to three responsibilities, split along a model/no-model line the existing providers actually support (confirmed by reading `src/agent/providers/cli-provider.ts` and `src/agent/read-only-tool-loop.ts`): s1 resolves and records the configured security model, dispatched LATER through `CliProvider.runReadOnlySession` -- the CLI's own internal session, started in a given cwd -- never through the generic read-only-tool-loop, which requires `provider.toolCalling=true` and `CliProvider` advertises `toolCalling:false` (its `complete()` returns text/end_turn, not tool calls).

s2 is entirely controller-side, deterministic code with NO model involvement: it resolves the project's package manager, runs pkg_audit under an ISOLATED execution context -- not just a sanitized environment, but also config-file isolation (overriding `HOME`/`XDG_CONFIG_HOME`/manager-specific config-file variables, e.g. `NPM_CONFIG_USERCONFIG`, to an empty/controlled location, since npm/pip/etc. read project- and user-level config files for registry and auth settings regardless of process-env credentials) and a filesystem scope limited to the manifest/lockfile the manager needs -- and records the per-manager advisory destination it actually reached: most managers query their configured package registry, but go's govulncheck queries vuln.go.dev, a named exception to "the package registry" documented per manager, not assumed uniform. `src/daemon/tools/builtins/shell/access-policies.ts` governs human-approval gating of `shell_*` tool calls, not subprocess network/credential isolation, and does not constrain pkg_audit's effects once approved -- it is **not** reused here for isolation; the boundary is the isolated execution context itself.

s3 (depending on s1 and s2) owns the end-to-end sequence: it runs the code-vulnerability pass via `CliProvider.runReadOnlySession` against the SAME pinned snapshot, with the s1-selected model, under whatever read boundary that SPECIFIC CLI backend actually enforces (claude: `--tools Read,Grep,Glob` plus `--allowedTools`; codex: `--sandbox read-only`, whose own insrc MCP server remains callable even in that mode) -- verified per provider, not assumed uniform from a cwd argument alone, since cwd only tells the session where to start, not what it is forbidden to read (credential locations, files outside the repo). s3 invokes `runReviewRound` (review-round/driver.ts, which only calls `ground` + the optional `security` hook and merges their findings -- it does not itself execute a sandbox/mutation checkpoint, reconcile rounds, or persist anything), executes and owns that checkpoint, calls reconciliation, maps the review's snapshot identity onto an epicHash/storyId identity (`persistVerificationReceipt`, receipt-record.ts, hard-requires both), persists VerificationReceipt entries through it, and owns checkpoint cleanup. s3 assembles SecurityFinding/SecurityEvidence from the code pass and a supplemental report structure from s2's SecurityAdvisoryEvidence, because SecurityFinding's own schema is `additionalProperties:false` and has no dedicated exploit-prerequisite/remediation/advisory-provenance fields -- FR003's richer report content lives in that supplemental structure, not inside SecurityFinding itself.

The module imports review-round's types; review-round never imports the new module, keeping the dependency direction one-way and the shared driver generic across every review type.

## 4. Shared contracts

### 4.1 sc1: SecurityModelSelection

**Owner Story:** `s1`
**Consumed by:** `s3`

**Purpose:** Carries s1's resolved security-model identity (or its unavailability) across the boundary so s3 can dispatch the code-vulnerability pass through `CliProvider.runReadOnlySession` with that exact model, record the effective model in the report without re-resolving it, and refuse with the blocker reason rather than falling back silently.

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

**Purpose:** Carries s2's dependency-advisory collection outcome (controller-side, no model) across the boundary: the pinned snapshot it was collected against, the queried coordinates, the actual advisory matches with affected versions and provenance, the per-match advisory destination actually reached, and the dependencies/sources that stayed unresolved or unavailable -- so s3 can report confirmed affected dependencies and unverified coverage as DISTINCT values bound to the SAME revision as its own code findings, not merge evidence from two different snapshots into an indistinguishable contract.

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
	readonly snapshotRevision: string;
	readonly readOnly: true;
	readonly queriedCoordinates: readonly string[];
	readonly matches: readonly SecurityAdvisoryMatch[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
}
```

**Assumptions cited:** [[k2]]

## 5. Story boundaries

### 5.1 Story STORY-0765b3a578e43eec-s1

**Owns:** `sc1`

Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap, since a role-taxonomy entry alone still resolves to one of those three tiers' already-configured models) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question, not a mechanical config addition.

### 5.2 Story STORY-0765b3a578e43eec-s2

**Owns:** `sc2`

pkg_audit's package-manager resolution; the ISOLATED execution context it launches under -- a sanitized process environment AND config-file isolation (`HOME`/`XDG_CONFIG_HOME`/manager-specific config overrides, since credential/registry settings in project- and user-level config files, e.g. `.npmrc`, survive environment-variable sanitization alone) AND a filesystem scope limited to the manifest/lockfile; the per-manager advisory destination actually reached (most managers: their configured package registry; go: vuln.go.dev, a documented exception); the approved-coordinate restriction (only the pinned snapshot's own declared dependencies are ever queried); and the advisory-match collection that populates SecurityAdvisoryEvidence stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all; isolation here is a property of the execution context itself, not of any access-policy or tool-allowlist mechanism (none of the existing ones constrain pkg_audit's own network/credential/filesystem effects once it runs). ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager `nonZeroOk:true`, since e.g. npm audit exits non-zero exactly when it finds something) from an EXECUTION GAP (the manager binary is missing/spawn fails, the expected JSON cannot be parsed, or the manager is unsupported) -- these are never conflated.

### 5.3 Story STORY-0765b3a578e43eec-s3

**Depends on:** `sc1`, `sc2`

The RoundDriverHooks.security adapter function; the `CliProvider.runReadOnlySession` dispatch of the code-vulnerability pass against the SAME pinned snapshot s2 collected against, using s1's resolved model, under whatever read boundary the specific CLI backend (claude/codex/vibe) actually enforces -- specified per provider in the s3 LLD, including its credential-location exclusions and (for codex) its own MCP-server access scope, never assumed uniform from a cwd argument alone; the call into `runReviewRound` and the separate ownership of everything `runReviewRound` itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned snapshot identity onto the epicHash/storyId identity `persistVerificationReceipt` requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure (for FR003's exploit-prerequisite, remediation and advisory-provenance content SecurityFinding's own closed schema has no field for) stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report, and refuses (or explicitly flags, per the snapshot's dirty-working-tree policy) a mismatch between its own working tree and SecurityAdvisoryEvidence.snapshotRevision.

## 6. Non-functional targets

- **Performance:** Not a stated constraint for this Epic; the new module's cost is bounded by one pkg_audit invocation and one CLI read-only session per request, not a new background job.
- **Security:** The only process that reaches a DEPENDENCY-ADVISORY network destination anywhere in this Epic is pkg_audit's subprocess (s2), run under an isolated execution context (sanitized environment AND config-file isolation, since credential/registry settings in project-/user-level config files survive env-var sanitization alone) against each manager's own documented destination -- most managers' configured package registry, but go's govulncheck against vuln.go.dev as a named exception; a manager/destination pkg_audit cannot reach is an explicit gap (ac2), never silently skipped, and is distinct from a successful audit that simply found vulnerabilities (non-zero exit is NOT itself a gap -- pkg_audit's own auditArgv already treats it as a valid outcome for every supported manager). This is SEPARATE from the configured CLI model's own inference traffic (k1: routes through the installed CLI provider, never a direct REST path), which is expected and unrelated to dependency-advisory egress. The security model's OWN repository access during s3's code-vulnerability pass is bounded by whatever read restriction the specific CLI backend enforces for its read-only session (claude: `--tools Read,Grep,Glob` plus `--allowedTools`; codex: `--sandbox read-only`) -- NOT by the cwd argument alone (which only sets where the session starts, not what it is forbidden to read) and NOT by the generic read-only-tool-loop/access-policy allowlist, which CliProvider cannot run (`toolCalling:false`) and which (`src/daemon/tools/builtins/shell/access-policies.ts`) governs human-approval gating of `shell_*` calls in any case, not subprocess network/credential isolation. The exact per-provider read boundary (credential-location exclusions, codex's own callable MCP server) is an open question for the s3 LLD, not settled by this HLD.
- **Observability:** Every checkpoint run -- pass or fail, whether or not a SecurityFinding corroborates it -- is recorded as a VerificationReceipt (already built, src/workflow/review-round/receipt-record.ts), so a security review's execution is auditable independent of its findings. s3 owns stamping that record with the epicHash/storyId `persistVerificationReceipt` requires, mapped from the review's own pinned snapshot identity.
- **Durability:** No new persistent storage is introduced for s1/s2's own outputs (SecurityModelSelection, SecurityAdvisoryEvidence are transient per-review values); the durable records are the already-typed SecurityFinding/VerificationReceipt heads the shared round-driver machinery (Epic 03f4fd3b9102aab8) persists, plus s3's new supplemental report structure (not yet a stored artifact type; its persistence mechanism is an open question for the s3 LLD) carrying the exploit-prerequisite/remediation/advisory-provenance content SecurityFinding's own schema has no field for.

## 7. Rollout

**Phase A -- foundational contracts (model selection and advisory collection)**

**Stories:** `s1`, `s2`

s1 (SecurityModelSelection) and s2 (SecurityAdvisoryEvidence) are the two shared contracts s3 depends on; neither depends on the other, so they can land in either order or in parallel, but both must exist before s3 is buildable.

**Backward compat:** No existing behavior changes: s1 adds a new, independently-selectable model binding beside core/mid/cheap (not merely a role-taxonomy entry that resolves to one of those three); s2 runs entirely controller-side with an isolated pkg_audit invocation against the pinned snapshot and touches no existing caller.

**Phase B -- run and report the security-only review**

**Stories:** `s3`
**Flag:** `security-only-review`

s3 depends on both s1 and s2 per the Epic's own dependency graph and consumes both shared contracts (sc1, sc2); it cannot start until Phase A lands.

**Backward compat:** s3 adds the RoundDriverHooks.security adapter and the one new call site into runReviewRound; review-round's existing behavior for other review types (code, design) is unchanged since the hook is optional and currently unset.

**Ordering rationale:** Phase ordering follows the Epic's own Story dependency edges: s3 declares dependsOn [s1, s2], and the HLD's shared contracts (sc1 owned by s1, sc2 owned by s2, both consumed only by s3) confirm s3 has nothing to consume until both land. s1 and s2 have no dependency between them and own disjoint contracts, so they are grouped into one phase rather than sequenced against each other.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Independently-selectable security model (s1) | Adding a role-taxonomy.ts entry alone still resolves to one of the existing core/mid/cheap tier's already-configured models; it does not by itself create a FOURTH, independently-bindable model axis, and its interaction with coreFloor enforcement and unavailable-model handling is undecided. | s1's LLD must specify the actual configuration contract for the independent binding (a distinct config key/provider identity, not a role-taxonomy RoleId alone) before any build task starts. |
| pkg_audit isolation beyond environment sanitization (s2) | Stripping process-env credentials does not stop npm/pip/etc. from reading project- or user-level config files (e.g. `.npmrc`) that carry their own registry/auth settings, and does not fit every manager uniformly -- go's govulncheck queries vuln.go.dev, not a package registry at all. | s2's build must isolate config-file locations (HOME/XDG/manager-specific overrides) in addition to the environment, document each supported manager's actual advisory destination, and test that neither ambient credentials nor ambient config files leak into the subprocess. |
| CLI model dispatch for the code pass (s3) | CliProvider advertises toolCalling:false and its complete() never returns tool calls, so the generic read-only-tool-loop cannot run against it; ReadOnlySessionOpts (its own alternate path) carries no tool-allowlist or access-policy field at all, only cwd/deadline/retry knobs -- cwd tells the session where to start, not what it is forbidden to read. | Gate s3's build behind an integration test that actually dispatches the configured CLI model through runReadOnlySession end-to-end for EACH supported provider, verifying its own real read-boundary flags (not assuming they exist from cwd alone), before the feature flag is enabled. |
| epicHash/storyId mapping for receipt persistence (s3) | persistVerificationReceipt hard-requires an epicHash and storyId; the Epic's own acceptance criteria describe a repository-scope-and-revision request with no documented mapping to that identity. | s3's LLD must specify that mapping explicitly (e.g. a standalone epicHash/storyId minted per security review) before the persistence call can be implemented. |
| Snapshot consistency between advisory and code evidence (s2/s3) | Without a single pinned revision both Stories execute against, a working tree that changes between s2's collection and s3's assessment would let the report combine dependency evidence from one revision with code findings from another. | The caller pins a SecurityReviewSnapshot before either Story runs; s3 refuses or explicitly flags (per the snapshot's own dirty-working-tree policy) a mismatch against SecurityAdvisoryEvidence.snapshotRevision rather than silently combining mismatched evidence. |

## 8. Alternatives considered

### 8.1 a1: Security-hook module inside review-round

Add a new sibling file in src/workflow/review-round/ that implements RoundDriverHooks.security directly, alongside the existing extension-point files.

A new file (e.g. security-review.ts) sits beside security-finding.ts/security-locator.ts/evidence-provider.ts/receipt-record.ts inside src/workflow/review-round/, implementing the reserved RoundDriverHooks.security?(targets, round) hook from types.ts. It owns FR001 (resolving the configured security model, reporting the blocker on an unavailable one with no silent fallback), FR002 (collecting dependency advisories and isolating credential/network access), and FR003 (assembling SecurityFinding/SecurityEvidence results and VerificationReceipt entries from a sandbox/mutation checkpoint run). runReviewRound (driver.ts) already accepts the hook; a daemon RPC/MCP entry point supplies it when a caller asks for a security-only review.

Because review-round's own import-graph shows totalInDegree 0 (nothing imports it as a module today; it is reached only via daemon RPC), colocating keeps every security-aware file under one directory and one set of naming/test conventions (camelCase functions, PascalCase classes, *.test files) without inventing a new module boundary.

**Pros:**
- Reuses the EXACT reserved extension point (RoundDriverHooks.security) the prior Story built for this purpose -- no new wiring contract needed on the driver side.
- All security-aware code (finding/locator/evidence/receipt/schema/hook) lives under one directory with one naming convention, confirmed by convention.detect (camelCase/PascalCase/snake_case, *.test).
- Smallest new-module surface: no new top-level directory, no new import-graph edge class to maintain.

**Cons:**
- Grows review-round's own entity count (currently 65 entities / 106,386 bytes) with security-specific orchestration logic that the OTHER review types (code, design) never touch, diluting the directory's generic-round-driver identity.
- Model-selection (FR001) and advisory-isolation (FR002) concerns are themselves cross-cutting (model tiering, subprocess/config-file isolation) and arguably belong nearer src/config/role-taxonomy.ts and the controller-side orchestration code than inside review-round.

**Cost estimate:** M

**Rejected because:** Reuses the reserved hook with the least new surface, but concentrates cross-cutting model-selection/isolation concerns in a directory that should stay generic, per the structural-map bundle (review-round currently has 0 indexed importers and a uniform camelCase/PascalCase convention this would blur with orchestration logic).

### 8.2 a2: Standalone security-review orchestration module, adapting into the hook — **CHOSEN**

A new sibling module (e.g. src/workflow/security-review/) owns model selection, controller-side advisory collection against a pinned snapshot, code-pass execution, and reporting, and supplies review-round's RoundDriverHooks.security as a thin adapter.

FR001-FR003's actual logic lives in a new module outside review-round, which imports review-round's existing types (SecurityFinding, SecurityLocator, EvidenceProvider, VerificationReceipt) and populates them, then exposes a thin function matching RoundDriverHooks.security's signature that driver.ts's runReviewRound calls. Model selection (FR001) is an independently-bindable configuration, distinct from role-taxonomy's core/mid/cheap tiers, dispatched through CliProvider.runReadOnlySession for the code-vulnerability pass; dependency-advisory collection (FR002) is controller-side code with an isolated pkg_audit invocation (sanitized environment, isolated config-file locations, a per-manager documented destination) against the same pinned snapshot, with no model involvement at all; reporting (FR003) assembles the existing SecurityFinding/VerificationReceipt shapes plus a supplemental structure for the fields they do not carry.

This keeps review-round itself unchanged except for the one call site that invokes the hook, preserving its role as generic round-driver machinery shared across review types (per Epic review-rounds-reconciliation-recovery, epicHash 03f4fd3b9102aab8).

**Pros:**
- review-round stays purely generic (data shapes + shared round driver); security-specific orchestration is isolated in its own module, easier to review and test without touching the shared driver's test suite.
- Model selection and advisory-isolation logic sits nearer the config machinery and the controller-side process boundary they actually extend, rather than being colocated with the generic driver.

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
- Reviewers get two different round-cycle behaviors (shared vs security-only) to reason about instead of one, raising long-term maintenance cost for no stated benefit.

**Cost estimate:** L

**Rejected because:** Duplicates machinery the review-rounds-reconciliation-recovery Epic (03f4fd3b9102aab8) already generalized, leaving the reserved RoundDriverHooks.security hook (confirmed unimplemented by the capability-discovery bundle) unused and raising long-term maintenance cost for no constraint benefit over a1/a2.

## 9. Sequence

The end-to-end security-only review: a snapshot is pinned first, so s2's controller-side advisory collection and s3's code-vulnerability pass both run against the SAME revision. Only pkg_audit (inside s2) reaches a dependency-advisory network destination; the model's own inference traffic (inside s3) is separate and expected.

| Step | From | To | Message |
| :--- | :--- | :--- | :--- |
| 1 | Review requester | SecurityReviewSnapshot | pin repository path + revision + dirty-tree policy |
| 2 | SecurityReviewSnapshot | Review requester | SecurityReviewSnapshot |
| 3 | Review requester | s1 | resolve configured security model |
| 4 | s1 | Review requester | SecurityModelSelection (configured \| unavailable) |
| 5 | Review requester | s2 | collect dependency advisories against the pinned snapshot |
| 6 | s2 | pkg_audit | run audit (isolated env + config, resolved manager) |
| 7 | pkg_audit | s2 | advisory matches (any exit code) \| execution gap (spawn/parse/unsupported-manager failure) |
| 8 | s2 | Review requester | SecurityAdvisoryEvidence (stamped with the snapshot revision) |
| 9 | Review requester | s3 | run security review (SecurityModelSelection, SecurityAdvisoryEvidence, pinned snapshot) |
| 10 | s3 | s3 | check SecurityAdvisoryEvidence.snapshotRevision against the pinned snapshot -- refuse or flag per the dirty-working-tree policy on a mismatch |
| 11 | s3 | runReviewRound | runReviewRound(hooks incl. security) |
| 12 | runReviewRound | s3 | security?.call(hooks, targets, round) -- the code-vulnerability pass |
| 13 | s3 | s3 | CliProvider.runReadOnlySession(pinned snapshot, s1's model) -- the CLI's own internal session; the real read boundary is provider-specific (claude --tools/--allowedTools, codex --sandbox read-only), not the generic tool-loop (toolCalling:false) and not cwd alone |
| 14 | runReviewRound | s3 | merged findings (ground + security) |
| 15 | s3 | s3 | execute + own sandbox/mutation checkpoint; reconcile -- driver.ts does none of this itself |
| 16 | s3 | persistVerificationReceipt | persistVerificationReceipt(epicHash, storyId mapped from the pinned snapshot, receipt) |
| 17 | s3 | Review requester | security-only review report (SecurityFinding[] + supplemental structure) |

*A companion sequence diagram (generated from this HLD's `sequenceDefinition`) is pending the next `insrc_docgen`/companion-render pass; the table above is the source of truth in the interim.*

## 10. References

- **[[c1]]** `analyze-bundle` `insrc_analyze_step structural-map run (answerType structural-map) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "review-round is a 65-entity, 106,386-byte directory ... Import-graph: totalInDegree 0 ... totalOutDegree 15, heaviest on src/daemon/steps/resolve-repo.ts (6 edges) and src/workflow/artifact-core/types"
- **[[c2]]** `analyze-bundle` `insrc_analyze_step capability-discovery run (answerType capability-discovery) over src/workflow/review-round -- this HLD's own s1 context.assemble step` — "28 candidates evaluated in review-round: 0 clear-match, 7 partial-match (all data-shape only) ... No file selects a security model, isolates reviewer access, fetches a dependency advisory, or runs an "
- **[[c3]]** `code` `src/workflow/review-round/types.ts` — "RoundDriverHooks carries an optional security? hook, reserved and unimplemented."
- **[[c4]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "pkg_audit shells out via runShell, which inherits the host environment; it accepts only cwd and manager, with no approved-coordinate input or access policy."
- **[[c5]]** `code` `src/config/role-taxonomy.ts` — "RoleId is a plain string resolved to one of three tiers (core/mid/cheap, subject to the coreFloor clamp); there is no fourth, independently-selectable model axis."
- **[[c6]]** `prior-artifact` `BUILD-779e9a08142cb057-s1`
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts` — "toolCalling: false -- the CLI runs tools internally; complete() returns text and end_turn, never a tool call."
- **[[c8]]** `code` `src/shared/types.ts` — "ReadOnlySessionOpts carries only mode, connectionExecution, cwd, deadlineMs, internalRetry, stallMs and signal -- no tool-allowlist or access-policy field."
- **[[c9]]** `code` `src/daemon/tools/builtins/shell/access-policies.ts` — "SHELL_EXEC_ACCESS governs the human-approval gate for shell_* tool calls (kind: 'shell-command', severity: 'destructive'); it does not constrain a command's own network or filesystem effects once approved."
- **[[c10]]** `code` `src/workflow/review-round/driver.ts` — "runRound calls hooks.ground(targets, round), then optionally hooks.security.call(...), and merges the two finding arrays -- nothing else. No checkpoint execution, reconciliation or persistence happens here."
- **[[c11]]** `code` `src/workflow/review-round/receipt-record.ts` — "persistVerificationReceipt(repoPath, ident: { epicHash, storyId, now, standalone? }, receipt, through?) -- epicHash and storyId are required, non-optional fields of ident."
- **[[c12]]** `code` `src/agent/read-only-tool-loop.ts` — "The generic read-only tool loop: a model reads the repository through tools, turn by turn, until it stops asking for tools -- this requires a provider whose complete() returns tool calls."
- **[[c13]]** `code` `src/daemon/tools/builtins/pkg/index.ts` — "auditArgv: every supported manager (npm, pnpm, yarn, pip, pipenv, poetry, go, cargo) is marked nonZeroOk: true; the go case runs ['govulncheck', './...'], not a package-registry query."
- **[[c14]]** `code` `src/agent/providers/cli-provider.ts` — "runReadOnlySession's own doc comment: claude uses --tools Read,Grep,Glob plus --allowedTools for the two insrc analyze tools; codex uses --sandbox read-only with its registered insrc MCP server still callable. cwd alone establishes neither restriction."

## 11. Open questions

- (s3 LLD) The epicHash/storyId mapping persistVerificationReceipt requires has no documented derivation from the Epic's pinned snapshot identity; the s3 LLD must specify it explicitly before the persistence call can be implemented.
- (s3 LLD) The supplemental report structure carrying FR003's exploit-prerequisite/remediation/advisory-provenance content (not fields on SecurityFinding's own closed schema) has no persistence mechanism specified yet -- the s3 LLD must decide whether it is a new stored artifact type or an in-memory assembly over the existing SecurityFinding/VerificationReceipt records.
- (s3 LLD) The exact per-provider read boundary for CliProvider.runReadOnlySession (claude's --tools/--allowedTools flags, codex's --sandbox read-only and its own callable MCP server, vibe's own session shape) must be verified and specified individually -- this HLD establishes that cwd alone is not sufficient, not what each provider's real boundary is.
- (s2 LLD) The dirty-working-tree policy for the pinned SecurityReviewSnapshot (refuse vs. proceed-and-flag) is named here as a required decision but not made; the s2/s3 LLDs must settle it.
