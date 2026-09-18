<!-- insrc:artifact PLAN-1703991c69967193-s5 -->

# Plan: E202609181703991c:S005

**Epic:** `add-bugfix-triage-category-insrc-framework`
**LLD run:** `wf-1789743927605-ixbwc3`
**LLD effective hash:** `e08e0c0d9f7b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the s5 GitHub-integration module types | S | — | unit: types: a TrackerIssueResult/TrackerCloseResult sample object type-checks against the exact status unions (compile-time; covered transitively by t3/t4/t5 result assertions) | [[c4]] |
| 2 | **`t2`** Add the thin ghCloseIssue gh-verb wrapper | S | — | unit: ghCloseIssue: via _setTrackerExecForTests a fake _exec records argv === ['issue','close', '<N>', '--repo', 'owner/repo'] (number parsed from owner/repo#N); unit: ghCloseIssue: uses `gh` (not a shell) — the fake exec asserts the command is 'gh' and args are an argv array | [[c4]] |
| 3 | **`t3`** Implement createBugfixTrackerIssue (config-gated create + link + record) | M | `t1`, `t2` | unit: createBugfixTrackerIssue: configured + parent resolves -> createIssue called with body===renderIssueMarkdown(issue) and title===issue.body.title (k4); linkSubIssue called with the parent ref + created REST id; ref recorded; { status:'created', linked:true }; unit: createBugfixTrackerIssue: configured + standalone (parentRef null) -> created UNLINKED (linkSubIssue NOT called), { status:'created', linked:false }; unit: createBugfixTrackerIssue: configured + parentRef present but resolveParentIssueRef null -> created unlinked (no link attempt); unit: createBugfixTrackerIssue: resolveConfig type:'none' -> { status:'skipped' }, NO createIssue call (ac2); unit: createBugfixTrackerIssue: resolveConfig throws GithubConfigError -> { status:'skipped' }, NO createIssue call (ac2); unit: createBugfixTrackerIssue: authOk() false -> { status:'skipped' }, NO createIssue call; unit: createBugfixTrackerIssue: meta.tracker already carries the ref -> { status:'reused' }, NO createIssue call (idempotent); unit: createBugfixTrackerIssue: linkSubIssue throws (sub-issues disabled) -> issue still created + recorded, { status:'created', linked:false } | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Implement closeBugfixTrackerIssue (close on completion) | S | `t1`, `t2` | unit: closeBugfixTrackerIssue: recorded ref present + configured -> closeIssue(owner, repo, ref) called, { status:'closed', ref }; unit: closeBugfixTrackerIssue: no recorded ref -> { status:'skipped' }, closeIssue NOT called (ac2 symmetry); unit: closeBugfixTrackerIssue: resolveConfig 'none'/GithubConfigError -> { status:'skipped' }, closeIssue NOT called; unit: closeBugfixTrackerIssue: closeIssue throws (deleted issue) -> propagates | [[c4]] |
| 5 | **`t5`** Add the prompt-on-lost-ref path (resolved open-question) | M | `t3`, `t4` | unit: prompt-on-lost-ref (create): recordRef throws post-create -> promptOnLostRef invoked with the created ref; 'retry-record' re-writes it; 'skip' -> { status:'created', reason:'ref-unrecorded' } without throwing; unit: prompt-on-lost-ref (close): configured + no recorded ref -> promptOnLostRef invoked; 'relink-by-label' uses ghFindIssueByLabels to re-discover + re-record + close; 'skip' -> { status:'skipped' }; unit: prompt-on-lost-ref default: no promptOnLostRef injected -> returns 'skip'; assert ghFindIssueByLabels NOT called on any normal create path (a1 no-per-create-round-trip invariant) | [[c4]] [[c5]] |
| 6 | **`t6`** Wire create into issue-approval and close into completion | M | `t3`, `t4`, `t5` | integration: End-to-end: configured repo + parent pushed -> the fake gh sees `issue create` then the sub_issues link POST then (on completion) `issue close`; meta.tracker carries the ref between create and close; integration: End-to-end: unconfigured repo -> the fake gh sees NO create/close commands; the local IssueArtifact is unchanged (ac2) | [[c6]] |
| 7 | **`t7`** Unit + integration tests for the tracker create/close + prompt path | M | `t3`, `t4`, `t5` | integration: End-to-end: configured repo + parent pushed -> the fake gh sees `issue create` then the sub_issues link POST then (on completion) `issue close`; meta.tracker carries the ref between create and close; integration: End-to-end: unconfigured repo -> the fake gh sees NO create/close commands; the local IssueArtifact is unchanged (ac2); unit: Aggregate: the create/close/ghCloseIssue/prompt-on-lost-ref subjects run green as one bugfix-tracker.test.ts suite via npx tsx --test | [[c1]] [[c2]] [[c3]] [[c5]] |

### E202609181703991c:S005:T001 — Add the s5 GitHub-integration module types

Create the s5 module (src/workflow/bugfix/tracker.ts) and declare the internal helper types: TrackerCreateDeps, TrackerCloseDeps, TrackerIssueResult { status:'created'|'reused'|'skipped'; ref?; linked?; reason? }, TrackerCloseResult { status:'closed'|'skipped'; ref?; reason? }, and a LostRefAction union for the resolved prompt path ('retry-record'|'record-manual'|'relink-by-label'|'skip'). Import/consume CreatedIssue + ResolvedGithubConfig + IssueArtifact + WorkItemRef (existing). No new shared type.

**Acceptance checks:**
- All helper types compile under strict mode; TrackerIssueResult/TrackerCloseResult status unions are exact; no sc-level shared type is added.
- CreatedIssue/ResolvedGithubConfig are consumed (imported), not redefined; tsc clean.

### E202609181703991c:S005:T002 — Add the thin ghCloseIssue gh-verb wrapper

Add ghCloseIssue(owner: string, repo: string, ref: string): void to src/workflow/tracker/github.ts, mirroring ghEditIssueBody/ghComment: parseIssueRef(ref).number then silent('gh', ['issue','close', <N>, '--repo', `${owner}/${repo}`]) through the injectable _exec (k5: gh CLI argv, no shell, no REST). Additive sibling in the gh-wrapper family; touches no existing wrapper.

**Acceptance checks:**
- ghCloseIssue shells `gh issue close <N> --repo owner/repo` via the injectable _exec; number parsed via parseIssueRef.
- No existing wrapper's signature/behavior changes; tsc + existing tracker test subset green.

### E202609181703991c:S005:T003 — Implement createBugfixTrackerIssue (config-gated create + link + record)

Implement createBugfixTrackerIssue(input, deps): resolveConfig (skip {status:'skipped'} on type:'none'/GithubConfigError, ac2) + authOk (skip if not ok); if meta.tracker already carries the ref -> {status:'reused'} (idempotent); else render body = renderIssueMarkdown(issue) VERBATIM (k4), title = issue.body.title, createIssue = ghCreateIssueTyped (get {ref,id}); resolveParentIssueRef(meta.parentRef) -> parent owner/repo#N (via resolveWorkflowRef/issueForWorkflowId); ghLinkSubIssue best-effort (skip when parentRef null/standalone or ref null; a link throw -> {created, linked:false}); recordRef the created ref on meta.tracker (patchTrackerMeta). Provide default deps wiring the real consumed functions.

**Acceptance checks:**
- Configured+parent-pushed -> createIssue(body===renderIssueMarkdown, title===issue.body.title); linkSubIssue(parent, createdId); ref recorded; {status:'created', linked:true}.
- type:'none'/GithubConfigError/authOk-false -> {status:'skipped'}, no createIssue call (ac2). Already-recorded ref -> {status:'reused'}.
- Standalone (parentRef null)/unpushed parent/link-throw -> {status:'created', linked:false}, no error. tsc clean.

### E202609181703991c:S005:T004 — Implement closeBugfixTrackerIssue (close on completion)

Implement closeBugfixTrackerIssue(input, deps): resolveConfig/authOk gate; readRecordedRef from meta.tracker; if no ref -> {status:'skipped'} (nothing created); else closeIssue = ghCloseIssue(owner, repo, ref) -> {status:'closed', ref}. A gh close failure against a real ref propagates (an already-closed issue is a no-op). Provide default deps wiring the real consumed functions + ghCloseIssue.

**Acceptance checks:**
- Recorded ref + configured -> closeIssue called, {status:'closed', ref}.
- No recorded ref, or type:'none'/GithubConfigError -> {status:'skipped'}, closeIssue NOT called (ac2 symmetry).
- closeIssue throws (deleted issue) -> propagates. tsc clean.

### E202609181703991c:S005:T005 — Add the prompt-on-lost-ref path (resolved open-question)

Per the resolved open-question: when a recorded GH issue ref is lost/unexpectedly missing where one should exist, PROMPT THE USER with next-step options rather than silently degrading. Add an injectable promptOnLostRef dep (returns a LostRefAction) to TrackerCreateDeps/TrackerCloseDeps and branch on it: (create) if recordRef throws AFTER a successful create -> promptOnLostRef with the created ref in hand (retry-record / record-manual / skip); (close) if a configured repo has no recorded ref but a create likely happened -> promptOnLostRef (relink-by-label / record-manual / skip). SCOPING (per s3 critique): ghFindIssueByLabels is invoked ONLY inside the user-chosen 'relink-by-label' branch of the interactive prompt — NEVER on the normal create path — so a1's no-per-create-round-trip invariant holds and only the a2 lost-ref RECOVERY is added, not the deferred always-on a2 dedup. Default promptOnLostRef is a no-op returning 'skip' (preserves the pure-defer behavior when no prompter is injected, e.g. non-interactive). Still gh CLI only; no new external path.

**Acceptance checks:**
- create: recordRef throws post-create -> promptOnLostRef invoked with the created ref; 'retry-record' re-writes it, 'skip' returns {status:'created', reason:'ref-unrecorded'} without throwing.
- close: configured + no recorded ref (but likely created) -> promptOnLostRef invoked; 'relink-by-label' uses ghFindIssueByLabels (ONLY here, not on create) to re-discover + re-record + close, 'skip' -> {status:'skipped'}.
- Default (no promptOnLostRef injected) -> returns 'skip' (byte-compatible with the LLD's defer behavior); no ghFindIssueByLabels call on any normal create path. tsc clean.

### E202609181703991c:S005:T006 — Wire create into issue-approval and close into completion

Wire createBugfixTrackerIssue into the bugfix flow after the IssueArtifact is approved (the s4 advance / issue-approval point), and closeBugfixTrackerIssue into the completion path (after the build/completion gate). Additive + bugfixCategory-flag-gated + meta.workflow==='issue' scoped; the non-bugfix tracker/sync path is untouched. Completion continues to use the existing gates unchanged.

**Acceptance checks:**
- After a bugfix issue is approved under the flag: createBugfixTrackerIssue runs (create/link/record or skip); at completion closeBugfixTrackerIssue runs.
- createBugfixTrackerIssue is invoked ONLY after the IssueArtifact's approval is stamped (post insrc_workflow_approve / the s4 advance point), never on an unapproved issue; closeBugfixTrackerIssue only after the completion gate (LLD precondition).
- A non-bugfix approval/completion path is byte-unchanged; the read-only syncTracker epic path is untouched. tsc clean.

### E202609181703991c:S005:T007 — Unit + integration tests for the tracker create/close + prompt path

Unit-test createBugfixTrackerIssue (create+link+k4 body, standalone unlinked, unpushed-parent unlinked, none/GithubConfigError/authOk skip, reused idempotent, link-throw best-effort), closeBugfixTrackerIssue (close/skip/deleted-propagates), ghCloseIssue argv (via _setTrackerExecForTests), and the prompt-on-lost-ref branches (recordRef-throw -> promptOnLostRef; close no-ref -> relink-by-label). Add an integration test over the fake-gh harness: create->record->close round-trip (configured); unconfigured no-op. These exercise the pure injectable-deps functions (t3/t4/t5) directly, so this task depends on [t3,t4,t5] not the t6 wiring (per s3 critique). Reuse the fabricated approved IssueArtifact + fake deps + stubGithubConfig pattern. node:test via tsx; no live services.

**Acceptance checks:**
- Every create/close/ghCloseIssue subject from the LLD test strategy has a passing test (ac1/ac2/ac3).
- The prompt-on-lost-ref branches have passing tests (create recordRef-throw -> prompt; close no-ref -> relink-by-label / skip); the default no-prompter path asserts no ghFindIssueByLabels call.
- The relevant workflow/tracker subsets are green locally via npx tsx --test.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| createBugfixTrackerIssue: configured + parent resolves -> createIssue called with body===renderIssueMarkdown(issue) and title===issue.body.title (k4); linkSubIssue called with the parent ref + created REST id; ref recorded; { status:'created', linked:true } | `t3`, `t7` |
| createBugfixTrackerIssue: configured + standalone (parentRef null) -> created UNLINKED (linkSubIssue NOT called), { status:'created', linked:false } | `t3`, `t7` |
| createBugfixTrackerIssue: configured + parentRef present but resolveParentIssueRef null -> created unlinked (no link attempt) | `t3`, `t7` |
| createBugfixTrackerIssue: resolveConfig type:'none' -> { status:'skipped' }, NO createIssue call (ac2) | `t3`, `t7` |
| createBugfixTrackerIssue: resolveConfig throws GithubConfigError -> { status:'skipped' }, NO createIssue call (ac2) | `t3`, `t7` |
| createBugfixTrackerIssue: authOk() false -> { status:'skipped' }, NO createIssue call | `t3`, `t7` |
| createBugfixTrackerIssue: meta.tracker already carries the ref -> { status:'reused' }, NO createIssue call (idempotent) | `t3`, `t7` |
| createBugfixTrackerIssue: linkSubIssue throws (sub-issues disabled) -> issue still created + recorded, { status:'created', linked:false } | `t3`, `t7` |
| closeBugfixTrackerIssue: recorded ref present + configured -> closeIssue(owner, repo, ref) called, { status:'closed', ref } | `t4`, `t7` |
| closeBugfixTrackerIssue: no recorded ref -> { status:'skipped' }, closeIssue NOT called (ac2 symmetry) | `t4`, `t7` |
| closeBugfixTrackerIssue: resolveConfig 'none'/GithubConfigError -> { status:'skipped' }, closeIssue NOT called | `t4`, `t7` |
| closeBugfixTrackerIssue: closeIssue throws (deleted issue) -> propagates | `t4`, `t7` |
| ghCloseIssue: via _setTrackerExecForTests a fake _exec records argv === ['issue','close', '<N>', '--repo', 'owner/repo'] (number parsed from owner/repo#N) | `t2`, `t7` |
| ghCloseIssue: uses `gh` (not a shell) — the fake exec asserts the command is 'gh' and args are an argv array | `t2`, `t7` |
| End-to-end: configured repo + parent pushed -> the fake gh sees `issue create` then the sub_issues link POST then (on completion) `issue close`; meta.tracker carries the ref between create and close | `t6`, `t7` |
| End-to-end: unconfigured repo -> the fake gh sees NO create/close commands; the local IssueArtifact is unchanged (ac2) | `t6`, `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 invariantsToPreserve[0] / contractDetails.api createBugfixTrackerIssue` — "The GitHub issue body is renderIssueMarkdown(issue) VERBATIM — the SAME content as the internal chain record — so the issue doc stays the single source of truth for both, with no divergent second copy"
- **[[c2]]** `prior-artifact` `LLD s5 invariantsToPreserve[2] / edgeCases 'no tracker configured'` — "No tracker configured => NO external attempt: resolveGithubConfig type:'none' or a GithubConfigError yields a skipped result and the local record stands with no error (ac2), mirroring the established "
- **[[c3]]** `prior-artifact` `LLD s5 interactionWithShared sc3 / contractDetails.api createBugfixTrackerIssue link path` — "s5 consumes the sc3 decision via meta.parentRef (a WorkItemRef): maps it to the parent's GH issue ref through resolveWorkflowRef/issueForWorkflowId and links via ghLinkSubIssue. parentRef null (standa"
- **[[c4]]** `prior-artifact` `LLD s5 invariantsToPreserve[1] / contractDetails.api ghCloseIssue` — "All GitHub access stays on the existing `gh` CLI through the injectable execFileSync `_exec` — NO direct cloud REST (k5) — and s5 reuses the existing create/link/config/resolve surface, adding ONLY th"
- **[[c5]]** `prior-artifact` `LLD s5 openQuestions / resolved open-question q12a87841 (commit eacbb1a)` — "Resolved: when a recorded ref is lost/missing, PROMPT THE USER with next-step options (retry-record / record-manual / relink-by-label via ghFindIssueByLabels / skip) rather than silently deferring; gh"
- **[[c6]]** `prior-artifact` `LLD s5 migration migrationSteps[4] / boundary.internal (bugfixCategory-gated wiring)` — "Wire the tracker create into the bugfix flow after the issue is approved, and the tracker close into the completion path. Additive + bugfixCategory-gated; the non-bugfix tracker/sync path is untouched"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-18T15:36:29.415Z

_No load-bearing premises were extracted._
