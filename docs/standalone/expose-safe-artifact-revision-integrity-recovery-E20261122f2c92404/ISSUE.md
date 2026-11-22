<!-- insrc:artifact ISSUE-f2c92404fe4d50a6 -->

# Expose safe artifact revision and integrity recovery to tool sessions

## Reproduction

1. In an installed insrc session on another machine or while working outside the insrc source repository, start with a human-approved HLD (the same gap applies to other lifecycle-managed artifacts).
2. Need to incorporate edits and obtain approval of the revised content. The public tool catalog exposes approval but no supported content-revision or integrity-recovery operation; the session cannot invoke the internal LifecycleService.updateContent API.
3. If canonical JSON is edited directly without lifecycle bookkeeping, the stored content hash can differ from the current body/citations. Approval refuses with hash-mismatch, and retrying approval cannot repair the record. [[c1]] [[c2]] [[c4]]
Expected: a supported public operation records the revised content as a new draft revision, refreshes the review document, and permits a separate presentation/human-reapproval step; an already inconsistent head has an explicit audited recovery path.
Evidence limit: the user reported this on another machine; its exact artifact and error trace were not supplied. The current local security HLD is not the affected reproduction. The missing public operation and integrity-refusal behavior were confirmed from source; no remote reproduction is claimed. [[c5]]

## Root cause

LifecycleService.updateContent provides journaled content replacement internally, and reconcileLifecycle returns changed non-terminal artifacts to draft with a new content hash/revision. checkIntegrity checks both canonical content and revision-bearing history; approveArtifactByJsonPath refuses inconsistent heads before approval. The store has explicit conflict-resolved handling, but the inspected public MCP/workflow surface exposes neither an artifact-content revision operation nor an explicit recovery route. Thus tool-only sessions lack the supported transition from approved content to a consistent revised draft, and cannot recover a directly edited mismatched head. Automatic adoption handles eligible self-consistent head-ahead-of-log revisions, not hash-mismatch. [[c1]] [[c2]] [[c3]] [[c4]]

## Fix intent

Provide a supported tool/workflow operation to revise lifecycle-managed artifact content using expected prior revision/hash to refuse stale writers. Reuse lifecycle/store authority to create and log a new draft revision, preserve prior approval/history as historical evidence, and regenerate the rendered document. Provide explicit audited recovery for already mismatched canonical heads, distinguishing content/hash damage from conflicting history and refusing ambiguous recovery. Keep integrity checks and team/signoff/terminal-state restrictions intact. Revision/recovery must never approve content: require insrc_present and explicit human approval afterward. Validate normal approved-to-draft revision, stale-writer rejection, mismatch recovery/history consistency, rendering refresh, and tool-only access. Record this issue only; do not implement or auto-approve as part of logging it. [[c1]] [[c2]] [[c3]] [[c5]]

## Citations

- **[[c1]]** `code` `src/workflow/artifact-core/lifecycle-service.ts` — "updateContent replaces content through the store; apply adopts eligible head-ahead-of-log writes but refuses hash mismatch."
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts` — "contentHash covers canonical description/body/citations; reconcileLifecycle returns changed non-terminal content to draft."
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts` — "An ordinary write on a head whose stored hash differs from its content is refused; explicit conflict-resolved handling exists internally."
- **[[c4]]** `code` `src/workflow/gates.ts` — "Approval calls lifecycle.inspect with adoptable:true and rejects failed integrity before approval."
- **[[c5]]** `stakeholder` `User report in this conversation` — "LifecycleService.updateContent is not exposed as a tool; sessions not working on this repo have no access to it. A different machine is affected."
- **[[c6]]** `analyze-bundle` `insrc_analyze_step artifact-core investigation in this session` — "Located LifecycleService, ArtifactStore, reconcileLifecycle and checkIntegrity, with gates.ts as an importer. Graph incomplete; public-surface and store behavior supplemented by direct source reads."
