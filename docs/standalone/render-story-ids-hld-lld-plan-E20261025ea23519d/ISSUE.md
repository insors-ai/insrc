<!-- insrc:artifact ISSUE-ea23519d65a6b366 -->

# Render Story ids in HLD, LLD and PLAN documents from the Epic's creation date

## Reproduction

Create an Epic's Define on one day and write its HLD (or a Story's LLD or PLAN) on a later day. Observed: the HLD's Story headings, and the LLD and PLAN titles, show a Story id dated on the day that document was written, e.g. `E20261025ce99b720:S001` in docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/HLD.md. Expected: the same id the Define uses for that Story, `E20261023ce99b720:S001` in docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md, matching the Epic folder name. Readers and reviewers see two ids for one Story, and a reviewer flags it as a mismatch.

## Root cause

A Story id carries the date of the Epic it belongs to: storyWorkflowId takes a creation date and uses its UTC day (src/workflow/id.ts:150-153). The Define renderer passes the Define's own creation date, which is correct because the Define is the Epic's anchor (src/workflow/artifacts/define.ts:125). The HLD, LLD and PLAN renderers pass their own document's creation date instead (src/workflow/artifacts/hld.ts:169, src/workflow/artifacts/lld.ts:331, src/workflow/artifacts/plan.ts:116), so their ids drift whenever the document is written on a later day than the Epic. Other places already anchor correctly: the tracker uses the Define's creation date (src/workflow/tracker-auto.ts:207) and the companion header uses an anchor date (src/workflow/artifacts/companion/header.ts:134).

## Fix intent

The HLD, LLD and PLAN renderers mint every Story id from the Epic's anchor date (the Define's creation date) rather than from their own document's creation date, so a Story has one id across every document; standalone Stories keep their own anchor. Re-rendering an existing document corrects its ids. Regression tests render each document with a creation date later than its Epic's and check the ids match the Define's.

## Citations

- **[[c1]]** `code` `src/workflow/id.ts:150` — "export function storyWorkflowId(epicHash: string, createdAtISO: string, storyId: string): WorkflowId {"
- **[[c2]]** `code` `src/workflow/artifacts/hld.ts:169` — "const sid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, sb.storyId)) : undefined;"
- **[[c3]]** `code` `src/workflow/artifacts/lld.ts:331` — "const lldSid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, meta.storyId)) : undefined;"
- **[[c4]]** `code` `src/workflow/artifacts/plan.ts:116` — "const planSid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, meta.storyId)) : undefined;"
- **[[c5]]** `code` `src/workflow/artifacts/define.ts:125` — "const sid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, s.id)) : undefined;"
- **[[c6]]** `code` `src/workflow/tracker-auto.ts:207` — "const storyWid = safeCanonical(() => storyWorkflowId(epicHash, define.meta.createdAt, storyId));"
- **[[c7]]** `code` `src/workflow/artifacts/companion/header.ts:134` — "return safeCanonical(() => storyWorkflowId(source.epicHash, source.anchorCreatedAt, source.storyId)) ?? source.storyId;"
- **[[c8]]** `step-output` `insrc_review_step HLD-ce99b72065d03b1b 2026-10-25T05:45:26Z` — "Every HLD Story heading instead uses 'E20261025ce99b720:S001' through S007, although the artifact and directory still reference the original Epic."
