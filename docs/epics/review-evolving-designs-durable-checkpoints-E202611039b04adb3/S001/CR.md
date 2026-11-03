<!-- insrc:artifact CR-9b04adb36cac716d-s1 -->

# Code review: s1

Status: **incomplete** · task-based schema version 2

## design-review-s1-1793705142942 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-03T12:43:14.272Z

8 selected task assessment(s): incomplete.
Native output diagnostics: [{"phase":"assessment","taskId":"t8","provider":"claude","resolved":true,"errors":[{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/4","correction":"Return this field according to the supplied JSON schema.","occurrences":1},{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/5","correction":"Return this field according to the supplied JSON schema.","occurrences":2},{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/6","correction":"Return this field according to the supplied JSON schema.","occurrences":2},{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/7","correction":"Return this field according to the supplied JSON schema.","occurrences":2},{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/8","correction":"Return this field according to the supplied JSON schema.","occurrences":1}]}]

### Submitted scope

- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/review/design-review/__tests__/contracts.test.ts` — [{"after":[1,8]},{"after":[10,33]}]
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/review/design-review/contracts.ts` — [{"after":[1,1]},{"after":[2,2]},{"after":[4,11]},{"after":[13,160]},{"after":[161,172]}]
- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/__tests__/subject.test.ts` — [{"after":[1,86]}]
- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/subject.ts` — [{"after":[1,199]}]
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/__tests__/policy-results.test.ts` — [{"after":[1,17]},{"after":[19,33]},{"after":[34,41]}]
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/contracts.ts` — [{"after":[3,3]},{"after":[12,12]}]
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/policy.ts` — [{"after":[1,7]},{"after":[9,24]},{"after":[26,26]}]
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/results.ts` — [{"after":[1,49]},{"after":[51,60]}]
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[1,30]},{"after":[32,48]}]
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/fixtures.ts` — [{"after":[1,21]}]
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/checkpoint.ts` — [{"after":[1,92]}]
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/progress.ts` — [{"after":[1,28]},{"after":[30,50]},{"after":[52,56]},{"after":[57,59]},{"after":[60,69]},{"after":[71,71]}]
- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/__tests__/coordinator.test.ts` — [{"after":[1,4]},{"after":[5,11]},{"after":[13,21]},{"after":[23,60]}]
- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/coordinator.ts` — [{"after":[1,3]},{"after":[5,6]},{"after":[7,7]},{"after":[9,9]},{"after":[11,18]},{"after":[19,24]},{"after":[25,25]},{"after":[27,29]},{"after":[32,38]},{"after":[39,47]},{"after":[49,66]},{"after":[68,75]},{"after":[77,78]},{"after":[79,91]},{"after":[93,93]},{"after":[94,100]},{"after":[102,103]},{"after":[105,106]},{"after":[108,114]},{"after":[116,117]},{"after":[121,122]},{"after":[125,125]},{"after":[126,128]},{"after":[131,131]},{"after":[133,134]},{"after":[135,135]},{"after":[137,142]},{"after":[147,149]},{"after":[151,154]}]
- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/progress.ts` — [{"after":[60,60]}]
- `c9208b46c05c5e510269970d6661f3c4a69bc54b:src/workflow/review/design-review/__tests__/controller.test.ts` — [{"after":[1,6]},{"after":[8,30]},{"after":[31,59]}]
- `c9208b46c05c5e510269970d6661f3c4a69bc54b:src/workflow/review/design-review/coordinator.ts` — [{"after":[8,8]},{"after":[10,10]},{"after":[26,30]},{"after":[32,33]},{"after":[38,38]},{"after":[46,46]},{"after":[75,75]},{"after":[84,84]},{"after":[87,91]},{"after":[120,120]},{"after":[128,132]},{"after":[135,137]},{"after":[149,157]},{"after":[159,163]},{"after":[164,165]},{"after":[167,175]},{"after":[177,183]},{"after":[187,188]},{"after":[190,191]},{"after":[194,194]},{"after":[196,196]},{"after":[205,205]},{"after":[210,210]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/__tests__/repo-call-audit.test.ts` — [{"after":[12,12]},{"after":[25,25]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/__tests__/repo-call-table.test.ts` — [{"after":[12,12]},{"after":[22,22]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/design-review-rpc.ts` — [{"after":[1,29]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/repo-call-audit.ts` — [{"after":[54,54]},{"after":[171,176]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/steps/design-review-step.ts` — [{"after":[1,6]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/steps/host.ts` — [{"after":[22,22]},{"after":[81,81]},{"after":[105,105]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/threads/router.ts` — [{"after":[123,123]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/design-review.test.ts` — [{"after":[1,14]},{"after":[15,26]},{"after":[28,40]},{"after":[41,41]},{"after":[43,67]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/helpers/design-review-stdio.ts` — [{"after":[1,7]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/review-rule-text.test.ts` — [{"after":[66,66]},{"after":[68,70]},{"after":[96,98]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/code-review/schema.ts` — [{"after":[2,2]},{"deletionAt":6}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/design-review/handler.ts` — [{"after":[1,27]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/design-review/schema.ts` — [{"after":[1,10]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/server.ts` — [{"after":[3,4]},{"after":[87,87]},{"after":[618,627]},{"deletionAt":628}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/structural-schema.ts` — [{"after":[1,24]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/prompts/steering-block.md` — [{"after":[316,347]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/workflow/__tests__/review-unavailable.test.ts` — [{"after":[21,24]}]
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/workflow/review/design-review/coordinator.ts` — [{"after":[166,166]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:docs/design-review-execution.md` — [{"after":[1,49]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:docs/workflow.md` — [{"after":[17,18]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:scripts/smoke-design-review.mjs` — [{"after":[1,72]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/design-review-rpc.ts` — [{"after":[30,37]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/handler-runtime.ts` — [{"after":[617,622]},{"after":[1693,1693]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/repo-call-audit.ts` — [{"after":[54,59]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/threads/method-class.ts` — [{"after":[90,95]},{"after":[308,312]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/threads/router.ts` — [{"after":[27,27]},{"after":[122,122]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/__tests__/design-review.test.ts` — [{"after":[15,16]},{"after":[29,29]},{"after":[43,43]},{"after":[45,45]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/__tests__/schema-registry.test.ts` — [{"after":[49,49]},{"after":[55,55]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/server.ts` — [{"after":[191,193]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/prompts/steering-block.md` — [{"after":[392,392]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/__tests__/contracts.test.ts` — [{"after":[9,9]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts` — [{"after":[2,2]},{"after":[162,162]}]
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/progress.ts` — [{"after":[29,29]},{"after":[57,57]},{"after":[72,74]}]
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:.gitignore` — [{"after":[31,33]}]
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/__tests__/coordinator.test.ts` — [{"after":[12,12]},{"after":[22,22]},{"after":[61,67]}]
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/__tests__/policy-results.test.ts` — [{"after":[34,35]}]
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/results.ts` — [{"after":[50,50]}]
- `0d976b4fc9399521943f08aa4ac876b1b328074b:src/workflow/review/design-review/__tests__/coordinator.test.ts` — [{"after":[5,5]},{"after":[69,90]}]
- `0d976b4fc9399521943f08aa4ac876b1b328074b:src/workflow/review/design-review/coordinator.ts` — [{"after":[7,7]},{"after":[38,38]},{"after":[115,115]},{"after":[118,119]},{"after":[206,207]}]
- `eacc493fbcffd6d54abbfe557616b0123b739b4b:src/workflow/review/design-review/__tests__/coordinator.test.ts` — [{"after":[91,113]}]
- `eacc493fbcffd6d54abbfe557616b0123b739b4b:src/workflow/review/design-review/coordinator.ts` — [{"after":[9,9]},{"after":[27,27]},{"after":[137,137]},{"after":[142,143]},{"after":[146,148]},{"after":[151,152]}]
- `f2b723fe6d4c4968eb9572c1423ba3d93865a1b4:src/workflow/review/design-review/__tests__/controller.test.ts` — [{"after":[31,32]}]
- `f2b723fe6d4c4968eb9572c1423ba3d93865a1b4:src/workflow/review/design-review/coordinator.ts` — [{"after":[4,4]},{"after":[21,25]},{"after":[39,39]},{"after":[64,64]},{"after":[143,143]},{"after":[168,168]}]
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/__tests__/controller.test.ts` — [{"after":[7,7]},{"after":[62,77]}]
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/coordinator.ts` — [{"after":[113,113]},{"after":[115,115]},{"after":[175,175]},{"after":[188,188]},{"after":[215,215]},{"after":[219,219]}]
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[31,31]}]
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/__tests__/policy-results.test.ts` — [{"after":[18,18]}]
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/policy.ts` — [{"after":[8,8]},{"after":[25,26]}]
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/progress.ts` — [{"after":[51,51]}]

### t1: incomplete

t1's additive history (commits 4f6cc9aa0 → 64e2811ad → 5d8affec9) builds src/workflow/review/design-review/contracts.ts and its test file exactly as the selected blocks show; the current checkout matches the pinned final commit byte-for-byte for both files, and the focused test file passes live (2/2). The strict TypeBox schemas correctly reject unknown fields, bad ids/phases/attempts, oversized strings, non-absolute repo paths and non-serializable/oversized JSON, matching all three acceptance checks. Two issues: a dead local (`ids`) left over from the schema-construction pass, and a deliberately tighter `resultBytes` cap on the embedded `result` payload (distinct from the outer `requestBytes` envelope cap) that has no test proving it actually fires.

Coverage: **partial** — contracts.test.ts's two tests give strong behavioral coverage of the strict-validation surface: unknown/extra fields, bad ids ('../escape', ''), non-literal attempt (2, 0), invalid phase, oversized artifactPath/text, non-serializable JSON (BigInt), oversized bounded JSON, the new isAbsolute repo guard ('relative-project'), workflow-context round-trip and kind-enum rejection, progress query round-trip and extra-field/negative-cursor rejection, DesignResultSchema round-trip plus its snapshot-immutability guarantee (mutating the caller's array after decode does not affect the returned snapshot, which exercises the JSON.stringify/parse-based copy in decodeDesign), DesignResultSchema enum/length rejection, DesignPlanSchema's minItems coverage/chunks enforcement, and the result-phase envelope's sequence>=1 rejection. I ran the file live against the current checkout (which is identical to the pinned final commit for both files) and both tests passed. The one demonstrated gap is the resultBytes-vs-requestBytes double-cap branch at contracts.ts:163, which no test in the file (or the rest of the design-review suite, confirmed via grep for resultBytes/requestBytes usage) exercises with a payload sized to distinguish the two caps.

- **MED** `src/workflow/review/design-review/contracts.ts:163`: parseDesignRequest re-decodes request.result against DesignResultSchema with the tighter DESIGN_LIMITS.resultBytes (1,048,576 bytes) cap, distinct from the outer DESIGN_LIMITS.requestBytes (1,114,112 bytes) cap already enforced on the whole request. The 65,536-byte gap between the two constants is sized to exactly the envelope overhead, so a request can pass the outer envelope check while its embedded result alone exceeds the tighter cap — this is the scenario this line exists to catch. No test in contracts.test.ts (or elsewhere in the design-review suite) constructs a 'result' phase request whose overall size is under requestBytes but whose result sub-object exceeds resultBytes, so this enforcement branch is unverified by any test; a regression that dropped or mis-sized this check would not be caught.
  This is a deliberately added, differently-sized bound (not a byproduct of the outer schema check) guarding an untrusted payload size; per the review's test-coverage mandate, a demonstrated gap in coverage for an asserted security/bound behavior is a reportable finding, not something excusable by execution being optional.
  Evidence: `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`, `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/__tests__/contracts.test.ts`
- **LOW** `src/workflow/review/design-review/contracts.ts:23`: const ids = Type.Array(id, { maxItems: DESIGN_LIMITS.units }) is declared but never referenced anywhere in the file (grep confirms no other use); it is dead code left from building the other *s helpers (texts, refs) alongside it.
  Project convention (CLAUDE.md) is to avoid leftover code with no purpose; an unused non-exported const serves no design need and should be removed.
  Evidence: `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/review/design-review/contracts.ts`

Review limitations (blocking):

- Required coverage remains partial: contracts.test.ts's two tests give strong behavioral coverage of the strict-validation surface: unknown/extra fields, bad ids ('../escape', ''), non-literal attempt (2, 0), invalid phase, oversized artifactPath/text, non-serializable JSON (BigInt), oversized bounded JSON, the new isAbsolute repo guard ('relative-project'), workflow-context round-trip and kind-enum rejection, progress query round-trip and extra-field/negative-cursor rejection, DesignResultSchema round-trip plus its snapshot-immutability guarantee (mutating the caller's array after decode does not affect the returned snapshot, which exercises the JSON.stringify/parse-based copy in decodeDesign), DesignResultSchema enum/length rejection, DesignPlanSchema's minItems coverage/chunks enforcement, and the result-phase envelope's sequence>=1 rejection. I ran the file live against the current checkout (which is identical to the pinned final commit for both files) and both tests passed. The one demonstrated gap is the resultBytes-vs-requestBytes double-cap branch at contracts.ts:163, which no test in the file (or the rest of the design-review suite, confirmed via grep for resultBytes/requestBytes usage) exercises with a payload sized to distinguish the two caps.

Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsc --noEmit -p .` and it reported no errors for contracts.ts/contracts.test.ts; this was not requested evidence but corroborates the strict-TypeScript-convention acceptance check.
- Optional execution: ran the focused test command live (`npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/contracts.test.ts`) against the current checkout since it is byte-identical to the pinned commit for both files; both cases passed, matching the builder-reported result.
- Consider adding one test that sizes an embedded `result` object just over DESIGN_LIMITS.resultBytes while keeping the overall 'result'-phase request under DESIGN_LIMITS.requestBytes, to pin the distinct enforcement at contracts.ts:163.
- Removing the unused `ids` const (contracts.ts:23) is a one-line cleanup with no behavioral effect.

Inspected references:

- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/DEF-9b04adb36cac716d.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/LLD-9b04adb36cac716d-s1.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/PLAN-9b04adb36cac716d-s1.json`
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/review/design-review/contracts.ts`
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/contracts.ts`
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/review/design-review/contracts.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/review/design-review/__tests__/contracts.test.ts`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/contracts.test.ts` — pass
Ran live against the current checkout (HEAD 180e3184f74dd60141535db4080a0d173626658c), confirmed byte-identical to the pinned final commit 5d8affec9d01796c25f63ffa6befbeae69e996d3 for both contracts.ts and contracts.test.ts (empty git diff between the two revisions for these paths). Both cases passed in 224ms total, no hosted provider calls.

### t2: passed

subject.ts correctly derives the workflow-aware design-review subject (DEF/HLD/Epic-LLD/standalone-LLD/issue-LLD), enforcing required-approved upstream references, rejecting ISSUE/SPEC/PLAN kinds, and bounding/validating identity, path containment (incl. symlink escape) and author/party. subject.test.ts exercises all branches named in the acceptance checks (workflow matrix, broken-epic/correction-link rejection, identity/containment/party invalidation) and passes. Verified against the committed source at 8159cc9a5161e535d3ac0d55b7225308fc09454a and its collaborators (party.ts, approval-view.ts, decode.ts, artifact-content.ts, storage.ts, artifact-ids.ts) at current HEAD; one LOW maintainability nit found, no HIGH/MED defects.

Coverage: **verified** — subject.test.ts's three test cases were traced line-by-line against the committed subject.ts logic and its dependencies (party.ts authorPartyOf/otherParty, approval-view.ts approvalStateOf, storage.ts readEpicDefinitionCore/artifactJsonPath/ARTIFACT_ID_MARKER_RE, artifact-content.ts resolveDocsMarkdown's symlink-safe containment, artifact-core/decode.ts decodeArtifactHead/emptyLifecycle, contracts.ts's DesignReviewContextError always carrying code 'invalid_context' and requireDesign's explicit-code path for 'design_review_not_applicable'). Every asserted outcome (DEF/HLD/Epic-LLD required-reference chains, standalone LLD with legacy missing-flag fallback, issue-LLD via explicit and same-epicHash-fallback provenance, ISSUE/SPEC kinds rejected as design_review_not_applicable, broken-epic LLD rejected, correction links not treated as ancestors, seed_spec resolution, identity/hash/story mismatches, unknown-author rejection, oversized-document rejection, symlink-escape rejection via resolveDocsMarkdown, and content-change-only invalidation ignoring external files) was confirmed to follow from the inspected code paths. The builder's reported pass of these three cases via `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/subject.test.ts` is consistent with this trace; I did not re-execute the suite myself.

- **LOW** `src/workflow/review/design-review/subject.ts:181`: prepareDesignSubject hardcodes the literal '.insrc/artifacts' for the JSON-path containment check instead of reusing the already-imported `artifactJsonPath`/`ARTIFACT_ID_MARKER_RE` module's exported `ARTIFACTS_DIR` constant from storage.ts.
  storage.ts exports `ARTIFACTS_DIR = '.insrc/artifacts'` and subject.ts already imports several other symbols from storage.ts. Duplicating the literal risks silent drift if the artifacts directory is ever renamed in one place and not the other; no functional defect today since the strings match.
  Evidence: `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/subject.ts`, `180e3184f74dd60141535db4080a0d173626658c:src/workflow/storage.ts`

Optional verification and advice (nonblocking):

- Optional execution: did not re-run `npx tsx --test --test-force-exit src/workflow/review/design-review/__tests__/subject.test.ts` myself; relied on the builder-reported pass plus a code-level trace of every assertion against the pinned commit.
- Optional improvement: subject.test.ts does not directly assert on `workflow.availableReferences` (e.g. the HLD-corrects case in the second test only checks `workflow.kind`); an explicit assertion that the correction link lands in `availableReferences` with role `context` (and not in `requiredReferences`) would make that guarantee self-evident from the test alone rather than inferred from the production code.

Inspected references:

- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/subject.ts`
- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/__tests__/subject.test.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/contracts.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/review/party.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/artifact-core/approval-view.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/artifact-content.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/storage.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/artifact-core/decode.ts`
- `180e3184f74dd60141535db4080a0d173626658c:src/workflow/artifact-ids.ts`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/subject.test.ts` — pass
Not re-executed by this reviewer; reported as builder's result and corroborated by line-by-line code trace of subject.ts against each assertion at commit 8159cc9a5161e535d3ac0d55b7225308fc09454a.

### t3: passed

t3's final committed state (test file at cf5c7fcf0a, policy.ts at cf5c7fcf0a, results.ts at ad5d5b68c) implements the required precedence rule (limitations>HIGH/MED>passed), coverage-gap detection into limitations/incomplete, finding-id uniqueness across the attempt, structural plan validation (duplicate ids, forward-reference cycles, bad final-check ordering, duplicate/missing coverage), and consolidation that requires every planned chunk's result with no fabricated aggregation. Traced each assertion in all three test cases against the implementation line-by-line and confirmed correctness; re-ran the focused test file against the current checkout (which is byte-identical to the pinned final revision) and all 3 cases pass, matching the builder-reported result. tsc --noEmit shows no errors in this module.

Coverage: **verified** — All three test cases in policy-results.test.ts were read in full and each assertion traced against the actual implementation logic in policy.ts and results.ts: prompt-shape/ordering/canary-exclusion assertions (test 1), the 8 plan-rejection modify() cases covering duplicate ids, missing/duplicate coverage, final-only coverage, forward-dependency (cycle-style) rejection, and bad final-chunk ordering (test 2), and status-precedence (limitations>HIGH/MED>passed), coverage-gap-to-limitations conversion, finding-id-uniqueness-across-attempt enforcement, and consolidation's require-every-planned-chunk / status-rollup logic (test 3). Re-ran the exact focused test command against the current checkout (confirmed identical to the pinned final commits via git diff) and observed 3/3 pass, consistent with the builder's reported TAP evidence. Acceptance checks 1,2,4,5 are directly covered by tests; acceptance check 3 (DEF/HLD/LLD semantic distinctions and ancestry rules) is implemented correctly in KIND_POLICY but only loosely exercised by the generic per-kind assertions in test 1 (documentPath/READ-ONLY/ordering/canary), not asserted per-kind content — a minor coverage gap, not a defect, since direct code inspection confirms the KIND_POLICY text is correct for DEF/HLD/LLD.


Optional verification and advice (nonblocking):

- Optional execution: re-ran only the focused test file (npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/policy-results.test.ts) and `tsc --noEmit`; did not re-run the full daemon/live smoke suite referenced in the builder's TESTS.md evidence, relying on the builder-reported pass for that part.
- Optional improvement: test 1 could add a per-kind assertion (e.g. checking a DEF-specific or LLD-specific phrase from KIND_POLICY) to directly exercise the DEF/HLD/LLD semantic-distinction acceptance check rather than relying on generic prompt-shape assertions shared across all three kinds.

Inspected references:

- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/__tests__/policy-results.test.ts`
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/policy.ts`
- `64e2811adfffe0a067f1405774c888717c316055:src/workflow/review/design-review/results.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/__tests__/policy-results.test.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/results.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/__tests__/policy-results.test.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/policy.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/policy-results.test.ts` — pass
Independently re-ran the focused test file against the current checkout (verified byte-identical to pinned final commits via git diff) to confirm the builder-reported pass; all 3 cases passed with 0 failures.

### t4: passed

Reviewed the checkpoint persistence (checkpoint.ts) and live progress/paging (progress.ts) primitives plus their fixture and test coverage at the pinned revisions. Atomic write (temp file 0600 + fsync + rename + directory fsync), bounded/no-follow load with identity/size/foreign checks, immutable-history enforcement on save, and metadata-only paged observation (no baseline/content retransmission, no activity renewal from polling) all match the stated acceptance checks and are exercised by the four tests, which pass on re-execution against the current (unmodified) checkout.

Coverage: **verified** — Read the full bodies of all four tests in checkpoint-progress.test.ts against the implementation they exercise. Each acceptance check maps to concrete assertions: (1) durable atomic write — rename-failure mock proves the prior file is byte-identical, the stray .tmp is cleaned from the directory listing, and file mode stays 0600; (2) fault handling — unauthenticated bounded no-follow load test exercises missing-file (undefined), corrupt JSON (preserved verbatim, load+save both reject), foreign project (rejects /identity/), oversized file (rejects /bounded regular/ before any read), and a symlinked checkpoint path (rejects via O_NOFOLLOW), plus a literal-only reviewId guard; (3) live polling — activity() distinguishes tool_started/tool_completed from a heartbeat (lastMeaningfulActivityAt unchanged across a heartbeat and across pure observation calls), and observeDesignCheckpoint never touches the tracker; (4) paging/no-leak — default poll returns empty completedResults and no 'reviewedContent' substring in the serialized output, cursor-paged poll returns exactly one result plus nextCompletedChunk, a used-up cursor returns empty, and an out-of-range cursor throws; (5) immutability/bounds — rewriting an already-accepted chunk's summary is rejected with /replace completed/, and a result inflated past the 1MiB per-chunk page limit is rejected on load with /page limit/. Re-ran the exact test file against the working tree (which has no uncommitted diff from the pinned commits) and all 4 cases passed, confirming the assertions hold against the real code, not just the diff.


Optional verification and advice (nonblocking):

- Optional execution: ran only the focused checkpoint-progress.test.ts file (all 4 cases pass); did not rerun the broader design-review suite, typecheck, or the previously-recorded TAP evidence for other S1 tasks, since the builder's existing evidence already covers those and this task's own tests were re-executed directly.
- saveDesignCheckpoint calls loadDesignCheckpoint internally, which redundantly re-runs checkDirectories(project,false) right after the caller already ran checkDirectories(project,true); harmless (cheap lstat calls) but a minor duplicate-work nitpick, not a correctness issue.

Inspected references:

- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/fixtures.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/checkpoint.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/progress.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/progress.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:.gitignore`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/progress.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — pass
Re-ran the focused test file myself against the unmodified working tree (confirmed via `git status`/`git diff HEAD` showing no local changes to checkpoint.ts, progress.ts, fixtures.ts or the test file) to independently confirm the builder-reported pass rather than relying solely on the reported evidence.

### t5: passed

Reviewed the native/daemon design-review coordinator (coordinator.ts), its progress-observation addition (progress.ts), and the full coordinator.test.ts suite (8 tests) against t5's five acceptance checks. Verified the current checkout matches the pinned final revisions byte-for-byte, re-ran the declared test command (8/8 pass) and typechecked the module (clean). Durable-admission-before-dispatch, idempotent/conflicting start handling, 1.8M ms activity-mode options with no deadline/code-task grants, save-before-next-chunk with non-blocking findings/incomplete results, boundary-change invalidation, explicit technical/schema/persistence failures with no retry, and model-free/raw-content-free observation retrieval are all implemented correctly and each is exercised by a specific, non-tautological assertion in the test file (traced each assertion back to the exact producing code in coordinator.ts/results.ts/subject.ts/review-activity.ts/policy.ts).

Coverage: **verified** — All 8 tests in coordinator.test.ts were read line-by-line and each assertion traced to the specific implementation behavior it targets: admission durability/idempotency/conflict (test 1, matched to start()/admit()/requestSignature in coordinator.ts), finding/incomplete continuation vs persistence-failure/mutation stoppage (test 2, matched to execute()'s chunk loop and results.ts' consolidateDesignReview/assessDesignResult), fixed activity-mode options and model-free polling (test 3, matched to unit()'s native runReviewSession call and progress()'s checkpoint-only read path), status/finding contradiction detection (test 4, matched to assessDesignResult's exact error-message format, confirmed identical substring), ReviewOutputFailureError diagnostic formatting without raw-output leakage (test 5, matched to execute()'s catch-block issue formatting, confirmed RAW_OUTPUT_CANARY absent by construction), progress-write coalescing (test 6, matched to scheduleProgress()'s pending/timer guard), and inactivity supervision incl. late-candidate rejection after timeout (tests 7-8, matched to ReviewActivityMonitor and the post-await inactivityError check in unit()). Re-ran the builder's declared command myself (not merely accepting the report) and all 8 passed; also typechecked the module with tsc --noEmit and got zero design-review errors. No test is a no-op/tautology (e.g. checked that the 'The feature works' string the done-object-exclusion assertion depends on genuinely exists in the fixture's baseline content, so that assertion is meaningful).


Optional verification and advice (nonblocking):

- Optional execution: re-ran `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/coordinator.test.ts` myself (8/8 passed) and `npx tsc --noEmit -p .` filtered to design-review (clean); did not rerun the broader design-review test directory or hosted/live provider smoke, since existing evidence already covers that and it is outside t5's file scope.
- The 'slow progress persistence coalesces activity' test relies on a real 250ms setTimeout debounce against 300ms pauses; this is a reasonable margin but is a timing-based test and could become flaky under heavy CI load — not a defect in the reviewed code, just a note on test robustness.
- The `uncertain` map (coordinator.ts) that records a persistence_failed diagnostic when even the failure-state checkpoint write fails is never pruned; this is an intentional, documented edge case (a double-disk-failure scenario) and is fine for S1, but worth revisiting if memory growth across many such rare failures ever matters in a long-lived daemon process.

Inspected references:

- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/coordinator.ts`
- `56d00443bf46772329dde943026253d8b07ba486:src/workflow/review/design-review/progress.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/results.ts`
- `0d976b4fc9399521943f08aa4ac876b1b328074b:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `0d976b4fc9399521943f08aa4ac876b1b328074b:src/workflow/review/design-review/coordinator.ts`
- `eacc493fbcffd6d54abbfe557616b0123b739b4b:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `eacc493fbcffd6d54abbfe557616b0123b739b4b:src/workflow/review/design-review/coordinator.ts`
- `f2b723fe6d4c4968eb9572c1423ba3d93865a1b4:src/workflow/review/design-review/coordinator.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/coordinator.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/progress.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/checkpoint.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/fixtures.ts`
- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/subject.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/shared/review-activity.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/policy.ts`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/LLD-9b04adb36cac716d-s1.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/PLAN-9b04adb36cac716d-s1.json`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/coordinator.test.ts` — pass
Reviewer-run (not just accepted from builder report): confirmed current checkout matches pinned commits exactly (git diff against a8225809e/cf5c7fcf0/eacc493fb produced no output) before executing. All 8 cases passed, total duration ~1.8s, consistent with builder-reported run.

### t6: incomplete

Reviewed the full current state of src/workflow/review/design-review/coordinator.ts and its controller.test.ts across the three task commits (c9208b4 → f2b723f → a8225809). Traced the owner-gated controller exchange protocol end-to-end: owner authority enforcement, sequence fencing, order-independent request-signature replay, controller-disconnect handling, and the synchronous sequence-bump that lets a later valid submission be fenced by an earlier, still-persisting one's failure. Confirmed against the actual TypeScript via `tsc --noEmit` (clean) and by running the four named tests live (all pass). The implementation matches all five Story acceptance checks that are exercisable from this task's file scope (check 1, opposite-party derivation, lives in subject.ts and is outside t6's changed files).

Coverage: **partial** — The four named tests give strong, verified coverage of the task's core behaviors: (1) owner/authority enforcement — an observer connection is rejected on 'assignment', 'plan' and disconnected-job queries; (2) stale-execution and out-of-order-sequence rejection; (3) exact-replay idempotency including a field-order-reversed replay (via requestSignature's key-sorted canonical JSON) and rejection of a signature-conflicting replay; (4) controller-disconnect: interrupted status surfaced via progress(), completed chunks preserved, no auto-reassignment, and a fresh start() on the dead job returning 'interrupted' without resuming; (5) consolidated controller results producing deterministic status/counts through the same assessDesignResult/consolidateDesignReview path used by the native branch; and (6) a concurrency/fencing scenario where an activity commit stuck on a failing save still fences a subsequently-validated, already-sequenced plan submission, correctly propagating the DesignReviewPersistenceError's 'persistence_failed' code to the final checkpoint without corrupting state (traced line-by-line against the commit/mutate/save ordering in coordinator.ts and confirmed by a live test run — all 4 cases pass, and `tsc --noEmit` is clean). The one demonstrated gap is the invalid_phase (assignment-kind vs response-phase mismatch) branch, which none of the four tests trigger; it is simple and low-risk, but undemonstrated. Acceptance check 1 (opposite-party derivation from the artifact author) is validated in subject.ts/subject.test.ts, outside this task's changed files, so it is not assessed here.

- **LOW** `src/workflow/review/design-review/coordinator.ts:190`: The `invalid_phase` guard that rejects a 'result' response against a 'planning' assignment (or a 'plan' response against a 'chunk' assignment) is not exercised by any test in controller.test.ts's four cases.
  All four tests always submit the phase that matches the live assignment's kind (plan after a planning assignment, result after a chunk assignment), so this specific mismatch branch has no direct regression coverage in this file. The check itself is a simple boolean guard and low risk, but it is a demonstrated gap rather than an inferred one.
  Evidence: `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/coordinator.ts`, `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/__tests__/controller.test.ts`

Review limitations (blocking):

- Required coverage remains partial: The four named tests give strong, verified coverage of the task's core behaviors: (1) owner/authority enforcement — an observer connection is rejected on 'assignment', 'plan' and disconnected-job queries; (2) stale-execution and out-of-order-sequence rejection; (3) exact-replay idempotency including a field-order-reversed replay (via requestSignature's key-sorted canonical JSON) and rejection of a signature-conflicting replay; (4) controller-disconnect: interrupted status surfaced via progress(), completed chunks preserved, no auto-reassignment, and a fresh start() on the dead job returning 'interrupted' without resuming; (5) consolidated controller results producing deterministic status/counts through the same assessDesignResult/consolidateDesignReview path used by the native branch; and (6) a concurrency/fencing scenario where an activity commit stuck on a failing save still fences a subsequently-validated, already-sequenced plan submission, correctly propagating the DesignReviewPersistenceError's 'persistence_failed' code to the final checkpoint without corrupting state (traced line-by-line against the commit/mutate/save ordering in coordinator.ts and confirmed by a live test run — all 4 cases pass, and `tsc --noEmit` is clean). The one demonstrated gap is the invalid_phase (assignment-kind vs response-phase mismatch) branch, which none of the four tests trigger; it is simple and low-risk, but undemonstrated. Acceptance check 1 (opposite-party derivation from the artifact author) is validated in subject.ts/subject.test.ts, outside this task's changed files, so it is not assessed here.

Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsc --noEmit -p tsconfig.json` (clean) and `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/controller.test.ts` live (4/4 pass) beyond the builder-reported TAP evidence, to corroborate the current checkout matches the pinned commit's behavior.
- Consider adding one small assertion (or a dedicated test) that submitting a 'result' against a live 'planning' assignment (or vice versa) is rejected with invalid_phase, closing the one untested branch noted above.
- Consider a follow-up assertion that the disconnect-triggered replay-map cleanup (`for(const [id,replay] of this.replays) if(replay.owner.id===job.owner!.id) this.replays.delete(id)`) actually removes stale entries, though this is a memory-hygiene detail rather than a correctness risk.

Inspected references:

- `c9208b46c05c5e510269970d6661f3c4a69bc54b:src/workflow/review/design-review/__tests__/controller.test.ts`
- `c9208b46c05c5e510269970d6661f3c4a69bc54b:src/workflow/review/design-review/coordinator.ts`
- `f2b723fe6d4c4968eb9572c1423ba3d93865a1b4:src/workflow/review/design-review/__tests__/controller.test.ts`
- `f2b723fe6d4c4968eb9572c1423ba3d93865a1b4:src/workflow/review/design-review/coordinator.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/__tests__/controller.test.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/coordinator.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/fixtures.ts`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/DEF-9b04adb36cac716d.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/LLD-9b04adb36cac716d-s1.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/PLAN-9b04adb36cac716d-s1.json`

Test: `npx tsx --test-force-exit --test src/workflow/review/design-review/__tests__/controller.test.ts` — pass
Live reviewer execution on the current checkout (HEAD 400abc303, matching the pinned a8225809e content for these two files): all 4 cases passed in 590ms total with no failures. Also ran `npx tsc --noEmit -p tsconfig.json`, which produced only npm config warnings and no type errors.

### t7: passed

Reviewed t7's actual changed-block scope: wiring `insrc_review_step` (MCP) and the `designReview.*` main-owned RPC methods onto the pre-existing design-review engine (coordinator/contracts/subject/policy/results/checkpoint were built by earlier S1 tasks and are inspected here only as integrated context). Verified request routing (`designReviewStep`/`designReviewOperation` → `DesignReviewCoordinator`), repo-schema and repo-registry gating (`repoSchemaRefusal`, `GATED_STEP_TOOLS`, repo-call-audit rows for both the step phases and the `designReview.*` RPC methods), forced main-daemon/non-worker routing in `router.ts` for both `step.call` insrc_review_step/insrc_code_review_step and the dedicated `designReview.*` methods, the persistent-IPC MCP handler (`DesignReviewConnections`) that keeps background work alive independent of MCP client reconnects and closes only on a genuine terminal status, the shared `structural()` schema helper extracted out of `mcp/code-review/schema.ts` into `mcp/structural-schema.ts` and reused by the new `mcp/design-review/schema.ts` (MCP-advertised flat optional fields vs. the host's strict per-phase TypeBox union enforcement, confirmed by the 'forged extra field' test), the retirement of the old `reviewUnavailable()` stub, and the steering-block/guide text describing the new review loop. Traced every acceptance check against source and matched them to the corresponding test assertions (repo-call-audit/table coverage completeness, schema-registry phase lists, the stdio+IPC end-to-end test's background-persistence/duplicate-start/cursor-paging/content-non-leak assertions, review-rule-text's exact-phrase checks against the real steering strings, and review-unavailable's rejection of retired phases before any provider work). No HIGH/MED defect found in the in-scope blocks; the implementation is internally consistent and the tests genuinely exercise the real wiring rather than asserting against themselves.

Coverage: **verified** — Read the full bodies of the in-scope test changes (repo-call-audit.test.ts, repo-call-table.test.ts, design-review.test.ts + its stdio helper, review-rule-text.test.ts additions, schema-registry.test.ts additions, review-unavailable.test.ts addition) and cross-checked each assertion against the real source it exercises: the audit-table additions for `design-review-step.*` and `designReview.*` match the actual modifying/read-only classification in design-review-rpc.ts/coordinator.ts (start/plan/activity/result persist via saveDesignCheckpoint, progress/assignment only read in-memory/disk state); the schema-registry phase list `['start','progress','assignment','plan','activity','result']` matches DESIGN_REVIEW_PHASES in contracts.ts; the review-rule-text substring checks ('background', 'wait for full completion before corrections', 'No self-review fallback', 'party that did not author', 'live artifact paths') were verified present verbatim in the real steering-block.md/server.ts description strings, not just asserted in isolation; the stdio+IPC test verifies background continuation across an MCP client disconnect/reconnect (calls counter keeps incrementing while no client is attached), duplicate `start` admission dedup, one-completed-chunk-per-cursor-page retrieval, that the baseline's raw `reviewedContent` never leaks into a progress page, that the MCP `.strict()` schema rejects a forged `reviewer` field before any provider work (calls stays 0), and that a non-owning connection cannot act as the reviewer (`assignment` isError, and interruption on owner disconnect); review-unavailable.test.ts confirms retired phases ('claims','verdicts','findings','judgements') are rejected before provider work through the same step-table entry point used by the live tool. No coverage gap was found in the inspected blocks.


Optional verification and advice (nonblocking):

- Optional execution: did not rerun the builder's test commands myself; relied on the builder's reported pass results (repo-call-audit.test.ts, repo-call-table.test.ts, design-review.test.ts, review-rule-text.test.ts, schema-registry.test.ts, review-unavailable.test.ts, method-class.test.ts) plus my own static/behavioral inspection of their bodies against the committed source, since no hosted-provider work or build is needed to validate this task's deterministic wiring.
- src/mcp/server.ts:167 reuses `ConstructorParameters<typeof CodeReviewConnections>[0]` as the type of the `review` option passed into `new DesignReviewConnections(options.review)`. It is structurally identical today so it compiles and works, but a dedicated `ConstructorParameters<typeof DesignReviewConnections>[0]` alias would make the option's intent self-documenting and avoid silent drift if the two connection classes' deps shapes ever diverge.
- contracts.ts's DesignStatusSchema/DesignReviewAcknowledgement and the MCP handler's terminal-status list both include `'paused'`, but nothing in the reviewed S1 code path ever sets that status (it is reserved for a later retry/resume story per the steering text). Worth a short code comment near DesignStatusSchema noting it is forward-reserved, so a future reader doesn't go looking for the S1 code path that produces it.

Inspected references:

- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/DEF-9b04adb36cac716d.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/LLD-9b04adb36cac716d-s1.json`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/PLAN-9b04adb36cac716d-s1.json`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/__tests__/repo-call-audit.test.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/__tests__/repo-call-table.test.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/design-review-rpc.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/design-review-rpc.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/repo-call-audit.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/repo-call-audit.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/steps/design-review-step.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/steps/host.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/daemon/threads/router.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/threads/router.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/threads/method-class.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/daemon/handler-runtime.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/design-review.test.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/__tests__/design-review.test.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/helpers/design-review-stdio.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/__tests__/review-rule-text.test.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/__tests__/schema-registry.test.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/code-review/schema.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/design-review/handler.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/design-review/schema.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/server.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/mcp/server.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/mcp/structural-schema.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/prompts/steering-block.md`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/prompts/steering-block.md`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/workflow/__tests__/review-unavailable.test.ts`
- `2760fc272e3ca776f4d6b09f15e68d441ea0c8c7:src/workflow/review/design-review/coordinator.ts`
- `a8225809ee90ce12ebc809a8e824db0fb761d9e2:src/workflow/review/design-review/coordinator.ts`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:src/workflow/review/design-review/contracts.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/checkpoint.ts`
- `8159cc9a5161e535d3ac0d55b7225308fc09454a:src/workflow/review/design-review/subject.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/policy.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:src/workflow/review/design-review/results.ts`
- `cf5c7fcf0a9e60b683ce20413dafcda014c83a16:src/workflow/review/design-review/progress.ts`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/review/design-review/__tests__/fixtures.ts`
- `ad5d5b68cd561acf65e3d173840a06b16e0072fb:.gitignore`

Test: `npx tsx --test-force-exit --test src/daemon/__tests__/repo-call-audit.test.ts` — not_run
Not re-executed by the reviewer; relying on the builder-reported pass plus source-level verification that the audit table rows match the actual repo-touching behavior of design-review-rpc.ts/coordinator.ts.

Test: `npx tsx --test-force-exit --test src/daemon/__tests__/repo-call-table.test.ts` — not_run
Not re-executed by the reviewer; relying on the builder-reported pass plus source-level verification against handler-runtime.ts/method-class.ts/steps/host.ts.

Test: `npx tsx --test-force-exit --test src/mcp/__tests__/design-review.test.ts` — not_run
Not re-executed by the reviewer; relying on the builder-reported pass plus a line-by-line trace of each assertion against coordinator.ts/handler.ts/progress.ts.

Test: `npx tsx --test-force-exit --test src/mcp/__tests__/review-rule-text.test.ts` — not_run
Not re-executed by the reviewer; verified the asserted substrings exist verbatim in steering-block.md and server.ts's registered description.

Test: `npx tsx --test-force-exit --test src/mcp/__tests__/schema-registry.test.ts` — not_run
Not re-executed by the reviewer; verified DESIGN_REVIEW_PHASES equals the phases list checked in the test.

Test: `npx tsx --test-force-exit --test src/workflow/__tests__/review-unavailable.test.ts` — not_run
Not re-executed by the reviewer; verified parseDesignRequest's TypeBox union rejects any phase outside start/progress/assignment/plan/activity/result before reaching the coordinator.

### t8: passed

t8's three changed files (docs/design-review-execution.md, docs/workflow.md's new cross-link, scripts/smoke-design-review.mjs) are unchanged since commit 5d8affec9, matching the embedded blocks exactly. The doc's workflow-context table, retirement/RPC-class claims, author/reviewer and inactivity-grace prose were each cross-checked against the live implementation (subject.ts's workflowFor/seed-SPEC logic, party.ts's authorPartyOf, subject.ts's design_review_not_applicable gate, method-class.ts's designReview.* session entries) and are accurate. The smoke script's fake-CLI fixture correctly mimics CliProvider's real codex item.completed/agent_message/turn.completed protocol, safely confines its synthetic project+binary to a mkdtemp sandbox, only rm -rf's that sandbox (never the live --live project), and its evidence.passed logic correctly treats passed/changes_requested/incomplete as a successful transport/mechanism run while still asserting on a technical failure. I independently verified the compiled fake-CLI smoke evidence (/tmp/insrc-design-smoke-odE0W2/evidence.json, calls.jsonl) and the one live run's evidence (/tmp/insrc-design-smoke-6dIL8Q/evidence.json, 4835 lines) against the builder's narrative claims line-by-line: elapsedMs 2020500, acknowledgementMs 25, model claude-sonnet-5, 9/9 chunks, final.report.counts {HIGH:0, MED:8, LOW:3}, status incomplete, and the test-coverage placeholder limitation -- every one matches exactly, so this is genuine, unfabricated execution evidence of a real independent review that honestly reported INCOMPLETE rather than manufacturing a clean verdict (satisfies acceptance checks #3/#4/#6). I also independently reran the project typecheck (clean) and confirmed the four cited regression TAP files (57, 20, 18, 7 tests) all show 0 failures with no "not ok" lines, and confirmed the "code-review focused regressions" cited (task-review.test.ts and siblings under src/workflow/code-review/task-review/) are a deliberate, legitimate choice: that acceptance check specifically asks to prove the EXISTING code-review/task-review system (which shares daemon/steps/host.ts, mcp/server.ts and method-class.ts with the new design-review work) still works, not a design-review-specific suite (which belongs to earlier Story tasks, not t8's own changed files).

Coverage: **verified** — t8 adds no new source logic of its own (only prose + a smoke harness), so there is no new unit-test surface to demand; its verification obligation is that the described commands actually work and that a real review genuinely completes. I confirmed this directly: re-ran the project typecheck clean, inspected the two smoke evidence.json files end-to-end and found every numeric/model/status claim in the builder's executionDetails matches the file precisely (not just restated), confirmed the fake-CLI fixture's JSONL protocol matches CliProvider's real codex event parsing (item.completed/agent_message/turn.completed) so the compiled smoke genuinely exercises the real transport code, and confirmed the cited 'code-review focused regressions' TAP files (task-review.test.ts and siblings, method-class.test.ts) all pass 0 failures -- these are a deliberate shared-infrastructure regression check (daemon/steps/host.ts, mcp/server.ts, method-class.ts) rather than a design-review-specific suite, which correctly belongs to the earlier Story tasks that built subject.ts/coordinator.ts/etc. and is out of t8's own changed-file scope.


Optional verification and advice (nonblocking):

- Optional execution: I did not re-run the full build (npm run build) or the two smoke scripts myself, since the existing evidence files (/tmp/dr-s1-t8-release-build.log, /tmp/insrc-design-smoke-odE0W2/evidence.json, /tmp/insrc-design-smoke-6dIL8Q/evidence.json) are internally consistent, match the current unchanged source exactly, and a fresh ~2.02M ms live hosted run would be an unnecessary repeat per the task's own stated policy against rerunning hosted reviews merely to reproduce existing evidence.
- Optional improvement: the live review's own MED findings (HLD §7's <=2s ack/progress target not reflected in LLD §2.1/§2.4, and §2.4's DesignReviewProgress interface missing sequence/reviewElapsedMs/unitElapsedMs/observedAt/freshness) point at a real LLD documentation gap worth a follow-up LLD amendment, independent of t8's own scope.

Inspected references:

- `5d8affec9d01796c25f63ffa6befbeae69e996d3:docs/design-review-execution.md`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:docs/workflow.md`
- `5d8affec9d01796c25f63ffa6befbeae69e996d3:scripts/smoke-design-review.mjs`
- `9e05275465beb81a2bf335658d45f20c8ef2a3c7:.insrc/artifacts/LLD-9b04adb36cac716d-s1.json`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/workflow/review/design-review/subject.ts`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/workflow/review/party.ts`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/daemon/threads/method-class.ts`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/agent/providers/cli-provider.ts`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/daemon/design-review-rpc.ts`
- `78c166c89eff37fb03181e31295dbc0662e316f7:src/mcp/__tests__/task-review.test.ts`

Test: `npx tsc --noEmit -p tsconfig.json` — pass
I ran this myself against the current checkout (identical to the reviewed commit for all three changed files); produced no errors beyond unrelated npm config warnings.

Test: `npx tsx --test-force-exit --test src/daemon/threads/__tests__/method-class.test.ts (builder-run; I inspected the saved TAP at /tmp/dr-s1-t8-final-regressions.tap)` — pass
Builder-reported execution; I independently inspected the saved TAP output and confirmed 57/57 tests pass with 0 failures and no 'not ok' lines, including the two repo-call-audit/table tests and all four method-class cases listed.

Test: `npm run build && node scripts/smoke-design-review.mjs (builder-run; I inspected the saved evidence/log)` — pass
Builder-reported execution; I independently inspected the saved evidence.json and log and confirmed passed:true, model 'fake-codex-cli (synthetic)', 2/2 chunks, and the fixture's advice 'Fake CLI fixture only' is present end-to-end, matching the builder's claim exactly.

Test: `node scripts/smoke-design-review.mjs --live --repo /home/subho/work/dev/insors/insrc --artifact .insrc/artifacts/LLD-9b04adb36cac716d-s1.json (builder-run; I inspected the saved evidence)` — pass
Builder-reported execution; I independently inspected the full saved evidence.json (4835 lines) and confirmed elapsedMs 2020500, acknowledgementMs 25, model claude-sonnet-5, final.report.counts {HIGH:0,MED:8,LOW:3}, status incomplete, and the test-coverage-chunk placeholder limitation all match the builder's narrative exactly -- genuine, unfabricated evidence of a real independent review honestly reporting an incomplete verdict.
