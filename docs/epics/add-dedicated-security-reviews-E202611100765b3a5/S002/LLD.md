<!-- insrc:artifact LLD-0765b3a578e43eec-s2 -->

# LLD: STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`

This Story checks a repository's dependencies against public advisories. The reviewer runs with the SAME host access as the controller itself -- no sandboxing is attempted. contentIdentity is ONE shared, simple digest over exactly the caller-scoped review content (targets.entries' own files, read directly, plus the repo's HEAD sha) -- the SAME function s3 calls over the SAME scope, so an application-source edit with unchanged manifests still changes the identity whenever that source is part of the reviewed scope (ensuring it is, is the orchestrator's job). Before trusting any manager's audit against that pinned identity, s2 verifies that manager's own required-input closure (a requirements file's nested -r/-c references; a go module's full source tree) is actually covered by targets.entries; a manager whose closure reaches outside the pinned scope is an explicit coverage gap, never silently audited anyway. s2 re-verifies the identity immediately after collection completes and stamps contentStable. Each package manager is pointed at the repository's own actual dependencies, with exact-locked versions preferred over a fresh, possibly-different resolution wherever a lockfile exists, and any dependency whose source cannot be faithfully exported (a non-PyPI source, or a version range rather than an exact pin) is reported as an explicit, labeled gap rather than silently audited as if it were an exact match. Every manager's CONFIGURED destination is recorded per manager, including for a clean or failed run.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-0765b3a578e43eec** § 2. Framework summary

**Rollout phase:** Phase A -- foundational contracts (model selection and dependency-advisory collection)
**Owns:** `sc2` (SecurityAdvisoryEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question. — owns `sc1`
- `s3`: The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against -- computed by the SAME shared computeContentIdentity function over the SAME targets.entries, so it is already a true single identity covering both the application source s3 reviews and the dependency manifests s2 audits, not two independently-scoped values that merely share a name. s3 recomputes/verifies it (refusing on a content MISMATCH or on sc2.contentStable=false), using s1's resolved model, with the SAME host access every other CLI-backed session in this codebase already has. The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do; the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; constructing targets.entries itself so it covers everything BOTH passes need (the orchestrator's job, upstream of both s2 and s3); and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `computeContentIdentity`

```typescript
function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string>
```

**Parameters:**
- `repoPath: string` — The registered repo root git_rev_parse runs against, and the base every targets.entries path is resolved and validated against.
- `targets: ReviewTargets` — The round's submitter-owned content list; computeContentIdentity hashes EXACTLY these files -- it is NOT manager-aware and does not expand into a per-manager closure. This is the single, shared function s3 also calls over the SAME targets, so the identity covers whatever scope the caller (the orchestrator) assembled for the whole review, application source included.

**Returns:** `Promise<string>` — A deterministic digest over the repo's HEAD commit sha plus a sha256 of every file named in targets.entries' actual, current raw bytes -- read and hashed unconditionally, never gated on git status. Called by s2 twice (before and immediately after collection) and independently by s3 before trusting s2's evidence; all three calls use the identical function and the identical targets, so they can only diverge if the repository's content itself diverged between calls.

**Errors:**
- `Error` when the target repository's git state cannot be read (not a git repository, repoPath not registered, or the underlying git_rev_parse call fails)
- `Error` when a targets.entries path resolves outside repoPath

**Preconditions:**
- repoPath is a registered repo root with a resolvable HEAD

**Postconditions:**
- pure function of the repo's current file bytes, repoPath and targets.entries -- calling it twice with no intervening change to targets.entries' files yields the identical string
- hashes ONLY the files named in targets.entries -- no manager-specific expansion, no narrowing to a 'dependency-only' subset
- hashes raw file bytes directly -- never delegates to git_hash_object or relies on git status to decide which files to include

### 2.2 `verifyManagerClosureCoverage`

```typescript
function verifyManagerClosureCoverage(repoPath: string, targets: ReviewTargets, manager: Manager, manifestDir: string): Promise<{ covered: true } | { covered: false; missing: readonly string[] }>
```

**Parameters:**
- `repoPath: string` — Same registered repo root used throughout.
- `targets: ReviewTargets` — The pinned review scope contentIdentity was computed over.
- `manager: Manager` — Which package manager's required-input closure to resolve (determines whether nested -r/-c resolution or a go module source walk applies).
- `manifestDir: string` — The directory enumerateManagers found this manager's manifest in.

**Returns:** `Promise<{ covered: true } | { covered: false; missing: readonly string[] }>` — Resolves this manager's own required-input closure (a requirements file's nested -r/-c references; a go module's full source tree) and checks whether every file in it is ALREADY present in targets.entries -- the same scope contentIdentity was pinned over. covered:false lists the files the closure needs that targets.entries does not cover; collectDependencyAdvisories treats this as an explicit coverage gap for that manager (never a silent audit against an unverified scope).

**Postconditions:**
- never mutates or expands targets.entries or contentIdentity -- purely a read-only coverage check

### 2.3 `collectDependencyAdvisories`

```typescript
function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence>
```

**Parameters:**
- `repoPath: string` — Same registered repo root as computeContentIdentity; also the root enumerateManagers walks to find every manifest in scope.
- `targets: ReviewTargets` — Bounds which manifests/managers are in scope for this collection, same as computeContentIdentity's targets.

**Returns:** `Promise<SecurityAdvisoryEvidence>` — sc2's full result: contentIdentity (computed BEFORE running any manager's audit, over targets.entries exactly), contentStable, queriedCoordinates, matches, perManagerMode (each entry carrying configuredDestination), unresolvedDependencies, and unavailableSources.

**Errors:**
- `Error` propagated from computeContentIdentity's own repoPath-level precondition failure (not a git repository, or repoPath itself not registered) -- there is no sensible per-manager recovery for a broken precondition affecting the whole call

**Preconditions:**
- enumerateManagers(repoPath, targets) has found at least an attempt-worthy manifest, or the result is an all-gaps SecurityAdvisoryEvidence

**Postconditions:**
- computes contentIdentity once before any manager runs, then again immediately after the last manager's audit completes; contentStable is false whenever these two values differ
- for each manager enumerateManagers finds, calls verifyManagerClosureCoverage BEFORE auditing it; a manager whose closure is not covered(:false) is recorded perManagerMode 'unsupported' with the missing files noted, and pkg_audit is never invoked for it
- every manager it actually audits runs with the SAME host access as the controller itself, directly against repoPath
- prefers each manager's EXACT locked version wherever a lockfile exists (pipenv/poetry regenerate from Pipfile.lock/poetry.lock; a lockfile entry with a non-PyPI source or a marker that cannot be faithfully exported is excluded from the generated file and added to unresolvedDependencies, never silently mis-exported); for plain pip, any requirements.txt entry that is not an exact `==` pin is added to unresolvedDependencies (version-uncertain) even though pip-audit still runs best-effort against the file
- records, per manager, the configuredDestination it was set up to reach -- persisted on EVERY perManagerMode entry, including a manager that found nothing or failed
- every coordinate in queriedCoordinates was actually attempted; exactly the ones with a confirmed advisory finding also appear in matches; exactly the ones that could not be resolved or checked at all also appear in unresolvedDependencies; a coordinate successfully checked and found clean appears in queriedCoordinates ONLY -- this is not an omission
- never throws due to a manager-level audit or closure-coverage failure -- each becomes an explicit perManagerMode/unavailableSources/unresolvedDependencies entry; MAY propagate a repoPath-level precondition failure from computeContentIdentity, since that affects the whole call, not one manager

### 2.4 `createDependencySbomEvidenceProvider`

```typescript
function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider
```

**Parameters:**
- `repoPath: string` — Captured in the returned provider's closure and forwarded to collectDependencyAdvisories on every run() call.

**Returns:** `EvidenceProvider` — An object with category:'dependency-sbom' whose run(input) calls collectDependencyAdvisories(repoPath, input.targets) and maps its matches into the thin EvidenceProviderOutput.evidence.

**Postconditions:**
- the returned object satisfies the EvidenceProvider interface exactly

## 3. Data model changes

### 3.1 `pkgAuditTool inputSchema + execute -- new optional requirementsPath field` — field-add

Unchanged from revision 4: one optional `requirementsPath?: string` property, appended as `-r <requirementsPath>` only when provided; omitted, every manager's behavior is byte-for-byte identical to today.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`
- `src/daemon/tools/builtins/pkg/index.ts:468-507`

### 3.2 `requirementsPath generation + lifecycle, with faithful-export gaps` — new

CURRENT INVARIANT BEING REPLACED (revision 4): pipenv/poetry regenerated a requirements file from EVERY {name, version} pair in Pipfile.lock/poetry.lock, discarding environment markers, extras, and non-PyPI sources (git/path/url). NEW behavior: only lockfile entries that are plain-PyPI-sourced, with a marker/extras shape pip's own requirements-file format can represent without loss, are exported as `name==version[; marker]` lines; an entry with a git/path/url source, or a marker too complex to export faithfully, is EXCLUDED from the generated file and added to unresolvedDependencies with a note identifying it as a non-standard-source gap, never silently mis-exported as an ordinary public-index package. For plain pip: use the repository's own requirements.txt directly via requirementsPath; any line that is not an exact `==` pin is separately recorded in unresolvedDependencies as version-uncertain (pip-audit still runs against the file best-effort, but that entry's result is not treated as exact-locked evidence). Any generated file is written to a per-call-unique temp path and removed in a finally block.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.3 `verifyManagerClosureCoverage (replaces revision-4's hash-expanding transitive closure)` — field-modify

CURRENT INVARIANT BEING REPLACED (revision 4): the required-input resolver's transitive closure (nested -r/-c; go's full module source) was folded DIRECTLY into computeContentIdentity's own hash, making computeContentIdentity manager-aware and giving it a DIFFERENT scope than whatever s3 might hash over the same targets -- defeating the HLD's 'one shared contentIdentity both s2 and s3 execute against' invariant, since s3 has no reason to run s2's manager-specific expansion. NEW behavior: computeContentIdentity goes back to being a simple, shared, non-manager-aware function (hash of targets.entries only). The transitive closure resolution becomes a SEPARATE verification (verifyManagerClosureCoverage) that checks whether a manager's required inputs are already covered by targets.entries, WITHOUT changing what gets hashed. A manager whose closure is not covered is a coverage gap, never silently audited.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.4 `Post-audit contentIdentity re-verification -> SecurityAdvisoryEvidence.contentStable` — new

Unchanged from revision 4: collectDependencyAdvisories calls the (now simplified) computeContentIdentity once before and once after collection; contentStable is true only when both calls return the identical string. Establishes equality at the two sampling points, not proof that no mutation occurred strictly between them -- documented, not overclaimed.

### 3.5 `configuredDestination recording` — new

Unchanged from revision 4: pkg_audit's own output carries no network trace, so s2 records each manager's CONFIGURED destination (never claimed as observed), attached to EVERY perManagerMode entry including a clean or failed run.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.6 `Repository-root threading (repoPath)` — field-add

Unchanged from revision 3/4: every s2-owned function takes an explicit repoPath; every targets.entries path is validated as resolving inside it.

**Call sites:**
- `src/workflow/artifact-core/types.ts:345-347`

### 3.7 `enumerateManagers` — new

Unchanged from revision 3: walks every manifest/lockfile signal within repoPath bounded by targets.entries' own directories, flagging same-directory ambiguity rather than guessing.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:47-79`

### 3.8 `Per-manager raw-audit-output -> SecurityAdvisoryMatch[] mapper` — new

Unchanged: translates each manager's own result shape into the common SecurityAdvisoryMatch[] shape; an unparseable result is an explicit gap.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.9 `SecurityAdvisoryEvidence (sc2)` — new

The HLD-defined output record this Story owns (HLD revision 6): { contentIdentity, contentStable, readOnly: true, queriedCoordinates, matches, perManagerMode (each entry carrying configuredDestination), unresolvedDependencies, unavailableSources }.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | collectDependencyAdvisories computes contentIdentity over exactly targets.entries (the same shared function s3 calls, so the identity genuinely covers whatever scope the orchestrator assembled, application source included), verifies each manager's required-input closure is covered by that scope before auditing it, prefers exact-locked versions wherever available, records each manager's configuredDestination, recomputes contentIdentity after collection to stamp contentStable, and maps each manager's output into SecurityAdvisoryMatch[]. s3 consumes the returned value directly to recompute and verify contentIdentity before trusting the evidence, refusing on a mismatch or on contentStable=false. |

## 5. Error paths

**Error cases**

- **A manager's required-input closure (a nested -r/-c reference; a go module's source file) reaches a file outside targets.entries -- the pinned scope contentIdentity was computed over.** (recoverable)
  - Detection: verifyManagerClosureCoverage returns covered:false with the missing files listed.
  - Response: That manager's perManagerMode is recorded 'unsupported' with the missing files noted; pkg_audit is never invoked for it, and contentIdentity's own hash is never touched by this check.
  - User impact: A manager is never audited against content that was not actually part of the pinned, verified review scope.
- **The repository's content (anything in targets.entries) changes between s2's pre-collection and post-collection contentIdentity computations.** (recoverable)
  - Detection: The second computeContentIdentity call returns a different string than the first.
  - Response: contentStable is set to false; the evidence is still returned, but s3 must treat contentStable=false as untrustworthy.
  - User impact: A mutation during collection is caught and surfaced rather than silently trusted.
- **A Pipfile.lock/poetry.lock entry has a non-PyPI source (git/path/url) or a marker shape the requirements-file format cannot represent faithfully.** (recoverable)
  - Detection: The lockfile-export step classifies the entry as non-exportable before generating the requirements file.
  - Response: That entry is excluded from the generated file and added to unresolvedDependencies with a non-standard-source note; it is never mis-exported as an ordinary public-index name==version line.
  - User impact: A private/git/path dependency is never silently queried against the wrong (public) index under the wrong identity.
- **repoPath itself fails computeContentIdentity's own precondition (not a git repository, or not registered).** (recoverable)
  - Detection: computeContentIdentity throws before any manager-level work begins.
  - Response: collectDependencyAdvisories propagates the error -- there is no per-manager recovery for a broken precondition affecting the whole review.
  - User impact: A fundamentally broken call fails loudly and immediately rather than reporting confusing per-manager gaps.
- **pkg_audit's underlying CLI binary is not installed for a manager enumerateManagers found.** (recoverable)
  - Detection: runShell's existing r.spawnError flag surfaces back to collectDependencyAdvisories.
  - Response: That manager is recorded in unavailableSources as an execution gap, never conflated with 'no findings reported'.
  - User impact: Distinguishes 'the audit tool is genuinely absent' from 'the audit ran and found nothing.'
- **A manager's audit output is unparseable or malformed.** (recoverable)
  - Detection: The per-manager raw-output-to-SecurityAdvisoryMatch mapper fails to extract any usable fields.
  - Response: Recorded in unavailableSources as an execution gap.
  - User impact: A parse failure never masquerades as a successful security check.
- **A plain pip project has no requirements.txt at all.** (recoverable)
  - Detection: There is no requirements-shaped file for the detected pip project.
  - Response: Recorded as perManagerMode 'unsupported' -- never falls back to the ambient active environment.
  - User impact: Never silently reverts to the wrong target just because the expected file is missing.
- **Two different package-manager manifests for the SAME manager family are found in the same directory under repoPath.** (recoverable)
  - Detection: enumerateManagers detects more than one candidate manifest for the same manager family in one directory.
  - Response: That directory's manager is recorded as an unresolved ambiguity.
  - User impact: Never silently audits the wrong lockfile when two plausible ones exist.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An application-source file (not a manifest) listed in targets.entries is edited, with every manifest/lockfile unchanged. | contentIdentity changes, because computeContentIdentity hashes every file in targets.entries, not only dependency manifests. |
| A requirements.txt entry is pinned with an exact `==` version. | Treated as exact-locked evidence, consistent with a lockfile-backed manager. |
| A requirements.txt entry uses a version range (e.g. `>=1.0`) rather than an exact pin. | pip-audit still runs against the file, but that coordinate is also recorded in unresolvedDependencies as version-uncertain -- its resolved version is not guaranteed to match the project's actual installed version. |
| A dependency is successfully audited and found to have no matching advisory. | Its coordinate appears in queriedCoordinates only -- not in matches (no finding) and not in unresolvedDependencies (it WAS successfully checked). This is the expected, documented 'clean' outcome, not an omission. |
| A manager's audit legitimately exits non-zero with a fully parseable 'findings reported' result. | Treated as a SUCCESSFUL audit -- matches populated, NOT an execution gap. |
| A .go source file (not go.mod/go.sum) is listed in targets.entries and edited. | contentIdentity changes directly (it hashes every targets.entries file); verifyManagerClosureCoverage for go also confirms the module's full source tree is within targets.entries before trusting go's audit. |
| A tracked requirements/lockfile is marked assume-unchanged and its real on-disk content has diverged from HEAD; git status reports nothing. | computeContentIdentity still reflects the change -- it reads every targets.entries file's actual current bytes directly, never consulting git status. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, matching the daemon tools convention this Story's own pkg_audit change sits beside (e.g. src/daemon/tools/__tests__/approval-broker.test.ts's `import test from 'node:test'` pattern).`

**Test levels**

- **unit** — Prove computeContentIdentity is a simple, shared, non-manager-aware hash over exactly targets.entries.
  - Subjects: `computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes`, `computeContentIdentity: a file NOT in targets.entries is edited -> no change to the digest`, `computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls, independent of any manager context`, `computeContentIdentity: a targets.entries path resolving outside repoPath -> throws`, `computeContentIdentity: git state unreadable -> throws the documented Error`
- **unit** — Prove verifyManagerClosureCoverage correctly detects when a manager's required inputs are, and are not, covered by the pinned scope.
  - Subjects: `verifyManagerClosureCoverage: a requirements.txt with nested -r/-c references, both referenced files ALSO in targets.entries -> covered:true`, `verifyManagerClosureCoverage: a nested -r/-c reference NOT in targets.entries -> covered:false, missing lists it`, `verifyManagerClosureCoverage: a go module whose full source tree is NOT entirely within targets.entries -> covered:false`, `collectDependencyAdvisories: a manager with covered:false -> perManagerMode 'unsupported' with the missing files noted, pkg_audit never invoked for it`
- **unit** — Prove collectDependencyAdvisories' post-collection re-verification and the queriedCoordinates/matches/unresolvedDependencies accounting.
  - Subjects: `collectDependencyAdvisories: a targets.entries file changes between the pre- and post-collection computeContentIdentity calls -> contentStable:false, evidence still returned`, `collectDependencyAdvisories: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only, absent from BOTH matches and unresolvedDependencies`, `collectDependencyAdvisories: a coordinate with a confirmed advisory -> appears in both queriedCoordinates and matches`, `collectDependencyAdvisories: a coordinate that could not be resolved/checked at all -> appears in both queriedCoordinates and unresolvedDependencies`
- **unit** — Prove lockfile export fidelity: exact-locked versions are preferred, and non-exportable entries are gapped rather than mis-exported.
  - Subjects: `a poetry.lock entry with a git/path/url source -> excluded from the generated requirements file, added to unresolvedDependencies with a non-standard-source note`, `a poetry.lock entry with a plain PyPI source and a simple marker -> exported as `name==version; marker``, `a plain pip requirements.txt entry with an exact `==` pin -> treated as exact-locked evidence`, `a plain pip requirements.txt entry with a version range -> pip-audit still runs against it, but the coordinate is also recorded in unresolvedDependencies as version-uncertain`, `a plain pip project with no requirements.txt at all -> perManagerMode 'unsupported', no fallback to the ambient environment`
- **unit** — Prove collectDependencyAdvisories' per-manager gap-reporting and configuredDestination recording, with a fake pkg_audit invocation.
  - Subjects: `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources`, `collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination, including a manager with zero matches or a failed run`, `collectDependencyAdvisories: repoPath itself fails computeContentIdentity's precondition -> the error propagates rather than being swallowed into a per-manager gap`
  - Fixtures: `a fake pkg_audit invocation standing in for the real pkgAuditTool.execute call`, `repoPath fixtures with varying manifest combinations, nested requirements references, and lockfile entries with non-PyPI sources`
- **unit** — Prove pkgAuditTool's new, additive requirementsPath input and the generated file's concurrency-safe lifecycle.
  - Subjects: `pkgAuditTool.execute: no requirementsPath provided -> argv is identical to today for every manager`, `pkgAuditTool.execute: requirementsPath provided -> argv includes `-r <requirementsPath>``, `two concurrent collectDependencyAdvisories calls each get a distinct, non-colliding generated temp file`, `the generated file is removed after both a successful and a failed pkg_audit call`
- **live** — Prove exact-locked targeting actually audits the repository's own locked dependencies rather than a stray or ambient alternative, against a real subprocess -- gated behind INSRC_LIVE_TESTS=1.
  - Subjects: `collectDependencyAdvisories against a real poetry project: a deliberately vulnerable version pinned in poetry.lock is found, while a different, non-vulnerable version named in a stray requirements.txt beside it is NOT what gets reported`
  - Fixtures: `a real poetry project fixture with a known-vulnerable locked version and a conflicting stray requirements.txt, run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac2` | `computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes`, `collectDependencyAdvisories: a manager with covered:false -> perManagerMode 'unsupported' with the missing files noted, pkg_audit never invoked for it`, `collectDependencyAdvisories: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only, absent from BOTH matches and unresolvedDependencies`, `a poetry.lock entry with a git/path/url source -> excluded from the generated requirements file, added to unresolvedDependencies with a non-standard-source note`, `a plain pip requirements.txt entry with a version range -> pip-audit still runs against it, but the coordinate is also recorded in unresolvedDependencies as version-uncertain`, `a plain pip project with no requirements.txt at all -> perManagerMode 'unsupported', no fallback to the ambient environment`, `collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination, including a manager with zero matches or a failed run`, `collectDependencyAdvisories against a real poetry project: a deliberately vulnerable version pinned in poetry.lock is found, while a different, non-vulnerable version named in a stray requirements.txt beside it is NOT what gets reported` |

## 7. Alternatives considered

### 7.1 a1: Minimal additive pkg_audit targeting fix, controller-equivalent access, shared non-manager-aware identity — **CHOSEN**

Point pip-family managers at the repository's own LOCKED requirements via pip-audit's own `-r` argument; compute ONE shared, simple contentIdentity over exactly the caller-scoped review content; verify per-manager closure coverage separately rather than folding it into the hash.

Add one optional `requirementsPath?: string` field to pkgAuditTool's inputSchema (purely additive); auditArgv's pip/pipenv/poetry cases append `-r <requirementsPath>` only when provided. s2's own module: (1) computes contentIdentity over exactly targets.entries (no manager-specific expansion, so it is genuinely the SAME identity s3 computes over the same scope); (2) for each manager enumerateManagers finds, checks verifyManagerClosureCoverage before auditing it, refusing (as a coverage gap) any manager whose required inputs reach outside targets.entries; (3) regenerates a fresh requirementsPath from Pipfile.lock/poetry.lock for pipenv/poetry (excluding non-PyPI-sourced or unfaithfully-representable entries as explicit gaps) or uses plain pip's own requirements.txt directly (flagging unpinned entries as version-uncertain), written to a per-call-unique temp file cleaned up in a finally block; (4) runs pkg_audit with the same host access the controller has; (5) records each manager's configuredDestination, persisted per manager even for a clean or failed run; (6) recomputes contentIdentity once more after the last manager completes and stamps contentStable; (7) maps pkg_audit's raw output into SecurityAdvisoryMatch[], with queriedCoordinates/matches/unresolvedDependencies accounting that allows a cleanly-checked coordinate to appear in queriedCoordinates alone; and (8) wraps the result into both the thin EvidenceProviderOutput and the richer SecurityAdvisoryEvidence (sc2, HLD revision 6). Revision 5 further corrects: computeContentIdentity is a simple, shared, non-manager-aware hash over exactly targets.entries (restoring the HLD's 'one shared identity' invariant -- a manager-aware expansion inside it at revision 4 would have made s2's own identity diverge from whatever s3 computes over the same targets); manager closure coverage is checked SEPARATELY via verifyManagerClosureCoverage without touching the hash; lockfile export now excludes non-PyPI-sourced or unfaithfully-representable entries as explicit gaps rather than mis-exporting them; plain pip's unpinned entries are flagged version-uncertain; and the queriedCoordinates/matches/unresolvedDependencies accounting is corrected to allow a clean, successfully-checked coordinate to appear in queriedCoordinates alone.

**Pros:**
- Reuses pkg_audit directly, satisfying ac2's 'not a new fetcher' requirement
- No proxy, isolation, or verification machinery to build or maintain -- the reviewer runs with the same host access as the controller
- A genuinely SHARED, simple contentIdentity (no manager-aware logic inside it) is what makes 'the same identity s2 and s3 both execute against' actually true

**Cons:**
- s2's own reports of which destination each manager reached are self-reported/configured, not independently verified -- an accepted, documented tradeoff
- The post-audit re-verification narrows but does not eliminate the mutation-during-audit window -- documented, not silently assumed fixed
- verifyManagerClosureCoverage adds one more per-manager check before any audit runs; a manager whose closure reaches outside targets.entries is refused even though a willing orchestrator could simply have included those files -- the burden is explicitly on the caller to scope targets.entries correctly, not on s2 to guess or expand it

**Cost estimate:** S

### 7.2 a2: A wholly separate scoped-audit fetcher bypassing pkg_audit

Build a new, standalone dependency-advisory fetcher that duplicates argv-building and subprocess invocation for each manager itself, instead of calling pkgAuditTool at all.

**Rejected because:** Violates ac2's explicit text outright by being exactly the 'new fetcher' the Story forbids, and duplicates auditArgv's already-correct per-manager logic -- rejected regardless of its other merits.

### 7.3 a3: Mutate the daemon's own process.env around the pkg_audit call

Avoid changing pkg_audit's code at all by temporarily overwriting process.env around the call.

**Rejected because:** Was rejected at revision 2 for being unsafe under the daemon's concurrent session model; moot since no env-based network enforcement of any kind is attempted anymore, but a1's per-call scoping remains the better code-change pattern regardless.

## 8. References

- **[[c1]]** `code` `src/daemon/tools/builtins/pkg/index.ts:164-175`
- **[[c2]]** `code` `src/daemon/tools/builtins/pkg/index.ts:468-507`
- **[[c3]]** `code` `src/workflow/review-round/evidence-provider.ts:26-40`
- **[[c4]]** `code` `src/workflow/review-round/security-finding.ts:28-32`
- **[[c5]]** `code` `src/workflow/review-round/security-locator.ts:23-26`
- **[[c6]]** `code` `src/workflow/artifact-core/types.ts:276-281`
- **[[c7]]** `code` `src/workflow/artifact-core/types.ts:283-287`
- **[[c8]]** `code` `src/workflow/artifact-core/types.ts:345-347`
- **[[c9]]** `code` `src/daemon/tools/shell-helper.ts:40`
- **[[c10]]** `code` `src/daemon/tools/shell-helper.ts:103`
- **[[c11]]** `code` `src/daemon/tools/shell-helper.ts:181`
- **[[c12]]** `code` `src/daemon/tools/builtins/git/rev-parse.ts:17`
- **[[c13]]** `code` `src/daemon/tools/builtins/git/status.ts:30`
- **[[c14]]** `code` `src/daemon/tools/builtins/git/hash-object.ts:14`
- **[[c15]]** `artifact` `HLD-0765b3a578e43eec`
- **[[c16]]** `web` `https://docs.npmjs.com/cli/v12/commands/npm-audit/`
- **[[c17]]** `web` `https://pypi.org/project/pip-audit/`
- **[[c18]]** `web` `https://docs.rs/crate/rustsec`
- **[[c19]]** `stakeholder` `reviewer finding: 5 HIGH + 3 MED on LLD revision 1 (process.env probes against temporary fixtures; git hash-object filter collision; npm quick-audit payload; pip-audit code-execution risk)`
- **[[c20]]** `stakeholder` `HLD-0765b3a578e43eec revision 5 (controller-equivalent access policy, applied across s2 and s3 by explicit user direction)`
- **[[c21]]** `stakeholder` `reviewer finding: 2 HIGH + 3 MED on LLD revision 3 (TOCTOU between hash and audit, incomplete transitive required-input closure, unobservable destination claim, requirements resolution precedence, unspecified requirementsPath wiring contract)`
- **[[c22]]** `artifact` `HLD-0765b3a578e43eec (revision 6: additive sc2 fields contentStable, perManagerMode[].configuredDestination)`
- **[[c23]]** `stakeholder` `reviewer finding: 1 HIGH + 4 MED on LLD revision 4 (shared contentIdentity cannot exclude app source; plain-pip resolution vs locked evidence; name/version-only lockfile export loses semantics; clean-coordinate accounting gap; inconsistent throw/no-throw contract for an unreadable closure)`
