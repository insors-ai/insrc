<!-- insrc:artifact PLAN-e20235c17f083a16-S001 -->

# Plan: E20261003e20235c1:S001

## Summary

**Epic:** `make-work-item-keep-exactly-one`
**LLD run:** `wf-1791005831675-z8l0bd`
**LLD effective hash:** `ac8308537a4b...`

Building this is seven small, carefully-ordered changes rather than one big one. Almost every production edit is a body change inside a function whose signature does not move, and the two functions whose callers matter have four and one caller respectively — both confirmed against the call graph. The risk is not volume, it is over-reach and under-testing: thirty-five derivation call sites and fifty-two path-construction sites must be left strictly alone, and the subject being fixed is an ABSENCE, which is the easiest kind of thing to write a vacuous test for. So every task carries a named mutation proof, and the one test that cannot be skipped is the cross-midnight fixture, because a same-day fixture passes whether or not the fix works.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Land the definition-artifact accessor, DEF-then-ISSUE, wired to nothing | S | — | unit: DEF present and readable wins outright; the ISSUE is never consulted; unit: DEF absent with an ISSUE present yields the ISSUE's values; unit: a CORRUPT DEF alongside a valid ISSUE falls through — first-READABLE-wins, not first-PRESENT-wins; unit: neither artifact readable yields an empty result and does not throw; unit: a hash carrying BOTH artifacts resolves to the DEF and never consults the ISSUE; unit: readArtifactCore reports the added standalone field only when boolean, with its two pre-existing fields unaffected; integration: DEGRADATION: a work item with neither DEF nor ISSUE behaves exactly as today and nothing throws; unit: MUTATION PROOF: reversing the read order reds the order test; first-PRESENT-wins reds the corrupt-DEF test | [[c2]] [[c7]] |
| 2 | **`t2`** Make the folder anchor read recognise an ISSUE, so the identity segment stops drifting | S | `t1` | unit: an ISSUE-anchored work item yields the ISSUE's createdAt instead of undefined; unit: signature and return meaning unchanged for a DEF-bearing epic; smoke: CLOCK INDEPENDENCE: two stages finalized on opposite sides of midnight UTC resolve to one identity segment; smoke: the definition artifact is consulted at finalize time only and never during path resolution; smoke: MUTATION PROOF: restoring the DEF-only read reds the cross-midnight fixture while a same-day fixture stays green | [[c3]] [[c7]] |
| 3 | **`t3`** Inherit the label in finalizeStandaloneLld instead of re-deriving it | S | `t1`, `t2` | integration: a standalone LLD's persisted meta.epicSlug EQUALS its ISSUE's — the direct inversion of the live defect; integration: the work item's one folder sits under docs/standalone and its label equals the ISSUE's epicSlug, not a later stage's focus prose; unit: an empty-string epicSlug on the definition artifact is treated as ABSENT and never composes a folder name beginning with a separator; unit: MUTATION PROOF: restoring the unconditional derivation reds the slug-equality test | [[c1]] [[c8]] |
| 4 | **`t4`** Stamp the placement flag on the PLAN and BUILD records | S | `t1`, `t3` | integration: PLAN and BUILD metas both carry standalone true, so neither stage is the point at which placement flips; integration: a record written with the flag true, then re-written by a path omitting it, still resolves standalone and its markdown does not move; unit: workItemKindOf: only an explicit true is standalone; absent and false both remain 'epic'; unit: no writer asserts the flag false — asserted over the written meta, not by reading the source; integration: MUTATION PROOF: dropping the stamp returns both records to the wrong top-level | [[c5]] [[c1]] |
| 5 | **`t5`** Fix the BUILD folder-arg derivation so an ISSUE-anchored item gets a real label | S | `t1`, `t4` | unit: buildRecordFolderArgs: the non-standalone branch yields a real slug for an ISSUE-anchored work item instead of undefined; unit: buildRecordFolderArgs: an explicit standalone=true still reads the LLD branch and still falls back to ownCreatedAt for a Trivial build with no LLD; integration: a full standalone/bugfix chain — ISSUE, LLD, PLAN, BUILD — writes every markdown artifact into exactly one folder, by enumerating the docs tree and counting folders carrying the identity segment; integration: an ISSUE-anchored BUILD record's folder label is the real slug and the raw 16-hex hash appears nowhere in the name; integration: a standalone story's BUILD.md renders the standalone heading and 'Standalone: yes', not 'Build (plan-driven)' with 'Standalone: no'; integration: the hash fallback is still REACHABLE: a work item with no definition artifact composes a folder name degrading to the hash, without throwing; integration: MUTATION PROOF: restoring the DEF-only upstream read brings the raw-hash folder name back | [[c4]] [[c8]] |
| 6 | **`t6`** Converge the folders already scattered on disk | M | `t2`, `t3`, `t4`, `t5` | integration: the migration converges a pre-seeded FOUR-folder work item onto one, with the four-folder start state asserted BEFORE the migration runs; integration: a raw-hash-labelled folder and a wrong-top-level folder are both handled; integration: an unplaceable folder is reported as Unmappable rather than guessed at or overwritten; integration: planMigration remains read-only: calling it leaves the docs tree byte-identical, and only applyMigration moves anything; integration: links pointing into moved paths are rewritten; integration: MUTATION PROOF: disabling the group-by-segment step reds the four-folder convergence test | [[c6]] [[c7]] |
| 7 | **`t7`** Prove the epic route untouched, then close with measured evidence | S | `t1`, `t2`, `t3`, `t4`, `t5`, `t6` | integration: REGRESSION GUARD: an epic-parented chain produces byte-identical paths to the pre-change baseline; unit: workItemKindOf still maps absent and false alike to 'epic'; unit: readEpicCreatedAt's behaviour for a DEF-bearing epic is unchanged; smoke: PURITY: the markdown path builders perform no filesystem read — a path composes for a nonexistent repo directory; smoke: the definition artifact is consulted at finalize time only, never during path resolution; smoke: all seven mutation proofs from t1 to t6 re-run at story end and still invert | [[c8]] [[c3]] |

### 1.1 E20261003e20235c1:S001:T001 — Land the definition-artifact accessor, DEF-then-ISSUE, wired to nothing

Add the single reader that resolves a work item's definition artifact and returns its epic-level properties, and widen readArtifactCore's private return shape with an optional standalone field. Resolution is DEF first then ISSUE, copied from the tracker resolver's existing order rather than newly decided, and it is first-READABLE-wins: because readArtifactCore swallows a parse failure into an empty result, a corrupt DEF falls through to the ISSUE instead of poisoning the read. Deliberately consumed by nothing in this task, so its order and degradation contract can be falsified before anything depends on them. Its own task rather than folded into a consumer, because the sibling Story widens it from three metadata fields to the whole definition and needs something clean to widen.

**Acceptance checks:**
- A DEF present and readable wins outright, and the ISSUE is never consulted
- A DEF absent with an ISSUE present yields the ISSUE's values
- A DEF present but CORRUPT falls through to a valid ISSUE — first-READABLE-wins, not first-PRESENT-wins
- Neither readable yields an empty result and does NOT throw
- readArtifactCore's added standalone field is reported when boolean and omitted when absent or non-boolean, with its two pre-existing fields unaffected
- CRITIQUE APPLIED — restated as an OUTCOME comparison rather than a count: no previously-passing test changes outcome, and the only new passes are the ones this task adds by name. Any count quoted must come from actual output and from a stable repeat run, because a sweep in this session read 4204 where 4232 was expected and needed two further runs to settle
- MUTATION PROOF, run and recorded: reversing the read order turns the order test red, and switching to first-PRESENT-wins turns the corrupt-DEF test red

### 1.2 E20261003e20235c1:S001:T002 — Make the folder anchor read recognise an ISSUE, so the identity segment stops drifting

Route readEpicCreatedAt through the new accessor instead of reading the define artifact alone, keeping its signature and its stated meaning. Sequenced immediately after the accessor and BEFORE any label work, because it fixes the deeper fork: while the anchor can differ per stage, two stages land in different folders even when their labels agree perfectly. Its four callers each apply a nowISO fallback and none needs editing. The test that proves it must straddle a UTC date boundary — the identity segment is built from the anchor DATE only, so a same-day fixture passes whether or not the fix works, which is exactly why the live four-folder work item masked this.

**Acceptance checks:**
- An ISSUE-anchored work item yields the ISSUE's createdAt where it previously yielded undefined
- Signature and return meaning are unchanged, and a DEF-bearing epic behaves exactly as before
- Its four callers are UNEDITED — asserted by diff, not assumed
- CROSS-MIDNIGHT, mandatory: two stages finalized with their own clocks on opposite sides of midnight UTC resolve to ONE identity segment. A same-day fixture is explicitly insufficient and must not be the only coverage
- The rule that this is a finalize-time stamp helper, never called during path resolution, still holds
- MUTATION PROOF, run and recorded: restoring the DEF-only read turns the cross-midnight test red while a same-day fixture stays green — which is itself the proof that a same-day fixture was worthless

### 1.3 E20261003e20235c1:S001:T003 — Inherit the label in finalizeStandaloneLld instead of re-deriving it

Change the one unconditional slug derivation that re-derives for a work item which already has a label, replacing it with the inherit-then-fallback form its three sibling finalizers already use. A one-line change at a single site. The three OTHER unconditional derivations are deliberate non-targets and must not be touched: they belong to the SPEC, ISSUE and DEF definition heads, which must mint a label because nothing precedes them.

**Acceptance checks:**
- CRITIQUE APPLIED — dependsOn now includes t2, so the LLD's reasoned ordering (anchor before label, because a label-first fix leaves a defect same-day fixtures cannot see) is ENCODED rather than merely documented. order is advisory where dependsOn is binding, and a build in this session already followed id digits over the order field
- A standalone LLD's persisted epicSlug EQUALS its definition artifact's, the direct inversion of the live defect where the ISSUE said one thing and the LLD coined another
- The three definition-head derivations are UNEDITED — asserted by diff against the pre-change baseline
- The fallback still applies when no definition artifact supplies a label, so a work item without one behaves as it does today
- An empty-string label on the definition artifact is treated as ABSENT and never composes a folder name beginning with a separator
- MUTATION PROOF, run and recorded: restoring the unconditional derivation turns the slug-equality test red

### 1.4 E20261003e20235c1:S001:T004 — Stamp the placement flag on the PLAN and BUILD records

Have the writers that currently omit the standalone flag carry the inherited value, so neither stage is the point at which placement flips. Critically this must NOT reinstate an asserted false: a prior fix deliberately removed that assertion so a prior true value could be carried forward by the merge, and reinstating it would re-break what that fix repaired. The flag is supplied truthfully from the definition artifact rather than inferred from the record's own absence.

**Acceptance checks:**
- A standalone work item's PLAN meta carries the placement flag true
- The same for its BUILD meta
- NO writer asserts the flag false — asserted explicitly, because the prior fix that removed that assertion must not be undone
- CRITIQUE APPLIED — the carry-forward is now tested, not just the prohibition: a record written with the flag true, then re-written by a path that OMITS it, still resolves as standalone and its markdown does NOT move. That relocation-and-orphaning is the exact regression the prior fix prevented, and forbidding the assertion without testing the carry-forward left the plan one refactor away from reintroducing it
- An epic-parented work item is unaffected: absent and false both still mean epic
- MUTATION PROOF, run and recorded: dropping the stamp puts both records back under the wrong top-level

### 1.5 E20261003e20235c1:S001:T005 — Fix the BUILD folder-arg derivation so an ISSUE-anchored item gets a real label

Route the non-standalone branch's single upstream read through the new accessor rather than the define artifact alone, so it stops returning an undefined label for a work item defined by an ISSUE. Removing that undefined is what stops the raw-hash fallback being reached. The function keeps its five parameters and its returned shape, and it has exactly one caller. With this task every NEW artifact of a work item lands in one folder; nothing on disk has moved yet.

**Acceptance checks:**
- An ISSUE-anchored work item yields a real label where it previously yielded undefined
- The raw sixteen-hex hash appears nowhere in the resulting folder name
- A standalone story's BUILD record is written under the standalone top-level and renders with its standalone heading, not the plan-driven title with 'Standalone: no'
- A Trivial standalone build with no LLD still falls back to the record's own anchor and still resolves as standalone
- CRITIQUE APPLIED — the fallback is proven REACHABLE rather than merely present: a work item with NO definition artifact at all still composes a folder name, degrading to the hash without throwing or producing a malformed name. A guard that survives in source while becoming unreachable is indistinguishable from a deleted one, and t1 is what narrows the path to it
- MUTATION PROOF, run and recorded: restoring the DEF-only upstream read brings the raw-hash folder name back

### 1.6 E20261003e20235c1:S001:T006 — Converge the folders already scattered on disk

Extend the existing docs-tree migration so it recognises multiple folders sharing one identity segment and plans their convergence onto the one the definition artifact designates, rewriting links into moved paths and reporting anything it cannot place as unmappable rather than guessing or overwriting. Planning stays read-only and separate from applying. The live inputs are concrete and already committed: four folders share one segment, including one labelled with a raw hash and one under the wrong top-level, and two further segments have two folders each — both of those pairs forked by this session's own design documents while designing this very fix.

**Acceptance checks:**
- CRITIQUE APPLIED — dependsOn widened from t5 alone to the full t2-t5 set. The convergence destination depends on the anchor (t2), the label (t3), the placement (t4) AND the slug resolution (t5); with any one still broken the target folder is itself wrong. The t2 omission was the real hazard: the anchor determines the identity SEGMENT the convergence keys on, so running this first could have moved files into a folder invalidated the moment t2 landed
- PRECONDITION ASSERTED FIRST, so the end state cannot pass vacuously: the fixture is verified to START with four distinct folders before the migration runs
- A pre-seeded work item with FOUR folders, one artifact each, converges onto one
- A folder labelled with a raw hash and a folder under the wrong top-level are both handled
- Anything unplaceable is reported as unmappable rather than guessed at or overwritten
- Planning leaves the docs tree BYTE-IDENTICAL — only applying moves anything
- Links pointing into moved paths are rewritten
- Run against this repo, the live segments E20261002792f9324, E20261003e20235c1 and E202610036f31771d each end with exactly one folder
- CRITIQUE APPLIED — MUTATION PROOF, run and recorded (t6 previously had none while t1-t5 all did, so t7's promise to re-run every proof could not have been kept): disabling the group-by-segment step so the planner treats each folder independently turns the four-folder convergence test red

### 1.7 E20261003e20235c1:S001:T007 — Prove the epic route untouched, then close with measured evidence

The guard that the preceding six tasks changed only bugfix-shaped work items, plus the Story's closing evidence. Assert by diff that nothing touched the thirty-five derivation call sites, the fifty-two path-construction sites, or the three definition-head derivations, and that an epic-parented chain produces byte-identical paths to the pre-change baseline. Then run the full sweep with real counts from actual output, re-run every mutation proof from t1 through t6 to confirm no later task neutralised an earlier guard, and record the criteria provenance split.

**Acceptance checks:**
- An epic-parented chain produces byte-identical paths to the pre-change baseline
- CHANGED FILE SET asserted: no edit appears to the thirty-five derivation call sites, the fifty-two path-construction sites, or the three definition-head slug derivations
- Path construction is still pure: a path composes correctly for a repo directory that does not exist, which is only possible if nothing is read
- Full sweep run with real pass, fail and skip counts from actual output, taken from a stable repeat run, and no new failures beyond the known pre-existing native-ABI one
- CRITIQUE APPLIED — wording now matches reality: all SEVEN mutation proofs, t1 through t6 inclusive of t6's newly-added one, re-run at the end and still inverting. The previous wording promised to re-run a t6 proof that did not exist
- The record states plainly that a clean typecheck is NOT evidence about the tests, because the config excludes them
- The criteria provenance split is recorded: lc1-lc4 user-grounded, lc5-lc8 and ac1-ac10 LLD-authored and provisional per the ruling on this Story
- The ordering dependency on the sibling Story is restated: this Story landed the accessor, and ISSUE-6f31771d060cb412 widens it from three metadata fields to the whole definition

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readEpicDefinitionCore: DEF present and readable wins outright | `t1` |
| readEpicDefinitionCore: DEF absent, ISSUE present yields the ISSUE's values | `t1` |
| readEpicDefinitionCore: DEF present but CORRUPT falls through to a valid ISSUE (first-READABLE-wins, not first-PRESENT-wins) | `t1` |
| readEpicDefinitionCore: neither readable yields {} and does not throw | `t1` |
| readEpicDefinitionCore: a hash carrying BOTH artifacts resolves to the DEF and never consults the ISSUE | `t1` |
| readArtifactCore: the added standalone field is reported when boolean and omitted when absent or non-boolean, with the two pre-existing fields unaffected | `t1` |
| readEpicCreatedAt: an ISSUE-anchored work item yields the ISSUE's createdAt instead of undefined | `t2` |
| readEpicCreatedAt: signature and return meaning unchanged for a DEF-bearing epic | `t2`, `t7` |
| buildRecordFolderArgs: the non-standalone branch yields a real slug for an ISSUE-anchored work item instead of undefined | `t5` |
| buildRecordFolderArgs: an explicit standalone=true still reads the LLD branch and still falls back to ownCreatedAt for a Trivial build with no LLD | `t5` |
| workItemKindOf: only an explicit true is standalone; absent and false both remain 'epic' | `t4`, `t7` |
| An empty-string epicSlug on the definition artifact is treated as ABSENT and never composes a folder name beginning with a separator | `t3` |
| A full standalone/bugfix chain — ISSUE, then standalone LLD, then PLAN, then BUILD — writes every markdown artifact into exactly one folder, asserted by enumerating the docs tree and counting folders carrying the work item's identity segment | `t5` |
| That one folder sits under docs/standalone and its label equals the ISSUE's epicSlug, not a label derived from any later stage's focus prose | `t3` |
| A standalone LLD's persisted meta.epicSlug EQUALS its ISSUE's, which is the direct inversion of the live defect where the ISSUE said 'regression-hierarchical-label-resolver-listepichashes-src' and the LLD said 'lld-revision-supersedes-earlier-pass-whose' | `t3` |
| PLAN and BUILD metas both carry standalone true, so neither stage is the point at which placement flips | `t4` |
| A standalone story's BUILD.md renders with the standalone heading and 'Standalone: yes', not 'Build (plan-driven)' with 'Standalone: no' | `t5` |
| An ISSUE-anchored BUILD record's folder label is the real slug, and the raw 16-hex hash appears nowhere in the folder name | `t5` |
| REGRESSION GUARD, asserted not assumed: an epic-parented chain (DEF, HLD, LLD, PLAN, BUILD) produces byte-identical paths to those produced before the change, so the thirty-five unedited workItemKindOf call sites are provably unaffected | `t7` |
| DEGRADATION: a work item with neither DEF nor ISSUE behaves exactly as today — label from the stage's own prose or the hash — and nothing throws | `t1`, `t5` |
| The migration converges a pre-seeded work item that already has FOUR folders, one artifact each, onto one, and reports anything it cannot place as Unmappable rather than guessing or overwriting | `t6` |
| planMigration remains read-only: calling it leaves the docs tree byte-identical, and only applyMigration moves anything | `t6` |
| PURITY: the markdown path builders perform NO filesystem read. Asserted structurally rather than by inspection — construct a path for a repo directory that does not exist and assert a correct string is still returned, which is only possible if nothing is read | `t7` |
| The definition artifact is consulted at finalize time only and never during path resolution, the rule readEpicCreatedAt's own doc comment states about itself | `t2`, `t7` |
| CLOCK INDEPENDENCE: two stages finalized with their own clocks on OPPOSITE sides of midnight UTC still resolve to one identity segment, because both inherit the definition artifact's anchor. This is the latent fork, and it is invisible under same-day fixtures — the live work item's 18:19 and 20:03 timestamps masked it — so the fixture must deliberately straddle a date boundary or the test proves nothing | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails — folder composition: workItemRoot names a work-item folder label-plus-identity-segment, so the mutable label participates in the path (grounds lc1 and lc2)` — "A work item's folder name is composed as label-plus-identity-segment, where the identity segment is the stable part and the label is only a readable label that never determines identity."
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails — readEpicDefinitionCore: the single place the DEF-equals-ISSUE equivalence is expressed, DEF-first then ISSUE, first-READABLE-wins, never throws (grounds lc3 and ac9)` — "Order is DEF first, ISSUE second, copied from the identical order already used by the tracker resolver's readEpicIdentity so the two cannot disagree about which artifact defines a work item."
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails + dataModelChanges — readEpicCreatedAt resolves through the accessor, and WorkItemIdentity.epicSegment is derived from the anchor DATE only (grounds ac6, lc6 and lc8)` — "The epicSegment is derived from the anchor DATE only, so two anchors differing by time of day collide to one segment while two differing by date do not."
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails — buildRecordFolderArgs: the non-standalone branch consults the accessor rather than defineArtifactId alone, so the epicSlug-or-hash default stops being reached (grounds ac4, ac5 and lc4)` — "Removing that undefined is what stops the `epicSlug ?? epicHash` default from being reached, which is the raw-hash folder name."
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges — BuildRecord.meta and PlanArtifact.meta carry the inherited placement flag, and the writer must NOT reinstate an asserted false (grounds ac3 and lc5)` — "A prior fix deliberately stopped writing `standalone: false` here so that mergeWithPrior could carry a prior value forward; that remains correct, and this Story supplies the TRUE value rather than rei"
- **[[c6]]** `prior-artifact` `LLD S001 migration — the docs tree contains exactly one folder per work item, converged over the existing planMigration / applyMigration surface with unmappables reported (grounds ac8 and lc7)` — "Migration planning stays read-only and separate from applying: planMigration reports moves, link rewrites and Unmappable entries without touching the tree, and applyMigration is a distinct call."
- **[[c7]]** `prior-artifact` `LLD S001 alternativesConsidered a1 — the chosen alternative: stamp the work item's identity at finalize time, extending the epicCreatedAt precedent, with one accessor serving both consumers (grounds the a1 alternative)` — "Generalize the existing readEpicCreatedAt into a single definition-artifact reader that resolves DEF-then-ISSUE for one epic hash and returns the work item's three epic-level properties together."
- **[[c8]]** `prior-artifact` `LLD S001 testStrategy — the one-folder-per-work-item chain assertion, the epic-route regression guard and the path-purity smoke test (grounds ac1, ac2, ac7 and ac10)` — "A full standalone/bugfix chain — ISSUE, then standalone LLD, then PLAN, then BUILD — writes every markdown artifact into exactly one folder, asserted by enumerating the docs tree and counting folders "
