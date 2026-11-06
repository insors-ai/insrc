<!-- insrc:artifact ISSUE-1ce76815d8037530 -->

# design.story LLDs can propose rebuilding existing surfaces that s1 analyze already surfaced

## Reproduction

Run triage -> standalone design.story on a request touching an existing component (observed: E202611031bd72813, multiple concurrent chats). s1 context.assemble runs insrc_analyze_step and the bundles name the existing surface (docs-review-panel.ts exports incl. createDocsReviewHost; the file was even flagged as the top tab-identity resolver candidate), yet the emitted LLD modeled the docs-review panel as having no existing tab keying seam and proposed building in-panel presentation instances - rebuilding what already exists. Expected: the current-behavior section states the existing panel/host and the change reuses it. Observed: the mis-model survived until the daemon review current-behaviour check (round 1) and a user clarification.

## Root cause

s1 (context.assemble) only produces analyze bundles; no later design.story step (s4 contract.detail, s8 checklist.verify) requires an explicit existing-surfaces reuse inventory grounded in those bundles, nor fails when a proposed new component matches an already-exported surface. Discovery surfaces the fact; nothing consumes it as a constraint.

## Fix intent

Add an explicit existing-components reuse inventory requirement to the design.story synthesis (grounded in s1 analyze bundles) and make s8 checklist.verify fail when a proposed new component matches an existing exported surface in the bundles. Prompt/checklist text + tests only; no runtime or daemon change.

## Citations

- **[[c1]]** `code` `src/workflow/runners/design-story/index.ts` — "s1 context.assemble prompt requires insrc_analyze_step for every code claim and emits analyzeBundles[] - but no later step must reconcile them as reuse targets."
- **[[c2]]** `analyze-bundle` `/Users/subhagho/.insrc/analyze/mcp-1793723118195-vqaxmg/context/run-bundle.json` — "Bundle names docs-review-panel.ts (43 entities, 12 exports incl. createDocsReviewHost) as top tab-identity resolver candidate, yet its summary says the profiles do not establish review-tab identity ru"
- **[[c3]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:2450` — "show(): if (channel !== undefined) { channel.reveal(...); return; } channel = deps.createPanel(...) - the host is a singleton holding one webview panel."
- **[[c4]]** `doc` `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/LLD.md` — "E202611031bd72813 S001 LLD - original revision proposed in-panel presentation instances; superseded only after review round 1 current-behaviour finding and user clarification that the panel is already"
