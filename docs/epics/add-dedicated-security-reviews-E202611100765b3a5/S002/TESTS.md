<!-- insrc:artifact TESTS-0765b3a578e43eec-s2 -->

# Tests: 0765b3a578e43eec s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 46 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-23T13:30:21.340Z on commit `8675aa958`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: pkgAuditTool.execute: noDeps:true -> argv includes --no-deps**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pkgAuditTool.execute: noDeps:true -> argv includes --no-deps | `src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts` |

**unit: pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today | `src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts` |

**unit: auditArgv('pip', {requirementsPath}) appends -r <requirementsPath>**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | auditArgv('pip', {requirementsPath}) appends -r <requirementsPath> | `src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts` |

**unit: auditArgv('npm') with no new params is unchanged from today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | auditArgv('npm') with no new params is unchanged from today | `src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts` | 0 | 7 | 0.5 s |  |

## t2

Run at 2026-11-23T13:36:03.435Z on commit `eb4aeb4b2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: enumerateManagers finds a manager for each of the 8 supported manifest/lockfile shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | enumerateManagers finds a manager for each of the 8 supported manifest/lockfile shapes | `src/workflow/security-review/__tests__/dependency-advisories.test.ts` |

**unit: enumerateManagers: two manifests for the same manager family -> unresolved ambiguity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | enumerateManagers: two manifests for the same manager family -> unresolved ambiguity | `src/workflow/security-review/__tests__/dependency-advisories.test.ts` |

**unit: enumerateManagers: a directory with no recognizable manifest yields no manager**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | enumerateManagers: a directory with no recognizable manifest yields no manager | `src/workflow/security-review/__tests__/dependency-advisories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/dependency-advisories.test.ts` | 0 | 4 | 0.4 s |  |

## t3

Run at 2026-11-23T20:03:02.086Z on commit `3eb949660`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeContentIdentity: an application-source file in targets.entries is edited, manifests/lockfiles unchanged -> digest changes | `src/workflow/security-review/__tests__/content-identity.test.ts` |

**unit: computeContentIdentity: a file NOT in targets.entries is edited -> no change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeContentIdentity: a file NOT in targets.entries is edited -> no change | `src/workflow/security-review/__tests__/content-identity.test.ts` |

**unit: computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeContentIdentity: identical targets.entries bytes -> identical string on repeated calls | `src/workflow/security-review/__tests__/content-identity.test.ts` |

**unit: computeContentIdentity: a targets.entries path outside repoPath throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeContentIdentity: a targets.entries path outside repoPath throws | `src/workflow/security-review/__tests__/content-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/content-identity.test.ts` | 0 | 10 | 0.9 s |  |

## t4

Run at 2026-11-23T14:09:04.477Z on commit `17015eab0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyManagerClosureCoverage: re-resolves the closure fresh on each call -- two calls in a row after a file is added return different results | `src/workflow/security-review/__tests__/closure-coverage.test.ts` |

**unit: verifyManagerClosureCoverage: a closure fully contained in targets.entries -> covered:true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyManagerClosureCoverage: a closure fully contained in targets.entries -> covered:true | `src/workflow/security-review/__tests__/closure-coverage.test.ts` |

**unit: verifyManagerClosureCoverage: a closure referencing a file outside targets.entries -> covered:false with missing listed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyManagerClosureCoverage: a closure referencing a file outside targets.entries -> covered:false with missing listed | `src/workflow/security-review/__tests__/closure-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/closure-coverage.test.ts` | 0 | 16 | 0.4 s |  |

## t5

Run at 2026-11-23T14:20:25.227Z on commit `2eb9c6de7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | generateLockfileExport(poetry): a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies | `src/workflow/security-review/__tests__/lockfile-export.test.ts` |

**unit: a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | findVersionUncertainPipRequirements: a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain | `src/workflow/security-review/__tests__/lockfile-export.test.ts` |

**unit: a poetry.lock entry with an exact PyPI pin is included in the generated requirementsPath**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | generateLockfileExport(poetry): a poetry.lock entry with an exact PyPI pin is included in the generated requirementsPath | `src/workflow/security-review/__tests__/lockfile-export.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/lockfile-export.test.ts` | 0 | 8 | 0.4 s |  |

## t6

Run at 2026-11-23T20:04:28.166Z on commit `3eb949660`. Tests check: **passed**. 28 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: a generated requirementsPath (poetry) is ALWAYS invoked with noDeps:true, using the actual generated file | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a generated requirementsPath (pipenv) is ALWAYS invoked with noDeps:true, using the actual generated file | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: a manager's closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: a manager's closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager's own results are still returned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: a manager's closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager's own results are still returned | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case) | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: the exact same coordinate reported BOTH clean and as a match (duplicate/conflicting entries) is kept only in matches, never also in queriedCoordinates | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: duplicate raw entries for the SAME coordinate -- one with no 'vulns' key (unresolved) and one with a confirmed vuln (match) -- reconcile to the match, never also unresolved | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: duplicate raw entries for the SAME coordinate -- one with no 'vulns' key (unresolved) and one cleanly audited -- reconcile to clean, never also unresolved | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a confirmed match is NEVER suppressed because an UNRELATED manager's directory recorded an unresolved gap for the same bare package name (different ecosystems can share a name without being the same coordinate) | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a pip-audit dependency entry with a non-empty but entirely malformed 'vulns' array (e.g. [null]) is unresolved, never silently dropped from every bucket | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm -- two advisories under the SAME package name cover DISJOINT version ranges; each applies only to the installed instance its own range actually covers | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm -- an advisory whose range (or the instance's own version) is not valid semver is reported as unresolved, never silently matched or silently clean | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a pip-audit response naming a package under a DIFFERENT but PEP-503-equivalent spelling (typing_extensions vs typing-extensions) is NOT rejected as unexpected | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm v1 lockfile -- a nested dependency (a different version bundled under a parent) is still part of the clean inventory, not just the top-level one | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm -- an instance whose version is outside every advisory OBJECT's range, but whose 'via' ALSO carries an unexplained transitive STRING entry, is unresolved, never silently clean | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: pkg_audit spawnError for a manager still checks post-audit closure coverage, not just pre-audit | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**unit: collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm's configuredDestination is resolved by shelling out to the manager's OWN 'config get registry' -- never a hand-parsed .npmrc | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm's configuredDestination is reported 'unknown' (never silently the public default) when 'config get registry' itself fails to run | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a genuine manager ambiguity (two lockfiles of the same family in one directory) is recorded as a coverage gap, never silently dropped from the evidence | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: a pip-audit response naming a package EXCLUDED from the generated poetry export (not in includedNames) is rejected, never accepted as a clean coordinate | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: npm -- a vulnerable package name with TWO different locked instances only reports the affected node path, and the OTHER instance stays in queriedCoordinates as clean | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: cargo -- two locked versions of the same crate, only one reported vulnerable by cargo-audit -- the match uses the REPORTED version, the other stays clean | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |
| pass | collectDependencyAdvisories: an npm audit entry whose 'via' names only OTHER vulnerable packages (no advisory objects of its own) is unresolved, never reported as cleanly audited | `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` |

**live: collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on**

Reported by the builder, not run by the gate: **pass**. Evidence: Unchanged from the prior round: /tmp/insrc-live-test-logs/t6-collect-dependency-advisories-live.log, both scenarios re-run and passing after every external-review fix (5 rounds, 14 findings total). Scenario A: privatelib unresolvable anywhere -> pip-audit's install fails outright, recorded as an execution gap. Scenario B: privatelib IS resolvable via a local index -> confirmed directly that pip-audit's real output includes it anyway (identically with/without --no-deps), but collectDependencyAdvisories' own mapping keeps it out of matches/queriedCoordinates, surfacing it only in unresolvedDependencies/unavailableSources via the quarantine fix. This remains the one confirmed, real design-assumption gap in the approved LLD (pip-audit's --no-deps does not prevent transitive resolution as the LLD assumed) -- not an implementation defect in t6, and not addressed by any of the five review rounds, which were all independent accounting/config-resolution bugs. Awaiting the user's decision on how to resolve this open item (follow-up Issue + override-approve, or an LLD amendment) before the Story can complete.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts` | 0 | 34 | 1.5 s |  |

## t7

Run at 2026-11-23T20:06:15.659Z on commit `3eb949660`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: createDependencySbomEvidenceProvider: category is 'dependency-sbom' and run() delegates to collectDependencyAdvisories with the captured repoPath**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createDependencySbomEvidenceProvider: category is 'dependency-sbom' and run() delegates to collectDependencyAdvisories with the captured repoPath | `src/workflow/security-review/__tests__/dependency-sbom-evidence-provider.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/dependency-sbom-evidence-provider.test.ts` | 0 | 2 | 0.7 s |  |
