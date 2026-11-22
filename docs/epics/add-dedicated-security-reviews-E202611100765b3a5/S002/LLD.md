<!-- insrc:artifact LLD-0765b3a578e43eec-s2 -->

# LLD: STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`

This Story checks a repository's dependencies against public advisories. The reviewer runs with the SAME host access as the controller itself -- no sandboxing or egress/filesystem restriction is attempted, since constraining the reviewer would degrade the review's own accuracy. s2 computes one deterministic content identity over the COMPLETE transitive closure of each manager's required inputs (not just the top-level manifest -- a requirements file's own nested -r/-c references, and a go module's full source tree, all participate), re-verifies that identity immediately after every manager's audit completes, and stamps contentStable so s3 can tell a stable collection from one a concurrent edit (even one restored before s3 checks) touched mid-run. Each package manager is pointed at the repository's own actual, LOCKED dependencies -- never an ambient environment or a stale, loosely-constrained file that could mask a vulnerable pinned version. Every manager's CONFIGURED destination (never claimed as independently observed) is recorded per manager, including for a clean, zero-finding or failed run, not only when a match is found. A manager, dependency or source that cannot be correctly targeted or resolved is reported as an explicit gap.

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
- `s3`: The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a content MISMATCH or on sc2.contentStable=false), using s1's resolved model, with the SAME host access every other CLI-backed session in this codebase already has. The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; the OWNERSHIP of ensuring targets.entries' scope covers everything both s2's dependency closure and s3's own code-review pass need (s2 only computes contentIdentity over its own manifest closure, never app source); and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `computeContentIdentity`

```typescript
function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string>
```

**Parameters:**
- `repoPath: string` — The registered repo root git_rev_parse runs against, and the base every targets.entries path is resolved and validated against.
- `targets: ReviewTargets` — The round's submitter-owned content list; computeContentIdentity expands each manager's COMPLETE TRANSITIVE required-input closure around these entries -- including a requirements file's own nested -r/-c references and, for go, the module's full source tree -- not just the single top-level manifest path named.

**Returns:** `Promise<string>` — A deterministic digest over the repo's HEAD commit sha (via git_rev_parse) plus a sha256 (Node's own crypto) of EVERY file in the complete, transitively-closed required-input set's actual, current raw bytes -- read and hashed unconditionally, never gated on git status. Called twice by collectDependencyAdvisories (once before, once immediately after running every manager's audit) to detect a mutation during the collection window; s3 separately recomputes it again before trusting the evidence.

**Errors:**
- `Error` when the target repository's git state cannot be read (not a git repository, repoPath not registered, or the underlying git_rev_parse call fails)
- `Error` when a targets.entries path resolves outside repoPath
- `Error` when a nested -r/-c reference inside a required requirements file cannot be resolved (missing or unreadable)

**Preconditions:**
- repoPath is a registered repo root with a resolvable HEAD

**Postconditions:**
- pure function of the repo's current file bytes, repoPath and targets.entries -- calling it twice with no intervening change to the complete, transitively-closed input set yields the identical string
- follows every nested -r/-c reference inside a pip-family requirements file, and includes a go module's full source tree, not just its manifest/lockfile pair
- never includes file content from outside repoPath or the complete required-input closure
- hashes raw file bytes directly -- never delegates to git_hash_object or relies on git status to decide which files to include

### 2.2 `collectDependencyAdvisories`

```typescript
function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence>
```

**Parameters:**
- `repoPath: string` — Same registered repo root as computeContentIdentity; also the root enumerateManagers walks to find every manifest in scope.
- `targets: ReviewTargets` — Bounds which manifests/managers are in scope for this collection, same as computeContentIdentity's targets.

**Returns:** `Promise<SecurityAdvisoryEvidence>` — sc2's full result: contentIdentity (computed BEFORE running any manager's audit), contentStable (true iff a SECOND computeContentIdentity call made immediately after every manager's audit completes returns the identical string), queriedCoordinates, matches, perManagerMode (each entry now carrying configuredDestination), unresolvedDependencies, and unavailableSources.

**Preconditions:**
- enumerateManagers(repoPath, targets) has found at least an attempt-worthy manifest, or the result is an all-gaps SecurityAdvisoryEvidence

**Postconditions:**
- computes contentIdentity once before any manager runs, then again immediately after the LAST manager's audit completes; contentStable is false whenever these two values differ, surfacing a mutation that happened during collection (including one restored before s3's own later check) rather than silently trusting the pre-audit value
- every manager it attempts runs with the SAME host access as the controller itself, directly against repoPath (or the manager's own manifest directory within it) -- no sandboxing, no isolated copy
- every manager is correctly TARGETED at its own locked/pinned dependencies (never an ambient default, and never a stale or loosely-constrained file that could mask a vulnerable pinned version): pipenv/poetry ALWAYS regenerate their requirements input fresh from Pipfile.lock/poetry.lock, ignoring any stray requirements.txt that might sit beside them; plain pip uses its own existing requirements.txt directly (no lockfile alternative exists for bare pip)
- records, per manager, the configuredDestination it was set up to reach -- persisted on EVERY perManagerMode entry, including a manager that found nothing or failed, not only one that produced a match
- every queried coordinate ends up in exactly one of matches or unresolvedDependencies -- never silently dropped
- never throws -- every manager-level failure becomes an explicit perManagerMode/unavailableSources/unresolvedDependencies entry, not an exception, matching ac2's 'remain explicit gaps' requirement

### 2.3 `createDependencySbomEvidenceProvider`

```typescript
function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider
```

**Parameters:**
- `repoPath: string` — Captured in the returned provider's closure and forwarded to collectDependencyAdvisories on every run() call, since EvidenceProvider.run's own fixed signature carries no repo-identity field.

**Returns:** `EvidenceProvider` — An object with category:'dependency-sbom' whose run(input) calls collectDependencyAdvisories(repoPath, input.targets) and maps its matches into the thin EvidenceProviderOutput.evidence. The richer SecurityAdvisoryEvidence itself is NOT part of this return value -- the orchestration module obtains sc2 directly by calling collectDependencyAdvisories.

**Postconditions:**
- the returned object satisfies the EvidenceProvider interface exactly, so the existing EvidenceProviderRegistry can hold it under the 'dependency-sbom' key unchanged

## 3. Data model changes

### 3.1 `pkgAuditTool inputSchema + execute -- new optional requirementsPath field` — field-add

Add one optional `requirementsPath?: string` property to pkgAuditTool's inputSchema. auditArgv's pip/pipenv/poetry cases append `-r <requirementsPath>` to the pip-audit invocation when it is provided; when it is OMITTED, every manager's behavior is byte-for-byte identical to today (pip-audit's ambient-environment default, pipenv's own `pipenv check`, poetry's own `poetry audit`) -- this is the mechanism that replaces revision-3's unspecified 'field-modify', making the change purely additive and leaving every existing caller (including one that omits the field) unaffected. s2 is the only caller that ever passes it.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`
- `src/daemon/tools/builtins/pkg/index.ts:468-507`

### 3.2 `requirementsPath generation + lifecycle (precedence rule, concurrency-safe temp file)` — new

For pipenv/poetry: ALWAYS regenerate a fresh requirements-shaped file directly from Pipfile.lock/poetry.lock's own pinned {name, version} pairs -- a stray requirements.txt sitting beside either lockfile is never consulted, so it can never mask a locked vulnerable version with a looser or stale constraint. For plain pip: use the repository's own existing requirements.txt directly via requirementsPath (no generation, since there is no lockfile to regenerate from); a plain pip project with no requirements.txt at all is an explicit coverage gap, never a fallback to the ambient environment. Any generated file is written to a per-call-unique temp path (os.tmpdir() + a fresh random id, never a fixed or shared filename) and removed in a finally block once pkg_audit returns -- so two concurrent collectDependencyAdvisories calls never collide on the same generated file.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.3 `Transitive required-input closure (expands revision-3's requiredInputsForManager)` — field-modify

CURRENT INVARIANT BEING REPLACED (revision 3): requiredInputsForManager named only each manager's top-level manifest + lockfile pair (e.g. go -> {go.mod, go.sum}), which computeContentIdentity hashed directly -- missing a pip-family requirements file's own nested `-r other.txt` / `-c constraints.txt` references (which DO affect what pip-audit actually resolves and audits), and missing the rest of a go module's source tree (which govulncheck's source-level, call-graph analysis DOES consume beyond go.mod/go.sum). NEW behavior: the required-input resolver follows every nested -r/-c reference inside a pip-family requirements file recursively, and for go, walks the full module's own source tree (every .go file under the module root) -- all of it participates in computeContentIdentity's hash, not just the top-level manifest/lockfile pair.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.4 `Post-audit contentIdentity re-verification -> SecurityAdvisoryEvidence.contentStable` — new

collectDependencyAdvisories calls computeContentIdentity ONCE before running any manager's audit, and ONCE MORE immediately after the last manager's audit completes, over the identical repoPath/targets. contentStable is true only when both calls return the identical string. This does not eliminate every possible mutation-during-audit race (a change-and-restore occurring entirely within the narrow window between the two calls would still go undetected), but it closes the much larger window the revision-3/-2 designs left open -- a change made and restored at ANY point before s3's own later check would previously go undetected entirely; now it is caught unless it happens to land inside s2's own, much shorter collection window.

### 3.5 `configuredDestination recording (replaces the revision-3 "destination actually reached" framing)` — new

pkg_audit's own output (manager, exitCode, parsed, stdout, stderr -- pkg/index.ts's PkgAuditData) carries no independent network trace, so s2 cannot claim to OBSERVE which destination a manager's traffic actually reached. Instead, s2 records each manager's CONFIGURED destination -- the registry/index/advisory-source that manager's own configuration names -- and labels it honestly as configured, never observed. This is attached to EVERY perManagerMode entry (one per manager attempted), so the audit trail survives a clean, zero-finding run or a failed one, not only a run that produced a match.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.6 `Repository-root threading (repoPath) through computeContentIdentity, collectDependencyAdvisories, createDependencySbomEvidenceProvider` — field-add

ReviewTargets carries no repository identity, so a relative path like package.json is ambiguous across two registered repos sharing that relative path. Every s2-owned function takes an explicit repoPath; every targets.entries path is validated as resolving inside repoPath before use.

**Call sites:**
- `src/workflow/artifact-core/types.ts:345-347`

### 3.7 `enumerateManagers (replaces reliance on detectManager's single-match precedence)` — new

detectManager(cwd) returns only the FIRST manager it finds via a fixed lockfile precedence order -- it never enumerates co-located managers or nested project directories. enumerateManagers(repoPath, targets) walks every manifest/lockfile signal within repoPath bounded by targets.entries' own directories, producing one {manager, manifestDir} pair per manifest found; two conflicting manifests in the SAME directory for the SAME manager family are flagged as an unresolved ambiguity rather than guessed at.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:47-79`

### 3.8 `Per-manager raw-audit-output -> SecurityAdvisoryMatch[] mapper` — new

Translates each manager's own result shape into the common SecurityAdvisoryMatch[] shape. An unparseable or malformed result is recorded in unavailableSources as an execution gap, never silently treated as 'no findings'.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.9 `SecurityAdvisoryEvidence (sc2)` — new

The HLD-defined output record this Story owns (HLD revision 6): { contentIdentity, contentStable, readOnly: true, queriedCoordinates, matches: SecurityAdvisoryMatch[], perManagerMode (each entry carrying an optional configuredDestination), unresolvedDependencies, unavailableSources }. Lives in the Epic's new standalone orchestration module, and crosses the s2->s3 boundary unchanged.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | collectDependencyAdvisories is the sole producer of SecurityAdvisoryEvidence. It computes contentIdentity over the complete transitive required-input closure BEFORE running any manager, correctly targets each manager at its own locked dependencies, runs pkg_audit with controller-equivalent access, records each manager's configuredDestination, recomputes contentIdentity once more AFTER every manager completes to stamp contentStable, and maps each manager's output into SecurityAdvisoryMatch[]. Every unresolved/unavailable/unsupported case is recorded explicitly. s3 consumes the returned value directly to recompute and verify contentIdentity before trusting the evidence, refusing on a mismatch or on contentStable=false, and to report confirmed affected dependencies vs. unverified coverage as distinct values in its own report. |

## 5. Error paths

**Error cases**

- **The repository's content changes between s2's pre-audit and post-audit contentIdentity computations (e.g. a required input file is edited during a long-running audit, whether or not it is restored afterward).** (recoverable)
  - Detection: collectDependencyAdvisories's second computeContentIdentity call (run immediately after the last manager's audit) returns a different string than the first.
  - Response: SecurityAdvisoryEvidence.contentStable is set to false; the evidence is still returned (not discarded), but s3 is contractually required to treat contentStable=false as untrustworthy and refuse rather than silently use it.
  - User impact: A mutation during collection -- even one restored before any later check would otherwise have seen it -- is caught and surfaced, rather than silently trusted.
- **A nested -r/-c reference inside a required requirements file cannot be resolved (the referenced file is missing, unreadable, or itself points outside the expected project scope).** (recoverable)
  - Detection: The required-input closure resolver's recursive walk fails to read the referenced file.
  - Response: That manager's perManagerMode is recorded 'unsupported' -- the manager is never audited against an incomplete closure, and contentIdentity is never computed over a partial, silently-truncated input set.
  - User impact: Never silently audits (or hashes) less than the real, complete dependency closure.
- **Writing or removing the generated requirementsPath temp file fails (disk full, permissions, or the finally-block cleanup itself errors).** (recoverable)
  - Detection: The fs write/unlink call surfaces an error.
  - Response: That manager's perManagerMode is recorded 'unavailable'/'unsupported'; pkg_audit is never invoked with a missing or stale generated file.
  - User impact: Never runs an audit against a file that may not actually contain what was intended.
- **pkg_audit's underlying CLI binary is not installed for a manager enumerateManagers found (e.g. pip-audit itself is missing).** (recoverable)
  - Detection: runShell's existing r.spawnError flag surfaces back to collectDependencyAdvisories.
  - Response: That manager is recorded in unavailableSources as an execution gap, never conflated with 'no findings reported'.
  - User impact: Distinguishes 'the audit tool is genuinely absent' from 'the audit ran and found nothing.'
- **A manager's audit output is unparseable or malformed, distinct from pkg_audit's normal nonZeroOk:true 'findings reported' convention.** (recoverable)
  - Detection: The per-manager raw-output-to-SecurityAdvisoryMatch mapper fails to extract any usable fields from r.stdout.
  - Response: Recorded in unavailableSources as an execution gap; never silently reported as a clean, findings-free result.
  - User impact: A parse failure never masquerades as a successful security check.
- **A plain `pip` project has no requirements.txt at all -- there is nothing to point pip-audit's `-r` argument at, and plain pip has no lockfile alternative to generate one from.** (recoverable)
  - Detection: requiredInputsForManager finds no requirements-shaped file for the detected pip project.
  - Response: Recorded as perManagerMode 'unsupported' -- never falls back to auditing the ambient active environment.
  - User impact: Never silently reverts to the wrong (ambient) target just because the expected file is missing.
- **Two different package-manager manifests for the SAME manager family are found in the same directory under repoPath.** (recoverable)
  - Detection: enumerateManagers detects more than one candidate manifest for the same manager family in one directory.
  - Response: That directory's manager is recorded as an unresolved ambiguity, never guessed at by picking one arbitrarily.
  - User impact: Never silently audits the wrong lockfile when two plausible ones exist.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A manager's audit legitimately exits non-zero with a fully parseable 'findings reported' result. | Treated as a SUCCESSFUL audit -- matches populated from the parsed result, NOT an execution gap. |
| A requirements.txt contains `-r base.txt` and `-c constraints.txt`. | Both referenced files are resolved into the hashed required-input set and into whatever pip-audit itself reads when given the top-level file via -r; neither is silently excluded from contentIdentity. |
| A .go source file (not go.mod/go.sum) is edited, with the module's declared dependencies unchanged. | contentIdentity changes, because the full module source tree -- not just go.mod/go.sum -- participates in the hash. |
| A poetry project has a stray, stale requirements.txt sitting beside poetry.lock (e.g. left over from a prior tool). | The stray requirements.txt is never consulted; s2 always regenerates its own requirements input fresh from poetry.lock's exact pinned versions for this manager. |
| The same coordinate name happens to appear via two different managers in two different directories in the same review. | Each manager's match is recorded independently in matches, keyed by its own manager-scoped coordinate; no de-duplication. |
| A tracked requirements/lockfile is marked assume-unchanged and its real on-disk content has diverged from HEAD; git status reports nothing. | computeContentIdentity still reflects the change -- it reads and hashes every required input file's actual current bytes directly, never consulting git status. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, matching the daemon tools convention this Story's own pkg_audit change sits beside (e.g. src/daemon/tools/__tests__/approval-broker.test.ts's `import test from 'node:test'` pattern).`

**Test levels**

- **unit** — Prove computeContentIdentity's transitive closure resolution, determinism, and unconditional raw-byte hashing.
  - Subjects: `computeContentIdentity: a requirements.txt with nested -r/-c references -> both referenced files participate in the hash`, `computeContentIdentity: a nested -r/-c reference that cannot be resolved -> throws`, `computeContentIdentity: for a go module, editing a .go source file (not go.mod/go.sum) changes the digest`, `computeContentIdentity: identical complete closure bytes -> identical string on repeated calls`, `computeContentIdentity: a change to a required input file's raw bytes -> a different string, even when marked assume-unchanged`, `computeContentIdentity: a targets.entries path resolving outside repoPath -> throws`, `computeContentIdentity: git state unreadable -> throws the documented Error`
- **unit** — Prove collectDependencyAdvisories' post-audit re-verification catches a mutation during the collection window.
  - Subjects: `collectDependencyAdvisories: a required input file changes between the pre-audit and post-audit computeContentIdentity calls -> contentStable:false, evidence still returned`, `collectDependencyAdvisories: no change between the two calls -> contentStable:true`, `collectDependencyAdvisories: a change-then-restore occurring entirely within the (simulated, widened) window between the two calls is the one case this mechanism cannot catch -- documented, not silently assumed fixed`
- **unit** — Prove pipenv/poetry always regenerate from the lockfile, plain pip always uses its own requirements.txt, and a stray file is never consulted.
  - Subjects: `a poetry project with BOTH poetry.lock and a stray requirements.txt -> the generated requirementsPath reflects poetry.lock's exact pinned versions, not the stray file's`, `a pipenv project -> the generated requirementsPath reflects Pipfile.lock's exact pinned versions`, `a plain pip project with its own requirements.txt -> requirementsPath points directly at that file, no generation`, `a plain pip project with no requirements.txt at all -> perManagerMode 'unsupported', no fallback to the ambient environment`
- **unit** — Prove the generated requirementsPath file's concurrency-safe lifecycle.
  - Subjects: `two concurrent collectDependencyAdvisories calls (different repos, both pipenv/poetry) each get a distinct, non-colliding generated temp file`, `the generated file is removed after a successful pkg_audit call`, `the generated file is removed even when pkg_audit's call fails (cleanup runs in a finally block)`
- **unit** — Prove collectDependencyAdvisories' per-manager targeting, configuredDestination recording, and gap-reporting logic in isolation, with a fake pkg_audit invocation -- no real subprocesses.
  - Subjects: `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: a non-zero exit with parseable output -> treated as a successful audit, matches populated, no gap`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination, including a manager with zero matches or a failed run`, `collectDependencyAdvisories: the same coordinate name via two different managers in two different directories -> two independent matches, no de-duplication`
  - Fixtures: `a fake pkg_audit invocation (controllable exit code / stdout / spawnError per manager) standing in for the real pkgAuditTool.execute call`, `repoPath fixtures with varying manifest combinations, including nested requirements references and Pipfile.lock/poetry.lock fixtures`
- **unit** — Prove createDependencySbomEvidenceProvider's registry-contract mapping.
  - Subjects: `createDependencySbomEvidenceProvider(repoPath).category === 'dependency-sbom'`, `createDependencySbomEvidenceProvider(repoPath).run(input) maps each SecurityAdvisoryMatch into one SecurityEvidence with providerCategory:'dependency-sbom' and a locator pointing at the matched coordinate's manifest file`
- **unit** — Prove pkgAuditTool's new, additive requirementsPath input is forwarded correctly and does not change behavior for any caller that omits it.
  - Subjects: `pkgAuditTool.execute: no requirementsPath provided -> argv is identical to today for every manager (pip-audit's ambient default, pipenv check, poetry audit)`, `pkgAuditTool.execute: requirementsPath provided for manager:'pip'/'pipenv'/'poetry' -> argv includes `-r <requirementsPath>``
- **live** — Prove the -r targeting and lockfile precedence actually audit the repository's own locked dependencies rather than the ambient environment or a stray file, against a real subprocess -- gated behind INSRC_LIVE_TESTS=1.
  - Subjects: `collectDependencyAdvisories against a real poetry project: a deliberately vulnerable version pinned in poetry.lock is found, while a different, non-vulnerable version named in a stray requirements.txt beside it is NOT what gets reported`
  - Fixtures: `a real poetry project fixture with a known-vulnerable locked version and a conflicting stray requirements.txt, run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac2` | `collectDependencyAdvisories: a required input file changes between the pre-audit and post-audit computeContentIdentity calls -> contentStable:false, evidence still returned`, `a poetry project with BOTH poetry.lock and a stray requirements.txt -> the generated requirementsPath reflects poetry.lock's exact pinned versions, not the stray file's`, `a plain pip project with no requirements.txt at all -> perManagerMode 'unsupported', no fallback to the ambient environment`, `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources, not conflated with 'no findings'`, `collectDependencyAdvisories: unparseable/malformed output -> recorded in unavailableSources, never reported as 'no findings'`, `collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination, including a manager with zero matches or a failed run`, `pkgAuditTool.execute: no requirementsPath provided -> argv is identical to today for every manager`, `collectDependencyAdvisories against a real poetry project: a deliberately vulnerable version pinned in poetry.lock is found, while a different, non-vulnerable version named in a stray requirements.txt beside it is NOT what gets reported` |

## 7. Alternatives considered

### 7.1 a1: Minimal additive pkg_audit targeting fix, controller-equivalent access — **CHOSEN**

Point pip-family managers at the repository's own LOCKED requirements via pip-audit's own `-r` argument (never a stray or ambient alternative); no proxy, isolation, or verification machinery is built, since the reviewer runs with the same host access as the controller.

Add one optional `requirementsPath?: string` field to pkgAuditTool's inputSchema (purely additive -- omitted, every manager behaves exactly as today); auditArgv's pip/pipenv/poetry cases append `-r <requirementsPath>` only when it is provided. s2's own module: (1) computes contentIdentity over the COMPLETE TRANSITIVE required-input closure (following nested -r/-c references; a go module's full source tree) before running any manager; (2) enumerates every manager in scope, regenerating a fresh requirementsPath from Pipfile.lock/poetry.lock for pipenv/poetry (never a stray requirements.txt) or using plain pip's own requirements.txt directly, written to a per-call-unique temp file cleaned up in a finally block; (3) runs pkg_audit with the same host access the controller has; (4) records each manager's configuredDestination (honestly labeled as configured, never observed), persisted per manager even for a clean or failed run; (5) recomputes contentIdentity once more after the last manager completes and stamps contentStable; (6) maps pkg_audit's raw output into SecurityAdvisoryMatch[], and (7) wraps the result into both the thin EvidenceProviderOutput and the richer SecurityAdvisoryEvidence (sc2, now additionally carrying contentStable and perManagerMode[].configuredDestination per HLD revision 6). Revision 4 closes the TOCTOU/incomplete-closure/unobservable-destination/unspecified-wiring gaps the revision-3 reviewer found, without reintroducing any sandboxing; the choice of a1 over a2/a3 stands unchanged.

**Pros:**
- Reuses pkg_audit directly -- the only code change is pointing pip-family managers at the repo's own requirements via -r, satisfying ac2's 'not a new fetcher' requirement
- No proxy, isolation, or verification machinery to build or maintain -- the reviewer runs with the same host access as the controller, per the HLD's revision-5 policy
- Full, accurate resolution (no --no-deps/--require-hashes restriction) is preferred over a restricted one now that sandboxing is explicitly out of scope

**Cons:**
- s2's own reports of which destination each manager reached are self-reported/configured, not independently verified -- an accepted, documented tradeoff (HLD risky bit 'Controller-equivalent access tradeoff'), not a gap this Story tries to close
- The post-audit re-verification narrows but does not eliminate the mutation-during-audit window -- a change-and-restore entirely within that shorter window still goes undetected, documented rather than silently assumed fixed

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
