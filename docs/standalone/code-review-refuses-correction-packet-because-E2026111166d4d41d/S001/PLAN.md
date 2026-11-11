<!-- insrc:artifact PLAN-66d4d41d99f805af-s1 -->

# Plan: STORY-66d4d41d99f805af-s1

## Summary

**Epic:** `code-review-refuses-correction-packet-because`
**LLD run:** `wf-1794388416311-k9tkvg`
**LLD effective hash:** `d15c0d69afa2...`

Building this Story first pins the projection identity the current code produces, then adds a full-history option to the existing git path-history tool and a matching source method, and finally switches the path-continuity check to inspect only the commits that changed each selected file. Each step keeps every existing outcome and limit; the last step proves cost no longer grows with unrelated commits and replays the refused correction packet.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pin the pre-change projection identity | S | — | — | integration: projection identity matches the identity pinned from the code before the change | [[c4]] [[c5]] |
| 2 | **`t2`** Full-history option on git_path_history | S | — | — | unit: fullHistory lists a side-branch deletion and the merge that default history omits; unit: without fullHistory the listing is unchanged | [[c1]] |
| 3 | **`t3`** pathChanges source method | M | — | `t2` | integration: pathChanges lists the commits that changed the path and refuses a failed or malformed listing as a source error; integration: boundedProjectionSources caches pathChanges and charges one read per uncached listing | [[c2]] [[c3]] |
| 4 | **`t4`** Listing-driven path continuity | M | — | `t1`, `t3` | integration: lineage reads do not grow with interleaved commits that leave the selected path untouched; integration: a side-branch deletion merged back with the file kept still interrupts lineage; integration: a side-branch deletion and recreation merged back still interrupts lineage; integration: a path history failure is a source error, not a projection limit or lineage conflict; integration: the read limit still refuses with projection_limit when the selected file itself changed too often; integration: projection identity matches the identity pinned from the code before the change; integration: identical final blobs cannot hide an unselected rename-away and recreation; integration: selected rename chains compare exact blobs independently of rename similarity and reject unselected moves; integration: production projection budgets accept their exact ceilings and refuse the next unit; smoke: the eedc4519199b24b4/s1 correction packet prepares without projection_limit and attempt 4 re-prepares saved attempts 1-3 to their stored identities | [[c3]] [[c4]] [[c5]] |

### 1.1 TASK-66d4d41d99f805af-s1-t1 — Pin the pre-change projection identity

Before any behaviour change, add the deterministic fixture (fixed author/committer identity and dates, explicit merge messages, isolated git config) with a selected change, interleaved commits and a merge that leave the selected path untouched, and a selected rename; compute its projectionIdentity with the current pathContinuity and pin it as a constant in projection-lineage.test.ts.

**Acceptance checks:**
- The pinned-identity test passes against the unchanged code, and the constant was produced by that code.
- Running the fixture twice yields the same commit OIDs and identity.

### 1.2 TASK-66d4d41d99f805af-s1-t2 — Full-history option on git_path_history

Add the optional fullHistory boolean to git_path_history's input schema; when true pass --full-history. Default argv unchanged.

**Acceptance checks:**
- With fullHistory the tool lists a side-branch deletion and both merge kinds that default history omits.
- Without fullHistory the argv and output are unchanged.

### 1.3 TASK-66d4d41d99f805af-s1-t3 — pathChanges source method

Add required pathChanges(from, to, path) to ReviewSources; implement it in RegistryReviewSources through git_path_history { cwd: this.deps.repoPath, rev: from..to, path, fullHistory: true } with full-OID validation and field 'source' errors; wrap it in boundedProjectionSources (cached per [from,to,path], one budget.read per uncached call); bind it in every ReviewSources test literal. pathContinuity is not changed yet.

**Acceptance checks:**
- A failed listing, a non-hexadecimal sha, or a sha whose length differs from the from/to OIDs raises TaskReviewInputError with field source.
- Every existing task-review test that builds a ReviewSources literal still passes with pathChanges bound.

### 1.4 TASK-66d4d41d99f805af-s1-t4 — Listing-driven path continuity

Switch pathContinuity to examine only commits from sources.pathChanges that descend from the origin, comparing existence on each edge whose parent is the origin or descends from it; keep the selected-origin exemption, error message and LIMITS; update the comment. Add the cost, lineage, failure and read-limit tests and keep the pinned identity.

**Acceptance checks:**
- Selected-path file() calls, decoded bytes and pathChanges calls are equal for 4 and 40 untouched interleaved commits.
- Side-branch deletion/recreation merged back still fails with scope_conflict; existing projection tests (including the rename and move-exemption tests) pass.
- The pinned identity from t1 still matches.
- The eedc4519199b24b4/s1 correction packet prepares without projection_limit, and starting attempt 4 of board-common-model-s1 re-prepares attempts 1-3 to their stored identities (reported smoke).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| git_path_history | `t2` |
| pathContinuity | `t4` |
| boundedProjectionSources | `t3` |
| RegistryReviewSources | `t3` |
| ReviewSources | `t3` |
| projectReviewScope | `t1`, `t4` |
| prepareReviewPacket | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api git_path_history`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api ReviewSources, RegistryReviewSources, boundedProjectionSources and dataModelChanges ReviewSources`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.api pathContinuity and errorPaths`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c5]]** `prior-artifact` `LLD s1 migration`
