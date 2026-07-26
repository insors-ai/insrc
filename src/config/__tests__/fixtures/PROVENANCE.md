# Config-reconcile test fixtures — provenance

These fixtures back the schema-driven config-reconcile feature (epic
`add-schema-driven-config-migration-runs`, story S001). Blind preservation
of the catalog-unenumerable dynamic namespaces is the acceptance requirement
with the least evidence behind it, so this note records exactly where each
fixture came from and how it was altered — a reviewer must be able to
distinguish a captured document from a hand-authored guess.

## `legacy-config.json` (+ `legacy-config.baseline.json`)

**Origin.** Captured from a real `~/.insrc/config.json` on this machine on
**2026-07-26**. The captured base is verbatim: `logLevel`, `ollama.host`, all
of `models.local` / `models.embedding` / `models.embeddingDim` /
`models.tiers.*` / `models.context.*`, `models.analyze.shaperProvider`,
`permissions.mode`, and `routing.mode` are exactly as they were on disk. This
is the classic regression shape — it predates the per-role tiering schema, so
it carries `models.analyze.shaperProvider` but **none** of the newer catalog
keys (`models.analyze.tiers.*`, `models.analyze.coreFloor`,
`models.analyze.maxPlanDepth.*`, `models.providers.local.*`, …), which is the
exact failure the reconcile fixes.

**Structure-preserving augmentations.** This machine's real config predates
the dynamic-namespace features, so — to exercise blind preservation against
realistic data — the following were added. Each is a real config SHAPE defined
elsewhere in the codebase, not an invented shape:

- `models.analyze.roleTiers.<roleId>` — role ids drawn from the real
  `reasoningRoleTaxonomy()` (src/config/role-taxonomy.ts); values are the real
  tier names `core` / `mid` / `cheap`.
- `models.analyze.byRepo.<absPath>.*` — the real per-repo override shape read
  by `resolveRepoShaperProvider` (src/config/analyze.ts). The absolute-path
  key is **redacted** to `/Users/redacted/work/projects/example/repo`
  (structure-preserving: still an absolute path string key).
- `models.agents.implementation.*` — the real `models.agents` namespace shape.
- `legacyOrphanKey` — a top-level key absent from the catalog, to prove an
  un-cataloged scalar survives blindly.

**Deliberate type-invalid key.** `models.embeddingDim` is stored as the STRING
`"1024"` (the catalog row declares `number`) to exercise the repair path — a
present-but-type-invalid catalog key that reconcile must repair to the default
`1024`, recording the discarded `"1024"`.

**Redactions.** Only the `byRepo` absolute-path key was redacted (see above).
No credential, token, or secret value appears in the original or the fixture.

**Baseline.** `legacy-config.baseline.json` is a byte-identical pristine copy
of `legacy-config.json` at capture time, so before/after can be diffed
byte-for-byte even if a test writes over a scratch copy of the fixture.

## `daemon-defaults-literal.json`

The hand-rolled first-boot defaults literal that lived at
`src/daemon/index.ts:180-192` **before** this story, captured verbatim as JSON.
The boot reconcile (t9) deletes that literal in favour of catalog defaults; the
t9 test asserts every key of this literal is deep-equal to its catalog default
(first-boot equivalence), and t13 diffs a real first-boot write against it.
