<!-- insrc:artifact CR-7e0ae92e8f3d3c3e-s2 -->

# Code review: 7e0ae92e8f3d3c3e:s2

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 6 · model `claude:opus`

**Changed files:** 38

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/notices.ts:22 | `assembleSourceMetadata` writes every admitted source from every stage into the SourceManifest and the NOTICE. It takes them from `collectSources(stages)` and never checks whether any lineage binding refers to a source, either directly or as the evidence of a referenced source. Nothing in the call chain filters out unreferenced sources: not `validateOutputLineage`, not `assessEligibility` and not `prepareEligibilityCandidate`. So suppose a source is admitted at staging but no output is derived from it. It is still published as distributed source metadata and gets its own NOTICE obligations, even though none of its material is in the candidate. The reconstruction step in `assessEligibility` uses the same function to build its expected metadata, so it repeats the over-inclusion instead of catching it. |

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | plans/reviews/design-intelligence-di1-s2-final-review-verification.txt:1 | Present but unverified. All 25 promised node:test cases appear verbatim as test titles in the changed test files: contracts, eligibility, git-reader, reader-limits, lineage, notices, assessment, acceptance and isolation. The committed TAP log after the final corrections records 58/58 corpus tests passing under Node 22.23.2. No build record was supplied in this grounding, so I cannot confirm the pass state. These tests exist; this finding does not claim they pass. |
| LOW | plans/reviews/design-intelligence-di1-s2-final-review-verification.txt:330 | The promised smoke test 'strict-build compiles source eligibility and passes the full corpus regression suite' is not a node:test case. Its only evidence is the logged `npm run build` output plus the 58-test corpus TAP run, both recorded as passing. Without a build record, neither can be verified. The promise covers the corpus suite, not the repository suite, so the documented full-repository failures do not breach it. The SQLite overflow, 12 SIGABRT files and the DaemonSection timing failure are recorded separately, and no repository-wide pass is claimed. This is a caveat on the evidence, not a missing test. |
| LOW | src/design/corpus/sources/assessment.ts:1 | Every changed symbol has an empty testsReaching list. The grounding is diff-only (file-level 'diff:' entities) and hollow for newly created files, so these empty lists are not evidence of a not-exercised gap, and no HIGH breach is raised. The changed test files visibly import and call every production entry point. These include assessEligibility, prepareEligibilityCandidate and evaluateSourceImports, plus stageSources, requiredSourcePaths and snapshotBlobs. They also include readPinnedSources, createGitRunner, runGitBinary and gitEnvironment, the lineage functions (validateOutputLineage, lineageBytes, bindLineageToManifest, classifyPackageFiles, validatePackagedLineage), and assembleSourceMetadata, stageLocalSources, the decode* functions, sourceIdentity, isUtcDate, pathCollisionKey and isPortablePath. The tests also cover the later review fixes directly: the stage.ts budget and relative-path branches, aggregate count and byte overflow, compound-license rejection, and the request deadline. |
| LOW | src/design/corpus/sources/lineage.ts:124 | A few defensive branches in the changed code have no direct test. (1) In bindLineageToManifest, the conflict and failure paths are untested: a role, record or output path colliding with sources/lineage.json, and an invalid inventory. The tests exercise only the success path. (2) In createGitRunner (git-reader.ts), the 'Invalid Git process bounds' rejection and the path where the signal is already aborted before spawn are untested. The reader-level timeoutMs:30001 case is rejected earlier by readPinnedSources and never reaches the runner. (3) isCanonicalRepositoryUrl (validation-primitives.ts) is exercised only with a trailing-slash URL. It is never tested against an ssh: URL, embedded credentials, query/fragment or percent-encoded inputs. These are small, fail-closed guards, so the gap is low risk. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/stage.ts:34 | The five-minute deadline only bounds one pinned-source request. stageLocalSources calls readPinnedSources once for each input, one after another, and each call gets a fresh `requestTimeoutMs` deadline, so nothing limits the total time for the whole orchestration. The preflight budget caps the total number of paths, but not the number of inputs. An input with an empty `paths` list still spawns a git process to read the commit, so up to CORPUS_LIMITS.files inputs could run for up to N × 5 minutes. The README's 'five minutes for the complete pinned-source request' is accurate for each request, but a caller of stageLocalSources gets no overall time limit unless they pass their own AbortSignal. Fix: create one deadline (or a derived AbortSignal) in stageLocalSources and pass it to every readPinnedSources call, or reject inputs with empty paths during preflight. |
| LOW | src/design/corpus/sources/eligibility.ts:85 | stageSources rebuilds the same per-request profile map (`policy.profiles.filter(repositoryUrl && revision).map(p => [p.path, p])`) that requiredSourcePaths already builds. It then calls requiredSourcePaths a second time to compute the admitted closure. If the profile-matching rule in one copy changes (for example, normalising the URL), the two copies would disagree on which profile governs an evidence path. Fix: build the map once in a small helper and use it in both places. |

