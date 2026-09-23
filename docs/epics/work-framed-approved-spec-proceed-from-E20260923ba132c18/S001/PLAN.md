<!-- insrc:artifact PLAN-ba132c185fe45860-s1 -->

# Plan: E20260923ba132c18:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790166442417-ni3a1m`
**LLD effective hash:** `3fb0b2204d88...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the curated cloud model catalog JSON asset | S | — | integration: the actual shipped src/assets/models/cloud-model-catalog.json validates against the CloudModelCatalogFile schema (the real curated asset, not a fixture); integration: every entry in the shipped catalog has a string id; displayName when present is a string | [[c2]] |
| 2 | **`t2`** Add the daemon catalog module: types + validateModelCatalog + getCuratedCatalog + modelsFor | M | `t1` | unit: validateModelCatalog: valid catalog fixture -> resolves, caches the frozen parse; unit: validateModelCatalog: removed/absent catalog file -> throws ModelCatalogValidationError naming the file + a copy-assets Fix: line; unit: validateModelCatalog: non-JSON file -> throws (parse failure) naming the file; unit: validateModelCatalog: schema-invalid (missing version / providers not the two-key object / entry missing id / id not a string) -> throws naming the specific failure, short-circuits; unit: modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog -> returns the curated readonly arrays; unit: modelsFor for a provider omitted from the catalog -> returns an empty readonly array (not an error); unit: getCuratedCatalog before validateModelCatalog populated the cache -> throws the boot-ordering Error; unit: unit + accessor tests make no network/provider call — the loader/accessor have no cloud-REST code path (no HTTP client is constructed or invoked) | [[c3]] [[c4]] |
| 3 | **`t3`** Wire validateModelCatalog() into the daemon boot sequence | S | `t2` | integration: daemon boot with a valid catalog present -> boot proceeds past the validation step; integration: daemon boot with the catalog removed/malformed -> boot throws and does not begin serving IPC (fail-fast) | [[c4]] |
| 4 | **`t4`** Add colocated node:test tests for the catalog validator + accessor + boot wiring + packaging | M | `t1`, `t2`, `t3` | smoke: after `npm run build` (or a copy-assets run), the catalog file exists under out/assets/ at the path validateModelCatalog reads | [[c5]] [[c6]] |

### E20260923ba132c18:S001:T001 — Add the curated cloud model catalog JSON asset

Create src/assets/models/cloud-model-catalog.json matching the CloudModelCatalogFile shape { version:number, providers: { 'cli-claude': CatalogModel[], 'cli-codex': CatalogModel[] } } with an initial maintainer-curated set of cli-claude + cli-codex model entries ({ id, displayName? }). No copy-assets.mjs change — it ships to out/assets/ via the existing 'assets' DIRS membership.

**Acceptance checks:**
- src/assets/models/cloud-model-catalog.json exists and is valid JSON matching { version:number, providers: { 'cli-claude': [...], 'cli-codex': [...] } }
- each entry has a string id (+ optional string displayName); both cloud providers are present with at least one real curated model each
- no copy-assets.mjs edit is required (the file sits under src/assets/)

### E20260923ba132c18:S001:T002 — Add the daemon catalog module: types + validateModelCatalog + getCuratedCatalog + modelsFor

Create a new daemon module (e.g. src/daemon/model-catalog.ts) defining CloudModelCatalogFile / CatalogModel / CloudProvider types + ModelCatalogValidationError, validateModelCatalog() (read the shipped asset, JSON-parse, schema-validate version+providers+entries, cache the frozen parse, else throw ModelCatalogValidationError naming the file + a copy-assets Fix: hint), getCuratedCatalog() (returns the singleton accessor; throws the boot-ordering Error if the cache is unset), and CuratedCatalog.modelsFor(provider) over the frozen parse. Mirrors src/docgen/asset-validator.ts. No cloud REST; nothing consumes it yet.

**Acceptance checks:**
- validateModelCatalog() resolves for a valid catalog and throws ModelCatalogValidationError (message names the file + a copy-assets Fix: hint) for a missing or malformed/schema-invalid asset, short-circuiting on the first structural failure
- getCuratedCatalog() returns a CuratedCatalog whose modelsFor('cli-claude'|'cli-codex') returns the frozen readonly arrays, an empty array for a provider the catalog omits, and throws the boot-ordering Error when called before validateModelCatalog cached the parse
- the module makes NO network/provider call (no HTTP client constructed) and does NOT read/write config.json or touch the config-reconcile system
- CloudProvider = 'cli-claude' | 'cli-codex' only (ollama excluded); types match the sc1 interfaceSketch exactly

### E20260923ba132c18:S001:T003 — Wire validateModelCatalog() into the daemon boot sequence

Insert a new boot step (6d″) in src/daemon/index.ts immediately after the validateDocgenAssets() await (:313): dynamically import + await validateModelCatalog(), re-raising to the top-level fatal handler exactly like its siblings so a missing/malformed catalog is a fail-fast startup refusal.

**Acceptance checks:**
- src/daemon/index.ts awaits validateModelCatalog() in the boot block right after the validateDocgenAssets() await, before the daemon serves IPC
- a missing/malformed catalog makes the daemon refuse to boot (the error re-raises to the top-level fatal handler); a valid catalog lets boot proceed
- the insertion follows the existing sibling shape (dynamic import + await) and changes no other boot behaviour

### E20260923ba132c18:S001:T004 — Add colocated node:test tests for the catalog validator + accessor + boot wiring + packaging

Add colocated tests (sibling of src/docgen/__tests__/asset-validator.test.ts) staging a fake asset dir per case (tmpAssetDir pattern): validateModelCatalog pass/missing/non-JSON/schema-invalid branches; modelsFor populated / provider-omitted / empty-array; the boot-ordering guard; a boot-integration test (validateModelCatalog runs in the boot block and a missing/malformed catalog aborts boot); a contract test that the real shipped catalog validates against the schema; and a copy-assets smoke that out/assets/ carries the file. node:test (tsx --test).

**Acceptance checks:**
- a colocated *.test.ts exercises validateModelCatalog's pass/missing/non-JSON/schema-invalid branches and the modelsFor accessor cases (populated / provider-omitted / empty array) + the boot-ordering guard
- a boot-integration test asserts validateModelCatalog is invoked in the boot block and a missing/malformed catalog aborts boot (re-raises) rather than starting a degraded daemon
- a contract test validates the actual shipped src/assets catalog against the CloudModelCatalogFile schema (every entry id is a string; displayName when present is a string)
- a smoke test confirms the catalog is present under out/assets/ after copy-assets runs
- the full local test sweep passes (npx tsx --test) with no network access

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| validateModelCatalog: valid catalog fixture -> resolves, caches the frozen parse | `t2`, `t4` |
| validateModelCatalog: removed/absent catalog file -> throws ModelCatalogValidationError naming the file + a copy-assets Fix: line | `t2`, `t4` |
| validateModelCatalog: non-JSON file -> throws (parse failure) naming the file | `t2`, `t4` |
| validateModelCatalog: schema-invalid (missing version / providers not the two-key object / entry missing id / id not a string) -> throws naming the specific failure, short-circuits | `t2`, `t4` |
| modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog -> returns the curated readonly arrays | `t2`, `t4` |
| modelsFor for a provider omitted from the catalog -> returns an empty readonly array (not an error) | `t2`, `t4` |
| getCuratedCatalog before validateModelCatalog populated the cache -> throws the boot-ordering Error | `t2`, `t4` |
| the actual shipped src/assets/models/cloud-model-catalog.json validates against the CloudModelCatalogFile schema (the real curated asset, not a fixture) | `t1`, `t4` |
| every entry in the shipped catalog has a string id; displayName when present is a string | `t1`, `t4` |
| daemon boot with a valid catalog present -> boot proceeds past the validation step | `t3`, `t4` |
| daemon boot with the catalog removed/malformed -> boot throws and does not begin serving IPC (fail-fast) | `t3`, `t4` |
| after `npm run build` (or a copy-assets run), the catalog file exists under out/assets/ at the path validateModelCatalog reads | `t4` |

## Citations

- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: CloudModelCatalogFile — the on-disk JSON asset shape shipped under src/assets/, copied to out/assets/ by copy-assets.mjs's existing 'assets' DIRS membership.` — "src/assets/models/cloud-model-catalog.json : { version: number, providers: { 'cli-claude': CatalogModel[], 'cli-codex': CatalogModel[] } }"
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: the sc1 CuratedCatalog surface — CloudModelCatalogFile/CatalogModel/CloudProvider types + validateModelCatalog + getCuratedCatalog + modelsFor(provider).` — "interface CuratedCatalog { modelsFor(provider: CloudProvider): readonly CatalogModel[] }; function validateModelCatalog(): Promise<void>; function getCuratedCatalog(): CuratedCatalog"
- **[[c4]]** `analyze-bundle` `s1 sizing bundle: copy-assets.mjs (DIRS=['prompts','assets'] + recursive cpSync) + src/docgen/asset-validator.ts (validateDocgenAssets load-then-throw) invoked in the daemon boot block at src/daemon/index.ts:303-313 — the module + boot-wiring idiom S001 mirrors.` — "validateDocgenAssets() (:312-313) re-raises to the top-level fatal handler; S001's validateModelCatalog wires in as a sibling immediately after :313."
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths + testStrategy: the pass/missing/malformed/schema-invalid validator branches, the modelsFor accessor cases, the boot-ordering guard, the contract test over the shipped asset, and the copy-assets smoke — mirroring src/docgen/__tests__/asset-validator.test.ts (tmpAssetDir).` — "node:test (tsx --test), colocated under src/**/__tests__/*.test.ts — matching src/docgen/__tests__/asset-validator.test.ts and src/analyze/context/__tests__/boot-validator.test.ts"
- **[[c6]]** `analyze-bundle` `s1 grounding: src/config/analyze.ts:88 AnalyzeShaperProviderKind = 'ollama'|'cli-claude'|'cli-codex' — CloudProvider is the two-cloud subset (k3), the enum the catalog + tests key off unchanged.` — "runner an enum over ['ollama','cli-claude','cli-codex'] (analyze.ts:88 AnalyzeShaperProviderKind); the enum/allowlist is reused unchanged."
