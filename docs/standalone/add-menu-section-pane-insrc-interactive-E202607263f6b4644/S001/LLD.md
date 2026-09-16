<!-- insrc:artifact LLD-3f6b4644e03d45d5-S001 -->

# LLD: S001

**Epic:** `add-menu-section-pane-insrc-interactive`
**HLD base run:** `wf-1785045576860-p06yhv`
**HLD effective hash:** `3f6b4644e03d...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `parseTiering`

```typescript
parseTiering(analyze: Record<string, unknown>): AnalyzeTiering
```

**Parameters:**
- `analyze: Record<string, unknown>` — The raw models.analyze.* config subtree (tiers.{core,mid,cheap}.{runner,model}, coreFloor, roleTiers.<roleId>, byRepo.<path>.*) read from ~/.insrc/config.json via the CLI config service. The pane feeds it the current config and consumes the parsed result as its render source of truth.

**Returns:** `AnalyzeTiering` — Parsed tiering config the pane renders. This is the exact shape the pane must round-trip on persist — read → edit → write must produce a config that re-parses to an equivalent AnalyzeTiering.

**Preconditions:**
- analyze is the models.analyze.* subtree as returned by the config service (may be partial or empty — parseTiering supplies structure for absent keys).

**Postconditions:**
- Return value is the config-layer input to the effective-tier overlay (config > DEFAULT_TIERS > taxonomy). The pane never mutates the returned object in place; edits are computed as a sparse delta against it.

### `reasoningRoleTaxonomy`

```typescript
reasoningRoleTaxonomy(): RoleTaxonomy
```

**Returns:** `RoleTaxonomy` — The built-in 28-role taxonomy mapping each role to its default tier (critical→core, peripheral→mid/cheap). Supplies the baseline the pane overlays config roleTiers overrides onto when computing the effective per-role tier.

**Postconditions:**
- Return value is stable/pure (no I/O). It is the lowest-precedence layer in the effective-tier overlay: config roleTiers override taxonomy role→tier defaults.

### `SetupPane`

```typescript
SetupPane(): ReactElement
```

**Returns:** `ReactElement` — The existing ink/React pane the new Model Tiers pane follows as a structural template — pane function signature, menu registration idiom, and the src/cli/services/config.ts show/write/reload IPC usage the Model Tiers pane mirrors for its read/persist path.

**Preconditions:**
- Wiring caveat: usage.example returned 0 callers for SetupPane — the pane→menu registration path and the config-service (show/write/reload) call site are UNVERIFIED by s1. The Model Tiers pane must recover both by reading SetupPane.tsx and its host/menu directly before mirroring them.

**Postconditions:**
- The new pane matches the anchored code style: PascalCase component, camelCase helpers, kebab-case filename.

## Data model changes

### `AnalyzeTiering` — field-modify

Existing type (src/config/analyze.ts) — the config-layer tiering shape the pane renders and must round-trip on persist. Field shape was NOT traced by s1 (backflow note 3: data-model.trace not run); its concrete fields (tiers.{core,mid,cheap}.{runner,model}, coreFloor, roleTiers.<roleId>, byRepo.<path>.*) are asserted by the Story text and CONFIG_CATALOG but must be traced against src/config/analyze.ts before the render/edit model is finalized. No schema change is introduced by this Story — 'field-modify' here denotes the Story reshapes how these fields are surfaced/edited, not the type itself.

**Call sites:**
- `src/config/analyze.ts`
- `src/cli/config-catalog.ts`

### `EffectiveTier (derived view model, pane-internal)` — new

The pane's per-role render model: the resolved tier after the overlay config roleTiers > DEFAULT_TIERS > reasoningRoleTaxonomy() role→tier default, plus coreFloor enforcement, plus a provenance tag ('taxonomy' | 'override') per the winning approach a1. A single overlay function computes this for both DISPLAY and PERSIST so read/write precedence can never diverge; persist writes only a sparse delta (changed roleTiers / tier / coreFloor keys) back through the config service, keeping ~/.insrc/config.json minimal, diffable, and forward-compatible with evolving DEFAULT_TIERS / taxonomy defaults. The provenance tag seeds a future reset-to-default with no schema change. Not persisted — derived on each render from parseTiering + DEFAULT_TIERS + reasoningRoleTaxonomy(). DEFAULT_TIERS (core=cli-claude/opus, mid=cli-claude/sonnet, cheap=ollama/qwen3.6:35b-a3b) must be confirmed as an export of src/config/analyze.ts (backflow note 6).

**Call sites:**
- `src/config/analyze.ts`
- `src/config/role-taxonomy.ts`
- `src/cli/panes/SetupPane.tsx`

## Error paths

### Error cases

- **The config service read (show/reload) IPC to the daemon rejects — socket closed, daemon not running, or a malformed JSON-RPC envelope — while the Model Tiers pane is loading its render source.** (recoverable)
  - Detection: The awaited config-service IPC promise rejects (or resolves to an error envelope) and is caught in the pane's load-effect try/catch; the pane never reaches parseTiering.
  - Response: Render a non-fatal in-pane error state ("could not load tiering config — <reason>") with a retry affordance; do not throw out of render and do not fall through into editing an empty/absent buffer.
  - User impact: User sees the tiers pane is temporarily unavailable with a reason and can retry; the rest of the TUI and other panes stay usable.
- **~/.insrc/config.json has models.analyze set to a non-object (string, array, or null) from a hand-edit, so the subtree handed to parseTiering is not a Record.** (recoverable)
  - Detection: A type guard applied to the subtree before parseTiering (typeof !== 'object' || Array.isArray || null) rejects the non-Record value; parseTiering's contract only accepts Record<string, unknown>.
  - Response: Treat the subtree as absent — render pure DEFAULT_TIERS + reasoningRoleTaxonomy() defaults with a visible "models.analyze is malformed, showing defaults" warning, and gate persist so the pane never overwrites the malformed subtree with a partial delta.
  - User impact: User is warned instead of hitting a crash or silently editing garbage; editing is blocked until the malformed config is fixed, so no partial write clobbers it.
- **The config write/reload IPC rejects after the user confirms an edit (daemon write error, disk full, or a concurrent writer).** (recoverable)
  - Detection: The awaited write IPC promise rejects (or returns an error envelope) inside the persist handler's try/catch.
  - Response: Keep the in-memory edit/delta buffer intact, surface the write error inline, and leave the pane in its edited (unsaved) state; do not mark the edit as saved or clear the buffer.
  - User impact: The user's unsaved edits survive the failure; they see the write failed and can retry without re-entering their changes.
- **A user edit would resolve a critical role below coreFloor — either by assigning that role a lower tier or by lowering coreFloor itself.** (recoverable)
  - Detection: The single overlay function that computes EffectiveTier compares each critical role's resolved tier rank against coreFloor during edit validation, before any delta is computed.
  - Response: Reject or clamp the edit with an inline message naming the offending role and the floor; never compute or persist a roleTiers/coreFloor delta that violates the floor.
  - User impact: The user cannot silently demote a critical role below the guaranteed high-tier floor; the accuracy-governs-critical-roles principle is preserved at the edit surface.
- **config models.analyze.roleTiers contains a <roleId> key that is not present in the current reasoningRoleTaxonomy() 28-role set (a role renamed or removed across versions).** (recoverable)
  - Detection: While building the per-role render list, the overlay finds a roleTiers key with no matching entry in reasoningRoleTaxonomy()'s role set.
  - Response: Surface the orphan override in a distinct "stale/unknown role" section rather than dropping it, and preserve it on persist (the sparse delta touches only edited keys) so the pane never destroys a config it does not understand.
  - User impact: User is told about stale overrides and does not lose them; forward/backward compatibility across taxonomy changes is maintained.

### Edge cases

| Input | Expected |
| :--- | :--- |
| config.json has no models.analyze key at all (or an empty {} subtree). | parseTiering supplies structure for the absent keys; the pane renders effective tiers purely from DEFAULT_TIERS + reasoningRoleTaxonomy(), every role tagged provenance 'taxonomy', coreFloor at its default, and persisting with no edits writes nothing. |
| User overrides a role to a tier that equals its resolved taxonomy default, or edits a role and then reverts it to the default. | The sparse delta omits (or removes) that roleTiers key rather than writing a redundant key equal to the default; the role's provenance returns to 'taxonomy'. |
| config models.analyze.roleTiers has an override entry for every one of the 28 taxonomy roles. | The pane renders all roles with provenance 'override', effective tiers reflect the config values, and the full-override set renders without crashing or truncating. |
| config sets tiers.core.runner but omits tiers.core.model (partial tier definition). | The overlay fills the missing model field from DEFAULT_TIERS.core.model; the pane renders the merged tier definition and a persist round-trips the partial subtree without inventing a full tier block. |
| config has models.analyze.byRepo.<path>.* entries alongside the global tiers/roleTiers. | The pane surfaces byRepo entries as their own per-repo layer, clearly distinguished from the global effective tiers, and a persist of global edits leaves the byRepo subtree untouched via the sparse delta. |

### Invariants to preserve

- Round-trip fidelity: the pane's read → edit → write path must produce a config that re-parses through parseTiering to an AnalyzeTiering equivalent to what was rendered — parseTiering is the single source of truth for the render/persist shape. [[c1]]
- A single overlay function computes EffectiveTier for BOTH display and persist, so the precedence order (config roleTiers > DEFAULT_TIERS > reasoningRoleTaxonomy() role→tier default, plus coreFloor enforcement) can never diverge between what the pane shows and what it writes. [[c1]]
- Sparse-delta persist: only changed keys (roleTiers / tier definitions / coreFloor) are written back; untouched subtrees (byRepo, unedited roleTiers, defaulted fields) remain in place so ~/.insrc/config.json stays minimal, diffable, and forward-compatible with evolving DEFAULT_TIERS / taxonomy defaults. [[c1]]
- Daemon owns config I/O: the pane reads and persists exclusively through the CLI config service show/write/reload IPC (the SetupPane path it mirrors) and never opens ~/.insrc/config.json directly. [[c1]]
- reasoningRoleTaxonomy() stays pure and stable (no I/O) and is treated as the lowest-precedence baseline the config overlays onto — the pane never mutates it in place. [[c1]]
- The new pane matches the anchored code style and pane template: PascalCase component, camelCase helpers, kebab-case filename, following the SetupPane structural pattern. [[c4]]

## Test strategy

**Test framework:** `node:test (via `tsx --test`, node's built-in test runner — the repo convention per CLAUDE.md `npx tsx --test 'src/**/__tests__/*.test.ts'`; test.locate was not run in s1 so this is grounded on the documented repo convention, not a located pane test file)`

### Test levels

- **unit** — Prove the pure overlay/tiering logic in isolation — the EffectiveTier overlay, parseTiering round-trip fidelity, sparse-delta computation, coreFloor enforcement, provenance tagging, and stale-role preservation. These are deterministic pure functions (no I/O) and are where the Story's correctness-critical invariants live, so they carry the bulk of coverage.
  - Subjects: `the single overlay function that computes EffectiveTier for both display and persist (config roleTiers > DEFAULT_TIERS > reasoningRoleTaxonomy() default, plus coreFloor enforcement, plus provenance tag)`, `parseTiering(analyze) — src/config/analyze.ts (read shape + partial/empty/malformed subtree handling)`, `reasoningRoleTaxonomy() — src/config/role-taxonomy.ts (purity/stability as lowest-precedence baseline)`, `the sparse-delta computation (read AnalyzeTiering + edits → minimal write delta touching only changed roleTiers/tier/coreFloor keys)`, `DEFAULT_TIERS export from src/config/analyze.ts (partial-tier field fill)`
  - Fixtures: `a set of hand-built models.analyze.* subtree fixtures: empty/{}, absent, partial tier (core.runner set, core.model omitted), full 28-role roleTiers override, malformed non-object (string/array/null), and a roleTiers entry with a stale/unknown roleId`, `a fixture pinning the current reasoningRoleTaxonomy() 28-role → core/mid/cheap defaults so overlay assertions are stable`, `expected EffectiveTier render models + expected sparse deltas for each fixture`
- **integration** — Prove the pane's read → edit → persist path through the CLI config service IPC boundary (mocked), including the non-fatal error states, without opening ~/.insrc/config.json directly. Verifies the Story's daemon-owns-I/O invariant and the s5 error/edge paths end-to-end within the pane.
  - Subjects: `the new Model Tiers pane component (PascalCase, src/cli/panes/*.tsx) — load-effect, render, edit, persist handlers`, `the pane ↔ src/cli/services/config.ts show/write/reload IPC usage (mirrored from SetupPane)`, `the persist handler's sparse-delta write + failure handling`
  - Fixtures: `a mock/stub config service exposing show/write/reload that can be scripted to resolve, reject, or return an error envelope`, `ink-testing-library (or the repo's existing CLI pane render harness) to render the pane and assert output/error states`, `canned config payloads reused from the unit fixtures (empty, byRepo-present, malformed, full-override)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: overlay resolves each role via config roleTiers > DEFAULT_TIERS > reasoningRoleTaxonomy() default and tags provenance 'override' vs 'taxonomy'`, `unit: the SAME overlay function output drives both the render model and the persist delta (single-source assertion — display and persist precedence cannot diverge)`, `integration: rendered pane rows match the overlay EffectiveTier for a mixed config (some overrides, some defaults)` |
| `ac2` | `unit: read → edit → write → re-parse through parseTiering yields an AnalyzeTiering equivalent to the rendered source (round-trip fidelity)`, `unit: persisting with no edits produces an empty delta / no write for an absent or {} models.analyze subtree`, `integration: persist round-trips a partial-tier subtree (core.runner set, core.model omitted) without inventing a full tier block` |
| `ac3` | `unit: editing one roleTiers entry writes a delta touching only that key; byRepo and unedited roleTiers subtrees are left untouched`, `unit: overriding a role to its resolved taxonomy default (or reverting an edit) omits/removes the roleTiers key rather than writing a redundant one, and provenance returns to 'taxonomy'`, `integration: persisting a global edit leaves an existing models.analyze.byRepo.<path>.* subtree byte-for-byte in place` |
| `ac4` | `unit: an edit that would resolve a critical role below coreFloor (via role tier or lowered coreFloor) is rejected/clamped and no floor-violating delta is computed`, `integration: attempting the below-floor edit in the pane surfaces an inline message naming the offending role and the floor and blocks persist` |
| `ac5` | `integration: a config-service show/reload rejection renders a non-fatal in-pane error state with reason + retry and never falls into editing an empty buffer`, `integration: a write/reload rejection after confirm keeps the in-memory edit buffer intact, surfaces the error inline, and does not mark the edit saved`, `unit: a non-object models.analyze subtree is guarded before parseTiering and yields pure DEFAULT_TIERS + taxonomy defaults with a malformed warning and persist gated` |
| `ac6` | `unit: a roleTiers key with no matching reasoningRoleTaxonomy() role is surfaced as a stale/unknown override and preserved (not dropped) on persist via the sparse delta`, `integration: pane renders full 28-role override set and a byRepo layer without crashing or truncating; new pane file/component/helper naming matches the anchored kebab-case/PascalCase/camelCase convention` |

## Migration

**State before:** Per s1 analyze bundles, the per-role model-tiering surface is SHIPPED and indexed but has NO view/edit UI in the insrc TUI. symbol.locate (s1) pins the current, verbatim signatures the pane must consume: parseTiering(analyze): AnalyzeTiering (src/config/analyze.ts:409–422) parses the models.analyze.* subtree; reasoningRoleTaxonomy(): RoleTaxonomy (src/config/role-taxonomy.ts:101–103) supplies the 28-role core/mid/cheap defaults; SetupPane(): ReactElement (src/cli/panes/SetupPane.tsx:21–76) is the existing ink/React pane template. The config keys (models.analyze.tiers.{core,mid,cheap}.{runner,model}, coreFloor, roleTiers.<roleId>, byRepo.<path>.*) live in ~/.insrc/config.json, edited today only by hand — there is no pane surface. s1 grounding gaps stand: the pane→menu wiring and the src/cli/services/config.ts show/write/reload IPC path are UNVERIFIED (usage.example returned 0 callers on SetupPane); data-model.trace was not run so AnalyzeTiering field shapes are asserted-not-traced; and DEFAULT_TIERS (core=cli-claude/opus, mid=cli-claude/sonnet, cheap=ollama/qwen3.6:35b-a3b) is named but not surfaced as a located export.

**State after:** A new Model Tiers pane exists in the insrc TUI, following the SetupPane template (PascalCase component, camelCase helpers, kebab-case filename), registered in the CLI menu. It reads models.analyze.* via the existing config service (show), parses it with parseTiering, and renders the EFFECTIVE per-role tier by overlaying config roleTiers over DEFAULT_TIERS over reasoningRoleTaxonomy() role→tier defaults, with coreFloor enforced and a provenance tag ('taxonomy' | 'override') per role. The user can edit tiers, coreFloor, and roleTiers overrides and persist them; persist writes only a sparse delta of changed keys back through the config service (write + reload), keeping ~/.insrc/config.json minimal and diffable. No config schema change; no existing public API changed.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Recover the s1 grounding gaps before building: read src/cli/panes/SetupPane.tsx to confirm the pane→menu registration idiom and the src/cli/services/config.ts show/write/reload IPC usage, and confirm DEFAULT_TIERS (core=cli-claude/opus, mid=cli-claude/sonnet, cheap=ollama/qwen3.6:35b-a3b) plus the AnalyzeTiering field shape are exported from src/config/analyze.ts. Read-only inspection; changes no state. — ↩ rollbackable
2. Add the new Model Tiers pane as a new kebab-case file mirroring the SetupPane component structure. Purely additive; no existing file changes behavior. — ↩ rollbackable
3. Register the new pane in the CLI menu/host alongside the existing panes, using the same registration idiom recovered in step 1. Additive menu entry only. — ↩ rollbackable
4. Wire the pane's read path to the existing config service show IPC: fetch the models.analyze.* subtree and feed it verbatim into parseTiering as the render source of truth. No mutation of config or of the parsed object. — ↩ rollbackable
5. Add a single overlay function that derives the EffectiveTier view model — config roleTiers over DEFAULT_TIERS over reasoningRoleTaxonomy() defaults, coreFloor enforced, provenance tag per role — used for BOTH display and persist so precedence cannot diverge. Derived per render; nothing persisted. — ↩ rollbackable
6. Wire the persist path to compute a sparse delta of only the changed roleTiers/tier/coreFloor keys and write it back via the config service write + reload IPC. Non-destructive: unrelated config keys are preserved, so a persist can be undone by clearing the added delta keys. — ↩ rollbackable

**Backward compat:** No existing public API is changed — parseTiering, reasoningRoleTaxonomy, and SetupPane are consumed as-is (s4 surfaceLevel: internal), so no signature or contract migration is required. The on-disk config remains backward-compatible: persist writes only a sparse delta of changed models.analyze.* keys, leaving all unrelated keys untouched and omitting keys that match DEFAULT_TIERS / taxonomy defaults, so the file stays forward-compatible with evolving DEFAULT_TIERS and taxonomy defaults. Configs written before this pane existed read unchanged; configs written by the pane re-parse to an equivalent AnalyzeTiering and remain hand-editable.

## Alternatives considered

### a1: Effective-overlay view-model with sparse-delta persistence — **CHOSEN**

Pane binds to a derived 28-row effective-tier view (config over DEFAULT_TIERS over taxonomy) and persists only the diff back into models.analyze.*.

Introduce a pane-local view-model, EffectiveTierView, computed once on load from three inputs the Story already consumes: reasoningRoleTaxonomy() (28 roles → core/mid/cheap defaults), DEFAULT_TIERS (the three {runner,model} tier definitions), and parseTiering(config) (the AnalyzeTiering overrides). Each row carries { roleId, resolvedTier, source: 'taxonomy' | 'override' }, and the header carries the three resolved tier definitions plus coreFloor. Editing mutates an in-memory override map (roleId → tier, plus tier-definition and coreFloor edits) layered on top of the loaded snapshot; the rendered value always re-derives through the same overlay so the user sees the true effective value while editing. On save, the pane diffs the override map against the taxonomy/DEFAULT_TIERS baseline and writes ONLY the changed keys — models.analyze.roleTiers.<roleId>, models.analyze.tiers.{core,mid,cheap}.{runner,model}, models.analyze.coreFloor — through the existing config service (show/write/reload IPC). The overlay precedence (config > DEFAULT_TIERS > taxonomy) is stated in the Story and is the single source of truth for both render and persist.

### a2: Raw AnalyzeTiering 1:1 config mirror

Pane binds directly to the parsed AnalyzeTiering shape and renders/edits config keys verbatim, showing taxonomy/DEFAULT_TIERS only as read-only placeholders.

Skip any derived effective-view. The pane's edit model IS the AnalyzeTiering object returned by parseTiering(config): the three tiers.{core,mid,cheap}.{runner,model}, coreFloor, roleTiers.<roleId>, and byRepo.<path>.*. It renders these keys 1:1 with CONFIG_CATALOG entries in src/cli/config-catalog.ts, showing only what is explicitly set. DEFAULT_TIERS and reasoningRoleTaxonomy() defaults appear next to unset fields as dimmed placeholder hints ('default: cli-claude/opus') but are never merged into the edit state. Editing sets or clears a key on the AnalyzeTiering object; persist writes that object straight back through the config service. The pane is effectively a typed form over the tiering slice of config.

**Rejected because:** a2 is the smallest, lowest-risk surface and is lossless key-for-key on round-trip, but it explicitly does NOT show the effective tier the Story calls for — the user sees set-vs-unset, not the resolved value after overlay — so it under-delivers the core stated user value. coreFloor's effect on the resolved tier is invisible, and the dimmed placeholder-vs-value distinction is easy to misread in a TUI. Ranked last because it fails the Story's central intent that both winners satisfy, despite being cheapest.

### a3: Layered source-tagged three-band model

Render model keeps taxonomy, DEFAULT_TIERS, and config-override as three distinct bands per role, showing the resolved value plus which layer won; edits only ever touch the override band.

Model each of the 28 role rows as a discriminated stack: { roleId, taxonomyTier, defaultDefinition, override?: tier, resolved: tier, winningLayer }. The pane surfaces all three layers rather than collapsing them — the resolved effective tier is shown prominently, with the taxonomy default and any override rendered as subordinate context so provenance is explicit at all times. Tier definitions ({runner,model}) and coreFloor are shown as their own labeled bands (built-in DEFAULT_TIERS vs config-set). Editing is constrained to the override band only: a role edit writes/clears models.analyze.roleTiers.<roleId>; a tier-definition or coreFloor edit writes the corresponding models.analyze.* key. Baseline bands (taxonomy, DEFAULT_TIERS) are strictly read-only. Persist writes only override-band mutations via the config service.

**Rejected because:** a3 is the most transparent — it surfaces the effective tier AND the full provenance chain, confines edits structurally to the override band (baseline can never be overwritten), and makes coreFloor/DEFAULT_TIERS first-class. It fully satisfies the effective-tier intent, ranking above a2. It loses to a1 on cost and ergonomics: the richest render model is L cost and its multi-band layout is expensive for 28 roles in a vertically constrained ink/React TUI, with a stated risk of overwhelming users who only want the effective value and a quick edit. a1 achieves the same correctness guarantees (effective value + provenance + clean override-only writes) with a lighter surface.

## Open questions

- dm1 (partial): AnalyzeTiering lists src/cli/config-catalog.ts as a callSite, but that file appears in NO s1 analyze bundle's pathsCited — s1 backflow note 4 flags CONFIG_CATALOG's tiering keys as asserted by the Story text but NOT bundle-grounded. Trace models.analyze.tiers/coreFloor/roleTiers/byRepo against src/cli/config-catalog.ts before build.
- ep3 (partial): Two invariants — 'single overlay function computes EffectiveTier for both display and persist' and 'sparse-delta persist' — are design decisions derived from alternative a1 but cited to c1 (symbol.locate), which does not actually exhibit them; taxonomy purity is likewise asserted rather than surfaced by a bundle. These are design-derived guarantees to be validated in implementation, not properties an s1 bundle demonstrates.
- ts2 (partial): The chosen test framework (node:test via `tsx --test`) matches the documented CLAUDE.md repo convention, but test.locate was not run in s1 and convention.detect reported no test files, so the framework choice is convention-grounded, not analyze-grounded. Locate the existing CLI pane test pattern before writing the test plan.
- Story-authoring gap (ts1/s8): the Story shipped zero acceptanceCriteria; ac1–ac6 are LLD-synthesized test-plan labels. Consider back-filling explicit Story acceptance criteria so the test mapping is Story-sourced rather than LLD-derived.
- s1 backflow gaps to confirm at build time: pane→menu registration wiring and the src/cli/services/config.ts show/write/reload IPC call path are UNVERIFIED (usage.example returned 0 callers on SetupPane); data-model.trace was not run so AnalyzeTiering field shapes are asserted-not-traced; and DEFAULT_TIERS (core=cli-claude/opus, mid=cli-claude/sonnet, cheap=ollama/qwen3.6:35b-a3b) is named but not surfaced as a located export of src/config/analyze.ts.

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[symbol.locate]` — "parseTiering(analyze: Record<string, unknown>): AnalyzeTiering (src/config/analyze.ts:409–422) parses the models.analyze.* config into an AnalyzeTiering — this is the reader the pane renders and the s"
- **[[c2]]** `step-output` `s4.api + s4.dataModel + s4.interactionWithShared` — "surfaceLevel: internal — parseTiering, reasoningRoleTaxonomy, SetupPane consumed as-is; EffectiveTier is the new pane-internal derived view model"
- **[[c3]]** `step-output` `s3.winnerId + s3.judgments` — "a1 wins on best fit to the Story's stated intent (render the true effective tier, coreFloor, and override provenance) at proportionate cost."
- **[[c4]]** `step-output` `s1.analyzeBundles[convention.detect]` — "convention.detect reports camelCase functions (9/9, unanimous) and PascalCase classes (6/6, unanimous); file naming kebab-case"
- **[[c5]]** `step-output` `s5.errorCases + s5.edgeCases + s5.invariantsToPreserve` — "5 errorCases (config read reject, malformed subtree, write reject, below-coreFloor edit, stale roleId) + 5 edgeCases + 6 invariants"
- **[[c6]]** `step-output` `s6.testFramework + s6.testLevels + s6.acceptanceMapping` — "node:test (via `tsx --test`) — unit overlay/tiering logic + integration pane read→edit→persist through mocked config service IPC"
- **[[c7]]** `step-output` `s7.migrationSteps + s7.backwardCompat` — "A new Model Tiers pane exists in the insrc TUI ... persist writes only a sparse delta of changed keys back through the config service"
- **[[c8]]** `step-output` `s8.results` — "partial verdicts: dm1 (config-catalog.ts not bundle-grounded), ep3 (design-derived invariants cited to c1), ts2 (test framework convention-grounded not analyze-grounded); sbdry1-4 all passed"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-26T06:17:21.988Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | parseTiering(analyze): AnalyzeTiering is defined in src/config/analyze.ts around lines 409-422. | read confirms src/config/analyze.ts:409 = `export function parseTiering(analyze: Record<string, unknown>): AnalyzeTiering {` — exactly as cited. | none — verified sound |
| c1 | citation | LOW | manual | reasoningRoleTaxonomy(): RoleTaxonomy is defined at src/config/role-taxonomy.ts:101-103 and exposes the role→tier defaults. | read confirms src/config/role-taxonomy.ts:101 = `export function reasoningRoleTaxonomy(): RoleTaxonomy {` — the role→tier default source. | none — verified sound |
| backflow6 | citation | LOW | manual | DEFAULT_TIERS is an export of src/config/analyze.ts with core=cli-claude/opus, mid=cli-claude/sonnet, cheap=ollama/qwen3.6:35b-a3b. | DEFAULT_TIERS exported at src/config/analyze.ts:122; :123 core={cli-claude, opus}; analyze-tiering.test.ts pins mid/cheap. Resolves the LLD's 'DEFAULT_TIERS not located' open question. | none — verified sound |
| dm1 | semantic | LOW | manual | AnalyzeTiering carries tiers.{core,mid,cheap}, coreFloor, roleTiers, and byRepo fields in src/config/analyze.ts. | AnalyzeTiering at src/config/analyze.ts:138 extends TieringOverride (:129, which carries tiers/roleTiers/coreFloor) and adds byRepo? (:139). The full field shape (tiers/coreFloor/roleTiers/byRepo) is confirmed — resolves the asserted-not-traced gap. | none — verified sound |
| dm1 | citation | LOW | manual | CONFIG_CATALOG in src/cli/config-catalog.ts carries the models.analyze tier keys (tiers.core.runner, coreFloor). | config-catalog.ts:64 models.analyze.coreFloor, :65-66 models.analyze.tiers.core.{runner,model} — the tier keys exist in CONFIG_CATALOG. Resolves the dm1 open question. | none — verified sound |
| c4 | citation | LOW | manual | SetupPane is an ink/React pane component in src/cli/panes/SetupPane.tsx (the template the new pane mirrors). | SetupPane at src/cli/panes/SetupPane.tsx:21; imported in src/cli/app.tsx:28 and rendered at app.tsx:108 (`pane === 3 && <SetupPane />`). This RESOLVES the 'pane→menu wiring UNVERIFIED' open question — the new pane registers the same way (a `pane === 4` branch in app.tsx). | none — verified sound; the menu wiring is the app.tsx pane-index switch |
| invariant | citation | LOW | manual | The CLI config service (src/cli/services/config.ts) exposes show/write/reload over daemon IPC — the pane's read/persist path. | config service: config.ts:15 show, :19 write(path,value)→{ok}, :23 reload→{ok, reloaded?}; wired in services/index.ts:129-131; daemon handlers at daemon/index.ts:1116/1125/1150. Resolves the 'config-service call path unverified' open question. | none — verified sound |
