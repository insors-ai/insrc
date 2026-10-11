<!-- insrc:artifact LLD-7e0ae92e8f3d3c3e-s1 -->

# LLD: E202610117e0ae92e:S001

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**HLD base run:** `wf-1791738717329-ylatwv`
**HLD effective hash:** `a20e4da9408d...`

Define complete, attributable corpus records and pure release preflight. This revision closes stale-assessment reuse by binding candidate identity to all manifest metadata except the three cyclic digest positions. It preserves sc1/sc2 interfaces and leaves source policy, curation, retrieval and catalog writes to later stories.

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

> See **HLD-7e0ae92e8f3d3c3e** § 2. Framework summary

**Rollout phase:** A — Record and release contracts
**Owns:** `sc1` (Corpus record and pinned evidence identity), `sc2` (Release manifest and publication gate)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own source adapters, local staging extraction, allowlist policy implementation and reproducible notices. Adapter specifics stay private; no unreviewed source contents enter published assets. — owns `sc3`
- `s3`: Own authored seed records, declarative specimens and reviewed coverage across ten domains and three UI types. A release names its maintainer/reviewer; unknown source sufficiency cannot be counted as coverage. — owns `sc4`
- `s4`: Own daemon package reader, catalog read adapter, deterministic filtering/ranking, local embedding cache, cursor implementation and thin MCP read tools. Keep ranking weights and cache format private and versioned. Basic validated bundled-package installation is included so retrieval is independently testable. Includes the single-sourced config-catalog entry, typed config exposure, settings/reconciliation verification and catalog contract-test update. Owns vscode-plugin/package.json setting mirror and verification of the unchanged catalog-driven JetBrains SettingsView.kt, validated by manifest/catalog parity and settings render/round-trip checks. Sole owner of catalog file layout, serialized atomic commit, receipts and recovery via sc7. Basic installation and maintenance use exactly this writer. — owns `sc5`, `sc7`
- `s5`: Own update staging, atomic publish/default switch, withdrawal overlays, recovery, release diffs and cross-release regression evaluation. Consume existing reader contracts; never change DI2 guideline state. Uses sc7 for all catalog/default/availability changes; owns upstream update policy and diff orchestration only, not a second writer or recovery implementation. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `GuidanceRecord`

```typescript
type UiType = 'web' | 'mobile-ios' | 'mobile-android';
type GuidanceKind = 'foundation' | 'pattern' | 'style-recipe';
interface EvidenceRef { releaseId: string; recordId: string; recordVersion: string; }
interface Provenance { authorship: 'original' | 'derived' | 'imported' | 'inferred'; author: string; sourceRefs: string[]; modificationNotes: string[]; }
interface Applicability { uiTypes: UiType[]; suitableConditions: string[]; contraindications: string[]; units: string[]; }
interface GuidanceRecord { schemaVersion: 1; recordId: string; recordVersion: string; title: string; domains: string[]; kind: GuidanceKind; guidanceClass: 'requirement' | 'convention' | 'heuristic' | 'preference'; explanation: string; rationale: string; problem: string; tradeoffs: string[]; checks: { check: string; requiredInputs: string[]; exceptions: string[]; limits: string[] }[]; noMeasurableChecksRationale?: string | undefined; domainPayload: { color?: { roles: { name: string; value: string }[]; pairings: { foregroundRole: string; backgroundRole: string; usage: string }[] } | undefined; layout?: { contentPriority: string[]; adaptationRules: { condition: string; rule: string }[] } | undefined; style?: { composition: string; typography: string; color: string; interaction: string } | undefined; }; applicability: Applicability; examples: { kind: 'example' | 'misuse'; contentRef: string; uiType: UiType }[]; relations: { kind: 'compatible' | 'conflicting' | 'prerequisite' | 'alternative'; recordId: string; recordVersion: string }[]; provenance: Provenance; review: { status: 'draft' | 'reviewed'; reviewer: string; contentDigest: string; reviewedAt: string }; }
```

**Returns:** `GuidanceRecord` — Complete decoded JSON record; validation preserves every declared field and never coerces, defaults or strips input.

**Errors:**
- `ValidationIssue[]` when Wrong schema, missing field, unexpected property, invalid domain data, incomplete provenance, digest mismatch or stale review.

**Preconditions:**
- Accept unknown decoded JSON at validation boundaries; types alone never establish validity.
- Draft records retain the full HLD shape, with empty review reviewer/time/digest allowed only while status is draft.

**Postconditions:**
- A record admitted for publication has nonblank required guidance, complete sc1 provenance and an exact content-bound reviewed status.
- Record serialization/decoding preserves identity, version, relations, rationale, authorship and source references; it does not perform retrieval.

### 2.2 `ReleaseManifest`

```typescript
interface ReleaseManifest { schemaVersion: 1; releaseId: string; label: string; createdAt: string; maintainer: string; records: { recordId: string; recordVersion: string; path: string; digest: string }[]; files: { path: string; digest: string; mediaType: string }[]; sourceManifestPath: string; noticesPath: string; coveragePath: string; reviewDigest: string; }
interface ValidationIssue { code: string; path: string; message: string; }
interface PublicationCheck { eligible: boolean; issues: ValidationIssue[]; manifestDigest: string; }
interface ReleaseAvailability { releaseId: string; state: 'published' | 'deprecated' | 'withdrawn'; reason?: string | undefined; catalogGeneration: number; }
```

**Returns:** `ReleaseManifest` — Validated manifest referencing a closed, unique package inventory; not an installed or published release.

**Errors:**
- `ValidationIssue[]` when Duplicate identity/path, missing referenced file, invalid relative path, unresolved exact record relationship, unknown schema or mismatched digest.

**Preconditions:**
- Caller supplies immutable in-memory file inventory including bytes and file kind; no filesystem, network or DB access in this story.
- The manifest is excluded from its own files list; every referenced data file appears exactly once.

**Postconditions:**
- All manifest record pairs and referenced package files are present; digest calculation follows the approved dependency order.
- Validating a manifest does not mutate catalog state, import sources or claim editorial approval.

### 2.3 `PublicationCheck`

```typescript
interface PublicationCheck { eligible: boolean; issues: ValidationIssue[]; manifestDigest: string; }
```

**Parameters:**
- `candidate: unknown` — Decoded sc1/sc2 content and bounded immutable package inventory to validate.
- `assessments: readonly { stage: 'eligibility' | 'coverage'; candidateContentDigest: string; passed: boolean; issues: ValidationIssue[] }[]` — Digest-bound validation results supplied by downstream adapters. s1 only composes them; it does not implement sc3/sc4 policy.

**Returns:** `PublicationCheck` — Pure preflight decision; manifestDigest is SHA-256 of canonical manifest excluding releaseId when computable, otherwise empty. eligible implies zero issues and successful exact-digest assessments.

**Errors:**
- `ValidationIssue[]` when All expected validation failures are returned with stable code, JSON Pointer path and message; no thrown domain error.

**Preconditions:**
- Exactly one assessment per required stage. Missing, duplicate, stale, failed, or contradictory assessment fails closed.
- Assessment objects are trusted internal composition results, not user-issued authorization tokens; only downstream daemon orchestration produces them.

**Postconditions:**
- eligible is true only when record/domain/manifest/hash checks and both supplied stages pass.
- No admission, persistent publication or side effects occur; schema compilation faults are programmer/configuration failures, not user validation failures.
- Candidate identity covers every non-cyclic manifest field, so role or attribution metadata changes invalidate downstream assessments.
- Missing or duplicate coverage membership yields empty internal candidate identity and assessment.stale for every supplied assessment, while independently computable manifestDigest remains available.

## 3. Data model changes

### 3.1 `GuidanceRecord` — new

Implement the exact approved sc1 type in proposed src/design/corpus/contracts.ts with TypeBox schemas and Static-derived readonly-facing types. Use closed objects at every level. UiType is web/mobile-ios/mobile-android; GuidanceKind is foundation/pattern/style-recipe. domains is a nonempty unique subset of the following exact strings, sourced from PRD:85-94 [[c9]]: "Visual style", "Layout", "Color", "Typography", "Navigation and flows", "Components and states", "Motion and feedback", "Inclusive design", "Platform adaptation", "Content and trust". Color requires domainPayload.color, Layout requires domainPayload.layout, and Visual style requires domainPayload.style; multiple matching labels require all corresponding payloads. Other domain labels impose the common sc1 fields without inventing additional payload fields. IDs use namespace:slug (lowercase ASCII letters/digits with internal ._- separators), max 128 bytes; recordVersion/releaseId/digests are lowercase SHA-256 hex-64. Require nonblank problem, title, explanation, rationale, nonempty tradeoffs/suitableConditions, unique uiTypes; empty contraindications, units, relations and modificationNotes are allowed and meaningful. Original authorship needs author and may have no external sourceRefs; imported/derived/inferred entries require sourceRefs except independently inferred originals explicitly described in rationale and author attribution. Publication requires at least one example and one misuse for each declared UI type, each contentRef within inventory. Color domain requires nonempty unique semantic roles and pairings to declared roles; Layout requires content priority/adaptation rules; Visual style requires all style subfields. Checks require nonblank check and limits; requiredInputs/exceptions may be empty. Zero checks requires nonblank noMeasurableChecksRationale. Review is required even in drafts; publication rejects draft, empty reviewer/time/digest, invalid UTC ISO date, or contentDigest unequal to recordVersion. Authorship is never relabeled as imported/source-authored by review.


### 3.2 `ReleaseManifest` — new

Implement sc2 in the same contracts module. schemaVersion is literal 1; no migrations or permissive unknown fields. Require at least one record and file, unique recordId and path, exact byte digest for each declared file and all referenced entries. Every record path appears in files and its bytes decode to the declared recordId/version. Exactly one sourceManifestPath, noticesPath and coveragePath reference listed files. Keep source and coverage file content opaque to s1 except for hashing; downstream stage assessments validate their semantics. Paths are package-relative POSIX names, case-sensitive but reject case-fold collisions for portability; reject empty, absolute, drive/UNC, backslash, NUL/control, dot and dot-dot segments, percent escapes and symlinks/non-regular inventory entries. Reject undeclared files. Relationship targets resolve to exact record pairs in this package, with no fallback; duplicate/self references and cycles among current record versions are invalid. Symmetric conceptual relations use one directed edge or an explicitly older included version only where unique record IDs permit it; no mutually self-referential current-version hashes. This v1 release therefore uses one directed edge for symmetric relations. Runtime availability overlays remain sc7/S004. Specimens must not reference the source/notices/coverage metadata or any record file. Validators operate on detached canonical JSON snapshots and copied native file bytes; later caller mutation must not alter a validated result. Package collision comparisons use Unicode NFC plus case folding without changing authored path bytes.


### 3.3 `EvidenceRef` — new

Implement exact sc1 shape, validating all three identifiers. It is an immutable value; no default release lookup, filesystem resolution or project identity is introduced. Pure JSON round-trip fixtures exercise ac2; actual daemon retrieval/lineage hydration remains S004. Return original sourceRefs, never replace them with source excerpts.


### 3.4 `ValidationIssue` — new

Implement exact sc2 code/path/message shape. Schema and semantic phases return deterministic issues sorted by JSON Pointer path then code and message. Stable categories: schema.unsupported, schema.invalid, guidance.incomplete, provenance.incomplete, domain.invalid, review.required, review.stale, reference.missing, reference.cycle, path.invalid, inventory.invalid, digest.mismatch, assessment.missing, assessment.failed, assessment.stale, limit.exceeded. Diagnostics carry no raw content or local absolute paths. Schema-first failures prevent unsafe deep traversal; valid siblings can still yield independent issues. Candidate size limits are explicit rejections, never truncation: record JSON <=1 MiB, package <=64 MiB, <=10,000 files, nesting depth <=64; these are format safety limits for v1, not search result limits. Release issue pointers distinguish /manifest from /files; errors in decoded JSON point to containing bytes and name the decoded pointer in their message. Missing/duplicate assessment diagnostics name the expected stage.


### 3.5 `Canonical digest format v1` — new

Proposed src/design/corpus/canonical.ts defines pure canonical serialization and hashes. Accept only finite JSON values, plain data objects/arrays, valid Unicode scalar strings and safe finite numeric values; reject undefined/functions/symbols/BigInt/NaN/Infinity, accessors and non-plain objects at object entry points. Object keys sorted by JS UTF-16 code-unit lexicographic order; arrays preserve order except manifest records/files are explicitly sorted by ID/path for manifest digest. Serialize UTF-8 with no BOM/newline, JSON string escaping and JSON number representation, normalize -0 to 0, preserve other string contents without Unicode normalization. These rules are an insrc format, not a claim of RFC conformance. RecordVersion hashes canonical record excluding only top-level recordVersion and review; order changes in meaningful arrays therefore create a new version. review.contentDigest equals recordVersion. Candidate content digest hashes a canonical snapshot of the COMPLETE validated manifest, omitting ONLY top-level releaseId, top-level reviewDigest, and the digest property of the unique files entry at coveragePath. Preserve that coverage entry's path and mediaType. Preserve schemaVersion, label, createdAt, maintainer, sourceManifestPath, noticesPath, coveragePath, complete record entries and every other complete file entry. Sort records by recordId/version and files by path before serialization. Thus any role reassignment, attribution, timestamp, record-entry metadata or media-type change invalidates previous assessments, while coverage bytes and the two cyclic top-level digest values cannot self-reference. This replaces the original projected-pairs formula; unpublished development golden vectors must be recomputed independently. [[c10]] Coverage lives at coveragePath and is the sole v1 editorial envelope; reviewDigest hashes its canonical decoded JSON, including its supplied candidateContentDigest. All other listed files, including source manifest, notices and specimens, are included in candidate digest. Final releaseId/PublicationCheck.manifestDigest hash the canonical manifest with releaseId omitted, records/files sorted and reviewDigest included; manifest itself is not listed. No final releaseId may appear in coverage payload. Raw file hashes always cover exact file bytes, distinct from semantic canonical hashes. Test vectors pin every stage; content change invalidates review. No existing workflow epic hash helper is reused because its truncated run-ID semantics differ. Candidate identity is not computable unless exactly one files entry matches coveragePath: candidateContentDigest returns the empty string for zero or multiple matches; both validateRelease and checkPublication remain ineligible and all supplied assessments are stale. Never choose an arbitrary match or omit every matching digest. Compute manifestDigest independently when structurally possible, else retain its existing empty fallback. A staged manifest must already contain the coverage path/mediaType entry before hashing; its placeholder digest is ignored until coverage bytes exist. [[c2]]


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Own exact runtime/static record, evidence and provenance shapes plus pure content identity/round-trip invariants. New implementation paths are src/design/corpus/contracts.ts, canonical.ts and validate.ts; no existing API is modified. |
| `sc2` | implements | Own manifest/issue/preflight envelopes and pure structural/domain/digest validation. Define a dependency-inverted assessment input for downstream eligibility and coverage validators; do not import or implement sc3/sc4. Missing assessments always block. Public barrel src/design/corpus/index.ts exports only these foundational schemas/types and validation/hash helpers; exact helper names are local implementation choices under the owned contracts, not existing code claims. |

## 5. Error paths

**Error cases**

- **Required field missing, invalid schema version or unknown property** (recoverable)
  - Detection: Runtime closed schema validates unknown input before semantic traversal; literal schemaVersion check distinguishes unsupported version.
  - Response: Return schema.invalid or schema.unsupported with JSON Pointer; eligible false.
  - User impact: Curator sees exact field to correct; no publication.
- **Unreviewed content or content changed since review** (recoverable)
  - Detection: Compare reviewed status, reviewer/time and review.contentDigest against freshly computed recordVersion.
  - Response: review.required or review.stale; no trusted record projection.
  - User impact: Needs editorial review of the corrected content.
- **Invalid domain payload, platform examples or source attribution** (recoverable)
  - Detection: Conditional domain validators, declared-platform example/misuse matrix and authorship-specific provenance checks detect omissions.
  - Response: domain.invalid, guidance.incomplete or provenance.incomplete; keep authorship unchanged.
  - User impact: Incomplete guidance cannot be admitted.
- **Tampered, ambiguous or incomplete package inventory** (recoverable)
  - Detection: Recompute raw byte hashes; compare manifest membership; validate unique IDs/paths, path grammar, references and relation DAG before final digest checks.
  - Response: inventory.invalid, path.invalid, reference.missing/reference.cycle or digest.mismatch.
  - User impact: Candidate must be rebuilt; no repair or silent normalization.
- **Missing/failed/stale downstream review assessment** (recoverable)
  - Detection: Require exactly one eligibility and one coverage result, each bound to current candidateContentDigest; reject passed=true with nonempty issues.
  - Response: assessment.missing/failed/stale; eligible false.
  - User impact: No placeholder source/coverage approval is accepted.
- **Input exceeds safety bounds or is not canonical JSON data** (recoverable)
  - Detection: Bounded pre-walk checks byte lengths, file count, nesting, numeric/string validity, object descriptors and cycles before hashing.
  - Response: limit.exceeded or schema.invalid without hashing/truncating offending content.
  - User impact: Split oversized data or correct serialization; cannot silently lose guidance.
- **Role or attribution metadata changes after downstream assessment** (recoverable)
  - Detection: Recompute candidate digest over all manifest fields except releaseId/reviewDigest and coverage-file digest. Compare every supplied assessment against this identity, even when package bytes are unchanged.
  - Response: review.stale and/or assessment.stale; eligible false until the envelope and both assessments are regenerated.
  - User impact: Changing source/notices roles, maintainer or other metadata cannot silently reuse old eligibility/coverage results.
- **Zero or multiple manifest files entries match coveragePath** (recoverable)
  - Detection: Count exact matching entries before candidate hashing in both release validation and preflight fallback.
  - Response: Return empty internal candidate identity. Preserve reference.missing at /manifest/coveragePath for zero matches and inventory.invalid at the duplicate /manifest/files entry for multiple matches. Preflight is ineligible and every supplied assessment receives assessment.stale. Compute manifestDigest independently when structurally possible.
  - User impact: Correct the inventory and regenerate candidate-bound reviews; no arbitrary hash is accepted.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An original record with no upstream source | Author, rationale, version and review remain required; empty sourceRefs is valid and no upstream provenance is fabricated. |
| No measurable checks apply | Accept only with explicit noMeasurableChecksRationale; never imply automated accessibility certification. |
| One record applies to all three UI types | Requires example and misuse for each; shared example bytes can be referenced more than once without duplicating inventory files. |
| Object key order or manifest inventory order differs | Canonical identity remains stable; ordinary guidance-array order remains meaningful. |
| Valid draft with empty review details | Draft schema accepts the complete shape; publication preflight rejects it until reviewed. |
| No relations or contraindications | Empty arrays are explicit valid declarations, not absent metadata. |
| Only coverage-file bytes, reviewDigest or releaseId are filled in later in the digest chain | Candidate digest remains unchanged; coverage review digest and final release hash still bind the exact resulting envelope and manifest. |

**Invariants to preserve**

- No schema coercion, default injection or stripping; preserve every validated lineage field. [[c1]]
- Pure validation/hash routines never access DB, filesystem, network, LLMs or daemon runtime state. [[c2]]
- Follow the newly approved HLD digest order and complete-manifest candidate content rule, including noncomputable coverage membership; no sc3/sc4/sc5/sc6/sc7 implementation in s1. [[c2]]
- Do not reintroduce the projected-pairs candidate formula; preserve all non-cyclic manifest fields without changing sc1/sc2 public shapes. [[c10]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict; TypeScript executed with tsx. Preserve the approved S001 test convention; current graph test.locate was empty, while direct reads of the text-located corpus tests show these imports.`

**Test levels**

- **unit** — Prove runtime completeness and domain semantics without providers or I/O.
  - Subjects: `record-schema: missing/unknown/wrong-type fields and each authorship branch`, `domain-validation: color roles/pairings, layout adaptation, visual style and platform example/misuse matrix`, `review-binding: draft exclusion and stale-content rejection`, `issue-format: stable codes/pointers, deterministic order, no raw content`
  - Fixtures: `Independently authored valid foundation, pattern and style-recipe records`, `Mutations removing each mandatory field and domain condition`
- **unit** — Pin the canonical identity format with independent expected bytes/digests.
  - Subjects: `canonical-golden: key reorder, numeric/string edge cases, manifest sort and meaningful array order`, `digest-chain: record→candidate→review→release no self reference, changed-content invalidation`, `invalid-input: accessors, cyclic objects, unicode/numeric/size limits`, `candidate-metadata-binding: role paths, attribution, timestamp, schema and all record/file metadata affect candidate identity; only three cyclic digest positions are excluded`
  - Fixtures: `Hand-specified expected canonical byte strings and known SHA-256 outputs, not derived via the helper under test`, `Small complete in-memory package inventory with no real third-party assets`, `Staged manifest includes coverage path/mediaType and a placeholder digest before candidate hashing. Independently regenerate candidate/review/release goldens; preserve record golden.`
- **contract** — Verify sc1/sc2 exact shapes and ac2 complete inspectability.
  - Subjects: `record-roundtrip: all identity/version/relation/rationale/provenance fields retained`, `manifest-inventory: exact bytes/path/membership, digest tamper, duplicate/case collision, missing target and relation-cycle rejection`, `publication-composition: missing/duplicate/failed/stale assessments always block; valid fixed assessments pass`, `stale-role-assessment: swap sourceManifestPath/noticesPath with unchanged bytes, reseal only releaseId, and prove preflight rejects the old envelope and assessments`, `noncomputable-candidate: zero and duplicate coverage entries produce empty candidate identity, ineligible preflight and assessment.stale for every supplied assessment; independently recomputed manifestDigest remains available`
  - Fixtures: `Validated record relation DAG and complete package`, `Stub downstream assessment results that exercise composition without implementing licensing/coverage engines`
- **smoke** — Verify foundational module compiles under repository strict NodeNext and imports without live stores.
  - Subjects: `npm run build`, `Import compiled corpus barrel in a fresh process with no daemon/DB/provider setup`
  - Fixtures: `No runtime assets or live services required`, `Compile current corpus source into a fresh private temporary output tree before isolated import; never trust stale shared out/`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `record-schema`, `domain-validation`, `review-binding`, `manifest-inventory`, `publication-composition`, `candidate-metadata-binding`, `stale-role-assessment`, `noncomputable-candidate` |
| `ac2` | `record-roundtrip`, `canonical-golden`, `digest-chain`, `candidate-metadata-binding` |

## 7. Alternatives considered

### 7.1 a1: Complete manifest snapshot with exact omissions — **CHOSEN**

Bind every non-cyclic field through canonical snapshot omission.

Snapshot the validated complete manifest, omit releaseId/reviewDigest and only the unique coverage entry digest, sort records/files and hash. Return empty candidate identity for zero/multiple coverage entries.

### 7.2 a2: Explicit complete-field projection

Enumerate each current manifest field in an equivalent hash input.

Build a fresh object listing every admitted v1 manifest property except the approved cyclic slots; require unique coverage membership and sort identical arrays. Produce the same canonical bytes as the complete-snapshot option.

**Rejected because:** Equivalent today but field-by-field projection duplicates schema and risks future omissions.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c2]]** `prior-artifact` `.insrc/artifacts/HLD-7e0ae92e8f3d3c3e.json`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/DEF-7e0ae92e8f3d3c3e.json`
- **[[c4]]** `doc` `docs/plans/design-intelligence-prd.md:100`
- **[[c5]]** `code` `src/agent/providers/structured-output.ts:28`
- **[[c6]]** `code` `src/analyze/context/__tests__/schema.test.ts:20`
- **[[c7]]** `code` `package.json:37`
- **[[c8]]** `convention` `AGENTS.md:135`
- **[[c9]]** `doc` `docs/plans/design-intelligence-prd.md:85` — "Visual style; Layout; Color; Typography; Navigation and flows; Components and states; Motion and feedback; Inclusive design; Platform adaptation; Content and trust"
- **[[c10]]** `doc` `plans/design-intelligence-di1-s1-digest-amendment.md`
- **[[c11]]** `prior-artifact` `plans/reviews/design-intelligence-di1-s1-original-approved-lld.json`
