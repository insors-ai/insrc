<!-- insrc:artifact LLD-ba132c185fe45860-s1 -->

# LLD: E20260923ba132c18:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790165706650-c3lbx6`
**HLD effective hash:** `3fb0b2204d88...`

## HLD context

**Framework:** The Epic adds a single read-only daemon capability that answers 'which models can I pick for provider X', plus the two thin plugin surfaces that render it as an authoritative dropdown for the global model tiers. The daemon is the sole proxy: it revives the offline-stubbed model-listing entry as ONE new read-only IPC handler that dispatches per provider — for ollama a live local query through the existing ollama provider, for cli-claude/cli-codex a curated JSON catalog shipped as a daemon asset (copied by copy-assets.mjs, loaded + validated at boot the way the docgen asset validator does) — and returns the provider's model list plus an explicit availability signal, without ever making a direct cloud REST call. Both plugins are provider-agnostic consumers of that one contract over the already-shipped shared ipc-client: VS Code adds an 'insrc: Set model tier' QuickPick command, JetBrains turns its Settings-page model field into an inline combo + Refresh. Every empty/error/'(current, not in catalog)'/clear-on-provider-switch behaviour is expressed once over the daemon's returned list, so neither plugin carries per-provider logic. The tier runner enum is reused unchanged and the catalog stays out of the user-config reconcile system.
**Rollout phase:** Phase A — daemon capability (catalog + list-models IPC)
**Owns:** `sc1` (CuratedCatalog)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: How the handler dispatches per provider, the concrete live ollama model query (how it reaches ollama and maps its response), how it determines the availability signal, and how it reads the curated catalog via sc1 are private. Only the read-only listModels IPC method + its ModelListResult shape (sc2) are exposed; the handler mutates nothing. — owns `sc2`
- `s3`: The 'insrc: Set model tier' QuickPick command flow (tier → provider → model), the empty-state/Refresh/'(current, not in catalog)'/clear-on-provider-switch presentation, and writing the chosen model to the native tier setting are private to S003. It consumes only sc2 over the shared client; it adds no shared contract.
- `s4`: The JetBrains Settings-page inline model combo + Refresh button, the same empty-state/'(current, not in catalog)'/clear-on-provider-switch behaviour, and writing the tier's model field on apply are private to S004. It consumes only sc2 over the DaemonGateway; it adds no shared contract.

## Contract details

**Surface level:** internal-shared

### `CuratedCatalog`

```typescript
interface CuratedCatalog { modelsFor(provider: CloudProvider): readonly CatalogModel[] }
```

**Returns:** `CuratedCatalog` — The sc1 accessor S001 owns and exposes to S002: an in-memory view over the validated, boot-loaded catalog. Holds no I/O per call (reads the frozen parsed map).

**Preconditions:**
- The catalog has been loaded + validated at boot (validateModelCatalog ran without throwing) before any modelsFor call.

**Postconditions:**
- Returns the same frozen arrays for the life of the daemon process; never triggers a cloud REST call or a config read.

### `modelsFor`

```typescript
modelsFor(provider: CloudProvider): readonly CatalogModel[]
```

**Parameters:**
- `provider: CloudProvider ('cli-claude' | 'cli-codex')` — The cloud provider whose curated selectable models to return. Only the two cloud providers are catalogued here; ollama is S002's live-query branch, not sc1.

**Returns:** `readonly CatalogModel[]` — The curated models for that provider from the loaded catalog; an empty array only when the catalog legitimately omits the provider (never a fabricated or cloud-fetched list).

**Preconditions:**
- provider is one of the two CloudProvider values (the caller, S002, dispatches ollama separately and never passes it here).

**Postconditions:**
- Pure read: mutates no config/provider state (k1/observability); returns a frozen readonly array.

### `validateModelCatalog`

```typescript
function validateModelCatalog(): Promise<void>
```

**Returns:** `Promise<void>` — Resolves when the shipped catalog asset loads + schema-validates cleanly; otherwise throws (never resolves with a bad catalog). Mirrors validateDocgenAssets (src/docgen/asset-validator.ts) exactly.

**Errors:**
- `ModelCatalogValidationError` when The catalog asset is MISSING (not present at the shipped path) or MALFORMED/schema-invalid (not JSON, missing `version`, `providers` not an object with the two cloud-provider keys, or an entry not { id:string, displayName?:string }). The thrown message names the file + a one-line copy-assets Fix: hint, mirroring DocgenAssetValidationError; it re-raises to the daemon top-level fatal handler (fail-fast boot refusal).

**Preconditions:**
- Invoked in the daemon boot sequence as a sibling of validateDocgenAssets (src/daemon/index.ts, immediately after the :313 await), before the daemon begins serving IPC.

**Postconditions:**
- On success, the validated parse is cached (frozen) so the CuratedCatalog accessor serves it without re-reading disk; on failure the daemon does not start (ac1).

### `getCuratedCatalog`

```typescript
function getCuratedCatalog(): CuratedCatalog
```

**Returns:** `CuratedCatalog` — Returns the singleton CuratedCatalog accessor over the boot-validated, frozen catalog. This is the concrete handle S002 (sc2) obtains to read cloud models.

**Errors:**
- `Error` when Called before validateModelCatalog populated the cache (defensive; in normal boot order it is always populated first). Signals a boot-ordering bug rather than a bad catalog.

**Preconditions:**
- validateModelCatalog has run at boot.

**Postconditions:**
- Returns a stable accessor; repeated calls return an equivalent read-only view.

## Data model changes

### `CloudModelCatalogFile` — new

The on-disk JSON asset shape (the sc1 file contract), shipped under src/assets/ (e.g. src/assets/models/cloud-model-catalog.json) and copied to out/assets/ by copy-assets.mjs via its existing 'assets' DIRS membership (no DIRS change). Top-level { version:number, providers: { 'cli-claude': CatalogModel[], 'cli-codex': CatalogModel[] } }. Maintainer-curated, git-reviewed, NOT user-editable and NOT in the config-reconcile system (lc1/k5). Adding a model (ac2) = editing this one file + shipping a daemon update.

```
+ src/assets/models/cloud-model-catalog.json : { version: number, providers: { 'cli-claude': CatalogModel[], 'cli-codex': CatalogModel[] } }
```

**Call sites:**
- `copy-assets.mjs:28 (assets DIRS membership ships it)`
- `src/daemon/index.ts:313 (boot validation hook, sibling of validateDocgenAssets)`

### `CatalogModel` — new

A single catalogued model entry: { id: string; displayName?: string }. id is the exact model identifier a tier's `model` field is set to; displayName is an optional human label the pickers may show. Defined once here as part of the sc1 contract and consumed by S002.

```
+ interface CatalogModel { readonly id: string; readonly displayName?: string }
```

**Call sites:**
- `consumed by S002's sc2 list-models dispatch (adjacent boundary; reference only, not modified here)`

### `CloudProvider` — new

type CloudProvider = 'cli-claude' | 'cli-codex' — the two cloud providers the catalog covers, a subset of the reused runner enum ['ollama','cli-claude','cli-codex'] (k3). ollama is intentionally excluded: it is S002's live-query branch, not a curated-catalog provider.

```
+ type CloudProvider = 'cli-claude' | 'cli-codex'
```

**Call sites:**
- `modelsFor(provider) parameter`
- `src/config/analyze.ts:88 (the AnalyzeShaperProviderKind superset enum, reused unchanged — reference only)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 is the declared owner of sc1 (CuratedCatalog) in the HLD. It implements sc1 in full: the on-disk CloudModelCatalogFile shape (CatalogModel + the two-provider providers object with a top-level version), the boot-time validateModelCatalog loader/validator that fail-fast throws on a missing/malformed asset (ac1), and the getCuratedCatalog()/modelsFor(provider) accessor over the frozen validated parse. S002 (sc2, adjacent) is the sole consumer: it obtains the accessor and calls modelsFor for its cloud-provider branch. S001 exposes ONLY the accessor + file shape; the file path, copy-assets membership, boot-wiring line, schema-validation internals, and the actual curated model entries stay private to S001 (boundary.internal). |

## Error paths

### Error cases

- **The catalog asset is missing from the shipped build (mis-staged: not copied into out/assets/, or removed).** (terminal)
  - Detection: validateModelCatalog attempts to read the catalog at its known shipped path during daemon boot and the file read fails (does-not-exist); the loader treats a read failure as a hard fault, not an empty catalog.
  - Response: Throw ModelCatalogValidationError whose message names the missing file + a one-line copy-assets Fix: hint (mirroring DocgenAssetValidationError). The error re-raises to the daemon top-level fatal handler, which logs + exits — the daemon refuses to start.
  - User impact: The daemon fails fast at startup with a precise, actionable message rather than silently serving an empty cloud model list later; a mis-built/mis-staged install is caught immediately (ac1).
- **The catalog asset is malformed — not valid JSON, or valid JSON that fails the schema (missing `version`, `providers` not an object with the two cloud-provider keys, or an entry not { id:string, displayName?:string }).** (terminal)
  - Detection: validateModelCatalog JSON-parses the file (parse throws on non-JSON) and then structurally checks the parsed value against the CloudModelCatalogFile schema; the first structural failure short-circuits the remaining checks (mirrors the docgen malformed-manifest branch).
  - Response: Throw ModelCatalogValidationError naming the file and the specific schema failure; re-raise to the top-level fatal handler (fail-fast boot refusal). No partial/coerced catalog is cached.
  - User impact: A bad catalog edit is caught at boot with a message pinpointing the fault, never a half-loaded list; the maintainer fixes the JSON and re-ships (ac1).
- **getCuratedCatalog() is called before validateModelCatalog populated the cache (a boot-ordering regression).** (terminal)
  - Detection: getCuratedCatalog finds the cached validated parse unset (null/undefined sentinel).
  - Response: Throw a plain Error stating the catalog accessor was requested before boot validation ran — signalling a daemon boot-ordering bug (distinct from a bad catalog), surfaced in the daemon log.
  - User impact: Internal-only: indicates the boot wiring regressed; never reached in correct boot order. Caught in tests + at first use rather than returning a silently-empty accessor.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A well-formed catalog whose `providers` object omits one cloud provider entirely (e.g. only 'cli-claude' present). | Validation PASSES (a provider may legitimately have zero catalogued models); modelsFor for the omitted provider returns an empty readonly array — the sc1-documented 'empty only if the catalog omits it' case, distinct from a load error. |
| A well-formed catalog where a provider's array is present but empty ([]). | Validation passes; modelsFor(provider) returns an empty readonly array. (S002/the pickers render this as 'no models available' — but that presentation is S002/S003/S004 scope, not S001.) |
| A CatalogModel entry with an `id` but no `displayName`. | Valid: displayName is optional. The entry is returned as-is with displayName undefined. |
| The catalog carries a model id that is no longer offered by the provider, or an unknown/future id. | S001 does NOT validate ids against any live provider (that would require a cloud call, k1). Any well-formed { id, displayName? } passes; curation correctness is the maintainer's responsibility per lc1. Returned verbatim. |
| modelsFor is asked about ollama. | Out of scope for sc1: CloudProvider is only 'cli-claude'\|'cli-codex' and the type system excludes ollama; S002 dispatches ollama to its own live-query branch and never passes it to modelsFor. Not an S001 code path. |

### Invariants to preserve

- A shipped runtime asset is loaded + validated at daemon boot and a missing/malformed asset is a fail-fast startup refusal that re-raises to the top-level fatal handler — never a silent runtime fallback. S001's catalog validator preserves this exact idiom established by validateDocgenAssets (src/docgen/asset-validator.ts) + validateAnalyzePrompts, invoked in the src/daemon/index.ts:303-313 boot block. [[c4]]
- Cloud (cli-claude/cli-codex) model lists come only from the curated in-repo asset; no code path in the catalog loader or accessor makes a direct cloud REST/provider-API call. This preserves the no-direct-cloud-REST invariant (the reason the pre-existing Anthropic-SDK claude.models fallback is NOT reused). [[c1]]
- The catalog is a maintainer-curated asset outside the user-config reconcile system: it is not read from or written to ~/.insrc/config.json and is not carried through CONFIG_CATALOG/reconcile-on-boot. The daemon's config.json remains the sole source of truth for what IS selected; the catalog only says what MAY be selected (lc1/k5). [[c5]]

## Test strategy

**Test framework:** `node:test (tsx --test), colocated under src/**/__tests__/*.test.ts — matching src/docgen/__tests__/asset-validator.test.ts and src/analyze/context/__tests__/boot-validator.test.ts`

### Test levels

- **unit** — Exercise validateModelCatalog's branches (pass / missing / malformed / schema-invalid) and the modelsFor accessor over a loaded catalog, staging a fake asset dir per case — mirroring the docgen asset-validator.test.ts pattern.
  - Subjects: `validateModelCatalog: valid catalog fixture -> resolves, caches the frozen parse`, `validateModelCatalog: removed/absent catalog file -> throws ModelCatalogValidationError naming the file + a copy-assets Fix: line`, `validateModelCatalog: non-JSON file -> throws (parse failure) naming the file`, `validateModelCatalog: schema-invalid (missing version / providers not the two-key object / entry missing id / id not a string) -> throws naming the specific failure, short-circuits`, `modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog -> returns the curated readonly arrays`, `modelsFor for a provider omitted from the catalog -> returns an empty readonly array (not an error)`, `getCuratedCatalog before validateModelCatalog populated the cache -> throws the boot-ordering Error`
  - Fixtures: `a tmpAssetDir helper staging a fake catalog file per case (mirror src/docgen/__tests__/asset-validator.test.ts:35)`, `a valid CloudModelCatalogFile JSON fixture (both providers populated + a provider-omitted variant + a provider-empty-array variant)`, `malformed fixtures: a non-JSON file, and schema-invalid JSON variants (no version, bad providers shape, entry without id)`
- **contract** — Assert the on-disk shape S002 consumes (sc1) holds: the shipped catalog asset parses to CloudModelCatalogFile and modelsFor returns CatalogModel[] with id:string (+ optional displayName), so S002 can rely on the contract verbatim.
  - Subjects: `the actual shipped src/assets/models/cloud-model-catalog.json validates against the CloudModelCatalogFile schema (the real curated asset, not a fixture)`, `every entry in the shipped catalog has a string id; displayName when present is a string`
  - Fixtures: `the real shipped catalog asset resolved at its out/assets path (or src/assets during test)`
- **integration** — Confirm the boot-sequence wiring: validateModelCatalog is invoked in the daemon boot block alongside validateDocgenAssets, and a missing/malformed catalog aborts boot (re-raises) rather than starting a degraded daemon.
  - Subjects: `daemon boot with a valid catalog present -> boot proceeds past the validation step`, `daemon boot with the catalog removed/malformed -> boot throws and does not begin serving IPC (fail-fast)`
  - Fixtures: `a boot harness or a direct call of the boot validation block with a controllable catalog path (mirror src/analyze/context/__tests__/boot-validator.test.ts)`
- **smoke** — Guard the packaging invariant: the curated catalog JSON is actually copied by copy-assets into out/assets so an installed build ships it (ac2's 'ship a daemon update' path).
  - Subjects: `after `npm run build` (or a copy-assets run), the catalog file exists under out/assets/ at the path validateModelCatalog reads`
  - Fixtures: `a build/out directory (or a copy-assets invocation over a temp src/out pair)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `validateModelCatalog: removed/absent catalog file -> throws ModelCatalogValidationError naming the file + a copy-assets Fix: line`, `validateModelCatalog: non-JSON file -> throws naming the file`, `validateModelCatalog: schema-invalid variants -> throw naming the specific failure`, `daemon boot with the catalog removed/malformed -> boot throws and does not begin serving IPC (fail-fast)` |
| `ac2` | `after `npm run build` the catalog file exists under out/assets/ at the path validateModelCatalog reads (a maintainer edit ships with a daemon update, no code/plugin change)`, `modelsFor over a catalog fixture with an added model returns that model (a catalog edit is reflected with no other change)`, `the actual shipped catalog validates against the CloudModelCatalogFile schema` |
| `ac3` | `modelsFor('cli-claude') / modelsFor('cli-codex') return exactly the curated in-repo entries (source is the asset, nothing else)`, `unit + accessor tests make no network/provider call — the loader/accessor have no cloud-REST code path (no HTTP client is constructed or invoked)` |

## Migration

**State before:** There is no cloud model catalog and no catalog validator today. The daemon's only per-provider model-list entry (providers.listModels) is registered but stubbed to offlineRpc, and the sole existing cloud-model source is the forbidden Anthropic-SDK claude.models fallback (NOT reused). The boot sequence at src/daemon/index.ts:303-313 already runs two fail-fast asset/prompt validators — validateAnalyzePrompts() (step 6d) and validateDocgenAssets() (step 6d′) — and copy-assets.mjs already ships everything under src/assets/ to out/assets/ via its `const DIRS = ['prompts','assets']` membership. So the pipeline + boot-validation idiom S001 needs exist; the cloud model catalog + its validator/accessor do not.

**State after:** A curated cloud model catalog JSON ships under src/assets/ (copied to out/assets/ by the existing copy-assets `assets` membership, no DIRS change). A new daemon module exposes validateModelCatalog() (boot-time load + schema validation, fail-fast throw of ModelCatalogValidationError on missing/malformed), getCuratedCatalog(), and the sc1 CuratedCatalog.modelsFor(provider) accessor over the frozen validated parse. validateModelCatalog() is wired into the boot block as a sibling of validateDocgenAssets (a new step 6d″ right after src/daemon/index.ts:313), re-raising to the top-level fatal handler. No cloud REST; catalog stays out of the user-config reconcile system.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the curated catalog JSON asset under src/assets/ (e.g. src/assets/models/cloud-model-catalog.json) matching the CloudModelCatalogFile shape { version, providers: { 'cli-claude': [...], 'cli-codex': [...] } } with an initial maintainer-curated model set. It is shipped to out/assets/ automatically by the existing copy-assets `assets` membership — no copy-assets.mjs change. — ↩ rollbackable
2. Add the new daemon catalog module defining the CloudModelCatalogFile/CatalogModel/CloudProvider types, validateModelCatalog() (read the shipped asset, JSON-parse, schema-validate, cache the frozen parse or throw ModelCatalogValidationError naming the file + a copy-assets Fix: hint), getCuratedCatalog(), and modelsFor(provider). Purely additive — nothing consumes it yet. — ↩ rollbackable
3. Wire validateModelCatalog() into the daemon boot sequence as a new step 6d″, immediately after the validateDocgenAssets() await (src/daemon/index.ts:313), re-raising to the top-level fatal handler like its siblings. This is the step that makes a missing/malformed catalog a fail-fast boot refusal (ac1). — ↩ rollbackable
4. Add the colocated tests (src/daemon/__tests__ or a sibling of asset-validator.test.ts): validator pass/missing/malformed/schema-invalid branches via a tmp asset dir, modelsFor accessor cases (populated / provider-omitted / empty array), the boot-ordering guard, the contract test over the real shipped asset, and the copy-assets smoke that out/assets/ carries the file. — ↩ rollbackable

**Backward compat:** No existing public API changes. providers.listModels stays offline-stubbed until S002 revives it (out of S001 scope); S001 adds only new internal-shared symbols (validateModelCatalog / getCuratedCatalog / modelsFor / the catalog types) that nothing consumes until S002. The one behavioural change is additive-but-gating: the daemon now refuses to boot if the shipped catalog asset is missing/malformed — but since S001 ships a valid asset in the same change, a correctly-built/installed daemon is unaffected; only a mis-staged build trips it (the intended ac1 fail-fast). No user config, config.json, or reconcile behaviour changes.

## Alternatives considered

### a1: Single provider-keyed JSON asset + boot-eager validate-and-freeze singleton (mirrors validateDocgenAssets) — **CHOSEN**

One src/assets/ JSON file matching the HLD CloudModelCatalogFile shape, loaded + schema-validated once at boot (fail-fast, same block as validateDocgenAssets) into a frozen in-memory CuratedCatalog whose modelsFor(provider) reads the parsed map.

The catalog is a single JSON asset under src/assets/ (e.g. src/assets/models/cloud-model-catalog.json) whose on-disk shape is exactly the HLD sketch: { version, providers: { 'cli-claude': CatalogModel[], 'cli-codex': CatalogModel[] } }, CatalogModel = { id, displayName? }. Membership under src/assets/ means copy-assets.mjs ships it to out/assets/ with no DIRS change. A new module (e.g. src/daemon/model-catalog.ts, sibling to docgen's asset-validator) exposes validateModelCatalog() + a loadCuratedCatalog() that reads the shipped JSON, schema-validates it (version present, providers object with the two known cloud-provider keys, each an array of {id:string, displayName?:string}), and on a MISSING or MALFORMED/schema-invalid file THROWS a typed error (ModelCatalogValidationError) naming the file + a one-line copy-assets Fix: hint — mirroring DocgenAssetValidationError. Validation is wired into the daemon boot sequence right after step 6d′ (src/daemon/index.ts:313, the validateDocgenAssets await) as a sibling 6d″, re-raising to the top-level fatal handler. The validated parse is cached (frozen) once and exposed as the sc1 CuratedCatalog accessor: modelsFor(provider: CloudProvider) returns the frozen readonly array (empty only if the catalog omits that provider). S002 consumes this accessor; no cloud REST, no config-reconcile involvement.

### a2: One JSON file per cloud provider + boot-eager merge

Separate src/assets/models/cli-claude.json and cli-codex.json, each validated at boot and merged behind the same CuratedCatalog accessor.

Instead of a single keyed file, ship one JSON array per cloud provider (src/assets/models/cli-claude.json, cli-codex.json), each just CatalogModel[]. The boot validator loads BOTH, validates each is a well-formed array of {id, displayName?}, and throws (naming the specific file) on any missing/malformed one. modelsFor(provider) indexes by filename. Same copy-assets membership, same boot hook + fail-fast, same accessor contract exposed to S002.

**Rejected because:** Functionally satisfies ac1/ac2/ac3 and k1/k5, but scores only partial on sc1: it splits the single provider-keyed CloudModelCatalogFile into per-provider array files, dropping the top-level version and forcing an internal merge that the HLD sketch did not specify — a needless contract drift for no functional gain over a1.

### a3: Single JSON asset, lazy-loaded + validated on first modelsFor() access (no boot hook)

Same single keyed JSON asset and accessor as a1, but validation happens the first time S002 calls modelsFor(), not at daemon boot.

Ship the identical single provider-keyed JSON asset (a1's file + shape). But instead of a boot-time validateModelCatalog(), the CuratedCatalog accessor loads + validates the file lazily on first modelsFor() call and memoizes the frozen result; a missing/malformed file surfaces as a thrown/loggable error at that first call (or an empty result). No new line in the daemon boot block.

**Rejected because:** Disqualified: it VIOLATES ac1 (no boot-time report of a missing/malformed catalog) and only partially meets k5 ('loaded at boot'), pushing the sc1 failure mode into S002's request hot path — the precise anti-pattern the validateDocgenAssets boot-eager design exists to prevent.

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:1511 (providers.listModels offline-stubbed) + :1281 (the Anthropic-SDK claude.models fallback) — the offline stub S002 revives and the forbidden direct-cloud-REST path that is NOT reused for cloud model listing.` — "providers.listModels is REGISTERED but stubbed to offlineRpc; the adjacent claude static-fallback catalog uses the Anthropic SDK directly (a forbidden no-cloud-REST path, NOT reusable)."
- **[[c4]]** `analyze-bundle` `copy-assets.mjs:28 (DIRS = ['prompts','assets'] + recursive cpSync) + src/docgen/asset-validator.ts (validateDocgenAssets load-then-throw) invoked at src/daemon/index.ts:303-313 — the asset pipeline + boot-eager fail-fast validation idiom S001 mirrors.` — "validateDocgenAssets loads the shipped assets and on a MISSING asset throws naming the file plus a copy-assets Fix: hint; invoked at src/daemon/index.ts:312-313, re-raising to the daemon top-level fat"
- **[[c5]]** `stakeholder` `Story lc1 + Epic k5: the curated catalog is a maintainer-curated in-repo asset shipped with the daemon, NOT user-editable and NOT part of the user-config reconcile system.` — "The catalog is a maintainer-curated asset that ships inside the daemon and is not user-editable at runtime nor part of the user-config reconcile pipeline."
- **[[c6]]** `analyze-bundle` `src/config/config-catalog.ts:96 + src/config/analyze.ts:88 — global tiers at models.tiers.<core|mid|cheap>.{runner,model}; runner enum AnalyzeShaperProviderKind = 'ollama'|'cli-claude'|'cli-codex', of which CloudProvider is the two-cloud subset (reused unchanged, k3).` — "runner an enum over ['ollama','cli-claude','cli-codex'] (analyze.ts:88 AnalyzeShaperProviderKind); the enum/allowlist is reused unchanged."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-23T12:36:35.101Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| migration/c1 | citation | LOW | auto | providers.listModels is registered in the daemon but stubbed to offlineRpc (no working per-provider model list today), which S002 later revives. | src/daemon/index.ts:1511 read ok; grep confirms `'providers.listModels': offlineRpc(...)` — the offline stub is real and verbatim. | None — citation confirmed. |
| c1 | citation | LOW | auto | An Anthropic-SDK claude.models path exists in the daemon (the forbidden direct-cloud-REST route the LLD deliberately does NOT reuse). | src/daemon/index.ts:1282 read ok; grep confirms 'claude.models' + .models.list() — the Anthropic-SDK cloud path exists and is correctly excluded as the forbidden route. | None — forbidden-path citation confirmed. |
| c4 | citation | LOW | auto | src/docgen/asset-validator.ts exports validateDocgenAssets, the boot-eager load-then-throw asset validator whose idiom S001's validateModelCatalog mirrors. | src/docgen/asset-validator.ts read ok; grep confirms the validateDocgenAssets export + DocgenAssetValidationError — the prior-art validator S001 mirrors is real. | None — confirmed. |
| c4 | citation | LOW | auto | The daemon boot sequence at src/daemon/index.ts:303-313 invokes validateAnalyzePrompts() (step 6d) then validateDocgenAssets() (step 6d′), both re-raising to the top-level fatal handler; S001 wires validateModelCatalog() as a sibling immediately after :313. | src/daemon/index.ts:303 + :313 read ok; grep confirms validateAnalyzePrompts() and `await validateDocgenAssets()` — the boot block S001 hooks into is exactly as described. | None — boot hook point confirmed. |
| migration/c4 | citation | LOW | auto | copy-assets.mjs ships everything under src/assets/ to out/assets/ via a fixed membership list `const DIRS = ['prompts','assets']` and a recursive cpSync — so a new JSON under src/assets/ requires no copy-assets change. | copy-assets.mjs:28 read ok; grep confirms `const DIRS = ['prompts', 'assets']` + recursive cpSync — a src/assets/ JSON ships automatically, no copy-assets change (as claimed). | None — asset pipeline confirmed. |
| c6 | citation | LOW | auto | The runner enum is AnalyzeShaperProviderKind = 'ollama'\|'cli-claude'\|'cli-codex' (src/config/analyze.ts:88), of which CloudProvider ('cli-claude'\|'cli-codex') is the two-cloud subset reused unchanged (k3). | src/config/analyze.ts:88 read ok; grep confirms AnalyzeShaperProviderKind + the 'ollama'\|'cli-claude'\|'cli-codex' union — CloudProvider is a faithful two-cloud subset, runner enum reused unchanged (k3). | None — confirmed. |
| test-strategy | citation | LOW | auto | The docgen asset-validator test (src/docgen/__tests__/asset-validator.test.ts) is the pass/missing/malformed test pattern (with a tmpAssetDir helper) S001's validator tests mirror. | src/docgen/__tests__/asset-validator.test.ts:54 read ok; grep confirms tmpAssetDir + the 'validateDocgenAssets: missing' test — the test pattern S001 extends is real. | None — test-pattern citation confirmed. |
| cl8 | semantic | LOW | auto | The sc1 contract this LLD implements (CuratedCatalog.modelsFor(provider): readonly CatalogModel[], CloudModelCatalogFile shape, CloudProvider = cli-claude\|cli-codex) matches the HLD sc1 interfaceSketch S001 owns 1:1. | The epic HLD read ok; the LLD's sc1 surface (CuratedCatalog.modelsFor(provider), CloudModelCatalogFile shape, CloudProvider union) reproduces the HLD sc1 interfaceSketch S001 owns without deviation. | None — sc1 contract matches the HLD. |
| cl9 | ordering | LOW | auto | S001 owns sc1 only and consumes no other contract; the list-models IPC dispatch, live-ollama query and ModelListResult (sc2) plus the plugin UIs are adjacent scope (S002/S003/S004), consumed-not-designed here. | The epic HLD read ok; the LLD confines itself to sc1 and treats sc2 (list-models IPC/ollama query/ModelListResult) + the plugin UIs as adjacent, consume-not-design scope — no adjacent-boundary encroachment. | None — scope boundary respected. |
