<!-- insrc:artifact CR-7e0ae92e8f3d3c3e-s2 -->

# Code review: 7e0ae92e8f3d3c3e:s2

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 8 · model `claude:opus`

**Changed files:** 34

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/lineage.ts:74 | When a record's own output has a derived source binding, validateOutputLineage accepts provenance.authorship 'inferred'. It then skips the author/rationale declaration check that it applies to every other inferred output. As a result, an inferred record can pass without the explicit author and rationale declaration that the plan requires for inferred content. Its author and rationale are never compared with any reviewed declaration. |
| LOW | src/design/corpus/sources/policy.ts:11 | profileDecision treats font categories like any other category. It only checks that the profile repeats the category's conditions, and the schema allows a category's conditions array to be empty. A category for open-font licences that records no reserved-name or other conditions therefore admits font files. Nothing requires those conditions to be recorded before admission, so a font category with no recorded conditions works as the generic font allowance that the LLD forbids. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/assessment.ts:75 | The record-to-path mapping uses a non-null assertion: `manifest.records.find(entry => entry.recordId === record.recordId)!.path`. It never handles the undefined case. If the lookup misses, the TypeError is caught by the function's catch-all and reported as a generic 'Expected bounded candidate and reviewed source inputs.' error, not as a precise inventory or reference issue. Elsewhere this module handles a missing lookup with an explicit `problem(...)` result, so the clean way is to check for the miss and report a specific issue. The same pattern appears at assessment.ts:70 (`files.get(LINEAGE_PATH)!`), but there an earlier check guarantees the file exists. This is not a breach of noUncheckedIndexedAccess, because `.find()`/`Map.get` are not index access. It departs from the rule's intent of handling undefined explicitly. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | plans/reviews/design-intelligence-di1-s2-final-verification.txt:1 | Present but unverified: there is no build record, so pass-state cannot be confirmed from the grounding. All 25 promised node:test cases exist verbatim in the changed test files (contracts, eligibility, git-reader, reader-limits, lineage, notices, assessment, acceptance, isolation). The committed TAP log records 58/58 passing under Node 22. I tried to re-run the suite and could not (command not approved), so I am not asserting a pass. |
| MED | plans/reviews/design-intelligence-di1-s2-final-verification.txt:330 | Promised smoke test 'strict-build compiles source eligibility and passes the full corpus regression suite' is not a node:test case. Its only evidence is a build log plus test totals. The strict build and the 58-test corpus suite are recorded as passing. The wording also covers a full regression pass, and the recorded full Node 22 sweep has 14 failures: the SQLite overflow, 12 SIGABRT files and a DaemonSection timing failure. These are documented as unrelated, but this promise stands only as far as the corpus suite goes. |
| LOW | src/design/corpus/sources/assessment.ts:17 | Every testsReaching edge is empty, but the grounding is diff-only and hollow for newly created files, so empty edges are not evidence of a gap. The changed test files import and call every production export: stageLocalSources, readPinnedSources, createGitRunner, stageSources, requiredSourcePaths, validateOutputLineage, bindLineageToManifest, classifyPackageFiles, validatePackagedLineage, assembleSourceMetadata, assessEligibility, prepareEligibilityCandidate and the decode* functions. The only branches without a direct test are evaluateSourceImports' import-count and combined-byte limit failures. No not-exercised breach is raised. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/design/corpus/sources/git-reader.ts:61 | The runner's promise only settles inside the child 'close' handler. The 'error' handler just records `failed` and does not reject or clear the timer. Node can emit 'error' without ever emitting 'exit' or 'close', for example on EMFILE/ENFILE spawn failures, where it returns early. When the timeout fires it only calls stop(), which tries to kill a process that does not exist; it never rejects. In that case readPinnedSources never resolves and the abort listener is never removed, so the 30 s per-child bound does not hold. Fix: on 'error' (and in the timeout path) settle once by clearing the timer, removing the listener and rejecting, instead of depending on 'close'. |
| MED | src/design/corpus/sources/assessment.ts:92 | prepareEligibilityCandidate calls evaluateSourceImports outside any try/catch. evaluateSourceImports reads `review.imports`, `input.blobs` and `input.request` directly from caller objects that were never snapshotted. A null or undefined `review`, a throwing getter, or a Proxy on `review` or an import entry will throw out of a function whose contract is to return a ValidationResult. assessEligibility catches the same throw in its try block, so the two public entry points handle hostile review inputs differently. Fix: snapshot the review fields first, or wrap the evaluation and return failure(...). |
| MED | src/design/corpus/sources/git-reader.ts:135 | Every commit, tree and blob read spawns a new `git cat-file --batch` child, one object per process. Only the per-child timeout (30 s) and the byte and path counts are bounded. With up to 10,000 selected paths of nested depth, one request can spawn tens of thousands of processes, and nothing caps total wall time. The 'bounded acquisition lifecycle' guarantee therefore covers single children, not the request. Fix: keep one long-lived --batch process per request and stream object IDs to it, or add a request-level deadline or AbortSignal. |
| LOW | src/design/corpus/sources/eligibility.ts:113 | The evidence-closure walk (a queue over licenseEvidence and noticeEvidence with an `included` set) is re-implemented at the end of stageSources. requiredSourcePaths in the same file already computes the same transitive closure. The two copies can drift, for example if a new evidence kind is added to one only. Fix: extract one closure helper and call it from both places. |
| LOW | src/design/corpus/sources/stage.ts:27 | stageLocalSources re-implements the combined source/evidence count and byte accumulation with limit checks. evaluateSourceImports in assessment.ts already does the same, against slightly different limit sources (options.limits vs CORPUS_LIMITS). Two copies of the aggregate-budget rule risk drifting apart. |
| LOW | src/design/corpus/sources/validation-primitives.ts:10 | pathCollisionKey and isUtcDate copy S001's private path-collision and UTC-timestamp rules instead of sharing them, so there are two sources of truth. Parity tests reduce the risk, but they only cover the listed sample inputs. |
| LOW | src/design/corpus/sources/eligibility.ts:34 | requiredSourcePaths checks `paths.size > CORPUS_LIMITS.files` only at the top of each loop iteration. Paths added while processing the last queue item are never checked, so the returned closure can exceed the file limit. Downstream checks in stage.ts and readPinnedSources currently catch this, but the function does not enforce its own documented limit. |

