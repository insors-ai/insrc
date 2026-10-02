<!-- insrc:artifact ISSUE-792f9324fc43d95c -->

# Filing one bugfix issue breaks bare story/task targets (`s1`, `s1/t3`) in a single-epic repo

## Reproduction

A repo whose artifacts directory holds exactly one DEF-anchored epic resolves a bare label target. Filing a single, unrelated bugfix ISSUE makes the same call stop resolving.

Steps:
1. In a repo with one epic, confirm a bare label resolves: `resolveWorkflowRef(repo, 's1')` returns the story ref.
2. File any bugfix via the `issue` stage, which writes an `ISSUE-<hash>.json` artifact for a DIFFERENT epic hash.
3. Repeat step 1.

OBSERVED: step 3 returns `null`. Callers surface this as `unresolved-target`, so `insrc_build_step({ target: 's1' })` and `{ target: 's1/t3' }` are refused until the caller supplies an explicit `epicHash`.

EXPECTED: an unrelated bugfix issue does not change whether a story label in the repo's only feature epic is resolvable.

Reproduced directly against the resolver, with the ONLY difference between the two runs being the presence of one extra artifact file:
```
BASELINE  (DEF-1111... + LLD-1111...-s1) : {"workflowId":"E2026100111111111:S001", ...}
WITH one unrelated ISSUE-2222....json    : null
```
The affected population is any repo with exactly one DEF-anchored epic that has ever filed a bugfix. Multi-epic repos are unaffected (they already required a scope), and so are repos with no bugfix issues — which is why the existing tests stay green.

## Root cause

`listEpicHashes` enumerates the artifacts directory and returns one list of epic hashes. It has exactly two callers, both inside the same file, and they ask DIFFERENT questions of that single list: `resolveByHier` uses it to enumerate candidate epics for resolution, while `resolveByLabel` uses only its LENGTH, as an ambiguity test — `if (hashes.length !== 1) return null`, meaning "more than one epic is present, so an unscoped label is ambiguous and must not be guessed".

Commit 13ebd04 widened the enumeration to include bugfix `ISSUE-*` artifacts alongside `DEF-*` ones, so that a DEF-less bugfix epic becomes visible to resolution. That is correct for the enumerate-for-resolution consumer. For the count-for-ambiguity consumer it silently changes the meaning of the number: a repo with one feature epic plus one filed bugfix now counts 2 and refuses.

The mistake is a conflation, not a typo: one return value serves two semantics, and the change was reasoned about only from the consumer it was written for. 13ebd04's own commit message records the error — it claims "membership and ordering are unchanged for every DEF-bearing epic", which is true of each epic's identity and false of the list's LENGTH, which is the only property the ambiguity gate reads.

This is also why no test failed. The scenario IS exercised, by a test that asserts the regressed behaviour as the requirement: it builds one ISSUE-anchored epic plus one DEF-anchored epic, asserts `null`, and comments "two epics present ... must NOT guess". The test named for regression protection uses a fixture with no ISSUE file at all, so the widened pass never fires in it; and the test that does combine a DEF and an ISSUE puts them on the SAME hash, where the enumeration dedupes and the count stays 1.

## Fix intent

Make an unrelated bugfix issue stop affecting the resolvability of a story label in a repo's only feature epic, and record WHICH semantics is intended rather than leaving it implicit in a shared helper.

The correction is blocked on one specification question that must be answered before any code changes: is a bugfix ISSUE an epic PEER for the purpose of deciding that an unscoped label is ambiguous?

- If YES, the current refusal is correct behaviour and the remedy belongs with the callers — the resolution path should supply the epic scope itself rather than refusing a target a user can legitimately name.
- If NO, each consumer of the enumeration should ask for what it actually needs, so that widening what counts as a resolvable epic does not also widen what counts as ambiguous.

Whichever branch is chosen, the existing test that encodes today's behaviour as desired must be revisited and rewritten to state the decided contract, not left standing — otherwise the next reader re-derives the same conclusion from a green suite. The fix must also close the coverage hole that let this ship: no test places a DEF-bearing epic alongside an ISSUE artifact on a DIFFERENT hash, which is the only arrangement that can expose the defect.

NOTE from the s2 audit (q3, graded `partial`): the second clause of the NO branch and the coverage requirement above sit close to the intent/design boundary. They are recorded as constraints on the outcome, NOT as settled design — the design stage should decide whether to keep or restate them rather than inherit them as given.

Out of scope: changing how DEF-less bugfix epics resolve. That capability is the point of 13ebd04 and must survive.

## Citations

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts:143` — "listEpicHashes(dir: string): readonly string[]"
- **[[c2]]** `code` `src/workflow/tracker/resolve.ts:329` — "resolveByLabel(dir: string, storyId: string, taskId?: string, epicHash?: string): ResolvedRef | null"
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts:311` — "resolveByHier(dir: string, wfid: WorkflowId): ResolvedRef | null"
- **[[c4]]** `code` `src/workflow/tracker/resolve.ts:367` — "resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null"
- **[[c5]]** `code` `src/workflow/__tests__/id-resolve.test.ts:459` — "two epics present (one ISSUE-anchored, one DEF-anchored) → an unscoped label is ambiguous and must NOT guess"
- **[[c6]]** `code` `src/workflow/tracker/__tests__/tracker.test.ts:283` — "resolveWorkflowRef: unscoped label still null in a multi-epic dir; single-epic still resolves unscoped"
- **[[c7]]** `code` `src/mcp/build-step/render.ts:54` — "const ref = resolveWorkflowRef(repoPath, target, { epicHash });"
- **[[c8]]** `prior-artifact` `commit 13ebd04 — fix(workflow): resolve bugfix-chain task refs from the ISSUE anchor when no DEF exists` — "listEpicHashes: a second pass over ISSUE files, deduped, DEF hashes first — so membership and ordering are unchanged for every DEF-bearing epic."
- **[[c9]]** `analyze-bundle` `insrc_analyze_step: callers of listEpicHashes / resolveByLabel / resolveWorkflowRef in src/workflow/tracker/resolve.ts` — "listEpicHashes has exactly TWO callers, both internal to the same file — resolveByHier (:311-325) and resolveByLabel (:329-342). Its enumeration therefore serves two distinct questions from one return"
