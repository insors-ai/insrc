<!-- insrc:artifact PLAN-1703991c69967193-s2 -->

# Plan: E202609181703991c:S002

**Epic:** `add-bugfix-triage-category-insrc-framework`
**LLD run:** `wf-1789734372058-nb1m37`
**LLD effective hash:** `e08e0c0d9f7b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add item-root 'ISSUE' ArtifactKind + issueArtifactId + issue path helper | S | — | unit: ArtifactKind includes 'ISSUE'; STORY_SCOPED does NOT include 'ISSUE' (item-root like SPEC/DEF/HLD); unit: the existing kinds keep their classification: SPEC/DEF/HLD item-root, LLD/PLAN/BUILD/CR/EXT story-scoped (byte-for-byte unchanged); unit: an ISSUE artifact path resolves to an item-root ISSUE.md (+ its .json), and allArtifactMdPaths enumerates it alongside SPEC/DEF/HLD; unit: issueArtifactId(hash) === `ISSUE-${hash}` and the id-marker round-trips (extractable back to the id) | [[c3]] |
| 2 | **`t2`** Add the artifacts/issue.ts record family (mirror spec.ts) | M | `t1` | unit: isIssueBody accepts { title, reproduction, rootCause, fixIntent } (all non-empty) and rejects a body missing/emptying any of the four fields; unit: renderIssueMarkdown emits the id-marker header + `# <title>` + `## Reproduction`/`## Root cause`/`## Fix intent` sections in order; unit: renderIssueMarkdown output contains NONE of magnitude/parentRef/issueHash (meta-only fields never leak into the GH body) — k4; unit: ISSUE_SCHEMA_VERSION === 1 | [[c1]] [[c2]] |
| 3 | **`t3`** Add the runners/issue/ step set (issue.capture + checklist.verify) + registerIssueRunners | M | `t2` | integration: registerIssueRunners registers issue.capture + checklist.verify (idempotent; second call no-ops) and executor can look them up | [[c1]] |
| 4 | **`t4`** Wire the three orchestrator `case 'issue'` arms (decomposer/synthesizer/finalize) | L | `t1`, `t2`, `t3` | integration: buildDecomposerPrompt('issue') / buildSynthesizerPrompt('issue') return the issue stage prompts (the three orchestrator `case 'issue'` arms are wired); integration: finalizeIssue turns a converged capture+synthesize output into exactly ONE persisted IssueArtifact (meta.workflow==='issue', magnitude carried from the seed) written md+json under the docs/ tree; integration: finalizeIssue rejects a body failing isIssueBody / malformed citations with a schemaFailure (no partial write); integration: the four existing workflows' decomposer/synthesizer/finalize arms are unaffected by the new `case 'issue'` | [[c1]] [[c2]] |
| 5 | **`t5`** Register the issue stage in registerWorkflowRunners | S | `t3`, `t4` | integration: registerWorkflowRunners wires the issue stage so a workflow:'issue' run resolves its runners + dispatches through the orchestrator arms (existing seven registrations unchanged) | [[c1]] |
| 6 | **`t6`** Add the issue-stage tests (record family + additive-kind + end-to-end) and verify locally | M | `t4`, `t5` | integration: insrc_review_step over the ISSUE md keys stage='issue' and insrc_workflow_approve stamps meta.approvedAt — no issue-specific gate code (reuses the brainstorm/DEF path); unit: full src/workflow suite green via tsx --test; the four existing stages' arms remain unaffected (regression sweep) | [[c4]] [[c1]] [[c2]] [[c3]] |

### E202609181703991c:S002:T001 — Add item-root 'ISSUE' ArtifactKind + issueArtifactId + issue path helper

In src/workflow/path-scheme.ts add 'ISSUE' to the ArtifactKind union (line 45), leave STORY_SCOPED (line 67) unchanged (ISSUE is item-root), and add ISSUE to the item-root branch of allArtifactMdPaths (~173) alongside SPEC/DEF/HLD. In src/workflow/storage.ts add `issueArtifactId(issueHash)='ISSUE-${issueHash}'` (mirror specArtifactId:165) + the per-artifact issue path function returning { md, json } (mirror the spec path helper ~319). Landed FIRST so the record family (t2) can import issueArtifactId.

**Acceptance checks:**
- ArtifactKind includes 'ISSUE'; STORY_SCOPED does NOT include it; the eight existing kinds' item-root/story-scoped classification is byte-for-byte unchanged.
- issueArtifactId('abc') === 'ISSUE-abc'; the issue path helper returns an item-root ISSUE.md + its ARTIFACTS_DIR/ISSUE-<hash>.json, mirroring the spec helper.
- allArtifactMdPaths enumerates an ISSUE.md at the work-item root; tsc exhaustiveness passes for every ArtifactKind consumer.

### E202609181703991c:S002:T002 — Add the artifacts/issue.ts record family (mirror spec.ts)

Create src/workflow/artifacts/issue.ts mirroring artifacts/spec.ts: `IssueArtifactBody` (readonly title/reproduction/rootCause/fixIntent), `export type IssueArtifact = WorkflowArtifact<IssueArtifactBody>`, `export const ISSUE_SCHEMA_VERSION = 1`, `renderIssueMarkdown(artifact)` (id-marker header via artifactIdMarker(issueArtifactId(meta.issueHash)) then `# <title>` + `## Reproduction`/`## Root cause`/`## Fix intent` sections — BODY fields only, no magnitude/parentRef), and `isIssueBody` (+ reuse isCitationArray). Imports issueArtifactId + artifactIdMarker from ../storage.js (landed in t1) and types from ../types.js.

**Acceptance checks:**
- IssueArtifactBody has exactly the four readonly prose fields; IssueArtifact = WorkflowArtifact<IssueArtifactBody>.
- isIssueBody returns true only for a body with all four non-empty string fields; false otherwise.
- renderIssueMarkdown emits the id marker + title heading + the three body sections and NOTHING from meta (magnitude/parentRef/issueHash absent from output).
- ISSUE_SCHEMA_VERSION === 1; tsc compiles (issueArtifactId resolves from t1).

### E202609181703991c:S002:T003 — Add the runners/issue/ step set (issue.capture + checklist.verify) + registerIssueRunners

Create src/workflow/runners/issue/index.ts (+ schemas.ts) mirroring runners/define/index.ts: two StepRunners — `issue.capture` (llm-pause: assemble reproduction/root-cause/fix-intent, grounded via insrc_analyze_step over the defect, seeded from intent.focus + the bugfix magnitude; schema = the issue body shape) and `checklist.verify` (audit: concrete repro, cited, no over-reach into the fix implementation) — plus `registerIssueRunners()` calling registerRunner(issueCapture)/registerRunner(checklistVerify) behind a `registered` guard.

**Acceptance checks:**
- Two StepRunners with ids 'issue.capture' and 'checklist.verify', both workflow:'issue', each {run(ctx)->llm-pause{prompt,userTurn,schema}, finalize}.
- registerIssueRunners is idempotent (a `registered` guard) and, after calling, executor can look up both runner ids.
- issue.capture's prompt instructs grounding via insrc_analyze_step + seeds from focus+magnitude; checklist.verify audits (cited/no-solution-leak). tsc compiles.

### E202609181703991c:S002:T004 — Wire the three orchestrator `case 'issue'` arms (decomposer/synthesizer/finalize)

In src/workflow/orchestrator.ts add a `case 'issue'` arm to each of the three per-workflow switches, mirroring the brainstorm arms: issueDecomposer(intent) (emits the 2-step issue plan) in buildDecomposerPrompt (~146); issueSynthesizer(intent, stepOutputs) (the synthesize-turn prompt for { body, citations }) in buildSynthesizerPrompt (~263); and finalizeIssue(...) in finalizeArtifact (~375) — builds the IssueArtifact ({ workflow:'issue', meta incl. magnitude+issueHash, body, citations }) after isIssueBody/isCitationArray guards (schemaFailure on failure, mirroring finalizeBrainstorm), renders via renderIssueMarkdown, and writes md+json through storage. ALL THREE arms land together (one atomic 'make the workflow dispatch' unit — no half-wired switch). The four existing arms are untouched.

**Acceptance checks:**
- ALL THREE arms present: buildDecomposerPrompt('issue') returns the issue decomposer prompt; buildSynthesizerPrompt('issue') returns the issue synthesize prompt; finalizeArtifact handles workflow 'issue'.
- finalizeArtifact for workflow 'issue' builds+renders+persists exactly ONE IssueArtifact (meta.workflow==='issue', magnitude from the seed carried onto meta), md+json under the docs/ tree.
- finalizeIssue returns a schemaFailure (no write) when the body fails isIssueBody or citations fail isCitationArray — the same path as finalizeBrainstorm.
- The brainstorm/define/design.epic/design.story/plan/stub/tracker arms return byte-for-byte identical output; tsc compiles.

### E202609181703991c:S002:T005 — Register the issue stage in registerWorkflowRunners

In src/workflow/index.ts add `import { registerIssueRunners } from './runners/issue/index.js'` and a `registerIssueRunners()` call inside registerWorkflowRunners, alongside the existing per-stage registrations — the single line that makes the `issue` stage dispatchable.

**Acceptance checks:**
- registerWorkflowRunners calls registerIssueRunners; the existing seven registrations are unchanged and the function stays idempotent.
- After registerWorkflowRunners runs, a workflow:'issue' run resolves its runners AND dispatches through the wired orchestrator arms (t4); tsc compiles.

### E202609181703991c:S002:T006 — Add the issue-stage tests (record family + additive-kind + end-to-end) and verify locally

Add tests under src/workflow/__tests__/ mirroring spec-artifact.test.ts + spec-review-approve.test.ts: (a) record-family unit tests; (b) ArtifactKind additive-invariant unit tests; (c) an end-to-end integration test (registerIssueRunners -> buildDecomposer/Synthesizer('issue') -> finalizeIssue -> one persisted IssueArtifact -> insrc_review_step stage='issue' -> insrc_workflow_approve stamps meta.approvedAt; finalizeIssue schemaFailure on bad body). Run `npx tsx --test 'src/workflow/**/*.test.ts'` and confirm green.

**Acceptance checks:**
- All ac1 proving tests pass: one persisted IssueArtifact capturing repro/root-cause/fix-intent, item-root ISSUE.md enumerated, renderIssueMarkdown pure prose with id-marker.
- All ac2 proving tests pass: review keyed stage='issue' + approve stamps meta.approvedAt; schemaFailure gate on a malformed body.
- The full src/workflow test suite is green locally via tsx --test; no existing assertion is weakened; the four existing stages' arms remain unaffected.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| isIssueBody accepts { title, reproduction, rootCause, fixIntent } (all non-empty) and rejects a body missing/emptying any of the four fields | `t2` |
| renderIssueMarkdown emits the id-marker header + `# <title>` + `## Reproduction`/`## Root cause`/`## Fix intent` sections in order | `t2` |
| renderIssueMarkdown output contains NONE of magnitude/parentRef/issueHash (meta-only fields never leak into the GH body) — k4 | `t2` |
| issueArtifactId(hash) === `ISSUE-${hash}` and the id-marker round-trips (extractable back to the id) | `t1` |
| ISSUE_SCHEMA_VERSION === 1 | `t2` |
| ArtifactKind includes 'ISSUE'; STORY_SCOPED does NOT include 'ISSUE' (item-root like SPEC/DEF/HLD) | `t1` |
| the existing kinds keep their classification: SPEC/DEF/HLD item-root, LLD/PLAN/BUILD/CR/EXT story-scoped (byte-for-byte unchanged) | `t1` |
| an ISSUE artifact path resolves to an item-root `ISSUE.md` (+ its .json), and allArtifactMdPaths enumerates it alongside SPEC/DEF/HLD | `t1` |
| registerIssueRunners registers issue.capture + checklist.verify (idempotent; second call no-ops) and executor can look them up | `t3` |
| buildDecomposerPrompt('issue') / buildSynthesizerPrompt('issue') return the issue stage prompts (the three orchestrator `case 'issue'` arms are wired) | `t4` |
| finalizeIssue turns a converged capture+synthesize output into exactly ONE persisted IssueArtifact (meta.workflow==='issue', magnitude carried from the seed) written md+json under the docs/ tree | `t4` |
| finalizeIssue rejects a body failing isIssueBody / malformed citations with a schemaFailure (no partial write) | `t4` |
| insrc_review_step over the ISSUE md keys stage='issue' and insrc_workflow_approve stamps meta.approvedAt — no issue-specific gate code (reuses the brainstorm/DEF path) | `t6` |
| the four existing workflows' decomposer/synthesizer/finalize arms are unaffected by the new `case 'issue'` | `t4`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails + dataModelChanges — the stage-authoring seams: runners/issue/ StepRunners via registerRunner, the three orchestrator case 'issue' arms, registerWorkflowRunners registration (mirrors runners/define + finalizeBrainstorm)`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges — the artifacts/issue.ts record family (IssueArtifactBody + IssueArtifact = WorkflowArtifact<IssueArtifactBody> + ISSUE_SCHEMA_VERSION + renderIssueMarkdown + isIssueBody), mirroring artifacts/spec.ts`
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges — the persistence additions: item-root 'ISSUE' ArtifactKind (path-scheme.ts) + issueArtifactId + issue path helper (storage.ts)`
- **[[c4]]** `prior-artifact` `LLD s2 errorPaths/interactionWithShared — the review/approve gate keyed on meta.workflow='issue' (reuses insrc_review_step/insrc_workflow_approve, no issue-specific gate code)`
