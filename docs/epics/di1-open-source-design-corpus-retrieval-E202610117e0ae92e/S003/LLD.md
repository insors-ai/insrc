<!-- insrc:artifact LLD-7e0ae92e8f3d3c3e-s3 -->

# LLD: E202610127e0ae92e:S003

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**HLD base run:** `wf-1791738717329-ylatwv`
**HLD effective hash:** `a20e4da9408d...`

S003 adds a reviewed seed corpus and a pure coverage gate for all ten design domains on Web, iOS and Android. Concrete positive/misuse specimens and reproducible evaluation evidence accompany the guidance. Human editorial decisions remain explicit and content-bound; generated drafts cannot become reviewed or bundled merely because validation passes.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-7e0ae92e8f3d3c3e** § 2. Framework summary

**Rollout phase:** C — Reviewed seed corpus
**Owns:** `sc4` (Coverage and editorial review evidence)
**Consumes:** `sc1` (Corpus record and pinned evidence identity), `sc2` (Release manifest and publication gate), `sc3` (File-level source eligibility and attribution)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own canonical schema, version/hash specification, publication validation interfaces and fixtures. This is the nearest ancestor for all shared identity/release contracts; storage and curator UI are not implied. — owns `sc1`, `sc2`
- `s2`: Own source adapters, local staging extraction, allowlist policy implementation and reproducible notices. Adapter specifics stay private; no unreviewed source contents enter published assets. — owns `sc3`
- `s4`: Own daemon package reader, catalog read adapter, deterministic filtering/ranking, local embedding cache, cursor implementation and thin MCP read tools. Keep ranking weights and cache format private and versioned. Basic validated bundled-package installation is included so retrieval is independently testable. Includes the single-sourced config-catalog entry, typed config exposure, settings/reconciliation verification and catalog contract-test update. Owns vscode-plugin/package.json setting mirror and verification of the unchanged catalog-driven JetBrains SettingsView.kt, validated by manifest/catalog parity and settings render/round-trip checks. Sole owner of catalog file layout, serialized atomic commit, receipts and recovery via sc7. Basic installation and maintenance use exactly this writer. — owns `sc5`, `sc7`
- `s5`: Own update staging, atomic publish/default switch, withdrawal overlays, recovery, release diffs and cross-release regression evaluation. Consume existing reader contracts; never change DI2 guideline state. Uses sc7 for all catalog/default/availability changes; owns upstream update policy and diff orchestration only, not a second writer or recovery implementation. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `CoverageReport`

```typescript
interface CoverageCell { domain: string; uiType: UiType; records: { recordId: string; recordVersion: string }[]; evaluationCases: string[]; status: 'pass' | 'gap'; reviewer: string; notes: string; }
interface CoverageReport { schemaVersion: 1; candidateContentDigest: string; cells: CoverageCell[]; crossPlatformCases: { id: string; status: 'pass' | 'fail'; evidence: string[] }[]; }
```

**Returns:** `CoverageReport` — Exact sc4 v1 envelope; one cell for each of the 30 domain/UI-type pairs, plus the mandatory cross-platform case set. Report claims require independent assessment.

**Errors:**
- `ValidationIssue[]` when Malformed, duplicate, missing, stale, unsupported or unreviewed evidence produces sorted existing sc2 issues.

**Preconditions:**
- Unknown input is snapshotted using bounded canonical JSON before strict closed-schema decode; no coercion/defaults/extra fields.
- Domain labels come from S001 CORPUS_DOMAINS and UI types from sc1. A nonempty computable candidateContentDigest is mandatory.
- Report creation does not authorize publication or editorial approval.

**Postconditions:**
- Exact HLD fields retained. Cells canonically sorted by domain order then UI type; record pairs/case IDs sorted, unique and resolved locally.
- Every pass cell references applicable reviewed record versions, at least one matching domain/platform evaluation and a matching explicit human editorial decision. Gaps remain gaps; zero or duplicate cells never count as coverage.
- crossPlatformCases has exactly the six required v1 IDs; every pass includes local case-result paths. No releaseId/self-reference in coverage.

### 2.2 `StageAssessment`

```typescript
interface StageAssessment { stage: 'eligibility' | 'coverage'; candidateContentDigest: string; passed: boolean; issues: ValidationIssue[]; }
```

**Returns:** `ValidationResult<StageAssessment>` — S003 produces stage='coverage' only, from an independently checked complete in-memory candidate and separately supplied reviewed editorial inputs.

**Errors:**
- `ValidationResult failure` when Invalid manifest or noncomputable candidate identity prevents constructing an assessment.
- `StageAssessment passed=false` when Computable candidate has invalid coverage, missing review, failed cases, stale references or unsafe specimens.

**Preconditions:**
- Consume S001 candidateContentDigest/validateRelease and S002 eligibility without changing their contracts.
- Coverage review inputs are maintainer-controlled, passed separately from package contents; packaged reviewer strings or pass booleans are not approval tokens.

**Postconditions:**
- Passing assessment binds the exact candidate and has no issues. Coverage assessment alone is insufficient: final preflight requires independent passing eligibility too.
- No persistence/catalog/default/retrieval/project-guideline mutation; no LLM invocation in pure validation.

### 2.3 `checkPublication`

```typescript
function checkPublication(candidate: unknown, assessments: unknown): PublicationCheck;
```

**Parameters:**
- `candidate: unknown` — Final complete sc2 package after coverage bytes and release seal exist.
- `assessments: unknown` — Exactly one fresh eligibility and one fresh coverage assessment from internal evaluators.

**Returns:** `PublicationCheck` — Unchanged S001 preflight result; a candidate can be handed to later installation/publication only when eligible.

**Errors:**
- `PublicationCheck.issues` when Any structure, review, digest or assessment failure keeps eligible=false.

**Preconditions:**
- S003 calls the existing function; it does not replace the gate or trust serialized assessments.

**Postconditions:**
- Successful preflight is not installation, publication or human approval.

## 3. Data model changes

### 3.1 `Coverage schemas and pure assessment modules` — new

Proposed new files src/design/corpus/coverage/{contracts,rubric,specimens,evaluate,assessment,finalize,index}.ts. Closed TypeBox/AJV schemas, detached JSON/byte snapshots, existing ValidationIssue codes and CORPUS_LIMITS (10,000 files; 64 MiB package; depth 64; 1 MiB record/specimen/case/decision file). Export pure decode/validate/assess/finalize operations through coverage/index.ts; implementation names are local design choices, not new HLD contracts. Inputs to the assessor are (candidate: unknown, reviewedEditorial: unknown); output ValidationResult<StageAssessment>. Finalization input is an S002 EligibilityCandidate, a proposed CoverageReport, exact coverage evidence files already in its inventory, and independently supplied EligibilityReview/editorial review inputs; result is ValidationResult<{candidate: ReleaseCandidate; eligibility: StageAssessment; coverage: StageAssessment; publication: PublicationCheck}>. No I/O imports in this entry.


### 3.2 `Versioned coverage rubric` — new

Internal immutable v1 rubric enumerates the exact ten imported domain labels and three UI types. 30 cells required; each pass references >=1 record whose domains and applicability include that pair, plus >=1 case result specifically targeting that pair. Every published record must appear in each applicable declared domain/UI pair, and all referenced records/versions must exist exactly once in candidate inventory. Rubric checks context/problem/tradeoffs, domain-specific payload, concrete positive/misuse examples, platform adaptations, claims/check limits, provenance, stereotype avoidance and semantic usefulness. One record may cover several cells only when its substantive guidance and specimens support each; counts alone never prove quality. Six mandatory cross-platform IDs: responsive-navigation, text-scaling-localization, input-focus-touch, semantic-color-modes, reduced-motion-state, consent-error-recovery. Their ordered definitions and digests live in code and are serialized into candidate case evidence; unknown/missing/duplicate IDs or definition digest mismatch fail.


### 3.3 `Declarative specimen v1` — new

Each specimen is bounded UTF-8 application/json with exact shape {schemaVersion:1,id:string,uiType:UiType,kind:'example'|'misuse',title:string,description:string,panels:{id:string,label:string,elements:{id:string,role:'text'|'control'|'group'|'status'|'swatch',label:string,state:'default'|'focus'|'disabled'|'loading'|'empty'|'error'|'selected'|'success',order:integer,unit:'px'|'pt'|'dp'|'sp'|'relative',value:number|null,foregroundRole:string|null,backgroundRole:string|null}[]}[],tokens:{name:string,value:string}[],annotations:string[]}. Nonempty panels/elements; IDs unique within document, integer order >=0, finite value >=0 when supplied, IDs/labels/text bounded; tokens refer to simple literal design values, never executable markup. No generic attribute bags, URLs, paths, code/CSS/HTML/event hooks or remote includes. Text is inert and escaped by any review renderer; no browser execution/rendering is required for validation. Examples must match record reference kind and UI type; layout priority/adaptation, palette roles/pairs, typography roles and control-state examples are mandatory in their relevant cells. Numeric platform units are explicit; descriptive specimens do not claim device-rendering fidelity or accessibility certification.


### 3.4 `Evaluation definitions and results` — new

Local files under evaluation/ with exact closed schemas. Definition {schemaVersion:1,id,kind:'cell'|'cross-platform',targets:{domain,uiType}[],recordRefs:{recordId,recordVersion}[],specimenPaths:string[],checks:{id,kind:'reference-integrity'|'example-misuse-pair'|'explicit-units'|'semantic-role-pairing'|'state-coverage'|'editorial',requirement:string}[]}. Result {schemaVersion:1,caseId,definitionDigest,subjectDigest,observations:{checkId,status:'pass'|'fail'|'needs-review',evidencePaths:string[],notes:string}[]}. subjectDigest = hashCanonical({definitionDigest, sorted exact recordId/recordVersion pairs, sorted specimen path/rawDigest pairs}); no candidate/review/final-release digest. Only closed deterministic checks are evaluated in code; editorial checks remain needs-review until supplied matching human decision. Recompute deterministic observations from bytes, never trust result.pass. Every referenced evidence path must be portable, inventoried, present, semantically the expected specimen/case-result role and digest-correct. Exactly one observation per definition check; reject unused/unknown/duplicate checks and extra stale results. Cross-platform definitions target all three UI types and have explicit platform-specific positive/misuse evidence, not one shared screenshot.


### 3.5 `Human editorial decision dossier` — new

Closed internal schema {schemaVersion:1,rubricVersion:'1',maintainer:string,decisions:{subjectKind:'record'|'cell'|'case',subjectId:string,subjectDigest:string,decision:'approve'|'reject',reviewer:string,reviewedAt:string,notes:string}[]}. Maintainer/reviewer/notes nonblank and exact UTC timestamps; no implicit clock. Record subjects use sc1 recordContentDigest plus sorted referenced specimen path/rawDigest pairs; cell subjects use domain/UI pair, exact referenced record versions, case definition/result raw digests and rubricVersion; case subjects use definition and specimen/record digests plus deterministic observations (no dossier/report/manifest self-digests). The packaged editorial/decisions.json must byte-canonically match a separately supplied, explicitly human-approved dossier. S001 record.review contentDigest remains recordVersion, reviewer/date must match its human record decision. Every cell/case editor must approve exact subject digest. Unknown subjects, missing approvals, rejected/stale/conflicting/duplicate decisions fail. Neither the agent, a generator, tests nor a code-review verdict can stamp human decisions. During build present the actual records, specimens, rubric/results and reviewer identity for explicit human editorial approval; never treat LLD/PLAN approval as seed-content approval. Machine-generated advice stays provenance.authorship='inferred' after review, with explicit author/rationale and S002 original/inferred lineage; imported/derived content retains exact upstream attribution. Review attestations are local trust inputs, not cryptographic identity proof.


### 3.6 `Seed content and authoring inventory` — new

Authoring drafts/roster/evaluation definitions/blank review checklist live under design/corpus-seed/v1/ (outside src/assets). Target all 30 cells with substantive foundation/pattern records plus at least three coherent style recipes expressing composition, typography, color, interaction, conditions and tradeoffs; names are discovery aids, never industry stereotypes. The initial roster specifies positive/misuse specimens for each applicable platform, including lightweight palette, typography, component-state and layout examples. Prefer independently written guidance and original specimens; agent-generated guidance is labelled inferred, not third-party authored. No existing OSS catalog is copied. Any imported excerpts/assets must pass S002 file-level policy, pinned identity and full lineage/notices; unverified rights or source sufficiency cannot fill a cell. Normative platform/numeric claims need current primary-source verification during authoring plus eligible attribution, or are scoped as nonnormative heuristics with explicit limits. Named human maintainer must review content before final release assets exist.


### 3.7 `Non-cyclic assembly and bundled handoff` — new

1 Author record content/specimens/definitions and deterministic observations; collect explicit human record/cell/case decisions against the precisely defined acyclic subjects. 2 Set reviewed record metadata from approved decisions; compute exact output bytes and complete S002 lineage for records, specimens, evaluation files and editorial dossier. No output may silently change authorship or escape lineage. 3 Call S002 prepareEligibilityCandidate with all noncoverage bytes and exactly one declared application/json coverage file entry with placeholder digest. 4 Compute candidateContentDigest; build exact sc4 report using approved cells/cases and that digest. 5 Serialize canonical coverage bytes, set its raw inventory digest, compute reviewContentDigest(report), then releaseContentDigest(manifest); no report/dossier/case file may depend on the final release ID. 6 Independently reassess eligibility on the final candidate; run S001 validateRelease plus S003 semantic coverage assessment and unchanged checkPublication. Any failure returns no eligible package. Only after actual human review and passing gates copy the final immutable package to proposed src/assets/design-corpus/releases/<releaseId>/ plus a versioned bundled descriptor {schemaVersion:1,releaseId,manifestPath}; this is checked-in distribution data, not daemon installation/catalog mutation. Separate local maintainer verification tooling may read package files, but pure entry remains I/O-free; it refuses symlink/path/bounds violations and executes no specimens. copy-assets.mjs already ships assets, so no draft content goes there. S004 consumes the final package/descriptor and owns installed catalog state; S005 owns publish/default/withdrawal lifecycle. If human editorial approval is absent, drafts/tests may be ready but S003 completion and bundled release remain withheld.

**Call sites:**
- `src/design/corpus/sources/__tests__/assessment-fixtures.ts:37`
- `src/design/corpus/sources/__tests__/acceptance.test.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reuse exact GuidanceRecord/UiType/Provenance and record identity/review semantics; validate every referenced version and specimen applicability. Generated/inferred authorship is never upgraded by editorial review. |
| `sc2` | consumes | Reuse bounded canonical hashing, manifest validation, ValidationResult/StageAssessment and checkPublication. Coverage finalization fills the one intentionally deferred coverage digest and review/release seals; never changes the approved digest projection. |
| `sc3` | consumes | Use S002 source eligibility, complete included-source closure, original/inferred/imported/derived lineage and deterministic notices for all distributed outputs, including S003 editorial/evaluation files. No new source adapter or eligibility policy implementation. |
| `sc4` | implements | Implement exact closed CoverageCell/Report plus strict 30-cell semantics, required cross-platform cases, safe specimens, independent evidence reconstruction and content-bound human editorial decisions. Supply stage='coverage' for later install/publication gates. |

## 6. Error paths

**Error cases**

- **Missing or duplicate coverage pair** (recoverable)
  - Detection: Build exact keys from CORPUS_DOMAINS × UiType and compare to decoded cells; duplicates cannot replace missing pairs.
  - Response: inventory.invalid; coverage passed=false; list missing/duplicate pairs.
  - User impact: The maintainer sees explicit gaps rather than a completeness claim.
- **Unsupported domain, platform or case definition** (recoverable)
  - Detection: Closed enum/schema validation and exact required case-ID/definitionDigest comparison.
  - Response: domain.invalid/schema.invalid/reference.missing; no passing assessment.
  - User impact: Correct the versioned coverage inputs.
- **Stale record/specimen/case/editorial evidence** (recoverable)
  - Detection: Resolve all record pairs and role-constrained paths against validated candidate bytes; recompute raw and canonical subject digests and compare reviewed dossier.
  - Response: review.stale/digest.mismatch/provenance.incomplete with exact evidence path.
  - User impact: Affected content needs fresh evaluation and explicit editorial review.
- **Self-approved, missing, rejected or conflicting human review** (recoverable)
  - Detection: Require a separately supplied trusted dossier to canonically equal the packaged dossier, exact subject set and approve decisions; compare reviewer/time with record.review and cell claims.
  - Response: review.required or review.stale; no automatic stamps or code-review substitution.
  - User impact: Candidate remains a draft until actual human decisions are supplied.
- **Failed or fabricated case pass** (recoverable)
  - Detection: Re-evaluate deterministic checks; exact observation set and subject digest required; human-only checks need matching explicit human decision; cross-platform case failure blocks coverage.
  - Response: assessment.failed; preserve original failed/needs-review evidence.
  - User impact: Evidence cannot be laundered through a pass label.
- **Unsafe specimen or external evidence** (recoverable)
  - Detection: Closed specimen schema, bounded parser, local path/role checks, finite numeric validation and no executable/remote fields; maintainer file reader rejects symlinks before reading.
  - Response: schema.invalid/path.invalid/limit.exceeded; never execute or fetch content.
  - User impact: Replace with safe declarative local evidence.
- **Malformed candidate or coverage membership** (recoverable)
  - Detection: S001 manifest decode and candidateContentDigest find zero/multiple matching coverage entries or other structural errors.
  - Response: ValidationResult failure when digest is not computable; no malformed StageAssessment.
  - User impact: Repair inventory before review/finalization.
- **Eligibility failure during finalization** (recoverable)
  - Detection: Re-run S002 assessment and S001 final validation; reject unused sources or changed lineage/notices like any other candidate.
  - Response: Return no eligible package; keep structured eligibility issues.
  - User impact: Source approval and coverage approval remain separate gates.
- **Generated authorship rewritten or draft shipped** (recoverable)
  - Detection: Compare exact authored provenance and trusted reviewed content; publication-mode record validation rejects drafts; release-handoff check scans bundled descriptor/files and requires reviewed seed.
  - Response: provenance.incomplete/review.required; packaging fails.
  - User impact: Inferred advice remains labelled inferred and unreviewed drafts cannot ship.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An original/inferred-only seed has no upstream sources. | Use S002 empty source inventory and explicit original/inferred output declarations; do not invent upstream attribution. Human review and coverage still required. |
| One record legitimately spans multiple domains/UI types. | It can count in each declared pair only with substantive applicable guidance, platform-matching example/misuse specimens, target-specific cases and human approval for each cell. |
| A subjective style preference has no universal numerical pass threshold. | Use explicit heuristic/preference classification and check limits or noMeasurableChecksRationale; deterministic integrity checks plus human review decide coverage, without inventing certification. |
| A reviewed inferred suggestion passes every check. | It remains inferred with author/rationale visible, never relabelled imported or source-authored. |
| Equivalent inventory/report ordering or shared evidence paths. | Canonical deterministic ordering and deliberate reference deduplication preserve identities; duplicate cell/record/decision identities are rejected. |
| Human editorial review is not yet available. | Persist draft authoring/review material outside shipped assets; tests can use explicitly synthetic decisions, but production release handoff and S003 completion remain pending. |

**Invariants to preserve**

- Preserve exact sc1/sc2 identities, corrected candidate digest exclusions and independent eligibility/coverage gates. [[c1]]
- S002 remains sole source-eligibility/lineage/notices owner; S004/S005 remain installation/publication/catalog owners. [[c2]]
- Human editorial review and inferred-authorship preservation are required independently of automated validation. [[c3]]

## 7. Test strategy

**Test framework:** `Existing scoped src/design/corpus/**/__tests__/*.test.ts use node:test and node:assert/strict with tsx under supported Node 22; direct source fallback establishes this because the requested analyzer/test.locate run returned no usable bundle. Follow those test files, with strict TypeScript build and fresh-compiled I/O isolation; no test-framework change.`

**Test levels**

- **contract** — Closed schemas and exact sc4 shape.
  - Subjects: `coverage-schema preserves sc4 and rejects malformed duplicate or unsupported inputs`
  - Fixtures: `Valid 30-cell report; unknown fields; coercion attempts; getters/proxies; bound violations.`
- **unit** — Matrix and precise evidence/approval semantics.
  - Subjects: `coverage-matrix rejects missing gap duplicate or inapplicable domain-platform cells`, `evaluation-binding rejects stale definitions records specimens and fabricated results`, `editorial-binding requires explicit matching human decisions and preserves inferred authorship`, `specimen-safety rejects executable remote malformed and unbounded content`, `coverage-determinism preserves canonical identities and stable diagnostics`
  - Fixtures: `Thirty-cell positive fixture; six cross-platform cases with platform-specific specimens; synthetic named human decisions clearly labelled test-only; focused mutation table.`
- **integration** — Actual composed candidate and digest lifecycle.
  - Subjects: `candidate-coverage finalizes without hash cycles and rejects stale assessments`, `candidate-coverage withholds draft rejected or relabelled inferred guidance`, `seed-coverage proves all domain-platform cells and mandatory cross-platform cases`
  - Fixtures: `S001/S002 candidate composition; original/inferred and eligible-derived variants; exact record/specimen/evidence mutations; reviewed actual seed dossier after explicit human approval.`
- **smoke** — Pure boundaries and shipped package evidence.
  - Subjects: `coverage-isolation compiles pure modules and assesses candidates with I/O forbidden`, `seed-bundle ships only reviewed eligible immutable content with complete notices`, `strict-build compiles coverage and passes the full corpus regression suite`
  - Fixtures: `Fresh compiled pure module harness matching existing isolation tests; separate local file reader; built out/assets package compared byte-for-byte with reviewed source; durable corpus TAP/build logs.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `coverage-matrix rejects missing gap duplicate or inapplicable domain-platform cells`, `evaluation-binding rejects stale definitions records specimens and fabricated results`, `seed-coverage proves all domain-platform cells and mandatory cross-platform cases`, `seed-bundle ships only reviewed eligible immutable content with complete notices` |
| `ac2` | `editorial-binding requires explicit matching human decisions and preserves inferred authorship`, `candidate-coverage withholds draft rejected or relabelled inferred guidance`, `candidate-coverage finalizes without hash cycles and rejects stale assessments` |

## 8. Alternatives considered

### 8.1 a1: Flat sc4 report with curated case sidecars — **CHOSEN**

Keep sc4 unchanged and resolve typed evaluation/editorial evidence from candidate-bound local files.

CoverageReport remains the HLD envelope. A fixed versioned rubric, local declarative specimens, per-case results and explicit human editorial decisions supply evidence. A pure validator reconstructs 30 domain/platform cells and mandatory cross-platform cases, then returns a digest-bound coverage StageAssessment. A separate deterministic candidate finalizer composes S001/S002 and never installs/publishes.

### 8.2 a2: Authoring dossier compiled to sc4

A richer internal authoring document produces records, cases and sc4 evidence.

A structured authoring dossier owns proposed records, platform adaptations and human review decisions; a compiler expands it into unchanged GuidanceRecords, declarative specimens and CoverageReport. The same pure validator independently checks generated candidate evidence against the dossier and approved rubric.

**Rejected because:** Useful later for scale; extra authoring compiler not necessary for seed acceptance.

### 8.3 a3: Separate platform dossiers with a release matrix

Author three platform-specific seed dossiers and merge their reviewed cells into sc4.

Each platform dossier independently identifies reviewed records/examples/evaluation evidence for ten domains. Release assembly combines them into the unchanged sc4 report and checks cross-platform cases across the dossiers. Sc1/sc2/sc3 continue to own identities, eligibility and release preflight.

**Rejected because:** Platform clarity is useful but duplicated foundations increase reconciliation work.

## 9. References

- **[[c1]]** `doc` `docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/HLD.md:42` — "Digest dependency order (normative)"
- **[[c2]]** `prior-artifact` `docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S002/LLD.md`
- **[[c3]]** `doc` `docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/HLD.md:48` — "human editorial review assesses quality of every passing cell"
- **[[c4]]** `code` `src/design/corpus/contracts.ts:8`
- **[[c5]]** `code` `src/design/corpus/validate.ts:274`
- **[[c6]]** `code` `src/design/corpus/sources/__tests__/assessment-fixtures.ts:37`
- **[[c7]]** `doc` `docs/plans/design-intelligence-prd.md:80`
- **[[c8]]** `doc` `docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md:94`
- **[[c9]]** `code` `copy-assets.mjs:28`
- **[[c10]]** `stakeholder` `Conversation: include lightweight palette, typography, component-state and layout examples; project-level guideline sets per Web/iOS/Android, not per-page design.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-12T06:40:55.215Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
