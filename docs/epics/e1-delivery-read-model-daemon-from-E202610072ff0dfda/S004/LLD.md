<!-- insrc:artifact LLD-2ff0dfdadb1c8d1c-s4 -->

# LLD: E202610082ff0dfda:S004

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**HLD base run:** `wf-1791360301609-41fijn`
**HLD effective hash:** `215b5fd4f60f...`

This Story adds the currency pass to the delivery read model. For every record that carries a review it says whether the review is known to still match the record (current or stale) and names the recorded field that settled it, or reports unknown; it never reads file times. It lists each epic's amendments with their status and whether they count toward the effective HLD, and raises the data-quality notices: reviews of unknown currency, extensions newer than their epic framing, items no record gives a title, and store files that could not be read, naming the coverage they leave unknown. It never adds or removes work items.

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

> See **HLD-2ff0dfdadb1c8d1c** § 2. Framework summary

**Rollout phase:** Phase B — stage, gate and currency passes
**Owns:** `sc6` (CurrencyAnnotation)
**Consumes:** `sc1` (ArtifactRecordSet), `sc2` (WorkItemGraph), `sc3` (DeliveryNotice)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: how the store directory is listed and each file parsed; how a record's kind, work-item hash and raw story id are lifted from its file name and meta; the use of the canonical ordinal rule to join s1/S1/S001 and the decision of when two records are ambiguous rather than the same; sourcing story membership from the Define's story list and from accepted extension records; attaching fix stories to an issue through the shared work-item hash and resolving meta.parentRef; nesting tasks by plan and build task ids; and the sort order of records, failures and child lists. No other story reads the files or re-derives identity. Also private: the per-kind lift, including reading flat amendment records; the anchor-date rule for minting canonical ids after grouping by hash and ordinal, which must reproduce deriveWorkItemIdentity and the existing path-scheme folder for every work item those can identify; attaching each SPEC to the item that names it in meta.seededFromSpec; resolving a slug-only parentRef through records' meta.epicSlug. Its LLD maps each of s1 ac1-ac6 to a named test, including ac3 (an ambiguity notice naming the other record), ac4 (two fix stories under one issue) and ac6 (colliding short task ids in two stories). Task items are minted only from t<n> build and plan task ids; a build task id equal to the story's id is left for s3 as a story-level result, with a fixture of that shape. Slug resolution of an issue's parentRef excludes records sharing the issue's own hash; a parentRef that names only the issue itself yields no corrected parent and no notice. Fixtures cover both real shapes: a self-slug parentRef (for example ISSUE-0855311b6b32eb72) and an outward slug (for example ISSUE-2d9e9e694a94116b). — owns `sc1`, `sc2`, `sc3`
- `s2`: Private to s2: the mapping from a work item's recorded route fields to a DeliveryRoute, read in this order of precedence: ISSUE meta.magnitude for an issue and for every fix story whose work-item hash is that issue's hash (small-bugfix or sized-bugfix, ahead of any BUILD stamp such as 'trivial'); the story's LLD meta.sizeClass; the standalone BUILD record's meta.sizeClass (the only place a trivial route is recorded); and, for a story under a non-standalone epic with none of these, the full chain; including treating any value that is not a SizeClass member (such as a scope letter 'M') or a missing stamp as unknown; a non-standalone BUILD's sizeClass is never read; the first-match-wins precedence that picks the stage; which gate counts as the ready gate for each route; and the wording of stage reasons. It reads approval state only through sc1 and never consults gate or currency annotations. Its LLD maps each of s2 ac1-ac7 to a named test over fabricated records. — owns `sc4`
- `s3`: Private to s3: reading each artifact's recorded review per kind (meta.review for design artifacts; body.verdict, body.counts and meta.reviewedBy for code-review records) and its recorded override; deciding when a block is still blocking, by reusing effectiveReviewVerdict over meta.review and meta.reviewResolutions and then requiring the artifact to be unapproved with no meta.reviewOverride; reading build task results from body.tasks[].passed and matching them to planned tasks; detecting the approved-with-failed-tasks conflict; and the attention rule itself, including the confirmed policy that a pending artifact stops counting once a downstream gate on the same work item is approved. It never changes a stage. Its LLD maps each of s3 ac1-ac7 to a named test, including ac7 against the confirmed attention policy. A build task recorded under the story's own id is the story-level result, never an unplanned task. A failed story-level result on an approved build raises the validation conflict and the validation-failed reason exactly as a failed task does; s3's LLD tests this with the shape of BUILD-0855311b6b32eb72-S001. — owns `sc5`
- `s5`: Private to s5: running the load, graph and three annotation passes in order for one request; joining annotations onto items; deciding needsAttention as any sc5 attention reason or any notice with attention true; computing counts over the full item set; the deterministic sort of items and notices; choosing openWith from whether an artifact's markdown carries its marker; the two daemon handler-map entries and their repo resolution and error mapping; the artifact-id validation that keeps evidence reads inside the artifact store; and the 1,000-artifact performance fixture. Also private: the error-path mapping (absent store is an empty snapshot; unreadable store, invalid or unknown evidence id is { error }). Also private: the determinism test (two snapshots over the same fixture are identical) and the regression check that the existing workflow.pending and workflow.artifactContent tests pass unchanged. Its LLD maps each of s5 ac1-ac6 to a named test: ac1 asserts the store is byte-identical after a request, ac3 reads a marker-less BUILD through workflow.deliveryEvidence, and ac6 is a type-level check that the VS Code plugin compiles against the published types plus a fixture the JetBrains mirror parses. Also private: the one route-dependent completeness check, raising an 'incomplete-evidence' notice for a story whose sc4 route requires a plan (full-chain, feature, sized-bugfix) but which has a build and no plan; small and small-bugfix routes never get it. Its LLD also owns the test for the build-without-plan half of s4 ac4: a full-chain story with a build and no plan gets the incomplete-evidence notice, and small and small-bugfix stories with a build and no plan do not. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `CurrencyPassResult (deriveCurrency)`

```typescript
export function deriveCurrency(graph: WorkItemGraph, recordSet: ArtifactRecordSet): CurrencyPassResult
```

**Parameters:**
- `graph: WorkItemGraph` — The s1 graph: items, their evidence, kinds, titles and work-item hashes.
- `recordSet: ArtifactRecordSet` — The s1 record set, including its load failures.

**Returns:** `CurrencyPassResult` — artifacts: one ArtifactCurrency per record, keyed by artifactId. amendments: the EffectiveAmendment list of every epic item that has AMD records, keyed by the epic's item id and sorted by amendmentId. notices: review-currency-unknown, base-predates-extension and incomplete-evidence, sorted with sortNotices; never record-unreadable, which is the graph builder's (s1).

**Preconditions:**
- graph was built from recordSet.
- The graph builder raises record-unreadable for each load failure, as the approved s1 LLD requires; the built graph.ts does not yet, and that gap is tracked as ISSUE-34b6a247a4828d49 (a small bugfix that must land before this Story's build, so a malformed file is surfaced with attention true).

**Postconditions:**
- Never throws: a missing record, a malformed field or an unparseable id yields reviewCurrency 'unknown', no amendment entry or no notice.
- Pure and deterministic; performs no I/O, reads no stage (sc4) or gate (sc5) annotation, and adds or removes no work item.

### 2.2 `ArtifactCurrency`

```typescript
interface ArtifactCurrency { readonly artifactId: string; readonly reviewCurrency: ReviewCurrency | null; readonly basis: string | null }
```

**Returns:** `ArtifactCurrency` — reviewCurrency is null when the record carries no review: a design record whose meta.review is not an object with a pass/warn/block verdict, a CR whose body.verdict is not one, and every BUILD and AMD. Otherwise the first rule that applies: (1) stale when meta.review.reviewedAt is a string earlier than the record's createdAt (the review predates the record); (2) an LLD that is the only LLD on its story, is not standalone, whose epic's HLD record is in the set with a string meta.runId and whose meta.hldEffectiveHash is a string: current when meta.hldEffectiveHash equals computeHldEffectiveHash(the HLD's meta.runId, the ids of the epic's AMDs with appliesToHld true, in the scanner's order: numeric id suffix, then a stable sort by rising approvedAt), else stale with basis naming 'hld-rerun' (meta.hldBaseRunId differs from the HLD's runId), or the first counted amendment missing from meta.hldAmendmentsApplied, or, when the run id matches and every counted amendment is listed (amendments applied in another order, a malformed list, an edited hash), that meta.hldEffectiveHash differs from the recomputed hash with no amendment identified, as scanLldStaleness's 'unknown' reason; a stale LLD with meta.staleAckedAt is still stale and its basis adds the acknowledgement; (3) a PLAN that is the only PLAN on its story and whose story has exactly one LLD in its evidence: current when meta.lldRunId equals that LLD's meta.runId and meta.lldEffectiveHash equals its meta.hldEffectiveHash, else stale naming the differing field; (4) otherwise unknown with basis null. A CR always reads unknown: it records no commit or content stamp, and a BUILD's updatedAt and changeLog timestamps are rewritten when the BUILD is approved (standalone-record.ts), which is after its gating code review, so no recorded field shows that a build changed after its review. basis always names the recorded fields compared, never a file time. Which record applies where several could: the store keeps one file per kind per work item (KIND-<hash>[-<story>].json, rewritten in place on a re-run), so the file is the applicable revision and currency reports whether its review still matches; several LLD or PLAN records on one story occur only when two story-id spellings coexist (s1 and S001, none in the live store), and then none of them is compared, each reads unknown, and the item's review-currency-unknown notice says that several records of that kind are present and which applies is not recorded.

**Postconditions:**
- The recorded review itself is never altered or re-read here; its verdict and reviewedAt are reported by sc5.

### 2.3 `EffectiveAmendment`

```typescript
interface EffectiveAmendment { readonly amendmentId: string; readonly status: 'pending' | 'approved' | 'rejected'; readonly type: string | null; readonly storyId: string | null; readonly appliesToHld: boolean }
```

**Returns:** `EffectiveAmendment` — One per AMD record whose workItemHash names an epic item in the graph. status = ArtifactRecord.approval.state; type and storyId = the amendment body's type and storyId when strings, else null; appliesToHld = the record passes isAmendmentRecord (amendments/types.ts, applied to its meta with the amendment body put back) AND meta.status is 'approved' AND meta.approvedAt is a string: exactly the set listApprovedAmendments counts (sc1's approval.state alone is not used, since it also reads 'approved' from approvedAt without the status). The list is sorted by amendmentId for presentation; the staleness hash in ArtifactCurrency uses the approvedAt order.

**Postconditions:**
- An AMD whose hash names no epic item gets no entry and raises no notice here (s1 reports the unresolved epic).

### 2.4 `ReviewCurrency`

```typescript
type ReviewCurrency = 'current' | 'stale' | 'unknown'
```

**Returns:** `ReviewCurrency` — current and stale only where a recorded field establishes it; unknown otherwise.

### 2.5 `DeliveryNotice (currency-pass notices)`

```typescript
makeNotice('review-currency-unknown' | 'base-predates-extension' | 'incomplete-evidence', message, { itemIds, artifactIds, fileNames })
```

**Returns:** `DeliveryNotice` — review-currency-unknown: one per epic, story or issue holding records of unknown review currency, naming them (and, where several LLD or PLAN records sit on one story, saying so), plus one store-level notice for such records held by no item (attention false). base-predates-extension: one per approved EXT whose added story (body.addedStory.id, else meta.storyId, compared by story ordinal) is not in its epic DEF's body.stories, naming the EXT, the DEF, the epic and the added story (attention false). The extend path appends the added story to the DEF when the EXT is accepted (gates.ts appendStoryToDefine) and keeps the DEF's createdAt, so a real EXT is always newer than its DEF while the DEF already lists the story: createdAt alone never raises the notice, and an EXT whose story the DEF lists raises none; the added story is already in the graph and is never removed. incomplete-evidence (attention false), two kinds: one per epic, story or issue whose title is null, naming the item and its evidence; and one per sc1 load failure, with the file name in fileNames, the failure reason and detail in the message, and the coverage it leaves unknown: the kind, work-item hash and story id its file name implies, and itemIds the graph items with that hash (and story ordinal when the name carries one), store-level when none match. The record-unreadable notice for the same failure is s1's (its approved LLD has the graph builder raise one per RecordLoadFailure; the built gap is ISSUE-34b6a247a4828d49); s4 never raises that code, so the two never duplicate.

## 3. Data model changes

### 3.1 `ReviewCurrency, ArtifactCurrency, EffectiveAmendment, CurrencyPassResult` — new

The sc6 types, added to src/workflow/delivery/types.ts beside sc1-sc5, as sketched in the HLD.

**Call sites:**
- `src/workflow/delivery/types.ts`

### 3.2 `deriveCurrency` — new

New module src/workflow/delivery/currency.ts. It imports the pure computeHldEffectiveHash from src/workflow/artifacts/lld.ts and the pure isAmendmentRecord from src/workflow/amendments/types.ts, asObject / asString / storyOrdinalOf from read.ts, kindOfFile from load.ts (to read a failed file's kind exactly as the loader does when naming the coverage a load failure leaves unknown) and makeNotice / sortNotices from notice.ts. It never calls the amendments module's disk-reading listers or scanLldStaleness. No caller yet (s5 will call it).


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | Defines the sc6 types and produces CurrencyPassResult. |
| `sc1` | consumes | Reads records' kind, workItemHash, storyOrdinal, approval, createdAt, meta (review, hldEffectiveHash, hldBaseRunId, hldAmendmentsApplied, staleAckedAt, lldRunId, lldEffectiveHash, runId, updatedAt, standalone) and body, and the load failures. |
| `sc2` | consumes | Uses item kind, title, workItemHash, sourceIds, parentId and evidenceArtifactIds; adds no items. |
| `sc3` | consumes | Raises review-currency-unknown, base-predates-extension and incomplete-evidence through makeNotice; consumes s1's record-unreadable notice and never raises it. |

## 5. Error paths

**Error cases**

- **A field the currency rules compare is missing or of the wrong type (meta.review not an object, reviewedAt or createdAt not a string, hldEffectiveHash / lldRunId / lldEffectiveHash / runId / updatedAt not a string, hldAmendmentsApplied not an array).** (recoverable)
  - Detection: asObject / asString checks and Array.isArray on each field before it is compared.
  - Response: The rule that needed the field does not apply; the next rule is tried, ending in 'unknown' with basis null. A non-array hldAmendmentsApplied counts as empty when naming the missing amendment.
  - User impact: The review reads unknown instead of a guessed current or stale; nothing throws.
- **An amendment record is malformed (body not an object, type or storyId not a string, approvedAt missing on an approved record).** (recoverable)
  - Detection: isAmendmentRecord over the record's meta with the amendment body put back, asObject on the body and asString on each field.
  - Response: type / storyId read null; a record that fails isAmendmentRecord, or whose meta.status is not 'approved', or has no string approvedAt, has appliesToHld false and is left out of the staleness hash, exactly as listAmendments / listApprovedAmendments leave it out.
  - User impact: The amendment is still listed with what was recorded; the snapshot never fails on it.
- **A load failure's file name does not follow KIND-<hash>[-<story>].json.** (recoverable)
  - Detection: kindOfFile returns null or the name does not match the stem pattern.
  - Response: The incomplete-evidence notice for the failure is still raised with the file name, reason and detail, and its coverage is reported as unknown (store-level, no itemIds).
  - User impact: The bad file is named even when its coverage cannot be told.
- **An evidence id names no record, or an item kind is unexpected.** (recoverable)
  - Detection: Index lookup returns undefined; the kind is checked against epic / story / issue.
  - Response: The id or item is skipped.
  - User impact: None beyond s1's own report.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An LLD whose stored hldEffectiveHash equals the hash of its epic's HLD runId and approved amendments. | current, basis naming hldEffectiveHash against the HLD run and the counted amendment ids. |
| An LLD under an HLD that was re-run (meta.hldBaseRunId differs from the HLD's runId). | stale, basis 'hld-rerun'. |
| An LLD whose epic approved an amendment after the LLD was written. | stale, basis naming that amendment id; two approved amendments are hashed in rising approvedAt order, not amendmentId order. |
| A stale LLD with meta.staleAckedAt. | Still stale; basis also names the acknowledgement. |
| A standalone LLD, or an LLD whose epic has no HLD record. | unknown, basis null. |
| A review whose reviewedAt is earlier than its record's createdAt. | stale, basis naming reviewedAt and createdAt. |
| A PLAN whose lldRunId and lldEffectiveHash match its story's LLD; and one whose lldRunId differs. | current; stale naming lldRunId. |
| A PLAN on a story with no LLD, or two. | unknown. |
| A CR whose story's BUILD was approved after the review (updatedAt and changeLog timestamps later than the CR's createdAt), as in BUILD-2ff0dfdadb1c8d1c-s3. | unknown, never stale. |
| A DEF, HLD, SPEC, ISSUE or EXT with a review. | unknown, and a review-currency-unknown notice on the item that holds it. |
| A BUILD, an AMD, or a record with no review. | reviewCurrency null; no notice. |
| An epic whose DEF lists only s1 (an older framing written before the extend path appended stories) and an approved EXT adding s9. | The s9 story item is in the graph and untouched; one base-predates-extension notice naming the EXT, the DEF, the epic and the s9 item. |
| An EXT that is not approved. | No base-predates-extension notice. |
| A story whose title no record gives. | One incomplete-evidence notice naming the story and its evidence; the item stays in the graph. |
| One invalid-json file 'LLD-<hash>-s2.json' among valid records of the same epic. | All other items present; one incomplete-evidence notice (attention false) from this pass with the file name, reason and detail, naming kind LLD, the hash, story s2 and the s2 story item; plus, from the graph builder once ISSUE-34b6a247a4828d49 is fixed, one record-unreadable notice (attention true) naming the file; never two record-unreadable notices. |
| An epic with three AMDs: approved, pending, rejected. | Three entries sorted by amendmentId; appliesToHld true only for the approved one. |
| An AMD with status 'approved' and an approvedAt but missing rationale or citations (fails isAmendmentRecord). | Listed with appliesToHld false; left out of the staleness hash. |
| Two approved AMDs with the same approvedAt, ids AMD-<h>-10 and AMD-<h>-2. | Hashed in the order AMD-<h>-2, AMD-<h>-10 (numeric suffix), as the scanner does; listed in amendmentId order. |
| An LLD whose hldBaseRunId matches the HLD and whose hldAmendmentsApplied lists every counted amendment, but whose hldEffectiveHash differs from the recomputed hash. | stale, basis naming hldEffectiveHash against the recomputed hash, no amendment named. |
| A story holding LLD-<h>-s1 and LLD-<h>-S001 and a PLAN. | Both LLDs and the PLAN read unknown; the story's review-currency-unknown notice says several LLD records are present and which applies is not recorded. |
| The real shape: DEF-b9d5c5c40df5a574 (created 2026-10-06) lists s8, and the approved EXT-b9d5c5c40df5a574-s8 was created 2026-10-08. | The s8 story is in the graph; no base-predates-extension notice, because the DEF lists the story. |

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test` (node:assert/strict), over fabricated records from src/workflow/delivery/__tests__/fixtures.ts`

**Test levels**

- **unit** — Review currency and amendments.
  - Subjects: `currency.test.ts: 'a review is current or stale only where a recorded field settles it, and unknown otherwise'`, `currency.test.ts: 'amendments are hashed in approvedAt order and listed in amendmentId order with their status'`, `currency.test.ts: 'a review stamped before its record, a standalone design and malformed fields never throw and invent no currency'`
- **unit** — Extension and missing-field notices.
  - Subjects: `currency.test.ts: 'an extension story stays in the view and its extension newer than the epic framing is reported'`, `currency.test.ts: 'an item no record gives a title stays in the view with an incomplete-evidence notice'`, `currency.test.ts: 'the real-shape fixtures give every record a currency entry, deterministically'`
- **integration** — Load, graph and currency pass together, over a store.
  - Subjects: `currency.test.ts: 'a malformed file leaves every other item in place and is named with the coverage it leaves unknown'`, `currency.test.ts: 'producing the currency annotation changes no file in the artifact store'`
  - Fixtures: `A ReadonlyStoreFs stub holding valid records plus one invalid-json file (as load.test.ts does); the test asserts this pass's incomplete-evidence notice and, after ISSUE-34b6a247a4828d49, exactly one record-unreadable notice from the graph.`, `A temporary directory with real store files, including one invalid-json file and an ambiguous identity pair (LLD-<h>-s1.json and LLD-<h>-S001.json), whose bytes and mtimes are compared before and after loadArtifactRecordSet, buildWorkItemGraph and deriveCurrency.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `currency.test.ts: 'a review is current or stale only where a recorded field settles it, and unknown otherwise'`, `currency.test.ts: 'amendments are hashed in approvedAt order and listed in amendmentId order with their status'`, `currency.test.ts: 'a review stamped before its record, a standalone design and malformed fields never throw and invent no currency'` |
| `ac2` | `currency.test.ts: 'an extension story stays in the view and its extension newer than the epic framing is reported'` |
| `ac3` | `currency.test.ts: 'a malformed file leaves every other item in place and is named with the coverage it leaves unknown'` |
| `ac4` | `currency.test.ts: 'an item no record gives a title stays in the view with an incomplete-evidence notice'` |
| `ac5` | `currency.test.ts: 'producing the currency annotation changes no file in the artifact store'` |

## 7. Alternatives considered

### 7.1 a1: Recorded-basis currency pass over the record set — **CHOSEN**

A pure deriveCurrency(graph, recordSet) decides each review's currency by kind-specific recorded fields only, derives each epic's amendments, and raises the data-quality notices.

A new src/workflow/delivery/currency.ts exports deriveCurrency(graph, recordSet): CurrencyPassResult, with the sc6 types in types.ts. Review currency per record, first rule that applies: no review, null; a review stamped before the record was created (reviewedAt earlier than createdAt), stale; an LLD under a non-standalone epic whose HLD is in the record set: stale when meta.hldEffectiveHash differs from computeHldEffectiveHash(HLD runId, the epic's approved AMD ids in rising approvedAt order), with basis naming hld-rerun or the first missing amendment, else current; a PLAN whose story LLD is in the set: stale when meta.lldRunId or meta.lldEffectiveHash differs from that LLD's runId / hldEffectiveHash, else current; otherwise unknown (including every CR, which records no content stamp). Amendments per epic item from the AMD records (status, type and storyId from the amendment body; appliesToHld for the records listApprovedAmendments counts), sorted by amendmentId. Notices: review-currency-unknown per item listing its unknown-currency artifacts; base-predates-extension per approved EXT whose story its epic's DEF does not list; incomplete-evidence per epic, story or issue with no title; incomplete-evidence per sc1 load failure, naming the file and the kind, hash and story its name implies (the record-unreadable notice itself is s1's).

### 7.2 a2: Timestamp currency

Call a review current when it was stamped after the record's createdAt / updatedAt, stale otherwise.

Compare meta.review.reviewedAt with meta.createdAt (and meta.updatedAt where present) for every kind; current when the review is newer.

**Rejected because:** Violates ac1 and k6.

### 7.3 a3: Delegate to the amendments module

Call scanLldStaleness and listApprovedAmendments directly for LLD currency and amendment lists.

For each epic, call the existing disk-reading scanner and lister and map their results into sc6.

**Rejected because:** Violates the one-read sc1 contract and the boundary.

## 8. References

- **[[c1]]** `code` `src/workflow/artifacts/lld.ts` — "export function computeHldEffectiveHash("
- **[[c2]]** `code` `src/workflow/amendments/staleness.ts` — "export function scanLldStaleness("
- **[[c3]]** `code` `src/workflow/amendments/store.ts` — ".sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));"
- **[[c4]]** `code` `src/workflow/delivery/load.ts` — "export function kindOfFile(fileName: string): DeliveryArtifactKind | null {"
- **[[c5]]** `analyze-bundle` `design.story/s1 data-model.trace: recorded fields that bear on review currency in the live store`
- **[[c6]]** `prior-artifact` `HLD-2ff0dfdadb1c8d1c sc6 CurrencyAnnotation and the s4 story boundary`
- **[[c7]]** `code` `src/workflow/amendments/types.ts` — "export function isAmendmentRecord(v: unknown): v is AmendmentRecord {"
- **[[c8]]** `code` `src/workflow/runners/build/standalone-record.ts` — "refreshes `updatedAt`"
- **[[c9]]** `prior-artifact` `LLD-2ff0dfdadb1c8d1c-s1 error paths: the graph builder raises one 'record-unreadable' notice per RecordLoadFailure`
- **[[c10]]** `prior-artifact` `ISSUE-34b6a247a4828d49: the graph builder never raises record-unreadable`
- **[[c11]]** `code` `src/workflow/gates.ts` — "appendStoryToDefine"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T14:52:20.877Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
