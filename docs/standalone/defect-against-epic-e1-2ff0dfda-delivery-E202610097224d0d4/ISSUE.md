<!-- insrc:artifact ISSUE-7224d0d4493d01d5 -->

# Publish each work item's purpose, size, issue body and recorded feedback in the delivery snapshot

## Reproduction

1. With the daemon running, call workflow.delivery for this repo (or open the VS Code delivery board).
2. Look at any story, epic or issue item in the returned DeliverySnapshot.

Observed: each DeliveryItem carries id, kind, title, standalone, sourceIds, parent/child ids, stage, evidence, tasks, validation, conflict, correctsRef, amendments, notices and attention fields, and nothing else. There is no field for:
- a story's purpose (its recorded user value) or its recorded size estimate;
- an epic's problem statement or summary;
- an issue's reproduction (observed vs expected), root cause or fix intent;
- the human feedback recorded on an item's artifacts.

These values exist in the source records: DEF stories record userValue and an optional sizeEstimate, and DEF bodies record the problem and an optional summary. ISSUE bodies record reproduction, rootCause and fixIntent, and DEF, LLD and PLAN bodies can carry a feedback record.

Expected (PRD §03, §04, §07 and mocks B and D): the read model publishes each item's summary or purpose, its recorded size when present, an issue's fix intent and observed-vs-expected, and existing feedback (shown read-only). It must also say whether a value is missing or simply does not apply to that kind of item. Without these, a client cannot render mock B's purpose paragraph and size chip, or mock D's observed → expected and recorded-feedback panels, short of opening the artifacts itself, which the PRD forbids.

## Root cause

E1's published contract (the HLD's sc7 sketch, implemented as DeliveryItem in src/workflow/delivery/types.ts) was limited to identity, hierarchy, stage, gates, evidence and notices. snapshot.ts builds every DeliveryItem from the work-item graph and the stage, gate and currency passes (itemOf, snapshot.ts:112), and none of those passes reads the descriptive fields of the source bodies. A search of src/workflow/delivery finds no reference to userValue, sizeEstimate, reproduction, rootCause, fixIntent or feedback. The graph pass keeps only titles from the bodies (DEF story titles, ISSUE titles, PLAN task titles). So the values are dropped when the snapshot is built, and the VS Code plugin, which must not read artifacts directly (PRD §07), has no way to show them.

## Fix intent

The delivery snapshot will publish, additively within schemaVersion 1 and with the daemon as the only interpreter:
- each story's purpose and recorded size estimate;
- each epic's problem or summary;
- each issue's reproduction, root cause and fix intent;
- the feedback already recorded on an item's artifacts, as read-only evidence.

Each value is taken only from the source records, never generated. It can be told apart as recorded, not recorded, or not applicable to the item's kind. The VS Code plugin's contract mirror picks up the new fields, so a type drift fails its typecheck. The snapshot stays deterministic, and its size and build time stay within the board's 1,000-artifact performance budget; if feedback is too large to inline, it is reachable through the existing per-item evidence request instead. The tests that pin the snapshot shape are extended to cover the new fields.

## Citations

- **[[c1]]** `doc` `docs/insrc-delivery-board-prd.html` — "Each work item needs a stable identity, original source identities, type, title, summary, parent/child relationships, derived stage and reason, gate signals, tasks, artifact references, revision times"
- **[[c2]]** `doc` `docs/insrc-delivery-board-prd.html` — "Preserve issue title, fix intent, magnitude when recorded, parent reference, feedback, and associated fix work."
- **[[c3]]** `code` `/home/subho/work/dev/insors/insrc/src/workflow/delivery/types.ts` — "export interface DeliveryItem { readonly id; readonly kind; readonly title: string | null; readonly standalone; readonly sourceIds; readonly parentId; readonly childIds; readonly stage; readonly evide"
- **[[c4]]** `code` `/home/subho/work/dev/insors/insrc/src/workflow/delivery/snapshot.ts` — "const itemOf = (node: WorkItemNode): DeliveryItem => {"
- **[[c5]]** `analyze-bundle` `insrc_analyze_step structural map of src/workflow/delivery: search for userValue|sizeEstimate|reproduction|fixIntent|rootCause|feedback returned zero hits; in-degree 2 (vscode-plugin/src/delivery/delivery-contract.ts, delivery-client.test.ts)`
- **[[c6]]** `code` `/home/subho/work/dev/insors/insrc/src/workflow/artifacts/define.ts` — "export interface DefineStory { readonly id; readonly title; readonly userValue: string; ... readonly sizeEstimate?: 'S' | 'M' | 'L' | 'XL'; ... } export interface DefineBody { readonly flavor; readonl"
- **[[c7]]** `code` `/home/subho/work/dev/insors/insrc/src/workflow/artifacts/issue.ts` — "export interface IssueArtifactBody { readonly title: string; readonly reproduction: string; readonly rootCause: string; readonly fixIntent: string }"
- **[[c8]]** `code` `/home/subho/work/dev/insors/insrc/src/workflow/delivery/graph.ts` — "title: head.kind === 'DEF' ? str(head.meta['epicSlug']) : str(obj(head.body)['title'])"
- **[[c9]]** `code` `/home/subho/work/dev/insors/insrc/vscode-plugin/src/delivery/delivery-contract.ts` — "export type DeliveryItemView = Pick<DeliveryItem, 'id' | 'kind' | 'title' | 'standalone' | 'sourceIds' | 'parentId' | 'childIds' | 'stage' | 'evidence' | 'tasks' | 'validation' | 'storyLevelResult' | "
- **[[c10]]** `prior-artifact` `docs/standalone/defect-against-epic-e2-6a131558-vs-E20261009b2687832/ISSUE.md` — "Values the daemon does not publish (purpose, size, an issue's observed and expected behaviour, recorded feedback) stay out of scope and are left to a separate read-model issue."
