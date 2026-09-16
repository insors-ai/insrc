<!-- insrc:artifact LLD-3e701ba812813029-S001 -->

# LLD: S001

**Epic:** `specartifact-md-json-path-resolution-jsonpathformd`
**HLD base run:** `wf-1785865264786-q930nt`
**HLD effective hash:** `3e701ba81281...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `jsonPathForMd`

```typescript
(mdPath: string) => string
```

**Parameters:**
- `mdPath: string` — A docs md/html (or json) artifact path to resolve to its json.

**Returns:** `string` — The resolved .insrc/artifacts/<ID>.json path (or the input unchanged for json / stub side-by-side).

**Errors:**
- `Error` when input is not .md/.html/.json (unchanged).

**Preconditions:**
- mdPath is an artifact path under a recognized docs dir

**Postconditions:**
- A docs/specs/SPEC-<slug>.md (carrying the insrc:artifact marker) now resolves to .insrc/artifacts/SPEC-<hash>.json via the marker path; docs/reviews likewise; behavior for defines/designs/plans/builds/stub/json is unchanged. Signature unchanged — both approve + review consumers are fixed transitively.

### `repoRootFromDocsPath`

```typescript
(p: string) => string | undefined
```

**Parameters:**
- `p: string` — An artifact md path.

**Returns:** `string | undefined` — The repo root (prefix before the /docs/<dir>/ segment), or undefined when no recognized docs dir segment is present.

**Errors:**
- `none` when total function.

**Postconditions:**
- Recognizes every docs dir in DOCS_ARTIFACT_DIRS + STUB_DIR (now including docs/specs + docs/reviews), derived from the storage.ts constants instead of a hardcoded literal list.

### `swapDocsToArtifacts`

```typescript
(p: string) => string
```

**Parameters:**
- `p: string` — An artifact md path (legacy hash-named fallback).

**Returns:** `string` — The path with its /docs/<dir>/ segment swapped to /.insrc/artifacts/ (stub excluded, side-by-side).

**Errors:**
- `none` when total function; returns input unchanged when no artifact docs dir matches.

**Postconditions:**
- Swaps for every dir in DOCS_ARTIFACT_DIRS (now including docs/specs + docs/reviews); STUB_DIR stays side-by-side (excluded).

## Data model changes

### `DOCS_ARTIFACT_DIRS (new exported constant in storage.ts)` — new

A single canonical list of the docs directories whose rendered md maps to a hash/slug-named json under ARTIFACTS_DIR: [DEFINES_DIR, DESIGNS_DIR, PLANS_DIR, BUILDS_DIR, SPECS_DIR, REVIEWS_DIR]. STUB_DIR is intentionally EXCLUDED (its md+json sit side-by-side). Exported from storage.ts (the source of the *_DIR constants) so the gates.ts resolver derives its segment lists from one place — removing the duplication that omitted /docs/specs/.

```
+export const DOCS_ARTIFACT_DIRS = [DEFINES_DIR, DESIGNS_DIR, PLANS_DIR, BUILDS_DIR, SPECS_DIR, REVIEWS_DIR] as const;
```

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/gates.ts:784`
- `src/workflow/gates.ts:801`

## Error paths

### Error cases

- **A spec md has no readable insrc:artifact marker (hand-written / pre-marker file) so the marker path can't rebuild the hash-named json.** (recoverable)
  - Detection: readArtifactIdMarker returns undefined (file unreadable or no marker); jsonPathForMd sees id===undefined and takes the fallback branch.
  - Response: Fall through to swapExt(swapDocsToArtifacts(md)) — which now recognizes docs/specs and swaps to .insrc/artifacts/SPEC-<same-basename>.json. For a marker-less slug-named spec this may not match the hash-named json, but it is strictly no worse than today and never throws.
  - User impact: A marker-bearing spec (the normal rendered case) resolves correctly; a marker-less one degrades to the legacy swap, same as any other artifact type.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A docs/specs/SPEC-<slug>.md carrying `<!-- insrc:artifact SPEC-<hash> -->`. | repoRootFromDocsPath now recognizes /docs/specs/ -> repo root; marker path returns <root>/.insrc/artifacts/SPEC-<hash>.json (the real spec json). |
| A docs/reviews/CR-<slug>.md (also previously unrecognized). | Now recognized via DOCS_ARTIFACT_DIRS; resolves to its .insrc/artifacts json like any other artifact. |
| A docs/stub/x.md. | Unchanged — STUB_DIR stays the side-by-side exception (excluded from DOCS_ARTIFACT_DIRS); returns docs/stub/x.json. |
| An already-json path, or a defines/designs/plans/builds md. | Byte-identical to today (json passthrough; existing dirs still resolve). |

### Invariants to preserve

- jsonPathForMd's signature (mdPath: string) => string is unchanged; the shared resolver keeps working for insrc_workflow_approve + insrc_review_step with no consumer edits (both fixed transitively). [[c3]]
- docs/stub remains the side-by-side exception (md+json under the same slug basename) — it must stay EXCLUDED from the artifact-dir swap, or stub json resolution breaks. [[c1]]
- The explicit allow-list semantics are preserved: only the enumerated DOCS_ARTIFACT_DIRS map into .insrc/artifacts; non-artifact docs dirs are not mapped (no over-broad matching). [[c1]]
- DOCS_ARTIFACT_DIRS is derived from the same *_DIR constants storage.ts uses to WRITE the artifacts, so the read-resolver and the write-paths cannot drift. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (extends the existing src/workflow/__tests__/gates.test.ts jsonPathForMd suite)`

### Test levels

- **unit** — jsonPathForMd resolves a SpecArtifact md (marker path) to its hash-named json, and preserves every existing resolution.
  - Subjects: `a docs/specs/SPEC-<slug>.md carrying the insrc:artifact marker resolves to <root>/.insrc/artifacts/SPEC-<hash>.json (marker path)`, `a docs/reviews/CR-<slug>.md now resolves to its .insrc/artifacts json (also newly covered)`, `docs/defines + docs/designs still resolve (regression); docs/stub stays side-by-side; a json path passes through unchanged`, `DOCS_ARTIFACT_DIRS is exported from storage.ts and excludes STUB_DIR`
  - Fixtures: `mkdtemp repo with a docs/specs/SPEC-<slug>.md file whose head carries `<!-- insrc:artifact SPEC-<hash> -->``, `no-file path-only cases for the existing dirs (fallback swap)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a docs/specs/SPEC-<slug>.md carrying the insrc:artifact marker resolves to <root>/.insrc/artifacts/SPEC-<hash>.json (marker path)` |
| `ac2` | `docs/defines + docs/designs still resolve (regression); docs/stub stays side-by-side; a json path passes through unchanged`, `a docs/reviews/CR-<slug>.md now resolves to its .insrc/artifacts json (also newly covered)` |
| `ac3` | `DOCS_ARTIFACT_DIRS is exported from storage.ts and excludes STUB_DIR` |

## Migration

**State before:** repoRootFromDocsPath (gates.ts:784) + swapDocsToArtifacts (gates.ts:801) each hardcode a literal docs-dir segment list that omits /docs/specs/ (and /docs/reviews/), while storage.ts holds the canonical *_DIR constants incl. SPECS_DIR/REVIEWS_DIR (per the s1 gates + storage bundles). A spec md therefore fails to resolve to its .insrc/artifacts json.

**State after:** storage.ts exports DOCS_ARTIFACT_DIRS (derived from the *_DIR constants, excluding STUB_DIR); the two gates.ts helpers derive their segment lists from it, so docs/specs + docs/reviews resolve and the list can't drift from the write-paths.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the exported DOCS_ARTIFACT_DIRS constant in storage.ts (defines/designs/plans/builds/specs/reviews; stub excluded). — ↩ rollbackable
2. In gates.ts, replace the two hardcoded literal segment arrays with segments derived from DOCS_ARTIFACT_DIRS (repoRootFromDocsPath additionally keeps STUB_DIR; swapDocsToArtifacts excludes it). — ↩ rollbackable
3. Extend gates.test.ts with the docs/specs marker-path case + regression assertions for the existing dirs and stub. — ↩ rollbackable

**Backward compat:** Pure superset. No public API signature changes (jsonPathForMd/repoRootFromDocsPath/swapDocsToArtifacts keep their signatures); the resolver recognizes MORE docs dirs (specs, reviews) and behaves byte-identically for defines/designs/plans/builds/stub/json. No on-disk data changes; existing artifacts + their md/json layout are untouched. Both approve + review consumers are fixed transitively with no edits.

## Alternatives considered

### a1: Centralize a DOCS_ARTIFACT_DIRS list derived from the storage.ts *_DIR constants — **CHOSEN**

Export one canonical docs-dir list from storage.ts and drive both gates.ts helpers off it, so /docs/specs/ (and /docs/reviews/) are covered and the list can never drift again.



### a2: Minimal: add '/docs/specs/' to the two hardcoded arrays

Append '/docs/specs/' (and '/docs/reviews/') to the literal segment lists, leaving them hardcoded.



**Rejected because:** VIOLATES prevent-recurrence: leaves the duplicated hardcoded lists — the exact drift that caused THIS bug recurs on the next docs dir. Rejected for leaving the root cause.

### a3: Generic /docs/<segment>/ matcher

Rewrite the helpers to match any /docs/<name>/ segment generically via a regex.



**Rejected because:** VIOLATES no-overbroad-mapping: would map ANY /docs/<name>/ (incl. non-artifact prose docs) into .insrc/artifacts, discarding the deliberate explicit allow-list. Accuracy-first favors the enumerated a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — src/workflow/gates.ts:750/784/801: jsonPathForMd marker-path + fallback; repoRootFromDocsPath + swapDocsToArtifacts hardcode a docs-dir list omitting /docs/specs/ (+/docs/reviews/); docs/stub is the side-by-side exception`
- **[[c2]]** `analyze-bundle` `s1 search.text — src/workflow/storage.ts:50-61 canonical *_DIR constants (ARTIFACTS_DIR, DEFINES/DESIGNS/PLANS/BUILDS/STUB/REVIEWS/SPECS_DIR); DOCS_ARTIFACT_DIRS derives from these to remove the duplication`
- **[[c3]]** `analyze-bundle` `s1 usage.example — jsonPathForMd is the shared resolver consumed by insrc_review_step (src/mcp/review-step/phases/start.ts) + insrc_workflow_approve (cli/services/workflow.ts); the spec md carries the `<!-- insrc:artifact SPEC-<hash> -->` marker so both surfaces are fixed transitively`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-04T17:45:59.931Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | jsonPathForMd (gates.ts:750) resolves via readArtifactIdMarker + repoRootFromDocsPath, with a swapExt(swapDocsToArtifacts) fallback; repoRootFromDocsPath (gates.ts:784) + swapDocsToArtifacts (gates.ts:801) hardcode a docs-dir segment list that omits /docs/specs/. | grep/read confirm jsonPathForMd + repoRootFromDocsPath + swapDocsToArtifacts in gates.ts, and that /docs/specs/ is absent from their hardcoded segment lists — the bug + fix site as described. | none — verified sound. |
| c2 | inventory | LOW | manual | storage.ts exports the canonical docs-dir constants DEFINES_DIR/DESIGNS_DIR/PLANS_DIR/BUILDS_DIR/STUB_DIR/REVIEWS_DIR/SPECS_DIR (with SPECS_DIR='docs/specs'), from which DOCS_ARTIFACT_DIRS is derived. | reads confirm export const SPECS_DIR + REVIEWS_DIR + DEFINES_DIR + STUB_DIR in storage.ts — the canonical constants DOCS_ARTIFACT_DIRS derives from. | none — verified sound. |
| c3 | citation | LOW | manual | jsonPathForMd is the shared resolver consumed by insrc_review_step's start phase (src/mcp/review-step/phases/start.ts) so fixing it fixes both approve + review transitively. | grep resolves jsonPathForMd imported in src/mcp/review-step/phases/start.ts — the shared-resolver consumer, so the review path is fixed transitively. | none — verified sound. |
| edge | semantic | LOW | manual | A SpecArtifact md carries the `<!-- insrc:artifact SPEC-<hash> -->` marker that readArtifactIdMarker reads to rebuild the hash-named json path. | grep/read confirm the `<!-- insrc:artifact SPEC-<hash> -->` marker on the real spec md — readArtifactIdMarker will rebuild the hash-named json once /docs/specs/ is recognized. | none — verified sound. |
| inv | semantic | LOW | manual | docs/stub is the side-by-side exception (md+json under the same slug basename) and must stay excluded from the artifact-dir swap. | read confirms the docs/stub side-by-side branch in gates.ts — STUB_DIR must stay excluded from the artifact-dir swap, as the design preserves. | none — verified sound. |
| ts | citation | LOW | manual | The existing jsonPathForMd unit tests live in src/workflow/__tests__/gates.test.ts and are the suite the new docs/specs case extends. | read confirms the existing jsonPathForMd tests in gates.test.ts — the suite the new docs/specs case extends. | none — verified sound. |
