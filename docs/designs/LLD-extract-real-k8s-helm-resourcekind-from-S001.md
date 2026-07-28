<!-- insrc:artifact LLD-b6bf7c5369deabe8-S001 -->

# LLD: S001

**Epic:** `extract-real-k8s-helm-resourcekind-from`
**HLD base run:** `wf-1785254354917-48a2nj`
**HLD effective hash:** `b6bf7c5369de...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `resourceKindFromBody`

```typescript
export function resourceKindFromBody(file: string, family: ManifestFamily, body: string): string | undefined
```

**Parameters:**
- `file: string` — The manifest's relPath — used only to recognise helm Chart.yaml (chart name path).
- `family: ManifestFamily` — Gate: only 'kubernetes' and 'helm' derive a kind; other families return undefined.
- `body: string` — The indexed entity body (Entity.body) — the manifest YAML the artifact indexer already stored; no filesystem read.

**Returns:** `string | undefined` — For kubernetes: the string `kind` of the FIRST non-null object doc from js-yaml loadAll(body). For helm Chart.yaml: the parsed `name`. Undefined when body is empty, unparseable, the field is missing/non-string, or the family is neither kubernetes nor helm — signalling the caller to fall back to inferResourceKind.

**Preconditions:**
- body is the Entity.body already present in the graph (no I/O performed).

**Postconditions:**
- Deterministic + pure: same (file, family, body) → same result; no side effects, no LLM, no filesystem access.
- Never throws: any js-yaml parse error is caught internally and yields undefined.

### `inferResourceKind`

```typescript
export function inferResourceKind(file: string, family: ManifestFamily): string | undefined
```

**Parameters:**
- `file: string` — Manifest path whose basename stem is matched against the k8s kind candidate list.
- `family: ManifestFamily` — Gate: kubernetes/helm only.

**Returns:** `string | undefined` — UNCHANGED. The existing filename-heuristic guess, now demoted to the FALLBACK path used only when resourceKindFromBody returns undefined.

**Postconditions:**
- Behavior byte-identical to today; retained verbatim so empty/truncated/unparseable bodies preserve the prior output (no regression).

### `runManifestsLocate`

```typescript
export async function runManifestsLocate(exp: Exploration, ctx: ExplorationRunnerContext): Promise<ManifestsLocateOutput>
```

**Parameters:**
- `exp: Exploration` — The exploration (params: families filter, topK). Unchanged.
- `ctx: ExplorationRunnerContext` — Runner context (repoPath, ignoreFilter, runId). Unchanged.

**Returns:** `Promise<ManifestsLocateOutput>` — Unchanged shape. The ONLY change: at the hit-build site it now sets resourceKind = resourceKindFromBody(e.file, family, e.body) ?? inferResourceKind(e.file, family), passing the entity body already in scope.

**Preconditions:**
- Entities come from listEntitiesForRepo (each carries body).

**Postconditions:**
- ManifestHit.resourceKind is the real content-derived kind when derivable, else the prior filename guess; families counts + all other fields unchanged.

## Data model changes

### `ManifestHit.resourceKind (src/analyze/explore/types.ts)` — invariant-change

No SHAPE change — resourceKind stays `resourceKind?: string`; its SOURCE becomes the content-parsed `kind:`/chart `name` instead of a filename guess, fulfilling the field's existing doc. Consumers unchanged.

```
// unchanged: resourceKind?: string  (meaning now content-derived)
```

**Call sites:**
- `src/analyze/explore/types.ts`
- `src/analyze/explore/manifests-locate.ts`
- `src/prompts/analyze/synthesize.infra.system.md`

### `manifests-locate.ts hit-build call site` — field-modify

resourceKind assignment becomes `resourceKindFromBody(e.file, family, e.body) ?? inferResourceKind(e.file, family)`.

```
- resourceKind: inferResourceKind(e.file, family)
+ resourceKind: resourceKindFromBody(e.file, family, e.body) ?? inferResourceKind(e.file, family)
```

**Call sites:**
- `src/analyze/explore/manifests-locate.ts`

## Error paths

### Error cases

- **The entity body is not valid YAML (js-yaml loadAll throws).** (recoverable)
  - Detection: The loadAll(body) call inside resourceKindFromBody is wrapped in try/catch.
  - Response: The catch returns undefined; the caller's `?? inferResourceKind(...)` falls back to the filename heuristic (prior behavior).
  - User impact: None — the hit still gets the same resourceKind it would have had before this change; no crash.
- **The body was truncated by the indexer (>MAX_BODY) such that the parse fails or the kind field is cut off.** (recoverable)
  - Detection: loadAll either throws (caught) or yields docs whose first object has no string `kind` — resourceKindFromBody returns undefined.
  - Response: Falls back to inferResourceKind (filename guess).
  - User impact: Same as prior behavior for that (rare, very large) manifest; apiVersion/kind sit at the file head so truncation past them is unusual.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A Service manifest misleadingly named `nginx-deployment.yaml` (body kind: Service). | resourceKind = 'Service' (content wins over the filename guess of 'Deployment'). |
| A multi-doc manifest (`kind: ConfigMap` then `---` then `kind: Secret`). | resourceKind = 'ConfigMap' (the first non-null doc's kind); the file is counted once as before. |
| A helm Chart.yaml with `name: my-chart`. | resourceKind = 'my-chart' (the chart name); non-Chart helm files (e.g. values.yaml) return undefined and fall back to the filename heuristic. |
| An empty body (e.g. a File-kind entity or an entity indexed with body ''). | resourceKindFromBody returns undefined immediately; falls back to inferResourceKind. |
| A terraform/docker/ci family hit (family not kubernetes/helm). | resourceKindFromBody returns undefined (family gate); and inferResourceKind also returns undefined — so resourceKind stays absent, exactly as today. |
| A k8s doc whose `kind` value is non-string (malformed) or the first doc is null/`---` only. | Skip null/non-object docs; if no doc yields a string kind, return undefined → fallback. |

### Invariants to preserve

- manifests.locate performs NO filesystem read beyond what the indexer already did + NO LLM — the new derivation reads only Entity.body which is already in the graph (artifact.ts:182 stored it). Cited s1 bundle: 'The Entity.body field that carries the manifest source'. [[c2]]
- ManifestHit.resourceKind stays a single optional string; no consumer (synthesize.infra.system.md) changes. Cited s1 bundle: 'The ManifestHit.resourceKind contract (unchanged) + its synthesizer consumer'. [[c3]]
- No regression: when the body yields no kind (empty/truncated/unparseable), the result is byte-identical to today's filename heuristic because inferResourceKind is retained verbatim as the fallback. Cited s1 bundle: 'The function being reshaped (inferResourceKind) + its sole caller'. [[c1]]
- Determinism preserved: manifests.locate stays deterministic (no LLM); resourceKindFromBody is a pure function of (file, family, body). Cited s1 bundle: 'js-yaml precedent for parsing manifest YAML' (loadAll is deterministic). [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) with assert/strict, a new src/analyze/explore/__tests__/manifests-locate.test.ts calling the exported helpers directly (matching the repo convention)`

### Test levels

- **unit** — Exercise the new resourceKindFromBody helper directly (exported, pure — no db/render) across the content/multi-doc/helm/fallback/family-gate cases, plus confirm inferResourceKind's fallback behavior is retained.
  - Subjects: `resourceKindFromBody: k8s body kind wins over a misleading filename`, `resourceKindFromBody: multi-doc manifest returns the first doc's kind`, `resourceKindFromBody: helm Chart.yaml returns the chart name; non-Chart helm file returns undefined`, `resourceKindFromBody: empty / unparseable body returns undefined (caller falls back)`, `resourceKindFromBody: terraform/docker/ci family returns undefined (family gate)`, `inferResourceKind still returns the filename guess (fallback path unchanged)`
  - Fixtures: `inline manifest body strings (no filesystem, no db)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: a Service body named nginx-deployment.yaml yields resourceKind 'Service' (content beats filename)` |
| `ac2` | `unit: a ConfigMap---Secret multi-doc body yields 'ConfigMap' (first doc's kind)` |
| `ac3` | `unit: a helm Chart.yaml body with name: my-chart yields 'my-chart'; a helm values.yaml returns undefined` |
| `ac4` | `unit: empty body and unparseable-YAML body both return undefined; combined with the caller's `?? inferResourceKind`, the filename guess is used (no regression)` |
| `ac5` | `unit: family='terraform'/'docker'/'ci' returns undefined regardless of body` |

## Migration

**State before:** manifests.locate sets ManifestHit.resourceKind purely from a filename guess: inferResourceKind (manifests-locate.ts:201-217, cited s1 'The function being reshaped') matches the basename stem against a k8s kind candidate list, so a mis-named or multi-doc manifest is mislabeled and the value contradicts the field's own doc (types.ts:590, cited s1 'ManifestHit.resourceKind contract'). The full entity (with body) is already in scope at the call site but unused for kind derivation.

**State after:** resourceKind is derived from the manifest CONTENT: a new pure helper resourceKindFromBody parses the indexed Entity.body via js-yaml loadAll and returns the first doc's k8s `kind` (or the helm Chart `name`); the caller uses `resourceKindFromBody(...) ?? inferResourceKind(...)` so the filename guess remains the fallback. No FS read (body is already in the graph), no type change, no consumer change.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the pure helper resourceKindFromBody(file, family, body) to manifests-locate.ts (js-yaml loadAll inside try/catch; first non-null-object doc's string `kind` for kubernetes; parsed `name` for a helm Chart.yaml; undefined otherwise). Purely additive — nothing calls it yet. — ↩ rollbackable
2. Change the single resourceKind assignment in runManifestsLocate to `resourceKindFromBody(e.file, family, e.body) ?? inferResourceKind(e.file, family)`, passing the in-scope entity body. inferResourceKind is left verbatim as the fallback. — ↩ rollbackable
3. Add the new unit test file src/analyze/explore/__tests__/manifests-locate.test.ts exercising resourceKindFromBody (content-beats-filename, multi-doc first-kind, helm Chart name, empty/unparseable fallback, non-k8s/helm family gate) + a fallback-path check on inferResourceKind. Test-only. — ↩ rollbackable

**Backward compat:** Backward compatible. resourceKindFromBody is new + additive; inferResourceKind keeps its exact signature and behavior (now the fallback), so any code/tests referencing it are unaffected. ManifestHit / ManifestsLocateOutput shapes are unchanged, so the infra synthesizer prompt and every other consumer read resourceKind exactly as before. The only observable change is that resourceKind is now the ACCURATE content-derived kind when the body is parseable — an improvement, not a break; when it isn't parseable the output is byte-identical to today.

## Alternatives considered

### a1: Body-YAML parse, single resourceKind, filename fallback — **CHOSEN**

Reimplement inferResourceKind to parse the entity body with js-yaml loadAll and return the first doc's `kind` (k8s) / chart `name` (helm Chart.yaml); fall back to the existing filename heuristic on empty/unparseable body. resourceKind stays a single optional string — no type change.



### a2: Extend the contract to resourceKinds[] for multi-doc

Add a `resourceKinds?: string[]` field to ManifestHit (distinct kinds per file) alongside the single resourceKind, and teach the synthesizer to prefer the list.



**Rejected because:** Violates no-contract-change: adds a resourceKinds[] field to ManifestHit that ripples to the synthesizer prompt + every ManifestsLocateOutput consumer — over-scopes a small story for a marginal multi-doc gain over a1's first-kind.

### a3: Header regex over body (no YAML parse)

Grep the body for a top-level `kind:` / `name:` line with a regex instead of a full YAML parse.



**Rejected because:** Only partially accurate (a column-0 `kind:` regex can still match the wrong line and doesn't split multi-doc cleanly) and violates convention-fidelity by introducing a second, ad-hoc manifest-reading strategy vs. the established js-yaml loadAll primitive — a fragile shortcut for no benefit since body is already in memory.

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example — inferResourceKind + its sole caller (manifests-locate.ts:201-217, :110-112)` — "inferResourceKind guesses the k8s/helm kind from the basename stem; its ONLY caller is runManifestsLocate, which already has the full entity e in scope so it can pass e.body."
- **[[c2]]** `analyze-bundle` `s1 data-model.trace — Entity.body carries the manifest source (shared/types.ts, artifact.ts:182)` — "Non-markdown artifacts are indexed as a single entity with body: truncate(source); reading e.body is not a filesystem read — it's already in the graph, preserving manifests.locate's no-FS contract."
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — ManifestHit.resourceKind + its synthesizer consumer (types.ts:590, synthesize.infra.system.md:34/39/43)` — "resourceKind's doc already says 'the kind: field extracted from the entity metadata' which the filename guess does NOT honour; the synthesizer consumes it in the top-kinds summary + by-family + surfac"
- **[[c4]]** `analyze-bundle` `s1 search.text — js-yaml loadAll precedent (inventory-kubernetes.ts:29, package.json)` — "js-yaml ^4.1.0 is already a dep; inventory-kubernetes.ts uses loadAll to parse multi-doc k8s manifests — the exact primitive reused here inside a try/catch that falls back on failure."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-07-28T16:15:02.142Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/analyze/explore/manifests-locate.ts exports inferResourceKind(file, family) which guesses the kind from the basename, and its sole caller runManifestsLocate sets hit.resourceKind from it (the entity `e` is in scope with e.body). | manifests-locate.ts:201 `export function inferResourceKind(...)`, :74 `export async function runManifestsLocate(`, :93 `for (const e of all)`, :111 `resourceKind: inferResourceKind(e.file, family)!`. The function, its sole caller, and the entity-in-scope call site are exactly as cited. | none — verified sound |
| cl2 | semantic | LOW | manual | The indexed Entity carries `body: string`, and the artifact parser stores a non-markdown artifact's full source in body via `truncate(source)` — so a manifest entity's body is the manifest YAML (no filesystem read needed to parse it). | artifact.ts:182 `body: truncate(source)` (also :287, :355) + the truncate fn at :298; Entity.body is a real string field. Confirms a manifest entity's body holds the manifest YAML, so parsing it is not a filesystem read. | none — verified sound |
| cl3 | citation | LOW | manual | src/analyze/explore/types.ts declares interface ManifestHit with `resourceKind?: string` (a single optional string) — the shape this story keeps unchanged. | types.ts:590 `export interface ManifestHit {`, :596 `readonly resourceKind?: string;`. The single-optional-string shape the story keeps is confirmed (the real field also carries `readonly`, which the story preserves — no shape change). | none — verified sound |
| cl4 | external-contract | LOW | manual | js-yaml is a dependency and exposes loadAll for multi-doc parsing; inventory-kubernetes.ts already imports it — the primitive resourceKindFromBody reuses. | inventory-kubernetes.ts:29 `import { loadAll } from 'js-yaml'`; package.json:52 `"js-yaml": "^4.1.0"`. loadAll is the established multi-doc parse primitive reused by resourceKindFromBody — no new dependency. | none — verified sound |
| cl5 | inventory | LOW | manual | There is no existing test file for manifests.locate under src/analyze/explore/__tests__/, so the story adds a new one (a first test for this module). | The only existing test touching the module is phase5-explorations-params.test.ts (imports runManifestsLocate); there is no src/analyze/explore/__tests__/manifests-locate.test.ts in source (the path appears only in the LLD). resourceKindFromBody is net-new (doc-only matches). The new test file + helper are correctly greenfield. | none — verified sound |
| cl6 | citation | LOW | manual | The infra synthesizer prompt src/prompts/analyze/synthesize.infra.system.md consumes manifests.locate hits including resourceKind (top recurring kinds / by-family / surface layers), so accurate resourceKind flows through unchanged. | synthesize.infra.system.md:15 (hit shape with resourceKind?), :34 (top recurring resourceKind values), :39 (by-family `<resourceKind> — <path>`), :43 (surface `:: <resourceKind>`), :58 (drop when undefined). The synthesizer consumes resourceKind at exactly the cited roles, so an accurate value flows through with no consumer change. | none — verified sound |
