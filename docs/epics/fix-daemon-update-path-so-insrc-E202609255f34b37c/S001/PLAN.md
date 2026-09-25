<!-- insrc:artifact PLAN-5f34b37c850e4ffb-S001 -->

# Plan: E202609255f34b37c:S001

**Epic:** `fix-daemon-update-path-so-insrc`
**LLD run:** `wf-1790323317478-a1vll7`
**LLD effective hash:** `5f34b37c850e...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add best-effort runBootSteeringRefresh to steering-inject.ts | S | — | unit: runBootSteeringRefresh re-stamps a MARKED repo file to the stripped skeleton; unit: runBootSteeringRefresh leaves an UNMARKED / absent file untouched (opt-out); unit: runBootSteeringRefresh is idempotent — second run reports 'unchanged', no write; unit: runBootSteeringRefresh swallows readBlock throw / listRepos rejection -> undefined; empty registry -> empty report | [[c1]] [[c2]] |
| 2 | **`t2`** Wire the boot hook into the daemon boot sequence in index.ts | S | `t1` | integration: index.ts imports and calls runBootSteeringRefresh AFTER the reconcile block (source-scan); integration: the boot-hook call is guarded best-effort so a fault cannot abort daemon boot (source-scan) | [[c3]] [[c5]] |
| 3 | **`t3`** Unit + integration tests for the boot hook | M | `t1`, `t2` | unit: boot-steering-refresh.test.ts: all six unit subjects (re-stamp / opt-out / idempotent / readBlock-throw / listRepos-reject / empty-registry); integration: boot-steering-refresh.test.ts: source-scan that index.ts wires the hook after reconcile, guarded | [[c1]] [[c2]] [[c3]] [[c5]] |

### E202609255f34b37c:S001:T001 — Add best-effort runBootSteeringRefresh to steering-inject.ts

Add an exported async runBootSteeringRefresh(deps?: Partial<SteeringRefreshDeps>): Promise<SteeringRefreshReport | undefined> right after refreshSteeringAcrossRepos in src/daemon/steering-inject.ts. It awaits refreshSteeringAcrossRepos(deps) in a try/catch, returns the report on success and undefined on any throw (logging a best-effort warn via the module logger), mirroring runUpdateSteeringRefresh's never-throw contract.

**Acceptance checks:**
- runBootSteeringRefresh is exported with signature (deps?: Partial<SteeringRefreshDeps>) => Promise<SteeringRefreshReport | undefined>
- On success it returns the SteeringRefreshReport from refreshSteeringAcrossRepos(deps)
- On any throw (readBlock/listRepos) it catches, logs a warn, and returns undefined — never rethrows
- tsc --noEmit is clean

### E202609255f34b37c:S001:T002 — Wire the boot hook into the daemon boot sequence in index.ts

Extend the src/daemon/index.ts:16 import from './steering-inject.js' with runBootSteeringRefresh, and add an awaited-but-guarded call to it immediately AFTER the config-reconcile block (locate by content: the reconcileConfigFile() call at ~:204 and its defensive catch ending ~:241). Log the per-file report summary like the reconcile does. Guard so a fault cannot abort boot.

**Acceptance checks:**
- src/daemon/index.ts imports runBootSteeringRefresh from './steering-inject.js'
- runBootSteeringRefresh is called in the boot sequence AFTER the reconcileConfigFile block, guarded so it cannot abort boot
- The call logs a concise per-file refresh summary (refreshed/skipped counts) mirroring the reconcile log
- tsc --noEmit is clean; the daemon boot path still compiles

### E202609255f34b37c:S001:T003 — Unit + integration tests for the boot hook

Add unit tests (src/daemon/__tests__/boot-steering-refresh.test.ts) driving runBootSteeringRefresh over injected listRepos/readFile/writeFile/readBlock seams (guide-strip.test.ts pattern): re-stamp a MARKED file to the stripped skeleton, leave UNMARKED/absent untouched, idempotent unchanged, readBlock-throw->undefined, listRepos-reject->undefined, empty-registry->empty report. Add an integration source-scan test asserting src/daemon/index.ts imports+calls runBootSteeringRefresh AFTER the reconcile block, guarded.

**Acceptance checks:**
- Unit tests cover all six subjects (re-stamp, opt-out, idempotent, readBlock-throw, listRepos-reject, empty-registry) and pass
- The source-scan integration test asserts the index.ts import + call-after-reconcile + best-effort guard and passes
- The full daemon test sweep is green (excluding the preexisting better-sqlite3 native-ABI failure)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| runBootSteeringRefresh returns the per-file report and re-stamps a MARKED repo file to the stripped skeleton (guide-marker-free) when the injected readBlock is the whole canonical asset | `t3` |
| runBootSteeringRefresh leaves an UNMARKED / absent file untouched (REPLACE-ONLY opt-out) | `t3` |
| runBootSteeringRefresh is idempotent: a second run over the already-stamped file reports 'unchanged' and writes nothing | `t3` |
| runBootSteeringRefresh swallows a readBlock throw (missing/empty asset) and returns undefined without throwing | `t3` |
| runBootSteeringRefresh swallows a listRepos rejection and returns undefined without throwing | `t3` |
| runBootSteeringRefresh over an empty registry returns an empty report, no writes | `t3` |
| src/daemon/index.ts imports and calls runBootSteeringRefresh in the boot sequence AFTER the reconcileConfigFile block | `t3` |
| the call is guarded best-effort (inside a try/catch or awaiting the never-throwing wrapper) so it cannot abort boot | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 — runBootSteeringRefresh contract + REPLACE-ONLY opt-out invariant` — "runBootSteeringRefresh(deps?): Promise<SteeringRefreshReport | undefined>; REPLACE-ONLY opt-out (unmarked/absent files untouched)."
- **[[c2]]** `prior-artifact` `LLD S001 — idempotency + never-throw error paths` — "refreshMarkedSection returns 'unchanged' when current (no write); the wrapper swallows throws and returns undefined."
- **[[c3]]** `prior-artifact` `LLD S001 — boot-wiring migration step + best-effort/never-fatal invariant` — "Call runBootSteeringRefresh() in src/daemon/index.ts immediately after the config-reconcile block, awaited-but-guarded so a fault cannot abort boot."
- **[[c5]]** `analyze-bundle` `src/daemon/update-runner.ts + scripts/daemon-ctl.sh + src/daemon/index.ts` — "EVERY update entrypoint terminates in a fresh daemon boot of index.js — making a boot-time hook the single point that covers all paths."
