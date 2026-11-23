<!-- insrc:artifact PLAN-0765b3a578e43eec-s2 -->

# Plan: STORY-0765b3a578e43eec-s2

## Summary

**Epic:** `add-dedicated-security-reviews`
**LLD run:** `wf-1795340676261-vxtdhu`
**LLD effective hash:** `60b05edbecc2...`

Building this Story adds dependency-advisory collection to the security-review module: a shared content-identity hash reused from s3, a manager-closure coverage check run both before and after each manager's audit, and a lockfile-export step that keeps an excluded private dependency excluded even through pip-audit's own resolution. The existing pkg_audit tool gains two small, additive fields; everything else (enumerating managers, computing the identity, checking closures, exporting lockfiles, and the orchestrator that ties them together) is new.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add requirementsPath + noDeps fields to pkgAuditTool's inputSchema and auditArgv | S | — | — | unit: pkgAuditTool.execute: noDeps:true -> argv includes --no-deps; unit: pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today; unit: auditArgv('pip', {requirementsPath}) appends -r <requirementsPath>; unit: auditArgv('npm') with no new params is unchanged from today | [[c5]] |
| 2 | **`t2`** Implement enumerateManagers | S | — | — | unit: enumerateManagers finds a manager for each of the 8 supported manifest/lockfile shapes; unit: enumerateManagers: two manifests for the same manager family -> unresolved ambiguity; unit: enumerateManagers: a directory with no recognizable manifest yields no manager | [[c7]] |
| 3 | **`t3`** Implement computeContentIdentity | S | — | — | unit: computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes; unit: computeContentIdentity: a file NOT in targets.entries is edited -> no change; unit: computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls; unit: computeContentIdentity: a targets.entries path outside repoPath throws | [[c1]] |
| 4 | **`t4`** Implement verifyManagerClosureCoverage | M | — | `t2` | unit: verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results; unit: verifyManagerClosureCoverage: a closure fully contained in targets.entries -> covered:true; unit: verifyManagerClosureCoverage: a closure referencing a file outside targets.entries -> covered:false with missing listed | [[c2]] |
| 5 | **`t5`** Implement lockfile export (requirementsPath generation) with faithful-export and version-uncertain gap detection | M | — | `t1` | unit: a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies; unit: a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain; unit: a poetry.lock entry with an exact PyPI pin is included in the generated requirementsPath | [[c5]] [[c6]] |
| 6 | **`t6`** Implement collectDependencyAdvisories | L | — | `t1`, `t2`, `t3`, `t4`, `t5` | unit: collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true; unit: collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true; unit: collectDependencyAdvisories: a manager's closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable; unit: collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager's own results are still returned; unit: collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories; unit: collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case); unit: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only; unit: collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources; unit: collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination; live: collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on | [[c3]] [[c6]] [[c7]] [[c9]] |
| 7 | **`t7`** Implement createDependencySbomEvidenceProvider | S | — | `t6` | unit: createDependencySbomEvidenceProvider: category is 'dependency-sbom' and run() delegates to collectDependencyAdvisories with the captured repoPath | [[c4]] |

### 1.1 TASK-0765b3a578e43eec-s2-t1 — Add requirementsPath + noDeps fields to pkgAuditTool's inputSchema and auditArgv

Add two optional inputSchema fields to pkgAuditTool (src/daemon/tools/builtins/pkg/index.ts): requirementsPath?: string and noDeps?: boolean. auditArgv gains the same two parameters: appends `-r <requirementsPath>` for pip/pipenv/poetry when provided, and `--no-deps` when noDeps is true. Both additive; omitted, every existing caller's behavior and argv is byte-for-byte unchanged.

**Acceptance checks:**
- auditArgv('pip', {requirementsPath:'/tmp/x.txt'}) includes '-r /tmp/x.txt' in argv
- auditArgv('pip', {noDeps:true}) includes '--no-deps' in argv
- auditArgv('npm') with no new params produces the identical argv as today (no requirementsPath/noDeps leakage into unrelated managers)
- pkgAuditTool's inputSchema declares both new fields as optional

### 1.2 TASK-0765b3a578e43eec-s2-t2 — Implement enumerateManagers

enumerateManagers(repoPath, targets) walks repoPath to find every manager's manifest/lockfile, returning each detected manager with its manifestDir, and flags an unresolved ambiguity when two manifests for the same manager family appear in one directory.

**Acceptance checks:**
- enumerateManagers finds a manager for each of the 8 supported manifest/lockfile shapes (npm/pnpm/yarn/pip/pipenv/poetry/go/cargo)
- two manifests for the same manager family in one directory are recorded as an unresolved ambiguity, never silently resolved to one
- a directory with no recognizable manifest yields no manager for that directory

### 1.3 TASK-0765b3a578e43eec-s2-t3 — Implement computeContentIdentity

computeContentIdentity(repoPath, targets) returns a deterministic digest over the repo's HEAD commit sha plus a sha256 of every file named in targets.entries' actual, current raw bytes -- a simple, shared, non-manager-aware hash (the same function s3 will also call over the same targets).

**Acceptance checks:**
- editing an application-source file listed in targets.entries changes the digest
- editing a file NOT in targets.entries leaves the digest unchanged
- two calls with no intervening change to targets.entries' files yield the identical string
- a targets.entries path resolving outside repoPath throws
- repoPath that is not a registered git repository, or whose HEAD cannot be resolved, throws

### 1.4 TASK-0765b3a578e43eec-s2-t4 — Implement verifyManagerClosureCoverage

verifyManagerClosureCoverage(repoPath, targets, manager, manifestDir) re-resolves a manager's required-input closure (nested -r/-c references for pip-family; a go module's full source tree for go) fresh on every call, and returns covered:true or covered:false with the missing files listed. Never caches a prior result.

**Acceptance checks:**
- a manager's closure fully contained in targets.entries -> covered:true
- a manager's closure referencing a file outside targets.entries -> covered:false with that file listed in missing
- two calls in a row after a new file is added to the closure return different results (no caching)
- never mutates targets.entries or any other input

### 1.5 TASK-0765b3a578e43eec-s2-t5 — Implement lockfile export (requirementsPath generation) with faithful-export and version-uncertain gap detection

For pipenv/poetry, generate a requirementsPath from Pipfile.lock/poetry.lock containing only plain-PyPI-sourced, faithfully-representable entries; a git/path/url-sourced or unfaithfully-representable entry is excluded and recorded as a non-standard-source gap (added to unresolvedDependencies). For plain pip, use the project's own requirements.txt directly; an entry that is not an exact pin is recorded as version-uncertain (also added to unresolvedDependencies), but the file itself is never rewritten. Every requirementsPath this step generates itself (pipenv/poetry only, never plain pip) is always paired with noDeps:true when later passed to pkgAuditTool (t1's fields).

**Acceptance checks:**
- a poetry.lock entry with a git/path/url source is excluded from the generated file and recorded in unresolvedDependencies with a non-standard-source note
- a poetry.lock entry with a plain PyPI source and exact version is included in the generated file (confirming the exact-locked version is preferred over a fresh resolution)
- a plain pip requirements.txt entry using a version range (not an exact pin) is recorded in unresolvedDependencies as version-uncertain, while requirements.txt itself is left untouched
- the generation step itself never sets noDeps -- that pairing happens at the collectDependencyAdvisories call site (t6)

### 1.6 TASK-0765b3a578e43eec-s2-t6 — Implement collectDependencyAdvisories

collectDependencyAdvisories(repoPath, targets) orchestrates the full sc2 collection: computes contentIdentity once before any manager runs (propagating a failure here) and once after the last manager's audit completes (catching a failure here as contentStable:false, never propagating); for each manager enumerateManagers finds, calls verifyManagerClosureCoverage before (gating whether it is audited at all, 'unsupported' if not covered) and after (a post-audit regression also sets contentStable:false) its audit; invokes pkgAuditTool per manager with the t5-generated requirementsPath + noDeps:true for pipenv/poetry, or the project's own requirements.txt with no noDeps for plain pip; maps each manager's raw output into SecurityAdvisoryMatch[]; records every manager's configuredDestination and perManagerMode, and accounts every queried coordinate into exactly one of matches/unresolvedDependencies/queriedCoordinates-only.

**Acceptance checks:**
- a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit) -> contentStable:false, that manager's own results are still returned
- a targets.entries file deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories
- the FIRST computeContentIdentity call's own repoPath-level precondition failure DOES propagate (distinct from the second-call case)
- a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true; plain pip's own requirements.txt is NEVER invoked with noDeps:true
- pkg_audit spawnError for a manager -> recorded in unavailableSources, never thrown
- every attempted manager's perManagerMode entry carries a configuredDestination
- a cleanly-checked coordinate with no advisory match appears in queriedCoordinates only; a coordinate with a confirmed finding appears in matches; an unresolved/unavailable coordinate appears in unresolvedDependencies/unavailableSources -- never more than one of these three

### 1.7 TASK-0765b3a578e43eec-s2-t7 — Implement createDependencySbomEvidenceProvider

createDependencySbomEvidenceProvider(repoPath) returns an EvidenceProvider with category:'dependency-sbom' whose run(input) calls collectDependencyAdvisories(repoPath, input.targets) and maps its matches into the thin EvidenceProviderOutput.evidence, satisfying the EvidenceProvider interface exactly.

**Acceptance checks:**
- the returned object's category is 'dependency-sbom'
- run(input) calls collectDependencyAdvisories with the provider's captured repoPath and input.targets
- the returned EvidenceProviderOutput.evidence reflects collectDependencyAdvisories' matches, satisfying SecurityEvidence's shape

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| pkgAuditTool.execute: noDeps:true -> argv includes --no-deps | `t1` |
| pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today | `t1` |
| collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true | `t6` |
| collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true | `t6` |
| collectDependencyAdvisories: a manager's closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable | `t6` |
| collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager's own results are still returned | `t6` |
| verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results | `t4` |
| collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories | `t6` |
| collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case) | `t6` |
| computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes | `t3` |
| computeContentIdentity: a file NOT in targets.entries is edited -> no change | `t3` |
| computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls | `t3` |
| a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies | `t5` |
| a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain | `t5` |
| a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only | `t6` |
| collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources | `t6` |
| collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination | `t6` |
| collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api computeContentIdentity` — "function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string>"
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api verifyManagerClosureCoverage` — "function verifyManagerClosureCoverage(repoPath: string, targets: ReviewTargets, manager: Manager, manifestDir: string): Promise<{ covered: true } | { covered: false; missing: readonly string[] }>"
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails.api collectDependencyAdvisories` — "function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence>"
- **[[c4]]** `prior-artifact` `LLD s2 contractDetails.api createDependencySbomEvidenceProvider` — "function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider"
- **[[c5]]** `prior-artifact` `LLD s2 dataModelChanges pkgAuditTool inputSchema + execute -- new optional noDeps field; requirementsPath generation + lifecycle` — "Add a second optional `noDeps?: boolean` property to pkgAuditTool's inputSchema (alongside revision 4's requirementsPath), appended as `--no-deps` to the pip-audit invocation when true."
- **[[c6]]** `prior-artifact` `LLD s2 dataModelChanges Post-audit per-manager closure re-verification; Post-collection hash-read failure -> contentStable:false` — "verifyManagerClosureCoverage is called a SECOND time, immediately after that manager's audit completes, re-resolving the closure fresh ... contentStable for the WHOLE collection is set to false"
- **[[c7]]** `prior-artifact` `LLD s2 dataModelChanges enumerateManagers` — "enumerateManagers -- Unchanged from revision 3."
- **[[c9]]** `prior-artifact` `LLD s2 dataModelChanges configuredDestination recording; SecurityAdvisoryEvidence (sc2)` — "{ contentIdentity, contentStable, readOnly: true, queriedCoordinates, matches, perManagerMode (each entry carrying configuredDestination), unresolvedDependencies, unavailableSources }"
