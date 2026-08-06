<!-- insrc:artifact PLAN-914cbf5ea9026b92-s2 -->

# Plan: E20260806914cbf5e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1786041138619-48wpj1`
**LLD effective hash:** `fd544bcd90a0...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ResolvedTarget + ConfigSourceLayer shared types (reuse ExternalProtocol) | S | — | unit: type-surface: ResolvedTarget discriminates on `resolved`; ConfigSourceLayer has exactly 'k8s'\\|'docker'\\|'envFile'\\|'localConfig' (frozen-vocabulary fixture); ExternalProtocol reused from S001 | [[c1]] [[c2]] |
| 2 | **`t2`** At-rest config-source parsers + buildConfigSourceMap (path-read, total precedence) | L | `t1` | unit: .env parser: key=value, quoted values, comments, and a malformed line skipped (best-effort partial parse); unit: Dockerfile ENV parser + docker-compose environment/env_file reader tagged 'docker'; unit: k8s manifest env/data reader tagged 'k8s' via js-yaml — reading manifest FILE text, never invoking kubectl; an unparseable YAML document is skipped without throwing; unit: in-repo config-default reader tagged 'localConfig'; unit: buildConfigSourceMap precedence-merge: a multiply-defined key resolves to the k8s > docker > envFile > localConfig winner | [[c2]] [[c3]] |
| 3 | **`t3`** Pure resolution core resolveAgainst(map, protocol, rawExpression) | M | `t1` | unit: a concrete literal rawExpression resolves {resolved:true, protocol, identity=literal} with no map lookup; unit: an interpolation referencing a key present only in localConfig resolves from the default; unit: a two-key interpolation where one key is missing returns {resolved:false, rawExpression} (no partial pin, k5); unit: a cyclic / over-deep interpolation chain terminates and returns {resolved:false} (bounded depth + cycle detection); unit: protocol is carried through onto a resolved identity for http/messaging/rpc without shape validation; unit: precedence via resolveAgainst: a key defined in k8s + envFile + localConfig resolves to the k8s value; k8s+docker resolves to k8s (deploy-time tie-break); envFile beats localConfig (ac1) | [[c1]] [[c4]] |
| 4 | **`t4`** Daemon-side resolve(repo, protocol, rawExpression) adapter + config-file discovery (incl. .env at-rest scan) | M | `t2`, `t3` | integration: adapter fetches kind==='config' entities via listEntitiesForRepo and builds a ConfigSourceMap equal to the hand-built one for the same bodies; resolve(repo,protocol,expr) equals resolveAgainst(builtMap,protocol,expr) for a resolved and an unresolved expression; integration: the .env source is available to resolution via the at-rest path scan (real .env fixture) even though .env is not indexed — read as text, never executed; integration: an empty-config repo yields an empty map: literals still pin, indirect exprs resolve unresolved, no throw | [[c1]] [[c3]] [[c5]] |

### E20260806914cbf5e:S002:T001 — Add ResolvedTarget + ConfigSourceLayer shared types (reuse ExternalProtocol)

In src/shared/types.ts add `export type ResolvedTarget = { resolved: true; protocol: ExternalProtocol; identity: string } | { resolved: false; rawExpression: string }` and `export type ConfigSourceLayer = 'k8s' | 'docker' | 'envFile' | 'localConfig'`, reusing the existing ExternalProtocol (added by S001, types.ts:551). These are the sc2 shared vocabulary consumed by s3/s4/s5. Scaffold the new module dir src/indexer/target-resolution/ with an internal `type ConfigSourceMap = Map<string, { value: string; layer: ConfigSourceLayer }>` (not shared).

**Acceptance checks:**
- src/shared/types.ts exports ResolvedTarget (discriminated on resolved) and ConfigSourceLayer with exactly the four members; ExternalProtocol is reused, not re-declared
- src/indexer/target-resolution/ exists with the internal ConfigSourceMap type
- tsc compiles

### E20260806914cbf5e:S002:T002 — At-rest config-source parsers + buildConfigSourceMap (path-read, total precedence)

In src/indexer/target-resolution/config-sources.ts write four at-rest text parsers, each producing {key,value,layer} from a config source's FULL text read by PATH (not the truncated 8KB entity.body): a .env key=value reader (envFile), a Dockerfile ENV + docker-compose environment/env_file reader (docker), a k8s manifest env/data reader via js-yaml load/loadAll (k8s), and an in-repo config-default reader (localConfig). buildConfigSourceMap(configFiles) reads each file at rest (fs, never executed; guard MAX_SIZE), parses best-effort (skip a malformed line / unparseable YAML doc without throwing), and folds all into one ConfigSourceMap with the single TOTAL precedence order k8s > docker > envFile > localConfig on a key clash (so the k8s-over-docker intra-deploy-time tie-break is explicit, matching the LLD edge case). Kept as one cohesive task — the four parsers share buildConfigSourceMap + the precedence rule.

**Acceptance checks:**
- each parser (.env / Dockerfile+compose / k8s manifest / localConfig) extracts the correct key->value pairs from a sample body of its type and tags the right layer; a malformed .env line / unparseable YAML doc is skipped without throwing
- buildConfigSourceMap folds multiple sources with the single total precedence k8s > docker > envFile > localConfig (k8s beats docker within deploy-time; deploy-time beats envFile beats localConfig)
- all reads are at-rest fs reads by path (js-yaml load; no kubectl, no execution)

### E20260806914cbf5e:S002:T003 — Pure resolution core resolveAgainst(map, protocol, rawExpression)

In src/indexer/target-resolution/resolver.ts write the PURE core resolveAgainst(map: ConfigSourceMap, protocol: ExternalProtocol, rawExpression: string): ResolvedTarget: a literal (no ${...}) resolves {resolved:true, protocol, identity=literal} with no lookup; an interpolation is expanded against the map with a bounded max-depth + cycle detection; if every referenced key pins to a concrete value => {resolved:true, protocol, identity}; a missing key, a partial pin, or a non-terminating chain => {resolved:false, rawExpression}. No graph/fs dependency — pure over its args, deterministic.

**Acceptance checks:**
- a literal resolves true with identity=the literal; a fully-pinned interpolation resolves true with the substituted identity
- a missing key OR a two-key expr with one key missing => {resolved:false, rawExpression} (no partial pin)
- a cyclic / over-deep interpolation terminates (bounded depth + cycle set) and returns {resolved:false, rawExpression}
- resolveAgainst has no import of the db/graph or fs — pure over (map, protocol, rawExpression)

### E20260806914cbf5e:S002:T004 — Daemon-side resolve(repo, protocol, rawExpression) adapter + config-file discovery (incl. .env at-rest scan)

In src/indexer/target-resolution/resolver.ts add the sc2 adapter resolve(repo, protocol, rawExpression): it discovers the repo's config source files by fetching kind==='config' entities via listEntitiesForRepo (src/db/entities.ts) and collecting their .file paths, PLUS scans the repo for .env* files at rest by path (which are NOT indexed — gitignore + IGNORE_SET, the confirmed gotcha), builds+memoizes the repo's ConfigSourceMap via buildConfigSourceMap, and delegates to resolveAgainst. Per-repo memoization keyed by repo so N call-sites share one build. Consumers import only resolve + the shared types.

**Acceptance checks:**
- resolve(repo,protocol,expr) === resolveAgainst(builtMap,protocol,expr) for the same config sources (a resolved and an unresolved case)
- the adapter discovers config files via listEntitiesForRepo(kind==='config').file AND reads repo-root/.env* at rest by path — proven by a dedicated integration test with a real .env fixture (the .env-not-indexed gotcha handled, never executed)
- the built ConfigSourceMap is memoized per repo (one build shared across calls); an empty-config repo yields an empty map with no throw

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| precedence: a key defined in k8s + envFile + localConfig resolves to the k8s (deploy-time) value; k8s+docker resolves to the pinned intra-deploy-time winner (k8s over docker); envFile beats localConfig (ac1) | `t3`, `t2` |
| a concrete literal rawExpression resolves {resolved:true, protocol, identity=literal} with no map lookup | `t3` |
| an interpolation referencing a key present only in localConfig resolves from the default | `t3` |
| a two-key interpolation where one key is missing returns {resolved:false, rawExpression} (no partial pin, k5) | `t3` |
| a cyclic / over-deep interpolation chain terminates and returns {resolved:false} (bounded depth + cycle detection) | `t3` |
| protocol is carried through onto a resolved identity for http/messaging/rpc without shape validation | `t3` |
| .env parser: key=value, quoted values, comments, and a malformed line skipped (best-effort partial parse) | `t2` |
| Dockerfile ENV parser + docker-compose environment/env_file reader tagged 'docker' | `t2` |
| k8s manifest env/data reader tagged 'k8s' — reading manifest FILE text, never invoking kubectl | `t2` |
| in-repo config-default reader tagged 'localConfig' | `t2` |
| buildConfigSourceMap precedence-merge over multiple parsed sources produces the correct winner per key | `t2` |
| an unparseable YAML document is skipped without throwing | `t2` |
| adapter fetches kind==='config' entities via listEntitiesForRepo and builds a ConfigSourceMap equal to the hand-built one for the same bodies | `t4` |
| resolve(repo, protocol, expr) equals resolveAgainst(builtMap, protocol, expr) for a resolved and an unresolved expression | `t4` |
| the .env source is available to resolution: either a repo-root .env indexes as a config entity, or the at-rest path fallback reads it (build-time verification of the watcher-ignore gotcha) | `t4` |
| an empty-config repo yields an empty map: literals still pin, indirect exprs resolve unresolved, no throw | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contract: sc2 ResolvedTarget/ConfigSourceLayer + resolve(repo,protocol,rawExpression) (src/shared/types.ts)` — "ResolvedTarget = {resolved:true,protocol,identity} | {resolved:false,rawExpression}; ConfigSourceLayer = k8s|docker|envFile|localConfig; resolve is pure over a pre-built ConfigSourceMap, deterministic"
- **[[c2]]** `analyze-bundle` `s1 PlanContext capability.ground + data-model.trace: no existing resolver; js-yaml available; shared types home` — "manifest.ts parses only package deps — sc2's parsers are net-new; js-yaml ^4.1.0 is a dependency; new module home src/indexer/target-resolution/; ExternalProtocol reused from S001 (types.ts:551)."
- **[[c3]]** `analyze-bundle` `s1 PlanContext data-model.ground: config entity body truncated to 8KB — read config FILES at rest by path; k8s tool executes kubectl (not usable)` — "MAX_BODY=8192 truncates entity.body — read the config file's full text at rest by path; the k8s built-in tool shells out to kubectl (executed) so sc2 reads k8s manifest FILES instead (k6)."
- **[[c4]]** `analyze-bundle` `s1 PlanContext symbol.locate: listEntitiesForRepo (src/db/entities.ts:761) feeds the pure resolveAgainst core` — "listEntitiesForRepo(_db, repo) enumerates the repo's entities daemon-side; resolveAgainst stays pure over the built map with no graph/fs dependency."
- **[[c5]]** `analyze-bundle` `s1 PlanContext data-model.ground: CONFIRMED .env files are NOT indexed (git ls-files --exclude-standard + IGNORE_SET) — read .env at rest by path` — "repo-root .env is dropped by .gitignore + hasIgnoredSegment (IGNORE_SET contains '.env'); the envFile layer must scan + read .env files at rest by path, never executed."
