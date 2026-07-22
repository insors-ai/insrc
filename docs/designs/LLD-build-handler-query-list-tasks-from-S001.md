<!-- insrc:artifact LLD-3e7223b0a7aa436d-S001 -->

# LLD: S001

**Epic:** `build-handler-query-list-tasks-from`
**HLD base run:** `wf-1784715605060-05z9vo`
**HLD effective hash:** `3e7223b0a7aa...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `query`

```typescript
query(filters: TaskQueryFilters): Promise<TaskRecord[]>
```

**Parameters:**
- `filters: TaskQueryFilters` — Filter criteria — any combination of owner (assignee login), state (open|closed), epic (epic ref/hash), story (story ref). Absent fields are unconstrained; provided fields are ANDed together.

**Returns:** `Promise<TaskRecord[]>` — Normalized task records from the GitHub-backed tracker matching every supplied filter; empty array when nothing matches.

**Errors:**
- `GithubApiError` when Underlying GitHub REST/GraphQL request fails (auth, network, rate-limit).
- `InvalidFilterError` when filters.state is not one of the TaskState members, or a filter value is malformed.

**Preconditions:**
- The active repo has a configured GitHub tracker (config/github.ts) resolvable for the current repo.
- The GitHub CLI OAuth session is authenticated (cloud access delegated per project rule).

**Postconditions:**
- Returned records satisfy AND semantics across all provided filters; an empty filters object returns all tracker tasks.
- Each returned record is a normalized TaskRecord decoupled from GitHub's wire shape — no raw GitHub issue objects leak across the boundary.

### `list`

```typescript
list(): Promise<TaskRecord[]>
```

**Returns:** `Promise<TaskRecord[]>` — The current user's open tasks — assignee = the authenticated GitHub user, state = open — resolved entirely server-side so the my-open-tasks semantics cannot be mis-parameterized by the caller.

**Errors:**
- `CurrentUserResolutionError` when The authenticated GitHub user (assignee identity) cannot be resolved.
- `GithubApiError` when Underlying GitHub request fails (auth, network, rate-limit).

**Preconditions:**
- The current GitHub user is resolvable from the CLI OAuth session.
- The active repo has a configured GitHub tracker.

**Postconditions:**
- Every returned record has owner = current user and state = 'open'; the view is a distinct verb, not a caller-supplied preset.
- Equivalent to query({ owner: <current-user>, state: 'open' }) but with the owner/state binding fixed server-side.

## Data model changes

### `TaskRecord` — new

Normalized, GitHub-wire-decoupled task record returned by both query() and list(). Carries the identity + filter fields the Story needs: id/number, title, owner (assignee login | null), state (TaskState), epic (epic ref/hash | null), story (story ref | null), url. Built new — no existing record is shaped for owner/state/epic/story filtering (data-model.trace). Normalized from the GitHub issue wire shape in github.ts rather than passed through raw.

```
+ interface TaskRecord {
+   id: string;
+   number: number;
+   title: string;
+   owner: string | null;   // GitHub assignee login
+   state: TaskState;
+   epic: string | null;    // epic ref/hash (cf. listEpicHashes)
+   story: string | null;   // story ref
+   url: string;
+ }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/github.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/resolve.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/conventions.ts`

### `TaskState` — new

Closed enum of task states used both in TaskRecord.state and TaskQueryFilters.state so invalid state filters are rejected at the handler boundary rather than at GitHub. Net-new — no existing state vocabulary is modeled (data-model.trace, search.text: filter vocabulary is net-new).

```
+ type TaskState = 'open' | 'closed';
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/github.ts`

### `TaskQueryFilters` — new

Filter argument for query(). All fields optional (exactOptionalPropertyTypes: explicit | undefined); each present field constrains the result set, ANDed. owner filters by assignee login, state by TaskState, epic/story by ref. Net-new — no owner/state/epic/story filter surface exists today; nearest identity anchors are listEpicHashes (resolve.ts) and updateEpicTaskList (conventions.ts), which handle epic/story identity only and perform no assignee/state filtering.

```
+ interface TaskQueryFilters {
+   owner?: string | undefined;
+   state?: TaskState | undefined;
+   epic?: string | undefined;
+   story?: string | undefined;
+ }
```

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/resolve.ts`
- `/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker/conventions.ts`

## Error paths

### Error cases

- **query() called with filters.state set to a value outside the TaskState set (e.g. 'in_progress', 'OPEN', '') ** (recoverable)
  - Detection: The handler validates filters.state against the closed TaskState literal set ('open' | 'closed') at the top of query(), before any GitHub request is issued.
  - Response: Throw InvalidFilterError naming the offending field and the accepted values; no GitHub call is made.
  - User impact: Caller gets a precise, fast rejection at the handler boundary instead of an opaque GitHub-side failure or silently-empty result.
- **A supplied filter value is structurally malformed — e.g. epic/story ref that is not a string or is an empty/blank string.** (recoverable)
  - Detection: The handler type/shape-checks each present filter field (owner/epic/story are non-empty strings when provided) before building the GitHub query.
  - Response: Throw InvalidFilterError identifying the malformed field; abort before contacting GitHub.
  - User impact: Malformed input is caught deterministically rather than degrading into a wrong or empty task list.
- **The underlying GitHub request (REST/GraphQL via the CLI) fails: auth expired, network unreachable, or rate-limit (HTTP 401/403/429/5xx).** (recoverable)
  - Detection: The handler inspects the GitHub CLI subprocess exit code / response status; a non-success status or non-zero exit is surfaced as a failure rather than parsed as data.
  - Response: Wrap the underlying failure in GithubApiError, preserving the status/reason; do not return a partial or empty list as if it were a successful match.
  - User impact: A transport/auth failure is clearly distinguished from a genuine no-results answer, so the caller can retry or re-auth instead of trusting an empty array.
- **list() cannot resolve the authenticated GitHub user (assignee identity) — OAuth session present but the current-user lookup returns no login.** (recoverable)
  - Detection: list() checks the current-user resolution result before building the my-open-tasks query; a missing/empty login field is treated as unresolved.
  - Response: Throw CurrentUserResolutionError; do not fall back to an unfiltered or all-users query.
  - User impact: Prevents list() from silently returning someone else's or all tasks when the current user is unknown, which would violate the my-open-tasks contract.
- **The active repo has no resolvable GitHub tracker configuration (config/github.ts returns nothing for the repo).** (recoverable)
  - Detection: Both query() and list() resolve the tracker config for the active repo up front; a missing configuration is detected when the lookup returns undefined.
  - Response: Throw a tracker-not-configured error (GithubApiError or a dedicated config error) before any request; message points at the missing GitHub tracker config.
  - User impact: Caller learns the repo isn't wired to a GitHub tracker instead of receiving a confusing auth or empty-result failure.

### Edge cases

| Input | Expected |
| :--- | :--- |
| query({}) — empty filters object | Returns all tracker tasks (no constraints applied); AND-over-zero-filters is the unconstrained set, not an error and not empty-by-default. |
| query({ owner: 'x', state: 'open', epic: 'E1', story: 'S3' }) where filters are individually valid but their AND-intersection matches no task | Returns an empty TaskRecord[] — a valid no-match result, distinct from a GithubApiError. |
| list() when the current user has zero open assigned tasks | Returns an empty array; my-open-tasks with nothing open is a normal empty result, not an error. |
| query({ owner: 'alice' }) against a tracker whose issues include tasks with no assignee (owner = null) | Unassigned tasks are excluded from the owner-filtered result; owner=null records only appear when the owner filter is absent. |
| query({ epic: 'E1' }) against tasks that carry no epic/story ref (epic/story = null) | Records with null epic are excluded by an epic filter; the null fields are preserved verbatim on records that do pass other filters. |
| A tracker with more open tasks than a single GitHub page returns | The handler paginates through all pages so the returned TaskRecord[] is complete, not truncated to the first page. |
| query({ state: 'open', state duplicated / case-exact 'open' }) and list() overlapping — both asked for the same current-user open set | list() returns the same records as query({ owner: <current-user>, state: 'open' }); the two verbs agree, with list() binding owner/state server-side. |

### Invariants to preserve

- No raw GitHub issue/wire objects leak across the handler boundary — both query() and list() return only normalized TaskRecord values (id/number/title/owner/state/epic/story/url), preserving the codebase's 'no raw file dumps / structured records only' rule. [[c1]]
- All cloud GitHub access goes through the CLI OAuth session (gh/CliProvider path), never a direct REST/GraphQL client instantiated in-process — the project's 'no direct cloud REST from our process' rule. [[c2]]
- list() fixes owner = authenticated current user and state = 'open' server-side; these bindings are not caller-supplied presets and cannot be overridden through the list() surface. [[c3]]
- query() applies AND semantics across all provided filters, leaves absent fields unconstrained, and validates state against the closed TaskState set at the boundary rather than deferring the check to GitHub. [[c4]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (co-located `*.test.ts` files under src/workflow/tracker, per test.locate in s1)`

### Test levels

- **unit** — Prove query()/list() filter semantics, TaskRecord normalization, and error-boundary behavior with the GitHub CLI subprocess faked/stubbed — no network. This is the primary level: every filter, edge case, and error path from s4/s5 is deterministically exercisable here.
  - Subjects: `query(filters: TaskQueryFilters): Promise<TaskRecord[]> — AND semantics, empty-filters = all, no-match = empty array`, `list(): Promise<TaskRecord[]> — server-side owner=current-user + state='open' binding, equivalence to query({owner,state:'open'})`, `filter validation — InvalidFilterError for out-of-set state and malformed owner/epic/story before any GitHub call`, `TaskRecord normalization — GitHub issue wire shape → {id,number,title,owner,state,epic,story,url}, no raw wire object leaks`, `error mapping — GithubApiError (401/403/429/5xx / non-zero exit), CurrentUserResolutionError, tracker-not-configured`
  - Fixtures: `Fake GitHub CLI provider / gh-invocation seam returning canned issue-list JSON (assigned, unassigned, open, closed, epic/story-tagged, multi-page)`, `Stub current-user resolver returning a known login, and a variant returning empty/no-login`, `Stub tracker-config resolver returning a config and a variant returning undefined`, `Canned failing-subprocess result (non-zero exit / 401 / 429 status) for GithubApiError mapping`, `Multi-page issue fixture to exercise pagination completeness`
- **integration** — Prove the handler wires through the real gh/CliProvider OAuth path and returns normalized TaskRecords against a live GitHub-backed tracker — asserting the 'no direct REST' invariant holds end to end. Gated behind INSRC_LIVE_TESTS=1, skips cleanly when unset (matches the repo's live-test convention).
  - Subjects: `query() against a real configured GitHub tracker repo — owner/state/epic/story filters resolve real issues`, `list() against the authenticated current user — returns that user's open assigned tasks only`
  - Fixtures: `INSRC_LIVE_TESTS=1 gate + an authenticated gh CLI OAuth session`, `A registered test repo with a configured GitHub tracker (config/github.ts) and a few seeded/known issues`

## Migration

**State before:** Per s1 analyze bundles, src/workflow/tracker exposes no task query/list read surface today. symbol.locate returned prerequisite-empty (module.profile exports:[]/entrypoints:[]) and the only surfaced exports on github.ts (CreatedIssue, ghAddProjectItem, ghAttachMilestone, commitAndPushArtifacts) are all create/commit-side. data-model.trace and search.text confirm the owner/state/epic/story fields, the TaskState vocabulary, and the my-open-tasks (assignee=current-user + open) view are NOT modeled anywhere; nearest identity anchors are listEpicHashes (resolve.ts) and updateEpicTaskList (conventions.ts), which handle epic/story identity only and perform no assignee/state filtering. test.locate confirms no task-query test file exists. Net: there is no TaskRecord, no TaskState, no TaskQueryFilters, and no query()/list() handler — the read surface is entirely absent.

**State after:** A new internal read surface lives beside src/workflow/tracker: a query(filters) handler returning normalized TaskRecord[] with AND semantics across optional owner/state/epic/story filters, and a list() handler returning the current user's open tasks (assignee=authenticated GitHub user, state=open) bound server-side. TaskRecord, TaskState, and TaskQueryFilters are defined and TaskRecord is normalized from GitHub's wire shape in github.ts so no raw issue objects cross the boundary. Co-located *.test files cover each filter plus the my-open-tasks path.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the closed TaskState type ('open' | 'closed') as a new net-new type in the tracker module. Purely additive — no existing symbol references it yet. — ↩ rollbackable
2. Add the new TaskRecord interface (id, number, title, owner: string|null, state: TaskState, epic: string|null, story: string|null, url) as the normalized, GitHub-wire-decoupled record. Additive new type; no existing record changes shape. — ↩ rollbackable
3. Add the new TaskQueryFilters interface with all fields optional and explicitly | undefined (exactOptionalPropertyTypes): owner, state, epic, story. Additive new type. — ↩ rollbackable
4. Add a normalization step in github.ts that maps a raw GitHub issue wire object to a TaskRecord (assignee login -> owner, GitHub state -> TaskState, epic/story refs derived via the listEpicHashes / updateEpicTaskList identity anchors). New internal helper; leaves existing create/commit-side functions untouched. — ↩ rollbackable
5. Add the new query(filters) handler beside the tracker module: resolve the configured GitHub tracker for the active repo, fetch tracker issues, apply AND semantics over provided filters, validate filters.state against TaskState (reject malformed with InvalidFilterError), surface GithubApiError on underlying request failure, and return normalized TaskRecord[] (empty array when nothing matches). New entrypoint — no existing call-site is repurposed. — ↩ rollbackable
6. Add the new list() handler that resolves the authenticated GitHub user from the CLI OAuth session (raising CurrentUserResolutionError when unresolvable) and returns query({ owner: <current-user>, state: 'open' }) with the owner/state binding fixed server-side. New entrypoint depending on step 5; additive. — ↩ rollbackable
7. Add co-located *.test files under src/workflow/tracker covering each filter (owner/state/epic/story), AND-combination semantics, the empty-filters returns-all case, InvalidFilterError on bad state, and the my-open-tasks (list) path including CurrentUserResolutionError. Test-only addition. — ↩ rollbackable

**Backward compat:** Not applicable — no existing public API is affected. Every element (TaskState, TaskRecord, TaskQueryFilters, query(), list()) is net-new internal surface (surfaceLevel: internal); s1 confirms no task-query signature, filter vocabulary, or my-open-tasks view exists today, and the adjacent github.ts create/commit-side functions are not repurposed or reshaped. No existing caller, signature, or record changes shape, so no compatibility shim, deprecation window, or dual-read path is required.

## Alternatives considered

### a1: Two-verb contract, shared TaskRecord — **CHOSEN**

Distinct query(filters) and list() entrypoints returning the same TaskRecord shape.

Expose two named handlers beside src/workflow/tracker: query(filters: TaskQuery) and list(). TaskQuery is a typed object { owner?, state?, epic?, story? } with each field optional and independently applied (AND semantics). list() takes no args and is defined as the my-open-tasks view — assignee = resolved current user, state = open — resolved server-side, not by the caller passing filters. Both return TaskRecord[] where TaskRecord is a new domain record { id, title, owner, state, epicRef, storyRef, url } normalized off the GitHub issue/project-item, decoupled from the wire shape. epicRef/storyRef reuse the existing epic/story identity anchors (listEpicHashes in resolve.ts, updateEpicTaskList in conventions.ts). Current-user resolution is an internal concern of list(), not a query filter value.

### a2: Single query() with list as a named preset

One query(filters) contract; my-open-tasks is a documented preset over the same filter object.

Expose a single handler query(filters: TaskQuery) where TaskQuery = { owner?, state?, epic?, story? }. The my-open-tasks 'list' behavior is not a separate entrypoint but a preset: owner = the sentinel '@me' (or a resolved current-user id) and state = 'open'. Callers wanting the list view pass { owner: '@me', state: 'open' }; an optional thin convenience wrapper list() may forward exactly that. TaskRecord is the same normalized domain record { id, title, owner, state, epicRef, storyRef, url }. One fetch/normalize/filter pipeline serves every case.

**Rejected because:** Lowest surface and one code path, but it collapses the Story's explicitly-framed 'returns my open tasks' list view into a caller-honored preset ({owner:'@me', state:'open'}) with no compile-time guarantee, making the core user intent easier to get wrong — a direct weakening of the Story's framing. The '@me' sentinel also smuggles an identity concept into a plain equality filter. Its S cost advantage carries little weight given cost is the lowest priority.

### a3: Thin GitHub-projection, filters as search qualifiers

Model the task close to GitHub's issue/project-item wire shape; filters compile to GitHub search qualifiers.

Keep the data model deliberately thin: TaskRecord is a near-passthrough projection of the GitHub issue / project-item ({ number, title, assignees, state, labels/fields, url }) with epic/story surfaced from the existing label/field convention rather than a normalized ref type. query(filters) and list() translate owner/state/epic/story into GitHub search qualifiers (assignee:, state:, plus the label/field qualifiers used for epic/story) and let GitHub do the filtering; the handler forwards and lightly maps the response. list() sets assignee:@me state:open. Reuses github.ts's existing GitHub access idioms directly.

**Rejected because:** Weakest on accuracy/durability: it leaks GitHub's wire shape into the handler contract, makes epic/story filtering brittle against label/field convention drift, bakes search-qualifier semantics (partial match, pagination, rate limits) into observable behavior, and gives the weakest typing on state/owner (invalid filters fail at GitHub rather than the boundary). It also makes unit testing hard without live GitHub. Its server-side filtering and small conceptual distance are real but are cost/convenience wins, which rank last under the accuracy-primary principle.

### a4: Typed predicate model with normalized refs

First-class Task domain entity + a typed TaskFilter predicate, GitHub as one backing source.

Introduce a first-class normalized domain: Task { id, title, owner: OwnerRef, state: TaskState (enum: open|closed|...), epic: EpicRef, story: StoryRef, url }, with EpicRef/StoryRef built on the existing epic/story identity anchors (listEpicHashes, updateEpicTaskList). Filtering is a typed TaskFilter predicate — { owner?, state?, epic?, story? } validated at the boundary — applied in-process after normalization. A single findTasks(filter) is the core; query(filter) and list() (filter = { owner: currentUser, state: open }) are thin views over it. GitHub is treated as one backing source behind the normalizer, not baked into the contract.

**Rejected because:** a4 offers the strongest and most durable contract — typed TaskState enum and EpicRef/StoryRef catch invalid filters at the boundary and fully decouple from GitHub — which aligns with accuracy-first. It edges out a2/a3 on robustness. It ranks below a1 only because, for a standalone read surface with no stated cross-Story contracts to satisfy, the L-cost normalizer + predicate + per-view test surface and the need to reconcile net-new enum/ref types against github.ts's existing encoding is over-engineering relative to scope; a1 captures the wire-shape decoupling that matters here at M cost while equally preserving the list() intent.

## Open questions

- s8 verify item ep3 (partial): invariantsToPreserve cite constraint/design-decision IDs (c1-c4: no-raw-dumps and no-direct-REST from CLAUDE.md; server-side list() binding and AND semantics from s2/s3) rather than an s1 analyze bundle showing a pre-existing code invariant. This is legitimate for a net-new standalone build — the analyze bundles found the surface absent, so there is no pre-existing code invariant for a bundle to cite — but the soft 'cite an analyze bundle' enhancement check is formally unmet and flagged for reviewer confirmation.

## Citations

- **[[c1]]** `convention` `CLAUDE.md — Key architectural rules #5: No raw file dumps; context is always structured entity summaries + relations from the graph.` — "No raw file dumps — context is always structured entity summaries + relations from the graph."
- **[[c2]]** `convention` `CLAUDE.md — Project principles: No direct cloud REST calls from our process; cloud LLM/GitHub access goes through the locally-installed CLI binaries (CliProvider).` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`)."
- **[[c3]]** `step-output` `s3.winnerRationale / s4.api.list — list() fixes owner=authenticated current user and state='open' server-side; the my-open-tasks semantics are resolved server-side and cannot be mis-parameterized.` — "a1 uniquely makes list() a distinct verb whose my-open-tasks semantics are resolved server-side and cannot be mis-parameterized."
- **[[c4]]** `step-output` `s4.api.query / s5.invariantsToPreserve — query() applies AND semantics across all provided filters, leaves absent fields unconstrained, and validates state against the closed TaskState set at the boundary.` — "query() applies AND semantics across all provided filters, leaves absent fields unconstrained, and validates state against the closed TaskState set at the boundary rather than deferring the check to G"
- **[[c5]]** `step-output` `s1.backFlowNotes — this is a BUILD beside src/workflow/tracker; no task query/list signature, filter vocabulary, or my-open-tasks view exists today.` — "this is a BUILD beside src/workflow/tracker, not a reshape — the query/list read surface, the owner/state/epic/story filters, and the my-open-tasks (assignee=current-user + open) view do not exist tod"
- **[[c6]]** `step-output` `s8.results ep3 — invariants cite constraint/design-decision IDs rather than an s1 analyze bundle; soft enhancement check unmet for a net-new standalone build.` — "For a net-new standalone build the analyze bundles found the surface absent, so there is no pre-existing code invariant for a bundle to show; the invariants are legitimately project-rule/design invari"
