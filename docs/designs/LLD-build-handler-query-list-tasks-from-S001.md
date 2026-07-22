<!-- insrc:artifact LLD-7d951871d9566b3c-S001 -->

# LLD: S001

**Epic:** `build-handler-query-list-tasks-from`
**HLD base run:** `wf-1784717650175-ynj5xg`
**HLD effective hash:** `7d951871d956...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `queryTasks`

```typescript
queryTasks(exec: TrackerExec, filters: TaskQueryFilters, page?: PageRequest): Promise<TaskPage>
```

**Parameters:**
- `exec: TrackerExec` — The existing GitHub-execution seam (tracker/github.ts) used to issue authenticated GitHub search/issue calls; reused rather than re-established.
- `filters: TaskQueryFilters` — The four supported filters — owner, state, epic, story — that constrain the returned task set. Any subset may be provided.
- `page: PageRequest | undefined` _(optional)_ — Cursor + size for one page of results; when omitted the first page at the default size is returned.

**Returns:** `Promise<TaskPage>` — A single page of projected tracker tasks plus pageInfo (hasNextPage/endCursor) and total, so callers can detect and continue past truncation instead of silently dropping tasks.

**Errors:**
- `TrackerAuthError` when The GitHub-authenticated identity behind TrackerExec is missing or unauthorized for the tracker repo.
- `TrackerQueryError` when GitHub search/issue API returns an error, is rate-limited, or the epic/story filter resolves to no known epic hash.

**Preconditions:**
- exec is a live TrackerExec bound to an authenticated GitHub session for the tracker repo
- epic/story filter values, when supplied, are resolvable against listEpicHashes (tracker/resolve.ts) / the epic task-list convention

**Postconditions:**
- Returns tasks matching ALL supplied filters (AND semantics), projected via TrackerTask; qualifiers not expressible as GitHub search are applied as a post-filter so the returned set is exact
- TaskPage.pageInfo.hasNextPage is true iff more matching tasks exist beyond this page; no matching task is omitted without hasNextPage being set

### `listMyOpenTasks`

```typescript
listMyOpenTasks(exec: TrackerExec, page?: PageRequest): Promise<TaskPage>
```

**Parameters:**
- `exec: TrackerExec` — The GitHub-execution seam whose authenticated identity also supplies the 'current user' whose assigned open tasks are listed.
- `page: PageRequest | undefined` _(optional)_ — Cursor + size for one page; omitted means first page at default size.

**Returns:** `Promise<TaskPage>` — A single page of the current GitHub-authenticated user's OPEN tasks assigned to them, in the same paginated TaskPage shape as queryTasks.

**Errors:**
- `TrackerAuthError` when No current GitHub-authenticated identity can be resolved (e.g. config/github.ts yields no login), so 'my' tasks are undefined.
- `TrackerQueryError` when GitHub search/issue API returns an error or is rate-limited.

**Preconditions:**
- The current GitHub user login is resolvable from the authenticated session used by exec (candidate source: src/workflow/config/github.ts)

**Postconditions:**
- Returns only tasks that are simultaneously state=open AND assignee=current-user
- Shares queryTasks' pagination contract: no assigned open task is dropped without pageInfo.hasNextPage signalling continuation

## Data model changes

### `TrackerTask` — new

Read-side projection of a GitHub issue into a tracker task record: { number: number; title: string; state: 'open' | 'closed'; author: string; assignees: string[]; labels: string[]; milestone?: string; epic?: string; story?: string; url: string; createdAt: string; updatedAt: string }. Projected from the GitHub issue / CreatedIssue shape in tracker/github.ts; epic/story derived from the epic-hash + epic task-list conventions (listEpicHashes / updateEpicTaskList). This is the returned task DTO — no such filter-bearing task DTO exists today (s1 data-model.trace).

```
+ interface TrackerTask { number; title; state; author; assignees[]; labels[]; milestone?; epic?; story?; url; createdAt; updatedAt }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/github.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/resolve.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/conventions.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/tracker.ts`

### `TaskQueryFilters` — new

The four supported query filters, all optional: { owner?: string; state?: 'open' | 'closed' | 'all'; epic?: string; story?: string }. owner filters by GitHub author/assignee login; epic/story map onto epic-hash identifiers (listEpicHashes, tracker/resolve.ts) and the epic task-list convention (updateEpicTaskList, tracker/conventions.ts). Applied with AND semantics.

```
+ interface TaskQueryFilters { owner?; state?; epic?; story? }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/resolve.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/conventions.ts`

### `PageRequest` — new

Cursor-based page request over GitHub results: { cursor?: string; size?: number }. Mirrors GitHub's opaque-cursor pagination so callers step through pages deterministically. size defaults to a module constant when omitted.

```
+ interface PageRequest { cursor?; size? }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/github.ts`

### `TaskPage` — new

First-class paginated return of both entrypoints: { tasks: TrackerTask[]; pageInfo: { hasNextPage: boolean; endCursor?: string }; total?: number }. Chosen (winning alt a3) specifically to eliminate the silent-truncation failure a flat-array return hides — hasNextPage/endCursor let callers detect and continue past a capped GitHub page instead of dropping tasks.

```
+ interface TaskPage { tasks: TrackerTask[]; pageInfo: { hasNextPage; endCursor? }; total? }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/github.ts`

## Error paths

### Error cases

- **TrackerExec's authenticated GitHub session is missing or lacks access to the tracker repo (queryTasks and listMyOpenTasks).** (terminal)
  - Detection: The GitHub search/issue call issued through TrackerExec returns HTTP 401/403 (or a GraphQL auth error), which the handler classifies as an auth failure rather than a query failure.
  - Response: Throw TrackerAuthError with the tracker repo and the failing operation; do not fall back to an empty page (an empty page would masquerade as 'no tasks').
  - User impact: Caller learns the tracker session is unauthenticated/unauthorized and can re-auth, instead of being shown a misleading empty task list.
- **listMyOpenTasks cannot resolve a 'current user' login for the authenticated GitHub session.** (terminal)
  - Detection: The current-user login lookup (candidate source src/workflow/config/github.ts) returns empty/undefined before any search is issued, so 'my' is undefined.
  - Response: Throw TrackerAuthError signalling no resolvable current identity; never substitute a default/blank login into the assignee filter.
  - User impact: Caller is told their identity could not be resolved rather than receiving someone else's or an empty task set.
- **GitHub search/issue API returns a transport/server error or is rate-limited during a query.** (recoverable)
  - Detection: The TrackerExec response is a non-2xx status (5xx, or 403 carrying rate-limit headers / GraphQL RATE_LIMITED), distinguished from a 401/403 auth failure by the presence of rate-limit metadata / status class.
  - Response: Throw TrackerQueryError carrying the GitHub status/reason; surface partial pages already collected only via a thrown error, never as a silently-truncated success.
  - User impact: Caller can retry/back off knowing the query did not complete, rather than treating a partial result as the full set.
- **An epic or story filter value is supplied that resolves to no known epic hash.** (terminal)
  - Detection: Resolving the epic/story filter against listEpicHashes (tracker/resolve.ts) / the epic task-list convention (updateEpicTaskList, tracker/conventions.ts) yields no matching epic hash before the GitHub search is built.
  - Response: Throw TrackerQueryError identifying the unresolvable epic/story filter; do not silently drop the filter and return the unfiltered set.
  - User impact: Caller learns their epic/story filter was invalid instead of receiving a superset of tasks that ignores the filter.
- **GitHub rejects the pagination cursor supplied in PageRequest.cursor.** (recoverable)
  - Detection: The GitHub API responds with an invalid-cursor error for the opaque cursor passed through in PageRequest.
  - Response: Throw TrackerQueryError indicating the cursor is stale/invalid so the caller restarts from the first page; do not coerce it to the first page silently.
  - User impact: Caller distinguishes a bad/expired cursor from a genuine end-of-results and can restart pagination deterministically.

### Edge cases

| Input | Expected |
| :--- | :--- |
| queryTasks called with an empty TaskQueryFilters ({}) — no owner/state/epic/story. | Returns the first page of ALL tracker tasks (no constraint), paginated via TaskPage; not an error and not an empty set. |
| Filters that legitimately match zero tasks (e.g. valid but unused owner). | Returns TaskPage with tasks: [], pageInfo.hasNextPage=false, total=0 — a valid empty result, distinct from an auth/query error. |
| state='all' (or state omitted) in queryTasks. | state='all' returns both open and closed tasks; omitted state applies no state constraint per the documented default, both projected identically. |
| A matching GitHub issue that carries no epic/story label or milestone. | TrackerTask.epic / .story / .milestone are left undefined; the task is still returned when it satisfies the other supplied filters. |
| A matching issue assigned to multiple users, or with an author distinct from its assignees, queried with an owner filter. | assignees[] captures all logins; the owner filter matches on either author or assignee login (AND-combined with other filters), and the full assignee list is preserved in the projection. |
| PageRequest with size omitted, or a cursor pointing exactly at the last page. | Omitted size uses the module default page size; a cursor at the final page returns the remaining tasks with pageInfo.hasNextPage=false and no endCursor advance. |
| A qualifier that GitHub search cannot express natively (e.g. epic/story derived from convention, not a GitHub field). | The GitHub-searchable qualifiers narrow server-side, then the convention-derived qualifier is applied as a post-filter so the returned page is exact (no over-inclusion). |

### Invariants to preserve

- The handler reuses the existing TrackerExec GitHub-execution seam (tracker/github.ts) for all authenticated calls and never re-establishes GitHub auth or opens a second connectivity path. [[c2]]
- GitHub calls are issued serially through TrackerExec, never Promise.all'd — matching the repo rule against parallelizing provider/remote calls and the tracker module's existing sync/resolve call pattern. [[c2]]
- No matching task is omitted from results without TaskPage.pageInfo.hasNextPage=true signalling continuation — the paginated TaskPage exists specifically to eliminate the silent-truncation a flat-array return hides. [[c3]]
- Supplied filters combine with AND semantics; qualifiers not expressible as GitHub search are applied as an exact post-filter so the returned set neither over- nor under-includes. [[c3]]
- Epic/story filter values are resolved only through the established identity sources — listEpicHashes (tracker/resolve.ts) and the epic task-list convention (updateEpicTaskList, tracker/conventions.ts) — not via an ad-hoc parallel epic lookup. [[c1]]
- This is a read-only surface: queryTasks and listMyOpenTasks issue only GitHub read/search calls and perform no create/write/mutation via TrackerExec's write ops (ghAddProjectItem/ghAttachMilestone/commitAndPushArtifacts). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test, *.test.ts under src/workflow/tracker)`

### Test levels

- **unit** — Verify queryTasks and listMyOpenTasks against a stubbed TrackerExec seam: filter AND-semantics, convention-derived post-filtering (epic/story), TrackerTask projection from GitHub issue shape, pagination (hasNextPage/endCursor/default size), and empty-filter/empty-result handling — all without touching real GitHub.
  - Subjects: `queryTasks(exec, filters, page) in src/workflow/tracker (new query/list module)`, `listMyOpenTasks(exec, page)`, `TrackerTask projection from CreatedIssue/GitHub issue shape`, `TaskQueryFilters AND-combination + owner author-or-assignee matching`, `TaskPage pagination (pageInfo.hasNextPage, endCursor, module default size)`
  - Fixtures: `Fake/stub TrackerExec returning canned GitHub search/issue responses (success, empty, multi-assignee, no-epic/story-label, multi-page)`, `Stubbed listEpicHashes (tracker/resolve.ts) + updateEpicTaskList (tracker/conventions.ts) returning known + unknown epic hashes`, `Stubbed current-user login source (candidate src/workflow/config/github.ts) returning a login, and returning empty/undefined`, `Sample GitHub issue JSON fixtures covering labels/milestone/assignees/state variants`
- **unit** — Verify the error-path contract: each failure maps to the correct typed error (TrackerAuthError vs TrackerQueryError) and never degrades to a silently-truncated or misleading-empty page.
  - Subjects: `queryTasks / listMyOpenTasks error classification (401/403 auth vs 5xx/rate-limit vs invalid-cursor vs unresolvable epic/story)`, `TrackerAuthError raised on missing session and on unresolvable current-user login`, `TrackerQueryError raised on API/rate-limit error, unresolvable epic/story filter, and stale cursor`
  - Fixtures: `TrackerExec stub configured to return 401/403, 5xx, 403+rate-limit-headers/RATE_LIMITED, and invalid-cursor responses`, `listEpicHashes stub returning no match for a supplied epic/story filter`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `queryTasks returns tasks matching ALL supplied filters with AND semantics`, `queryTasks with empty filters {} returns the first page of all tasks`, `owner filter matches on either author or assignee login and preserves full assignees[]`, `state='all'/omitted vs state='open'/'closed' return the documented task sets` |
| `ac2` | `listMyOpenTasks returns only state=open AND assignee=current-user tasks`, `listMyOpenTasks throws TrackerAuthError when current-user login is unresolvable` |
| `ac3` | `TaskPage.pageInfo.hasNextPage=true whenever matching tasks remain beyond the page (no silent truncation)`, `cursor at final page returns remaining tasks with hasNextPage=false and no endCursor advance`, `omitted PageRequest.size uses the module default page size`, `filters matching zero tasks return tasks:[], hasNextPage=false, total=0` |
| `ac4` | `epic/story filter resolved via listEpicHashes / updateEpicTaskList; unresolvable value throws TrackerQueryError`, `convention-derived qualifier applied as exact post-filter so the returned page neither over- nor under-includes`, `GitHub calls issued serially through TrackerExec (no Promise.all), reusing the existing seam without re-establishing auth` |
| `ac5` | `missing/unauthorized TrackerExec session throws TrackerAuthError (never an empty page)`, `GitHub 5xx/rate-limit throws TrackerQueryError (never a silently-truncated success)`, `invalid/stale PageRequest.cursor throws TrackerQueryError rather than coercing to first page`, `TrackerTask leaves epic/story/milestone undefined when the issue lacks them and still returns the task` |

## Migration

**State before:** No query/list read surface exists over the GitHub-backed tracker. Per the s1 capability-discovery bundle, the reuse-check returned zero clear-match candidates: the tracker core module (src/workflow/tracker — github.ts, sync.ts, resolve.ts, refs.ts) owns GitHub connectivity (the TrackerExec seam) and epic/story resolution (listEpicHashes in resolve.ts, updateEpicTaskList in conventions.ts) but exposes NO method taking owner/state/epic/story filters and NO listing of the current user's open assigned tasks. Per the s1 data-model.trace bundle, no filter-bearing task DTO exists — only write-side/type shapes (CreatedIssue in github.ts, TrackerArtifact/TrackerSyncRefs/TrackerRunBody in artifacts/tracker.ts). Per the s1 backFlowNotes, the tracker dir exposes no package-level exports in the graph index and no source of the 'current GitHub user' identity was surfaced (candidate src/workflow/config/github.ts). Callers today cannot read tasks from the tracker by filter or list their own open assigned tasks.

**State after:** Two new internal read entrypoints live in the tracker module and reuse the existing TrackerExec seam: queryTasks(exec, filters, page?) returns a paginated TaskPage of tasks matching all supplied owner/state/epic/story filters (AND semantics), and listMyOpenTasks(exec, page?) returns a paginated TaskPage of the current GitHub-authenticated user's open assigned tasks. Four new read-side types back them — TrackerTask (issue→task projection), TaskQueryFilters (owner/state/epic/story, all optional), PageRequest (cursor+size), and TaskPage (tasks + pageInfo{hasNextPage,endCursor} + total). The current-user login is resolved from the authenticated session (via config/github.ts). Pagination surfaces truncation via pageInfo so no matching task is silently dropped.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Read the actual signatures the LLD could not obtain from the s1 graph pass: the TrackerExec seam and CreatedIssue shape in src/workflow/tracker/github.ts, listEpicHashes in resolve.ts, updateEpicTaskList in conventions.ts, and TrackerArtifact/TrackerSyncRefs/TrackerRunBody in artifacts/tracker.ts, plus locate the current-user login source in src/workflow/config/github.ts. Pure inspection — no code change. Rollbackable: yes (no-op if abandoned). — ↩ rollbackable
2. Add the four new read-side type definitions (TrackerTask, TaskQueryFilters, PageRequest, TaskPage) to the tracker module's type surface. Purely additive new interfaces; nothing references them yet. Rollbackable: yes (delete the added types). — ↩ rollbackable
3. Add the GitHub issue → TrackerTask projection helper that maps issue/CreatedIssue fields (number, title, state, author, assignees, labels, milestone, url, timestamps) plus epic/story derived from listEpicHashes and the epic task-list convention into a TrackerTask. New internal helper, no existing caller affected. Rollbackable: yes (delete the helper). — ↩ rollbackable
4. Add the queryTasks(exec, filters, page?) entrypoint: translate the supplied filters into a GitHub search issued through the existing TrackerExec seam, apply as a post-filter any qualifier not expressible in GitHub search so the returned set is exact (AND semantics), project results via the step-3 helper, and return a TaskPage carrying pageInfo{hasNextPage,endCursor} and total. Surface TrackerAuthError / TrackerQueryError per the contract. New export; reuses TrackerExec rather than re-establishing connectivity. Rollbackable: yes (remove the entrypoint). — ↩ rollbackable
5. Add the listMyOpenTasks(exec, page?) entrypoint: resolve the current GitHub user login from the authenticated session (config/github.ts), then return the same paginated TaskPage constrained to state=open AND assignee=current-user, raising TrackerAuthError when no login can be resolved. New export built on the same projection + pagination path. Rollbackable: yes (remove the entrypoint). — ↩ rollbackable
6. Add tests for the two entrypoints under src/workflow/tracker following the *.test convention, borrowing GitHub-plumbing setup from the module's existing sync/setup/resolve tests: cover each filter, AND-combination, empty results, the my-open-tasks state=open+assignee=current-user constraint, and the pagination/hasNextPage truncation contract. Test-only addition. Rollbackable: yes (delete the test file). — ↩ rollbackable

**Backward compat:** No existing public API is affected — this is a greenfield, internal (surfaceLevel: internal) read surface. Every change is purely additive: two new functions (queryTasks, listMyOpenTasks) and four new types (TrackerTask, TaskQueryFilters, PageRequest, TaskPage), with no modification to any existing tracker signature, the TrackerExec seam, or the write-side ops (ghAddProjectItem, ghAttachMilestone, commitAndPushArtifacts). Existing callers of the tracker module compile and behave identically; the new entrypoints are opt-in. The TaskPage-based return (winning alt a3) is chosen so that the very first shape of this API already exposes truncation via pageInfo, avoiding a future breaking migration away from a flat-array return.

## Alternatives considered

### a3: Filter object → GitHub search qualifiers, paginated envelope — **CHOSEN**

Two entrypoints backed by a TaskQuery that compiles to GitHub issue-search qualifiers and returns a { tasks, pageInfo } envelope preserving richer GitHub fields.

Keep the two named entrypoints of a1 (query + list) but make the contract search-native: a buildTaskSearch(filters) compiler translates TaskQuery { owner, state, epic, story, assignee } into GitHub issue-search qualifier strings, issued through TrackerExec. Returns a QueryResult envelope { tasks: TaskRecord[]; pageInfo: { hasNextPage: boolean; endCursor?: string }; total?: number } rather than a bare array. TaskRecord is a richer projection preserving GitHub-faithful fields (number, title, url, state, assignees[], labels, milestone, createdAt, updatedAt) plus derived epic/story. Epic/story filters map onto epic-hash identifiers (listEpicHashes) applied as label/milestone qualifiers or post-filtered after the search.

### a1: Two-method split, shared flat TaskRecord

Distinct query(filters) and list() entrypoints returning the same flat TaskRecord[], mirroring the tracker's existing per-purpose function style.

Expose two sibling functions in src/workflow/tracker (new query.ts, following snake_case file / camelCase fn convention): queryTasks(filters: TaskQuery): TaskRecord[] and listMyOpenTasks(): TaskRecord[]. TaskQuery is a plain optional-field record { owner?: string; state?: 'open' | 'closed'; epic?: string; story?: string }. Both project GitHub issues into a single shared flat TaskRecord DTO { number, title, url, state, assignee, owner, epic, story } — epic/story derived from listEpicHashes (resolve.ts) + the epic task-list convention (updateEpicTaskList, conventions.ts). Both go through the existing TrackerExec seam in github.ts for connectivity. listMyOpenTasks resolves 'current user' via the GitHub-auth identity helper (candidate src/workflow/config/github.ts) and internally hard-fixes assignee=me + state=open. Returns a plain array, no pagination envelope.

**Rejected because:** a1 has the honest, minimal signatures (query takes filters, list takes nothing) and best matches the tracker module's one-function-per-purpose convention (sync/setup/resolve), and it cleanly preserves the Story's two-behavior framing — the strongest fit on idiomatic-code and intent-boundary grounds. It loses to a3 solely on the accuracy-primary axis: its own stated con is that the bare flat-array return has no pagination contract and silently caps large result sets, which is exactly the correctness gap a3 closes. Ranked second because it is the safest, most conventional S-cost option and would be the winner under a cost-first mandate — but the project mandate is the opposite.

### a2: Single query method, list as a preset

One queryTasks(filters) entrypoint where my-open-tasks is just the preset { assignee: 'me', state: 'open' }, collapsing both behaviors into a single contract.

Expose one function queryTasks(filters: TaskQuery): TaskRecord[] in src/workflow/tracker. TaskQuery gains an assignee field alongside owner/state/epic/story, and assignee accepts the sentinel 'me' resolved against the GitHub-auth identity (candidate src/workflow/config/github.ts). The 'list my open tasks' behavior is not a separate method but a documented default/convenience: callers (or a thin listMyOpenTasks() one-liner wrapper) pass { assignee: 'me', state: 'open' }. Same flat TaskRecord DTO and same TrackerExec plumbing as a1; epic/story still resolved via listEpicHashes + updateEpicTaskList convention.

**Rejected because:** a2 collapses both behaviors into one queryTasks with a 'me' sentinel. It shares a1's truncation gap (same flat array, no pagination) AND additionally erodes the Story's explicit framing of query and list as two behaviors, making 'my open tasks' an unnamed convention callers must remember. Its 'me' magic-string overloads owner/assignee semantics — an easy-to-misuse, validation-hungry accuracy hazard the other two avoid. It ranks last because it is weaker than a1 on intent-boundary/misuse-safety while offering no correctness advantage, and weaker than a3 on pagination correctness.

## Open questions

- invariantsToPreserve cite sources 'c1'/'c2'/'c3', which are constraint-style labels rather than references to a specific s1 analyze bundle. Invariants 1/2/5/6 (reuse TrackerExec, serial calls, epic resolution via listEpicHashes/updateEpicTaskList, read-only) trace to s1 bundle content, but invariants 3 (no silent truncation via pageInfo) and 4 (AND semantics + post-filter) are NEW design decisions adopted from winning alt a3 with no supporting current-behaviour bundle. Confirm these two are accepted as design choices, not pre-existing invariants. (s8 ep3, partial)
- The Story's acceptanceCriteria is empty — the s6 acceptance mapping (ac1..ac5) is derived from userValue (query filters, my-open-tasks, pagination, error handling), not literal Story-supplied criteria. Confirm the derived ac1-ac5 are the intended acceptance surface, or back-flow the missing acceptanceCriteria to the upstream Story. (s8 ts1, partial)

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0] capability-discovery` — "No existing query/list read surface was found — reuse-check returned zero clear-match candidates. ... The handler must be BUILT, and it should be built inside/against src/workflow/tracker, which alrea"
- **[[c2]]** `step-output` `s1.analyzeBundles[1] symbol.locate` — "the TrackerExec abstraction in github.ts is the existing GitHub-execution seam to reuse for the read calls"
- **[[c3]]** `step-output` `s3.winnerRationale / s4.dataModel TaskPage` — "a3 is the only design that makes pagination a first-class part of the contract ({ tasks, pageInfo, total }), eliminating the silent large-result-set truncation that both a1 and a2 hide behind a bare f"
- **[[c4]]** `step-output` `s5.errorCases + s6.testStrategy + s7.migration` — "Throw TrackerAuthError / TrackerQueryError per the contract; node:test (tsx --test, *.test.ts under src/workflow/tracker); purely additive greenfield internal read surface."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 8 LOW** · model `client` · reviewed 2026-07-22T11:28:22.868Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c6 | citation | MED | assisted | A source of the current GitHub user login (for listMyOpenTasks' assignee=current-user) is resolvable from src/workflow/config/github.ts. | CONTRADICTED for the named source: src/workflow/config/github.ts exports only config resolution (resolveGithubConfig, loadGithubConfigFile, githubConfigPath) and no current-user/login resolver — the `user` grep hits there are prose comments. So listMyOpenTasks' identity source (config/github.ts) is misattributed. HOWEVER the correct mechanism already exists: `gh api -i /user` at src/workflow/tracker/github.ts:241 (used for token scopes) — `gh api /user --jq .login` yields the current login. The LLD itself flagged this as an open question, so it is acknowledged, not hidden; but it must be resolved before build since half the feature (listMyOpenTasks) depends on it. | Resolve the current-user login via `gh api /user` (.login) through the existing TrackerExec seam, NOT config/github.ts. Update the LLD's identity-source citation and open question accordingly before approve. |
| c1 | citation | LOW | manual | A TrackerExec GitHub-execution seam exists in src/workflow/tracker/github.ts and is the reusable authenticated-call abstraction the handler builds on. | Confirmed: `export type TrackerExec` at src/workflow/tracker/github.ts:22 — the reusable GitHub-execution seam exists exactly as the LLD's core reuse anchor claims. | none — verified sound |
| c2 | citation | LOW | manual | listEpicHashes exists in src/workflow/tracker/resolve.ts and is the source for resolving epic/story filter values to epic hashes. | Confirmed the function exists and is the right resolution source: `function listEpicHashes(dir)` at src/workflow/tracker/resolve.ts:121, used internally at :251/:267. Note: it is module-PRIVATE (no `export`), so reuse from a new query module requires adding an export — a trivial, non-blocking impl step; the premise (listEpicHashes is the epic-resolution source) holds. | During build, export listEpicHashes from resolve.ts before importing it into the new query module. |
| c3 | citation | LOW | manual | updateEpicTaskList exists in src/workflow/tracker/conventions.ts and encodes the epic task-list convention the epic/story filter maps onto. | Confirmed: `export function updateEpicTaskList` at src/workflow/tracker/conventions.ts:154 — exported and available as the epic task-list convention source. | none — verified sound |
| c4 | citation | LOW | manual | A CreatedIssue shape exists in src/workflow/tracker/github.ts and is the GitHub-issue projection source for TrackerTask. | Confirmed: `export interface CreatedIssue` at src/workflow/tracker/github.ts:140 — the GitHub-issue projection source for TrackerTask exists. | none — verified sound |
| c5 | inventory | LOW | manual | The tracker write-side ops the read-only invariant names as forbidden — ghAddProjectItem, ghAttachMilestone, commitAndPushArtifacts — actually exist in the tracker module. | Confirmed all three write-ops the read-only invariant forbids: ghAddProjectItem (github.ts:330), ghAttachMilestone (github.ts:223), commitAndPushArtifacts (real, imported in cli/services/workflow.ts:54). The read-only boundary is grounded in real functions. | none — verified sound |
| c7 | closed-union | LOW | manual | No query/list task read surface with owner/state/epic/story filters (queryTasks / listMyOpenTasks) already exists in the tracker module — this is genuinely new, not duplicating an existing capability. | Confirmed: 0 matches for queryTasks\|listMyOpenTasks\|listTasks\|queryIssues across src — no existing query/list task read surface. The capability is genuinely new (validates the triage new-vs-reuse signal); no duplication risk. | none — verified sound |
| c8 | external-contract | LOW | manual | The repo rule against Promise.all over provider/remote calls (the serial-GitHub-calls invariant) is a real documented constraint the tracker module already follows. | The repo rule against Promise.all over provider/remote calls is real (CLAUDE.md; the Promise.all hits found are DB/file batching in daemon/db + template-loader, not remote/provider calls). The tracker module shows no Promise.all over GitHub calls — the serial-calls invariant is grounded and already the module's pattern. | none — verified sound |
| c9 | citation | LOW | manual | The test convention the LLD adopts — *.test.ts under src/workflow/tracker run via tsx --test — matches existing tracker test files. | The node:test convention is confirmed by the existing tracker test (src/workflow/__tests__/tracker-auto.test.ts imports node:test). Minor location imprecision: existing tracker tests live at src/workflow/__tests__/, not src/workflow/tracker/ as the LLD's framework note says — non-breaking; the impl should follow the existing __tests__/ location. | Place the new tests at src/workflow/__tests__/ (existing tracker-test location), not src/workflow/tracker/. |

#### Proposed fixes

- **c6** (assisted) — 
  - option: Resolve current user via `gh api /user --jq .login` issued through the existing TrackerExec seam — the same `gh api /user` call already present at tracker/github.ts:241 for scope-checking; add a small `currentGithubLogin(exec)` helper next to it.
  - option: Add current-user resolution to config/github.ts (extend it to read `gh api /user`), keeping the LLD's original citation but making it true.
  - option: Accept as an explicit open question to resolve at plan/build time, documenting `gh api /user` as the intended mechanism.
