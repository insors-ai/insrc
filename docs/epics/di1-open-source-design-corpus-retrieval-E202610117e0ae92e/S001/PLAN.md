<!-- insrc:artifact PLAN-7e0ae92e8f3d3c3e-s1 -->

# Plan: E202610117e0ae92e:S001

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**LLD run:** `wf-1791734517458-d81b91`
**LLD effective hash:** `335cb7e3dd53...`

Build the corpus's foundational schemas, deterministic identities and pure validation pipeline. Tests will prove incomplete or stale content cannot pass preflight and that valid records retain their full design rationale and provenance. Ingestion, curation and runtime services remain later stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define sc1/sc2 runtime schemas and types | M | — | unit: contracts.test.ts — closed schema, version, ID/domain/UI enums and original fixture acceptance | [[c1]] [[c2]] |
| 2 | **`t2`** Implement canonical bytes and digest chain | M | `t1` | unit: canonical.test.ts — independent byte/digest vectors and invalid JSON/limit boundaries; unit: digest-chain.test.ts — content/review/release binding and ordering | [[c3]] [[c4]] |
| 3 | **`t3`** Validate guidance completeness and review binding | M | `t1`, `t2` | unit: record-validation.test.ts — completeness, authorship, conditional payloads and platform examples; unit: record-roundtrip.test.ts — all sc1 fields preserved and review-staleness rejection | [[c1]] [[c4]] [[c5]] |
| 4 | **`t4`** Validate release inventory and exact references | M | `t1`, `t2`, `t3` | integration: manifest-validation.test.ts — in-memory exact inventory, portable paths, relations DAG and tamper cases | [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Compose publication preflight and expose the pure module | M | `t3`, `t4` | integration: publication-check.test.ts — downstream assessment composition fails closed and preserves issue diagnostics | [[c2]] [[c4]] [[c5]] |
| 6 | **`t6`** Verify contract coverage and strict build integration | S | `t5` | smoke: module-isolation.test.ts — compiled import and valid/invalid preflight without external I/O; smoke: npm run build — strict NodeNext compilation; integration: acceptance-coverage.test.ts — ac1/ac2 across record-to-manifest pipeline | [[c5]] [[c6]] |

### 1.1 E202610117e0ae92e:S001:T001 — Define sc1/sc2 runtime schemas and types

Add proposed src/design/corpus/contracts.ts with closed TypeBox schemas and Static-derived types matching approved sc1/sc2; pin all ten domain labels, UI types, IDs, digest formats, optional field semantics, draft/publication distinctions and ValidationIssue categories. Add shared independently authored test fixtures under __tests__/fixtures.ts.

**Acceptance checks:**
- All approved sc1/sc2 fields are represented once in runtime/static schemas; no unknown-property stripping, coercion or default injection.
- Known valid foundation/pattern/style-recipe records decode without losing fields; invalid schema versions and structural omissions return stable issues.
- Existing TypeBox/AJV dependencies suffice; no package manifest change.

### 1.2 E202610117e0ae92e:S001:T002 — Implement canonical bytes and digest chain

Add canonical.ts with bounded pure canonical serialization and record/candidate/review/release hashes in the exact approved order. Pin golden fixtures from explicit canonical bytes and independently computed SHA-256 values. Keep raw-file hashes distinct from canonical semantic digests.

**Acceptance checks:**
- Key order and manifest inventory order do not affect identity; meaningful record-array order does.
- recordVersion excludes only recordVersion/review; candidate excludes manifest and coverage envelope; release hashes manifest without releaseId.
- Invalid Unicode, non-JSON values, accessors, cycles, oversized input and non-finite/unsafe numbers are rejected before unbounded traversal or content hashing.

### 1.3 E202610117e0ae92e:S001:T003 — Validate guidance completeness and review binding

Add record validation in validate.ts using schema-first checks followed by domain, provenance, UI-type specimen and review invariants. Preserve authored values and return deterministic JSON Pointer issues; do not evaluate license policy or generate guidance.

**Acceptance checks:**
- Missing provenance, applicability, required examples, domain payloads, measurable-check limits or explicit no-check rationale prevents admission.
- Each declared UI type has example and misuse references; Color/Layout/Visual style conditional payloads are enforced together when applicable.
- Draft/stale/incomplete review cannot pass publication checks; inferred authorship stays inferred.
- All identity, version, relations, rationale and lineage fields survive validated JSON round-trip.

### 1.4 E202610117e0ae92e:S001:T004 — Validate release inventory and exact references

Extend validate.ts with pure in-memory manifest/inventory validation: closed membership, regular files, portable paths, raw-byte digests, unique record identities and exact acyclic relations. Verify the digest sequence and referenced source/notices/coverage files without implementing source or editorial policies.

**Acceptance checks:**
- Reject missing/undeclared/duplicate/case-colliding entries, unsafe paths and nonregular files.
- Manifest record pairs match decoded bytes; relations resolve exactly, with duplicate/self/cyclic references rejected.
- Verify file, record, candidate, review and release digests; no manifest self hash or final releaseId in coverage.
- Format limits return explicit issues instead of silently truncating records or inventory.
- Coverage is inspected only as canonical JSON for digest/candidate binding; no licensing allowlist or editorial coverage algorithm is implemented.

### 1.5 E202610117e0ae92e:S001:T005 — Compose publication preflight and expose the pure module

Add digest-bound eligibility/coverage assessment composition and public barrel index.ts. Require both downstream stages without importing their future implementations. Export foundational schemas/types and pure validation/hash helpers, documenting distinctions between draft validation, preflight eligibility and actual publication.

**Acceptance checks:**
- Missing, duplicate, failed, stale or contradictory assessments yield eligible=false with stable issues; matching successful fixtures yield eligible=true.
- PublicationCheck.manifestDigest is canonical manifest hash when computable, otherwise empty; errors do not fabricate hashes.
- Imports and calls perform no file/DB/network/provider access or catalog writes; no runtime approval claims are made.
- Only sc1/sc2 foundational surfaces are exported; no ingestion, retrieval, settings or publication mutations are added.

### 1.6 E202610117e0ae92e:S001:T006 — Verify contract coverage and strict build integration

Complete the LLD acceptance matrix with cross-module contract tests, run the focused corpus suite and TypeScript build, and smoke-import compiled out/design/corpus/index.js without daemon/DB/provider setup. Record results for independent post-build review; preserve unrelated changes.

**Acceptance checks:**
- ac1 and ac2 each have passing proving tests; expected digest bytes/values are independent of the helper under test.
- Focused unit/contract tests and npm run build pass, or unrelated pre-existing failures are isolated and reported accurately.
- Compiled import has no live-store/provider requirements; no test touches live ~/.insrc data.
- Diff remains within S001 modules/tests and tracked artifacts; no completion is claimed before build validation and independent code review.
- An isolated process exercises valid and invalid preflight with external I/O instrumented or forbidden; asserts no filesystem writes, network/provider calls or live-store creation.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| record-schema: missing/unknown/wrong-type fields and each authorship branch | `t1`, `t3` |
| domain-validation: color roles/pairings, layout adaptation, visual style and platform example/misuse matrix | `t3` |
| review-binding: draft exclusion and stale-content rejection | `t3` |
| issue-format: stable codes/pointers, deterministic order, no raw content | `t3`, `t5` |
| canonical-golden: key reorder, numeric/string edge cases, manifest sort and meaningful array order | `t2` |
| digest-chain: record→candidate→review→release no self reference, changed-content invalidation | `t2`, `t4` |
| invalid-input: accessors, cyclic objects, unicode/numeric/size limits | `t2`, `t4` |
| record-roundtrip: all identity/version/relation/rationale/provenance fields retained | `t3`, `t6` |
| manifest-inventory: exact bytes/path/membership, digest tamper, duplicate/case collision, missing target and relation-cycle rejection | `t4` |
| publication-composition: missing/duplicate/failed/stale assessments always block; valid fixed assessments pass | `t5` |
| npm run build | `t6` |
| Import compiled corpus barrel in a fresh process with no daemon/DB/provider setup | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails GuidanceRecord and dataModelChanges GuidanceRecord/EvidenceRef (LLD.md:41,112,122)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails ReleaseManifest/PublicationCheck and interactionWithShared sc2 (LLD.md:65,87,137)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges Canonical digest format v1 (LLD.md:132)`
- **[[c4]]** `prior-artifact` `LLD s1 errorPaths and dataModelChanges ValidationIssue (LLD.md:127,144)`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy acceptanceMapping and testLevels (LLD.md:190)`
- **[[c6]]** `prior-artifact` `LLD s1 hldContextSlice boundary and adjacentBoundaries; testStrategy smoke integration (LLD.md:24,190)`
