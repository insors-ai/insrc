<!-- insrc:artifact ISSUE-3a98d27994547262 -->

# Inherit a work item's folder label from its definition head, not from its LLD

## Reproduction

Observed live on this repository, not hypothetically.

1. Take a standalone bugfix work item whose ISSUE carries one label and whose LLD re-derived a different one from its own focus (before the label fix, every stage derived its own). Work item e20235c17f083a16 is a concrete example: its ISSUE reads `artifact-docs-folders-fork-per-stage` while its LLD reads `make-work-item-keep-exactly-one`.
2. Finalize a PLAN for that story, then complete and approve its BUILD.
3. OBSERVED: the PLAN.md and BUILD.md land under the LLD's label, while the ISSUE.md sits under the ISSUE's label — two folders for one identity segment. Re-approving re-renders the BUILD at the LLD-labelled path a second time, so one artifact ends up with two markdown files whose content differs.
   EXPECTED: every artifact of one work item resolves to exactly one folder, named for the work item's definition head.

Scale of the live symptom before repair: 13 artifact identities each had two markdown files, and 33 of 116 identity segments had more than one folder.

## Root cause

The label reaches a PLAN or BUILD TRANSITIVELY, through the LLD, instead of directly from the definition head.

finalizePlan computes `const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);` — so whatever slug the LLD persisted is what names the plan's folder. buildRecordFolderArgs has the same shape but only on one side of a branch: its non-standalone path already resolves through readEpicDefinitionCore (DEF then ISSUE), while its standalone path reads the LLD's own record. The asymmetry is not accidental and is stated in the function's own comment: 'The standalone branch still reads the LLD.'

So the correctness of a plan's or build's folder depends on the LLD having the right label, rather than on the one artifact that defines the work item. An LLD that re-derived its own slug propagates that slug to every downstream stage, and the work item forks. The accessor that resolves the definition head already exists and is already used by the sibling branch — only these two reads bypass it.

This is distinct from, and was masked by, the anchor/identity defect fixed earlier: the anchor governs the identity SEGMENT and is already resolved through the definition head. The label is a separate field that was left behind.

## Fix intent

Make both reads resolve the label from the work item's definition head, so a PLAN's or BUILD's folder no longer depends on what its LLD happened to persist. The existing inherit-then-fallback helper is the intended path — it already prefers the head, already treats an empty stored label as absent, and already falls back to a freshly derived slug for a work item with no definition artifact — so this is a change of SOURCE, not of behaviour or contract. No new field, no new function, and no change to identity, anchor or placement.

Two consequences to state rather than design around: new PLAN and BUILD markdown for a standalone item will land under the definition head's label instead of the LLD's, and markdown already written at the old label is converged by the existing docs-tree migration rather than by this change. The deliberate asymmetry in buildRecordFolderArgs' comment should be removed along with the behaviour it documents, so the comment cannot outlive the code.

## Citations

- **[[c1]]** `code` `src/workflow/orchestrator.ts:2537` — "const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);"
- **[[c2]]** `code` `src/workflow/storage.ts:344` — "The standalone branch still reads the LLD."
- **[[c3]]** `code` `src/workflow/storage.ts:318` — "readEpicDefinitionCore — resolves the definition artifact, DEF then ISSUE, first-readable-wins"
- **[[c4]]** `code` `src/workflow/storage.ts:213` — "export function inheritedEpicSlug(repoPath: string, epicHash: string, fallback: string): string"
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:241` — "const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, merged.meta.standalone === true, merged.meta.createdAt);"
- **[[c6]]** `prior-artifact` `ISSUE-e20235c17f083a16 / S001 — the work item whose ISSUE and LLD carry different labels, and whose PLAN and BUILD followed the LLD's`
- **[[c7]]** `prior-artifact` `commit e8b2b36 — repaired the 13 already-written duplicate renders; this issue addresses the cause rather than the residue`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — issue (issue)

**0 HIGH · 2 MED · 8 LOW** · model `client` · reviewed 2026-10-03T14:35:12.944Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| p3 | semantic | MED | assisted | buildRecordFolderArgs is branch-asymmetric about the label source: its non-standalone path resolves through readEpicDefinitionCore while its standalone path reads the LLD's own artifact record. | HALF-CONFIRMED ONLY. The non-standalone half is verified: grep matched `: readEpicDefinitionCore(repoPath, epicHash);` at src/workflow/storage.ts:348. The standalone half is NOT addressed by the evidence — the probe `standalone\\s*\\n?\\s*\\?\\s*readArtifactCore\\(repoPath, lldArtifactId` returned ZERO matches, so nothing here shows what the standalone branch reads. | Re-probe the standalone branch with a single-line pattern, since the failure is a bad probe rather than a contradiction: ripgrep patterns are matched per line and this one spanned a line break across the ternary. `readArtifactCore\\(repoPath, lldArtifactId` would re-derive it. Until that runs, treat the asymmetry as asserted-not-verified. |
| p4 | citation | MED | auto | readEpicDefinitionCore exists and resolves the definition artifact DEF-first-then-ISSUE on a first-readable-wins basis. | The CONTENT is verified but the ANCHOR is off by two lines. grep confirms the DEF-then-ISSUE loop at src/workflow/storage.ts:318, and the read of :317 returns the signature `export function readEpicDefinitionCore(repoPath: string, epicHash: string): EpicDefinitionCore {`. The cited :320 resolves to a different line — `if (core.createdAt !== undefined \|\| core.epicSlug !== undefined \|\| core.standalone !== undefined) {` — which is inside the same function but is the first-readable-wins test, not the DEF-then-ISSUE ordering the citation describes. | Re-anchor citation c3 from :320 to :318, the line that actually carries the DEF-then-ISSUE iteration the quoted text paraphrases. |
| p1 | citation | LOW | manual | finalizePlan derives the plan's folder label from the LLD's persisted slug, via the expression `const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);` | Both probes confirm it exactly: grep matched `src/workflow/orchestrator.ts:2537` and the read of that anchor returned the line verbatim — `const epicSlug = lld.meta.epicSlug ?? safeDeriveSlug(intent.focus);`. The cited line and the quoted text agree with the file. | none — verified sound |
| p2 | citation | LOW | auto | buildRecordFolderArgs carries a comment stating 'The standalone branch still reads the LLD.' | grep found the comment in the real source at `src/workflow/storage.ts:344` — '// folder named with the raw hash. The standalone branch still reads the LLD,'. The quoted text is present verbatim. | Verified. Optional precision: citation c2 names the file with no line, and the evidence pins it to :344, so the anchor can be tightened. |
| p5 | citation | LOW | manual | An inherit-then-fallback label helper already exists and is exported with the signature `inheritedEpicSlug(repoPath: string, epicHash: string, fallback: string): string`. | grep and read agree: `export function inheritedEpicSlug(repoPath: string, epicHash: string, fallback: string): string {` is at src/workflow/storage.ts:213, matching the cited anchor and the quoted signature exactly. | none — verified sound |
| p6 | semantic | LOW | manual | inheritedEpicSlug treats an EMPTY stored label as absent and falls back, rather than composing a folder name from an empty string. | grep and read both return `return inherited !== undefined && inherited.length > 0 ? inherited : fallback;` at src/workflow/storage.ts:215. The `length > 0` test is the empty-label guard the premise claims, so an empty stored label does fall back. | none — verified sound |
| p7 | citation | LOW | manual | buildRecordFolderArgs is called from standalone-record.ts with the standalone flag passed as `merged.meta.standalone === true`. | grep and read both return the call site verbatim at src/workflow/runners/build/standalone-record.ts:241, including the `merged.meta.standalone === true` argument the premise names. | none — verified sound |
| p8 | inventory | LOW | manual | buildRecordFolderArgs has exactly ONE non-test call site, so changing its label source has a single write-path blast radius. | CONFIRMED by re-derivation. Of the 12 matches, exactly ONE is a non-test call in source: src/workflow/runners/build/standalone-record.ts:241. The only other source hit is the DEFINITION at src/workflow/storage.ts:333 (`export function buildRecordFolderArgs(`), which is not a call site; the remaining hits are four calls in src/workflow/__tests__/storage.test.ts and six in docs markdown. | none — verified sound. The count holds on the strict reading the premise uses (non-test call sites), and the blast-radius conclusion follows. |
| p9 | cross-artifact | LOW | manual | Work item e20235c17f083a16 has an ISSUE whose epicSlug is 'artifact-docs-folders-fork-per-stage' and an LLD whose epicSlug is 'make-work-item-keep-exactly-one' — the two differing labels the reproduction depends on. | Both labels are corroborated. The LLD's own rendered header carries `**Epic:** \\`make-work-item-keep-exactly-one\\`` (docs/standalone/artifact-docs-folders-fork-per-stage-E20261003e20235c1/S001/LLD.md:7), and that same LLD's citation c9 records the ISSUE's epicSlug as 'artifact-docs-folders-fork-per-stage' (LLD.md:374 and :411). So one work item demonstrably carries two different labels, which is the arrangement the reproduction needs. | none — verified sound. Worth noting the confirmation came from rendered markdown rather than the JSON store the premise anchors on; the two agree, so the premise stands. |
| p10 | semantic | LOW | manual | The identity ANCHOR is already resolved through the definition head, so this defect concerns only the LABEL and not the identity segment — readEpicCreatedAt reads the definition core rather than the define artifact alone. | grep confirms `const createdAt = readEpicDefinitionCore(repoPath, epicHash).createdAt;` at src/workflow/storage.ts:250, which is the anchor read resolving through the definition head rather than the define artifact alone — exactly the premise's claim that the anchor is already fixed and only the label remains. | none — verified sound. This is the premise that keeps the issue's scope honest: it is why the record claims the label only and does not reopen identity. |

#### Proposed fixes

- **p3** (assisted) — The evidence neither confirms nor contradicts the standalone half, so this is unverifiable rather than wrong. It does not change what gets built — the prescribed change (route both reads through the head) stands on the confirmed half and on p1 — so it is MED, not HIGH. No artifact edit is proposed because the premise may well be correct; what is missing is a probe that can see it.
  - option: Re-run with the single-line pattern `readArtifactCore\(repoPath, lldArtifactId` to confirm the standalone branch's source
  - option: Add an explicit line anchor for the standalone branch to citation c2's neighbourhood so a read, not a grep, confirms it
  - option: Leave as asserted and let the build stage's own reading settle it, accepting that this premise entered the record unverified

- **p4** (auto) — A stale anchor pointing at the right function but the wrong line. The prescribed change is unaffected — readEpicDefinitionCore demonstrably exists and demonstrably reads DEF then ISSUE — so this is imprecision, not a defect that alters the build. The replacement line is taken directly from the grep match.
  - edit: ``src/workflow/storage.ts:320` — "readEpicDefinitionCore` → ``src/workflow/storage.ts:318` — "readEpicDefinitionCore`

- **p2** (auto) — The premise is sound; only the citation's granularity is loose. The evidence gives the exact line, so adding it is a mechanical correction derived entirely from the gathered match.
  - edit: ``code` `src/workflow/storage.ts` — "The standalone branch still reads the LLD."` → ``code` `src/workflow/storage.ts:344` — "The standalone branch still reads the LLD."`
