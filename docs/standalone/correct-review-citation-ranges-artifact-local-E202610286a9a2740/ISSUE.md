<!-- insrc:artifact ISSUE-6a9a2740212422e0 -->

# Correct review citation ranges and artifact-local evidence scope

## Reproduction

Review DEF-c32aa60534232f36 with citations such as src/workflow/code-review/subject.ts:121-177 and docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/DEF.md:27-34. The files and cited lines exist, but read probes return found:false; the independent review reports missing implementation and predecessor documents as HIGH. Separately, inventory/ordering probes such as constraint rows and 'Depends on:' search across other epics, hit the50-match cap and fail to verify this artifact's nine constraints and acyclic six-Story dependencies. Expected: valid citation ranges produce bounded, correctly labeled source evidence; artifact-local assertions inspect the actual artifact and cannot be contradicted using unrelated or incomplete search results. Reproduce with deterministic temporary-file fixtures rather than rerunning the expensive LLM review. [[c1]] [[c2]] [[c3]]

## Root cause

parseAnchor in src/workflow/review/probe.ts accepts only path:line and path:line:column. runRead returns the same found:false for unsupported anchor syntax, invalid location, forbidden location or absent files, allowing the verifier to confuse inability to read with proof of absence. gatherEvidence runs each probe.greps string over all derived source roots under a shared50-match cap. Probe in the existing review types and extraction schema offers strings with no explicit target-file scope; the extraction prompt even describes every grep as running over src/. Thus artifact-local structural claims cannot reliably request scoped evidence, and judge inputs can consist of capped matches from unrelated documents. The graph locates parser/gather and extraction entrypoints; source search also confirms the production design-review adapter consumes gatherEvidence. [[c1]] [[c2]]

## Fix intent

Restore accurate deterministic evidence for existing design reviews. Accept supported single-line, column and inclusive line-range citations, preserve path safety and finite evidence limits, and explicitly distinguish malformed/forbidden/missing/out-of-range or truncated evidence so none implies a false pass or false missing-code claim. Allow extracted probes to express the specific artifact or file(s) they intend to search; carry that scope through normalization, saved snapshots and daemon/controller gathering, with artifact-local inventory/ordering checks grounded in the artifact being reviewed and legitimate cross-source semantic/caller searches still permitted. Disclose missing or invalid scope and truncated/failed searches rather than silently widening to the repository. Preserve existing callers/legacy probe compatibility, independent review and serial providers. Validate valid ranges/endpoints/columns, malformed/reversed/oversized ranges, missing files, escaped or forbidden paths, many unrelated epics, local dependency/constraint checks and extraction-to-gather scope preservation using mock providers and focused regression suites. No live LLM review, deployment, commit or push is part of this issue approval. [[c1]] [[c2]]

## Citations

- **[[c1]]** `code` `src/workflow/review/probe.ts:142-232`
- **[[c2]]** `code` `src/workflow/review/extract.ts:137-156`
- **[[c3]]** `doc` `/tmp/plan-directed-review-probe-diagnosis.md`
- **[[c4]]** `stakeholder` `Conversation: user authorized fixing review evidence-probe defects on2026-10-28`
