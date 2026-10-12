<!-- insrc:artifact LLD-7e0ae92e8f3d3c3e-s2 -->

# LLD: E202610117e0ae92e:S002

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**HLD base run:** `wf-1791738717329-ylatwv`
**HLD effective hash:** `a20e4da9408d...`

Admit reviewed material from exact local source revisions and preserve its attribution through release packaging. S002 adds file-level eligibility, traceable source-to-output bindings and reproducible notices, with a separate bounded Git reader. It consumes S001 identities and leaves editorial coverage and publication to later stories.

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

**Rollout phase:** B — Eligible source ingestion
**Owns:** `sc3` (File-level source eligibility and attribution)
**Consumes:** `sc1` (Corpus record and pinned evidence identity), `sc2` (Release manifest and publication gate)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own canonical schema, version/hash specification, publication validation interfaces and fixtures. This is the nearest ancestor for all shared identity/release contracts; storage and curator UI are not implied. — owns `sc1`, `sc2`
- `s3`: Own authored seed records, declarative specimens and reviewed coverage across ten domains and three UI types. A release names its maintainer/reviewer; unknown source sufficiency cannot be counted as coverage. — owns `sc4`
- `s4`: Own daemon package reader, catalog read adapter, deterministic filtering/ranking, local embedding cache, cursor implementation and thin MCP read tools. Keep ranking weights and cache format private and versioned. Basic validated bundled-package installation is included so retrieval is independently testable. Includes the single-sourced config-catalog entry, typed config exposure, settings/reconciliation verification and catalog contract-test update. Owns vscode-plugin/package.json setting mirror and verification of the unchanged catalog-driven JetBrains SettingsView.kt, validated by manifest/catalog parity and settings render/round-trip checks. Sole owner of catalog file layout, serialized atomic commit, receipts and recovery via sc7. Basic installation and maintenance use exactly this writer. — owns `sc5`, `sc7`
- `s5`: Own update staging, atomic publish/default switch, withdrawal overlays, recovery, release diffs and cross-release regression evaluation. Consume existing reader contracts; never change DI2 guideline state. Uses sc7 for all catalog/default/availability changes; owns upstream update policy and diff orchestration only, not a second writer or recovery implementation. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `SourceManifest`

```typescript
interface SourceFile { sourceId: string; repositoryUrl: string; revision: string; path: string; digest: string; licenseIds: string[]; licenseTextRefs: string[]; noticeRefs: string[]; attribution: string[]; modifications: string[]; retrievedAt: string; eligibility: 'eligible' | 'excluded' | 'unresolved'; eligibilityReason: string; reviewedBy: string; }
interface SourceManifest { schemaVersion: 1; policyVersion: string; files: SourceFile[]; }
interface ImportReport { admitted: string[]; excluded: { path: string; reason: string }[]; unresolved: string[]; }
```

**Returns:** `SourceManifest` — Closed, versioned sc3 source metadata for material actually included in a candidate; review decisions and exact upstream identity remain inspectable.

**Errors:**
- `ValidationIssue[]` when Invalid structure, duplicate source identity, unpinned revision, unresolved evidence or inconsistent eligibility.

**Preconditions:**
- Decode unknown inputs from detached canonical JSON; never trust TypeScript types or an eligible label as proof.
- Review descriptors and policy are maintainer-controlled local inputs; incoming repository content cannot set or amend policy.

**Postconditions:**
- Exact sc3 fields retained without coercion, stripping, inferred authorship or dropped modifications.
- Published source metadata contains only included eligible material and its complete required evidence closure; rejected inputs stay in the staging report. [[c2]]

### 2.2 `ImportReport`

```typescript
interface ImportReport { admitted: string[]; excluded: { path: string; reason: string }[]; unresolved: string[]; }
```

**Returns:** `ImportReport` — Deterministically sorted per-file outcomes for one repository/revision import. Entries use upstream relative paths within that request; reports for multiple sources remain separate.

**Errors:**
- `ValidationIssue[]` when Request-wide safety/integrity failure prevents returning any admitted bytes.

**Preconditions:**
- A request binds one allowlisted repository URL, an existing local repository and one full commit object ID.
- Only exact listed paths may be acquired; no mutable branch/tag expansion, recursive checkout, network or subprocess hooks.

**Postconditions:**
- Eligible files alone produce staged bytes; unknown decisions appear in unresolved and ship no bytes; excluded entries carry reasons.
- No publication, catalog mutation, project-guideline change or user-facing IPC/MCP surface is introduced. [[c2]]

### 2.3 `StageAssessment`

```typescript
interface StageAssessment { stage: 'eligibility' | 'coverage'; candidateContentDigest: string; passed: boolean; issues: ValidationIssue[]; }
```

**Returns:** `StageAssessment` — Consumed S001 envelope. S002 produces only stage='eligibility' after checking complete candidate lineage and notices; downstream supplies coverage.

**Errors:**
- `ValidationIssue[]` when Unknown policy, missing lineage, omitted obligations, changed source/output bytes or noncomputable identity prevents a passing assessment.

**Preconditions:**
- Candidate inventory is snapshotted and checked with sc1/sc2 helpers; candidate digest must be nonempty.
- Full editorial coverage review is not required to compute eligibility: verify structural/source/notice/record invariants without requiring the future coverage envelope's finalized bytes.

**Postconditions:**
- The assessment binds corrected candidateContentDigest and all source/notices role metadata.
- Failure with noncomputable digest returns ValidationResult failure rather than constructing a StageAssessment with an invalid empty digest. No changes to S001 public schema. [[c3]]

## 3. Data model changes

### 3.1 `sc3 closed schemas and source identities` — new

Proposed src/design/corpus/sources/contracts.ts defines exact sc3 runtime TypeBox schemas with Static-derived types, reusing S001 digest/issue primitives. SourceFile.sourceId uniquely names one repositoryUrl/revision/path tuple within a release; use a stable namespaced lowercase identifier derived from SHA-256 of canonical tuple, and reject duplicate IDs or inconsistent tuples. revision is a full Git commit OID (40 or 64 lowercase hex), digest is raw blob SHA-256; retrievedAt is validated UTC ISO supplied by the caller, not wall-clock-generated. path and all distributed evidence refs use S001 portable path rules and NFC/case collision comparisons. Reference-only source links are not SourceFile admission records. GuidanceRecord.provenance.sourceRefs resolves exactly to sourceId entries for imported/derived material; no URL guessing or source-ID aliases. [[c2]] [[c3]] Reuse only the exported isPortablePath helper. pathCollisionKey and utcDate are private in S001; S002 will implement small local equivalents in sources/validation-primitives.ts, with behavioral parity tests against S001 public validators. Collision equivalence is NFC normalization followed by toLowerCase; timestamps accept only real UTC calendar instants whose ISO round-trip exactly matches YYYY-MM-DDTHH:mm:ss[.sss]Z. No exports or code changes in S001 validate.ts/index.ts are proposed. The parity matrix includes NFC-equivalent paths, case collisions, C0/C1 characters, leap days, impossible dates, fractional-second precision and offsets. [[c3]]


### 3.2 `Reviewed source policy v1` — new

Proposed sources/policy.ts carries a closed versioned policy of exact canonical repository URLs plus explicitly reviewed file profiles. A profile binds repository, full commit, exact paths, SHA-256 bytes, reviewedBy, eligibilityReason, resolved license identifiers, license/notice evidence paths and their digests, attribution, required modification notices and relevant redistribution conditions. The initial license categories follow PRD preferences MIT, Apache-2.0 and CC0-1.0, but an ID alone never admits a file; the reviewed profile must resolve actual file terms and exceptions. Open-font categories require an explicit reviewed category/profile with reserved-name/other conditions recorded before admission; no generic font allowance. Unknown license, unsupported expression, conflicting IDs/terms or a missing file-specific review yields unresolved. Explicit disallowed terms yield excluded. Multiple IDs do not mean automatically choosing the most permissive; unresolved OR/AND/exception expressions require a maintainer to supply an unambiguous reviewed profile under a versioned policy. Repository code licenses never cover external sites/assets automatically. Checks implement recorded decisions, not automated legal interpretation. No network lookup, model inference or source-controlled policy modification. [[c1]] [[c4]]


### 3.3 `Bounded pinned local source adapter` — new

Proposed sources/git-reader.ts is a separate I/O entry, never re-exported by the pure src/design/corpus/index.ts. Acquire only from a caller-supplied existing local Git repository; no clone/fetch or worktree reads. Verify full supplied OID identifies a commit, enumerate exact literal selected tree paths, reject symlink/submodule/non-blob entries, then read blobs at that commit. Dirty worktree changes cannot affect bytes. Use shell:false argv, literal path matching, fixed read-only Git subcommands, disable replacement objects and lazy fetching, exclude inherited Git command/config overrides, and bound stdout/stderr/time and abort children; never silently truncate. Existing shell-helper emits decoded text and git revParse emits short hashes, so do not use them for byte preservation/pinning. The internal injectable reader returns copied Uint8Array blobs plus verified object kind/path/commit for pure tests. Enforce <=10,000 selected files and <=64 MiB aggregate staged bytes using S001 safety limits, <=30 seconds per child, and fail the request without admitted bytes on truncation, timeout, absent OID/path, Git object/framing integrity failure, malformed output or cancellation. Git LFS pointers and submodules stay unresolved unless a future approved adapter supplies verified content; never follow them or trigger filters. Staging is an in-memory result; durable catalog/package installation remains S004. [[c3]] [[c5]] Distinguish verified acquisition from profile eligibility: successfully acquired blob bytes that differ from a reviewed profile digest make only that file unresolved; no bytes from it or from dependents requiring its evidence are admitted. An invalid Git object/type/framing or inconsistent acquisition result aborts the request. Validate explicitly requested upstream paths before I/O: any non-portable requested path (including percent or colon) aborts the entire request with path.invalid, rather than silently skipping it. Unselected upstream paths are not enumerated for admission and cannot invalidate the request. This strict v1 request grammar is separate from mixed license eligibility. [[c2]]


### 3.4 `Eligibility and source-to-output lineage` — new

Proposed sources/eligibility.ts accepts detached reviewed descriptors, policy, acquired blobs and the candidate's records/file inventory. Separate staging decisions from candidate assessment: evaluate every exact requested file against the profile and evidence digests, return mixed ImportReport plus only admitted copied bytes. A rejected/unresolved source cannot be referenced by included records or outputs. Internal output bindings map each included third-party package path and digest to nonempty sourceIds, transformation identifier and explicit modification notes; imported byte copies require equality to upstream digest, derived bytes require their own digest and recorded transformations/reviewer rather than a false equality assertion. Bindings are serialized within a separate deterministic lineage JSON file listed in the manifest, so candidate hashing covers them without changing sc3; its fixed package path is sources/lineage.json and schema version 1. Records' sourceRefs and modificationNotes must agree with bindings; shared specimens union all contributing sources. Original and independently inferred records identify author/rationale and cannot silently wrap unbound third-party assets. A missing binding for any non-original specimen/output fails provenance.incomplete. Require explicit original-output declarations with author and rationale in the same lineage file for package content with no upstream sources; metadata/evidence files use their own explicit categories. Closure includes license and notice evidence, their raw digests and attribution; no dependency is admitted on repository reputation. [[c2]] [[c3]] A stale file or license/notice evidence profile digest is a per-file unresolved eligibility result, propagated to every requested file depending on that evidence; other independently eligible files still appear in admitted. No stale bytes are distributed. Acquisition-integrity failures remain request-level as specified by the reader. [[c2]]


### 3.5 `Deterministic notices and eligibility composition` — new

Proposed sources/notices.ts emits deterministic UTF-8 NOTICE text plus unchanged license/notice evidence bytes under portable package paths. Sort by sourceId/path using code-unit order, deduplicate identical evidence bytes by digest while retaining every source association, preserve original text exactly in evidence files, and include exact repository/commit/path/digest, license IDs, attribution, modifications and reviewed provenance. No current time, absolute machine paths or locale-dependent sorting. Binary assets are not interpreted as text; evidence text decoding is strict and bounded. Before returning passing eligibility, independently reconstruct expected source manifest/lineage/notices from included bindings and reviewed profiles and compare exact candidate metadata bytes and evidence inventory: a formatter invocation is not proof that all obligations were included. Missing evidence, modified notice bytes, omitted contributor, stale profile or source-reference mismatch blocks. Required notice/license refs must resolve to included immutable evidence files, not remote URLs or local absolute paths. SourceManifest contains admitted source/evidence entries; staging rejects stay in ImportReport outside distributed bytes. Candidate assembly order: admitted source/output bytes → source manifest/lineage/notices → manifest with coverage path/mediaType placeholder → nonempty candidate digest → eligibility assessment → S003 coverage envelope → final release digest → S001 complete preflight. This avoids requiring a finalized coverage envelope to compute eligibility, and no SourceManifest or lineage file embeds candidate/final release digests. [[c2]] [[c3]]


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | Exact SourceFile/SourceManifest/ImportReport shapes, reviewed eligibility, pinned local extraction and deterministic obligation closure. Internal profiles, bindings and adapter seams remain S002-owned. [[c2]] |
| `sc1` | consumes | Resolve sourceRefs and preserve original/derived/imported/inferred labels, source identity and modification lineage; do not change record schemas. [[c3]] |
| `sc2` | consumes | Use raw byte and corrected manifest hashes, portable inventory validation and candidate-bound eligibility assessments. No publication/catalog write; no coverage algorithm. [[c3]] |

## 5. Error paths

**Error cases**

- **Unknown, absent or conflicting file terms** (recoverable)
  - Detection: Resolve the exact file profile and policy category; detect absent review, unsupported expressions, and SHA-256 disagreement between successfully acquired bytes and reviewed file or evidence profiles.
  - Response: Mark the affected path and every requested dependent of stale evidence unresolved; admit no affected bytes. Other independently eligible files may be admitted. Candidate references to unresolved material fail provenance.incomplete.
  - User impact: Maintainer must supply a reviewed file-specific decision.
- **Explicitly excluded source or non-allowlisted repository** (recoverable)
  - Detection: Compare exact repository URL and selected path/profile against versioned policy.
  - Response: Exclude with stable reason; no bytes admitted.
  - User impact: A blocked file cannot enter a distributed candidate.
- **Missing pinned revision/path or Git acquisition-integrity failure** (recoverable)
  - Detection: Verify full commit type, exact tree/blob identity and complete binary framing; distinguish an invalid/inconsistent acquisition result from valid bytes that merely differ from a stale reviewed profile.
  - Response: Request-level ValidationResult failure with digest.mismatch, inventory.invalid or reference.missing; no admitted result. A reviewed-profile digest mismatch after successful acquisition instead follows the per-file unresolved rule.
  - User impact: Re-pin and review the intended revision.
- **Unsafe paths, duplicate IDs, symlinks/submodules or limit excess** (recoverable)
  - Detection: Apply portable path and NFC/case collision checks, unique sourceId tuple checks, tree modes and incremental byte/time bounds.
  - Response: path.invalid, inventory.invalid, reference.missing or limit.exceeded; abort request and release subprocess/resources. Any explicitly requested non-portable upstream path, including percent/colon, aborts the entire request before I/O; unselected paths have no effect.
  - User impact: Correct the input; no traversal, lazy fetch, filters or truncated output.
- **Omitted or altered notice/license/lineage data** (recoverable)
  - Detection: Reconstruct exact expected metadata/evidence closure from admitted profiles and output bindings; compare candidate inventory hashes and bytes.
  - Response: provenance.incomplete, reference.missing or digest.mismatch; passing eligibility is withheld.
  - User impact: Regenerate complete notices and assessments.
- **Unbound third-party specimen or inconsistent record sourceRefs** (recoverable)
  - Detection: Join each package output to source bindings or explicit original declarations; compare record provenance source IDs and modification notes.
  - Response: provenance.incomplete; output cannot be admitted based on an original record label alone.
  - User impact: Record the actual contributors and transformations.
- **Candidate identity cannot be computed** (recoverable)
  - Detection: Count coverage-path membership and call corrected candidateContentDigest; empty digest is not a valid assessment binding.
  - Response: ValidationResult failure; do not emit a malformed StageAssessment. Preserve sc1/sc2 diagnostics.
  - User impact: Repair inventory before producing assessments.
- **Git unavailable, timeout, cancellation or malformed binary stream** (recoverable)
  - Detection: Observe subprocess exit/signal, abort state, bounded stderr/stdout and object framing.
  - Response: Request-level failure with no admitted bytes; release buffers and child handles; sanitized error includes stable category, not raw source content.
  - User impact: Retry after fixing local checkout or environment.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Mixed eligible and unknown-license files at one pinned commit | A successful staging report admits only eligible files with complete evidence; unresolved bytes are absent. A candidate that references unresolved sources still fails. |
| Two source files share an identical license text | Deduplicate stored evidence by digest while retaining both source associations and all attributions. |
| Dirty worktree or branch moves after the request | Read only the verified full commit object; pinned bytes and notices stay unchanged. |
| Original guidance with no upstream sources | Explicit original-output declarations and record author/rationale remain required; do not fabricate third-party attribution. |
| Derived asset combines multiple sources | Bindings contain the union of sourceIds and modification records; notices cover all contributors. |
| Font or dual-license file lacks an explicit policy decision | Unresolved and absent from admitted bytes; no permissive license guessed. |
| Coverage envelope not yet finalized | The manifest already declares coverage path/mediaType; eligibility binds non-cyclic content and does not require S003 editorial completion. |
| One successfully read file differs from its reviewed digest | That file and dependents of its stale evidence are unresolved; other independently eligible files are admitted. Git object/framing integrity failure instead aborts the whole request. |
| An explicitly requested upstream path contains percent or colon | Reject the entire request as path.invalid before I/O under the strict v1 grammar. The same path elsewhere in the unselected repository has no effect. |

**Invariants to preserve**

- sc3 public interfaces and adjacent story boundaries stay as approved; no catalog writer or guidelines workflow here. [[c2]]
- Candidate hash covers all non-cyclic manifest metadata; eligibility output is a trusted internal result, not caller authorization. [[c3]]
- Pure sc1/sc2 barrel imports remain free of file/network/provider side effects; Git reader is a separate entry point. [[c3]]
- Accuracy and retained provenance take precedence over automatic guesses; no direct cloud calls or provider use. [[c4]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict via tsx, matching direct reads of existing corpus tests after empty graph test/convention probes.`

**Test levels**

- **unit** — Prove sc3 schema and file-level reviewed policy without Git or real third-party content.
  - Subjects: `source-schema: exact sc3 round-trip, strict unknown fields, unique IDs, full revisions and portable evidence refs`, `mixed-eligibility: eligible/unknown/conflicting/excluded files, expression and font-profile handling, no label-only admission; stale file/evidence profiles remain per-file unresolved and propagate to dependents`, `lineage-closure: multi-source derived outputs, original declarations, record sourceRefs and modifications, no unbound specimens`, `validation-parity: local collision/timestamp primitives match S001 public-validator behavior on the shared adversarial matrix without exporting private S001 helpers`
  - Fixtures: `Independently authored text/binary files with synthetic reviewed policy descriptors; labels represent test decisions, not legal assertions.`
- **contract** — Prove complete deterministic notices and candidate binding.
  - Subjects: `notice-closure: every included source and obligation retained, byte-exact evidence, deterministic ordering and shared evidence deduplication`, `eligibility-binding: swapped source/notices roles, changed attribution/output/evidence bytes and stale profiles invalidate assessments`, `acyclic-staging: coverage placeholder enables eligibility before coverage finalization; zero/duplicate coverage membership yields failure rather than an empty StageAssessment`
  - Fixtures: `Complete synthetic source/lineage/NOTICE manifest plus S001 record and package fixtures; independently specified expected notice bytes.`
- **integration** — Prove pinned extraction with temporary local repositories and a controlled process seam.
  - Subjects: `pinned-reader: exact commit bytes despite dirty worktree/branch movement; binary round-trip and missing revision/path`, `reader-safety: symlink/submodule/LFS rejection, unsafe paths, collisions, byte/count/time limits, cancellation and subprocess failure with no admitted bytes; acquisition-integrity failures abort the request, and any selected non-portable path fails before I/O while unselected paths do not`, `candidate-roundtrip: mixed source staging through source manifest/notices/lineage and S001 preflight, with complete exported inventory`
  - Fixtures: `Temporary repositories under OS temp dirs, fixed authored commit contents and explicit input timestamps; injected failures for bounded process behavior.`
- **smoke** — Preserve runtime boundaries and strict compilation.
  - Subjects: `pure-boundary: sc1/sc2 import and pure eligibility/notices run with I/O forbidden; Git adapter imported separately`, `strict-build: npm run build and all corpus tests under supported Node`
  - Fixtures: `Fresh private compilation output; no daemon store, live network, installed source assets or provider.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `source-schema`, `mixed-eligibility`, `lineage-closure`, `pinned-reader`, `reader-safety`, `eligibility-binding`, `acyclic-staging`, `candidate-roundtrip` |
| `ac2` | `notice-closure`, `lineage-closure`, `candidate-roundtrip`, `eligibility-binding`, `pure-boundary`, `strict-build` |

## 7. Alternatives considered

### 7.1 a1: Pure eligibility core with separate pinned Git reader — **CHOSEN**

Keep policy and notices deterministic; isolate local Git access behind a binary reader.

Implement sc3 schemas and pure file-level eligibility/notice composition in a sources module. A separate local Git adapter reads exact commit blobs into bounded memory with an injectable byte-reader; both consume sc1/sc2 identities. Human-reviewed source descriptors select exact files and obligations, never infer eligibility from repository labels.

### 7.2 a2: Single filesystem importer with policy and notice generation

Combine pinned extraction, eligibility and output generation into one import service.

Implement sc3 in a local staging service which reads exact commit blobs, performs reviewed file-level policy checks and emits notices. Keep the same sc1/sc2 shapes and no catalog writes, with integration tests around temporary repositories.

**Rejected because:** Meets outputs but entangles pure eligibility with I/O and weakens fault isolation.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: six bounded probes, empty/off-topic corpus graph, direct fallback source reads`
- **[[c2]]** `prior-artifact` `.insrc/artifacts/HLD-7e0ae92e8f3d3c3e.json: sc3 and S002 boundary; .insrc/artifacts/DEF-7e0ae92e8f3d3c3e.json: s2 ac1/ac2`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/LLD-7e0ae92e8f3d3c3e-s1.json; src/design/corpus/contracts.ts; src/design/corpus/canonical.ts; src/design/corpus/validate.ts; corpus tests`
- **[[c4]]** `doc` `docs/plans/design-intelligence-prd.md:105,157-173,258,269; CLAUDE.md architectural rules`
- **[[c5]]** `code` `src/daemon/tools/builtins/git/helpers.ts:40; src/daemon/tools/shell-helper.ts:52-102 (short OID and UTF-8 text capture are not suitable for pinned binary corpus bytes)`
