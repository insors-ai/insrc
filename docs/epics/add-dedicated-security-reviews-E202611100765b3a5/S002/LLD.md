<!-- insrc:artifact LLD-0765b3a578e43eec-s2 -->

# LLD: STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`

This Story checks a repository's dependencies against public advisories while confining what each package manager can read, execute, and transmit. Every audit runs against an isolated, disposable copy of exactly the files it needs (never the live repository tree), pinned to the moment that copy is made so the reported content identity cannot drift from what was actually audited. Each manager is driven through a documented, concrete invocation that avoids dependency resolution and code execution where the tool allows it (pip/pipenv/poetry via pip-audit's --no-deps --require-hashes mode; cargo audit's local-comparison, no-disclosure design) and pins network egress to the one destination that manager's own configuration supports, verified by a negative-access probe before any manager is trusted. A manager, dependency or source that cannot be scoped, confined, or verified this way is reported as an explicit gap -- never silently skipped, never run against the live tree, and never accepted on an unverified assumption.

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

**Rollout phase:** Phase A -- foundational contracts (model selection and enforced advisory collection)
**Owns:** `sc2` (SecurityAdvisoryEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question. — owns `sc1`
- `s3`: The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a mismatch), using s1's resolved model, under a backend REQUIRED to deny credential-location reads, out-of-scope reads and unauthorized MCP operations -- verified per backend by an actual negative-access test (not merely confirming a restricting flag was passed), with s3 refusing to dispatch through a backend that cannot be so verified; the exact per-provider mechanism is an s3 LLD decision, the three denials and the refuse-if-unverifiable rule are fixed here. The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `computeContentIdentity`

```typescript
function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string>
```

**Parameters:**
- `repoPath: string` — The registered repo root git_rev_parse/git_status run against, and the base every targets.entries path is resolved and validated against -- removes the ambiguity of a relative path across two registered repos (revision-1 gap).
- `targets: ReviewTargets` — The round's submitter-owned content list (artifact-core/types.ts:345-347); computeContentIdentity expands each manager's COMPLETE required input set (see requiredInputsForManager) around these entries, not just the single path named.

**Returns:** `Promise<string>` — A deterministic digest over the repo's HEAD commit sha (via git_rev_parse) plus a sha256 (Node's own crypto, not git_hash_object) of every dirty/untracked file's raw bytes within the complete, per-manager input set -- computed in the SAME pass that materializes the isolated audit copy (see the materialization entity below), so there is no window between "hash computed" and "bytes audited" for the live repo to change in. s3 recomputes the same function independently against the same repoPath/targets to verify it reviewed the same content.

**Errors:**
- `Error` when the target repository's git state cannot be read (not a git repository, repoPath not registered, or the underlying git_rev_parse/git_status calls fail)
- `Error` when a targets.entries path resolves outside repoPath

**Preconditions:**
- repoPath is a registered repo root with a resolvable HEAD

**Postconditions:**
- pure function of the repo's current git state, repoPath and targets.entries -- calling it twice with no intervening change to the complete per-manager input set yields the identical string
- never includes file content from outside repoPath or the complete per-manager input set
- hashes raw file bytes directly (crypto.createHash('sha256') over the file read from disk) -- never delegates to git_hash_object, which applies git attribute clean filters before hashing and can collide on different raw content

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
- every manager it attempts runs ONLY against the isolated, materialized copy created in the same pass as its contentIdentity hashing -- never against the live repoPath tree directly, for any manager
- never sends a manager's traffic anywhere but that manager's own documented, pinned destination, and only after a negative-access probe confirms a disallowed decoy destination is unreachable via that manager's own configured path; a manager whose enforcement cannot be verified is recorded in perManagerMode as 'unsupported' and is never actually run
- every queried coordinate ends up in exactly one of matches or unresolvedDependencies (or contributes to a 'no findings' result) -- never silently dropped
- the returned contentIdentity equals computeContentIdentity(repoPath, targets) called over the exact same materialized input set each manager actually audited
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

### 3.1 `pkgAuditTool inputSchema + execute (src/daemon/tools/builtins/pkg/index.ts) -- env override` — field-add

Add one optional `env?: Record<string, string>` property to pkgAuditTool's inputSchema, forwarded straight to runShell's existing per-call options.env (shell-helper.ts:40,103,181) inside execute() -- purely additive; no existing caller passes `env` today. `cwd` (already an accepted input) is pointed at the isolated materialized copy for every manager, never the live repo tree.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`
- `src/daemon/tools/builtins/pkg/index.ts:468-507`
- `src/daemon/tools/shell-helper.ts:40`
- `src/daemon/tools/shell-helper.ts:103`
- `src/daemon/tools/shell-helper.ts:181`

### 3.2 `auditArgv's pipenv/poetry cases -- switched to pip-audit against a generated hash-pinned requirements file` — field-modify

CURRENT INVARIANT BEING REPLACED: auditArgv's pipenv case runs `pipenv check --output json` and its poetry case runs `poetry audit` (pkg/index.ts:164-175) -- each manager's OWN native audit command, run against whatever environment that command resolves on its own. NEW behavior: pipenv/poetry's audit path is switched to the SAME pip-audit invocation pip itself uses (`pip-audit -r <generated requirements> --no-deps --require-hashes -f json`), where `<generated requirements>` is produced by this Story from Pipfile.lock/poetry.lock's own pinned {name, version, hash} triples -- both lockfiles already carry hashes, so no new resolution is needed to produce it. This is a deliberate, additive-only-at-the-manager-level change to pkg_audit's existing exported behavior for manager:'pipenv'|'poetry' specifically; npm/pnpm/yarn/go/cargo/plain-pip cases are untouched.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.3 `Repository-root threading (repoPath) through computeContentIdentity, collectDependencyAdvisories, createDependencySbomEvidenceProvider` — field-add

ReviewTargets carries no repository identity (entries are bare paths -- artifact-core/types.ts:345-347), so a relative path like package.json is ambiguous across two registered repos sharing that relative path. Every s2-owned function now takes an explicit repoPath (a registered repo root); every targets.entries path is validated as resolving inside repoPath before use, and git_rev_parse/git_status/the manifest enumerator all run with repoPath as their base, never the daemon's own ambient process.cwd().

**Call sites:**
- `src/workflow/artifact-core/types.ts:345-347`

### 3.4 `requiredInputsForManager + isolated materialization (replaces the revision-1 "mode preparer")` — new

requiredInputsForManager(manager) names the COMPLETE set of files that manager's audit genuinely needs, not just the single manifest path a caller might name: npm/pnpm/yarn -> {package.json, the matching lockfile}; cargo -> {Cargo.toml, Cargo.lock}; pip (hash-pinned requirements only) -> {the hash-pinned requirements file}; pipenv -> {Pipfile, Pipfile.lock}; poetry -> {pyproject.toml, poetry.lock}; go -> {go.mod, go.sum} plus the module source tree govulncheck's source-level analysis needs. For EVERY manager, that complete set (never anything else from repoPath) is copied byte-for-byte into a fresh, disposable temp directory in the SAME pass computeContentIdentity hashes those same bytes -- closing the gap where a later audit could read content that changed after hashing (revision-1's TOCTOU gap) and guaranteeing the hash set is actually complete (revision-1 only hashed the single named path, missing e.g. a sibling lockfile). Every manager's pkg_audit invocation runs with `cwd` pointed at this temp copy -- never repoPath directly, and never an ambient install/venv outside it.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.5 `Per-manager destination pin + negative-access verification (replaces the revision-1 generic allowlisting proxy + decoy probe)` — new

Each manager is pinned to the ONE network destination its OWN configuration surface supports, rather than relying on an env-var proxy a tool might ignore: npm/pnpm/yarn -> `--registry <the one approved registry>` (a native CLI flag, not env-var proxying); cargo -> `audit.toml`'s db-url pinned to the single official RustSec advisory-db git remote; pip-audit (hash-pinned mode) -> its own `--index-url`-equivalent pinned to one approved index/OSV source; go -> `GOPROXY` pinned to the one approved module proxy with `GOFLAGS=-mod=readonly` (refuses any go.mod/go.sum change). Before trusting ANY manager, run a per-manager-type NEGATIVE-access probe (cached per manager type, not just a single decoy-reachable check): confirm that pointing the SAME manager at a disallowed decoy destination, through that manager's own configured path, demonstrably fails -- not merely that the approved destination is reachable. A manager with a KNOWN auxiliary network path its own configuration cannot bound (e.g. an undocumented telemetry call) is refused outright (perManagerMode 'unsupported'), and this residual limitation -- no OS-level network-namespace/sandbox enforcement exists in this codebase, so a manager's native tool spawning an unconfigured subprocess or secondary client is NOT independently blockable -- is stated explicitly, never silently assumed away.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`
- `src/daemon/tools/shell-helper.ts:40`

### 3.6 `Per-manager disclosure profile (resolves the "approved coordinates" requirement honestly per manager)` — new

Documents, per manager, exactly what crosses the pinned destination, since "send only approved coordinates" cannot be uniformly true for every native audit command: npm/pnpm/yarn's own audit command can disclose the FULL lockfile dependency tree plus CLI/platform metadata to its one pinned registry (npm's own documented Quick Audit fallback payload) -- an accepted, explicitly recorded disclosure to that single approved destination, not a coordinate-only one; cargo audit discloses NOTHING over the network (the advisory comparison runs locally against the cloned RustSec database after one git fetch) -- the strongest case; pip-audit in --no-deps --require-hashes mode discloses name+version+hash per pinned requirement, never a full environment dump; go discloses the module path+version coordinates GOPROXY needs to fetch content already hash-verified by go.sum. Each SecurityAdvisoryMatch.advisoryDestination plus this documented disclosure profile is what s3 and the final report rely on -- never a blanket "coordinates only" claim pkg_audit's wrapped native tools cannot actually keep for every manager.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.7 `enumerateManagers (replaces reliance on detectManager's single-match precedence)` — new

detectManager(cwd) (pkg/index.ts) returns only the FIRST manager it finds via a fixed lockfile precedence order, stopping at the first match -- it never enumerates co-located managers (e.g. a Python requirements.txt beside an npm package.json in the same directory) or nested project directories. enumerateManagers(repoPath, targets) instead walks every manifest/lockfile signal within repoPath bounded by targets.entries' own directories, producing one {manager, manifestDir} pair per manifest found; two different managers' manifests in two different directories are each audited independently, while two conflicting manifests in the SAME directory for the SAME manager family are flagged as an unresolved ambiguity rather than guessed at.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:47-79`

### 3.8 `Per-manager raw-audit-output -> SecurityAdvisoryMatch[] mapper` — new

Translates each manager's own result shape (npm/pnpm's parsed JSON, pip-audit's JSON, cargo audit's JSON; yarn/go's non-JSON text output, since auditArgv marks them expectsJson:false) into the common SecurityAdvisoryMatch[] shape (coordinate, advisoryId, affectedVersions, severity, provenance, advisoryDestination). An unparseable or malformed result is recorded in unavailableSources as an execution gap, never silently treated as 'no findings' -- distinct from a successful audit that legitimately found nothing.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.9 `SecurityAdvisoryEvidence (sc2)` — new

The HLD-defined output record this Story owns, produced by collectDependencyAdvisories exactly as the HLD's interfaceSketch specifies: { contentIdentity, readOnly: true, queriedCoordinates, matches: SecurityAdvisoryMatch[], perManagerMode, unresolvedDependencies, unavailableSources }. Lives in the Epic's new standalone orchestration module (outside src/workflow/review-round/), and crosses the s2->s3 boundary unchanged.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | collectDependencyAdvisories is the sole producer of SecurityAdvisoryEvidence. For every manager enumerateManagers finds, it materializes that manager's COMPLETE required input set into an isolated temp copy (hashing those exact bytes into contentIdentity in the same pass), pins that manager's audit to its own documented single destination, verifies that pin with a negative-access probe, and -- only if verified -- runs pkg_audit against the isolated copy and maps its output into SecurityAdvisoryMatch[] with an honest, per-manager disclosure profile. Every unresolved/unavailable/unsupported case is recorded explicitly rather than dropped. s3 consumes the returned value directly (not through the EvidenceProvider registry) to recompute and verify contentIdentity before trusting the evidence, and to report confirmed affected dependencies vs. unverified coverage as distinct values in its own report. |

## 5. Error paths

**Error cases**

- **A manager's negative-access probe fails: pointing it at a disallowed decoy destination through its own configured path still succeeds, meaning its enforcement cannot be verified (e.g. a manager that does not honor its own documented proxy/registry/index configuration).** (recoverable)
  - Detection: The per-manager-type negative-access probe (run before any audit for that manager type) observes the decoy destination being reached when it should have been refused.
  - Response: That manager's perManagerMode is recorded 'unsupported'; pkg_audit is never invoked for it at all, and its coordinates are added to unresolvedDependencies instead.
  - User impact: No uncontrolled egress ever occurs for a manager whose destination-pinning cannot be verified; the report explains exactly why that manager's dependencies are unresolved.
- **Materializing a manager's complete required input set (requiredInputsForManager) into the isolated temp copy fails -- a required sibling file (e.g. the lockfile beside the manifest) is missing or unreadable.** (recoverable)
  - Detection: The materialization step's own file-copy/read fails before any hashing or audit begins for that manager.
  - Response: That manager's perManagerMode is recorded 'unsupported'; no partial copy is ever audited, and no fallback to the live repoPath tree occurs.
  - User impact: Never audits an incomplete or substituted input set silently; the gap is explicit.
- **pkg_audit's underlying CLI binary is not installed for a manager that DID pass its negative-access probe (e.g. pip-audit itself is missing).** (recoverable)
  - Detection: runShell's existing r.spawnError flag (pkg/index.ts:487-489's existing check) surfaces back to collectDependencyAdvisories.
  - Response: That manager is recorded in unavailableSources as an execution gap, never conflated with 'no findings reported'.
  - User impact: Distinguishes 'the audit tool is genuinely absent' from 'the audit ran and found nothing.'
- **A manager's audit output is unparseable or malformed in a way distinct from pkg_audit's normal nonZeroOk:true 'findings reported' convention (e.g. expectsJson:true but JSON.parse fails, or an unexpected text shape for a non-JSON manager).** (recoverable)
  - Detection: The per-manager raw-output-to-SecurityAdvisoryMatch mapper fails to extract any usable fields from r.stdout.
  - Response: Recorded in unavailableSources as an execution gap; never silently reported as a clean, findings-free result.
  - User impact: A parse failure never masquerades as a successful security check.
- **A bare `pip` manifest (requirements.txt with no Pipfile.lock/poetry.lock) does not have per-dependency hashes, so --require-hashes --no-deps cannot run without either failing outright or falling back to resolution (which can execute setup.py).** (recoverable)
  - Detection: The generated-requirements step checks every line for a --hash pin before invoking pip-audit; an unhashed requirements.txt fails this check.
  - Response: Plain 'pip' with an unhashed manifest is recorded perManagerMode 'unsupported' -- never falls back to resolving or installing to make the audit possible.
  - User impact: Never silently executes third-party setup.py code just to make an audit possible; the coverage gap is explicit instead.
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
| A dirty/untracked file within a manager's complete required input set has git attributes that would apply a clean filter (e.g. line-ending normalization) if hashed via git_hash_object. | computeContentIdentity hashes the file's raw bytes directly via Node's crypto, bypassing git attribute filters entirely, so the digest reflects exactly what is copied into the isolated materialization and audited -- never a filter-transformed value. |
| cargo audit's advisory-database git fetch succeeds but finds the local clone already up to date (no new commits). | Still counted as a successful, verified fetch against the one pinned remote -- not treated as a failure merely because nothing changed. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, matching the daemon tools convention this Story's own pkg_audit change sits beside (e.g. src/daemon/tools/__tests__/approval-broker.test.ts's `import test from 'node:test'` pattern).`

**Test levels**

- **unit** — Prove computeContentIdentity's determinism, scoping, and raw-byte hashing in isolation, with a fake git-plumbing layer (no real git_rev_parse/git_status subprocess calls) and real Node crypto over fixture bytes.
  - Subjects: `computeContentIdentity: identical HEAD sha + identical complete-input-set bytes -> identical string on repeated calls`, `computeContentIdentity: a change to a dirty file's raw bytes within the complete input set -> a different string`, `computeContentIdentity: a change to a file OUTSIDE the complete input set -> no change to the string`, `computeContentIdentity: a targets.entries path resolving outside repoPath -> throws`, `computeContentIdentity: a file with git attributes that would apply a clean filter -> the digest reflects the RAW bytes, not the filtered content (a fixture repo with a .gitattributes clean filter, comparing computeContentIdentity's result against the raw file bytes hashed independently)`, `computeContentIdentity: git state unreadable (not a git repo) -> throws the documented Error`
- **unit** — Prove requiredInputsForManager + the isolated materialization step produce a complete, isolated copy and never touch repoPath directly during audit.
  - Subjects: `requiredInputsForManager: npm/pnpm/yarn/cargo/pipenv/poetry each return their full {manifest, lockfile} pair, not just the single named path`, `materialization: copies exactly the required input set into a fresh temp directory; no other repoPath file is present in the copy`, `materialization: the hash computed during materialization matches a hash computed independently over the copy's own bytes afterward`
- **unit** — Prove enumerateManagers finds every manifest signal, not just the first lockfile-precedence match, and flags same-directory ambiguity.
  - Subjects: `enumerateManagers: a directory with both an npm package.json and a Python requirements.txt -> two independent {manager, manifestDir} entries, not one`, `enumerateManagers: two conflicting lockfiles for the same manager family in one directory -> flagged as an unresolved ambiguity, never silently picking one`, `enumerateManagers: no manifest anywhere under repoPath -> an empty result, no gap reported for any manager`
- **unit** — Prove collectDependencyAdvisories' per-manager gating and gap-reporting logic in isolation, with a fake negative-access probe and a fake pkg_audit invocation -- no real subprocesses.
  - Subjects: `collectDependencyAdvisories: a manager whose negative-access probe fails -> perManagerMode 'unsupported', coordinates moved to unresolvedDependencies, pkg_audit never invoked for it`, `collectDependencyAdvisories: pkg_audit spawnError for a manager that passed its probe -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: a non-zero exit with parseable output (pkg_audit's nonZeroOk:true convention) -> treated as a successful audit, matches populated, no gap`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: materialization failure (missing required sibling file) -> perManagerMode 'unsupported', no fallback to the live repoPath tree`, `collectDependencyAdvisories: a bare pip requirements.txt with no hash pins -> perManagerMode 'unsupported', never falls back to resolving/installing`, `collectDependencyAdvisories: pipenv/poetry audited via the generated hash-pinned requirements + pip-audit path, not their own native `pipenv check`/`poetry audit` commands`, `collectDependencyAdvisories: the same coordinate name via two different managers in two different directories -> two independent matches, no de-duplication`
  - Fixtures: `a fake pkg_audit invocation (controllable exit code / stdout / spawnError per manager) standing in for the real pkgAuditTool.execute call`, `a fake negative-access probe returning pass/fail per manager type on command`, `repoPath fixtures with varying manifest combinations (npm+pip in separate dirs, go-only, no manifest, duplicate coordinate names across managers, Pipfile.lock/poetry.lock fixtures for the pip-audit substitution path)`
- **unit** — Prove createDependencySbomEvidenceProvider's registry-contract mapping -- the thin EvidenceProviderOutput must stay distinct from the richer SecurityAdvisoryEvidence.
  - Subjects: `createDependencySbomEvidenceProvider(repoPath).category === 'dependency-sbom'`, `createDependencySbomEvidenceProvider(repoPath).run(input) maps each SecurityAdvisoryMatch into one SecurityEvidence with providerCategory:'dependency-sbom' and a locator pointing at the matched coordinate's manifest file`, `the EvidenceProviderOutput never carries advisoryId/affectedVersions/severity/provenance/advisoryDestination directly -- those stay in the richer SecurityAdvisoryEvidence obtained separately via collectDependencyAdvisories`
- **unit** — Prove pkgAuditTool's new, additive `env` input is forwarded correctly and does not change behavior for any caller that omits it.
  - Subjects: `pkgAuditTool.execute: no `env` provided -> runShell is called exactly as before (process.env unchanged), matching existing behavior for every current caller`, `pkgAuditTool.execute: `env` provided -> runShell is called with that exact env object, not merged silently with process.env in a way that could leak unrelated variables`, `pkgAuditTool.execute: manager:'pipenv'/'poetry' now invokes pip-audit against the generated hash-pinned requirements file, not `pipenv check`/`poetry audit``
- **live** — Prove at least one manager's destination pin and negative-access probe actually confine real traffic end-to-end against a real subprocess, and that cargo audit's local-comparison design discloses nothing -- gated behind INSRC_LIVE_TESTS=1 per the project's existing live-service-test convention.
  - Subjects: `collectDependencyAdvisories against a real npm manifest: the audit's traffic goes only to the pinned registry, and a decoy destination outside that pin is confirmed unreachable via npm's own configured path`, `collectDependencyAdvisories against a real cargo manifest: no package coordinate is ever transmitted over the network (only the one advisory-db git fetch occurs), confirmed by observing the actual network calls made`
  - Fixtures: `real npm and cargo manifest fixture repos, run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac2` | `collectDependencyAdvisories: a manager whose negative-access probe fails -> perManagerMode 'unsupported', coordinates moved to unresolvedDependencies, pkg_audit never invoked for it`, `collectDependencyAdvisories: pkg_audit spawnError for a manager that passed its probe -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: a non-zero exit with parseable output (pkg_audit's nonZeroOk:true convention) -> treated as a successful audit, matches populated, no gap`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: materialization failure (missing required sibling file) -> perManagerMode 'unsupported', no fallback to the live repoPath tree`, `collectDependencyAdvisories: a bare pip requirements.txt with no hash pins -> perManagerMode 'unsupported', never falls back to resolving/installing`, `pkgAuditTool.execute: no `env` provided -> runShell is called exactly as before (process.env unchanged), matching existing behavior for every current caller`, `collectDependencyAdvisories against a real npm manifest: the audit's traffic goes only to the pinned registry, and a decoy destination outside that pin is confirmed unreachable via npm's own configured path`, `collectDependencyAdvisories against a real cargo manifest: no package coordinate is ever transmitted over the network (only the one advisory-db git fetch occurs), confirmed by observing the actual network calls made` |

## 7. Alternatives considered

### 7.1 a1: Minimal additive pkg_audit env override + per-call ephemeral allowlisting proxy — **CHOSEN**

Add one optional `env` field to pkgAuditTool's existing inputSchema (cwd is already there), forwarded to runShell's own per-call env option; s2's orchestration module starts a short-lived allowlisting proxy and per-manager scoped cwd/env for exactly the duration of one audit call.

Extend pkgAuditTool's inputSchema/execute with an optional `env?: Record<string,string>` passed straight to runShell's existing options.env (shell-helper.ts:40,103) -- a single additive field, not a behavior change to any existing caller. s2's own module: (1) computes contentIdentity (git_rev_parse + git_status + raw-byte hashing, in the same pass as isolated materialization); (2) for each manager enumerateManagers finds, materializes its complete required input set and pins its audit to that manager's own documented single destination (not a generic proxy for every manager uniformly); (3) verifies that pin with a per-manager-type negative-access probe before trusting it, refusing (coverage gap) any manager that fails; (4) maps pkg_audit's raw per-manager `parsed` output into SecurityAdvisoryMatch[] with an honest, per-manager disclosure profile; (5) wraps the whole result into both the thin EvidenceProviderOutput (for the dependency-sbom registry contract) and the richer SecurityAdvisoryEvidence (sc2, returned directly for s3).

(Revision 2 corrects this alternative's enforcement mechanism, filesystem confinement, contentIdentity determinism and manager-coverage per the review findings below -- see §2, §3.2-3.8, §5, §6 for the corrected design; the choice of a1 over a2/a3 stands unchanged.)

### 7.2 a2: A wholly separate scoped-audit fetcher bypassing pkg_audit

Build a new, standalone dependency-advisory fetcher that duplicates argv-building and subprocess invocation for each manager itself, instead of calling pkgAuditTool at all.

Write a new module that re-implements per-manager argv construction (duplicating auditArgv's logic, which is module-private and not exported from pkg/index.ts) and calls runShell directly with full control over cwd/env/proxy from the start, never touching pkgAuditTool's existing execute() path.

**Rejected because:** Violates ac2's explicit text outright by being exactly the 'new fetcher' the Story forbids, and duplicates auditArgv's already-correct per-manager logic -- rejected regardless of its other merits.

### 7.3 a3: Mutate the daemon's own process.env around the pkg_audit call

Avoid changing pkg_audit's code at all by temporarily overwriting process.env.HTTP_PROXY/HTTPS_PROXY (and restoring it afterward) for the duration of the call, since pkgAuditTool.execute defaults to process.env when no env override is passed.

Before calling pkgAuditTool.execute, set process.env.HTTP_PROXY/HTTPS_PROXY/NO_PROXY to the ephemeral proxy's address and the manager's scoped settings; restore the prior values in a finally block after the call returns.

**Rejected because:** Nominally keeps ac2's wiring intact (same pkgAuditTool.execute call site, no schema change) but the enforcement mechanism itself is unsafe under the daemon's own concurrent, threaded session model -- a global process.env mutation is not a boundary sc2's 'enforced, not merely observed' advisoryDestination can rely on.

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
