<!-- insrc:artifact HLD-7e0ae92e8f3d3c3e -->

# HLD: di1-open-source-design-corpus-retrieval

## Summary

Design knowledge ships as reviewed, versioned releases with traceable sources and reusable examples for Web, iOS and Android. Agents retrieve applicable guidance through insrc and keep exact evidence references. Updating the corpus never changes an approved project's choices.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-7e0ae92e8f3d3c3e** § 1. Problem

## 2. Framework summary

Choose immutable release packages with a daemon-owned catalog and rebuildable retrieval indexes. Shared contracts below are proposed additions, not existing APIs. Corpus data is global public knowledge, independent of registered source repositories; DI2 owns project-private guideline storage and DI3 owns authoring workflows.

## 3. Architecture shape

Proposed domain location: src/design/corpus/ for contracts, validation, release installation and retrieval. Proposed adapter src/daemon/design-corpus-rpc.ts is composed into the existing handlers map in src/daemon/index.ts and served by src/daemon/server.ts; MCP adds a thin corpus query/read wrapper through IPC only. These paths except existing daemon files are new. Reuse existing LLMProvider/local embedder abstractions with sequential calls; any optional cloud editorial assistance uses CliProvider and critical role tiering. Normal retrieval needs no cloud generation. Existing src/analyze/docs-retrieval.ts is a ranking precedent, not a drop-in: its Args require DbClient/closureRepos and its results identify repo entities. Do not insert corpus records as fake repo entities or weaken repo.add.

Author eligible original/derived records and notices under proposed src/assets/design-corpus/. Existing copy-assets.mjs copies src/assets recursively to out/assets. Ship only a validated reviewed release, never candidate downloads. New PATHS.designCorpus points to ~/.insrc/design-corpus; daemon-owned filesystem packages are the canonical store, avoiding changes to code graph tables. Staging, immutable releases/<releaseId>, derived indexes/<releaseId>/<modelFingerprint>, catalog.json and append-only withdrawal events are distinct. JSON records have canonical sorted serialization and SHA-256 digests. Package digest covers sorted path+content hashes including notices, records, examples and review/coverage evidence, excluding only the self digest; a schema-versioned definition avoids hash ambiguity. Record ID is stable curator-assigned namespaced identity; recordVersion is content digest, not timestamp. Reject duplicate IDs, missing references, symlinks, path traversal, digest mismatch and unsupported schema before install.

Install verifies a bounded local staged package, fsyncs files and directory, atomically renames into immutable release directory, then updates catalog by temporary-file fsync+atomic rename under a daemon serialized writer. Startup recovers valid orphan packages and discards incomplete staging; catalog never references half-published content. Publish uses expected catalog generation and idempotency key; identical retry returns same release, conflicting retry fails. User-installed packages require explicit maintainer review metadata and local authorized install intent; hash integrity is not trust. No executing imported JS, shell or HTML. Original specimens are declarative data rendered safely; source imports are untrusted data and file-level eligibility remains an editorial gate.

A query resolves the requested release once (or current catalog default once), validates UI type, applies published/eligible/platform and hard structured constraints before scoring, and returns pinned record versions. For the seed corpus score all eligible records lexically; local embeddings may add exact semantic similarity across that same set. Reuse local embedding abstraction only after verifying input/model limits; chunk long records without truncation and aggregate with evidence links. Index keys include release, record digest, embedder model/version, dimensions and normalization version. Persisted indexes are disposable; rebuilding is serial and resumable. Embedding failure reports degraded lexical mode, never claims semantic completeness. Stable ordering uses score then record ID/version. Pagination freezes release and ranking/index version; changed availability invalidates cursor explicitly. A result limit affects presentation, not eligibility scanning, and reports total, truncated and nextCursor. No arbitrary silent corpus truncation. Rationale is a deterministic explanation of matched tags, constraints and source excerpts, not an invented design judgment. Conflicts and unsupported constraints are explicit gaps, not score penalties that allow unsafe recommendations.

Exact evidence lookup never falls forward to latest. Deprecated records remain readable with warnings but excluded from new default recommendations. Withdrawn references return a tombstone with reason and provenance identifiers; policy-blocked content is withheld even historically, while historical IDs/hashes/notices permitted to retain are preserved. Never silently rewrite a guideline or substitute newer content. DI2 persists sc1 references and its own approved decision snapshot; DI1 owns evidence availability. DI3 consumes query/read APIs and builds project-level guidelines, never page-specific guideline identities.

Digest dependency order (normative): compute recordVersion from canonical record content excluding recordVersion and review; review.contentDigest must equal that version. Compute candidateContentDigest from a canonical snapshot of the complete validated manifest, omitting ONLY top-level releaseId, top-level reviewDigest, and the digest property of the unique files entry at coveragePath. Keep that coverage entry's path/mediaType and all other manifest fields: schemaVersion, label, createdAt, maintainer, role paths, complete record entries and other complete file entries. Sort records by recordId/version and files by path. The manifest is not included as a file in its own inventory; its non-cyclic metadata is now explicitly bound. If zero or multiple files entries match coveragePath, candidate identity is not computable: internal composition uses an empty value, preflight stays ineligible and every supplied assessment is stale. Do not omit every match or invent a candidate identity for malformed membership. Independently compute manifestDigest when structurally possible; otherwise report its documented empty value. Any role, attribution, record-entry or file-media-type change invalidates assessments. This corrects the earlier projected-pairs rule without changing the record→candidate→review→release order or public shapes. [[c18]] Coverage refers only to recordId/recordVersion pairs, never final releaseId. After editorial review, compute reviewDigest over canonical coverage/review envelopes. Compute releaseId over the canonical manifest with releaseId omitted and all listed file hashes; the files list excludes the manifest itself. This prevents self-referential hashes while binding final release identity to review evidence. Change to content invalidates its review; publication requires exact digest matches and all coverage cells pass. Runtime EvidenceRef combines the resulting releaseId with a record pair.

Retained evidence from the previously approved HLD [[c19]] (not a claim of refreshed graph coverage): earlier analyzer bundles locate daemon/index.ts, daemon/server.ts, db/search.ts and analyze/docs-retrieval.ts. Direct inspection supplements bounded graph discovery: docs-retrieval.ts:115 defines repo-scoped arguments, server.ts:187 dispatches the handlers map, copy-assets.mjs:28 copies assets/prompts, and shared/paths.ts:7 owns filesystem paths. All design/corpus paths, corpus IPC names, config keys and catalog/index layouts above are proposed new surfaces.

Review corrections: s4 adds designCorpus.enabled to src/config/config-catalog.ts as boolean, default false, main config domain, group Design intelligence; introduces a typed accessor for designCorpus.enabled that treats anything other than true as disabled (following the existing raw-config boolean-reader pattern), and updates catalog row-count/shape assertions in src/config/__tests__/config-catalog-contract.test.ts. Existing src/config/reconcile.ts and reconcile-io.ts remain the catalog-driven integration; verify default fill, preservation and config.catalog settings exposure rather than adding a second settings registry. s5 consumes the same flag and does not introduce another. IPC clients receive the CorpusResult discriminated union inside the existing result envelope; the adapter normalizes validation/domain errors there because server.ts serializes thrown errors as strings. Maintainer mutation results use the same union with additional conflict and validation codes; no IPC envelope change is required.

Verification matrix for the approved DEF: S001/ac1 rejects omitted provenance/examples/applicability/review and domain-required payload; S001/ac2 read round-trip asserts stable identity, version, relationships, rationale and every source lineage field. S002/ac1 mixed eligible/unknown-license import admits only eligible bytes with exact revision, attribution and modifications; S002/ac2 release/export notices enumerate every included third-party asset. S003/ac1 publication rejects any missing domain/platform cell, gap cell or failed evaluation; human editorial review assesses quality of every passing cell. S003/ac2 draft generated/inferred records cannot enter published query or exact-read results; a reviewed inferred record remains labelled inferred, never source-authored. S004/ac1 platform/hard-constraint fixtures assert filtered results, caveats, fit and pinned evidence over real IPC serialization; invalid-input/unavailable-release/disabled results retain their codes after IPC and MCP round-trip. S004/ac2 no eligible match yields explicit gap, and unavailable semantic search reports degraded mode. S005/ac1 changed source/license requires a newly reviewed digest and tests deprecation/withdrawal overlays; S005/ac2 publishing N+1 and rollback leave N evidence unchanged, with withdrawal returning explicit tombstones and no substitution. Crash injection and concurrent/idempotent publication test durable visibility at every atomic boundary. All tests use temporary corpus directories and fake providers; opt-in live local embedding evaluation runs serially.

Settings mirrors (s4): add insrc.designCorpus.enabled to vscode-plugin/package.json under a Design intelligence configuration section, type boolean, default false, scope machine, with the same description as the catalog. Verify vscode-plugin/src/config/__tests__/manifest-catalog.test.ts exact key coverage, type/default/scope parity. No SettingsView.kt edit is needed: src/config/settings-catalog.ts derives groups from first-seen CONFIG_CATALOG order and JetBrains groupsOf consumes catalog.groups with fallback for unlisted groups. Verify that the catalog-driven boolean control renders and round-trips there. This is backend capability exposure in existing settings, not a separate project-design UI. Run both backend config contract tests and plugin manifest/settings checks when s4 implements the flag; no new IPC settings envelope is introduced.

Catalog ownership and atomicity (sc7): S004 owns catalog.json and the serialized writer/recovery for both initial install and later changes. Availability events are append-only entries within each atomic catalog snapshot, not a separate authoritative log requiring a cross-file transaction. Optional log exports are derived. S005 supplies validated mutations through sc7; it never edits catalog files. sc7 resolves availability-event precedence, checks release existence/schema and stage verification, rejects invalid defaults and generation conflicts, and atomically commits state plus idempotency receipt. An identical idempotency key/request digest returns its prior receipt before generation checking; a changed request under that key is a conflict. Recovering a complete orphan package registers it without selecting it as default or inferring publication approval; only a valid stored reviewed manifest may be installed. Recovered packages remain unavailable until that verification succeeds. Recovery never replays an uncommitted default or withdrawal intent. Tests inject crashes around rename/catalog commit and assert one authoritative generation, complete receipts, explicit tombstones and no unauthorized default change.

## 4. Diagrams

- [Component dependencies](docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Corpus record and pinned evidence identity

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** Common immutable record, provenance and release identity across all stories and DI2/DI3.

**Interface sketch (type-level):**

```
type UiType = 'web' | 'mobile-ios' | 'mobile-android';
type GuidanceKind = 'foundation' | 'pattern' | 'style-recipe';
interface EvidenceRef { releaseId: string; recordId: string; recordVersion: string; }
interface Provenance { authorship: 'original' | 'derived' | 'imported' | 'inferred'; author: string; sourceRefs: string[]; modificationNotes: string[]; }
interface Applicability { uiTypes: UiType[]; suitableConditions: string[]; contraindications: string[]; units: string[]; }
interface GuidanceRecord { schemaVersion: 1; recordId: string; recordVersion: string; title: string; domains: string[]; kind: GuidanceKind; guidanceClass: 'requirement' | 'convention' | 'heuristic' | 'preference'; explanation: string; rationale: string; problem: string; tradeoffs: string[]; checks: { check: string; requiredInputs: string[]; exceptions: string[]; limits: string[] }[]; noMeasurableChecksRationale?: string | undefined; domainPayload: { color?: { roles: { name: string; value: string }[]; pairings: { foregroundRole: string; backgroundRole: string; usage: string }[] } | undefined; layout?: { contentPriority: string[]; adaptationRules: { condition: string; rule: string }[] } | undefined; style?: { composition: string; typography: string; color: string; interaction: string } | undefined; }; applicability: Applicability; examples: { kind: 'example' | 'misuse'; contentRef: string; uiType: UiType }[]; relations: { kind: 'compatible' | 'conflicting' | 'prerequisite' | 'alternative'; recordId: string; recordVersion: string }[]; provenance: Provenance; review: { status: 'draft' | 'reviewed'; reviewer: string; contentDigest: string; reviewedAt: string }; }
```

### 5.2 sc2: Release manifest and publication gate

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** s1 establishes envelopes and gates used by import, curation, query and maintenance; s2 implements ingestion. Publication requires nonempty problem/tradeoffs, checks with explicit limits (or an explicit no-measurable-check rationale), and domainPayload.color/layout/style for corresponding color/layout/style records. Semantic roles and pairings must reference declared roles; examples and misuse examples must be present for every declared platform. Domain validation rejects an empty placeholder.

**Interface sketch (type-level):**

```
interface ReleaseManifest { schemaVersion: 1; releaseId: string; label: string; createdAt: string; maintainer: string; records: { recordId: string; recordVersion: string; path: string; digest: string }[]; files: { path: string; digest: string; mediaType: string }[]; sourceManifestPath: string; noticesPath: string; coveragePath: string; reviewDigest: string; }
interface ValidationIssue { code: string; path: string; message: string; }
interface PublicationCheck { eligible: boolean; issues: ValidationIssue[]; manifestDigest: string; }
interface ReleaseAvailability { releaseId: string; state: 'published' | 'deprecated' | 'withdrawn'; reason?: string | undefined; catalogGeneration: number; }
```

### 5.3 sc3: File-level source eligibility and attribution

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** Keep file licenses, exact upstream revisions and notices with every derived asset; repository license alone never admits content.

**Interface sketch (type-level):**

```
interface SourceFile { sourceId: string; repositoryUrl: string; revision: string; path: string; digest: string; licenseIds: string[]; licenseTextRefs: string[]; noticeRefs: string[]; attribution: string[]; modifications: string[]; retrievedAt: string; eligibility: 'eligible' | 'excluded' | 'unresolved'; eligibilityReason: string; reviewedBy: string; }
interface SourceManifest { schemaVersion: 1; policyVersion: string; files: SourceFile[]; }
interface ImportReport { admitted: string[]; excluded: { path: string; reason: string }[]; unresolved: string[]; }
```

### 5.4 sc4: Coverage and editorial review evidence

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`

**Purpose:** Publication requires actual reviewed domain/platform combinations and content-bound review, not a record count.

**Interface sketch (type-level):**

```
interface CoverageCell { domain: string; uiType: UiType; records: { recordId: string; recordVersion: string }[]; evaluationCases: string[]; status: 'pass' | 'gap'; reviewer: string; notes: string; }
interface CoverageReport { schemaVersion: 1; candidateContentDigest: string; cells: CoverageCell[]; crossPlatformCases: { id: string; status: 'pass' | 'fail'; evidence: string[] }[]; }
```

### 5.5 sc5: Read-only corpus retrieval IPC

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** DI3 searches reviewed public knowledge; DI2 resolves exact references. No project identity or guideline mutation is accepted.

**Interface sketch (type-level):**

```
interface CorpusQuery { releaseId?: string | undefined; uiType: UiType; query: string; domains?: string[] | undefined; hardConstraints: { key: string; value: string | number | boolean }[]; limit: number; cursor?: string | undefined; }
interface CorpusHit { ref: EvidenceRef; record: GuidanceRecord; fit: { matched: string[]; caveats: string[]; conflicts: EvidenceRef[] }; }
interface CorpusQueryResult { releaseId: string; mode: 'hybrid' | 'lexical'; status: 'matched' | 'gap' | 'degraded'; hits: CorpusHit[]; gaps: { code: string; detail: string }[]; totalEligible: number; truncated: boolean; nextCursor?: string | undefined; }
type CorpusReadResult = { status: 'found'; ref: EvidenceRef; record: GuidanceRecord; availability: ReleaseAvailability } | { status: 'missing' | 'withdrawn' | 'unsupported-schema'; ref: EvidenceRef; reason: string };
type CorpusErrorCode = 'invalid-input' | 'unavailable-release' | 'unsupported-schema' | 'cursor-invalidated' | 'corpus-disabled' | 'internal-error' | 'conflict' | 'validation-failed';
interface CorpusFailure { ok: false; error: { code: CorpusErrorCode; message: string; retryable: boolean }; }
type CorpusResult<T> = { ok: true; value: T } | CorpusFailure;
interface CorpusReadApi { query(request: CorpusQuery): Promise<CorpusResult<CorpusQueryResult>>; read(ref: EvidenceRef): Promise<CorpusResult<CorpusReadResult>>; }
// Proposed IPC: design.corpus.query, design.corpus.read, design.corpus.releases. Domain failures are serializable CorpusFailure results inside the existing IPC result envelope, never thrown typed errors or empty matches. Unexpected transport failure remains a transport error.
```

### 5.6 sc6: Release maintenance and withdrawal

**Owner Story:** `s5`

**Purpose:** Stage verified updates with explicit publication, conflict detection and reversible default selection.

**Interface sketch (type-level):**

```
interface PublishRequest { stagedPackageId: string; expectedCatalogGeneration: number; idempotencyKey: string; reviewDigest: string; }
interface PublishResult { releaseId: string; catalogGeneration: number; alreadyPublished: boolean; }
interface ReleaseDiff { before: string; after: string; added: string[]; changed: string[]; removed: string[]; licenseChanges: string[]; }
// Proposed maintenance IPC: design.corpus.stage, validate, publish, diff, setDefault, withdraw. Exposed only as explicit local maintainer actions; read-only MCP cannot invoke these.
```

### 5.7 sc7: Catalog persistence and atomic release writer

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** S004 owns the sole catalog layout, atomic serialized writer and startup recovery. S005 invokes this contract for maintenance and never writes private catalog/index files.

**Interface sketch (type-level):**

```
interface AvailabilityEvent { id: string; releaseId: string; recordRef?: EvidenceRef | undefined; state: 'deprecated' | 'withdrawn'; reason: string; actor: string; timestamp: string; }
interface CatalogEntry { releaseId: string; manifestDigest: string; installedAt: string; state: 'published' | 'deprecated' | 'withdrawn'; }
interface CorpusCatalog { schemaVersion: 1; generation: number; defaultReleaseId?: string | undefined; releases: CatalogEntry[]; availabilityEvents: AvailabilityEvent[]; receipts: { idempotencyKey: string; requestDigest: string; committedGeneration: number; releaseId?: string | undefined }[]; }
type CatalogMutation = { kind: 'install'; verifiedStagingId: string; manifestDigest: string; makeDefault: boolean } | { kind: 'set-default'; releaseId: string } | { kind: 'availability'; event: AvailabilityEvent };
interface CatalogCommitRequest { expectedGeneration: number; idempotencyKey: string; mutation: CatalogMutation; }
interface CatalogCommitResult { generation: number; releaseId?: string | undefined; replayed: boolean; }
interface CorpusCatalogStore { snapshot(): Promise<CorpusCatalog>; commit(request: CatalogCommitRequest): Promise<CorpusResult<CatalogCommitResult>>; recover(): Promise<{ recoveredReleaseIds: string[]; discardedStagingIds: string[] }>; }
```

## 6. Story boundaries

### 6.1 Story E202610117e0ae92e:S001

**Owns:** `sc1`, `sc2`

Own canonical schema, version/hash specification, publication validation interfaces and fixtures. This is the nearest ancestor for all shared identity/release contracts; storage and curator UI are not implied.

### 6.2 Story E202610117e0ae92e:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Own source adapters, local staging extraction, allowlist policy implementation and reproducible notices. Adapter specifics stay private; no unreviewed source contents enter published assets.

### 6.3 Story E202610117e0ae92e:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Own authored seed records, declarative specimens and reviewed coverage across ten domains and three UI types. A release names its maintainer/reviewer; unknown source sufficiency cannot be counted as coverage.

### 6.4 Story E202610117e0ae92e:S004

**Owns:** `sc5`, `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Own daemon package reader, catalog read adapter, deterministic filtering/ranking, local embedding cache, cursor implementation and thin MCP read tools. Keep ranking weights and cache format private and versioned. Basic validated bundled-package installation is included so retrieval is independently testable. Includes the single-sourced config-catalog entry, typed config exposure, settings/reconciliation verification and catalog contract-test update. Owns vscode-plugin/package.json setting mirror and verification of the unchanged catalog-driven JetBrains SettingsView.kt, validated by manifest/catalog parity and settings render/round-trip checks. Sole owner of catalog file layout, serialized atomic commit, receipts and recovery via sc7. Basic installation and maintenance use exactly this writer.

### 6.5 Story E202610117e0ae92e:S005

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc7`

Own update staging, atomic publish/default switch, withdrawal overlays, recovery, release diffs and cross-release regression evaluation. Consume existing reader contracts; never change DI2 guideline state. Uses sc7 for all catalog/default/availability changes; owns upstream update policy and diff orchestration only, not a second writer or recovery implementation.

## 7. Non-functional targets

- **Performance:** For a representative 1,000-record seed fixture, measure warm query p95 <=500 ms excluding local embedding inference; report embedding latency separately. This is a target, not a benchmark claim. If exceeded, optimize indexing without dropping eligible candidates; complete-result quality takes precedence. Cold index building is resumable and serial.
- **Security:** Only eligible reviewed material is distributed. Validate all package paths and sizes, reject executable specimen content and remote includes; escape rendering. No arbitrary URL fetching at query time. Unknown hard constraints return gaps. Do not mix project-private data into the public corpus or embedding index.
- **Observability:** Log release ID, query mode, eligible/matched counts, filter/gap reasons, index fingerprint and validation codes; avoid storing user query/brief text by default. Expose install/index health and explicit degraded retrieval, rather than silent fallback.
- **Durability:** Immutable package bytes plus atomic catalog and append-only availability events. Rebuild derived indexes on checksum/model mismatch. Inject crashes between each publication boundary; old release remains readable or a newly complete release becomes visible, never partial content. Retain pinned references across rollback; policy withdrawal returns tombstones.

## 8. Rollout

**A — Record and release contracts**

**Stories:** `s1`

Establish the shared schema and immutable identity rules first. Verify S001 publication rejection and complete metadata/lineage read round-trip. Completion now requires the implemented candidate identity to match the amended normative formula, independently regenerated candidate/review/release golden vectors, and role-swap plus missing/duplicate coverage-entry regressions. The current projected-pairs implementation is explicitly incomplete against this revision. S001 must not complete, and S003/S004 must not consume candidate identities, until those checks and independent code review pass.

**Backward compat:** No existing repo entity schema or registry behavior changes.

**B — Eligible source ingestion**

**Stories:** `s2`

Prove eligibility, pinned-source extraction and notices against mixed-license fixtures.

**Backward compat:** Existing assets and build copy remain compatible; candidate downloads are excluded.

**C — Reviewed seed corpus**

**Stories:** `s3`

Review each domain/platform cell and content-bound examples before distribution. Verify publication rejects gap/missing cells and draft or unreviewed inferred records are absent from published retrieval.

**Backward compat:** Existing runtime resources retain their layout; add a separate corpus asset subtree.

**D — Daemon retrieval pilot**

**Stories:** `s4`
**Flag:** `designCorpus.enabled (proposed config key)`

Expose read-only query, exact lookup and health with explicit gaps and degraded mode.

**Backward compat:** Additive IPC/MCP methods; existing search and repo registration unchanged. Disabled until a validated seed release is installed.

**E — Release maintenance**

**Stories:** `s5`
**Flag:** `designCorpus.enabled (proposed config key)`

Add update/diff/withdrawal, fault recovery and pinned-reference regression tests before enabling broad use.

**Backward compat:** Old release references remain resolvable or explicitly withdrawn; no implicit guideline edits.

**Ordering rationale:** Matches approved s1→s2→s3→s4→s5 and every contract owner precedes consumers. DI2/DI3 consume published contracts without becoming DI1 story dependencies.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Eligibility and coverage | Repository license labels and record counts do not establish file reuse rights or usable native-mobile guidance. | Require file-level manifests, named reviewers and all ten-domain/three-platform coverage cells; fill gaps with independently authored eligible guidance before release. |
| Pinned evidence and withdrawal | Mutable defaults, interrupted publication or license withdrawal can invalidate historical references. | Immutable hashes, generation checks, atomic publish recovery and explicit tombstones; test N/N+1, rollback and withdrawal with DI2-compatible fixtures. |
| Retrieval quality | Repo search is not a drop-in corpus API; semantic service availability and platform conflicts affect recommendation quality. | Use full eligible seed-set filtering/scoring, explicit unsupported constraints/degradation, reviewed positive/negative retrieval fixtures and model-versioned indexes. |

## 9. Alternatives considered

### 9.1 a1: Versioned repository documentation

Represent the corpus as registered repository documents and reuse document retrieval.

Maintain curated records and notices as documents in a corpus repository registered through repo.add. Existing document indexing and hybrid retrieval provide discovery.

Add release pins and eligibility metadata around indexed documents. Historical releases need distinct snapshots and explicit cross-repository access so project dependency closures do not accidentally hide or expose material.

**Pros:**
- Reuses existing document indexing and search surfaces.

**Cons:**
- Repo/entity identity and dependency-closure scoping do not directly represent global immutable corpus versions.
- Document ranking does not enforce provenance or platform eligibility; dedicated gates remain necessary.

**Cost estimate:** L

**Rejected because:** Retain rejection: generic retrieval is precedent, but repository coupling is unnecessary.

### 9.2 a2: Immutable release packages with daemon-owned catalog — **CHOSEN**

Publish content-addressed corpus packages and build isolated, disposable search indexes.

Curators publish validated immutable packages containing records, source manifest, notices, examples and coverage review. The daemon installs packages and owns their catalog, state overlay and retrieval; packages are independent of code repositories.

Use exact structured filtering and full eligible-record lexical scoring for the seed corpus, with local semantic ranking when available. Indexes are rebuildable derivatives keyed by release and model; every result resolves back to immutable evidence. Reuse daemon IPC and provider abstractions, while leaving repo entity storage unchanged.

**Pros:**
- Release pins reproduce evidence without depending on repo registration.
- Package validation and publication gates apply equally to records, notices and examples.
- Index failure cannot rewrite source evidence or approved project decisions.

**Cons:**
- Requires new corpus contracts, installation lifecycle and search adapter.
- Semantic ranking quality requires evaluation and local embedding availability; degraded mode must be explicit.

**Cost estimate:** L

### 9.3 a3: Database-first mutable corpus with revision history

Author and query records directly in a dedicated daemon database with revision tables.

Store drafts, reviews, revisions and published records in a domain database with transactional release membership. Export packages as a secondary distribution surface.

All reads resolve release membership before ranking; publication snapshots are immutable despite mutable authoring records. The database becomes the authoritative recovery and migration boundary for both content and release history.

**Pros:**
- Transactional authoring and release metadata share one owner.
- Incremental curator edits do not require rebuilding an entire authoring package.

**Cons:**
- Backup and migrations must preserve every historical record and bundled notice.
- Adds a mutable authoring subsystem beyond the first release's curated dataset needs.

**Cost estimate:** L

**Rejected because:** Retain rejection: adds mutable-authoring and migration complexity beyond the curated first release.

## 10. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[1]` — "Profiles locate daemon RPC modules and src/db graph/lance/search/doc-summaries. The stored DB import graph reports 159 incoming and 13 outgoing edges, with daemon/index.ts among importers; only 12 of "
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c3]]** `code` `src/analyze/docs-retrieval.ts:115`
- **[[c4]]** `code` `copy-assets.mjs:28`
- **[[c5]]** `code` `src/daemon/server.ts:187`
- **[[c6]]** `convention` `AGENTS.md:135`
- **[[c7]]** `prior-artifact` `.insrc/artifacts/DEF-7e0ae92e8f3d3c3e.json`
- **[[c8]]** `doc` `docs/plans/design-intelligence-prd.md:83`
- **[[c9]]** `code` `src/shared/paths.ts:7`
- **[[c10]]** `code` `src/config/config-catalog.ts:77`
- **[[c11]]** `code` `src/config/__tests__/config-catalog-contract.test.ts:88`
- **[[c12]]** `code` `src/config/reconcile.ts:330`
- **[[c13]]** `code` `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts:39`
- **[[c14]]** `code` `vscode-plugin/package.json:163`
- **[[c15]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:95`
- **[[c16]]** `code` `src/config/settings-catalog.ts:77`
- **[[c17]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:73`
- **[[c18]]** `doc` `plans/design-intelligence-di1-s1-digest-amendment.md`
- **[[c19]]** `prior-artifact` `plans/reviews/design-intelligence-di1-original-approved-hld.json`
