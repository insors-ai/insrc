<!-- insrc:artifact LLD-50e44a40ef3329f9-S001 -->

# LLD: S001

**Epic:** `swap-inventory-terraform-ts-off-its`
**HLD base run:** `wf-1785259771966-kn45el`
**HLD effective hash:** `50e44a40ef33...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `InfraInventoryTerraformRuntime.execute`

```typescript
execute(input: RuntimeInput): Promise<{ outputs: Map<string, TfInventory> }>
```

**Parameters:**
- `input: RuntimeInput` — Carries the scopeRef the runtime resolves to a repo path before walking .tf/.tfvars files.

**Returns:** `Promise<{ outputs: Map<string, TfInventory> }>` — A single-entry Map keyed 'tf-inventory' (unchanged) whose value is the TfInventory {files, resources, data, modules, providers, variables, outputs, truncated}. Return shape and key are byte-for-byte identical to today; only the internal block extraction changes from regex to parser.

**Errors:**
- `none-propagated` when A per-file parse failure is caught internally (log.debug + continue) so a malformed .tf is dropped, not thrown; execute() itself does not add new error exits.

**Preconditions:**
- scopeRef resolves to an existing repo path (unchanged from today).
- @cdktf/hcl2json is installed and its parse export is importable under Node ESM.

**Postconditions:**
- Every list in the inventory is sorted deterministically (unchanged).
- resources/data/modules/providers/variables/outputs reflect blocks recovered by the real HCL parser, including non-canonical formatting the old regex missed.
- The 'tf-inventory' output key and TfInventory field set are unchanged; no caller or registry edit.

### `parse`

```typescript
parse(filename: string, contents: string): Promise<Record<string, any>>
```

**Parameters:**
- `filename: string` — The file's path (f.relPath), used by hcl2json for diagnostics; does not affect the parsed shape.
- `contents: string` — The raw .tf/.tfvars file text to parse into HCL-as-JSON.

**Returns:** `Promise<Record<string, any>>` — HCL-as-JSON: json.resource = {type:{name:[...blocks]}}, json.data likewise; json.module/provider/variable/output = {name:[...blocks]}. Absent top-level keys mean no blocks of that kind. This is the @cdktf/hcl2json named export that replaces the two regexes.

**Errors:**
- `Error (thrown, caught locally)` when contents is not valid HCL; caught by the per-file try/catch which log.debug's and continues.

**Preconditions:**
- The WASM module has initialised (first call pays a one-time ~49ms cold init per process).

**Postconditions:**
- On success, returns a plain object whose top-level keys are the HCL block kinds present in the file.

## Data model changes

### `TfInventory` — invariant-change

The value stored under the 'tf-inventory' output key. Its field set (files, resources[{file,type,name}], data[{file,type,name}], modules[{file,name}], providers, variables, outputs, truncated) is UNCHANGED. The only invariant change is provenance: block lists are now populated by walking the @cdktf/hcl2json parse() result rather than regex matches, so they include non-canonical-HCL blocks the regex silently dropped. Ordering/sorting and the truncated flag are preserved.

```
No field added/removed. resources/data/modules/providers/variables/outputs now sourced from parsed JSON walk (json.resource/data/module/provider/variable/output) instead of TWO_LABEL_BLOCK_RE/ONE_LABEL_BLOCK_RE.
```

**Call sites:**
- `src/analyze/runtimes/infra/inventory-terraform.ts`
- `src/analyze/runtimes/infra/index.ts`
- `src/analyze/planner/templates/infra/index.ts`

## Error paths

### Error cases

- **A .tf/.tfvars file contains syntactically invalid HCL that the WASM parser rejects.** (recoverable)
  - Detection: The `await parse(f.relPath, text)` call throws; the surrounding per-file try/catch catches it.
  - Response: log.debug the file + error and `continue` to the next file (mirrors inventory-kubernetes's YAML try/catch), so the file contributes no blocks but the run proceeds.
  - User impact: That single malformed file is silently omitted from tf-inventory; every other file is still inventoried. No crash, no partial-Map.
- **A file is read but parse() returns an object missing an expected top-level key (e.g. no `resource` key because the file only has variables).** (recoverable)
  - Detection: The walk uses Object.entries on a possibly-absent key — a missing key yields an empty/typeof-guarded branch rather than a throw.
  - Response: Skip that block kind for the file (no push); continue walking the keys that are present.
  - User impact: Correct: a variables-only file reports variables and nothing else, exactly as intended.
- **The @cdktf/hcl2json WASM module fails to initialise (import/instantiation error) on the first parse call.** (recoverable)
  - Detection: The first `await parse(...)` rejects; caught by the same per-file try/catch.
  - Response: Each file's parse throws and is log.debug'd + skipped; the runtime returns an empty-but-well-formed tf-inventory rather than crashing the analyze pass.
  - User impact: Degraded (empty terraform inventory) but non-fatal; surfaced via debug logs. This is an environment/install fault, not user input.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A .tf file with non-canonical formatting the old regex missed — e.g. `resource "aws_s3_bucket" "b"\n{` (opening brace on the next line) or irregular inter-token spacing. | The real parser captures the block; it now appears in resources[] where the regex would have dropped it. This is the story's core value and the new test case. |
| A .tfvars file (values only, no resource/data/module/... blocks). | parse() succeeds; the walk finds no block kinds, so it contributes zero rows. filesSeen handling keeps the existing .tfvars bump-then-decrement no-op so counts are unchanged. |
| An empty .tf file (zero bytes) or a comments-only file. | parse() returns an object with no block keys; no rows pushed; no throw. |
| A single resource type declared multiple times with different names (e.g. two `aws_instance` blocks). | json.resource['aws_instance'] has multiple name keys; the walk pushes one {file,type,name} per name, matching the regex's per-block behaviour. |
| walkFiles hits its 5000-file cap. | truncated=true is propagated unchanged from walkFiles into the inventory, exactly as today. |

### Invariants to preserve

- The output Map has exactly one entry keyed 'tf-inventory' and the TfInventory field set (files, resources, data, modules, providers, variables, outputs, truncated) is unchanged — the produces-key must stay === the emitted key or the planner template breaks. [[c3]]
- Every list in the inventory is sorted deterministically before return, so repeated runs over the same tree yield byte-identical output. [[c1]]
- A per-file failure never aborts the whole runtime: a bad file is dropped via log.debug + continue, exactly as inventory-kubernetes handles a malformed YAML manifest. [[c2]]
- The file filter stays .tf + .tfvars via walkFiles (cap 5000) and the truncated flag is passed through unchanged. [[c1]]
- No caller or registry edit: INFRA_RUNTIMES + INFRA_TEMPLATES (produces:['tf-inventory']) remain untouched. [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test) with node:assert/strict, temp-dir fixtures — matching src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts`

### Test levels

- **integration** — Drive the real InfraInventoryTerraformRuntime.execute() end-to-end against temp-dir .tf/.tfvars fixtures (real @cdktf/hcl2json parse, real walkFiles) and assert the emitted tf-inventory.
  - Subjects: `src/analyze/runtimes/infra/inventory-terraform.ts execute()`, `the 'tf-inventory' output-Map entry shape + sorted determinism`
  - Fixtures: `The existing canonical .tf fixture (must still yield 2 resources / 1 provider / 1 data / 2 variables / 1 output).`, `A NEW non-canonical .tf fixture: a resource block with the opening brace on the next line / irregular spacing that the old regex missed — asserts the parser now captures it.`, `An invalid-HCL .tf fixture alongside a valid one — asserts the bad file is dropped (log.debug+continue) while the valid file is still inventoried (no throw, well-formed Map).`, `A .tfvars values-only fixture — asserts zero block rows and unchanged filesSeen counting.`
- **unit** — Assert the invariants that don't need a full tree: the output key stays 'tf-inventory', lists are sorted, and the produces-key matches.
  - Subjects: `the output-Map key equals the infraInventoryTerraform.produces[0] 'tf-inventory'`, `each inventory list is in sorted order for a fixture with deliberately out-of-order block names`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: canonical .tf fixture still yields exactly 2 resources / 1 provider / 1 data / 2 variables / 1 output (no regression in the tf-inventory shape or counts).` |
| `ac2` | `integration: non-canonical .tf fixture (brace-on-next-line / irregular spacing) now appears in resources[] — proving the real parser captures what the regex missed.` |
| `ac3` | `integration: an invalid-HCL .tf next to a valid .tf — run does not throw, the valid file is inventoried, the invalid one is absent (parse-failure swallowed like inventory-kubernetes).` |
| `ac4` | `unit: output-Map has exactly one entry keyed 'tf-inventory' === infraInventoryTerraform.produces[0]; TfInventory field set unchanged.`, `integration: every inventory list is sorted deterministically for an out-of-order fixture.` |
| `ac5` | `integration/templates: existing planner/__tests__/templates.test.ts + infra template count (8 infra) remain green — no registry/output-key drift.` |

## Migration

**State before:** inventory-terraform.ts extracts Terraform blocks with two module-level regexes (TWO_LABEL_BLOCK_RE/ONE_LABEL_BLOCK_RE) that match only canonical single-line block openers; non-canonical HCL (brace on the next line, irregular spacing) is silently under-reported (s1 symbol.locate bundle). The tf-inventory output shape, output key, and registry entries are as they are today; @cdktf/hcl2json is NOT yet a dependency.

**State after:** The same runtime extracts blocks by calling @cdktf/hcl2json parse() per file and walking the returned JSON into the identical tf-inventory lists. Non-canonical HCL is now captured; the output key 'tf-inventory', TfInventory field set, sorting, truncated flag, and registry entries are unchanged. @cdktf/hcl2json ^0.21.0 is a runtime dependency.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add @cdktf/hcl2json ^0.21.0 to package.json dependencies and install (updates package-lock). No copy-assets change — the WASM is embedded in the JS bundle. — ↩ rollbackable
2. In inventory-terraform.ts, replace the two regex .matchAll passes inside the per-file loop with `const json = await parse(f.relPath, text)` wrapped in the existing try/catch (log.debug + continue on failure), then walk json.resource/data/module/provider/variable/output into the existing resources/data/modules/providers/variables/outputs accumulators, keeping bumpFile, sorting, and the return statement intact. Remove the now-dead TWO_LABEL_BLOCK_RE/ONE_LABEL_BLOCK_RE constants. — ↩ rollbackable
3. Update infra-runtimes.test.ts: keep the canonical .tf fixture assertions (2 resources/1 provider/1 data/2 variables/1 output) and add a non-canonical-HCL fixture case (brace-on-next-line) plus an invalid-HCL-dropped case. — ↩ rollbackable
4. Run the analyze test sweep + typecheck; confirm the templates.test.ts infra count (8) and the tf-inventory output-key assertions stay green. — ↩ rollbackable

**Backward compat:** No public API change. execute()'s signature, the 'tf-inventory' output key, and the TfInventory field set are byte-for-byte unchanged, so every consumer via INFRA_RUNTIMES sees the same contract. The only observable difference is MORE-complete inventory data (previously-missed non-canonical blocks now appear) — a strict superset for well-formed repos, not a breaking change. Downstream consumers that only read the documented fields are unaffected.

## Alternatives considered

### a1: Direct block-group walk into the existing lists — **CHOSEN**

Call parse() once per file, then walk json.resource/data/module/provider/variable/output straight into the existing resources/data/modules/providers/variables/outputs arrays, preserving the exact tf-inventory shape.

Inside the existing per-file loop, replace the two regex .matchAll passes with `const json = await parse(f.relPath, text)`. Then: for json.resource, iterate type keys then name keys, push {file, type, name}; json.data the same into data[]; json.module/provider/variable/output iterate name keys, push {file, name} (module) or the bare name (providers/variables/outputs). Keep bumpFile(filesSeen, ...) per matched block exactly as today, keep the .tfvars bump-then-decrement no-op, keep every list sorted at the end, keep truncated from walkFiles. The output Map key 'tf-inventory' and inventory shape are byte-for-byte unchanged. Per-file parse errors are caught (log.debug + continue).

### a2: Extract a typed hcl2json-to-inventory mapper module

Same parse() swap, but factor the JSON-walk into a separate pure function (e.g. mapHclJsonToBlocks) in a new _hcl.ts, unit-tested independently of the filesystem walk.

Add src/analyze/runtimes/infra/_hcl.ts exporting a pure `collectTfBlocks(file, json)`; inventory-terraform.ts calls parse() then feeds the JSON to this mapper and merges into the accumulators. The mapper is covered by its own focused unit tests while infra-runtimes.test.ts keeps the end-to-end fixture assertions.

**Rejected because:** Functionally equal to a1 and cleaner-seamed, but adds a new file + second test set with no current second consumer — speculative reuse that oversizes a small single-file swap (YAGNI).

### a3: Parse-with-regex-fallback (belt and suspenders)

Try parse(); on any per-file parse failure, fall back to the old regexes for that file instead of dropping it.

Keep both extractors. Wrap parse() in try; on success walk the JSON; on failure, run the legacy regexes against the same text so a file the WASM parser rejects still contributes whatever the regex can find, then continue.

**Rejected because:** Violates parse-failure-swallowed (diverges from the story's swallow-and-continue decision) and is only partial on determinism (two order-dependent extraction paths). Keeps the very regexes the story exists to delete; regex 'recovery' on parser-rejected files yields low-confidence rows against the accuracy-first principle.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — src/analyze/runtimes/infra/inventory-terraform.ts (runtime shape, regex extractors, walkFiles filter, sorting, tf-inventory output)` — "extracts blocks with two module-level regexes ... returns { outputs: new Map([['tf-inventory', inventory]]) } ... The regexes only match canonical single-line block openers — non-canonical HCL ... is "
- **[[c2]]** `analyze-bundle` `s1 usage.example — src/analyze/runtimes/infra/inventory-kubernetes.ts + _shared.ts (per-file try/catch+continue precedent; walkFiles helpers)` — "runs js-yaml loadAll inside try/catch; on a parse throw it log.debug's and continues, so a single malformed manifest is dropped from the inventory rather than crashing the whole runtime."
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — src/analyze/runtimes/infra/index.ts + src/analyze/planner/templates/infra/index.ts (INFRA_RUNTIMES + INFRA_TEMPLATES dual registration, produces-key 'tf-inventory')` — "The produces-key 'tf-inventory' must remain === the output-Map key the runtime emits. No caller reads the runtime except via INFRA_RUNTIMES."
- **[[c4]]** `analyze-bundle` `s1 test.locate — src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts (temp-dir fixture harness; terraform counts 2 resources/1 provider/1 data/2 variables/1 output)` — "asserts the tf-inventory yields its resources/data/modules/providers/variables/outputs counts ... plus sorted determinism."
- **[[c5]]** `analyze-bundle` `s1 search.text — @cdktf/hcl2json parse API + packaging (spike-confirmed)` — "parse(filename: string, contents: string): Promise<Record<string, any>> returns HCL-as-JSON where json.resource is {type:{name:[...blocks]}} ... the WASM is embedded in the JS bundle so copy-assets.mj"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-07-28T19:38:58.037Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | src/analyze/runtimes/infra/inventory-terraform.ts exists and extracts Terraform blocks with two module-level regexes TWO_LABEL_BLOCK_RE and ONE_LABEL_BLOCK_RE, returning an output Map keyed 'tf-inventory'. | Confirmed in source: inventory-terraform.ts:66 defines TWO_LABEL_BLOCK_RE=/^(resource\|data)\\s+"([^"]+)"\\s+"([^"]+)"\\s*\\{/gm, :71 ONE_LABEL_BLOCK_RE, and :218 outputs Map keyed 'tf-inventory'. All anchors resolve. | None — premise accurate; the regexes and output key are exactly as described. |
| cl2 | citation | LOW | auto | src/analyze/runtimes/infra/inventory-kubernetes.ts parses each file inside a try/catch and on a parse throw log.debug's and continues (the per-file swallow-and-continue precedent the swap mirrors). | inventory-kubernetes.ts exists (seen in walkFiles matches at :40/:71). The specific try/catch+log.debug+continue lines were not surfaced because the grep truncated at 50 hits dominated by docs, but the precedent pattern is real and used across the sibling infra runtimes. Not contradicted. | During build, confirm the k8s runtime's per-file try/catch+log.debug+continue shape directly and mirror it verbatim in the terraform swap. |
| cl3 | citation | LOW | auto | The terraform runtime is registered in INFRA_RUNTIMES in src/analyze/runtimes/infra/index.ts and declared as infraInventoryTerraform (produces:['tf-inventory']) in INFRA_TEMPLATES in src/analyze/planner/templates/infra/index.ts. | Confirmed: runtimes/infra/index.ts:38 INFRA_RUNTIMES array + :41 registers the terraform runtime; planner/templates/infra/index.ts:58 infraInventoryTerraform with :73 produces:['tf-inventory']; runtime export inventory-terraform.ts:86. Registration + produces-key match the emitted output key. | None — registration and produces-key contract are accurate; keep both untouched. |
| cl4 | citation | LOW | auto | src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts is the existing test harness that drives each infra runtime against temp-dir fixtures and asserts the terraform inventory. | Confirmed: infra-runtimes.test.ts:565 drives the runtime with scopeRef and :568 reads result.outputs.get('tf-inventory') — the harness asserts the terraform inventory as described. | None — extend this existing harness with the new fixtures. |
| cl5 | semantic | LOW | auto | The shared helper walkFiles used by the infra inventory runtimes lives in src/analyze/runtimes/infra/_shared.ts and caps traversal at 5000 files, returning a truncated flag. | Confirmed: _shared.ts:106 exports walkFiles; :90 DEFAULT_FILE_CAP=5000; callers destructure {files, truncated}. Cap and truncated flag match the premise. | None — walkFiles/.tf+.tfvars filter + truncated flag preserved as-is. |
| cl6 | inventory | LOW | auto | There are exactly 8 infra templates registered (INFRA_TEMPLATES), so the templates.test.ts infra count of 8 the migration must keep green is accurate. | Confirmed: exactly 8 'infra<Name>: AnalyzeTaskTemplate' exports in planner/templates/infra/index.ts (lines 22,40,58,76,94,112,130,144) and templates.test.ts:188 asserts getTemplatesForTarget(infra) returns 8. Count of 8 is accurate. | None — the swap does not change the infra template count; the 8-infra assertion stays green. |
| cl7 | external-contract | LOW | auto | @cdktf/hcl2json is NOT yet a dependency in package.json (the migration adds it at ^0.21.0); its named export parse(filename, contents) returns HCL-as-JSON. | Confirmed: @cdktf/hcl2json has zero source/package.json matches (docs-only), so the premise 'NOT yet a dependency' is TRUE and the migration correctly adds it. The parse() return-shape is an external-contract assertion validated by the earlier live spike, not contradicted by any source. | During build, add @cdktf/hcl2json ^0.21.0 to package.json and confirm the parse() JSON shape against its shipped TS types (already spike-verified). |
| cl8 | semantic | LOW | auto | The terraform runtime uses TF_EXT_RE=/\\.tf$/ and TFVARS_EXT_RE=/\\.tfvars$/ to filter walked files, and a filesSeen Map bumped via bumpFile — the elements the swap preserves. | Confirmed: inventory-terraform.ts:59 TF_EXT_RE=/\\.tf$/, :60 TFVARS_EXT_RE=/\\.tfvars$/, :111 bumpFile defined and called at :135/:144/:153-156. The .tf/.tfvars filter + per-file bump mechanism match the premise (the counter Map's exact identifier name was not separately grepped but the bump mechanism is present). | None — preserve TF_EXT_RE/TFVARS_EXT_RE filter and the filesSeen/bumpFile counting exactly. |
