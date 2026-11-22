<!-- insrc:artifact LLD-0765b3a578e43eec-s2 -->

# LLD: STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`

This Story checks a repository's dependencies against public advisories. The reviewer runs with the SAME host access as the controller itself -- no sandboxing or egress/filesystem restriction is attempted, since constraining the reviewer would degrade the review's own accuracy (explicit user direction, applied across the Epic). s2 instead focuses on two things that matter for correctness regardless of access level: pointing each package manager's audit at the repository's own actual dependencies (never an ambient or mismatched environment pip-audit/govulncheck would otherwise default to), and computing one deterministic content identity by hashing the complete set of required input files' actual bytes directly, so s3 can verify it reviewed the exact same content. Every destination a manager's audit actually reaches, and what it discloses there, is recorded for the final report's audit trail -- observability, not an enforced boundary. A manager, dependency or source that cannot be correctly targeted or resolved is reported as an explicit gap, never silently skipped and never run against the wrong target.

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
- `s3`: The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a content MISMATCH only -- never on an access/enforcement question), using s1's resolved model, with the SAME host access every other CLI-backed session in this codebase already has (no additional credential/out-of-scope/MCP denial gate; explicit user direction, applied across the Epic's design). The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `computeContentIdentity`

```typescript
function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string>
```

**Parameters:**
- `repoPath: string` — The registered repo root git_rev_parse runs against, and the base every targets.entries path is resolved and validated against -- removes the ambiguity of a relative path across two registered repos.
- `targets: ReviewTargets` — The round's submitter-owned content list (artifact-core/types.ts:345-347); computeContentIdentity expands each manager's COMPLETE required input set (see requiredInputsForManager) around these entries, not just the single path named.

**Returns:** `Promise<string>` — A deterministic digest over the repo's HEAD commit sha (via git_rev_parse) plus a sha256 (Node's own crypto, not git_hash_object) of EVERY required input file's actual, current raw bytes -- read and hashed unconditionally, never gated on whether git status reports a file as dirty/untracked. This closes the gap where a tracked file marked assume-unchanged diverges from HEAD while git status stays empty: computeContentIdentity still sees the real, current bytes because it reads every required file directly rather than trusting git's own change-tracking to decide what to include. s3 recomputes the same function independently against the same repoPath/targets to verify it reviewed the same content.

**Errors:**
- `Error` when the target repository's git state cannot be read (not a git repository, repoPath not registered, or the underlying git_rev_parse call fails)
- `Error` when a targets.entries path resolves outside repoPath

**Preconditions:**
- repoPath is a registered repo root with a resolvable HEAD

**Postconditions:**
- pure function of the repo's current file bytes, repoPath and targets.entries -- calling it twice with no intervening change to the complete per-manager input set yields the identical string
- never includes file content from outside repoPath or the complete per-manager input set
- hashes raw file bytes directly (crypto.createHash('sha256') over the file read from disk) -- never delegates to git_hash_object, which applies git attribute clean filters before hashing and can collide on different raw content
- never relies on git status/dirty-file enumeration to decide which files to hash -- every required input file is read and hashed unconditionally

### 2.2 `collectDependencyAdvisories`

```typescript
function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence>
```

**Parameters:**
- `repoPath: string` — Same registered repo root as computeContentIdentity; also the root enumerateManagers walks to find every manifest in scope.
- `targets: ReviewTargets` — Bounds which manifests/managers are in scope for this collection, same as computeContentIdentity's targets.

**Returns:** `Promise<SecurityAdvisoryEvidence>` — sc2's full result: contentIdentity (via computeContentIdentity), queriedCoordinates, matches, perManagerMode, unresolvedDependencies, and unavailableSources.

**Preconditions:**
- enumerateManagers(repoPath, targets) has found at least an attempt-worthy manifest, or the result is an all-gaps SecurityAdvisoryEvidence

**Postconditions:**
- every manager it attempts runs with the SAME host access as the controller itself -- no sandboxing, no isolated copy; pkg_audit runs directly against repoPath (or the manager's own manifest directory within it), the real environment
- every manager is correctly TARGETED per requiredInputsForManager's mapping (the repository's own resolved environment for pip/pipenv/poetry, the repository's own module source for go) -- never left pointed at an ambient or mismatched default; a manager s2 cannot correctly target produces an explicit coverage gap (perManagerMode 'unsupported'), never a mis-targeted run
- records, per manager, the destination actually reached and what was disclosed there, attached to the returned SecurityAdvisoryEvidence for audit -- this is observability, never a basis for refusing to run a manager
- every queried coordinate ends up in exactly one of matches or unresolvedDependencies (or contributes to a 'no findings' result) -- never silently dropped
- the returned contentIdentity equals computeContentIdentity(repoPath, targets) computed over the exact same repository state each manager actually audited
- never throws -- every manager-level failure becomes an explicit perManagerMode/unavailableSources/unresolvedDependencies entry, not an exception, matching ac2's 'remain explicit gaps' requirement

### 2.3 `createDependencySbomEvidenceProvider`

```typescript
function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider
```

**Parameters:**
- `repoPath: string` — Captured in the returned provider's closure and forwarded to collectDependencyAdvisories on every run() call, since EvidenceProvider.run's own fixed signature (evidence-provider.ts:26-40) carries no repo-identity field.

**Returns:** `EvidenceProvider` — An object with category:'dependency-sbom' whose run(input) calls collectDependencyAdvisories(repoPath, input.targets) and maps its matches into the thin EvidenceProviderOutput.evidence (one SecurityEvidence per match, providerCategory:'dependency-sbom', locator pointing at the matched coordinate's manifest file). The richer SecurityAdvisoryEvidence itself is NOT part of this return value -- the orchestration module obtains sc2 directly by calling collectDependencyAdvisories, not through the registry.

**Postconditions:**
- the returned object satisfies the EvidenceProvider interface exactly (evidence-provider.ts:26-40), so the existing EvidenceProviderRegistry can hold it under the 'dependency-sbom' key unchanged

## 3. Data model changes

### 3.1 `pkgAuditTool execute -- plain pip pointed at the repository's own requirements, never the ambient environment` — field-modify

CURRENT INVARIANT BEING REPLACED: auditArgv's pip case runs `['pip-audit', '-f', 'json']` (pkg/index.ts:164-175) with no `-r`/`--path` argument, so pip-audit audits whatever is installed in the ambient active Python environment by default -- not the repository's own requirements file, even though cwd points at it. NEW behavior: when a requirements file (requirements.txt, or one generated from Pipfile.lock/poetry.lock for pipenv/poetry) is present, auditArgv's pip/pipenv/poetry cases pass it explicitly via pip-audit's own `-r <path>` argument, so the audit targets the repository's own declared dependencies directly. This is a correctness/targeting fix, not an isolation one -- resolution and installation behave exactly as pip-audit's own documented `-r` mode already does; no `--no-deps`/`--require-hashes` restriction is imposed, since the reviewer runs with controller-equivalent access and a full, accurate resolution is preferred over a restricted one.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.2 `requiredInputsForManager (replaces the revision-1/2 isolation-driven "mode preparer")` — new

requiredInputsForManager(manager) names the manifest (and, where one exists, the lockfile) that manager's audit actually needs, used only to point pkg_audit's existing `cwd` at the right real directory and, for pip/pipenv/poetry, to resolve the right `-r <requirements path>` argument (generating one from Pipfile.lock/poetry.lock when the native manager has no bare requirements.txt). There is no copying, no temp directory, and no isolation step -- s2 runs pkg_audit directly against the manager's real manifest location within repoPath, matching the controller's own access level.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.3 `Repository-root threading (repoPath) through computeContentIdentity, collectDependencyAdvisories, createDependencySbomEvidenceProvider` — field-add

ReviewTargets carries no repository identity (entries are bare paths -- artifact-core/types.ts:345-347), so a relative path like package.json is ambiguous across two registered repos sharing that relative path. Every s2-owned function now takes an explicit repoPath (a registered repo root); every targets.entries path is validated as resolving inside repoPath before use, and git_rev_parse and the manifest enumerator both run with repoPath as their base, never the daemon's own ambient process.cwd().

**Call sites:**
- `src/workflow/artifact-core/types.ts:345-347`

### 3.4 `Per-manager destination/disclosure recording (replaces the revision-2 destination pin + negative-access verification)` — new

After each manager's audit completes, s2 records which destination that manager's native tool actually reached (e.g. the configured registry/index/advisory-database host) and a short description of what was disclosed there, attaching both to the corresponding SecurityAdvisoryMatch.advisoryDestination and the final report. This is pure observability -- no proxy, no destination pin, no negative-access probe, and no refusal based on network behavior; s2 runs with the same host access as the controller and trusts the same native tool behavior the controller would.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.5 `enumerateManagers (replaces reliance on detectManager's single-match precedence)` — new

detectManager(cwd) (pkg/index.ts) returns only the FIRST manager it finds via a fixed lockfile precedence order, stopping at the first match -- it never enumerates co-located managers (e.g. a Python requirements.txt beside an npm package.json in the same directory) or nested project directories. enumerateManagers(repoPath, targets) instead walks every manifest/lockfile signal within repoPath bounded by targets.entries' own directories, producing one {manager, manifestDir} pair per manifest found; two different managers' manifests in two different directories are each audited independently, while two conflicting manifests in the SAME directory for the SAME manager family are flagged as an unresolved ambiguity rather than guessed at.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:47-79`

### 3.6 `Per-manager raw-audit-output -> SecurityAdvisoryMatch[] mapper` — new

Translates each manager's own result shape (npm/pnpm's parsed JSON, pip-audit's JSON, cargo audit's JSON; yarn/go's non-JSON text output, since auditArgv marks them expectsJson:false) into the common SecurityAdvisoryMatch[] shape (coordinate, advisoryId, affectedVersions, severity, provenance, advisoryDestination). An unparseable or malformed result is recorded in unavailableSources as an execution gap, never silently treated as 'no findings' -- distinct from a successful audit that legitimately found nothing.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.7 `SecurityAdvisoryEvidence (sc2)` — new

The HLD-defined output record this Story owns, produced by collectDependencyAdvisories exactly as the HLD's interfaceSketch specifies: { contentIdentity, readOnly: true, queriedCoordinates, matches: SecurityAdvisoryMatch[], perManagerMode, unresolvedDependencies, unavailableSources }. Lives in the Epic's new standalone orchestration module (outside src/workflow/review-round/), and crosses the s2->s3 boundary unchanged.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | collectDependencyAdvisories is the sole producer of SecurityAdvisoryEvidence. For every manager enumerateManagers finds, it stamps the result with computeContentIdentity (hashing the complete required input set's actual bytes directly), correctly targets that manager's audit at the repository's own real manifest/environment/source (never an ambient default), runs pkg_audit with the same host access the controller has, records the destination actually reached and what was disclosed, and maps the output into SecurityAdvisoryMatch[]. Every unresolved/unavailable/unsupported case is recorded explicitly rather than dropped. s3 consumes the returned value directly (not through the EvidenceProvider registry) to recompute and verify contentIdentity before trusting the evidence, and to report confirmed affected dependencies vs. unverified coverage as distinct values in its own report. |

## 5. Error paths

**Error cases**

- **A targets.entries path resolves outside repoPath (e.g. a path-traversal or a mismatched relative path against the wrong registered repo).** (recoverable)
  - Detection: computeContentIdentity/collectDependencyAdvisories validate every targets.entries path against repoPath before use.
  - Response: Throws (computeContentIdentity) / records an explicit gap for that entry (collectDependencyAdvisories); the out-of-scope path is never read.
  - User impact: A misconfigured or ambiguous path never silently includes the wrong repository's content.
- **pkg_audit's underlying CLI binary is not installed for a manager enumerateManagers found (e.g. pip-audit itself is missing).** (recoverable)
  - Detection: runShell's existing r.spawnError flag (pkg/index.ts:487-489's existing check) surfaces back to collectDependencyAdvisories.
  - Response: That manager is recorded in unavailableSources as an execution gap, never conflated with 'no findings reported'.
  - User impact: Distinguishes 'the audit tool is genuinely absent' from 'the audit ran and found nothing.'
- **A manager's audit output is unparseable or malformed in a way distinct from pkg_audit's normal nonZeroOk:true 'findings reported' convention (e.g. expectsJson:true but JSON.parse fails, or an unexpected text shape for a non-JSON manager).** (recoverable)
  - Detection: The per-manager raw-output-to-SecurityAdvisoryMatch mapper fails to extract any usable fields from r.stdout.
  - Response: Recorded in unavailableSources as an execution gap; never silently reported as a clean, findings-free result.
  - User impact: A parse failure never masquerades as a successful security check.
- **A plain `pip` project has neither a requirements.txt nor a Pipfile.lock/poetry.lock -- there is nothing to point pip-audit's `-r` argument at.** (recoverable)
  - Detection: requiredInputsForManager finds no requirements-shaped file for the detected pip project.
  - Response: Recorded as perManagerMode 'unsupported' (an explicit coverage gap) -- never falls back to auditing the ambient active environment.
  - User impact: Never silently reverts to the wrong (ambient) target just because the expected file is missing.
- **Two different package-manager manifests for the SAME manager family are found in the same directory under repoPath (e.g. two conflicting lockfiles enumerateManagers cannot disambiguate).** (recoverable)
  - Detection: enumerateManagers detects more than one candidate manifest for the same manager family in one directory.
  - Response: That directory's manager is recorded as an unresolved ambiguity (added to unresolvedDependencies with a note), never guessed at by picking one arbitrarily.
  - User impact: Never silently audits the wrong lockfile when two plausible ones exist.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A manager's audit legitimately exits non-zero with a fully parseable 'findings reported' result (pkg_audit's own existing nonZeroOk:true convention for every manager). | Treated as a SUCCESSFUL audit -- matches populated from the parsed result, NOT an execution gap, preserving ac2's own distinction and pkg_audit's existing behavior unchanged. |
| No manifest for a given manager is present anywhere under repoPath within targets.entries' directories (that manager simply is not used by this repo). | That manager is never attempted and its absence is not reported as an unavailableSource or unresolvedDependency -- correctly out of scope, not a gap. |
| The same coordinate name happens to appear via two different managers in two different directories in the same review. | Each manager's match is recorded independently in matches, keyed by its own manager-scoped coordinate; no de-duplication that could hide one manager's distinct finding. |
| A tracked requirements/lockfile is marked assume-unchanged (git update-index --assume-unchanged) and its real on-disk content has diverged from HEAD; git status reports nothing. | computeContentIdentity still reflects the change, because it reads and hashes every required input file's actual current bytes directly -- it never consults git status/dirty-file enumeration to decide what to include. |
| A required input file has git attributes that would apply a clean filter (e.g. line-ending normalization) if hashed via git_hash_object. | computeContentIdentity hashes the file's raw bytes directly via Node's crypto, bypassing git attribute filters entirely, so the digest reflects exactly what pkg_audit actually reads -- never a filter-transformed value. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, matching the daemon tools convention this Story's own pkg_audit change sits beside (e.g. src/daemon/tools/__tests__/approval-broker.test.ts's `import test from 'node:test'` pattern).`

**Test levels**

- **unit** — Prove computeContentIdentity's determinism, scoping, and unconditional raw-byte hashing in isolation, with a fake git-plumbing layer for git_rev_parse and real Node crypto + real filesystem fixtures for the file-hashing step.
  - Subjects: `computeContentIdentity: identical HEAD sha + identical required-input-set bytes -> identical string on repeated calls`, `computeContentIdentity: a change to a required input file's raw bytes -> a different string, even when the file is marked assume-unchanged (git status reports nothing)`, `computeContentIdentity: a change to a file OUTSIDE the required input set -> no change to the string`, `computeContentIdentity: a targets.entries path resolving outside repoPath -> throws`, `computeContentIdentity: a file with git attributes that would apply a clean filter -> the digest reflects the RAW bytes, not the filtered content`, `computeContentIdentity: git state unreadable (not a git repo) -> throws the documented Error`
- **unit** — Prove enumerateManagers finds every manifest signal, not just the first lockfile-precedence match, and flags same-directory ambiguity.
  - Subjects: `enumerateManagers: a directory with both an npm package.json and a Python requirements.txt -> two independent {manager, manifestDir} entries, not one`, `enumerateManagers: two conflicting lockfiles for the same manager family in one directory -> flagged as an unresolved ambiguity, never silently picking one`, `enumerateManagers: no manifest anywhere under repoPath -> an empty result, no gap reported for any manager`
- **unit** — Prove collectDependencyAdvisories' per-manager targeting, destination recording, and gap-reporting logic in isolation, with a fake pkg_audit invocation -- no real subprocesses.
  - Subjects: `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: a non-zero exit with parseable output (pkg_audit's nonZeroOk:true convention) -> treated as a successful audit, matches populated, no gap`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: a plain pip project with no requirements.txt/lockfile -> perManagerMode 'unsupported', never falls back to the ambient environment`, `collectDependencyAdvisories: pip-audit is invoked with `-r <requirements path>` pointed at the repository's own file, not the ambient environment`, `collectDependencyAdvisories: the destination each manager's audit actually reached is recorded on the corresponding SecurityAdvisoryMatch.advisoryDestination`, `collectDependencyAdvisories: the same coordinate name via two different managers in two different directories -> two independent matches, no de-duplication`
  - Fixtures: `a fake pkg_audit invocation (controllable exit code / stdout / spawnError per manager) standing in for the real pkgAuditTool.execute call`, `repoPath fixtures with varying manifest combinations (npm+pip in separate dirs, go-only, no manifest, duplicate coordinate names across managers, Pipfile.lock/poetry.lock fixtures for the -r path generation)`
- **unit** — Prove createDependencySbomEvidenceProvider's registry-contract mapping -- the thin EvidenceProviderOutput must stay distinct from the richer SecurityAdvisoryEvidence.
  - Subjects: `createDependencySbomEvidenceProvider(repoPath).category === 'dependency-sbom'`, `createDependencySbomEvidenceProvider(repoPath).run(input) maps each SecurityAdvisoryMatch into one SecurityEvidence with providerCategory:'dependency-sbom' and a locator pointing at the matched coordinate's manifest file`, `the EvidenceProviderOutput never carries advisoryId/affectedVersions/severity/provenance/advisoryDestination directly -- those stay in the richer SecurityAdvisoryEvidence obtained separately via collectDependencyAdvisories`
- **live** — Prove pip-audit's `-r` targeting actually audits the repository's own requirements rather than the ambient environment end-to-end, against a real subprocess -- gated behind INSRC_LIVE_TESTS=1 per the project's existing live-service-test convention.
  - Subjects: `collectDependencyAdvisories against a real pip project: a deliberately vulnerable version pinned in the repository's own requirements.txt is found, while a DIFFERENT, non-vulnerable version installed in the ambient environment is NOT what gets reported -- proving the audit targeted the repo's own file`
  - Fixtures: `a real pip project fixture with a known-vulnerable pinned requirement, run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac2` | `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: a non-zero exit with parseable output (pkg_audit's nonZeroOk:true convention) -> treated as a successful audit, matches populated, no gap`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: a plain pip project with no requirements.txt/lockfile -> perManagerMode 'unsupported', never falls back to the ambient environment`, `collectDependencyAdvisories: pip-audit is invoked with `-r <requirements path>` pointed at the repository's own file, not the ambient environment`, `collectDependencyAdvisories: the destination each manager's audit actually reached is recorded on the corresponding SecurityAdvisoryMatch.advisoryDestination`, `collectDependencyAdvisories against a real pip project: a deliberately vulnerable version pinned in the repository's own requirements.txt is found, while a DIFFERENT, non-vulnerable version installed in the ambient environment is NOT what gets reported -- proving the audit targeted the repo's own file` |

## 7. Alternatives considered

### 7.1 a1: Minimal additive pkg_audit targeting fix, controller-equivalent access — **CHOSEN**

Point pip-family managers at the repository's own requirements via pip-audit's own `-r` argument; no proxy, isolation, or verification machinery is built, since the reviewer runs with the same host access as the controller.

Extend pkgAuditTool's inputSchema/execute with the pip/pipenv/poetry `-r <requirements path>` fix (an additive-at-the-call-site change, not a schema addition) -- the single code change to pkg_audit itself, directly satisfying ac2's 'not a new fetcher' requirement. s2's own module: (1) computes contentIdentity by hashing the complete required input set's actual bytes directly; (2) enumerates every manager in scope and points pkg_audit's existing `cwd` (and, for pip-family managers, `-r`) at the repository's own real manifest/requirements, never an isolated copy or an ambient default; (3) runs pkg_audit with the same host access the controller has -- no proxy, no sandbox, no negative-access probe; (4) records the destination each manager's audit actually reached for the final report; (5) maps pkg_audit's raw per-manager output into SecurityAdvisoryMatch[], and (6) wraps the result into both the thin EvidenceProviderOutput (for the dependency-sbom registry contract) and the richer SecurityAdvisoryEvidence (sc2, returned directly for s3). Revision 3 drops the revision-2 proxy/negative-access-probe/isolated-materialization machinery entirely, per the HLD's own revision-5 amendment (the reviewer runs with controller-equivalent access, not sandboxed); the choice of a1 over a2/a3 stands unchanged -- a1 remains the smallest change that reuses pkg_audit directly.

**Pros:**
- Reuses pkg_audit directly -- the only code change is pointing pip-family managers at the repo's own requirements via -r, satisfying ac2's 'not a new fetcher' requirement
- No proxy, isolation, or verification machinery to build or maintain -- the reviewer runs with the same host access as the controller, per the HLD's revision-5 policy
- Full, accurate resolution (no --no-deps/--require-hashes restriction) is preferred over a restricted one now that sandboxing is explicitly out of scope

**Cons:**
- s2's own reports of which destination each manager reached are self-reported by the native tool, not independently verified -- an accepted, documented tradeoff (HLD risky bit 'Controller-equivalent access tradeoff'), not a gap this Story tries to close

**Cost estimate:** S

### 7.2 a2: A wholly separate scoped-audit fetcher bypassing pkg_audit

Build a new, standalone dependency-advisory fetcher that duplicates argv-building and subprocess invocation for each manager itself, instead of calling pkgAuditTool at all.

Write a new module that re-implements per-manager argv construction (duplicating auditArgv's logic, which is module-private and not exported from pkg/index.ts) and calls runShell directly with full control over cwd/env from the start, never touching pkgAuditTool's existing execute() path.

**Rejected because:** Violates ac2's explicit text outright by being exactly the 'new fetcher' the Story forbids, and duplicates auditArgv's already-correct per-manager logic -- rejected regardless of its other merits.

### 7.3 a3: Mutate the daemon's own process.env around the pkg_audit call

Avoid changing pkg_audit's code at all by temporarily overwriting process.env around the call.

**Rejected because:** Was rejected at revision 2 for being unsafe under the daemon's concurrent session model (a global process.env mutation); moot at revision 3 since no env-based network enforcement of any kind is attempted anymore, but a1's per-call scoping remains the better code-change pattern regardless.

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
