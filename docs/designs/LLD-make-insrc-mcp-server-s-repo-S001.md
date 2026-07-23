<!-- insrc:artifact LLD-0cc303c7dd5a9089-S001 -->

# LLD: S001

**Epic:** `make-insrc-mcp-server-s-repo`
**HLD base run:** `wf-1784806841552-bw4g9c`
**HLD effective hash:** `0cc303c7dd5a...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `resolveRepoPath`

```typescript
resolveRepoPath(explicit: string | undefined): Promise<string | undefined>
```

**Parameters:**
- `explicit: string | undefined` _(optional)_ — The caller-supplied `repo` tool-call argument. When present and non-empty it still wins unconditionally, preserving today's top-priority branch.

**Returns:** `Promise<string | undefined>` — The resolved registered repo path, or undefined when no branch matches (callers keep raising their existing no-repo error). Becomes a Promise because the new CWD-containment branch consults the daemon registry over IPC (async), where the current copies are synchronous.

**Errors:**
- `IpcError` when The daemon registry lookup (repo.list IPC path backing the containment match) is unreachable; the resolver surfaces the IPC failure rather than silently falling through, so a broken daemon is not misread as 'no repo'.

**Preconditions:**
- process.cwd() is the per-session workspace (Claude Code sets the MCP subprocess CWD correctly).
- The daemon is reachable so the CWD-containment match can be evaluated against the live multi-repo registry; the MCP side never opens the registry table directly (architectural rule 1).

**Postconditions:**
- Resolution order is: explicit (non-empty) > the registered repo whose path contains process.cwd() > INSRC_REPO env (unchanged headless/cron fallback) > undefined.
- This single shared implementation replaces all eight verbatim copies (src/mcp/server.ts:939, src/mcp/build-step/render.ts:37, src/mcp/analyze-step/phases/start.ts:124, src/mcp/review-step/phases/start.ts:73, src/mcp/triage-step/phases/start.ts:62, src/mcp/workflow-step/phases/start.ts:98, src/mcp/workflow-step/phases/resolve-question.ts:34, src/mcp/workflow-step/phases/review-deferred.ts:27), which now delegate here.
- The CWD->repo containment match itself lives daemon-side (winner a1): the MCP resolver is a thin caller that passes CWD over IPC and receives the matched path; the match semantics single-source next to the registry that owns them.

### `listRepos`

```typescript
listRepos(_db: DbClient): Promise<RegisteredRepo[]>
```

**Parameters:**
- `_db: DbClient` — Daemon-side DB handle. Unchanged; the accessor is consumed as-is as the authoritative source of registered repo paths the containment match compares against process.cwd().

**Returns:** `Promise<RegisteredRepo[]>` — Every registered repo row; each carries the registered repo path that the new daemon-side CWD-containment match tests process.cwd() against. Signature and behaviour are untouched — this Story consumes it, it does not reshape it.

**Preconditions:**
- Runs inside the daemon process, which already loads the full multi-repo registry at startup (src/daemon/index.ts:127).

**Postconditions:**
- Supplies the candidate set for the containment match; the match picks the registered repo whose path contains the incoming CWD (longest/most-specific containing path wins on nesting).

## Data model changes

### `RegisteredRepo` — invariant-change

No shape change to the row. New invariant on how the `path` field is consumed: repo resolution now treats each registered repo's path as a CWD-containment key — process.cwd() is matched against registered paths, and the most-specific containing path selects the session repo. This is evaluated daemon-side (where the registry lives), keeping the MCP process a thin caller per architectural rule 1. The prior INSRC_REPO static-global env read is preserved verbatim but demoted to a strict last-resort fallback after the containment match.

**Call sites:**
- `src/db/repos.ts:213`
- `src/daemon/index.ts:127`

## Error paths

### Error cases

- **The CWD-containment branch calls repo.list IPC to fetch the registered-repo set, but the daemon is down / the Unix socket is gone / the RPC times out.** (recoverable)
  - Detection: The awaited repo.list IPC promise rejects (socket ENOENT, ECONNREFUSED, or RPC timeout); the shared resolver catches the rejection rather than receiving a repo list.
  - Response: Surface the failure as an IpcError to the tool call. Do NOT swallow it and fall through to INSRC_REPO or undefined — per the contract, a broken daemon must not be misread as 'no repo'. The explicit-arg branch (which never touches IPC) still short-circuits before this point, so an explicit repo is unaffected.
  - User impact: A tool call that relied on CWD resolution fails with an explicit 'daemon unreachable' error instead of silently binding to the wrong (INSRC_REPO-pinned) repo; the user restarts the daemon and retries.
- **One of the eight migrated call sites still consumes the resolver result synchronously after its return type changed from `string | undefined` to `Promise<string | undefined>` (the async-ification hazard of collapsing eight copies into one IPC-backed helper).** (recoverable)
  - Detection: `tsc` strict compile fails at the un-migrated site — a `Promise<string | undefined>` is not assignable where a `string | undefined` (or a string used in a path/env comparison) is expected; the build gate blocks the merge.
  - Response: Every one of the eight sites (server.ts:939, build-step/render.ts:37, analyze-step/phases/start.ts:124, review-step/phases/start.ts:73, triage-step/phases/start.ts:62, workflow-step/phases/start.ts:98, workflow-step/phases/resolve-question.ts:34, workflow-step/phases/review-deferred.ts:27) is updated to `await` the resolver; the build stays red until all copies migrate.
  - User impact: None at runtime — caught at build time. Prevents a silent bug where an un-awaited Promise is always truthy, so the caller's existing no-repo error would never fire and a garbage repo path would flow downstream.

### Edge cases

| Input | Expected |
| :--- | :--- |
| `repo` arg omitted; process.cwd() is inside a registered repo; INSRC_REPO env is set to a DIFFERENT registered repo. | The registered repo whose path contains CWD wins over INSRC_REPO — this is the core session-aware behaviour the Story adds. |
| `repo` arg omitted; process.cwd() is outside every registered repo; INSRC_REPO env is set. | Containment match yields nothing; resolution falls through to the unchanged INSRC_REPO env value (headless/cron fallback preserved). |
| Explicit non-empty `repo` arg supplied while CWD sits inside a different registered repo. | The explicit arg wins unconditionally; the resolver short-circuits before the IPC containment branch (no daemon call needed). |
| Nested registered repos: parent `/a` and child `/a/b` both registered; CWD is `/a/b/src`. | The most-specific (longest) containing path `/a/b` wins over `/a`. |
| A registered repo path is `/foo`; CWD is `/foobar/src`. | No match — containment respects path-segment boundaries, so `/foo` does not 'contain' `/foobar`; resolution falls through to INSRC_REPO. |
| process.cwd() equals a registered repo path exactly, with no trailing subpath. | That repo matches — containment is inclusive of equality (a repo contains its own root). |
| Explicit `repo` arg is an empty string ""; CWD is inside a registered repo. | The empty string is treated as absent (the existing non-empty guard), so resolution proceeds to the CWD-containment match rather than binding to "". |
| Empty registry (zero repos registered); `repo` omitted; INSRC_REPO set. | repo.list returns an empty array; containment yields nothing; falls through to INSRC_REPO. |
| No explicit arg, no CWD-containment match, and INSRC_REPO unset. | Resolver returns undefined; each caller raises its existing no-repo error (e.g. build-step/phases/implement.ts:46) — the terminal failure contract is unchanged. |

### Invariants to preserve

- An explicit non-empty `repo` argument still wins unconditionally over every other source — the top-priority branch that both original copies implement today (server.ts:939, render.ts:37) is preserved bit-for-bit; only the branches below it change. [[c1]]
- All eight verbatim MCP copies implement the identical `explicit > INSRC_REPO > fail` ordering today; the enhancement must keep the explicit and env branches observably identical and insert the CWD-containment branch strictly between them, so no existing resolution outcome regresses. [[c2]]
- The INSRC_REPO static-global env read is preserved verbatim and only demoted to the last-resort fallback (after the CWD match), never removed — headless/cron invocations that rely on the pinned env keep resolving exactly as before. [[c5]]
- When no source resolves, the resolver returns undefined and callers raise their existing no-repo error (e.g. build-step/phases/implement.ts:46) — the terminal failure contract is unchanged. [[c5]]
- The MCP process never opens the repo registry directly; the CWD-containment match is evaluated daemon-side via the repo.list IPC path, honouring architectural rule 1 (daemon owns all DB access) exactly as the existing daemon registry access does. [[c4]]

## Test strategy

**Test framework:** `node:test via `tsx --test` (node:test runner; existing suites under src/mcp/__tests__/*.test.ts). Grounded in CLAUDE.md build/test convention (`npx tsx --test 'src/**/__tests__/*.test.ts'`); test.locate confirmed a src/mcp/__tests__ directory exists but cited no dedicated resolveRepoPath test — new specs land there as greenfield.`

### Test levels

- **unit** — Pin the priority ordering and the two pure, non-IPC branches of the shared resolver — explicit-wins short-circuit and empty-string-as-absent — that must stay observably identical to the eight originals.
  - Subjects: `resolveRepoPath(explicit) — explicit non-empty arg wins unconditionally and short-circuits BEFORE any repo.list IPC call (invariant c1)`, `resolveRepoPath(explicit) — explicit empty string "" is treated as absent (non-empty guard), resolution proceeds past the explicit branch`, `resolveRepoPath(undefined) — no containment match + INSRC_REPO unset => resolves undefined (terminal no-repo contract unchanged)`, `resolveRepoPath(undefined) — no containment match + INSRC_REPO set => returns the env value verbatim (headless/cron fallback preserved, demoted to last resort)`
  - Fixtures: `Stubbed/injected daemon IPC client (repo.list) so the explicit-wins case can ASSERT the IPC was never invoked`, `Environment-variable harness that sets/clears INSRC_REPO per case and restores it in teardown`, `process.cwd() stub/override so CWD is controllable without changing the test runner's working directory`
- **unit** — Exercise the daemon-side CWD-containment match semantics in isolation against a synthetic registered-repo set — the core new branch, tested where the registry match logic lives.
  - Subjects: `containment match — CWD inside a registered repo wins over a DIFFERENT INSRC_REPO-pinned repo (core session-aware behaviour)`, `containment match — nested repos /a and /a/b, CWD /a/b/src selects most-specific /a/b (longest containing path wins)`, `containment match — registered /foo vs CWD /foobar/src yields NO match (path-segment boundary respected, not string prefix)`, `containment match — CWD equals a registered repo root exactly => matches (containment inclusive of equality)`, `containment match — empty registry (repo.list => []) yields no match => falls through to INSRC_REPO`
  - Fixtures: `In-memory RegisteredRepo[] fixtures covering nested paths, boundary-collision paths (/foo vs /foobar), and empty set`, `Controllable CWD input value fed to the match function`
- **integration** — Verify the MCP resolver is a thin async caller over the daemon repo.list IPC and that IPC failure surfaces as IpcError rather than being swallowed into a wrong-repo bind.
  - Subjects: `resolveRepoPath — no explicit arg drives a repo.list IPC round-trip; the daemon-side containment winner is returned to the MCP caller`, `resolveRepoPath — repo.list IPC rejects (socket ENOENT / ECONNREFUSED / RPC timeout) => rejects with IpcError, does NOT fall through to INSRC_REPO or undefined`, `resolveRepoPath — explicit non-empty arg with an unreachable daemon still resolves (short-circuits before the IPC branch, so a down daemon is irrelevant to explicit callers)`
  - Fixtures: `Fake/mock daemon IPC transport that can return a repo list, reject with socket errors, or time out`, `Assertion hooks on the awaited promise (rejects vs resolves) and on env fallthrough NOT occurring`
- **contract** — Guarantee the eight verbatim copies collapse into one delegate and that no site consumes the now-async result synchronously (the async-ification hazard) — enforced by the strict build gate.
  - Subjects: `tsc strict compile is green after all eight sites (server.ts:939, build-step/render.ts:37, analyze-step/phases/start.ts:124, review-step/phases/start.ts:73, triage-step/phases/start.ts:62, workflow-step/phases/start.ts:98, workflow-step/phases/resolve-question.ts:34, workflow-step/phases/review-deferred.ts:27) await the shared resolver`, `no residual local resolveRepoPath definition remains at any of the eight sites (all delegate to the single shared helper)`
  - Fixtures: `Full `npm run build` / `tsc` strict compile as the CI gate`, `Grep/AST assertion that the local `function resolveRepoPath` body appears exactly once (the shared module) across src/mcp`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: explicit non-empty arg wins unconditionally and short-circuits before any repo.list IPC call`, `unit: explicit empty string "" treated as absent, resolution proceeds to the containment match`, `integration: explicit non-empty arg resolves even with an unreachable daemon (never touches IPC)` |
| `ac2` | `unit: CWD inside a registered repo wins over a different INSRC_REPO-pinned repo`, `integration: no-explicit-arg drives a repo.list IPC round-trip and returns the containment winner` |
| `ac3` | `unit: nested /a and /a/b with CWD /a/b/src selects most-specific /a/b`, `unit: registered /foo vs CWD /foobar/src yields no match (segment boundary respected)`, `unit: CWD equal to a registered repo root matches (equality inclusive)` |
| `ac4` | `unit: no containment match + INSRC_REPO set returns the env value verbatim (last-resort fallback preserved)`, `unit: empty registry falls through to INSRC_REPO`, `unit: no match + INSRC_REPO unset resolves undefined (terminal no-repo contract unchanged)` |
| `ac5` | `integration: repo.list IPC rejection surfaces as IpcError, does not fall through to INSRC_REPO or undefined` |
| `ac6` | `contract: tsc strict compile green after all eight sites await the shared resolver`, `contract: exactly one resolveRepoPath definition remains across src/mcp (eight copies collapsed into one delegate)` |

## Migration

**State before:** Per s1 analyze bundles: `resolveRepoPath(explicit: string | undefined): string | undefined` is copied VERBATIM into EIGHT MCP sites (symbol.locate #2) — src/mcp/server.ts:939, src/mcp/build-step/render.ts:37, src/mcp/analyze-step/phases/start.ts:124, src/mcp/review-step/phases/start.ts:73, src/mcp/triage-step/phases/start.ts:62, src/mcp/workflow-step/phases/start.ts:98, src/mcp/workflow-step/phases/resolve-question.ts:34, src/mcp/workflow-step/phases/review-deferred.ts:27. Every copy is SYNCHRONOUS and implements the identical resolution order `explicit (non-empty) > INSRC_REPO env > fail`. Per config.trace, INSRC_REPO is a static global env baked into MCP registration (usage/unknown role hits only; no definition/default), read at e.g. src/mcp/analyze-step/phases/start.ts:126 — so every stdio MCP subprocess Claude spawns inherits the same pinned value, and two concurrent sessions in different repos both default to the same pinned repo on any tool call that omits `repo`. process.cwd() is already the correct per-session workspace but is NEVER consulted. The daemon owns the multi-repo registry via `listRepos(_db: DbClient): Promise<RegisteredRepo[]>` at src/db/repos.ts:213 (loaded at startup, src/daemon/index.ts:127) exposed to clients over the repo.list IPC (client wrapper pattern at src/cli/services/repo.ts:17); the MCP process never opens the registry table directly (architectural rule 1). No dedicated resolveRepoPath unit test was cited by the s1 test.locate pass — src/mcp/__tests__ coverage must be confirmed by direct Read before assuming greenfield.

**State after:** A SINGLE shared session-aware resolver `resolveRepoPath(explicit: string | undefined): Promise<string | undefined>` (s4 contract) replaces all eight verbatim copies, which now delegate to it. Resolution order becomes `explicit (non-empty) > the registered repo whose path contains process.cwd() > INSRC_REPO env (unchanged headless/cron last resort) > undefined`. The CWD→repo containment match itself lives daemon-side next to the registry that owns the paths (winner a1): the MCP resolver is a thin caller that passes CWD over IPC and receives the matched path; on nesting the longest/most-specific containing registered path wins. RegisteredRepo gains no shape change — only a new invariant on how its `path` field is consumed (invariant-change, s4 dataModel). The INSRC_REPO env read is preserved verbatim, only reordered behind the containment match. A broken/unreachable daemon surfaces an IpcError rather than being misread as "no repo".

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Confirm the ground-truth test surface first: Read src/mcp/__tests__ to verify whether any existing coverage exercises repo resolution / INSRC_REPO fallback before assuming greenfield (s1 test.locate flagged no cited resolveRepoPath test). No code change; purely a discovery gate that de-risks the later steps. Read-only. — ↩ rollbackable
2. Add a daemon-side CWD-containment match over the existing registry: introduce a new daemon function that consumes listRepos(_db) (src/db/repos.ts:213, unchanged) and, given an incoming CWD, returns the registered repo whose path contains that CWD, selecting the longest/most-specific containing path on nesting; returns undefined when no registered path contains the CWD. Purely additive — listRepos and RegisteredRepo shape are untouched (invariant-change only). Rollbackable: delete the additive function. — ↩ rollbackable
3. Expose the containment match to the MCP process over IPC (new repo.* IPC method, or extend the repo.list path) so the MCP side never opens the registry directly (architectural rule 1). Additive new IPC surface; no existing method signature changed. Rollbackable: remove the new IPC handler + client wrapper. — ↩ rollbackable _(needs: `daemon-containment-match-added`)_
4. Add the single shared async resolver helper in one new MCP-side module implementing the s4 signature `resolveRepoPath(explicit): Promise<string | undefined>` with order explicit > (await CWD-containment match via the new IPC) > INSRC_REPO env > undefined. It surfaces IpcError on daemon unreachability rather than silently falling through. Additive alongside the eight copies (nothing yet delegates to it). Rollbackable: delete the new module. — ↩ rollbackable _(needs: `containment-match-ipc-exposed`)_
5. Add unit coverage for the shared resolver's three-way ordering: CWD inside a registered repo wins over INSRC_REPO; CWD outside any registered repo falls through to INSRC_REPO; explicit (non-empty) still wins over both; and daemon-unreachable surfaces IpcError (not undefined). Extend the pattern confirmed in step 1. Additive test file. Rollbackable: delete the test. — ↩ rollbackable _(needs: `shared-resolver-added`)_
6. Migrate each of the eight call sites (src/mcp/server.ts:939, src/mcp/build-step/render.ts:37, src/mcp/analyze-step/phases/start.ts:124, src/mcp/review-step/phases/start.ts:73, src/mcp/triage-step/phases/start.ts:62, src/mcp/workflow-step/phases/start.ts:98, src/mcp/workflow-step/phases/resolve-question.ts:34, src/mcp/workflow-step/phases/review-deferred.ts:27) to delegate to the shared resolver, awaiting it since resolution is now async (sync→async at each caller; each caller keeps raising its existing no-repo error on undefined). Do this per-site so each is independently revertable. Rollbackable per site: restore that site's local copy and its synchronous call. — ↩ rollbackable _(needs: `shared-resolver-added`, `shared-resolver-tested`)_
7. Remove the eight now-orphaned verbatim local resolveRepoPath copies once every caller delegates to the shared resolver. Rollbackable: re-add the copies (they are identical and reconstructable from git history). — ↩ rollbackable _(needs: `all-eight-call-sites-migrated`)_

**Backward compat:** surfaceLevel is `internal` (s4): resolveRepoPath is not a public API export, so no external signature contract breaks. Two compatibility points still apply. (1) The MCP tool-call contract (the `repo` argument semantics observed by callers) is user-facing: when `repo` is supplied non-empty it STILL wins unconditionally — top-priority branch preserved verbatim. When `repo` is omitted, behaviour changes only for sessions whose process.cwd() is inside a registered repo that differs from the pinned INSRC_REPO: such calls now resolve to the CWD's repo instead of INSRC_REPO. This is the intended fix, but it is a behavioural change for any caller that previously relied on INSRC_REPO winning while CWD was inside another registered repo. Headless/cron sessions whose CWD is outside every registered repo are unchanged — they still fall through to INSRC_REPO exactly as before. (2) Internal callers change from a synchronous return to `Promise<string | undefined>`; every one of the eight sites is migrated to await in the same change (step 6) so no caller is left consuming the old sync shape. New failure mode: a broken/unreachable daemon now surfaces an IpcError at resolution time instead of silently falling through to INSRC_REPO — an intentional, documented behavioural addition so a broken daemon is not misread as "no repo".

## Alternatives considered

### a1: Shared async resolver + new daemon IPC repo.resolveForCwd (containment in daemon) — **CHOSEN**

One extracted resolver; a new IPC method has the daemon do the CWD→repo containment match and return the path.

Replace all eight copied resolveRepoPath bodies with a single shared session-aware resolver module. Add a new daemon IPC method `repo.resolveForCwd({ cwd }): string | undefined` (mirrored client wrapper on the MCP side, following the src/cli/services/repo.ts pattern) that performs the longest-prefix containment match against listRepos()@src/db/repos.ts:213 entirely inside the daemon and returns the matched registered repo path or undefined. The shared resolver keeps the ordering explicit `repo` > `repo.resolveForCwd(process.cwd())` > `INSRC_REPO` env > fail. Resolver signature becomes async: `resolveSessionRepo(explicit, cwd, client): Promise<string | undefined>`.

### a2: Shared async resolver reusing existing repo.list IPC (containment in MCP helper)

One extracted resolver fetches the registry via the existing repo.list IPC and runs the CWD containment match MCP-side.

Extract one shared session-aware resolver used by all eight sites, but add NO new IPC. The helper calls the existing `repo.list` IPC (client wrapper listRepos(): Promise<RegisteredRepo[]> at src/cli/services/repo.ts:17), then performs the longest-prefix containment match of process.cwd() against the returned RegisteredRepo[] rows inside the shared MCP helper. Ordering unchanged: explicit `repo` > CWD-contained registered repo > `INSRC_REPO` > fail. No daemon-side contract change.

**Rejected because:** Strong, cheapest structural option (cost S): one extraction point eliminates the eight-copy drift and registry access still flows through the daemon via the proven repo.list IPC, so rule 1 on DB access is preserved with no new contract to mirror. Ranks below a1 only because the containment-match semantics live MCP-side, away from the daemon that owns the registry — a second place to keep correct and a weaker fit for rule 1's ownership intent. Since cost is the least priority, its S-vs-M advantage over a1 does not promote it.

### a4: Bootstrap-once session resolution cached at MCP process start

Resolve the session repo once when the stdio MCP process starts and cache it; per-call resolution reads the cache.

Exploit that the MCP stdio process is one-per-session: both process.cwd() and INSRC_REPO are fixed for the process lifetime. Resolve the session repo exactly once at MCP server bootstrap (CWD containment via repo.list IPC, falling back to INSRC_REPO) and cache it in a shared module-level value. The eight sites' resolveRepoPath is replaced by `explicit ?? cachedSessionRepo`, keeping explicit-param override per call. Contract: one seeded session value, one IPC round-trip per process.

**Rejected because:** Does collapse the eight sites to a shared `explicit ?? cached` read and is the cheapest steady-state path, so it addresses the drift goal. Ranked below a1/a2 because it assumes CWD never changes mid-process — a silent-staleness hazard flagged in its own cons. Under the project principle that accuracy is primary, introducing a correctness assumption to save round-trips is the wrong trade, even if correct for Claude Code stdio today.

### a3: Per-site CWD branch over a shared containment utility (keep eight copies)

Add one small containment utility but leave the eight resolveRepoPath bodies in place, inserting the CWD branch into each.

Introduce only a small shared `repoContainingCwd(cwd): Promise<string | undefined>` utility (over the existing repo.list IPC) and insert the new CWD branch into each of the eight existing resolveRepoPath copies, keeping their local bodies. Each copy's ordering becomes explicit > repoContainingCwd(cwd) > INSRC_REPO > fail.

**Rejected because:** Last. Although it single-sources the genuinely shared containment utility, it deliberately leaves all eight near-identical resolveRepoPath copies in place — directly against the s1 back-flow steer to collapse to one resolver, which is the Story's core purpose. It preserves the exact drift smell the work exists to remove and locks in eight edit sites to keep consistent forever.

## Open questions

- The Story's acceptanceCriteria array is empty, so the s6 acceptanceMapping ids ac1–ac6 are design-synthesized rather than Story-declared. Each synthesized criterion does have proving tests, but the reviewer should confirm the manufactured ACs (ac1 explicit-wins, ac2 CWD-wins-over-env, ac3 containment/nesting/boundary semantics, ac4 INSRC_REPO last-resort fallback, ac5 IpcError on daemon-down, ac6 collapse-to-one-delegate build gate) accurately capture the intended acceptance surface before approval (s8 ts1, verdict: partial).

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0] symbol.locate — resolveRepoPath focus copies` — "symbol.locate finds `resolveRepoPath(explicit: string | undefined): string | undefined` copied verbatim at src/mcp/server.ts:939 (focus copy #1) and src/mcp/build-step/render.ts:37 (focus copy #2). Bo"
- **[[c2]]** `step-output` `s1.analyzeBundles[1] symbol.locate — eight MCP copies` — "The same `resolveRepoPath(explicit: string | undefined): string | undefined` helper is copied into EIGHT MCP sites, not two: src/mcp/server.ts:939, src/mcp/build-step/render.ts:37, src/mcp/analyze-ste"
- **[[c3]]** `step-output` `s1.analyzeBundles[2] symbol.locate — listRepos accessor` — "The registered-repo set to match CWD against is exposed by `listRepos(_db: DbClient): Promise<RegisteredRepo[]>` at src/db/repos.ts:213, returning `RegisteredRepo[]` — each row carries the registered "
- **[[c4]]** `step-output` `s1.analyzeBundles[3] usage.example — daemon loads registry / rule 1` — "`main()` at src/daemon/index.ts:127 is the enumerated caller of listRepos, confirming the daemon process already loads the complete multi-repo registry at startup. The daemon owns registry access (per"
- **[[c5]]** `step-output` `s1.analyzeBundles[4] config.trace — INSRC_REPO static-global fallback` — "config.trace on INSRC_REPO returns exclusively `usage`/`unknown` role hits — no `definition` or `default` role anywhere — confirming it is a static global env baked into MCP registration, precisely th"
- **[[c6]]** `step-output` `s3.winnerId / winnerRationale — chosen alternative a1` — "winnerId: a1 ... a1 is the only option that puts BOTH registry access and the CWD→repo containment-match semantics inside the daemon, keeping the MCP side a thin caller and single-sourcing the match l"
- **[[c7]]** `step-output` `s8.results[ts1] — synthesized acceptance criteria flag` — "The Story's acceptanceCriteria array is EMPTY ... s6 acceptanceMapping introduces ac1–ac6 that are not present in the Story; the design synthesized criteria from userValue and each synthesized id does"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-07-23T12:14:08.422Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | inventory | LOW | manual | resolveRepoPath is DEFINED (a verbatim function body copy) at EIGHT MCP sites, not merely imported/called there. | grep `function resolveRepoPath` returns exactly 8 MCP definitions with the identical (explicit: string \| undefined): string \| undefined signature: analyze-step/phases/start.ts:124, build-step/render.ts:37, review-step/phases/start.ts:73, server.ts:939, triage-step/phases/start.ts:62, workflow-step/phases/resolve-question.ts:34, workflow-step/phases/review-deferred.ts:27, workflow-step/phases/start.ts:98. The 4 other matches (analyze/context/driver.ts:954, analyze/runtimes/{code,data,infra}/_shared.ts) are a DIFFERENT function taking (scopeRef, templateLabel) — correctly excluded by the LLD. Eight verbatim copies confirmed. | none — verified sound |
| c2 | inventory | LOW | manual | The total number of files that reference resolveRepoPath (definitions plus import/call sites) across src/mcp. | Corroborating/informational (evidence truncated at 50, so an exact grand total isn't derivable), but it confirms the 8 MCP definitions coexist with many unrelated analyze-runtime references. The load-bearing count (8 MCP copies) is settled by c1; this claim is non-material. | none — the material inventory (8 defs) is confirmed under c1 |
| c3 | citation | LOW | manual | resolveRepoPath is defined at src/mcp/server.ts:939 with signature (explicit: string \| undefined): string \| undefined. | read src/mcp/server.ts:939 = `function resolveRepoPath(explicit: string \| undefined): string \| undefined {` — exact match. | none — verified sound |
| c4 | citation | LOW | manual | resolveRepoPath is defined (exported) at src/mcp/build-step/render.ts:37. | read src/mcp/build-step/render.ts:37 = `export function resolveRepoPath(explicit: string \| undefined): string \| undefined {` — exported definition confirmed. | none — verified sound |
| c5 | citation | LOW | manual | listRepos(_db: DbClient): Promise<RegisteredRepo[]> is defined at src/db/repos.ts:213 and is the authoritative registered-repo accessor. | read src/db/repos.ts:213 = `export async function listRepos(_db: DbClient): Promise<RegisteredRepo[]> {`. A second listRepos (cli/services/repo.ts:17) is the client wrapper — the LLD correctly distinguishes the daemon-side accessor from the client wrapper. | none — verified sound |
| c6 | citation | LOW | manual | The daemon calls listRepos at startup around src/daemon/index.ts:127, so the daemon already holds the multi-repo registry. | The daemon owns the registry: listRepos(db) is called at index.ts:234 (startup), 477/482 (repo.list handler), 695, 717, 829, and the repo.list IPC is defined at index.ts:476. The daemon-holds-multi-repo-registry premise is thoroughly confirmed; the cited :127 is main()'s location (which transitively drives these calls), not itself a listRepos line, but the material fact holds. | none — verified sound (daemon-owns-registry corroborated by :234/:476) |
| c7 | external-contract | LOW | manual | INSRC_REPO is only READ (usage), never defined/defaulted in source — it is a static global env baked into MCP registration. | process.env['INSRC_REPO'] is READ at all 8 MCP resolver copies (server:941, render:39, analyze-step:126, review-step:75, triage-step:64, workflow-step start:100/resolve-question:36/review-deferred:29) plus daemon workflow-rpc:321; the only other hits are docs/tests. No definition/default anywhere — static-global-env-only claim confirmed. | none — verified sound |
| c8 | semantic | LOW | manual | The build-step phase call sites (implement.ts, validate.ts) obtain resolveRepoPath by importing it from ../render.js, i.e. they are callers of a single definition, not copies. | build-step/phases/implement.ts:30 and validate.ts:18 both `import { ... resolveRepoPath ... } from '../render.js'` — they are callers of render.ts's single definition, not copies. Confirms the build-step count is one definition (render) with two importers, consistent with the 8-definitions inventory. | none — verified sound |
