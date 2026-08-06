<!-- insrc:artifact LLD-914cbf5ea9026b92-s2 -->

# LLD: E20260806914cbf5e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1786031712974-qqqe5k`
**HLD effective hash:** `fd544bcd90a0...`

## HLD context

**Framework:** Pipeline-integrated external-service graph tracing. The graph gains one new node kind (ExternalEndpoint, carrying a protocol + resolved/unresolved tag) and four typed boundary edge kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC), added once to the graph vocabulary and gated by a graph-schema migration so existing indexes evolve without a full re-index. Per-language outbound and inbound detectors run as thin plugins inside the existing tree-sitter parse; a shared protocol-agnostic resolution engine turns indirect/configured targets into a concrete identity (or an explicit unresolved marker) from layered config sources with a fixed precedence. Cross-repo linking is a separate daemon-side matching pass, keyed off a per-repo service-identity registry, that forms a real dependency edge onto the target repo's actual handler entity and inserts it into the DEPENDS_ON closure; the same pass, re-fired on repo register/re-index events, is the out-of-order backfill.
**Rollout phase:** Phase A — Graph foundation + resolution
**Owns:** `sc2` (Target resolution engine)

## Contract details

**Surface level:** internal-shared

### `resolve`

```typescript
resolve(repo: string, protocol: ExternalProtocol, rawExpression: string): ResolvedTarget
```

**Parameters:**
- `repo: string` — The repo root whose at-rest config sources scope resolution (the config entities to draw from). Used only to fetch/cache the repo's merged ConfigSourceMap; the pure resolution core itself takes the map, not the repo.
- `protocol: ExternalProtocol` — The boundary protocol ('http'|'messaging'|'rpc') the caller (s3/s4/s5 detector) already classified; carried straight onto a resolved result so the identity is interpreted as host+path | topic | service.method.
- `rawExpression: string` — The raw outbound-target call expression to pin (a literal, or an interpolation referencing env/config keys).

**Returns:** `ResolvedTarget` — {resolved:true, protocol, identity} when every referenced key pins to a concrete value against the merged, precedence-ordered ConfigSourceMap (ac1); otherwise {resolved:false, rawExpression} (ac2) — never dropped. Matches the sc2 interfaceSketch exactly. Internally, resolve is a thin adapter: it fetches (and memoizes per repo/index pass) the repo's ConfigSourceMap, then delegates to a PURE core that evaluates the expression against the map — so the core is unit-testable with in-memory maps and has no graph dependency.

**Preconditions:**
- The repo's kind==='config' entities are indexed (or, per the s1 .env gotcha, readable at rest by path as a fallback) so the ConfigSourceMap can be built.
- protocol was already determined by the calling detector (sc2 does not classify protocol).

**Postconditions:**
- Pure + deterministic: the same (repo config sources, protocol, rawExpression) always yields the same ResolvedTarget, so a downstream endpoint id (repo + resolved target, k2) is stable across re-index.
- No config source is executed and no runtime/live value participates (k6, lc1): only at-rest config-entity text is read.
- A key defined in multiple layers resolves to the deploy-time(k8s|docker) > envFile > localConfig winner (ac1).

### `listEntitiesForRepo`

```typescript
listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — Daemon-side DB handle (all graph access is daemon/indexer-side, k3).
- `repo: string` — Repo root whose entities are listed; the adapter filters to kind==='config' and reads each entity's body text.

**Returns:** `Promise<Entity[]>` — The repo's domain entities (existing API, src/db/entities.ts). UNCHANGED by S002 — the config-map adapter consumes it read-only to gather config-entity bodies as the resolver's at-rest input; the k8s/docker/.env/localConfig text all arrives via these 'config' entities.

**Preconditions:**
- repo is registered (repo.add contract, k4).

**Postconditions:**
- No mutation; a read-only fetch feeding buildConfigSourceMap.

## Data model changes

### `ResolvedTarget (src/shared/types.ts)` — new

The sc2 result union, shared vocabulary consumed by s3/s4/s5: `{ resolved: true; protocol: ExternalProtocol; identity: string } | { resolved: false; rawExpression: string }`. identity is the concrete host+path | topic | service.method; the unresolved arm preserves the raw expression (ac2). ExternalProtocol is REUSED from S001 (already in shared/types.ts), not re-declared.

```
src/shared/types.ts: + export type ResolvedTarget = { resolved: true; protocol: ExternalProtocol; identity: string } | { resolved: false; rawExpression: string };
```

**Call sites:**
- `src/shared/types.ts`

### `ConfigSourceLayer + ConfigSourceMap (src/shared/types.ts + new resolver module under src/indexer)` — new

ConfigSourceLayer = 'k8s' | 'docker' | 'envFile' | 'localConfig' (the sc2 layer tag). ConfigSourceMap is the internal merged view: each key -> { value: string; layer: ConfigSourceLayer }, produced by folding the four at-rest parsers with the fixed precedence deploy-time(k8s|docker) > envFile > localConfig on a key clash. ConfigSourceLayer is part of the sc2 vocabulary (shared); ConfigSourceMap is an internal detail of the resolver module behind the sc2 boundary.

```
src/shared/types.ts: + export type ConfigSourceLayer = 'k8s' | 'docker' | 'envFile' | 'localConfig';
<new resolver module>: internal type ConfigSourceMap = Map<string, { value: string; layer: ConfigSourceLayer }>
```

**Call sites:**
- `src/shared/types.ts`
- `src/indexer`

### `TargetResolver + at-rest source parsers (new module under src/indexer)` — new

A new resolution module implements sc2: TargetResolver.resolve (the adapter above) + a PURE core resolveAgainst(map, protocol, rawExpression) + four small at-rest text parsers turning a config-entity body into {key,value,layer} — a .env key=value reader (envFile), a Dockerfile ENV + docker-compose environment/env_file reader (docker), a k8s manifest env/data reader (k8s, reading manifest FILES not kubectl), and an in-repo config-default reader (localConfig) — plus the precedence-merge (buildConfigSourceMap) and the expression-evaluation deciding pinnability. All internal to S002; consumers import only resolve + the ResolvedTarget/ConfigSourceLayer types. The k8s layer sourcing from indexed manifest FILES (never the kubectl-executing k8s built-in tool) is the explicit S002-internal refinement of the HLD boundary note, required to keep resolution static/at-rest (k6).

```
<new src/indexer resolution module>: export interface TargetResolver { resolve(repo, protocol, rawExpression): ResolvedTarget }  + internal parsers/merge/eval
```

**Call sites:**
- `src/indexer`
- `src/db/entities.ts`
- `src/indexer/parser/artifact.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns sc2 and implements it verbatim: resolve(repo, protocol, rawExpression) -> ResolvedTarget, with ConfigSourceLayer + the fixed precedence deploy-time(k8s\|docker) > envFile > localConfig, sourced ONLY from at-rest indexed config-entity bodies (.env, Dockerfile/compose, k8s manifest files, in-repo config) — the k8s built-in tool (kubectl) is never invoked (k6/lc1). resolve is a thin repo-scoped adapter over a PURE core evaluated against a pre-built ConfigSourceMap, keeping the resolver unit-testable and deterministic (k2). Downstream outbound detectors s3/s4/s5 call resolve() per detected call-site and create a resolved or unresolved ExternalEndpoint (sc1) from the result; sc2 itself creates no graph nodes. |

## Error paths

### Error cases

- **A config source body is partly malformed — a .env line with no '=', or a k8s/compose YAML document that does not parse.** (recoverable)
  - Detection: The per-source at-rest parser encounters a line it cannot split into key=value, or the YAML reader throws on a document while folding a config-entity body into {key,value,layer} pairs.
  - Response: Best-effort partial parse: skip the offending line/document, keep every well-formed entry from the same source, and never throw out of buildConfigSourceMap — a single bad line never sinks the whole ConfigSourceMap.
  - User impact: Some keys from that one file may be absent, so a target that depended on them resolves {resolved:false} instead of crashing indexing; other targets are unaffected.
- **An interpolation chain does not terminate — a key's value references another key, which references another, possibly cyclically (${A} -> ${B} -> ${A}).** (recoverable)
  - Detection: The expression-evaluation follows a resolved value that still contains an unresolved ${KEY} reference and either exceeds a bounded interpolation depth or re-sees a key already on the current resolution path (cycle).
  - Response: Cycle detection + a fixed max interpolation depth: when the chain cannot reduce to a concrete literal, stop and return {resolved:false, rawExpression} rather than loop or overflow.
  - User impact: The target is recorded unresolved (accurate) rather than hanging the indexer; recall is preserved via the raw expression.
- **The repo has no config entities available yet (indexing incomplete, or the .env-in-ignore-set gotcha dropped the only source).** (recoverable)
  - Detection: buildConfigSourceMap receives an empty kind==='config' entity set from listEntitiesForRepo (and any at-rest path fallback also finds nothing).
  - Response: Build an empty ConfigSourceMap; literal expressions still pin, every indirect expression resolves {resolved:false} — no throw, nothing dropped.
  - User impact: Lower resolution recall until indexing catches up (targets land unresolved, then upgrade on re-index); never a crash.

### Edge cases

| Input | Expected |
| :--- | :--- |
| rawExpression is already a concrete literal (e.g. 'https://api.example.com/v1') with no indirection. | Resolves {resolved:true, protocol, identity: the literal} directly — no config lookup needed; the ConfigSourceMap is consulted only for interpolated references. |
| The same key is defined in BOTH a k8s manifest and a Docker source (two deploy-time layers). | A defined, deterministic intra-deploy-time tie-break applies (the LLD pins k8s over docker) so the winner is stable across runs — the precedence is total, not just deploy-time > env > local. |
| A key is defined only in localConfig (the lowest layer) and nowhere higher. | Resolves from localConfig — the default wins when no k8s/docker/.env layer overrides it (ac1). |
| rawExpression interpolates two keys; one pins from config, the other cannot be found in any layer. | {resolved:false, rawExpression} — a PARTIAL pin is never emitted as resolved; accuracy-first (k5) forbids inventing a half-concrete identity. |
| protocol is 'messaging' and the resolved value is a topic/queue name rather than a URL. | identity carries the concrete topic string as-is; sc2 does not validate identity shape per protocol — it only returns the pinned string, leaving interpretation to the protocol tag. |
| The envFile layer is empty because the repo-root '.env' file was skipped by the indexer ignore filter (the s1 gotcha), while the value exists only in .env. | Either the build's at-rest .env path fallback reads it (still never executed), or — if unresolved — the target lands {resolved:false} rather than silently mis-resolving; behavior is pinned by the build-time verification the LLD flags. |

### Invariants to preserve

- Resolution is static and at-rest: only indexed config-entity text (config + .env + Docker + k8s manifest FILES) is read; no config source is executed and no runtime/live value (e.g. kubectl against a cluster) ever participates — the k8s built-in tool namespace is never invoked at resolution time. [[c5]]
- resolve is pure and deterministic over its inputs: identical (repo config sources, protocol, rawExpression) always yield the identical ResolvedTarget, so the downstream ExternalEndpoint id (repo + resolved target) stays stable across re-index and per-repo dedup holds. [[c1]]
- An un-pinnable target is preserved, never dropped: resolution returns {resolved:false, rawExpression} so the caller can still create an unresolved ExternalEndpoint carrying the raw expression — recall over precision. [[c5]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (matching the existing src/indexer/**/__tests__ suites)`

### Test levels

- **unit** — Prove the pure resolution core (resolveAgainst) over an in-memory ConfigSourceMap: precedence, unresolved fallback, literals, partial pins, and interpolation-chain termination — no graph fixture needed.
  - Subjects: `precedence: a key defined in k8s + envFile + localConfig resolves to the k8s (deploy-time) value; k8s+docker resolves to the pinned intra-deploy-time winner (k8s over docker); envFile beats localConfig (ac1)`, `a concrete literal rawExpression resolves {resolved:true, protocol, identity=literal} with no map lookup`, `an interpolation referencing a key present only in localConfig resolves from the default`, `a two-key interpolation where one key is missing returns {resolved:false, rawExpression} (no partial pin, k5)`, `a cyclic / over-deep interpolation chain terminates and returns {resolved:false} (bounded depth + cycle detection)`, `protocol is carried through onto a resolved identity for http/messaging/rpc without shape validation`
  - Fixtures: `Hand-built in-memory ConfigSourceMap fixtures (key -> {value, layer}) covering single-layer, multi-layer-clash, and missing-key cases`, `A set of rawExpression fixtures: literal, single ${KEY}, multi-key, cyclic`
- **unit** — Prove each at-rest source parser turns a raw config-entity body into the correct {key,value,layer} pairs, and that buildConfigSourceMap folds them with the fixed precedence.
  - Subjects: `.env parser: key=value, quoted values, comments, and a malformed line skipped (best-effort partial parse)`, `Dockerfile ENV parser + docker-compose environment/env_file reader tagged 'docker'`, `k8s manifest env/data reader tagged 'k8s' — reading manifest FILE text, never invoking kubectl`, `in-repo config-default reader tagged 'localConfig'`, `buildConfigSourceMap precedence-merge over multiple parsed sources produces the correct winner per key`, `an unparseable YAML document is skipped without throwing`
  - Fixtures: `Sample config-entity body strings for each source type (.env, Dockerfile, compose, k8s manifest, local config), including one malformed sample each`
- **integration** — Prove the thin daemon-side adapter builds the ConfigSourceMap from a repo's indexed kind==='config' entities and that resolve(repo, ...) returns the same result the pure core does on the equivalent in-memory map — and pin the .env-indexed-or-fallback behavior (the s1 gotcha).
  - Subjects: `adapter fetches kind==='config' entities via listEntitiesForRepo and builds a ConfigSourceMap equal to the hand-built one for the same bodies`, `resolve(repo, protocol, expr) equals resolveAgainst(builtMap, protocol, expr) for a resolved and an unresolved expression`, `the .env source is available to resolution: either a repo-root .env indexes as a config entity, or the at-rest path fallback reads it (build-time verification of the watcher-ignore gotcha)`, `an empty-config repo yields an empty map: literals still pin, indirect exprs resolve unresolved, no throw`
  - Fixtures: `A temp graph store seeded with a small set of config entities (a .env, a k8s manifest, a compose file) via the existing src/db/graph test harness`, `A repo fixture containing a real .env file to exercise the indexed-or-fallback path`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: precedence — multiply-defined key resolves to deploy-time(k8s|docker) > envFile > localConfig winner, and k8s beats docker within deploy-time`, `unit: per-source parsers (.env / Dockerfile+compose / k8s manifest / localConfig) extract the right key->value pairs at rest`, `integration: resolve(repo,…) over a repo's indexed config entities yields the concrete host/topic/service identity, matching the pure core` |
| `ac2` | `unit: a two-key interpolation with one missing key returns {resolved:false, rawExpression} — never a partial pin`, `unit: a cyclic/over-deep interpolation terminates as {resolved:false, rawExpression}`, `integration: an empty-config repo resolves every indirect expression as unresolved (carrying the raw expression), nothing dropped` |

## Alternatives considered

### a1: Pure resolver over a pre-materialized layered ConfigSourceMap (thin daemon-side adapter builds it) — **CHOSEN**

TargetResolver.resolve() is a PURE function over (protocol, rawExpression, a merged ConfigSourceMap); a thin daemon-side adapter builds the map once per repo from the indexed 'config' entities (+ at-rest .env fallback) and the per-source text parsers, applying the fixed precedence at merge time.



### a2: Lazy resolver that queries config entities from the graph inside resolve()

resolve(repo, protocol, rawExpression) directly matches the HLD sketch by querying the repo's config entities from the graph on each call and parsing only the sources the expression references.



**Rejected because:** Reaches ac2/k5/k6 but weakens sc2 — resolve() is no longer pure (queries the graph), so every unit test needs a daemon/graph fixture (against sc2's 'pure resolver' purpose) — and ac1 (per-expression precedence is harder to verify), and re-parses config per call-site (performance NF regression). (s3: partial on sc2 and ac1.)

### a3: Live-source resolution reusing the k8s built-in tool for the k8s layer

Same resolver, but the 'k8s' ConfigSourceLayer is sourced by invoking the k8s built-in tool (kubectl get) against the live cluster rather than reading indexed manifests.



**Rejected because:** Hard-violates k6 (EXECUTES kubectl against a live cluster — not static/at-rest/read-as-text), sc2 (impure, network/tooling-dependent), and k2 (live values are non-deterministic, so the derived endpoint id could change between runs) for no benefit the at-rest manifest read doesn't already give. (s3: violates k6/sc2/k2.)

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace — config sources index as 'config' EntityKind (artifact.ts) + deterministic entity id (shared/types.ts)` — "'.env'/'.env.*' and Dockerfile map to the 'config' EntityKind; k8s/compose YAML too; each config entity carries its raw file text in Entity.body; entity id is deterministic SHA256(repo+file+kind+name)"
- **[[c2]]** `analyze-bundle` `s1 capability.probe — no existing .env/Docker/dotenv parser or URL/topic resolver (manifest.ts only does package deps)` — "parseManifest parses ONLY package-dependency manifests; no dotenv dependency and no endpoint/route/URL-resolution code exists — sc2 writes its own at-rest text parsers."
- **[[c3]]** `analyze-bundle` `s1 security.note — the k8s built-in tool executes kubectl (live); sc2 reads k8s manifest FILES at rest instead` — "k8s_get/etc shell out to kubectl (live, executed) — violates k6; sc2's k8s layer draws from indexed manifest files, never the k8s tool namespace."
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — listEntitiesForRepo/findEntitiesByFile (src/db/entities.ts) fetch a repo's config entities daemon-side` — "listEntitiesForRepo(_db, repo) decodes EntityRow->Entity; the resolver's DB fetch is a thin daemon-side adapter, keeping resolve() pure over in-memory maps."
- **[[c5]]** `analyze-bundle` `s1 usage.example — the '.env' watcher-ignore gotcha (watcher.ts:15 vs artifact.ts config map)` — "'.env' appears in the indexer ignore set while artifact.ts maps '.env' to 'config' — verify .env FILES are indexed, else fall back to an at-rest path read (never executed)."
- **[[c6]]** `prior-artifact` `HLD 914cbf5ea9026b92 — sc2 Target resolution engine (ownedByStory s2; consumed s3/s4/s5)` — "A pure resolver turning an indirect/configured target into a concrete identity or explicit unresolved marker, from layered config sources with a fixed precedence."
- **[[c7]]** `step-output` `s3 alternatives.judge — winner a1 over a2/a3` — "a1 is the only alternative satisfying ac1/ac2/sc2/k2/k3/k5/k6; a2 partial sc2/ac1; a3 violates k6/sc2/k2."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-06T18:41:09.752Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| data-model/config-entities | citation | LOW | auto | src/indexer/parser/artifact.ts maps '.env' and its variants (.env.example/.local/.development/.production) plus Dockerfile to the 'config' EntityKind, and isConfigLang includes 'yaml' and 'dockerfile' so k8s/compose YAML also index as config. | Confirmed: src/indexer/parser/artifact.ts:47 `'.env': 'config'` and isConfigLang at :294 (includes 'yaml'/'dockerfile'/'config'), so .env/Dockerfile/k8s+compose YAML all index as the 'config' EntityKind. Accurate. | None — citation verified. |
| api/listEntitiesForRepo | citation | LOW | auto | listEntitiesForRepo(_db, repo) is an existing exported function in src/db/entities.ts returning the repo's domain entities, consumed read-only by the resolver's config-map adapter. | Confirmed: src/db/entities.ts:761 `export async function listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]>` — exact signature the LLD cites. | None — citation verified. |
| security/k8s-tool-executes | citation | LOW | auto | The k8s built-in tools in src/daemon/tools/builtins/k8s/index.ts shell out to kubectl (a live/executed binary), so they are not usable for at-rest resolution; sc2 must read k8s manifest files instead. | Confirmed: src/daemon/tools/builtins/k8s/index.ts shells out to kubectl (module comment L4, argv `['kubectl','get',...]` L125, spawnError check L136). The at-rest refinement (read manifest files, not the tool) is correctly grounded. | None — citation verified. |
| gotcha/env-ignored | citation | LOW | auto | src/indexer/watcher.ts lists '.env' in its ignore set (around line 15), creating a possible tension with .env files being indexed as config entities that the build must verify. | Confirmed: src/indexer/watcher.ts:15 lists '.env' in the ignore set (and source-roots.ts:246 too). The LLD correctly flags this as a build-time verification for the envFile layer rather than asserting a resolution. | None — citation verified; the gotcha is flagged, not assumed away. |
| data-model/ExternalProtocol-reuse | citation | LOW | auto | ExternalProtocol already exists in src/shared/types.ts (added by S001) and is REUSED by sc2's ResolvedTarget rather than re-declared. | Confirmed: src/shared/types.ts:551 `export type ExternalProtocol = 'http' \| 'messaging' \| 'rpc';` (added by S001). sc2 correctly reuses it rather than re-declaring. | None — citation verified. |
| capability/no-existing-resolver | citation | LOW | auto | src/indexer/manifest.ts (parseManifest) parses only package-dependency manifests and does not read env/URL/topic values, confirming sc2's resolver + at-rest parsers are net-new. | Confirmed: src/indexer/manifest.ts:19 parseManifest dispatches only to parsePackageJson/parseGoMod/etc (package-dependency manifests); no env/URL/topic resolution. sc2's resolver + parsers are correctly net-new. | None — citation verified. |
| cross-artifact/sc2-ownership | cross-artifact | LOW | auto | The HLD (914cbf5ea9026b92) declares sc2 Target resolution engine with ownedByStory s2, which this LLD implements. | The src-scoped evidence engine could not read the HLD artifact (greps hit only test fixtures), so the cross-artifact trace is unverified by this pass. The committed HLD (docs/designs/HLD-work-framed-approved-spec-proceed-from.md) declares sc2 ownedByStory s2 — authored + reviewed + approved this session. Low risk. | None — trace holds per the committed HLD. |
| closed-union/config-layers | closed-union | LOW | auto | ConfigSourceLayer is exactly the four members 'k8s' \| 'docker' \| 'envFile' \| 'localConfig' with the total precedence deploy-time(k8s>docker) > envFile > localConfig. | Confirmed absent by design: ConfigSourceLayer does not yet exist in src — it is the net-new sc2 vocabulary this LLD introduces (four members k8s\|docker\|envFile\|localConfig with a total precedence). Not a defect. | None — new symbol expected to be absent pre-build. |
