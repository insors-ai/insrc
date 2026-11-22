<!-- insrc:artifact LLD-0765b3a578e43eec-s2 -->

# LLD: STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`
**Tracker:** [insors-ai/insrc#227](https://github.com/insors-ai/insrc/issues/227)

This Story checks a repository's dependencies against public advisories. The reviewer runs with the SAME host access as the controller itself -- no sandboxing is attempted. contentIdentity is ONE shared, simple digest over exactly the caller-scoped review content, computed and verified at the START and END of collection; it is marked unstable (contentStable:false) if that digest changes, if a previously-present target becomes unreadable or missing on the second read, OR if any audited manager's own required-input closure (verified BOTH before and after that manager's audit) grew to include content outside the pinned scope -- a new file appearing mid-audit is caught even though it never changes the targets.entries hash itself. When s2 generates a manager's requirements input itself from a lockfile (pipenv/poetry), that audit runs with dependency resolution DISABLED (--no-deps), so a package excluded from the export (a non-PyPI/private source) can never be silently reintroduced through another package's transitive dependency. Exact-locked versions are preferred over fresh resolution wherever a lockfile exists; a dependency whose source cannot be faithfully exported, or whose version is a range rather than an exact pin, is reported as an explicit, labeled gap. Every manager's CONFIGURED destination is recorded per manager, including for a clean or failed run.

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
- `targets: ReviewTargets` — The round's submitter-owned content list; computeContentIdentity hashes EXACTLY these files -- it is NOT manager-aware. The same shared function s3 also calls over the SAME targets.

**Returns:** `Promise<string>` — A deterministic digest over the repo's HEAD commit sha plus a sha256 of every file named in targets.entries' actual, current raw bytes. Unchanged from revision 5.

**Errors:**
- `Error` when the target repository's git state cannot be read (not a git repository, repoPath not registered, or the underlying git_rev_parse call fails)
- `Error` when a targets.entries path resolves outside repoPath
- `Error` when a targets.entries file cannot be read (missing, deleted, or permission-denied) at the time of the call -- this now includes the SECOND (post-collection) call, where collectDependencyAdvisories catches it specifically (see collectDependencyAdvisories's postconditions) rather than letting it propagate

**Preconditions:**
- repoPath is a registered repo root with a resolvable HEAD

**Postconditions:**
- pure function of the repo's current file bytes, repoPath and targets.entries -- calling it twice with no intervening change to targets.entries' files yields the identical string
- hashes ONLY the files named in targets.entries
- hashes raw file bytes directly -- never delegates to git_hash_object or relies on git status

### 2.2 `verifyManagerClosureCoverage`

```typescript
function verifyManagerClosureCoverage(repoPath: string, targets: ReviewTargets, manager: Manager, manifestDir: string): Promise<{ covered: true } | { covered: false; missing: readonly string[] }>
```

**Parameters:**
- `repoPath: string` — Same registered repo root used throughout.
- `targets: ReviewTargets` — The pinned review scope contentIdentity was computed over.
- `manager: Manager` — Which package manager's required-input closure to resolve.
- `manifestDir: string` — The directory enumerateManagers found this manager's manifest in.

**Returns:** `Promise<{ covered: true } | { covered: false; missing: readonly string[] }>` — Re-resolves this manager's required-input closure AT THE TIME OF THE CALL (not a cached result) and checks whether every file currently in it is present in targets.entries. Called TWICE by collectDependencyAdvisories for every manager it actually audits: once BEFORE the audit (a covered:false result here means the manager is never audited at all), and once AFTER the audit completes (a covered:false result here -- even though the pre-audit call returned covered:true -- means the closure GREW during the audit to include content outside the pinned scope, e.g. a new source file created mid-audit; this is folded into contentStable, not into perManagerMode, since it reflects the pinned identity's own trustworthiness, not that one manager's targeting).

**Postconditions:**
- never mutates or expands targets.entries or contentIdentity -- purely a read-only coverage check, re-evaluated fresh on every call

### 2.3 `collectDependencyAdvisories`

```typescript
function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence>
```

**Parameters:**
- `repoPath: string` — Same registered repo root as computeContentIdentity; also the root enumerateManagers walks to find every manifest in scope.
- `targets: ReviewTargets` — Bounds which manifests/managers are in scope for this collection, same as computeContentIdentity's targets.

**Returns:** `Promise<SecurityAdvisoryEvidence>` — sc2's full result, including contentStable -- now true only when ALL of: (a) the pre- and post-collection computeContentIdentity calls over targets.entries match, (b) the post-collection call did not fail to read any target, and (c) every audited manager's post-audit verifyManagerClosureCoverage call still returns covered:true when its pre-audit call did.

**Errors:**
- `Error` when propagated from computeContentIdentity's FIRST (pre-collection) call failing its repoPath-level precondition (not a git repository, or repoPath itself not registered) -- there is no sensible per-manager recovery for a broken precondition before any work has started

**Preconditions:**
- enumerateManagers(repoPath, targets) has found at least an attempt-worthy manifest, or the result is an all-gaps SecurityAdvisoryEvidence

**Postconditions:**
- computes contentIdentity once before any manager runs (propagating a failure here, since nothing has run yet), then again immediately after the last manager's audit completes; a FAILURE on this SECOND call (e.g. a target was deleted or became unreadable during collection) is CAUGHT, not propagated, and is itself treated as contentStable:false -- a target that can no longer be read the way it was read before is, by definition, not stable
- for each manager it actually audits, calls verifyManagerClosureCoverage both before (gating whether it is audited at all) and after (gating contentStable) that manager's audit
- when s2 itself generates a manager's requirementsPath from a lockfile (pipenv/poetry), the pkg_audit call for that manager ALWAYS sets noDeps:true -- so pip-audit's own dependency resolution can never reintroduce a package this Story deliberately excluded from the export (a non-PyPI/private source) via another exported package's transitive dependency; plain pip (the user's own requirements.txt, not a lockfile export) never sets noDeps
- prefers each manager's EXACT locked version wherever a lockfile exists; a lockfile entry with a non-PyPI source or an unfaithfully-exportable marker is excluded from the generated file and added to unresolvedDependencies; a plain pip requirements.txt entry that is not an exact pin is also added to unresolvedDependencies as version-uncertain
- records, per manager, the configuredDestination it was set up to reach, persisted on EVERY perManagerMode entry
- every coordinate in queriedCoordinates was actually attempted; exactly the ones with a confirmed finding also appear in matches; exactly the ones that could not be resolved/checked also appear in unresolvedDependencies; a cleanly-checked coordinate appears in queriedCoordinates only
- never throws due to a manager-level audit, closure-coverage, or post-collection re-read failure -- each becomes an explicit perManagerMode entry or a contentStable:false, never an exception; MAY propagate only the FIRST computeContentIdentity call's repoPath-level precondition failure

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

### 3.1 `pkgAuditTool inputSchema + execute -- new optional noDeps field` — field-add

Add a second optional `noDeps?: boolean` property to pkgAuditTool's inputSchema (alongside revision 4's requirementsPath), appended as `--no-deps` to the pip-audit invocation when true. Omitted (false/absent), behavior is identical to today for every caller. s2 sets it true ONLY for a requirementsPath it generated itself from a lockfile (pipenv/poetry) -- preventing pip-audit's own dependency resolution from silently reintroducing a package this Story deliberately excluded from the export via another exported package's transitive dependency (Poetry's and pip-audit's own documented recommendation for consuming an already-resolved export). Plain pip's own requirements.txt never sets it.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`
- `src/daemon/tools/builtins/pkg/index.ts:468-507`

### 3.2 `requirementsPath generation + lifecycle, with faithful-export gaps` — new

Unchanged from revision 5: only plain-PyPI-sourced, faithfully-representable lockfile entries are exported; a git/path/url-sourced or unfaithfully-representable entry is excluded and recorded as a non-standard-source gap. Plain pip uses its own requirements.txt directly; an unpinned entry is additionally recorded as version-uncertain. NOW ALSO paired with noDeps:true whenever the file was generated by s2 itself (see the field-add entity above), so an excluded entry cannot be reintroduced via transitive resolution.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.3 `Post-audit per-manager closure re-verification (expands revision-5's single pre-audit verifyManagerClosureCoverage call)` — field-modify

CURRENT INVARIANT BEING REPLACED (revision 5): verifyManagerClosureCoverage was called ONCE, before auditing a manager; a file added to that manager's closure (e.g. a new .go source file, created after the check but before or during the actual govulncheck run) would never be caught, since neither the pre-audit check nor the targets.entries-only contentIdentity hash would see it -- contentStable could remain true while the manager's actual audit scope had silently grown beyond the pinned, verified scope. NEW behavior: verifyManagerClosureCoverage is called a SECOND time, immediately after that manager's audit completes, re-resolving the closure fresh (not reusing the pre-audit result). If the post-audit call returns covered:false where the pre-audit call returned covered:true, the manager's own results are still reported (it WAS actually audited, under a scope that turned out to have grown), but contentStable for the WHOLE collection is set to false -- reusing the existing contentStable field rather than adding a new one, since both failure modes mean the same thing: the pinned scope did not hold stable across collection.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.4 `Post-collection hash-read failure -> contentStable:false (not a thrown exception)` — field-modify

CURRENT INVARIANT BEING REPLACED (revision 5): computeContentIdentity's documented Errors (unreadable repo state, out-of-scope path) were implicitly assumed to apply only to the FIRST, pre-collection call; the SECOND, post-collection call's behavior when a previously-readable target becomes missing or unreadable (e.g. deleted mid-audit) was undefined, risking an uncaught exception that would contradict collectDependencyAdvisories's own 'never throws due to a manager-level...failure' postcondition. NEW behavior: collectDependencyAdvisories wraps the SECOND computeContentIdentity call in a try/catch; any failure there (including a now-unreadable target) is treated as contentStable:false, exactly like a content mismatch -- never propagated as an exception. Only the FIRST call's failure still propagates, since at that point no manager has run and there is nothing to report gaps against.


### 3.5 `configuredDestination recording` — new

Unchanged from revision 4/5.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.6 `Repository-root threading (repoPath)` — field-add

Unchanged from revision 3/4/5.

**Call sites:**
- `src/workflow/artifact-core/types.ts:345-347`

### 3.7 `enumerateManagers` — new

Unchanged from revision 3.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:47-79`

### 3.8 `Per-manager raw-audit-output -> SecurityAdvisoryMatch[] mapper` — new

Unchanged.

**Call sites:**
- `src/daemon/tools/builtins/pkg/index.ts:164-175`

### 3.9 `SecurityAdvisoryEvidence (sc2)` — new

Unchanged shape from HLD revision 6: { contentIdentity, contentStable, readOnly: true, queriedCoordinates, matches, perManagerMode (each entry carrying configuredDestination), unresolvedDependencies, unavailableSources }. contentStable's MEANING is widened at this revision (see the two field-modify entities above) but its TYPE and the HLD contract are unchanged -- no further HLD amendment needed.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | collectDependencyAdvisories computes contentIdentity over exactly targets.entries before and after collection, catches (rather than propagates) a post-collection read failure as contentStable:false, double-checks each audited manager's closure coverage before AND after its audit (a post-audit regression also sets contentStable:false), disables pip-audit's dependency resolution for any requirements file it generated itself (preventing excluded entries from reappearing via transitive resolution), prefers exact-locked versions, records each manager's configuredDestination, and maps each manager's output into SecurityAdvisoryMatch[]. s3 consumes the returned value directly to recompute and verify contentIdentity, refusing on a mismatch or on contentStable=false. |

## 5. Error paths

**Error cases**

- **A package this Story deliberately excluded from a generated requirements file (a private/git/path-sourced lockfile entry) is a transitive dependency of a package that WAS exported; without disabling resolution, pip-audit could re-resolve and report on it from a different (public) source than the one actually pinned.** (recoverable)
  - Detection: N/A at runtime -- prevented structurally: noDeps:true is always set for a requirementsPath s2 generated itself.
  - Response: pip-audit never resolves beyond the exact set s2 exported; an excluded package is never silently reintroduced under a different identity.
  - User impact: A private/git dependency's exclusion is actually honored, not defeated by the audit tool's own normal resolution behavior.
- **A new file is added to a manager's required-input closure (e.g. a new .go source file in the module) AFTER the pre-audit verifyManagerClosureCoverage check passed, but before or during that manager's actual audit.** (recoverable)
  - Detection: The SECOND (post-audit) verifyManagerClosureCoverage call for that manager, re-resolving the closure fresh, now returns covered:false where the pre-audit call returned covered:true.
  - Response: That manager's results are still reported (the audit did run), but contentStable is set to false for the whole collection -- the pinned scope did not hold stable.
  - User impact: A silent scope-growth during audit is caught even though it would never have shown up in the targets.entries-only hash.
- **A targets.entries file that was readable during the pre-collection contentIdentity computation is deleted or becomes unreadable by the time of the post-collection re-computation.** (recoverable)
  - Detection: The second computeContentIdentity call throws; collectDependencyAdvisories catches it specifically rather than letting it propagate.
  - Response: contentStable is set to false; the evidence is still returned, never discarded, but never claimed stable either.
  - User impact: A disappeared or corrupted target is treated exactly like any other mutation during collection -- caught, not silently ignored and not an unexplained crash.
- **A manager's required-input closure (a nested -r/-c reference; a go module's source file) reaches a file outside targets.entries, caught on the PRE-audit check.** (recoverable)
  - Detection: verifyManagerClosureCoverage returns covered:false with the missing files listed.
  - Response: That manager's perManagerMode is recorded 'unsupported'; pkg_audit is never invoked for it.
  - User impact: A manager is never audited against content that was not actually part of the pinned, verified review scope.
- **A Pipfile.lock/poetry.lock entry has a non-PyPI source or an unfaithfully-exportable marker.** (recoverable)
  - Detection: The lockfile-export step classifies the entry as non-exportable.
  - Response: Excluded from the generated file, added to unresolvedDependencies with a non-standard-source note.
  - User impact: A private/git/path dependency is never mis-exported under the wrong identity.
- **repoPath itself fails computeContentIdentity's own precondition on the FIRST call (not a git repository, or not registered).** (recoverable)
  - Detection: computeContentIdentity throws before any manager-level work begins.
  - Response: collectDependencyAdvisories propagates the error.
  - User impact: A fundamentally broken call fails loudly and immediately.
- **pkg_audit's underlying CLI binary is not installed for a manager.** (recoverable)
  - Detection: runShell's existing r.spawnError flag surfaces back to collectDependencyAdvisories.
  - Response: Recorded in unavailableSources as an execution gap.
  - User impact: Distinguishes 'absent' from 'ran and found nothing.'
- **A manager's audit output is unparseable or malformed.** (recoverable)
  - Detection: The mapper fails to extract usable fields.
  - Response: Recorded in unavailableSources.
  - User impact: A parse failure never masquerades as a clean result.
- **A plain pip project has no requirements.txt at all.** (recoverable)
  - Detection: No requirements-shaped file found.
  - Response: Recorded as perManagerMode 'unsupported'.
  - User impact: Never falls back to the ambient environment.
- **Two manifests for the same manager family in one directory.** (recoverable)
  - Detection: enumerateManagers detects the conflict.
  - Response: Recorded as an unresolved ambiguity.
  - User impact: Never silently picks one.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A requirementsPath generated by s2 for a poetry project includes a package that ALSO happens to be a transitive dependency of another exported package. | Because noDeps:true is set, pip-audit treats the generated file as the complete, closed set to audit -- it never re-resolves that package's own dependencies, so the exclusion of any non-exportable sibling package is never defeated. |
| A new .go file is added to the module's source tree after verifyManagerClosureCoverage's pre-audit check, and remains present afterward (no restore). | The post-audit verifyManagerClosureCoverage call for go detects the now-uncovered file; contentStable is false even though the file is still present and nothing was 'restored'. |
| A targets.entries file is deleted during collection and never restored. | contentStable is false, set via the caught post-collection read failure, not an uncaught exception. |
| An application-source file (not a manifest) listed in targets.entries is edited, with every manifest/lockfile unchanged. | contentIdentity changes, because computeContentIdentity hashes every file in targets.entries, not only dependency manifests. |
| A dependency is successfully audited and found to have no matching advisory. | Its coordinate appears in queriedCoordinates only -- the documented, normal 'clean' outcome. |
| A requirements.txt entry uses a version range rather than an exact pin. | pip-audit still runs against the file, but the coordinate is also recorded in unresolvedDependencies as version-uncertain. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, matching the daemon tools convention this Story's own pkg_audit change sits beside (e.g. src/daemon/tools/__tests__/approval-broker.test.ts's `import test from 'node:test'` pattern).`

**Test levels**

- **unit** — Prove noDeps:true structurally prevents an excluded lockfile entry from being reintroduced via transitive resolution.
  - Subjects: `pkgAuditTool.execute: noDeps:true -> argv includes --no-deps`, `pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today`, `collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true`, `collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true`
- **unit** — Prove the post-audit closure re-verification catches a closure that grew during the audit, independent of the already-covered change-and-restore race.
  - Subjects: `collectDependencyAdvisories: a manager's closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable`, `collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager's own results are still returned`, `verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results`
- **unit** — Prove a post-collection read failure (deleted or unreadable target) is caught and mapped to contentStable:false, never propagated.
  - Subjects: `collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories`, `collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case)`
- **unit** — Prove computeContentIdentity is a simple, shared, non-manager-aware hash over exactly targets.entries (unchanged from revision 5).
  - Subjects: `computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes`, `computeContentIdentity: a file NOT in targets.entries is edited -> no change`, `computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls`
- **unit** — Prove lockfile export fidelity and the queriedCoordinates/matches/unresolvedDependencies accounting (unchanged from revision 5).
  - Subjects: `a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies`, `a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain`, `a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only`
- **unit** — Prove collectDependencyAdvisories' per-manager gap-reporting and configuredDestination recording, with a fake pkg_audit invocation.
  - Subjects: `collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources`, `collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination`
  - Fixtures: `a fake pkg_audit invocation standing in for the real pkgAuditTool.execute call`, `a controllable closure-resolver fixture that can return a different closure on successive calls to simulate mid-audit growth`
- **live** — Prove noDeps:true and exact-locked targeting actually audit the repository's own locked, closed dependency set against a real subprocess -- gated behind INSRC_LIVE_TESTS=1.
  - Subjects: `collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on`
  - Fixtures: `a real poetry project fixture with a git/path-sourced dependency that is also a transitive dependency of a published package, run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac2` | `collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true`, `collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit -> contentStable:false, the manager's own results are still returned`, `collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories`, `a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies`, `a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only`, `collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on` |

## 7. Alternatives considered

### 7.1 a1: Minimal additive pkg_audit env override + per-call ephemeral allowlisting proxy — **CHOSEN**

Add one optional `env` field to pkgAuditTool's existing inputSchema (cwd is already there), forwarded to runShell's own per-call env option; s2's orchestration module starts a short-lived allowlisting proxy and per-manager scoped cwd/env for exactly the duration of one audit call.

Add one optional `requirementsPath?: string` field to pkgAuditTool's inputSchema (purely additive -- omitted, every manager behaves exactly as today); auditArgv's pip/pipenv/poetry cases append `-r <requirementsPath>` only when it is provided. s2's own module: (1) computes contentIdentity over the COMPLETE TRANSITIVE required-input closure (following nested -r/-c references; a go module's full source tree) before running any manager; (2) enumerates every manager in scope, regenerating a fresh requirementsPath from Pipfile.lock/poetry.lock for pipenv/poetry (never a stray requirements.txt) or using plain pip's own requirements.txt directly, written to a per-call-unique temp file cleaned up in a finally block; (3) runs pkg_audit with the same host access the controller has; (4) records each manager's configuredDestination (honestly labeled as configured, never observed), persisted per manager even for a clean or failed run; (5) recomputes contentIdentity once more after the last manager completes and stamps contentStable; (6) maps pkg_audit's raw output into SecurityAdvisoryMatch[], and (7) wraps the result into both the thin EvidenceProviderOutput and the richer SecurityAdvisoryEvidence (sc2, now additionally carrying contentStable and perManagerMode[].configuredDestination per HLD revision 6). Revision 4 closes the TOCTOU/incomplete-closure/unobservable-destination/unspecified-wiring gaps the revision-3 reviewer found, without reintroducing any sandboxing; the choice of a1 over a2/a3 stands unchanged. Revision 5 further corrects: computeContentIdentity is a simple, shared, non-manager-aware hash over exactly targets.entries (restoring the HLD's 'one shared identity' invariant -- a manager-aware expansion inside it at revision 4 would have made s2's own identity diverge from whatever s3 computes over the same targets); manager closure coverage is checked SEPARATELY via verifyManagerClosureCoverage without touching the hash; lockfile export now excludes non-PyPI-sourced or unfaithfully-representable entries as explicit gaps rather than mis-exporting them; plain pip's unpinned entries are flagged version-uncertain; and the queriedCoordinates/matches/unresolvedDependencies accounting is corrected to allow a clean, successfully-checked coordinate to appear in queriedCoordinates alone. Revision 6 further corrects: pip-audit always runs with --no-deps (noDeps:true) against a requirementsPath s2 generated itself, so an excluded (non-PyPI-sourced) lockfile entry can never be silently reintroduced via another exported package's transitive dependency; verifyManagerClosureCoverage is now called BOTH before and after each manager's audit (re-resolving the closure fresh each time), folding a post-audit regression into contentStable so a closure that grows during the audit -- without ever touching the targets.entries hash -- is still caught; and a post-collection read failure (a target deleted or made unreadable during collection) is caught and mapped to contentStable:false rather than risking an uncaught exception.

### 7.2 a2: A wholly separate scoped-audit fetcher bypassing pkg_audit

Build a new, standalone dependency-advisory fetcher that duplicates argv-building and subprocess invocation for each manager itself, instead of calling pkgAuditTool at all.

Write a new module that re-implements per-manager argv construction (duplicating auditArgv's logic, which is module-private and not exported from pkg/index.ts) and calls runShell directly with full control over cwd/env/proxy from the start, never touching pkgAuditTool's existing execute() path.

**Rejected because:** Violates ac2's explicit text outright by being exactly the 'new fetcher' the Story forbids, and duplicates auditArgv's already-correct per-manager logic -- rejected regardless of its other merits.

### 7.3 a3: Mutate the daemon's own process.env around the pkg_audit call

Avoid changing pkg_audit's code at all by temporarily overwriting process.env.HTTP_PROXY/HTTPS_PROXY (and restoring it afterward) for the duration of the call, since pkgAuditTool.execute defaults to process.env when no env override is passed.

Before calling pkgAuditTool.execute, set process.env.HTTP_PROXY/HTTPS_PROXY/NO_PROXY to the ephemeral proxy's address and the manager's scoped settings; restore the prior values in a finally block after the call returns.

**Rejected because:** Nominally keeps ac2's wiring intact (same pkgAuditTool.execute call site, no schema change) but the enforcement mechanism itself is unsafe under the daemon's own concurrent, threaded session model -- a global process.env mutation is not a boundary sc2's 'enforced, not merely observed' advisoryDestination can rely on. Moot at revision 3 since no env-based network enforcement of any kind is attempted anymore, but a1's per-call scoping remains the better code-change pattern regardless.

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
- **[[c24]]** `stakeholder` `reviewer finding: 2 HIGH + 1 MED on LLD revision 5 (dependency resolution can reintroduce excluded lockfile entries; closure membership can change without changing the digest; deleting a target during collection has no defined outcome)`

## Citations

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
- **[[c24]]** `stakeholder` `reviewer finding: 2 HIGH + 1 MED on LLD revision 5 (dependency resolution can reintroduce excluded lockfile entries; closure membership can change without changing the digest; deleting a target during collection has no defined outcome)`
