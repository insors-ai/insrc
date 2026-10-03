<!-- insrc:artifact LLD-e20235c17f083a16-S001 -->

# LLD: E20261003e20235c1:S001

## Summary

**Epic:** `make-work-item-keep-exactly-one`
**HLD base run:** `wf-1791005831675-z8l0bd`
**HLD effective hash:** `ac8308537a4b...`

A work item's docs folder is named from two things: a human-readable label and a stable identity segment. Today each workflow stage works those out for itself, so one work item can end up with several folders — the live bugfix epic has four, one artifact in each. This Story makes the work item's definition artifact (its DEF, or its ISSUE for a bugfix) the single place those properties are decided, and has every later stage inherit them instead of recomputing. The mechanism is not new: the folder's anchor timestamp is already carried down exactly this way, so the change extends an existing pattern to the two properties that were left out, and fixes the one reader that recognises a DEF but not an equivalent ISSUE.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `readArtifactCore`

```typescript
function readArtifactCore(repoPath: string, artifactId: string): { createdAt?: string; epicSlug?: string; standalone?: boolean }
```

**Parameters:**
- `repoPath: string` — Repo root whose hash-flat .insrc/artifacts store is read.
- `artifactId: string` — Canonical artifact id, e.g. the output of defineArtifactId or issueArtifactId.

**Returns:** `{ createdAt?: string; epicSlug?: string; standalone?: boolean }` — The epic-level properties present on that artifact's meta. Unchanged best-effort contract: an absent or unreadable artifact still yields {}, and each field is independently optional.

**Errors:**
- `none` when Never throws. A missing file short-circuits to {}; a parse failure is caught and also yields {}. This is relied on by the DEF-then-ISSUE fallthrough, which treats an unreadable DEF the same as an absent one.

**Preconditions:**
- None. repoPath need not exist.

**Postconditions:**
- FIELD-ADD ONLY: `standalone` is now reported alongside the two fields already returned, read as a boolean and omitted when the meta value is not a boolean.
- No existing caller's behaviour changes, because the two pre-existing fields are untouched and the new field is additive and optional.

### 2.2 `readEpicDefinitionCore`

```typescript
function readEpicDefinitionCore(repoPath: string, epicHash: string): { createdAt?: string; epicSlug?: string; standalone?: boolean }
```

**Parameters:**
- `repoPath: string` — Repo root whose artifacts store is read.
- `epicHash: string` — The work item's hash. Named epicHash to match every existing caller; for a bugfix work item this is the ISSUE's own issueHash.

**Returns:** `{ createdAt?: string; epicSlug?: string; standalone?: boolean }` — The work item's epic-level properties, taken from its definition artifact. Returns {} when neither a DEF nor an ISSUE is readable, so callers keep their existing fallbacks.

**Errors:**
- `none` when Never throws, inheriting readArtifactCore's best-effort contract.

**Preconditions:**
- None.

**Postconditions:**
- NEW, and the single place the DEF-equals-ISSUE equivalence is expressed for folder placement. Composed entirely from existing pieces: it calls readArtifactCore with defineArtifactId(epicHash) and then, only if that yields no usable values, with issueArtifactId(epicHash).
- Order is DEF first, ISSUE second, copied from the identical order already used by the tracker resolver's readEpicIdentity so the two cannot disagree about which artifact defines a work item.
- First-READABLE-wins, not first-PRESENT-wins: because readArtifactCore swallows a parse failure into {}, a corrupt DEF falls through to the ISSUE rather than poisoning the result.

### 2.3 `readEpicCreatedAt`

```typescript
function readEpicCreatedAt(repoPath: string, epicHash: string): string | undefined
```

**Parameters:**
- `repoPath: string` — Repo root whose artifacts store is read.
- `epicHash: string` — The work item's hash.

**Returns:** `string | undefined` — The work item's folder anchor timestamp. Unchanged signature and unchanged meaning.

**Errors:**
- `none` when Never throws; unchanged.

**Preconditions:**
- None.

**Postconditions:**
- RESHAPED BODY, IDENTICAL SIGNATURE: resolves through readEpicDefinitionCore instead of reading defineArtifactId alone, so an ISSUE-anchored work item now yields its real anchor rather than undefined.
- This is the fix for the latent identity-segment drift. Its four callers (orchestrator.ts:1325, :1787, :2144, :2548) each apply `?? nowISO`, so today a bugfix work item silently anchors each stage to that stage's own clock; because deriveWorkItemIdentity builds epicSegment from the DATE only, stages spanning midnight fork the folder on the supposedly stable identity.
- Its doc comment's stated rule is preserved: still a finalize-time stamp helper, never called during path resolution.

### 2.4 `buildRecordFolderArgs`

```typescript
function buildRecordFolderArgs(repoPath: string, epicHash: string, storyId: string, standalone: boolean, ownCreatedAt: string): { readonly createdAtISO: string; readonly workItemKind: WorkItemKind; readonly epicSlug: string | undefined }
```

**Parameters:**
- `repoPath: string` — Repo root whose artifacts store is read.
- `epicHash: string` — The work item's hash.
- `storyId: string` — Story id, used to locate the standalone LLD on the standalone branch.
- `standalone: boolean` — Which upstream artifact to consult. Unchanged parameter, but callers must now supply a truthful value rather than letting an absent meta flag narrow to false.
- `ownCreatedAt: string` — Fallback anchor when no upstream artifact yields one.

**Returns:** `{ createdAtISO: string; workItemKind: WorkItemKind; epicSlug: string | undefined }` — Unchanged shape. epicSlug is now populated for an ISSUE-anchored work item instead of being undefined.

**Errors:**
- `none` when Never throws; unchanged.

**Preconditions:**
- The caller supplies a `standalone` value reflecting the work item, not the presence of a flag on a record that may not carry one.

**Postconditions:**
- RESHAPED BODY, IDENTICAL SIGNATURE: the non-standalone branch consults readEpicDefinitionCore rather than readArtifactCore(defineArtifactId(...)) alone, so it no longer returns an undefined slug for a work item defined by an ISSUE.
- Removing that undefined is what stops the `epicSlug ?? epicHash` default from being reached, which is the raw-hash folder name. The seven default sites in storage.ts remain as genuine last-resort guards rather than the normal path for a bugfix.

### 2.5 `workItemKindOf`

```typescript
function workItemKindOf(meta: { readonly standalone?: boolean | undefined }): WorkItemKind
```

**Parameters:**
- `meta: { standalone?: boolean | undefined }` — An artifact's own meta.

**Returns:** `WorkItemKind` — 'standalone' when the flag is exactly true, else 'epic'. Unchanged.

**Errors:**
- `none` when Pure; never throws.

**Preconditions:**
- The supplied meta actually carries the flag when the work item is standalone — which is precisely what this Story makes true.

**Postconditions:**
- CONSUMED UNCHANGED, listed to fix the boundary. This helper and its roughly eighteen call sites are deliberately NOT edited. They were never wrong: they faithfully report what the meta says. All of them become correct as a consequence of the metas being correct, which is why the blast radius is the finalizers plus one folder-arg function rather than the whole path layer.

### 2.6 `safeDeriveSlug`

```typescript
function safeDeriveSlug(focus: string | undefined): string
```

**Parameters:**
- `focus: string | undefined` — The stage's own natural-language framing.

**Returns:** `string` — A filename-safe label derived from prose. Unchanged.

**Errors:**
- `none` when Never throws; unchanged.

**Preconditions:**
- Called only where NO earlier artifact exists to inherit a label from.

**Postconditions:**
- CONSUMED UNCHANGED, with its CALL SITES narrowed. It stays the minting mechanism for the three definition heads at orchestrator.ts:686 (SPEC), :858 (ISSUE) and :1152 (DEF), which must coin a label because nothing precedes them.
- The single call at orchestrator.ts:2260, inside finalizeStandaloneLld, becomes an inherit-then-fallback read in the exact form its three siblings at :1751, :2082 and :2529 already use. That one site is the whole of the label-drift defect.

### 2.7 `planMigration`

```typescript
function planMigration(repoPath: string): MigrationPlan
```

**Parameters:**
- `repoPath: string` — Repo whose docs tree is planned over.

**Returns:** `MigrationPlan` — Moves, link rewrites and unmappable entries. Shape unchanged.

**Errors:**
- `none` when Planning is read-only and reports problems as Unmappable entries rather than throwing.

**Preconditions:**
- None.

**Postconditions:**
- EXTENDED, shape unchanged, with the detail deferred to s7: it must recognise multiple folders sharing one identity segment and plan their convergence onto one, including a folder whose label is a raw hash and one placed under the wrong top-level.
- Reusing this existing surface rather than hand-rolling relocation is what lets a1 cover the already-misplaced folders, the one constraint it does not satisfy on its own.

## 3. Data model changes

### 3.1 `ArtifactCore` — field-add

The private return shape of readArtifactCore gains an optional `standalone?: boolean`, so one read yields all three epic-level properties. Additive and independently optional, matching the existing fields' best-effort contract.

**Call sites:**
- `src/workflow/storage.ts`

### 3.2 `LldArtifact.meta` — invariant-change

A standalone LLD's `epicSlug` becomes INHERITED rather than minted. No field is added or removed; what changes is where the value comes from. Today finalizeStandaloneLld coins it from its own focus prose, which is how the live LLD got 'lld-revision-supersedes-earlier-pass-whose' while its own ISSUE carried 'regression-hierarchical-label-resolver-listepichashes-src'.

**Call sites:**
- `src/workflow/orchestrator.ts`

### 3.3 `PlanArtifact.meta` — field-add

Carries `standalone` and an inherited `epicSlug`, so it stops being the stage at which placement flips. Measured on the live work item: the PLAN has epicSlug set but standalone absent, which is exactly why its PLAN.md landed under docs/epics while its LLD.md landed under docs/standalone.

**Call sites:**
- `src/workflow/orchestrator.ts`
- `src/workflow/gates.ts`

### 3.4 `BuildRecord.meta` — field-add

Carries `standalone`, `epicSlug` and `epicCreatedAt` inherited from the definition artifact. Today all three are absent on BUILD-792f9324fc43d95c-S001.json, which produces the raw-hash folder, the docs/epics placement and the 'Build (plan-driven)' heading with 'Standalone: no' on a standalone story. A prior fix deliberately stopped writing `standalone: false` here so that mergeWithPrior could carry a prior value forward; that remains correct, and this Story supplies the TRUE value rather than reinstating a false one.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/runners/build/completion-record.ts`

### 3.5 `WorkItemIdentity.epicSegment` — invariant-change

No shape change; the INVARIANT that the segment is stable for a work item becomes true for bugfix work items too. It is built from the anchor date only, so fixing readEpicCreatedAt to recognise an ISSUE is what makes the identity actually stable rather than coincidentally stable when stages share a calendar date.

**Call sites:**
- `src/workflow/id.ts`
- `src/workflow/storage.ts`

## 4. Diagrams

- [ER model](docs/standalone/make-work-item-keep-exactly-one-E20261003e20235c1/S001/er-model.html)

## 5. Error paths

**Error cases**

- **Neither a DEF nor an ISSUE is readable for the work item's hash, so there is no definition artifact to inherit from.** (recoverable)
  - Detection: readEpicDefinitionCore calls readArtifactCore for defineArtifactId(epicHash) and then issueArtifactId(epicHash); each returns {} because existsSync fails or JSON.parse throws and is caught. Both arms yielding no usable field is the signal, and it is observed as an empty result object rather than as an exception.
  - Response: Return {} and let each caller keep the fallback it already has: readEpicCreatedAt yields undefined so the finalizer applies its existing `?? nowISO`, the slug read falls through to safeDeriveSlug, and buildRecordFolderArgs returns workItemKind from its own `standalone` argument. Nothing new fails; the behaviour degrades to exactly today's.
  - User impact: Identical to current behaviour for a work item with no definition artifact: the folder is labelled from the stage's own prose or the hash. No new failure mode is introduced, which matters because this is the only path where the fix cannot improve anything.
- **The DEF exists but is corrupt (truncated or invalid JSON) while a valid ISSUE exists for the same hash.** (recoverable)
  - Detection: readArtifactCore's try/catch around JSON.parse converts the parse failure into {}; readEpicDefinitionCore observes no usable field from the DEF arm and proceeds to the ISSUE arm. The rule is first-READABLE-wins rather than first-PRESENT-wins, and the distinction is detectable only because the parse failure is swallowed into an empty result rather than propagated.
  - Response: Fall through to the ISSUE and return its values. Do not abort and do not treat the corrupt DEF's presence as proof that the work item is epic-parented.
  - User impact: A work item with a damaged DEF still resolves to one correct folder instead of becoming unplaceable. This mirrors the identical rule already implemented in the tracker resolver's definition reader, so the two cannot disagree.
- **A definition artifact is readable but its epicSlug is absent, not a string, or an empty string.** (recoverable)
  - Detection: readArtifactCore already type-guards with `typeof === 'string'` and omits the field otherwise; the slug consumer additionally requires a non-empty length before accepting it, because an empty label would compose a folder name beginning with a bare separator.
  - Response: Treat it as absent and fall back to safeDeriveSlug at the inheriting site, or to the existing `epicSlug ?? epicHash` default inside the path builders. Never compose a folder name from an empty label.
  - User impact: Degrades to a derived or hash label rather than producing a malformed directory name. The empty-string case is called out explicitly because a prior fix in this repo shipped an unproven length guard that a mutation showed was never exercised.
- **A downstream artifact already on disk was written before this fix and carries no standalone flag; it is then re-finalized, so the correct value is stamped and its folder changes underneath it.** (recoverable)
  - Detection: mergeWithPrior reads the prior record from the hash-flat JSON store and the merged meta now differs from what produced the existing markdown path; the path computed from the merged meta no longer matches the file that exists on disk.
  - Response: Let the new, correct path win for the new write, and leave relocation of the old file to the migration rather than attempting an implicit move inside the writer. Critically, do NOT reinstate writing `standalone: false` to make the paths agree: a prior fix removed that precisely so mergeWithPrior could carry a true value forward, and this Story supplies the true value instead.
  - User impact: One extra orphaned markdown file per affected artifact until the migration runs, which is strictly better than today's silent fork and is exactly the condition the migration is written to resolve.
- **Two or more folders already exist for one identity segment when the migration runs, with no single obviously-correct destination.** (recoverable)
  - Detection: planMigration groups candidate folders by the identity segment parsed from their directory names and finds a group of size greater than one, or finds the same artifact kind present in two groups.
  - Response: Plan a convergence onto the folder whose label and top-level match the definition artifact, and record anything it cannot place as an Unmappable entry rather than guessing or overwriting. Planning stays read-only and reports; applying is a separate call.
  - User impact: The operator sees exactly what would move and what could not be resolved before anything is touched, which is the existing tool's contract. This is the live condition: one work item currently has four folders.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A work item whose hash carries BOTH a DEF and an ISSUE. | The DEF wins outright and the ISSUE is never consulted, matching the identical DEF-first order already used by the tracker resolver's definition reader. Reaching the ISSUE must mean the work item has no usable DEF, so the read ORDER is the discriminator rather than any field. |
| An epic-parented work item whose DEF carries standalone explicitly false, or omits it. | workItemKindOf returns 'epic' in both cases, unchanged. The fix must not convert an absent flag into 'standalone'; only an explicit true means standalone, which is the existing semantics and must stay exactly as strict. |
| A Trivial standalone build that has no LLD at all, so the standalone branch of buildRecordFolderArgs finds no upstream artifact. | Falls back to the record's own createdAt for the anchor, as it does today, but still resolves as 'standalone' because the caller passes that argument rather than inferring it from a record that may not carry the flag. The slug comes from the ISSUE when one exists. |
| A definition artifact's epicSlug is deliberately renamed after downstream artifacts have been stamped. | Already-stamped artifacts keep their original label and stay in their existing folder; only newly written artifacts pick up the new label. This is the accepted cost of copying rather than referencing, and it is a deliberate consequence of the chosen alternative, not an oversight: it keeps artifacts self-describing and keeps path construction disk-free. |
| The definition artifact is deleted after downstream artifacts were stamped. | Every stamped artifact still resolves to its original folder, because the values live in its own meta. Placement degrades only for artifacts written after the deletion. This is strictly better than resolving placement on demand, where losing the definition artifact would make the whole work item unaddressable. |
| A work item whose stages are finalized on either side of midnight UTC. | All stages share one identity segment, because each inherits the definition artifact's anchor instead of its own clock. This is the case that is broken today and invisible on the current data only because the live work item's two differing timestamps, 18:19 and 20:03, happen to fall on the same calendar date. |

**Invariants to preserve**

- A work item's folder name is composed as label-plus-identity-segment, where the identity segment is the stable part and the label is only a readable label that never determines identity. The fix must make the label agree across stages, not make it load-bearing. [[c1]]
- Markdown path construction is pure: resolveArtifactMdPath and the *ArtifactPaths builders perform no filesystem read and return the same path for the same inputs. The definition artifact is consulted only at finalize time, never during path resolution — the rule readEpicCreatedAt's own doc comment states about itself. [[c3]]
- workItemKindOf treats only an explicit true as standalone; an absent or false flag means epic. The semantics stay exactly this strict, and its roughly eighteen call sites stay unedited, because they were never wrong about what the meta said. [[c2]]
- The definition artifact is read DEF-first then ISSUE, the same order the tracker resolver already uses, so no two readers can disagree about which artifact defines a work item. [[c3]]
- The BUILD record writer must not assert standalone false. A prior fix removed that assertion so mergeWithPrior could carry a prior true value forward; omitting remains correct and this Story supplies the true value rather than reinstating a false one. [[c8]]
- Every definition-artifact read is best-effort and never throws: a missing file and a parse failure both yield an empty result, so a damaged artifact degrades placement rather than breaking the stage. [[c3]]
- The epicSegment is derived from the anchor DATE only, so two anchors differing by time of day collide to one segment while two differing by date do not. Any change to how the anchor is resolved must be judged against this, because it is what makes the segment stable or unstable. [[c7]]
- Migration planning stays read-only and separate from applying: planMigration reports moves, link rewrites and Unmappable entries without touching the tree, and applyMigration is a distinct call. [[c6]]

## 6. Test strategy

**Test framework:** `node:test executed through tsx (`npx tsx --test --test-force-exit '<file>'`), with `assert` from node:assert/strict and temp repos via mkdtempSync, matching every suite named in s1's test.locate bundle. NOTE, carried from s1 and repeated here because it governs what counts as evidence: tsconfig excludes **/__tests__/**, so `tsc --noEmit` never typechecks these files and a clean typecheck is NOT evidence about them. Only running them is. Every acceptance criterion below additionally requires a MUTATION PROOF: revert the production change and confirm the named test turns red, because a test that passes both before and after pins nothing.`

**Test levels**

- **unit** — Pin the definition-artifact reader's resolution order and its degradation contract in isolation, since every other behaviour in this Story is downstream of it.
  - Subjects: `readEpicDefinitionCore: DEF present and readable wins outright`, `readEpicDefinitionCore: DEF absent, ISSUE present yields the ISSUE's values`, `readEpicDefinitionCore: DEF present but CORRUPT falls through to a valid ISSUE (first-READABLE-wins, not first-PRESENT-wins)`, `readEpicDefinitionCore: neither readable yields {} and does not throw`, `readEpicDefinitionCore: a hash carrying BOTH artifacts resolves to the DEF and never consults the ISSUE`, `readArtifactCore: the added standalone field is reported when boolean and omitted when absent or non-boolean, with the two pre-existing fields unaffected`, `readEpicCreatedAt: an ISSUE-anchored work item yields the ISSUE's createdAt instead of undefined`, `readEpicCreatedAt: signature and return meaning unchanged for a DEF-bearing epic`, `buildRecordFolderArgs: the non-standalone branch yields a real slug for an ISSUE-anchored work item instead of undefined`, `buildRecordFolderArgs: an explicit standalone=true still reads the LLD branch and still falls back to ownCreatedAt for a Trivial build with no LLD`, `workItemKindOf: only an explicit true is standalone; absent and false both remain 'epic'`, `An empty-string epicSlug on the definition artifact is treated as ABSENT and never composes a folder name beginning with a separator`
  - Fixtures: `A temp repo with .insrc/artifacts holding a DEF only`, `A temp repo holding an ISSUE only (no DEF) — the bugfix shape`, `A temp repo whose DEF file is deliberately invalid JSON alongside a valid ISSUE on the same hash`, `A temp repo holding BOTH a DEF and an ISSUE on one hash`, `A definition artifact whose epicSlug is an empty string, and one where it is a non-string`
- **integration** — Prove the property the Story actually promises, which no unit test can show: that a whole chain lands in ONE folder. These assert over the real composed paths rather than over any single helper.
  - Subjects: `A full standalone/bugfix chain — ISSUE, then standalone LLD, then PLAN, then BUILD — writes every markdown artifact into exactly one folder, asserted by enumerating the docs tree and counting folders carrying the work item's identity segment`, `That one folder sits under docs/standalone and its label equals the ISSUE's epicSlug, not a label derived from any later stage's focus prose`, `A standalone LLD's persisted meta.epicSlug EQUALS its ISSUE's, which is the direct inversion of the live defect where the ISSUE said 'regression-hierarchical-label-resolver-listepichashes-src' and the LLD said 'lld-revision-supersedes-earlier-pass-whose'`, `PLAN and BUILD metas both carry standalone true, so neither stage is the point at which placement flips`, `A standalone story's BUILD.md renders with the standalone heading and 'Standalone: yes', not 'Build (plan-driven)' with 'Standalone: no'`, `An ISSUE-anchored BUILD record's folder label is the real slug, and the raw 16-hex hash appears nowhere in the folder name`, `REGRESSION GUARD, asserted not assumed: an epic-parented chain (DEF, HLD, LLD, PLAN, BUILD) produces byte-identical paths to those produced before the change, so the eighteen unedited workItemKindOf call sites are provably unaffected`, `DEGRADATION: a work item with neither DEF nor ISSUE behaves exactly as today — label from the stage's own prose or the hash — and nothing throws`, `The migration converges a pre-seeded work item that already has FOUR folders, one artifact each, onto one, and reports anything it cannot place as Unmappable rather than guessing or overwriting`, `planMigration remains read-only: calling it leaves the docs tree byte-identical, and only applyMigration moves anything`
  - Fixtures: `A temp repo driven through a complete standalone/bugfix chain, writing all four artifacts`, `A temp repo driven through a complete epic-parented chain, for the regression guard`, `A temp repo pre-seeded to reproduce the live four-folder condition: docs/standalone/<slugA>-E<seg>/ISSUE.md, docs/standalone/<slugB>-E<seg>/S001/LLD.md, docs/epics/<slugB>-E<seg>/S001/PLAN.md and docs/epics/<rawhash>-E<seg>/S001/BUILD.md`, `A temp repo with no definition artifact at all`
- **smoke** — Guard the two structural invariants that no behavioural test would catch, both of which bound whether this design is admissible at all.
  - Subjects: `PURITY: the markdown path builders perform NO filesystem read. Asserted structurally rather than by inspection — construct a path for a repo directory that does not exist and assert a correct string is still returned, which is only possible if nothing is read`, `The definition artifact is consulted at finalize time only and never during path resolution, the rule readEpicCreatedAt's own doc comment states about itself`, `CLOCK INDEPENDENCE: two stages finalized with their own clocks on OPPOSITE sides of midnight UTC still resolve to one identity segment, because both inherit the definition artifact's anchor. This is the latent fork, and it is invisible under same-day fixtures — the live work item's 18:19 and 20:03 timestamps masked it — so the fixture must deliberately straddle a date boundary or the test proves nothing`
  - Fixtures: `A nonexistent repo path, for the purity assertion`, `An ISSUE whose createdAt is late on one UTC day, with downstream finalizes stubbed to a clock early on the NEXT UTC day`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a full standalone/bugfix chain writes every artifact into exactly one folder, by enumerating the docs tree and counting folders carrying the identity segment`, `integration: that folder is under docs/standalone and labelled with the ISSUE's epicSlug`, `MUTATION: revert the finalizer inheritance and the folder count returns to more than one` |
| `ac2` | `integration: a standalone LLD's meta.epicSlug equals its ISSUE's`, `unit: readEpicDefinitionCore returns the ISSUE's epicSlug when no DEF exists`, `MUTATION: restore the unconditional safeDeriveSlug at the standalone LLD finalizer and the equality assertion turns red` |
| `ac3` | `integration: PLAN meta carries standalone true`, `integration: BUILD meta carries standalone true`, `MUTATION: stop stamping the flag and both land under docs/epics again` |
| `ac4` | `unit: buildRecordFolderArgs yields a real slug for an ISSUE-anchored work item rather than undefined`, `integration: the raw 16-hex hash appears nowhere in the BUILD folder name`, `MUTATION: restore the DEF-only upstream read and the raw-hash folder name returns` |
| `ac5` | `integration: a standalone story's BUILD.md renders the standalone heading and 'Standalone: yes'`, `integration: that BUILD.md is written under docs/standalone, not docs/epics`, `MUTATION: stop stamping standalone and the heading reverts to 'Build (plan-driven)' with 'Standalone: no'` |
| `ac6` | `unit: readEpicCreatedAt resolves an ISSUE's createdAt instead of undefined`, `smoke: two stages finalized on opposite sides of midnight UTC share one identity segment`, `MUTATION: restore the DEF-only read in readEpicCreatedAt and the cross-midnight fixture forks into two segments. This mutation matters most of the four, because the behaviour is invisible under a same-day fixture` |
| `ac7` | `integration: an epic-parented chain produces byte-identical paths to the pre-change baseline`, `unit: workItemKindOf still maps absent and false alike to 'epic'`, `unit: readEpicCreatedAt's behaviour for a DEF-bearing epic is unchanged`, `DIFF ASSERTION: the eighteen workItemKindOf / workItemAnchorCreatedAt call sites are untouched in the change set` |
| `ac8` | `integration: the migration converges a pre-seeded four-folder work item onto one`, `integration: it reports an unplaceable folder as Unmappable rather than guessing`, `integration: planMigration leaves the tree byte-identical, so planning stays read-only` |
| `ac9` | `unit: readEpicDefinitionCore returns {} and does not throw when neither artifact is readable`, `unit: a corrupt DEF falls through to a valid ISSUE`, `integration: a work item with no definition artifact behaves exactly as it does today, with nothing thrown`, `unit: an empty-string epicSlug is treated as absent. Written as its own case because a prior length guard in this repo shipped unproven and a mutation showed it was never exercised` |
| `ac10` | `smoke: a path is still composed correctly for a repo directory that does not exist, which is only possible if no filesystem read occurs`, `DIFF ASSERTION: no new read appears inside resolveArtifactMdPath or any *ArtifactPaths builder in the change set` |

## 7. Migration

**State before:** Each workflow stage decides a work item's folder label and its docs/epics-versus-docs/standalone placement for itself, and the two readers that could supply an inherited value recognise a DEF but not an equivalent ISSUE. Per s1: the standalone LLD finalizer derives the label unconditionally from its own focus prose (orchestrator.ts:2260) while three sibling finalizers already inherit-then-fallback (:1751, :2082, :2529); only two sites write standalone into persisted meta (orchestrator.ts:872, :2303), so PLAN and BUILD carry it absent and standalone-record.ts:241 narrows absent to false; buildRecordFolderArgs' epic branch reads defineArtifactId alone (storage.ts:241), yielding no slug for an ISSUE-anchored item, which the `epicSlug ?? epicHash` default then degrades to the raw hash at seven sites; and readEpicCreatedAt is likewise DEF-only, so its four callers each fall back to their own clock. Observable consequence on disk, also per s1: work item 792f9324fc43d95c owns FOUR folders holding one artifact each, and its BUILD record carries epicSlug, standalone and sizeClass all absent, rendering a standalone story as 'Build (plan-driven)' with 'Standalone: no' under docs/epics. The identity segment matched across all four only because two differing anchor timestamps, 18:19 and 20:03, fell on the same calendar date.

**State after:** A work item's label, placement and folder anchor are properties of the work item, established once by its definition artifact and inherited unchanged by every later stage. One reader expresses the DEF-equals-ISSUE equivalence for all three, so a bugfix work item is never slugless, never mis-placed, and never anchored to a stage's own clock. Every artifact of a work item composes the same folder name, the docs tree holds exactly one folder per work item with no raw-hash labels, and a standalone story's BUILD record is both placed and rendered as standalone. Epic-parented work items resolve to byte-identical paths, path construction remains pure and disk-free, and the eighteen existing derivation call sites are unedited because they become correct as a consequence of the metas being correct.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. The definition-artifact reader exists, resolves DEF-then-ISSUE with first-READABLE-wins, reports label, placement and anchor together, and never throws — with its resolution order and degradation contract proven in isolation. No production behaviour has changed yet, because nothing consumes it: this is deliberately a landing state rather than a change, so the reader's order can be falsified before anything depends on it. — ↩ rollbackable
2. The folder anchor read recognises an ISSUE, so a work item's identity segment is the same for every stage regardless of when each ran. This is sequenced BEFORE the label and placement work because it fixes the deeper fork: while the anchor can differ per stage, two stages can land in different folders even when their labels agree perfectly, so fixing labels first would leave a defect that same-day fixtures cannot see. — ↩ rollbackable
3. Newly written downstream artifacts carry an inherited label and an inherited placement flag in their own meta, so no stage re-derives either from its own prose. The standalone LLD finalizer now matches the inherit-then-fallback form its three siblings already use, and the PLAN and BUILD writers record the placement flag rather than omitting it — without reinstating an asserted false, which a prior fix removed so that a prior true value could be carried forward. — ↩ rollbackable
4. The BUILD record's folder derivation yields a real label and the correct top-level for an ISSUE-anchored work item, so the raw-hash label and the docs/epics placement of a standalone story are both gone, and the record renders with its standalone heading. At this point every NEW artifact of a work item lands in one folder; nothing on disk has moved. — ↩ rollbackable
5. Existing downstream artifacts' metas are backfilled from their definition artifact, so already-written artifacts describe their placement as correctly as new ones. Until this holds, a pre-existing artifact that is later re-finalized would move folder while its untouched siblings do not, which is why the backfill precedes the folder convergence rather than following it. — ↩ rollbackable
6. The docs tree contains exactly one folder per work item: folders sharing an identity segment are converged onto the one the definition artifact designates, links into the moved paths are rewritten, and anything that cannot be placed is reported as unmappable rather than guessed at or overwritten. Planning this remains read-only and separate from applying it. The live four-folder work item is the acceptance case. — ↩ rollbackable
7. An epic-parented chain's paths are byte-identical to the pre-change baseline, and the eighteen derivation call sites are confirmed untouched in the change set. This is a verified state rather than an edit, and it is last because it is the guard that the preceding six steps changed only bugfix-shaped work items. — ↩ rollbackable

**Backward compat:** Two exported functions change behaviour without changing signature, and one private return shape is widened additively. readEpicCreatedAt keeps `(repoPath, epicHash) => string | undefined` and its stated meaning, but now returns a value where it previously returned undefined for an ISSUE-anchored work item; its four callers all apply `?? nowISO`, so each silently improves and none needs editing. buildRecordFolderArgs keeps its five parameters and its returned shape, but its epicSlug field is now populated where it was previously undefined; callers already handle `string | undefined`, so the type contract is unchanged. readArtifactCore is module-private and gains one optional field, which no existing caller reads. workItemKindOf, workItemAnchorCreatedAt, safeDeriveSlug and every *ArtifactPaths builder keep both signature and semantics exactly. The one genuinely visible change is that a bugfix work item's artifacts resolve to DIFFERENT paths than before the fix — the correct ones — which is the point of the Story and is why steps 5 and 6 exist to bring already-written files along rather than leaving readers pointing at vacated locations. Artifacts stay self-describing throughout: nothing starts depending on the definition artifact being present at read time, so a work item whose definition artifact is later deleted keeps resolving exactly as before.

## 8. Alternatives considered

### 8.1 a1: Stamp the epic's identity at finalize time, extending the epicCreatedAt precedent — **CHOSEN**

One reader of the definition artifact (DEF or ISSUE) returns the work item's label, placement and anchor; every finalizer stamps all three into the artifact's own meta, exactly as epicCreatedAt is already stamped.

Generalize the existing readEpicCreatedAt into a single definition-artifact reader that resolves DEF-then-ISSUE for one epic hash and returns the work item's three epic-level properties together: epicSlug, standalone and the anchor createdAt. Each stage finalizer stamps the returned values into the artifact meta it is about to persist, in place of re-deriving them. finalizeStandaloneLld stops calling safeDeriveSlug unconditionally and inherits like its three siblings; the PLAN and BUILD writers stamp standalone instead of omitting it; and buildRecordFolderArgs consults the same reader rather than defineArtifactId alone, so an ISSUE-anchored epic is no longer slugless. Derivation stays where the repo already put it — workItemKindOf and workItemAnchorCreatedAt keep reading the artifact's own meta, so all eighteen existing call sites become correct without being touched, and the documented rule that the definition artifact is read only at finalize time and never during path resolution is preserved. The reader is the single place the DEF-equals-ISSUE equivalence is expressed, which also closes the readEpicCreatedAt identity-segment drift as the same change rather than a second one.

### 8.2 a2: Resolve placement from the definition artifact at every path construction

Path builders stop trusting the artifact's own meta and look the work item's label and placement up from its definition artifact each time a path is built.

Invert the direction of truth. Rather than copying the epic-level properties downstream, have the path layer resolve them on demand: the artifact-path helpers take only the epic hash and story id, and internally consult the definition artifact for label, placement and anchor. Downstream metas keep whatever they happen to carry and it stops mattering, because nothing reads placement out of them. workItemKindOf and workItemAnchorCreatedAt would be retired or reduced to fallbacks for the definition artifact itself.

**Rejected because:** Ranked last despite satisfying the most constraints on paper, because the two it violates are the ones that bound whether the change is admissible at all. lc7 is not a preference but the explicit self-description of the module being changed, and lc8 has measured in-repo precedent: the same inversion in the label resolver cost 130x this week and had to be undone. Its real strength is lc6, self-healing without migration, and that strength is worth borrowing: a1 plus an s7 migration obtains the same outcome without paying lc7 or lc8.

### 8.3 a3: Make label drift harmless by locating the existing folder on its stable identity segment

Before writing, find any folder whose name ends in the work item's identity segment and reuse it whatever its label or top-level, instead of composing a fresh name from the current label.

Keep every stage deriving its own label, and absorb the disagreement in the writer. The folder resolver scans the two docs top-levels for a directory whose name ends with the work item's epicSegment and reuses it when found, composing label-plus-segment only when creating the first folder. Since all artifacts of one work item share that segment, they converge on whichever folder was created first. path-scheme.ts already enumerates work-item folders, so the scan has a home.

**Rejected because:** Ranked second because it is cheap and genuinely tolerant of drift from stages this Story never touches, which is real value. But it violates lc2, lc5 and lc7 and leaves every meta wrong, so it treats the visible symptom while the inconsistent metadata keeps producing wrong renderings elsewhere. Its fatal gap against a1 is lc1 under the live conditions: with four folders already sharing one segment it has no rule for which wins, and it offers nothing at all for the identity-segment drift, where no stable segment exists to match on.

### 8.4 a4: Remove the label from the folder name entirely

Name folders by identity segment alone so a mutable label cannot influence the path, and carry the human-readable label inside the artifact instead.

Change the folder naming authority so a work-item folder is named by its identity segment only, dropping the label-plus-segment composition. The label survives as metadata and in rendered headings but stops participating in any path. Every existing folder is renamed once by a migration.

**Rejected because:** Scores well on the mechanical constraints and is the only option that makes the defect structurally impossible, but it is rejected on grounds outside the constraint table: it deletes the human-readable folder names that path-scheme.ts explicitly exists to provide, which is a deliberate product decision this Story has no mandate to reverse. It also still violates lc5 and, like a3, leaves the identity-segment drift as the sole remaining fork mechanism, now more consequential. At L cost for a defect a1 fixes at S, the trade is not available.

## 9. References

- **[[c1]]** `code` `src/workflow/path-scheme.ts:104` — "return join(repoPath, 'docs', topSegment(workItemKind), `${fileSeg(slug)}-${identity.epicSegment}`);"
- **[[c2]]** `code` `src/workflow/storage.ts:189` — "export function workItemKindOf(meta: { readonly standalone?: boolean | undefined }): WorkItemKind { return meta.standalone === true ? 'standalone' : 'epic'; }"
- **[[c3]]** `code` `src/workflow/storage.ts:213` — "function readArtifactCore(repoPath: string, artifactId: string): { createdAt?: string; epicSlug?: string }"
- **[[c4]]** `code` `src/workflow/storage.ts:241` — ": readArtifactCore(repoPath, defineArtifactId(epicHash));"
- **[[c5]]** `code` `src/workflow/orchestrator.ts:2260` — "const epicSlug = safeDeriveSlug(intent.focus);"
- **[[c6]]** `code` `src/workflow/migrate-docs-tree.ts:193` — "export function planMigration(repoPath: string): MigrationPlan"
- **[[c7]]** `code` `src/workflow/id.ts:210` — "epicSegment: `E${wfid.date}${wfid.hash8}`,"
- **[[c8]]** `code` `src/workflow/runners/build/standalone-record.ts:241` — "const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, merged.meta.standalone === true, merged.meta.createdAt);"
- **[[c9]]** `prior-artifact` `.insrc/artifacts/ISSUE-e20235c17f083a16.json` — "The approved ISSUE this Story implements: epicSlug 'artifact-docs-folders-fork-per-stage', standalone true, magnitude sized."
- **[[c10]]** `prior-artifact` `.insrc/artifacts/BUILD-792f9324fc43d95c-S001.json` — "epicSlug, standalone and sizeClass all absent — the live record that produced the raw-hash folder under docs/epics."

## 10. Open questions

- SCOPE EXPANSION, needs the reviewer's ruling: the approved ISSUE describes label drift and the epics-versus-standalone split, but this LLD also fixes readEpicCreatedAt's DEF-only read, which addresses a LATENT and more severe fork — the identity segment itself can differ between stages of a bugfix work item, and no label fix would prevent that. It is the same root cause and the same reader, which is why it was judged in scope, but it widens the Story beyond the ISSUE's wording. Confirm or cut it; if cut, migration step 2 and acceptance criterion ac6 come out with it.
- PROVENANCE, affects how much weight every criterion in this document carries: the Story arrived with an EMPTY acceptanceCriteria list, and the Epic constraints and HLD shared contracts handed to the judging step were likewise empty. So ac1-ac10 and the eight constraints lc1-lc8 the alternatives were scored against are all LLD-authored from the approved ISSUE's fix intent plus two invariants the modules state about themselves. They are this document's proposal, not a contract it is honouring. The root cause of Stories arriving with empty acceptanceCriteria was previously deferred and remains unfixed.
- CHECKLIST SHORTFALL cd1: readEpicDefinitionCore is a function this Story adds, so its signature references neither an existing symbol nor a shared contract, which the audit scored as partial rather than passing. Mitigated by composing it only from existing pieces (readArtifactCore, defineArtifactId, issueArtifactId) and by copying its resolution order from the tracker resolver's existing definition reader, but a reviewer should confirm that adding a reader here is preferable to widening readEpicCreatedAt's return type in place.
- CHECKLIST SHORTFALL cd3: every api errors entry uses the type 'none' with a condition explaining why the function cannot throw, which is not a concrete error type. This is deliberate rather than an omission — the never-throwing, best-effort behaviour is load-bearing, since the DEF-to-ISSUE fallthrough works precisely because a parse failure degrades to an empty result — but it means the document has no named error type anywhere.
- GROUNDING, stated so it is not mistaken for analyze-derived: every path, line and symbol cited as existing was read directly from the working tree and verified, and the two numeric claims (the 18:19 versus 20:03 anchor divergence and the three absent BUILD meta fields) were read from the artifact JSON on disk. But this grounding came from direct reads and scoped greps rather than from insrc_analyze_step calls, contrary to the s1 step's instruction.
- SEPARATE DEFECT found while running this very stage, needs its own ledger entry and is NOT part of this Story: starting design.story with { epicSlug, storyId } and no epicHash silently minted a fresh work-item hash 711427ca90326429, for which no artifact exists, instead of resolving the approved ISSUE e20235c17f083a16 by its slug or failing loudly. Re-running with an explicit epicHash anchored correctly. A silent work-item fork on a slug miss is worse than the folder fork this Story fixes, because it produces an entire parallel work item rather than a duplicate folder.

## Resolved questions

- `qf7a908b1` — SCOPE EXPANSION, needs the reviewer's ruling: the approved ISSUE describes label drift and the epics-versus-standalone split, but this LLD also fixes readEpicCreatedAt's DEF-only read, which addresses a LATENT and more severe fork — the identity segment itself can differ between stages of a bugfix work item, and no label fix would prevent that. It is the same root cause and the same reader, which is why it was judged in scope, but it widens the Story beyond the ISSUE's wording. Confirm or cut it; if cut, migration step 2 and acceptance criterion ac6 come out with it.
  - **resolved**: Keep the added scope: the Story also fixes readEpicCreatedAt's DEF-only read, closing the identity-segment drift alongside the label and placement drift. — Ruled by the user in chat. The three symptoms the ISSUE names and the latent fourth share one root cause — an epic-level property not inherited by an ISSUE-anchored work item — and one reader fixes all four, so splitting them would mean touching the same function twice and shipping a known-broken identity invariant in between. Confirmed live during this stage: the LLD forked to a second folder (make-work-item-keep-exactly-one vs the ISSUE's artifact-docs-folders-fork-per-stage) and BOTH artifacts carry epicCreatedAt absent, so each folder anchor came from its own clock and the identity segment matched only because both ran on the same UTC day. Migration step 2 and acceptance criterion ac6 therefore STAY IN, and the cross-midnight smoke fixture is mandatory rather than optional, because a same-day fixture cannot see this defect at all. _(2026-10-03T06:06:29.954Z)_
- `q9d7a5b5e` — CHECKLIST SHORTFALL cd1: readEpicDefinitionCore is a function this Story adds, so its signature references neither an existing symbol nor a shared contract, which the audit scored as partial rather than passing. Mitigated by composing it only from existing pieces (readArtifactCore, defineArtifactId, issueArtifactId) and by copying its resolution order from the tracker resolver's existing definition reader, but a reviewer should confirm that adding a reader here is preferable to widening readEpicCreatedAt's return type in place.
  - **resolved**: Add readEpicDefinitionCore (as the LLD proposes) — The cd1 partial is an artefact of the symbol being new, not of the design being ungrounded: the reader is composed only from readArtifactCore, defineArtifactId and issueArtifactId, all verified to exist. Widening readEpicCreatedAt in place was rejected because it would force every one of its four callers onto a new return type and leave the function's name describing something narrower than it returns. Promoting the tracker resolver's reader to a shared home was rejected as a cross-module move that makes storage depend on tracker-owned code for a two-line read, which is a bigger architectural commitment than this bugfix should make. The one real cost is accepted and recorded: the DEF-then-ISSUE order now exists in two places, so if they ever drift, consolidating them is the follow-up. _(2026-10-03T06:08:00.938Z)_
- `qf9266e0b` — CHECKLIST SHORTFALL cd3: every api errors entry uses the type 'none' with a condition explaining why the function cannot throw, which is not a concrete error type. This is deliberate rather than an omission — the never-throwing, best-effort behaviour is load-bearing, since the DEF-to-ISSUE fallthrough works precisely because a parse failure degrades to an empty result — but it means the document has no named error type anywhere.
  - **resolved**: Accept 'none' as a deliberate deviation — The never-throwing, degrade-to-empty behaviour is the mechanism, not an omission: the DEF-to-ISSUE fallthrough works precisely because a parse failure becomes an empty result rather than propagating, and that is already recorded as an invariant to preserve. Reshaping the API to satisfy a checklist item would change load-bearing behaviour to improve a document, which is the wrong trade. Naming the swallowed types was tempting but would have meant asserting which errors JSON.parse and the read can raise without verifying it, and an unverified list is worse than an honest 'none' with a stated condition. The obligation this creates and which the plan must carry: lock the behaviour in with a test that a corrupt DEF alongside a valid ISSUE yields the ISSUE's values, so the deviation is proven rather than merely asserted. _(2026-10-03T06:09:00.624Z)_
- `q968f2064` — SEPARATE DEFECT found while running this very stage, needs its own ledger entry and is NOT part of this Story: starting design.story with { epicSlug, storyId } and no epicHash silently minted a fresh work-item hash 711427ca90326429, for which no artifact exists, instead of resolving the approved ISSUE e20235c17f083a16 by its slug or failing loudly. Re-running with an explicit epicHash anchored correctly. A silent work-item fork on a slug miss is worse than the folder fork this Story fixes, because it produces an entire parallel work item rather than a duplicate folder.
  - **resolved**: Track as separate bugfix; resolve slug to the approved ISSUE/DEF — Keeps S001's scope exactly as the approved ISSUE frames it while putting the defect on the ledger, which the standing rule requires. The fix direction addresses both halves of the harm rather than one: a slug-only start resolves against existing epic-level artifacts and anchors on the matching hash, and fails loudly only on no match or an ambiguous match. Merely failing loudly would leave the slug-only call unusable, and making epicHash mandatory would push the resolution burden onto every caller. Note the symmetry with the story just completed: the correct rule there was also to test which work items actually CONTAIN the requested thing rather than to refuse on a count, and the wrong behaviour here is strictly worse than the folder fork S001 fixes, because it mints an entire parallel work item rather than a duplicate folder. OBLIGATION: this ISSUE is now owed and not yet filed. _(2026-10-03T06:09:47.830Z)_
- `q8ba89ac9` — GROUNDING, stated so it is not mistaken for analyze-derived: every path, line and symbol cited as existing was read directly from the working tree and verified, and the two numeric claims (the 18:19 versus 20:03 anchor divergence and the three absent BUILD meta fields) were read from the artifact JSON on disk. But this grounding came from direct reads and scoped greps rather than from insrc_analyze_step calls, contrary to the s1 step's instruction.
  - **resolved**: Targeted analyze cross-check of load-bearing claims only — A full re-ground would mostly re-prove facts already verified against primary source, while accepting the deviation outright would skip the one thing scoped greps genuinely can miss: graph-derived callers and symbol relations for the functions being changed. The targeted pass is therefore where the accuracy-first principle actually buys something. The two numeric claims stay on their correct source: the 18:19 versus 20:03 anchor divergence and the three absent BUILD meta fields are values inside artifact JSON on disk, not indexed code, so analyze cannot verify them better than reading the files does. OBLIGATION this creates, to be discharged BEFORE the LLD is approved rather than deferred into the plan: run insrc_analyze_step over readArtifactCore, readEpicCreatedAt, buildRecordFolderArgs and workItemKindOf and their callers, and correct the LLD if the graph contradicts any cited relation — in particular the claim that roughly eighteen call sites consume the derivation helpers and that sixty-two sites construct artifact paths, both of which came from grep counts rather than the graph. _(2026-10-03T06:10:25.458Z)_

## Citations

- **[[c1]]** `code` `src/workflow/path-scheme.ts:104` — "return join(repoPath, 'docs', topSegment(workItemKind), `${fileSeg(slug)}-${identity.epicSegment}`);"
- **[[c2]]** `code` `src/workflow/storage.ts:189` — "export function workItemKindOf(meta: { readonly standalone?: boolean | undefined }): WorkItemKind { return meta.standalone === true ? 'standalone' : 'epic'; }"
- **[[c3]]** `code` `src/workflow/storage.ts:213` — "function readArtifactCore(repoPath: string, artifactId: string): { createdAt?: string; epicSlug?: string }"
- **[[c4]]** `code` `src/workflow/storage.ts:241` — ": readArtifactCore(repoPath, defineArtifactId(epicHash));"
- **[[c5]]** `code` `src/workflow/orchestrator.ts:2260` — "const epicSlug = safeDeriveSlug(intent.focus);"
- **[[c6]]** `code` `src/workflow/migrate-docs-tree.ts:193` — "export function planMigration(repoPath: string): MigrationPlan"
- **[[c7]]** `code` `src/workflow/id.ts:210` — "epicSegment: `E${wfid.date}${wfid.hash8}`,"
- **[[c8]]** `code` `src/workflow/runners/build/standalone-record.ts:241` — "const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, merged.meta.standalone === true, merged.meta.createdAt);"
- **[[c9]]** `prior-artifact` `.insrc/artifacts/ISSUE-e20235c17f083a16.json` — "The approved ISSUE this Story implements: epicSlug 'artifact-docs-folders-fork-per-stage', standalone true, magnitude sized."
- **[[c10]]** `prior-artifact` `.insrc/artifacts/BUILD-792f9324fc43d95c-S001.json` — "epicSlug, standalone and sizeClass all absent — the live record that produced the raw-hash folder under docs/epics."
