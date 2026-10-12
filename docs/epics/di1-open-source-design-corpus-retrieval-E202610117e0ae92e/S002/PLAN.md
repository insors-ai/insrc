<!-- insrc:artifact PLAN-7e0ae92e8f3d3c3e-s2 -->

# Plan: E202610127e0ae92e:S002

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**LLD run:** `wf-1791745544219-m4dk9n`
**LLD effective hash:** `a20e4da9408d...`

Build a reviewed, file-level ingestion path for the design corpus, retaining pinned source identities and complete attribution through packaged outputs. Keep eligibility, lineage and notice checks pure, with local Git acquisition isolated behind a bounded binary reader. Independently validate the assembled candidate before issuing its eligibility assessment; editorial coverage and publication remain downstream.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define strict source contracts and validation primitives | M | — | unit: source-schema preserves exact sc3 shapes and rejects invalid identities and fields; unit: validation-parity matches S001 path collision and UTC timestamp behavior | [[c1]] [[c2]] |
| 2 | **`t2`** Implement reviewed file eligibility and dependency closure | M | `t1` | unit: mixed-eligibility admits only reviewed exact-file profiles with complete evidence; unit: mixed-eligibility propagates stale evidence without rejecting independent eligible files; unit: mixed-eligibility requires explicit font and compound-license decisions | [[c1]] [[c3]] |
| 3 | **`t3`** Read exact local Git objects without text conversion | M | `t1` | integration: pinned-reader preserves binary commit bytes despite worktree and branch changes; integration: pinned-reader rejects missing commits paths and corrupt object framing; integration: reader-safety rejects selected unsafe paths before I/O and ignores unselected paths; integration: reader-safety rejects symlinks and submodules and leaves LFS unresolved; integration: reader-safety prevents replacement filters lazy fetch and config-driven commands | [[c1]] [[c4]] |
| 4 | **`t4`** Enforce reader resource limits and failure cleanup | M | `t3` | integration: reader-safety bounds aggregate source and shared evidence bytes and counts; integration: reader-safety cancels timed-out aborted and failed children without admitted bytes; integration: reader-safety rejects truncated or oversized stdout and stderr without leaks | [[c1]] [[c4]] |
| 5 | **`t5`** Bind every distributed output to reviewed provenance | M | `t1`, `t2` | unit: lineage-closure retains every source and transformation for derived outputs; unit: lineage-closure rejects unbound specimens inconsistent provenance and stale outputs; unit: lineage-closure requires explicit original and inferred output declarations | [[c1]] [[c3]] |
| 6 | **`t6`** Generate complete deterministic notices and evidence inventory | M | `t2`, `t5` | unit: notice-closure preserves exact evidence bytes and all source obligations; unit: notice-closure deduplicates shared evidence without losing attribution; unit: notice-closure produces stable expected bytes and rejects invalid evidence text | [[c1]] [[c3]] |
| 7 | **`t7`** Compose staging and independently validate candidate eligibility | M | `t4`, `t5`, `t6` | unit: eligibility-binding reconstructs obligations and rejects modified candidate metadata; unit: eligibility-binding rejects role swaps stale profiles and changed output evidence; unit: acyclic-staging assesses before coverage finalization and rejects missing or duplicate coverage | [[c1]] [[c2]] [[c3]] |
| 8 | **`t8`** Prove acceptance and pure boundaries; document maintainer handoff | M | `t7` | integration: candidate-roundtrip admits only eligible material and exports complete notices; integration: candidate-roundtrip validates original-only and multi-source derived packages; smoke: pure-boundary executes pure source modules with I/O forbidden; smoke: strict-build compiles source eligibility and passes the full corpus regression suite | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 E202610127e0ae92e:S002:T001 — Define strict source contracts and validation primitives

Add proposed sources/contracts.ts and validation-primitives.ts plus a pure sources entry; exact sc3 TypeBox/AJV schemas, internal reviewed profiles and lineage envelopes, deterministic source identity from canonical repository URL/full revision/path tuple.

**Acceptance checks:**
- Exact SourceFile/SourceManifest/ImportReport shapes; no coercion, defaults or unknown fields; unique source IDs, full 40/64 lower-hex commits, SHA256 digests and portable evidence refs.
- Internal profiles carry policy version, explicit categories, reviewed exact-file/evidence digests, reviewer and obligation decisions; never accept caller eligibility as authorization.
- Reuse exported isPortablePath and canonical helpers; local NFC/lowercase and UTC timestamp checks match S001 public behavior for adversarial paths/dates without new S001 exports.

### 1.2 E202610127e0ae92e:S002:T002 — Implement reviewed file eligibility and dependency closure

Add proposed sources/policy.ts and eligibility.ts pure staging policy over acquired bytes and reviewed descriptors.

**Acceptance checks:**
- Only exact allowlisted repository/revision/path/digest profiles with explicit reviewed license/evidence obligations admit bytes; MIT/Apache-2.0/CC0 labels alone never authorize admission; fonts and compound expressions require explicit reviewed decisions.
- Unknown/conflicting/absent terms unresolved; disallowed paths/repositories excluded; stale successfully acquired file/evidence digests unresolved for affected paths and all requested dependents while independent eligible files remain admitted.
- Resolve bounded evidence closure deterministically; malformed input, duplicate/colliding identities or limit excess fail request; no unresolved/excluded bytes in staged payload, no provider/network and no implicit clock.

### 1.3 E202610127e0ae92e:S002:T003 — Read exact local Git objects without text conversion

Add proposed sources/git-reader.ts separate I/O entry and injectable binary process seam; local repository only, pinned full commit and exact tree/blob membership.

**Acceptance checks:**
- Read raw binary blob bytes from verified commit objects despite dirty worktree/branch movement; verify full commit type and object framing; reject missing revision/path or inconsistent acquisition as request-level failure with no admitted result.
- Validate all selected paths before process I/O; selected percent/colon/traversal/duplicate/case-NFC collisions fail; unselected repository paths do not affect results.
- Use shell:false argv with literal paths, disable replacement objects/lazy fetching/config-driven commands and filters; never clone/fetch/checkout or execute source; reject selected symlinks/submodules, identify LFS as unresolved unsupported material.

### 1.4 E202610127e0ae92e:S002:T004 — Enforce reader resource limits and failure cleanup

Complete binary reader bounds and lifecycle in proposed sources/git-reader.ts with controlled process fixtures.

**Acceptance checks:**
- Apply <=10000 files and <=64MiB aggregate acquired bytes including evidence, incremental bounded stdout/stderr and <=30-second child timeout; reject excess before retaining unbounded output, never silently truncate.
- Abort/cancel, malformed/truncated stream, spawn/exit failure and missing Git return sanitized request failures with no admitted bytes; terminate children and release handles/buffers.
- Tests exercise exact boundary and over-limit behavior without huge allocations or sleeps using injected limits/process seam; local integration demonstrates no network/config-command/filter execution.
- Count requested files and their transitive license/notice evidence together within the request-wide budget, deduplicating shared acquired objects deliberately; shared evidence cannot bypass count/byte limits.

### 1.5 E202610127e0ae92e:S002:T005 — Bind every distributed output to reviewed provenance

Add proposed sources/lineage.ts, fixed sources/lineage.json schema v1 and source-to-output closure validation.

**Acceptance checks:**
- Each output path+digest binds full contributing source ID union and reviewer/transformation/modification records; imported copies equal upstream digest, derived bytes use independently checked output digests.
- Record sourceRefs/modificationNotes agree with bindings; original/inferred content requires explicit author/rationale declarations; metadata/evidence explicitly categorized; an original record label cannot hide unbound third-party specimens.
- Missing contributors, unbound outputs, stale bytes, unresolved references, conflicting declarations and path collisions fail; deterministic lineage bytes are in manifest.files with no candidate/final digest embedded.

### 1.6 E202610127e0ae92e:S002:T006 — Generate complete deterministic notices and evidence inventory

Add proposed sources/notices.ts producing source manifest, NOTICE and unchanged license/notice evidence bytes from eligible closure and lineage.

**Acceptance checks:**
- Preserve exact repository/revision/path/digest, license IDs, all attributions and modifications; license/notice refs resolve to immutable packaged evidence, never remote or absolute paths.
- Stable code-unit ordering by sourceId/path; deduplicate identical evidence by raw SHA256 while retaining every association; strict bounded evidence text decode, never decode binary assets as text.
- Include only admitted source/evidence entries in SourceManifest; keep rejected ImportReport outside distributed bytes; deterministic output independent of locale, input order, machine path and current time; expected fixture bytes authored independently.

### 1.7 E202610127e0ae92e:S002:T007 — Compose staging and independently validate candidate eligibility

Add pure sources/assessment.ts and separate sources/stage.ts I/O orchestration; sources/index.ts exports only pure modules, consuming sc1/sc2 unchanged.

**Acceptance checks:**
- Stage source/output bytes then source manifest/lineage/notices; caller declares coverage path/mediaType placeholder before candidate hash; compute eligibility before S003 coverage is finalized.
- Independently reconstruct expected metadata, obligations and evidence closure from reviewed inputs; compare candidate bytes and inventory, not caller pass flags or generator invocation; missing contributor, altered metadata/evidence/output or swapped role paths withhold passing assessment.
- Emit stage=eligibility bound to nonempty candidateContentDigest only; zero/duplicate coverage membership returns ValidationResult failure, not malformed assessment; no catalog install, publication, coverage algorithm, MCP/IPC or guideline workflow.

### 1.8 E202610127e0ae92e:S002:T008 — Prove acceptance and pure boundaries; document maintainer handoff

Add proposed sources/__tests__/acceptance.test.ts and isolation.test.ts, reuse S001 fixtures without changing their semantics; document reviewed-profile/staging sequence and limitations in corpus README.

**Acceptance checks:**
- Mixed local source end-to-end admits only eligible bytes with exact revisions/attribution/modifications; complete export inventory covers all third-party obligations and S001 preflight accepts using explicitly synthetic S003 coverage fixtures.
- Mutation regressions fail for stale profile, source refs, notice omission, lineage/output digest, role swap and noncomputable candidate; original-only and multi-source derived cases pass when complete.
- Compile fresh pure corpus/sources entries and run policy/notices/assessment with I/O forbidden; Git entry separate; all corpus tests and strict build pass under supported Node; preserve durable test/build evidence for daemon review.
- Document no migration needed for new sc3 module, maintainer-reviewed profiles and future S003/S004 handoff; request independent daemon code review after build and explicit completion approval.
- Every preceding task has named tests executed at its own gate; this task adds acceptance and boundary evidence, then runs the accumulated regression suite.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| source-schema: exact sc3 round-trip, strict unknown fields, unique IDs, full revisions and portable evidence refs | `t1` |
| mixed-eligibility: eligible/unknown/conflicting/excluded files, expression and font-profile handling, no label-only admission; stale file/evidence profiles remain per-file unresolved and propagate to dependents | `t2` |
| lineage-closure: multi-source derived outputs, original declarations, record sourceRefs and modifications, no unbound specimens | `t5` |
| validation-parity: local collision/timestamp primitives match S001 public-validator behavior on the shared adversarial matrix without exporting private S001 helpers | `t1` |
| notice-closure: every included source and obligation retained, byte-exact evidence, deterministic ordering and shared evidence deduplication | `t6` |
| eligibility-binding: swapped source/notices roles, changed attribution/output/evidence bytes and stale profiles invalidate assessments | `t7` |
| acyclic-staging: coverage placeholder enables eligibility before coverage finalization; zero/duplicate coverage membership yields failure rather than an empty StageAssessment | `t7` |
| pinned-reader: exact commit bytes despite dirty worktree/branch movement; binary round-trip and missing revision/path | `t3` |
| reader-safety: symlink/submodule/LFS rejection, unsafe paths, collisions, byte/count/time limits, cancellation and subprocess failure with no admitted bytes; acquisition-integrity failures abort the request, and any selected non-portable path fails before I/O while unselected paths do not | `t3`, `t4` |
| candidate-roundtrip: mixed source staging through source manifest/notices/lineage and S001 preflight, with complete exported inventory | `t8` |
| pure-boundary: sc1/sc2 import and pure eligibility/notices run with I/O forbidden; Git adapter imported separately | `t8` |
| strict-build: npm run build and all corpus tests under supported Node | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 .insrc/artifacts/LLD-7e0ae92e8f3d3c3e-s2.json: contractDetails; dataModelChanges; errorPaths; testStrategy; chosenAlternative a1; approvedAt 2026-10-12T04:44:27.130Z`
- **[[c2]]** `prior-artifact` `LLD s2 hldContextSlice sc3/sc1/sc2; interactionWithShared; dataModelChanges strict schemas; reviewResolutions new-versus-reuse.1. Consumed S001 contracts/canonical/validate and pure-boundary tests remain unchanged.`
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges reviewed policy, source-to-output lineage and deterministic notices; errorPaths and reviewResolutions error-paths.1/data-compatibility.2; acceptanceMapping ac1/ac2.`
- **[[c4]]** `prior-artifact` `LLD s2 dataModelChanges pinned Git acquisition; errorPaths resource/subprocess failures; testStrategy pinned-reader/reader-safety/pure-boundary; citations c5 identifies src/daemon/tools/builtins/git/helpers.ts:40 and shell-helper.ts:52-102.`
