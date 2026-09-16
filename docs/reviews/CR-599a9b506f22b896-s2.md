<!-- insrc:artifact CR-599a9b506f22b896-s2 -->

# Code review: 599a9b506f22b896:s2

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `client`

**Changed files:** 62

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/gates.ts:775 | jsonPathForMd now throws (instead of the prior best-effort dir+ext swap) when a docs/ md carries no insrc:artifact marker. This is the intended lc1 behavior (identity from the marker, never the path) and every framework-rendered artifact embeds the marker, so normal approve flows are unaffected — a deliberate behavior change from the old fallback, noted for traceability. |
| LOW | src/workflow/storage.ts:50 | The epic's own SPEC/DEF/HLD/LLD/PLAN artifacts remain committed under the OLD flat docs/ layout while S002 makes new artifacts nested. This is the LLD's explicit, accepted hand-off: existing flat artifacts are relocated by S003's one-time migration, not S002. Noted so the transitional dual-state is on the record. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/conventions.ts:120 | hldMdRel(define.meta.epicHash ?? epicSlug, ...) uses a slug as the epicHash fallback purely to satisfy the optional type; if epicHash were ever undefined a non-hex slug reaches deriveWorkItemIdentity -> hash8Of and throws rather than degrading. Unreachable in practice (a DEF always carries epicHash), but a latent throw not a graceful default. Same pattern in defineMdRel next line. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/path-scheme.ts:1 | listWorkItems/listArtifactMdPaths are part of the sc2 contract and unit-tested (path-scheme.test.ts) but have NO current production consumer — they exist for the contract surface + S003's migration. Intentional (the read-side finders the LLD expected to replace scan the hash-flat JSON store, out of scope), not a coverage gap, but they ship ahead of their consumer. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/build/standalone-record.ts:152 | FIXED IN THIS CHANGE: persistBuildRecord originally keyed the nested folder on the INCOMING rec.meta.createdAt while mergeWithPrior preserves the ORIGINAL createdAt, so a Trivial-standalone re-run across a UTC-midnight boundary would orphan the day-1 BUILD.md under a fresh day-2 folder and split the CR from it. The folder is now derived from the MERGED (preserved) record; a regression test (build-record.test.ts 'S002 regression: Trivial-standalone re-run ...') locks it. Flagged so the fix + its narrow scenario are recorded. |

