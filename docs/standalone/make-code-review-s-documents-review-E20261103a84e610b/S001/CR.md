<!-- insrc:artifact CR-a84e610b0a910d49-s1 -->

# Code review: s1

Status: **incomplete** · task-based schema version 2

## review-a84e610b0a910d49-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-03T10:14:48.319Z

6 selected task assessment(s): failed.
Native output diagnostics: [{"phase":"assessment","taskId":"t1","provider":"claude","resolved":true,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"findings","correction":"Return findings as a top-level JSON array.","occurrences":2}]},{"phase":"assessment","taskId":"t2","provider":"claude","resolved":true,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"/testCoverage/evidenceReferences","correction":"Return the required field in the JSON object.","occurrences":1}]},{"phase":"assessment","taskId":"t3","provider":"claude","resolved":true,"errors":[{"code":"SCHEMA_CONSTRAINT","field":"/testCoverage/evidenceReferences/2","correction":"Return this field according to the supplied JSON schema.","occurrences":1},{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/8","correction":"Return this field according to the supplied JSON schema.","occurrences":1}]},{"phase":"assessment","taskId":"t4","provider":"claude","resolved":false,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"findings","correction":"Return findings as a top-level JSON array.","occurrences":3},{"code":"MISSING_REQUIRED_FIELD","field":"testCoverage","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"HOST_VALIDATION_ERROR","field":"location","correction":"Correct the host-rejected review field before resubmitting.","occurrences":1}]},{"phase":"assessment","taskId":"t6","provider":"claude","resolved":true,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"findings","correction":"Return findings as a top-level JSON array.","occurrences":2}]}]

### Submitted scope

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — [{"after":[1,41]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts` — [{"after":[20,20]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts` — [{"after":[43,45]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — [{"after":[1,100]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts` — [{"after":[11,12]},{"after":[22,22]},{"after":[43,46]},{"after":[63,105]},{"after":[150,150]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts` — [{"after":[1,28]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — [{"after":[1,88]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts` — [{"after":[19,19]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts` — [{"after":[87,105]},{"after":[162,165]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[1,32]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — [{"after":[1,87]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/admission.ts` — [{"after":[11,11]},{"after":[37,37]},{"after":[81,83]},{"after":[86,86]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/contracts.ts` — [{"after":[17,19]},{"after":[90,90]},{"after":[107,107]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/packet.ts` — [{"after":[9,9]},{"after":[23,23]},{"after":[107,113]},{"after":[115,115]},{"after":[169,174]},{"after":[183,183]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/publication.ts` — [{"after":[25,25]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route-source.ts` — [{"after":[1,25]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md` — [{"after":[330,337]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — [{"after":[1,45]}]
- `c42817ef561e05c7a3fb62fbed6a645a88887be8:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — [{"after":[1,77]}]

### t1: passed

t1 loosens StoredPacketSchema.documents to four optional DocumentSchema fields (story/lld/plan/issue, additionalProperties:false), with parsePacket still validating every present document's path. The two call sites that previously assumed a required plan/story/lld now carry explicit requireReview guards (task-review-rpc.ts's plan-path check, packet.ts's story+lld+plan destructure before prepareReviewPacket's document loads) — these are necessary, minimal consequences of the type change (TS narrows via the assertion function) and correctly preserve pre-existing required-document behavior until t2 adds route-awareness. The new packet-documents.test.ts exercises all 16 document-role subsets (including empty), a fifth-key refusal, a still-checked present-path, and backward decode of a pre-change packet/checkpoint/summary-scope. All stated acceptance checks are met.

Coverage: **verified** — Both new tests in packet-documents.test.ts were read in full and inspected against the diff: the first iterates every subset of the 4 document roles (mask 0..15) asserting decoded keys match, then asserts a 5th unknown key is refused (TaskReviewInputError) and that a present document's path is still checked (a '../lld.json' path throws). The second test decodes a pre-change packet (story+lld+plan only) via parsePacket(historical=true), a full ReviewCheckpoint via CheckpointSchema, and a scope object via SummarySchema.properties.scope, asserting deep equality to prove backward compatibility. These directly cover all three stated acceptance checks. I independently ran the test file plus contracts/compatibility/admission/history tests against the current checkout (not just relying on the builder's reported pass) and all passed; I also ran a full tsc --noEmit typecheck, which was clean, confirming the optional-field change and its two consequential guard additions compile correctly under exactOptionalPropertyTypes/noUncheckedIndexedAccess.


Optional verification and advice (nonblocking):

- Optional execution: ran the full referenced test files (packet-documents, contracts, compatibility, admission, history) against the current checkout and a project-wide tsc --noEmit typecheck; all passed/clean, corroborating the builder-reported results rather than only trusting them.

Inspected references:

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/contracts.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/record.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — pass
Independently re-executed against the current checkout (not the builder's report); both tests passed in 243ms total.

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/contracts.test.ts src/workflow/code-review/task-review/__tests__/compatibility.test.ts src/workflow/code-review/task-review/__tests__/admission.test.ts src/workflow/code-review/task-review/__tests__/history.test.ts` — pass
Ran together with compatibility/admission/history suites named in the acceptance checks; all 17 tests passed.

### t2: passed

t2 adds StoryRoute/requiredDocumentRoles (route.ts) and a routedDocuments branch in packet.ts that prepareReviewPacket uses when a route is supplied, requiring exactly the documents the route produced (Plan: lld+plan, +story only when def; LLD-only: lld; ISSUE-only: issue; otherwise none), while the no-route path (pinnedTriple) is an unmodified extraction of the prior story+lld+plan logic. Verified by reading the full diff against the parent commit, confirming the extraction preserved old behavior/messages verbatim, confirming the new route path's per-role workflow/epicHash/storyId checks match the LLD's stated contract, and re-running the test file against the current checkout (4/4 pass), matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2. A full project typecheck also passed with no errors.

Coverage: **verified** — route-documents.test.ts exercises all three acceptance checks: (1) a Plan+DEF route produces identical documents/tasks/epicHash and the same refusal message as the no-route path on an incomplete set; (2) LLD-only, ISSUE-only and no-document routes each accept exactly their set, and a standalone-vs-DEF Plan route differs only in requiring the story role; (3) mismatched document sets, a wrong-workflow document, a cross-epic document, a cross-story LLD, a cross-issue-hash issue document and a cross-story packet are each refused with a message naming the roles or the offending document. I read both the test bodies/assertions and the implementation they exercise (routedDocuments, requiredDocumentRoles) and confirmed the assertions match the actual thrown messages and returned shapes rather than just signatures. Re-running the file against the current checkout reproduces the daemon-recorded pass (4/4), and the behaviour matches the LLD's stated contract for prepareReviewPacket/StoryRoute. Representative gaps (e.g. no test exercises the 'Plan belongs to another story' or wrong-workflow-for-plan message specifically through the routed path, only through lld/issue) are minor since that validation is the same shared per-role loop already covered for lld and issue; noted in advice, not a coverage defect blocking this assessment.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsc --noEmit -p tsconfig.json` (clean) and `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` against the current checkout (4/4 pass), matching the daemon's recorded result for this task.
- The routed 'story' document check (routedDocuments) only accepts body.stories containing the story id, dropping pinnedTriple's extra `storyMeta['storyId'] === storyId` fallback branch. This is a minor, likely intentional tightening (a DEF's meta normally has no scalar storyId) and isn't exercised differently by any test, so it's not flagged as a defect, but worth knowing if a future DEF shape relies on that fallback.
- route.ts and the new test file use tab indentation while most of this module's existing files (contracts.ts, sources.ts, packet.ts itself) use single-space indentation; this matches the immediately preceding t1 commit's new test file (packet-documents.test.ts), so it's an established pattern for this Story's new files rather than a fresh inconsistency — not raised as a finding.

Inspected references:

- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts`
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/TESTS-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/selected-code.test.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — pass
Ran directly against the current checkout (HEAD includes t1-t6 commits for this Story); all 4 cases passed in 654ms, matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2.

### t3: passed

t3 adds derivedUnit() in packet.ts (one new helper, ~19 lines) plus a one-line prompt-text tweak in assessment.ts, and a new 3-test file derived-unit.test.ts covering exactly the task's three acceptance checks. Verified the implementation against the committed diff, confirmed it type-checks cleanly, and re-ran the new test file against the current checkout (HEAD, which is a descendant of this commit) — all 3 cases pass.

Coverage: **verified** — The three new tests map 1:1 onto the task's three acceptance checks: (1) id-from-BUILD-task and checks sourced from LLD acceptance mapping / ISSUE fixIntent / BUILD focus for the three Plan-less route shapes, including the title override from the issue document; (2) the file-count → size boundary table S(1,2)/M(3,8)/L(9); (3) the >1-task-BUILD refusal message and that deriveTaskAssignments/directAssignments attribute all changes and tests to the single derived unit. Re-ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` against the current checkout (HEAD = 9cad5bba4effb34d437b2b376586f50d3d1e7238, a descendant of the reviewed commit ce8e0bb81) and all 3 cases passed, matching the builder-reported result. Also ran `tsc --noEmit` and confirmed no errors touch task-review files, and ran documents-contract.test.ts to confirm no regression from later tasks (t4) that extend packet.ts around derivedUnit without altering its body.


Optional verification and advice (nonblocking):

- Optional execution: ran the mapped test file (`npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`) and `tsc --noEmit -p .` myself against the current checkout; both passed cleanly, consistent with the builder-reported result.
- Minor style note (non-blocking): `let title = ...` in derivedUnit is only ever reassigned in the ISSUE branch — could be inlined as a ternary for consistency with the rest of the function's const-heavy style, but this is a pure readability nit, not a defect.

Inspected references:

- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/route.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/contracts.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/artifacts/plan.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/code-review/task-review/packet.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — pass
Ran directly against the current working-tree checkout (HEAD 9cad5bba4effb34d437b2b376586f50d3d1e7238, which contains this commit); all 3 cases passed with no modifications needed.

### t4: failed

Reviewer failed: location: Finding is outside the submitted changed segments

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- Reviewer failed: location: Finding is outside the submitted changed segments

Inspected references:


### t5: passed

t5 updates the code-review guide section in src/prompts/steering-block.md to describe the route-dependent document set (Plan route pins lld+plan+story-when-DEF-exists; LLD-only pins lld; ISSUE-only pins issue; trivial pins none, reviewed as one BUILD-task unit) replacing the old "pinned Story/LLD/Plan" wording, and adds a new contract test (documents-contract.test.ts) that (1) exhaustively checks all 16 subsets of the four optional document roles against both the advertised zod MCP schema (CODE_REVIEW_INPUT) and the stored typebox schema (parsePacket/StoredPacketSchema), confirming they agree and that a 5th unknown key is rejected by both, and (2) asserts the guide text no longer says every packet pins Story/LLD/Plan and does state the per-route document rules. Verified by reading the committed diff at 1f1584ab8, cross-checking DOCUMENT_ROLES/StoryRoute/requiredDocumentRoles in route.ts, StoredPacketSchema in contracts.ts, CODE_REVIEW_INPUT in mcp/code-review/schema.ts, and readWorkflowGuide in daemon/guide-sections.ts (all already built by t1/t2/t4, consistent with this task's claims), and by running the test file on the current checkout (both cases pass) plus a full tsc --noEmit with no errors in the touched files.

Coverage: **verified** — The two test cases are the complete, correct coverage for this task's acceptance checks. The schema-parity test is exhaustive (iterates all 2^4=16 subsets of DOCUMENT_ROLES, not a sample) and checks agreement between the advertised zod schema and the stored typebox schema in both directions (equal success/failure) plus the negative case of a 5th unexpected key being rejected by both. The guide-text test reads the real steering-block.md through the same readWorkflowGuide function the daemon uses, so it cannot pass against stale or differently-worded text, and it positively asserts presence of each new route-specific sentence as well as absence of the old wording. Re-ran the file on the current checkout (node --test) and both cases pass, matching the builder-reported result and confirming the pinned commit's source is unchanged in the working tree for this file.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` on the current checkout — both cases passed, matching the builder's reported result.
- Optional execution: ran `npx tsc --noEmit -p .` — no type errors in the touched files or their dependents (route.ts, contracts.ts, schema.ts, guide-sections.ts).

Inspected references:

- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md`
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — pass
Reviewer-executed on the current checkout; both cases passed (2 pass, 0 fail).

### t6: passed

Test only

Coverage: **verified** — ok


Inspected references:

- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
## review-a84e610b0a910d49-s1-r1 — attempt 2

Scope: whole story · reviewer: daemon · 2026-11-03T10:26:29.778Z

6 selected task assessment(s): failed.
Native output diagnostics: [{"phase":"assessment","taskId":"t4","provider":"claude","resolved":false,"errors":[{"code":"SCHEMA_CONSTRAINT","field":"/inspectedReferences/10","correction":"Return this field according to the supplied JSON schema.","occurrences":1},{"code":"HOST_VALIDATION_ERROR","field":"commit","correction":"Correct the host-rejected review field before resubmitting.","occurrences":1}]}]

### Submitted scope

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — [{"after":[1,41]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts` — [{"after":[20,20]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts` — [{"after":[43,45]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — [{"after":[1,100]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts` — [{"after":[11,12]},{"after":[22,22]},{"after":[43,46]},{"after":[63,105]},{"after":[150,150]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts` — [{"after":[1,28]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — [{"after":[1,88]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts` — [{"after":[19,19]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts` — [{"after":[87,105]},{"after":[162,165]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[1,32]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — [{"after":[1,87]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/admission.ts` — [{"after":[11,11]},{"after":[37,37]},{"after":[81,83]},{"after":[86,86]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/contracts.ts` — [{"after":[17,19]},{"after":[90,90]},{"after":[107,107]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/packet.ts` — [{"after":[9,9]},{"after":[23,23]},{"after":[107,113]},{"after":[115,115]},{"after":[169,174]},{"after":[183,183]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/publication.ts` — [{"after":[25,25]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route-source.ts` — [{"after":[1,25]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md` — [{"after":[330,337]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — [{"after":[1,45]}]
- `c42817ef561e05c7a3fb62fbed6a645a88887be8:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — [{"after":[1,77]}]

Attribution for attempt 2 of CR-a84e610b0a910d49-s1. Per the host note, attempt 1's verdicts for t1, t2, t3, t5 and t6 were sound and failed only on a format/location technicality in t4 (a finding citing packet.ts:169-175 fell outside the submitted hunk 169-174); those five tasks are reused from attempt 1 (same reviewer party, daemon). Only t4 is reassessed this round, scoped strictly to its submitted change indexes (10-17) with any finding about the adjacent unchanged line kept at a changed line in packet.ts and the unchanged line mentioned in the message.

Reused task t1 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 (daemon) passed t1 on its own merits — the optional-roles schema change (contracts.ts), the two consequential requireReview guards (task-review-rpc.ts, packet.ts) and packet-documents.test.ts were all inspected and independently re-run. The attempt-2 host note confirms only t4 failed, on a location-format issue unrelated to t1; nothing in this task's scope changed, so the prior terminal result stands.

### t1: passed

t1 loosens StoredPacketSchema.documents to four optional DocumentSchema fields (story/lld/plan/issue, additionalProperties:false), with parsePacket still validating every present document's path. The two call sites that previously assumed a required plan/story/lld now carry explicit requireReview guards (task-review-rpc.ts's plan-path check, packet.ts's story+lld+plan destructure before prepareReviewPacket's document loads) — these are necessary, minimal consequences of the type change (TS narrows via the assertion function) and correctly preserve pre-existing required-document behavior until t2 adds route-awareness. The new packet-documents.test.ts exercises all 16 document-role subsets (including empty), a fifth-key refusal, a still-checked present-path, and backward decode of a pre-change packet/checkpoint/summary-scope. All stated acceptance checks are met.

Coverage: **verified** — Both new tests in packet-documents.test.ts were read in full and inspected against the diff: the first iterates every subset of the 4 document roles (mask 0..15) asserting decoded keys match, then asserts a 5th unknown key is refused (TaskReviewInputError) and that a present document's path is still checked (a '../lld.json' path throws). The second test decodes a pre-change packet (story+lld+plan only) via parsePacket(historical=true), a full ReviewCheckpoint via CheckpointSchema, and a scope object via SummarySchema.properties.scope, asserting deep equality to prove backward compatibility. These directly cover all three stated acceptance checks. I independently ran the test file plus contracts/compatibility/admission/history tests against the current checkout (not just relying on the builder's reported pass) and all passed; I also ran a full tsc --noEmit typecheck, which was clean, confirming the optional-field change and its two consequential guard additions compile correctly under exactOptionalPropertyTypes/noUncheckedIndexedAccess.


Optional verification and advice (nonblocking):

- Optional execution: ran the full referenced test files (packet-documents, contracts, compatibility, admission, history) against the current checkout and a project-wide tsc --noEmit typecheck; all passed/clean, corroborating the builder-reported results rather than only trusting them.

Inspected references:

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/contracts.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/record.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — pass
Independently re-executed against the current checkout (not the builder's report); both tests passed in 243ms total.

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/contracts.test.ts src/workflow/code-review/task-review/__tests__/compatibility.test.ts src/workflow/code-review/task-review/__tests__/admission.test.ts src/workflow/code-review/task-review/__tests__/history.test.ts` — pass
Ran together with compatibility/admission/history suites named in the acceptance checks; all 17 tests passed.

Reused task t2 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t2 (StoryRoute/requiredDocumentRoles in route.ts and the routedDocuments branch in packet.ts) after reading the full diff against the parent and re-running route-documents.test.ts. The attempt-2 note confirms attempt 1's failure was isolated to t4, so this verdict is reused unchanged.

### t2: passed

t2 adds StoryRoute/requiredDocumentRoles (route.ts) and a routedDocuments branch in packet.ts that prepareReviewPacket uses when a route is supplied, requiring exactly the documents the route produced (Plan: lld+plan, +story only when def; LLD-only: lld; ISSUE-only: issue; otherwise none), while the no-route path (pinnedTriple) is an unmodified extraction of the prior story+lld+plan logic. Verified by reading the full diff against the parent commit, confirming the extraction preserved old behavior/messages verbatim, confirming the new route path's per-role workflow/epicHash/storyId checks match the LLD's stated contract, and re-running the test file against the current checkout (4/4 pass), matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2. A full project typecheck also passed with no errors.

Coverage: **verified** — route-documents.test.ts exercises all three acceptance checks: (1) a Plan+DEF route produces identical documents/tasks/epicHash and the same refusal message as the no-route path on an incomplete set; (2) LLD-only, ISSUE-only and no-document routes each accept exactly their set, and a standalone-vs-DEF Plan route differs only in requiring the story role; (3) mismatched document sets, a wrong-workflow document, a cross-epic document, a cross-story LLD, a cross-issue-hash issue document and a cross-story packet are each refused with a message naming the roles or the offending document. I read both the test bodies/assertions and the implementation they exercise (routedDocuments, requiredDocumentRoles) and confirmed the assertions match the actual thrown messages and returned shapes rather than just signatures. Re-running the file against the current checkout reproduces the daemon-recorded pass (4/4), and the behaviour matches the LLD's stated contract for prepareReviewPacket/StoryRoute. Representative gaps (e.g. no test exercises the 'Plan belongs to another story' or wrong-workflow-for-plan message specifically through the routed path, only through lld/issue) are minor since that validation is the same shared per-role loop already covered for lld and issue; noted in advice, not a coverage defect blocking this assessment.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsc --noEmit -p tsconfig.json` (clean) and `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` against the current checkout (4/4 pass), matching the daemon's recorded result for this task.
- The routed 'story' document check (routedDocuments) only accepts body.stories containing the story id, dropping pinnedTriple's extra `storyMeta['storyId'] === storyId` fallback branch. This is a minor, likely intentional tightening (a DEF's meta normally has no scalar storyId) and isn't exercised differently by any test, so it's not flagged as a defect, but worth knowing if a future DEF shape relies on that fallback.
- route.ts and the new test file use tab indentation while most of this module's existing files (contracts.ts, sources.ts, packet.ts itself) use single-space indentation; this matches the immediately preceding t1 commit's new test file (packet-documents.test.ts), so it's an established pattern for this Story's new files rather than a fresh inconsistency — not raised as a finding.

Inspected references:

- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts`
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/TESTS-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/selected-code.test.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — pass
Ran directly against the current checkout (HEAD includes t1-t6 commits for this Story); all 4 cases passed in 654ms, matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2.

Reused task t3 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t3 (derivedUnit() in packet.ts plus the assessment.ts prompt tweak) with derived-unit.test.ts re-run and mapped to all three acceptance checks. Not implicated in attempt 1's sole failure (t4's location defect), so the result is reused.

### t3: passed

t3 adds derivedUnit() in packet.ts (one new helper, ~19 lines) plus a one-line prompt-text tweak in assessment.ts, and a new 3-test file derived-unit.test.ts covering exactly the task's three acceptance checks. Verified the implementation against the committed diff, confirmed it type-checks cleanly, and re-ran the new test file against the current checkout (HEAD, which is a descendant of this commit) — all 3 cases pass.

Coverage: **verified** — The three new tests map 1:1 onto the task's three acceptance checks: (1) id-from-BUILD-task and checks sourced from LLD acceptance mapping / ISSUE fixIntent / BUILD focus for the three Plan-less route shapes, including the title override from the issue document; (2) the file-count → size boundary table S(1,2)/M(3,8)/L(9); (3) the >1-task-BUILD refusal message and that deriveTaskAssignments/directAssignments attribute all changes and tests to the single derived unit. Re-ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` against the current checkout (HEAD = 9cad5bba4effb34d437b2b376586f50d3d1e7238, a descendant of the reviewed commit ce8e0bb81) and all 3 cases passed, matching the builder-reported result. Also ran `tsc --noEmit` and confirmed no errors touch task-review files, and ran documents-contract.test.ts to confirm no regression from later tasks (t4) that extend packet.ts around derivedUnit without altering its body.


Optional verification and advice (nonblocking):

- Optional execution: ran the mapped test file (`npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`) and `tsc --noEmit -p .` myself against the current checkout; both passed cleanly, consistent with the builder-reported result.
- Minor style note (non-blocking): `let title = ...` in derivedUnit is only ever reassigned in the ISSUE branch — could be inlined as a ternary for consistency with the rest of the function's const-heavy style, but this is a pure readability nit, not a defect.

Inspected references:

- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/route.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/contracts.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/artifacts/plan.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/code-review/task-review/packet.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — pass
Ran directly against the current working-tree checkout (HEAD 9cad5bba4effb34d437b2b376586f50d3d1e7238, which contains this commit); all 3 cases passed with no modifications needed.

### t4: failed

Reviewer failed: commit: Commit pointer is unavailable

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- Reviewer failed: commit: Commit pointer is unavailable

Inspected references:


Reused task t5 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t5 (steering-block.md guide wording plus documents-contract.test.ts's exhaustive 16-subset schema-parity check and guide-text assertions), independently re-run and read in full. Unaffected by t4's isolated location-format failure, so reused.

### t5: passed

t5 updates the code-review guide section in src/prompts/steering-block.md to describe the route-dependent document set (Plan route pins lld+plan+story-when-DEF-exists; LLD-only pins lld; ISSUE-only pins issue; trivial pins none, reviewed as one BUILD-task unit) replacing the old "pinned Story/LLD/Plan" wording, and adds a new contract test (documents-contract.test.ts) that (1) exhaustively checks all 16 subsets of the four optional document roles against both the advertised zod MCP schema (CODE_REVIEW_INPUT) and the stored typebox schema (parsePacket/StoredPacketSchema), confirming they agree and that a 5th unknown key is rejected by both, and (2) asserts the guide text no longer says every packet pins Story/LLD/Plan and does state the per-route document rules. Verified by reading the committed diff at 1f1584ab8, cross-checking DOCUMENT_ROLES/StoryRoute/requiredDocumentRoles in route.ts, StoredPacketSchema in contracts.ts, CODE_REVIEW_INPUT in mcp/code-review/schema.ts, and readWorkflowGuide in daemon/guide-sections.ts (all already built by t1/t2/t4, consistent with this task's claims), and by running the test file on the current checkout (both cases pass) plus a full tsc --noEmit with no errors in the touched files.

Coverage: **verified** — The two test cases are the complete, correct coverage for this task's acceptance checks. The schema-parity test is exhaustive (iterates all 2^4=16 subsets of DOCUMENT_ROLES, not a sample) and checks agreement between the advertised zod schema and the stored typebox schema in both directions (equal success/failure) plus the negative case of a 5th unexpected key being rejected by both. The guide-text test reads the real steering-block.md through the same readWorkflowGuide function the daemon uses, so it cannot pass against stale or differently-worded text, and it positively asserts presence of each new route-specific sentence as well as absence of the old wording. Re-ran the file on the current checkout (node --test) and both cases pass, matching the builder-reported result and confirming the pinned commit's source is unchanged in the working tree for this file.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` on the current checkout — both cases passed, matching the builder's reported result.
- Optional execution: ran `npx tsc --noEmit -p .` — no type errors in the touched files or their dependents (route.ts, contracts.ts, schema.ts, guide-sections.ts).

Inspected references:

- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md`
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — pass
Reviewer-executed on the current checkout; both cases passed (2 pass, 0 fail).

Reused task t6 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t6 (derived-completion.test.ts proving inspectTaskCompletion passes only on a real whole-story pass and is withheld otherwise). Not implicated in the sole attempt-1 failure (t4's location defect), so reused.

### t6: passed

Test only

Coverage: **verified** — ok


Inspected references:

- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
## review-a84e610b0a910d49-s1-r1 — attempt 3

Scope: whole story · reviewer: daemon · 2026-11-03T10:45:07.815Z

6 selected task assessment(s): incomplete.

### Submitted scope

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — [{"after":[1,41]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts` — [{"after":[20,20]}]
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts` — [{"after":[43,45]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — [{"after":[1,100]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts` — [{"after":[11,12]},{"after":[22,22]},{"after":[43,46]},{"after":[63,105]},{"after":[150,150]}]
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts` — [{"after":[1,28]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — [{"after":[1,88]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts` — [{"after":[19,19]}]
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts` — [{"after":[87,105]},{"after":[162,165]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[1,32]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/task-review-rpc.ts` — [{"after":[43,43]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — [{"after":[1,87]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/admission.ts` — [{"after":[11,11]},{"after":[37,37]},{"after":[81,83]},{"after":[86,86]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/contracts.ts` — [{"after":[17,19]},{"after":[90,90]},{"after":[107,107]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/packet.ts` — [{"after":[9,9]},{"after":[23,23]},{"after":[107,113]},{"after":[115,115]},{"after":[169,174]},{"after":[183,183]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/publication.ts` — [{"after":[25,25]}]
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route-source.ts` — [{"after":[1,25]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md` — [{"after":[330,337]}]
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — [{"after":[1,45]}]
- `c42817ef561e05c7a3fb62fbed6a645a88887be8:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — [{"after":[1,77]}]
- `b1e1d3f03b3b3f1156b0be3ed54c2ed0d80bcf61:src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — [{"after":[17,17]},{"after":[31,35]},{"after":[62,69]}]

Attribution for attempt 3 of CR-a84e610b0a910d49-s1, by commit and file scope against the committed Plan. t1 (contracts.ts/task-review-rpc.ts/packet.ts guards + packet-documents.test.ts, commit 476719490), t2 (route.ts/packet.ts routedDocuments + route-documents.test.ts, commit 93bd88c86), t3 (packet.ts derivedUnit + assessment.ts prompt tweak + derived-unit.test.ts, commit ce8e0bb81), t5 (steering-block.md + documents-contract.test.ts, commit 1f1584ab8) and t6 (derived-completion.test.ts, commit c42817ef5) were each passed on their own merits in attempt 1 and reused unchanged in attempt 2 after the host confirmed attempt 1's sole failure was isolated to t4; none of their scope changed since, so they are reused again from attempt 1. t4 (task-review-rpc.ts plan-path guard, admission.ts route wiring, contracts.ts DerivedSchema/header.derived, packet.ts storedDocuments/derived, publication.ts, route-source.ts, task-review-plan-path.test.ts and route-admission.test.ts) never produced a sound terminal verdict in either prior attempt (attempt 1 failed on a finding-location format error, attempt 2 failed on a mangled-commit-hash host error after only noting one valid MED finding about missing coverage of the BUILD-only route and the DEF-present story role). Commit b1e1d3f03 (route-admission.test.ts) was added after attempt 2 specifically to close that MED finding, so t4's code and test scope has materially changed since the last attempted review and there is no sound same-party result to reuse; it is reassessed fresh, scoped to its full change set including the new commit.

Reused task t1 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t1 (StoredPacketSchema.documents loosened to four optional roles in contracts.ts, the two consequential requireReview guards in task-review-rpc.ts and packet.ts, and packet-documents.test.ts's 16-subset plus backward-decode coverage) after reading the full diff and independently re-running the referenced tests and a typecheck. Attempt 2's host note confirmed the only attempt-1 failure was an isolated t4 location-format issue; nothing in t1's files or tests changed afterward, so the sound attempt-1 verdict is reused unchanged.

### t1: passed

t1 loosens StoredPacketSchema.documents to four optional DocumentSchema fields (story/lld/plan/issue, additionalProperties:false), with parsePacket still validating every present document's path. The two call sites that previously assumed a required plan/story/lld now carry explicit requireReview guards (task-review-rpc.ts's plan-path check, packet.ts's story+lld+plan destructure before prepareReviewPacket's document loads) — these are necessary, minimal consequences of the type change (TS narrows via the assertion function) and correctly preserve pre-existing required-document behavior until t2 adds route-awareness. The new packet-documents.test.ts exercises all 16 document-role subsets (including empty), a fifth-key refusal, a still-checked present-path, and backward decode of a pre-change packet/checkpoint/summary-scope. All stated acceptance checks are met.

Coverage: **verified** — Both new tests in packet-documents.test.ts were read in full and inspected against the diff: the first iterates every subset of the 4 document roles (mask 0..15) asserting decoded keys match, then asserts a 5th unknown key is refused (TaskReviewInputError) and that a present document's path is still checked (a '../lld.json' path throws). The second test decodes a pre-change packet (story+lld+plan only) via parsePacket(historical=true), a full ReviewCheckpoint via CheckpointSchema, and a scope object via SummarySchema.properties.scope, asserting deep equality to prove backward compatibility. These directly cover all three stated acceptance checks. I independently ran the test file plus contracts/compatibility/admission/history tests against the current checkout (not just relying on the builder's reported pass) and all passed; I also ran a full tsc --noEmit typecheck, which was clean, confirming the optional-field change and its two consequential guard additions compile correctly under exactOptionalPropertyTypes/noUncheckedIndexedAccess.


Optional verification and advice (nonblocking):

- Optional execution: ran the full referenced test files (packet-documents, contracts, compatibility, admission, history) against the current checkout and a project-wide tsc --noEmit typecheck; all passed/clean, corroborating the builder-reported results rather than only trusting them.

Inspected references:

- `476719490de63f1361ad838a238876b558014f64:src/daemon/task-review-rpc.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/contracts.ts`
- `476719490de63f1361ad838a238876b558014f64:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/contracts.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/record.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — pass
Independently re-executed against the current checkout (not the builder's report); both tests passed in 243ms total.

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/contracts.test.ts src/workflow/code-review/task-review/__tests__/compatibility.test.ts src/workflow/code-review/task-review/__tests__/admission.test.ts src/workflow/code-review/task-review/__tests__/history.test.ts` — pass
Ran together with compatibility/admission/history suites named in the acceptance checks; all 17 tests passed.

Reused task t2 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t2 (StoryRoute/requiredDocumentRoles in route.ts and the routedDocuments branch in packet.ts, exercised by route-documents.test.ts's Plan/LLD-only/ISSUE-only/no-document and refusal cases) on independent review of the diff and a re-run of the test file. Not implicated in attempt 1's sole failure (t4), and unaffected by any later commit, so the attempt-1 verdict is reused.

### t2: passed

t2 adds StoryRoute/requiredDocumentRoles (route.ts) and a routedDocuments branch in packet.ts that prepareReviewPacket uses when a route is supplied, requiring exactly the documents the route produced (Plan: lld+plan, +story only when def; LLD-only: lld; ISSUE-only: issue; otherwise none), while the no-route path (pinnedTriple) is an unmodified extraction of the prior story+lld+plan logic. Verified by reading the full diff against the parent commit, confirming the extraction preserved old behavior/messages verbatim, confirming the new route path's per-role workflow/epicHash/storyId checks match the LLD's stated contract, and re-running the test file against the current checkout (4/4 pass), matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2. A full project typecheck also passed with no errors.

Coverage: **verified** — route-documents.test.ts exercises all three acceptance checks: (1) a Plan+DEF route produces identical documents/tasks/epicHash and the same refusal message as the no-route path on an incomplete set; (2) LLD-only, ISSUE-only and no-document routes each accept exactly their set, and a standalone-vs-DEF Plan route differs only in requiring the story role; (3) mismatched document sets, a wrong-workflow document, a cross-epic document, a cross-story LLD, a cross-issue-hash issue document and a cross-story packet are each refused with a message naming the roles or the offending document. I read both the test bodies/assertions and the implementation they exercise (routedDocuments, requiredDocumentRoles) and confirmed the assertions match the actual thrown messages and returned shapes rather than just signatures. Re-running the file against the current checkout reproduces the daemon-recorded pass (4/4), and the behaviour matches the LLD's stated contract for prepareReviewPacket/StoryRoute. Representative gaps (e.g. no test exercises the 'Plan belongs to another story' or wrong-workflow-for-plan message specifically through the routed path, only through lld/issue) are minor since that validation is the same shared per-role loop already covered for lld and issue; noted in advice, not a coverage defect blocking this assessment.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsc --noEmit -p tsconfig.json` (clean) and `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` against the current checkout (4/4 pass), matching the daemon's recorded result for this task.
- The routed 'story' document check (routedDocuments) only accepts body.stories containing the story id, dropping pinnedTriple's extra `storyMeta['storyId'] === storyId` fallback branch. This is a minor, likely intentional tightening (a DEF's meta normally has no scalar storyId) and isn't exercised differently by any test, so it's not flagged as a defect, but worth knowing if a future DEF shape relies on that fallback.
- route.ts and the new test file use tab indentation while most of this module's existing files (contracts.ts, sources.ts, packet.ts itself) use single-space indentation; this matches the immediately preceding t1 commit's new test file (packet-documents.test.ts), so it's an established pattern for this Story's new files rather than a fresh inconsistency — not raised as a finding.

Inspected references:

- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/__tests__/route-documents.test.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/packet.ts`
- `93bd88c86b925229110da0b67294967a7651faf1:src/workflow/code-review/task-review/route.ts`
- `4f6cc9aa04566e8d787d4a43c43b03ad166f4bb6:src/workflow/code-review/task-review/packet.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/TESTS-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:src/workflow/code-review/task-review/__tests__/selected-code.test.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — pass
Ran directly against the current checkout (HEAD includes t1-t6 commits for this Story); all 4 cases passed in 654ms, matching the daemon's recorded TESTS-a84e610b0a910d49-s1.json result for t2.

Reused task t3 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t3 (derivedUnit() in packet.ts plus the one-line assessment.ts prompt tweak, covered by derived-unit.test.ts's id/checks, size-boundary and multi-task-refusal cases) after reading the diff and re-running the test file. Unaffected by t4's isolated failures in either prior attempt, so the attempt-1 verdict is reused.

### t3: passed

t3 adds derivedUnit() in packet.ts (one new helper, ~19 lines) plus a one-line prompt-text tweak in assessment.ts, and a new 3-test file derived-unit.test.ts covering exactly the task's three acceptance checks. Verified the implementation against the committed diff, confirmed it type-checks cleanly, and re-ran the new test file against the current checkout (HEAD, which is a descendant of this commit) — all 3 cases pass.

Coverage: **verified** — The three new tests map 1:1 onto the task's three acceptance checks: (1) id-from-BUILD-task and checks sourced from LLD acceptance mapping / ISSUE fixIntent / BUILD focus for the three Plan-less route shapes, including the title override from the issue document; (2) the file-count → size boundary table S(1,2)/M(3,8)/L(9); (3) the >1-task-BUILD refusal message and that deriveTaskAssignments/directAssignments attribute all changes and tests to the single derived unit. Re-ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` against the current checkout (HEAD = 9cad5bba4effb34d437b2b376586f50d3d1e7238, a descendant of the reviewed commit ce8e0bb81) and all 3 cases passed, matching the builder-reported result. Also ran `tsc --noEmit` and confirmed no errors touch task-review files, and ran documents-contract.test.ts to confirm no regression from later tasks (t4) that extend packet.ts around derivedUnit without altering its body.


Optional verification and advice (nonblocking):

- Optional execution: ran the mapped test file (`npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`) and `tsc --noEmit -p .` myself against the current checkout; both passed cleanly, consistent with the builder-reported result.
- Minor style note (non-blocking): `let title = ...` in derivedUnit is only ever reassigned in the ISSUE branch — could be inlined as a ternary for consistency with the rest of the function's const-heavy style, but this is a pure readability nit, not a defect.

Inspected references:

- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/assessment.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/packet.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/route.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/code-review/task-review/contracts.ts`
- `ce8e0bb813983cc596f3d59171339563b7c389c5:src/workflow/artifacts/plan.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`
- `9cad5bba4effb34d437b2b376586f50d3d1e7238:src/workflow/code-review/task-review/packet.ts`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — pass
Ran directly against the current working-tree checkout (HEAD 9cad5bba4effb34d437b2b376586f50d3d1e7238, which contains this commit); all 3 cases passed with no modifications needed.

### t4: incomplete

Reviewed all eight files in t4's scope: the task-review-rpc.ts plan-path guard made conditional on a plan document, admission.ts building the route from stored artifacts via the new route-source.ts, contracts.ts's DerivedSchema/header.derived, packet.ts's storedDocuments/derived wiring, publication.ts's re-read, and the two test files (task-review-plan-path.test.ts new, route-admission.test.ts extended by b1e1d3f03). The production code is correct and internally consistent with the LLD/plan: the plan-path identity check in task-review-rpc.ts now only runs when a plan document is present, admission.ts derives the route from the Story's stored artifacts only on a fresh start (never on resume/publication), and the derived unit/epicHash round-trips correctly through header.derived for a plan-less review (verified by the third route-admission.test.ts case). The b1e1d3f03 addition to route-admission.test.ts closes the previously-flagged gap: it now exercises the BUILD-only (trivial) route and the DEF-present story-role requirement through the real `prepareReviewAdmission` -> `readStoryRoute` path, not a mock. However, the new task-review-plan-path.test.ts's second assertion block (the "skipped when the packet has none" half of its own title) does not actually discriminate the fix from the pre-fix behavior: tracing both code paths shows the rejection in both cases is a `TaskReviewInputError` (never a `TypeError`) whose message never matches `/Plan identity must match review subject/`, so the two assertions it makes pass identically whether or not the task-review-rpc.ts guard was made conditional. This undermines the one dedicated regression test for that acceptance check.

Coverage: **partial** — Most of t4's behavior is well covered: route-admission.test.ts (both the original addition and the b1e1d3f03 extension) exercises prepareReviewAdmission end-to-end through the real readStoryRoute reader for an ISSUE-only, LLD-only, Plan+LLD, BUILD-only (trivial, no documents), and DEF-present (story role required) Story, including the document-role mismatch refusals and the no-BUILD refusal before anything is written -- this closes the gap the prior review round identified (BUILD-only route and DEF-present story role previously untested through the real reader). The third route-admission test also verifies the full round-trip of header.derived through a checkpoint for a plan-less review, covering admission.ts's derived-keeping and packet.ts's storedDocuments/derived re-derivation used identically by publication.ts. The one gap is task-review-plan-path.test.ts's 'is skipped when the packet has none' assertion (see finding), which does not actually prove that behavior because both the fixed and unfixed code paths satisfy its assertions for unrelated reasons.

- **MED** `src/daemon/__tests__/task-review-plan-path.test.ts:28-30`: The test's second half, which claims to prove the plan-path identity check 'is skipped when the packet has none', does not discriminate the fix from the pre-fix behavior. Pre-fix, a missing plan document was rejected earlier in the same function by `requireReview(packet.documents.plan, 'documents.plan', 'Expected a plan document')`, which throws a `TaskReviewInputError` (not a `TypeError`) whose message is 'documents.plan: Expected a plan document' -- it never matches `/Plan identity must match review subject/`. Post-fix, the same request instead falls through to `coordinator.start` -> `prepareReviewAdmission` -> `routedDocuments`, which (since the empty temp repo has no stored BUILD/LLD/etc.) rejects with a *different* `TaskReviewInputError` ('documents: Expected the documents none for this Story's route, got lld'), which is also not a `TypeError` and also does not match the Plan-identity regex. So `assert.ok(!(skipped instanceof TypeError), ...)` and `assert.doesNotMatch(String(skipped), /Plan identity must match review subject/, ...)` both pass whether or not the `if (packet.documents.plan)` guard in task-review-rpc.ts:43 is present. The test cannot catch a regression of the behavior it names, leaving that half of the stated acceptance check ('...is skipped when the packet has none') without working coverage.
  task-review-rpc.ts's own removal of the unconditional `requireReview(packet.documents.plan, ...)` line (confirmed by diff) means a `TaskReviewInputError` with message 'Expected a plan document' can no longer be produced at all from that line -- but the test asserts absence of a *different* error (TypeError / Plan-identity message) rather than absence of that specific message or any positive signal that execution proceeded past the removed check. Both the fixed and reverted versions of the guarded line produce an error satisfying both assertions, verified by tracing the control flow of `startTaskReview`, `buildAuthorParty` (catches ENOENT, returns 'unknown'), `coordinator.start`, `readStoryRoute` (catches ENOENT on the missing BUILD file) and `routedDocuments`'s required-vs-supplied check for an empty temp repo with only an `lld` document in the packet.
  Evidence: `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/__tests__/task-review-plan-path.test.ts`, `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/task-review-rpc.ts`, `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route-source.ts`, `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/packet.ts`

Review limitations (blocking):

- Required coverage remains partial: Most of t4's behavior is well covered: route-admission.test.ts (both the original addition and the b1e1d3f03 extension) exercises prepareReviewAdmission end-to-end through the real readStoryRoute reader for an ISSUE-only, LLD-only, Plan+LLD, BUILD-only (trivial, no documents), and DEF-present (story role required) Story, including the document-role mismatch refusals and the no-BUILD refusal before anything is written -- this closes the gap the prior review round identified (BUILD-only route and DEF-present story role previously untested through the real reader). The third route-admission test also verifies the full round-trip of header.derived through a checkpoint for a plan-less review, covering admission.ts's derived-keeping and packet.ts's storedDocuments/derived re-derivation used identically by publication.ts. The one gap is task-review-plan-path.test.ts's 'is skipped when the packet has none' assertion (see finding), which does not actually prove that behavior because both the fixed and unfixed code paths satisfy its assertions for unrelated reasons.

Optional verification and advice (nonblocking):

- Optional execution: did not rerun `npx tsx --test src/daemon/__tests__/task-review-plan-path.test.ts src/workflow/code-review/task-review/__tests__/route-admission.test.ts`; relied on the builder-reported pass and on static control-flow tracing of both files' error paths, which is sufficient to establish the MED finding without execution.
- To actually prove the 'skipped when the packet has none' behavior, assert on the specific error field/message (e.g. that `(skipped as TaskReviewInputError).field !== 'documents.plan'`, or that the rejection message is not 'Expected a plan document'), or point the request at a repo/context where the request succeeds past the plan check so a positive outcome is observable, rather than only ruling out a TypeError and the wrong-plan-path message.

Inspected references:

- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/__tests__/task-review-plan-path.test.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/daemon/task-review-rpc.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/admission.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/contracts.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/packet.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/publication.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route-source.ts`
- `b1e1d3f03b3b3f1156b0be3ed54c2ed0d80bcf61:src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `b602ed9120aa25c9dc3ddb545ad49fabfd1d783d:src/workflow/code-review/task-review/route.ts`

Reused task t5 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t5 (the steering-block.md guide rewording to the route-dependent document set, and documents-contract.test.ts's exhaustive 16-subset schema-parity check plus guide-text assertions) after reading the diff and re-running the test file. Not implicated in either prior attempt's sole t4 failure, so the attempt-1 verdict is reused.

### t5: passed

t5 updates the code-review guide section in src/prompts/steering-block.md to describe the route-dependent document set (Plan route pins lld+plan+story-when-DEF-exists; LLD-only pins lld; ISSUE-only pins issue; trivial pins none, reviewed as one BUILD-task unit) replacing the old "pinned Story/LLD/Plan" wording, and adds a new contract test (documents-contract.test.ts) that (1) exhaustively checks all 16 subsets of the four optional document roles against both the advertised zod MCP schema (CODE_REVIEW_INPUT) and the stored typebox schema (parsePacket/StoredPacketSchema), confirming they agree and that a 5th unknown key is rejected by both, and (2) asserts the guide text no longer says every packet pins Story/LLD/Plan and does state the per-route document rules. Verified by reading the committed diff at 1f1584ab8, cross-checking DOCUMENT_ROLES/StoryRoute/requiredDocumentRoles in route.ts, StoredPacketSchema in contracts.ts, CODE_REVIEW_INPUT in mcp/code-review/schema.ts, and readWorkflowGuide in daemon/guide-sections.ts (all already built by t1/t2/t4, consistent with this task's claims), and by running the test file on the current checkout (both cases pass) plus a full tsc --noEmit with no errors in the touched files.

Coverage: **verified** — The two test cases are the complete, correct coverage for this task's acceptance checks. The schema-parity test is exhaustive (iterates all 2^4=16 subsets of DOCUMENT_ROLES, not a sample) and checks agreement between the advertised zod schema and the stored typebox schema in both directions (equal success/failure) plus the negative case of a 5th unexpected key being rejected by both. The guide-text test reads the real steering-block.md through the same readWorkflowGuide function the daemon uses, so it cannot pass against stale or differently-worded text, and it positively asserts presence of each new route-specific sentence as well as absence of the old wording. Re-ran the file on the current checkout (node --test) and both cases pass, matching the builder-reported result and confirming the pinned commit's source is unchanged in the working tree for this file.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` on the current checkout — both cases passed, matching the builder's reported result.
- Optional execution: ran `npx tsc --noEmit -p .` — no type errors in the touched files or their dependents (route.ts, contracts.ts, schema.ts, guide-sections.ts).

Inspected references:

- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/prompts/steering-block.md`
- `1f1584ab868b849eec7f82f98b51cd81eea596d3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json`

Test: `npx tsx --test --test-force-exit src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — pass
Reviewer-executed on the current checkout; both cases passed (2 pass, 0 fail).

Reused task t6 feedback from attempt 1 (daemon); original assessment attempt 1; not a fresh assessment. Attempt 1 passed t6 (derived-completion.test.ts proving inspectTaskCompletion passes only on a real whole-story pass and is withheld for a task-only, non-passing or stale-fingerprint review). A test-only task, unaffected by t4's isolated failures in either prior attempt, so the attempt-1 verdict is reused.

### t6: passed

Test only

Coverage: **verified** — ok


Inspected references:

- `909bdaa33a93657ffbebc561a56668b43f5de203:.insrc/artifacts/LLD-a84e610b0a910d49-s1.json`
