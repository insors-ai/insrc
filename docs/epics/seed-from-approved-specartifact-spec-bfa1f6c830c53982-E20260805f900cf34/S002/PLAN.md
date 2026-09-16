<!-- insrc:artifact PLAN-f900cf34c0342d4f-s2 -->

# Plan: E20260806f900cf34:S002

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**LLD run:** `wf-1785934499823-xtpgmp`
**LLD effective hash:** `ddca67745f5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the DaemonCardModel type | S | — | unit: debug-types compile-guard: a fixture builds both DaemonCardModel variants (reachable with all fields, unreachable) and narrows on `reachable` — verified by the suite compiling | [[c1]] [[c2]] |
| 2 | **`t2`** Add daemonStatus() to the DebugService facade + impl | M | `t1` | unit: debug.daemonStatus(): a resolving getStatus stub yields { reachable:true } with uptimeSec/repoCount/repos[]/socket (+pid/version when available); unit: debug.daemonStatus(): a rejecting getStatus stub yields { reachable:false } and never throws; unit: debug.daemonStatus(): unresolvable version / absent pidfile leave version/pid undefined but keep the reachable variant; unit: debug.daemonStatus(): only workspace repos are counted (shared-modules rows excluded) | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the DaemonSection component | M | `t1`, `t2` | unit: DaemonSection: reachable model renders running + formatUptime(uptimeSec) + socket + version/pid (when present) + repo-count with each repo's index state; unit: DaemonSection: { reachable:false } renders a single 'stopped / unreachable' line and NONE of the running fields; unit: DaemonSection: zero-repo reachable model renders repo-count 0 with no per-repo rows; unit: DaemonSection: a repo with status 'indexing'/'error' renders that exact index state (not collapsed to ready); unit: DaemonSection: version/pid lines are omitted when those optional fields are undefined | [[c1]] [[c5]] |
| 4 | **`t4`** Swap the DebugPane 'daemon' placeholder for DaemonSection | S | `t2`, `t3` | integration: DebugPane: selecting the Daemon section renders DaemonSection's running card (not the s1 placeholder) from the injected debug facade; integration: DebugPane: with an unreachable daemonStatus() the Daemon section shows the stopped/unreachable line | [[c1]] [[c6]] |
| 5 | **`t5`** Update the in-repo debug-facade test fakes for daemonStatus | S | `t2` | integration: the CLI suite (tui.test.ts + command.test.ts + DebugPane.test.ts) compiles + all existing assertions still pass with the fakes carrying a daemonStatus stub (regression guard) | [[c7]] |

### E20260806f900cf34:S002:T001 — Add the DaemonCardModel type

Add the DaemonCardModel discriminated-union type to src/cli/services/debug-types.ts (colocated with the sc1 types): `{ reachable: true; uptimeSec: number; repoCount: number; repos: readonly { name: string; status: RegisteredRepo['status'] }[]; socket: string; pid?: number | undefined; version?: string | undefined } | { reachable: false }`. Import RegisteredRepo type from ../../shared/types.js. Additive type surface, referenced by nothing yet.

**Acceptance checks:**
- DaemonCardModel is a discriminated union keyed on `reachable`
- the reachable variant carries uptimeSec/repoCount/repos[]/socket + optional pid/version; repos[].status reuses RegisteredRepo['status']
- the unreachable variant is exactly { reachable: false } (no running fields)
- tsc compiles the new type

### E20260806f900cf34:S002:T002 — Add daemonStatus() to the DebugService facade + impl

Add `daemonStatus(): Promise<DaemonCardModel>` to the DebugService interface (debug-types.ts) and implement it in src/cli/services/debug.ts: delegate to getStatus() (from ./daemon.js) for uptime/repos (count only workspace repos), attach socket=PATHS.sockFile, pid from PATHS.pidFile (existsSync-guarded, parse numeric), and best-effort version from join(DAEMON_ROOT,'package.json').version (catch to undefined). Catch any getStatus reject and RESOLVE to { reachable:false } (never throw). Bind `daemonStatus: debug.daemonStatus` onto the existing makeServices() debug entry in src/cli/services/index.ts. Additive; `sections` unchanged. Build note (s3 critique): land t2 together-with t5 in one increment so the CLI suites compile at every committed step.

**Acceptance checks:**
- DebugService interface gains `daemonStatus(): Promise<DaemonCardModel>`; `sections` + sibling facades unchanged
- debug.daemonStatus() resolves { reachable:true } with uptimeSec/repoCount/repos[]/socket (+pid/version when available) on a successful getStatus
- debug.daemonStatus() resolves { reachable:false } and never throws when getStatus rejects
- only workspace repos are counted (shared-modules rows excluded); version/pid degrade to undefined when unresolvable
- makeServices().debug.daemonStatus is bound; tsc compiles

### E20260806f900cf34:S002:T003 — Add the DaemonSection component

Add the DaemonSection component (src/cli/panes/, e.g. DaemonSection.tsx or colocated in panes/debug/) taking `{ services: { readonly debug: DebugService } }`. Drive debug.daemonStatus() via a useEffect+useState once-fetch (mirroring useDaemonStatus's pollMs=0 once pattern) and render inside a Box/Text: reachable -> running + formatUptime(uptimeSec) (from ../ui/format.js) + socket + version/pid (rendered only when present, omitted when undefined) + repo-count with each repo's index state; unreachable -> a single 'stopped / unreachable' line. Read-only, no useInput/keys (k5).

**Acceptance checks:**
- DaemonSection reachable model renders running + uptime (formatUptime) + socket + version/pid (when present) + repo-count with each repo's index state
- the version/pid lines are OMITTED when those optional fields are undefined (graceful degradation)
- DaemonSection { reachable:false } renders a single 'stopped / unreachable' line and NONE of the running fields
- zero-repo reachable model renders repo-count 0 with no per-repo rows; an 'indexing'/'error' repo renders that exact status
- the component registers no keybindings (read-only, k5); tsc compiles

### E20260806f900cf34:S002:T004 — Swap the DebugPane 'daemon' placeholder for DaemonSection

In src/cli/panes/DebugPane.tsx, replace the SECTION_VIEWS['daemon'] placeholder entry with `() => <DaemonSection services={{ debug: props.services.debug }} />` (the DebugPane already holds the debug facade via DebugPaneProps). The 'mcp'/'logs' placeholders + the section-hosting shape/navigation stay unchanged.

**Acceptance checks:**
- selecting the Daemon section renders DaemonSection (not the s1 placeholder) fed the debug facade
- the 'mcp'/'logs' placeholders and DebugPane navigation/hosting are unchanged
- tsc compiles + existing s1 DebugPane tests still pass (aside from the daemon-section body change)

### E20260806f900cf34:S002:T005 — Update the in-repo debug-facade test fakes for daemonStatus

Update every in-repo `debug` facade fake to add a conformant `daemonStatus: async () => (...)` stub so the widened DebugService compiles: fakeServices() in src/cli/__tests__/tui.test.ts, the ctxWith base in src/cli/__tests__/command.test.ts, and the `{ debug: { sections } }` props built in src/cli/panes/__tests__/DebugPane.test.ts. Build note (s3 critique): apply together-with t2 in ONE increment (mirrors s1's t2+t5 lockstep) so the CLI suites compile at every committed step; dependsOn stays [t2] (the true compile dependency).

**Acceptance checks:**
- every in-repo debug-facade fake includes a daemonStatus stub returning a valid DaemonCardModel
- `npx tsx --test 'src/cli/**/*.test.ts'` compiles against the widened DebugService
- no existing assertion behaviour changes beyond the additive daemonStatus stub

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| debug.daemonStatus(): a resolving getStatus stub yields { reachable:true } with uptimeSec/repoCount/repos[]/socket (+pid/version when available) | `t2` |
| debug.daemonStatus(): a rejecting getStatus stub yields { reachable:false } and never throws | `t2` |
| debug.daemonStatus(): unresolvable version / absent pidfile leave version/pid undefined but keep the reachable variant | `t2` |
| debug.daemonStatus(): only workspace repos are counted (shared-modules rows excluded) | `t2` |
| DaemonSection: reachable model renders running + formatUptime(uptimeSec) + socket + version/pid (when present) + repo-count with each repo's index state | `t3` |
| DaemonSection: { reachable:false } renders a single 'stopped / unreachable' line and NONE of the running fields | `t3` |
| DaemonSection: zero-repo reachable model renders repo-count 0 with no per-repo rows | `t3` |
| DaemonSection: a repo with status 'indexing'/'error' renders that exact index state (not collapsed to ready) | `t3` |
| DebugPane: selecting the Daemon section renders DaemonSection's running card (not the s1 placeholder) from the injected debug facade | `t4` |
| DebugPane: with an unreachable daemonStatus() the Daemon section shows the stopped/unreachable line | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 interactionWithShared sc1 + contractDetails (DebugService.daemonStatus / DaemonSection consume the sc1 facade + DebugPane hosting)`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails DaemonCardModel + getStatus/DaemonStatus (daemon.status IPC read; RegisteredRepo['status'])`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — client-known fields: PATHS.sockFile (paths.ts:19) + PATHS.pidFile (paths.ts:18) read client-side, existsSync-guarded`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — best-effort version source: DAEMON_ROOT (src/cli/services/maintenance.ts:34 = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon) join package.json .version, catch to undefined`
- **[[c5]]** `analyze-bundle` `s1 usage.example — DaemonPane health-render idiom + formatUptime (src/cli/ui/format.ts:18) + useDaemonStatus once-fetch (pollMs=0) pattern the DaemonSection mirrors`
- **[[c6]]** `prior-artifact` `LLD s2 dataModelChanges — DebugPane SECTION_VIEWS['daemon'] field-modify (swap the s1 placeholder for DaemonSection), src/cli/panes/DebugPane.tsx`
- **[[c7]]** `analyze-bundle` `s1 test.locate — in-repo `debug` facade fakes (tui.test.ts fakeServices, command.test.ts ctxWith, DebugPane.test.ts props) that must add a daemonStatus stub for the widened interface to compile`
