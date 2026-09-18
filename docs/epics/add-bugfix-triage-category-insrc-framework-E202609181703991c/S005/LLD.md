<!-- insrc:artifact LLD-1703991c69967193-s5 -->

# LLD: E202609181703991c:S005

**Epic:** `add-bugfix-triage-category-insrc-framework`
**HLD base run:** `wf-1789726188697-irhvw2`
**HLD effective hash:** `e08e0c0d9f7b...`

## HLD context

**Framework:** Bugfix becomes a first-class, scope-gated category that reuses the existing stage/artifact/approve/tracker machinery end-to-end. Triage gains a new `bugfix` SizeClass carrying a magnitude (a small fix vs an M/L fix) and a route that is NOT a single fixed startStage but branches on that magnitude. The flow's first stage is a new first-class `issue` workflow whose synthesized IssueArtifact — reproduction + root cause + fix intent — is the single source of truth serving both the internal chain record and, later, the GitHub issue body. A tiered parent-locator (deterministic ref-resolver → graph code-ownership → semantic match → user prompt → standalone) attaches the fix to the epic/story whose behaviour it corrects, recording which tier decided and at what confidence, with auto-attach only above a high threshold. A scope-gated orchestrator then routes a small fix issue→build and an M/L fix issue→design→plan→build, with the existing post-build code-review gating completion; where a tracker is configured a GitHub issue is created from the same issue content, linked to the located parent, and closed on completion. All five constraints k1–k6 are satisfied by conforming to the framework's own conventions rather than inventing a parallel mechanism.
**Rollout phase:** Phase C — scope-gated orchestration + GitHub surface
**Consumes:** `sc2` (IssueArtifact), `sc3` (ParentLocation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The classifier heuristics/prompt that recognise a user-declared defect fix as `bugfix` and size it into small vs sized magnitude stay private to s1. — owns `sc1`
- `s2`: The `issue` stage's multi-turn step machinery — its decomposer plan, per-step runners, synthesizer, prompt templates, and the storage/path-scheme/gates wiring plus the review/approve gate for the IssueArtifact — is private to s2. — owns `sc2`
- `s3`: The tiered resolver internals stay private to s3: the deterministic ref-resolver reuse, the graph code-ownership scoring, the semantic embedding match, the per-tier thresholds, and the user-prompt/standalone fallback. — owns `sc3`
- `s4`: The scope-gated orchestration is private to s4: how it sequences the bugfix stages, how gates enforce an approved+fresh IssueArtifact and a resolved ParentLocation before proceeding, and how post-build code-review is wired as the completion gate.

## Contract details

**Surface level:** internal

### `createBugfixTrackerIssue`

```typescript
declare function createBugfixTrackerIssue(input: { repoPath: string; issueHash: string }, deps: TrackerCreateDeps): Promise<TrackerIssueResult>
```

**Parameters:**
- `input: { repoPath: string; issueHash: string }` — Identifies the approved bugfix IssueArtifact (ISSUE-<hash>.json) to surface as a GitHub issue.
- `deps: TrackerCreateDeps` — Injected collaborators so the create/link policy is testable against a fake gh: { resolveConfig: (repoPath) => ResolvedGithubConfig; authOk: () => { ok: boolean; reason?: string }; readIssue: (repoPath, issueHash) => IssueArtifact | null; renderBody: (issue) => string; createIssue: (owner, repo, title, body, labels, issueType?) => CreatedIssue; resolveParentIssueRef: (repoPath, parentRef: WorkItemRef) => string | null; linkSubIssue: (owner, repo, parentRef: string, childId: number) => void; recordRef: (repoPath, issueHash, ref: string) => void; labels: readonly string[] }. resolveConfig = resolveGithubConfig; createIssue = ghCreateIssueTyped; resolveParentIssueRef wraps resolveWorkflowRef/issueForWorkflowId; linkSubIssue = ghLinkSubIssue; recordRef wraps patchTrackerMeta; renderBody = renderIssueMarkdown.

**Returns:** `Promise<TrackerIssueResult>` — { status: 'created' | 'reused' | 'skipped'; ref?: string; linked?: boolean; reason?: string }. 'skipped' when no tracker/auth (ac2); 'reused' when meta.tracker already carries the ref (idempotent); 'created' with the owner/repo#N ref (linked=true when a parent GH issue was found + linked, false when standalone/unlinked).

**Errors:**
- `never-throws-on-absent-tracker` when resolveConfig type==='none' or a GithubConfigError is NOT an error — returns { status:'skipped' } (ac2). A gh CLI failure DURING create (after the config check) propagates.

**Preconditions:**
- The IssueArtifact is approved.
- deps.createIssue is ghCreateIssueTyped (returns the REST id) so a parent link is possible; deps route through the injectable gh _exec (k5).

**Postconditions:**
- When configured+authed: a GH issue exists whose body is renderIssueMarkdown(issue) VERBATIM (k4), and its owner/repo#N ref is recorded on meta.tracker.
- Linked as a sub-issue when meta.parentRef resolves to a pushed parent GH issue; standalone/unpushed leaves it unlinked — never an error.
- Idempotent: a second call when meta.tracker already holds the ref is a 'reused' no-op.

### `closeBugfixTrackerIssue`

```typescript
declare function closeBugfixTrackerIssue(input: { repoPath: string; issueHash: string }, deps: TrackerCloseDeps): TrackerCloseResult
```

**Parameters:**
- `input: { repoPath: string; issueHash: string }` — Identifies the bugfix issue whose recorded GH issue should be closed on completion.
- `deps: TrackerCloseDeps` — Injected: { resolveConfig; authOk; readRecordedRef: (repoPath, issueHash) => string | null; closeIssue: (owner, repo, ref) => void }. closeIssue = the NEW thin ghCloseIssue; readRecordedRef reads the meta.tracker ref.

**Returns:** `TrackerCloseResult` — { status: 'closed' | 'skipped'; ref?: string; reason?: string }. 'skipped' when no tracker/auth OR no recorded ref; 'closed' with the ref otherwise.

**Errors:**
- `never-throws-on-no-ref` when No recorded ref is NOT an error — returns { status:'skipped' }. A gh close failure against a real ref propagates.

**Preconditions:**
- Called at completion of a tracked bugfix.

**Postconditions:**
- When a ref was recorded + configured: the GH issue is closed via ghCloseIssue (k5-safe).
- No-op (skipped) for a repo that never created an external issue (ac2 symmetry).

### `ghCloseIssue`

```typescript
declare function ghCloseIssue(owner: string, repo: string, ref: string): void
```

**Parameters:**
- `owner: string` — GitHub repo owner (from resolveGithubConfig).
- `repo: string` — GitHub repo name.
- `ref: string` — The issue's owner/repo#N ref; parseIssueRef extracts the number (reusing refs.ts, as ghEditIssueBody/ghComment do).

**Returns:** `void` — Closes the issue. The ONE new symbol s5 adds — a thin sibling to ghCreateIssue/ghEditIssueBody/ghComment in github.ts, forced because no close wrapper exists and sync.ts is read-only.

**Errors:**
- `gh-close-failed` when The `gh issue close` subprocess exits non-zero (propagated by the shared exec helper, as other silent() gh calls do).

**Preconditions:**
- Runs through the SAME injectable execFileSync `_exec` as every other tracker gh call (k5: gh CLI argv, NO shell, NO direct REST). Mirrors ghEditIssueBody (github.ts:186).

**Postconditions:**
- Shells `gh issue close <parseIssueRef(ref).number> --repo owner/repo` via silent('gh', ...). Additive to the gh-wrapper family; changes no existing wrapper.

## Data model changes

### `IssueArtifact.meta.tracker (the created-issue ref record)` — field-add

The created GH issue's owner/repo#N ref is recorded on the bugfix IssueArtifact's meta.tracker via the EXISTING patchTrackerMeta/readTrackerMeta (refs.ts) — the same meta.tracker block that carries epicRef/storyRefs/taskRefs. For a bugfix issue it holds this issue's own created ref (an `issueRef` field) so closeBugfixTrackerIssue can find it. Additive; no other artifact's tracker meta changes; renderIssueMarkdown never reads meta.tracker (k4 body unaffected).

```
// reuse the existing meta.tracker block (refs.ts TrackerBlock):
// meta.tracker = { ...existing, issueRef?: 'owner/repo#N' }
```

**Call sites:**
- `src/workflow/tracker/refs.ts (patchTrackerMeta/readTrackerMeta)`
- `src/workflow/tracker/sync.ts (reads meta.tracker — same block)`

### `TrackerCreateDeps / TrackerCloseDeps / TrackerIssueResult / TrackerCloseResult` — new

Internal (non-shared) helper types for s5's module: the two injectable-deps bundles + the two result records. Not sc-level shared types. CreatedIssue and ResolvedGithubConfig are CONSUMED existing types (github.ts / config/github.ts), not redefined.

```
+interface TrackerIssueResult { readonly status: 'created' | 'reused' | 'skipped'; readonly ref?: string; readonly linked?: boolean; readonly reason?: string; }
+interface TrackerCloseResult { readonly status: 'closed' | 'skipped'; readonly ref?: string; readonly reason?: string; }
```

**Call sites:**
- `src/workflow/tracker/github.ts (ghCreateIssueTyped/ghLinkSubIssue + the new ghCloseIssue)`
- `src/workflow/config/github.ts (resolveGithubConfig)`
- `src/workflow/tracker/resolve.ts (resolveWorkflowRef/issueForWorkflowId)`
- `src/workflow/artifacts/issue.ts (renderIssueMarkdown — k4 body)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | s5 consumes the approved IssueArtifact: the GH issue TITLE is issue.body.title and the BODY is renderIssueMarkdown(issue) VERBATIM — the same content as the internal chain record (k4, no divergent copy). s5 does NOT touch s2's issue-stage machinery; it reads the finished artifact + records the created ref on meta.tracker (a meta side-write). |
| `sc3` | consumes | s5 consumes the sc3 decision via meta.parentRef (a WorkItemRef): maps it to the parent's GH issue ref through resolveWorkflowRef/issueForWorkflowId and links via ghLinkSubIssue. parentRef null (standalone) or an unpushed parent => no link, no error. s5 never re-derives the locator tiers. |

## Error paths

### Error cases

- **The `gh` CLI is present but not authenticated (or lacks scope) when the tracker step runs on a configured repo.** (recoverable)
  - Detection: deps.authOk() returns { ok: false, reason } (the consumed ghAuthOk) BEFORE any create is attempted.
  - Response: Return { status: 'skipped', reason } — do NOT throw and do NOT create. The local IssueArtifact stands (ac2 symmetry).
  - User impact: No GitHub issue is created; the operator runs `gh auth login` and re-runs (idempotent).
- **ghCreateIssueTyped fails mid-create (GitHub rate limit / network / bad token) AFTER the config + auth checks passed.** (recoverable)
  - Detection: deps.createIssue throws — the shared execFileSync helper surfaces the non-zero `gh` exit.
  - Response: Let it propagate; nothing is recorded on meta.tracker (create failed before recordRef), so there is no half-state. The local record is intact; a re-run retries cleanly.
  - User impact: No GH issue this run; a real external failure is surfaced. No orphan, no duplicate.
- **The issue is created but LINKING to the parent fails (sub-issues disabled, or the parent inaccessible).** (recoverable)
  - Detection: deps.linkSubIssue throws (github.ts documents the caller wraps this because sub-issues may be disabled).
  - Response: The create side effect ALREADY happened — catch the link error best-effort, record the created ref anyway, return { status:'created', linked:false }. The create is NOT failed by a link failure.
  - User impact: The GH issue exists (recorded/closable) but unlinked — graceful degradation, not a lost issue.
- **recordRef (patchTrackerMeta) fails to persist the created ref AFTER the GH issue was created.** (terminal)
  - Detection: deps.recordRef throws while writing meta.tracker.
  - Response: Propagate. Residual: the GH issue exists but its ref is unrecorded, so close can't find it and a naive re-create could DUPLICATE — the accepted a1 idempotency limitation, flagged as an openQuestion (label-dedup via ghFindIssueByLabels is the deferred recovery).
  - User impact: Rare: an unclosed/duplicable GH issue if the meta write fails exactly after create.
- **ghCloseIssue is called for a recorded ref whose GH issue was manually deleted or already closed.** (recoverable)
  - Detection: deps.closeIssue throws / `gh issue close` exits non-zero for a missing issue (an already-closed issue closes idempotently).
  - Response: Propagate a genuine close failure (deleted issue); an already-closed issue is a no-op success.
  - User impact: If deleted externally, the operator sees the failure; the normal already-closed case is silent.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A repo with NO tracker configured (resolveGithubConfig returns type:'none' or throws GithubConfigError). | createBugfixTrackerIssue returns { status:'skipped' }; NO gh command is attempted; the local IssueArtifact stands with no error (ac2). closeBugfixTrackerIssue likewise skips. |
| The bugfix is standalone (meta.parentRef === null) on a configured repo. | The GH issue is created UNLINKED (linked:false), no parent lookup attempted; not an error (ac1's 'or stands alone'). |
| meta.parentRef is a WorkItemRef but the parent has no pushed GH issue (issueForWorkflowId returns null). | Created UNLINKED (resolveParentIssueRef null → skip link); no error. |
| createBugfixTrackerIssue re-run when meta.tracker already carries the created ref. | Idempotent: { status:'reused', ref } — no duplicate. |
| closeBugfixTrackerIssue runs for a bugfix that never created a GH issue. | { status:'skipped' } — no recorded ref means nothing to close (ac2 symmetry). |
| An org without native issue types. | ghCreateIssueTyped fail-opens to an untyped create (existing behavior) — the issue is still created; s5 does not special-case this. |

### Invariants to preserve

- The GitHub issue body is renderIssueMarkdown(issue) VERBATIM — the SAME content as the internal chain record — so the issue doc stays the single source of truth for both, with no divergent second copy (k4). The created ref rides on meta.tracker, which renderIssueMarkdown does not read. Grounded by the s1 test.locate bundle + the sc2 contract. [[c1]]
- All GitHub access stays on the existing `gh` CLI through the injectable execFileSync `_exec` — NO direct cloud REST (k5) — and s5 reuses the existing create/link/config/resolve surface, adding ONLY the thin ghCloseIssue verb forced by the absence of any close wrapper (k6). Grounded by the s1 symbol.locate bundle on github.ts's execFileSync/_exec wrappers + the capability-gap bundle. [[c4]]
- No tracker configured => NO external attempt: resolveGithubConfig type:'none' or a GithubConfigError yields a skipped result and the local record stands with no error (ac2), mirroring the established sync.ts skip pattern (k4/ac2 durability). Grounded by the s1 symbol.locate bundle on resolveGithubConfig + the sync.ts skip. [[c2]]

## Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing tracker test layout — the fake-gh harness (_setTrackerExecForTests, github.ts:30), the stubGithubConfig/trackerOf config stubs, and renderIssueMarkdown from issue-artifact.test.ts. The create/close policy unit tests need no live services; the ghCloseIssue + integration tests drive the argv-recording fake gh.`

### Test levels

- **unit** — Prove createBugfixTrackerIssue's config-gated create + link + record policy against fabricated deps (fake gh/config) — ac1 + ac2 + the k4 body — with no network.
  - Subjects: `createBugfixTrackerIssue: configured + parent resolves -> createIssue called with body===renderIssueMarkdown(issue) and title===issue.body.title (k4); linkSubIssue called with the parent ref + created REST id; ref recorded; { status:'created', linked:true }`, `createBugfixTrackerIssue: configured + standalone (parentRef null) -> created UNLINKED (linkSubIssue NOT called), { status:'created', linked:false }`, `createBugfixTrackerIssue: configured + parentRef present but resolveParentIssueRef null -> created unlinked (no link attempt)`, `createBugfixTrackerIssue: resolveConfig type:'none' -> { status:'skipped' }, NO createIssue call (ac2)`, `createBugfixTrackerIssue: resolveConfig throws GithubConfigError -> { status:'skipped' }, NO createIssue call (ac2)`, `createBugfixTrackerIssue: authOk() false -> { status:'skipped' }, NO createIssue call`, `createBugfixTrackerIssue: meta.tracker already carries the ref -> { status:'reused' }, NO createIssue call (idempotent)`, `createBugfixTrackerIssue: linkSubIssue throws (sub-issues disabled) -> issue still created + recorded, { status:'created', linked:false }`
  - Fixtures: `A fabricated approved IssueArtifact`, `A fake TrackerCreateDeps (stub resolveConfig/authOk/resolveParentIssueRef, spy createIssue/linkSubIssue/recordRef, renderBody = real renderIssueMarkdown)`
- **unit** — Prove closeBugfixTrackerIssue reads the recorded ref and closes (or skips) — ac3.
  - Subjects: `closeBugfixTrackerIssue: recorded ref present + configured -> closeIssue(owner, repo, ref) called, { status:'closed', ref }`, `closeBugfixTrackerIssue: no recorded ref -> { status:'skipped' }, closeIssue NOT called (ac2 symmetry)`, `closeBugfixTrackerIssue: resolveConfig 'none'/GithubConfigError -> { status:'skipped' }, closeIssue NOT called`, `closeBugfixTrackerIssue: closeIssue throws (deleted issue) -> propagates`
  - Fixtures: `A fake TrackerCloseDeps (stub resolveConfig/authOk/readRecordedRef, spy closeIssue)`
- **unit** — Prove the ONE new gh-wrapper ghCloseIssue shells the right argv through the injectable _exec (k5, no REST).
  - Subjects: `ghCloseIssue: via _setTrackerExecForTests a fake _exec records argv === ['issue','close', '<N>', '--repo', 'owner/repo'] (number parsed from owner/repo#N)`, `ghCloseIssue: uses `gh` (not a shell) — the fake exec asserts the command is 'gh' and args are an argv array`
  - Fixtures: `_setTrackerExecForTests fake recording (cmd, args)`
- **integration** — Prove the create->record->close round-trip over the real ghCreateIssueTyped/ghLinkSubIssue/ghCloseIssue against a fake `gh` + a stubbed config — end-to-end without network.
  - Subjects: `End-to-end: configured repo + parent pushed -> the fake gh sees `issue create` then the sub_issues link POST then (on completion) `issue close`; meta.tracker carries the ref between create and close`, `End-to-end: unconfigured repo -> the fake gh sees NO create/close commands; the local IssueArtifact is unchanged (ac2)`
  - Fixtures: `The existing fake-gh harness (_setTrackerExecForTests) + a github config stub + a temp repo with a written ISSUE-<hash>.json`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `createBugfixTrackerIssue: configured + parent resolves -> createIssue called with body===renderIssueMarkdown(issue) and title===issue.body.title (k4); linkSubIssue called with the parent ref + created REST id; ref recorded; { status:'created', linked:true }`, `createBugfixTrackerIssue: configured + standalone (parentRef null) -> created UNLINKED (linkSubIssue NOT called), { status:'created', linked:false }`, `End-to-end: configured repo + parent pushed -> the fake gh sees `issue create` then the sub_issues link POST then (on completion) `issue close`; meta.tracker carries the ref between create and close` |
| `ac2` | `createBugfixTrackerIssue: resolveConfig type:'none' -> { status:'skipped' }, NO createIssue call (ac2)`, `createBugfixTrackerIssue: resolveConfig throws GithubConfigError -> { status:'skipped' }, NO createIssue call (ac2)`, `End-to-end: unconfigured repo -> the fake gh sees NO create/close commands; the local IssueArtifact is unchanged (ac2)` |
| `ac3` | `closeBugfixTrackerIssue: recorded ref present + configured -> closeIssue(owner, repo, ref) called, { status:'closed', ref }`, `closeBugfixTrackerIssue: no recorded ref -> { status:'skipped' }, closeIssue NOT called (ac2 symmetry)`, `ghCloseIssue: via _setTrackerExecForTests a fake _exec records argv === ['issue','close', '<N>', '--repo', 'owner/repo'] (number parsed from owner/repo#N)` |

## Migration

**State before:** The bugfix flow produces an approved IssueArtifact (S002) with a stamped meta.parentRef (S003/S004), but NOTHING surfaces it to GitHub. github.ts already wraps `gh` for CREATE (ghCreateIssue/ghCreateIssueTyped returning {ref,id}, github.ts:132), LINK (ghLinkSubIssue, github.ts:177), edit/comment/read, and dedup (ghFindIssueByLabels) — all via the injectable execFileSync `_exec` (k5, no REST); resolveGithubConfig (config/github.ts:196) is the tracker-configured predicate; resolveWorkflowRef/issueForWorkflowId (resolve.ts:292/328) map a work item to its parent GH issue ref; sync.ts is READ-ONLY. GAP: there is NO close-issue wrapper anywhere.

**State after:** A thin, feature-flagged s5 GitHub-integration module exists: createBugfixTrackerIssue (config-gated create of a GH issue whose body is renderIssueMarkdown verbatim, link to the parentRef's GH issue when pushed, record the created owner/repo#N on meta.tracker; no-op when unconfigured/unauthed; idempotent) and closeBugfixTrackerIssue (read the recorded ref, close on completion). github.ts gains ONE new thin ghCloseIssue verb. Behind the existing `bugfixCategory` flag.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the internal helper types (TrackerCreateDeps, TrackerCloseDeps, TrackerIssueResult, TrackerCloseResult). Purely additive type declarations. — ↩ rollbackable
2. Add the thin `ghCloseIssue(owner, repo, ref)` verb to github.ts, mirroring ghEditIssueBody/ghComment (parseIssueRef + silent('gh', ['issue','close', ...]) through the injectable _exec). Additive sibling; touches no existing wrapper. — ↩ rollbackable
3. Add `createBugfixTrackerIssue(input, deps)` — the config-gated create/link/record policy over injected deps (default deps wire resolveGithubConfig / ghAuthOk / storage issue-read / renderIssueMarkdown / ghCreateIssueTyped / resolveWorkflowRef+issueForWorkflowId / ghLinkSubIssue / patchTrackerMeta). New code path. — ↩ rollbackable _(needs: `bugfixCategory`)_
4. Add `closeBugfixTrackerIssue(input, deps)` — read the recorded meta.tracker ref and close via ghCloseIssue; no-op when unconfigured/no-ref. New code path. — ↩ rollbackable _(needs: `bugfixCategory`)_
5. Wire the tracker create into the bugfix flow after the issue is approved, and the tracker close into the completion path. Additive + bugfixCategory-gated; the non-bugfix tracker/sync path is untouched. — ↩ rollbackable _(needs: `bugfixCategory`)_
6. Add unit tests (fabricated approved IssueArtifact + injected fake deps) + the ghCloseIssue argv test + an integration test over the fake-gh harness. Test-only. — ↩ rollbackable

**Backward compat:** Fully backward compatible: every change is additive and behind the `bugfixCategory` flag. The ONE change to an existing file (github.ts) is a NEW function ghCloseIssue — no existing wrapper's signature or behavior changes, and it uses the same injectable _exec so existing fake-gh tests are unaffected. createBugfixTrackerIssue/closeBugfixTrackerIssue are new functions; the helper types are new and non-shared. meta.tracker gains an OPTIONAL issueRef on a bugfix issue only — the existing tracker-meta block read by sync.ts is untouched, and renderIssueMarkdown never reads meta.tracker so the k4 body is byte-identical. A repo with no tracker and every existing epic/story tracker+sync path behave exactly as before.

## Alternatives considered

### a1: Dedicated bugfix-tracker functions; ref on meta.tracker; record-and-skip idempotency — **CHOSEN**

Two thin injectable-deps functions (createBugfixTrackerIssue + closeBugfixTrackerIssue) plus ONE new ghCloseIssue gh-verb wrapper; idempotency is 'already recorded on meta.tracker → no-op'.

s5 adds a small GitHub-integration module (owns no new shared type). Create resolves the tracker config (skip when none/GithubConfigError, ac2), renders the body from the approved IssueArtifact via renderIssueMarkdown (k4), creates via ghCreateIssueTyped (REST id), maps meta.parentRef→parent GH issue via resolveWorkflowRef/issueForWorkflowId and links with ghLinkSubIssue (skip when null/standalone/unpushed), records the created ref on meta.tracker (patchTrackerMeta). Close reads the recorded ref and closes via the ONE new thin ghCloseIssue. All gh functions injected for tests.

### a2: Same, but label-based idempotency via ghFindIssueByLabels

Identical create/link/close shape, but dedup queries GitHub via the existing ghFindIssueByLabels (a unique bugfix label) before creating.

As a1, but the duplicate-create guard is ghFindIssueByLabels: stamp a unique per-bugfix label and, before creating, query GitHub for an existing labelled issue; reuse it if found. The recorded ref is still written (for close).

**Rejected because:** Functionally equivalent and constraint-clean, but pays a `gh issue list` round-trip on EVERY create for a rare lost-ref recovery benefit, and adds a second dedup source that can disagree with the recorded ref. Both are CORRECT, so the cheaper local-ref path (a1) wins and a2's robustness is folded into a1 as an optional openQuestion. Ranked 2nd.

### a3: Fold create/link/close into the tracker sync path

No separate s5 module — extend the tracker's own sync.ts so the bugfix issue is created/linked/closed inside the existing epic-sync driver.

Add the create/link/close into src/workflow/tracker/sync.ts, reusing syncTracker's config resolution + auth gating and its meta.tracker patching.

**Rejected because:** Partial on ac1/k6/boundary: it overloads the deliberately read-only, epic-scoped syncTracker with write+create logic that fits a standalone bugfix issue poorly, while still needing the same ghCloseIssue addition. Ranked 3rd.

## Open questions

- Lost-recorded-ref recovery (the a2 label-dedup): a1's idempotency + close both key on the meta.tracker ref, so if recordRef fails exactly after create (rare), the GH issue is unclosable/duplicable. A future enhancement could add ghFindIssueByLabels-based dedup (a unique per-bugfix label) as a recovery when the local ref is missing. Deferred — not built in s5; the normal path is correct and cheaper without the per-create GitHub query.

## Resolved questions

- `q12a87841` — Lost-recorded-ref recovery (the a2 label-dedup): a1's idempotency + close both key on the meta.tracker ref, so if recordRef fails exactly after create (rare), the GH issue is unclosable/duplicable. A future enhancement could add ghFindIssueByLabels-based dedup (a unique per-bugfix label) as a recovery when the local ref is missing. Deferred — not built in s5; the normal path is correct and cheaper without the per-create GitHub query.
  - **resolved**: Prompt the user with next-step options when a recorded ref is lost/missing _(2026-09-18T15:27:56.554Z)_

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 interactionWithShared.sc2 + s1 test.locate bundle — renderIssueMarkdown(issue) is the k4 single-source GH body (issue-artifact.test.ts); title = issue.body.title`
- **[[c2]]** `prior-artifact` `LLD s5 ac2 no-op invariant + s1 symbol.locate bundle — resolveGithubConfig(repoPath): ResolvedGithubConfig (config/github.ts:196) 'none'/GithubConfigError => skip, the sync.ts pattern`
- **[[c3]]** `prior-artifact` `LLD s5 sc3 link mapping + s1 symbol.locate bundle — resolveWorkflowRef/issueForWorkflowId (resolve.ts:292/328) map meta.parentRef (WorkItemRef) -> parent owner/repo#N; ghLinkSubIssue (github.ts:177) needs the created REST id from ghCreateIssueTyped`
- **[[c4]]** `prior-artifact` `LLD s5 capability-gap bundle — NO close wrapper exists (sync.ts read-only); s5 adds the ONE thin ghCloseIssue verb on the same execFileSync/_exec gh transport (github.ts), k5/k6`
- **[[c5]]** `prior-artifact` `S002 renderIssueMarkdown + S003/S004 meta.parentRef stamp — the approved IssueArtifact body + located parent s5 consumes; patchTrackerMeta/readTrackerMeta (refs.ts) record/read the created ref on meta.tracker`
- **[[c6]]** `convention` `CLAUDE.md k5/k6 + github.ts header — the gh CLI via execFileSync argv is the ONE tracker shell-out (no direct REST); tests drive a fake _exec via _setTrackerExecForTests`
