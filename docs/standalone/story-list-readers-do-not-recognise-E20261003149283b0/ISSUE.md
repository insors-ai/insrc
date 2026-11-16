<!-- insrc:artifact ISSUE-149283b0d0455a43 -->

# Make the story-list readers recognise an ISSUE-anchored work item

## Reproduction

OBSERVED on this repository.

1. Pick a bugfix work item — one whose definition artifact is an ISSUE rather than a DEF. `e20235c17f083a16` is a complete example: it has a Story S001 with an approved LLD, an approved PLAN, an approved BUILD and a code-review record, all on disk.
2. Build the chain report for it.
3. OBSERVED: zero stories. The same result for `792f9324fc43d95c`, also ISSUE-anchored and also carrying a full Story. Neither has a DEF file; both have an ISSUE.
   EXPECTED: one story, with its artifact and approval state — the report's whole purpose is to answer 'what stage is this work item at, and what runs next'.

The orchestrator side fails differently for the same reason: paths that load the Epic for a work item throw 'Define artifact not found at <path>. Run `insrc_workflow_step` workflow=define ... first' — advice that is wrong for a bugfix item, which is not supposed to have a Define at all.

Consequence in practice: `insrc workflow chain` is the tool for asking what step comes next, and it silently under-reports every bugfix work item as having no stories. Silently, because zero stories is a legitimate state for a freshly framed Epic, so nothing looks broken.

SECOND REPRODUCTION — the producer side, OBSERVED.

1. Approve a magnitude: sized ISSUE.
2. Follow its generated nextCall into design.story.
3. OBSERVED: the LLD receives a new hash, standalone: true and sizeClass: bugfix, but no originating ISSUE identity.
4. Design review then fails with 'Missing Epic/ISSUE provenance'; it cannot downgrade to standalone.

## Root cause

The definition reader these paths use only knows about DEF files.

readDefineArtifact builds a path for the DEF artifact id and throws ArtifactMissingError when that file is absent. It never looks for an ISSUE. So for an ISSUE-anchored work item every caller of requireApprovedEpic fails at that point, and chain.ts — whose own guard treats a missing definition artifact as 'no epic' — returns an empty story list.

IMPORTANT CORRECTION to how this defect was first described. The original note said these paths read `body.stories` on an undefined array. They do not: the DEF-only read throws, or is guarded, BEFORE any story list is touched. The `body.stories` reads in chain.ts and in the orchestrator are downstream symptoms, not the fault. Fixing them in place would not help, because control never reaches them.

The intended semantics already exist elsewhere in the codebase and are stated explicitly: the tracker's own definition reader tries DEF and then ISSUE, and its story-existence check records that 'An ISSUE declares no story list — the bugfix route is one story at ordinal 1'. So an ISSUE-anchored item HAS a well-defined story set of exactly one. That knowledge simply lives in the tracker module and is not what the chain report or the orchestrator call.

UPDATED ROOT CAUSE — the defect also sits upstream, in the producer. nextAfterIssue (src/workflow/bugfix/next-after-issue.ts) emits the sized route WITHOUT epicHash or storyId. design.story therefore creates a new standalone root instead of LLD-<issueHash>-s1, and the ISSUE root is discarded before any consumer runs.

The first description covers consumers that fail to read ISSUE roots. This record must also cover the producer that discards the ISSUE root before those consumers are reached; fixing only the readers leaves the sized route orphaned from its ISSUE.

## Fix intent

A work item whose definition artifact is an ISSUE should be as legible to these paths as one with a DEF — its single Story reported by the chain report, and no advice to run a stage that does not apply to it.

Deliberately NOT settled here, because it is the design decision this defect turns on: WHICH callers adopt the ISSUE-aware reading. requireApprovedEpic has nine non-test call sites, and they do not all want the same answer — designing an Epic's HLD legitimately requires a real Epic and should keep refusing an ISSUE, while the chain report and the story-level paths should tolerate one. Making the shared reader ISSUE-aware for everyone would silently change what design.epic accepts; making it caller-by-caller risks a third inconsistent convention. That trade belongs in an LLD with its alternatives written down.

Two things the correction should achieve regardless of that choice. The one-implied-story rule should be stated in ONE place rather than re-derived, since it already exists in the tracker module and a second copy is how these divergences start. And the misleading 'run define first' guidance should stop being produced for work items that can never have a Define — whatever replaces it should name the real situation.

Out of scope and already owned elsewhere: the separate breach at the tracker resolver's issue path, which belongs to item 5 of the six-low-severity-defects issue.

REQUIRED BEHAVIOUR — sized ISSUE route.

- The sized route must retain issue.meta.issueHash as the work-item anchor.
- It must explicitly target storyId: "s1".
- The resulting LLD, PLAN, BUILD, reviews, chain report and documents must remain under that ISSUE's identity and folder.
- standalone: true may continue to describe folder/workflow layout, but must never mean 'independent of the ISSUE'.
- Design review must classify the LLD as kind: issue and require the approved originating ISSUE.

REGRESSION COVERAGE required:

- Sized ISSUE -> LLD uses LLD-<issueHash>-s1.
- LLD metadata and folder preserve the ISSUE anchor and creation time.
- Design review admits it and includes the ISSUE as originating_issue.
- Chain reporting returns its implied s1.
- PLAN and BUILD continue with the same identity.
- Genuine standalone features and Epic stories remain unchanged.
- A bugfix LLD genuinely missing ISSUE provenance remains rejected.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts:116` — "export function readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact {"
- **[[c2]]** `code` `src/workflow/gates.ts:120` — "Define artifact not found at ${jsonPath}. Run `insrc_workflow_step` workflow='define' focus='...' first."
- **[[c3]]** `code` `src/workflow/chain.ts:161` — "if (define.artifact === undefined) return []; const stories = define.artifact.body.stories;"
- **[[c4]]** `code` `src/workflow/tracker/resolve.ts:209` — "export function readEpicDefinition(dir: string, epicHash: string): EpicDefinition | null"
- **[[c5]]** `code` `src/workflow/tracker/resolve.ts:292` — "An ISSUE declares no story list — the bugfix route is one story at ordinal 1."
- **[[c6]]** `code` `src/workflow/chain.ts:84` — "export function buildChainReport(repoPath: string, epicHash: string): ChainReport {"
- **[[c7]]** `code` `src/workflow/runners/design-epic/index.ts:104` — "const epic = requireApprovedEpic(ctx.intent.repoPath, hash);"
- **[[c8]]** `prior-artifact` `LLD open question q47b99182 — its rationale records 'The orchestrator.ts / chain.ts gap has no tracked home at all' and that the follow-up ISSUE was owed and unfiled; this record discharges that obligation`
- **[[c9]]** `prior-artifact` `ISSUE-e20235c17f083a16 / S001 — the work item that reports zero stories despite a full approved artifact set`
- **[[c10]]** `code` `src/workflow/bugfix/next-after-issue.ts:78` — "workflow: 'design.story', focus: scope, params: { standalone: true, storyTitle: title, storySpec: scope, sizeClass: 'bugfix' }"
