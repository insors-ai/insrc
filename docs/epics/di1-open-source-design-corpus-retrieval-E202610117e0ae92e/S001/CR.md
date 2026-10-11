<!-- insrc:artifact CR-7e0ae92e8f3d3c3e-s1 -->

# Code review: 7e0ae92e8f3d3c3e:s1

⚠️ **WARN** — HIGH 0 · MED 4 · LOW 8 · model `claude:opus`

**Changed files:** 16

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/validate.ts:16 | isPortablePath rejects only C0 control characters and DEL (/[\x00-\x1f\x7f]/). It still accepts the C1 control range U+0080–U+009F, which Unicode also classifies as control characters (Cc). A file or contentRef path containing, for example, U+0085 (NEL) passes the portable-path check and is admitted into the package inventory. |

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/design/corpus/__tests__/acceptance-coverage.test.ts:1 | No build record, and I couldn't run the suite myself (permission denied), so all ten promised tests are present but failing/unverified. The nine promised test files are all in the changed set: contracts, canonical, digest-chain, record-validation, record-roundtrip, manifest-validation, publication-check, module-isolation and acceptance-coverage. The 'npm run build' smoke step is a command, not a file, so nothing in the grounding shows it ran. None of these tests is missing. Their pass-state still has to be confirmed by running `node --import tsx --test 'src/design/corpus/__tests__/*.test.ts'` under Node 22, plus `npm run build`. |
| MED | src/design/corpus/validate.ts:1 | Every changed symbol has an empty testsReaching list, including canonical.ts, contracts.ts, validate.ts and index.ts. The diff contradicts this: the changed test files import and call every public export by name. That covers canonicalJson, hashBytes, hashCanonical, the four *ContentDigest functions, every decode* function, sortIssues, isPortablePath, validateGuidanceRecord, validateRelease and checkPublication, the last through both index.js and the compiled module in module-isolation. The empty edges look like a code-graph indexing gap for files that were just created, not real coverage gaps, so I have not raised a HIGH breach for any of them. The edges should be rebuilt by re-indexing before this result is trusted. |
| LOW | src/design/corpus/canonical.ts:23 | canonicalJson rejects an invalid maxBytes argument (non-integer, below 1, or above CORPUS_LIMITS.packageBytes) by throwing 'Invalid canonical byte limit.'. No test passes an out-of-range maxBytes. canonical.test.ts only tests small valid limits (3 and 2) and the default limit being exceeded. |
| LOW | src/design/corpus/validate.ts:69 | Two draft-mode paths in validateGuidanceRecord are untested. (1) In draft mode, if a caller supplies contentPaths, example contentRefs must appear in that inventory; every test that passes contentPaths uses publication mode. (2) A record whose review.status is 'reviewed' is still checked for review completeness in draft mode; the only draft-mode test uses an empty draft review. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/design/corpus/canonical.ts:95 | candidateContentDigest binds only the record (recordId, recordVersion) pairs and the non-coverage (path, digest) pairs. It leaves out sourceManifestPath, noticesPath, coveragePath, maintainer, label and createdAt. Eligibility and coverage assessments are bound to this digest, so the role metadata can change without making them stale. Example: swap the values of sourceManifestPath and noticesPath, or change the maintainer, then recompute releaseId. The file bytes and the coverage envelope do not change, so the candidate digest and reviewDigest are unchanged. checkPublication still treats the earlier eligibility assessment as current and returns eligible:true, even though the release now names NOTICE.txt as its source manifest. Add the role paths (and the attribution fields eligibility depends on) to the candidate digest, or document why they are deliberately not covered by the assessment. |
| MED | src/design/corpus/validate.ts:28 | validateGuidanceRecord, validateRelease (validate.ts:123) and checkPublication validate the caller's live object rather than a snapshot. They also return that same object as the validated value (ValidatedRelease.manifest and the record result are the caller's reference; Readonly applies only at compile time). Each step reads the input again: the canonicalJson descriptor check, AJV's property reads, and the digest calls that canonicalise once more. A Proxy passes the plain-prototype check (getPrototypeOf is trapped), so it can give one view to the descriptor check and another to AJV and the hashers. This defeats the 'never invokes accessors' guarantee the accessor tests claim to cover. A caller can also mutate the object after validation and keep an ok result. Fix: validate and return JSON.parse(canonicalJson(input)) and copy the file bytes. |
| LOW | src/design/corpus/validate.ts:320 | The assessment.missing issue does not say which stage is missing. Its path is always '/assessments' and its message is generic. When both stages are absent (assessments = []), the result contains two identical issues and the caller cannot tell which adapter result was missing or duplicated. Put the stage name in the message. |
| LOW | src/design/corpus/validate.ts:140 | The dense-array check in validateRelease repeats canonicalJson's array check almost verbatim: ownKeys length === length + 1 and the same /^(0\|[1-9]\d*)$/ index-key regex. dataProperties also re-implements the plain-prototype and enumerable-data-descriptor checks from canonicalJson. Moving these into one shared helper would keep the two accessor-safety boundaries from drifting apart. |
| LOW | src/design/corpus/validate.ts:301 | When validateRelease fails, checkPublication repeats the start of validateRelease to recover a manifest identity: it reads the dataProperties descriptor, runs canonicalJson on the manifest, runs decodeReleaseManifest, then computes both digests. If validateRelease returned the decoded manifest digests alongside its issues, this second, divergence-prone pass would not be needed. |
| LOW | src/design/corpus/canonical.ts:10 | Object keys are sorted by UTF-16 code unit, and numbers are emitted with JS formatting. The acceptance test says its digest vectors were 'independently recomputed with Python json.dumps(sort_keys=True)', but Python orders keys by code point and writes exponents differently (1e-07 versus 1e-7). The two only agree on the ASCII, integer-only fixture. A non-JS verifier would produce different digests for keys that mix astral characters with characters from U+E000 to U+FFFF, or for small floats. Either state the ordering rule in the canonical JSON v1 spec or sort by code point. |
| LOW | src/design/corpus/validate.ts:120 | validateRelease is a single routine of about 100 lines. It covers descriptor admission, manifest decoding, file inventory and case-collision folding, manifest/file reconciliation, the reserved-path checks, and per-record decode and validation. Relationship and coverage checking are already split out. Moving inventory admission and record decoding into their own helpers would make the diagnostic-pointer logic easier to check. |

