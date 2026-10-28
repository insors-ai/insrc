<!-- insrc:artifact PLAN-c32aa60534232f36-s1 -->

# Plan: STORY-c32aa60534232f36-s1

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793187743306-ckhhax`
**LLD effective hash:** `12565b4b7f9e...`

Build a strict internal review subject from approved work and explicitly attributed commit packets, with bounded navigation of pinned source. Reuse existing canonicalization and hardened Git helpers. Keep the current review engine and MCP protocols unchanged until later integration.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define immutable subject and foundational runtime contracts | M | — | — | unit: sc1/sc6 canonical identity, invalid value and type contract fixtures | [[c1]] [[c2]] |
| 2 | **`t2`** Extract exact parent-relative Git packets using existing hardened readers | L | — | `t1` | integration: Exact parent/blob/change-kind packet and hardened reader reuse fixtures | [[c1]] [[c3]] |
| 3 | **`t3`** Prepare subjects from approved work and trusted block attribution | L | — | `t1`, `t2` | unit: Approved task projection, trusted attribution and freshness fixtures | [[c1]] [[c4]] |
| 4 | **`t4`** Add bounded pinned source navigation and freshness guards | M | — | `t1`, `t2`, `t3` | integration: Bounded immutable source navigation and reference isolation fixtures | [[c1]] [[c5]] |
| 5 | **`t5`** Prove packet isolation, recovery inputs and compatibility with focused fixtures | M | — | `t1`, `t2`, `t3`, `t4` | integration: Cross-module adversarial scope and legacy/corpus regression fixtures | [[c1]] [[c6]] |

### 1.1 TASK-c32aa60534232f36-s1-t1 — Define immutable subject and foundational runtime contracts

Add exact sc1/sc6 types and typed preparation inputs/errors under investigation/types.ts. Define trusted artifact/build-scope dependencies and limits without implementing later-story stores. Reuse existing canonical JSON and hashing directly.

**Acceptance checks:**
- Export all HLD sc1/sc6 fields, including object|string staging and nullable usage counters; no imports from later Story implementations.
- Preparation inputs distinguish trusted snapshot/provenance dependencies from untrusted selectors; named error causes remain explicit.
- Canonical hash projection and recursive defensive freezing use existing canonicalJson/hashCanonical with explicit limits; reject invalid values.
- Targeted tests for this task pass before advancing; final task adds cross-module regression coverage.

### 1.2 TASK-c32aa60534232f36-s1-t2 — Extract exact parent-relative Git packets using existing hardened readers

Add git-packets.ts over existing createGitRunner; minimally export decodeObject/treeEntry from corpus Git reader without changing behavior. Resolve full commits/actual selected parents, raw metadata and canonical text/non-text blocks with blob provenance.

**Acceptance checks:**
- No HEAD/worktree/range diff selects scope; selected parent is direct parent and every referenced object is verified.
- Represent add/delete/rename-with-edit/binary/mode and one-based inclusive ranges, including null zero-line side; preserve successive edits/reverts.
- NUL-safe paths, no external diff/textconv/replacement refs/network/shell, bounded argv-only processes through existing runner.
- Root commits/submodules/unsupported objects/limits produce explicit refusal; no silent truncation or fallback.
- Targeted tests for this task pass before advancing; final task adds cross-module regression coverage.

### 1.3 TASK-c32aa60534232f36-s1-t3 — Prepare subjects from approved work and trusted block attribution

Add subject.ts to validate root/story/build/artifact bindings, project exact PLAN tasks/checks or legitimate approved upstream basis, verify each selected block against trusted scope records and compute stable immutable subject identity.

**Acceptance checks:**
- All four Story AC obligations are represented: matching mode-independent packets, complete tasks/checks, explicit planless basis and revalidated freshness.
- Caller evidence strings or Story trailer alone cannot attest exclusive block ownership; mixed/forged/overlapping/ambiguous selectors refuse admission.
- Unapproved/stale/corrupt existing PLAN never becomes planless; BUILD need not be approved but source and membership must match trusted scope.
- ContextTree binds explicit build sourceCommit; subject/packet/block identity stable and digest-sensitive; recheck input pins before returning.
- Targeted tests for this task pass before advancing; final task adds cross-module regression coverage.

### 1.4 TASK-c32aa60534232f36-s1-t4 — Add bounded pinned source navigation and freshness guards

Add source.ts and internal exports. Read only subject-bound blob/context-tree or approved immutable snapshot references using existing reader helpers; distinguish complete/partial/unavailable. Add assertReviewSubjectFresh against the original pins.

**Acceptance checks:**
- Foreign HEAD/worktree/symlink content cannot alter pinned source or widen changed scope; context-only reads stay contextual.
- Validate reference allowlist/ranges and resource caps; partial/unavailable have explicit limitations, source digest and requested range.
- Contract revision/digest/source binding mismatch refuses stale subject without treating unrelated HEAD movement as changed scope.
- No runtime ledger/store/accounting backend, MCP registration or engine activation.
- Targeted tests for this task pass before advancing; final task adds cross-module regression coverage.

### 1.5 TASK-c32aa60534232f36-s1-t5 — Prove packet isolation, recovery inputs and compatibility with focused fixtures

Complete deterministic real-temp-Git integration and adversarial fixtures covering approved LLD test strategy, run focused investigation/corpus/legacy attribution subsets and production build. Record validation evidence without claiming later-story recovery implementation.

**Acceptance checks:**
- All ac1-ac4 proving tests and LLD unit/integration/contract subjects are mapped and pass without live providers.
- Exercise foreign commits/hunks/HEAD movement, merges, intermediate revert, change kinds, path edge cases, object failures, limits, invalid artifacts and planless provenance.
- Corpus helper tests and existing legacy attribution behavior stay green; no production routing change or data rewrite.
- Build and validation records include exact tests/results and independent code review follows the approved workflow.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| review-s1-ac1 packet parity and complete task/check projection | `t2`, `t5` |
| review-s1-ac2 forged/missing evidence, duplicate selectors and ambiguous mixed hunks refusal | `t2`, `t3`, `t5` |
| review-s1-ac3 planless route provenance, unapproved PLAN cannot fall back | `t3`, `t4`, `t5` |
| review-s1-ac4 artifact revision/content race rejection | `t3`, `t4`, `t5` |
| Canonical digest stable across key order, meaningful changes invalidate, no mode dependency | `t2`, `t5` |
| sc6 accepts object\|string centrally and preserves nullable five-counter usage observation without later-story imports | `t1`, `t5` |
| Reuse canonicalJson/hashCanonical: same accepted bytes/digest as existing helper, invalid-value errors preserved and limits explicit; no second serializer. | `t1`, `t5` |
| review-s1-ac1 add/delete/rename-with-edit/binary/mode and explicit merge parent packet contents | `t2`, `t5` |
| review-s1-ac2 shared commits/files, foreign hunks and unrelated HEAD changes excluded; intermediate edits/reverts retained | `t2`, `t3`, `t5` |
| review-s1-ac3 source navigation works offline; no source symlink following | `t3`, `t4`, `t5` |
| review-s1-ac4 immutable reads and missing-object rejection; changed pinned contracts stale | `t3`, `t4`, `t5` |
| NUL-delimited whitespace/Unicode/leading-dash paths; no external diff/textconv or replacement refs | `t2`, `t5` |
| Zero-count ranges, oversized output/time refusal; root/submodule/unsupported format explicit rejection | `t2`, `t5` |
| Existing grounding/attribution tests unchanged | `t2`, `t5` |
| Owned sc1/sc6 exported types match HLD, no MCP registration or engine activation | `t1`, `t5` |
| Existing corpus canonical and Git reader fixture suites remain unchanged; additive decodeObject/treeEntry exports preserve identity validation; workflow import causes no DB access. | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails and sc1 subject data model`
- **[[c2]]** `prior-artifact` `LLD s1 sc6 runtime ports and canonical reuse`
- **[[c3]]** `prior-artifact` `LLD s1 exact Git packets and hardened reader reuse`
- **[[c4]]** `prior-artifact` `LLD s1 approved work projection and trusted attribution`
- **[[c5]]** `prior-artifact` `LLD s1 error paths, source navigation and freshness`
- **[[c6]]** `prior-artifact` `LLD s1 testStrategy and additive migration`
