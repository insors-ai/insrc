<!-- insrc:artifact ISSUE-dddb4113077c8de8 -->

# Emit the artifact-id marker from the BUILD record renderer

## Reproduction

1. Complete a Story so a BUILD record and its BUILD.md exist.
2. Approve it the way every other artifact is approved — by passing the markdown path:
   `insrc_workflow_approve({ artifactPath: '<...>/S001/BUILD.md' })`
3. OBSERVED: it refuses with 'jsonPathForMd: cannot resolve the canonical JSON for <path> — a nested work-item artifact md must carry an insrc:artifact marker (its path no longer encodes the hash id). No marker was found.' The same call shape succeeds for an LLD, a PLAN, an ISSUE or a CR.
   EXPECTED: a BUILD record is approvable by its markdown path, like every other artifact kind.

The asymmetry is measurable rather than a matter of opinion. Counting marker emissions across the artifact renderers gives two occurrences each for define, issue, hld, plan, lld, spec, extend and cr — and zero for the BUILD renderer. It shows on disk as well: sampled CR.md files contain a marker, and every sampled BUILD.md contains none.

Workaround in use today: approve by `epicHash` instead of by path, which batches every pending artifact under the work item rather than naming the one being approved.

## Root cause

The BUILD renderer never emits the marker, so there is nothing in a BUILD.md that identifies which record it renders.

Resolution from markdown back to JSON is marker-based by design, and the refusal message states the reason: the path 'no longer encodes the hash id'. Once the docs tree moved to `<slug>-E<date><hash8>/S<nnn>/<KIND>.md`, the filename became the bare kind and the folder carries only the first eight hex digits of the hash — so the only place a full artifact id can live is the marker inside the file. Eight renderers put it there. The BUILD renderer does not, and its output therefore cannot be mapped back to its record.

This is the same root fact that forced the docs-tree migration to locate markerless BUILD markdown by a (kind, hash8, story) path SHAPE rather than by id — a fallback that exists only because the marker is missing, and that cannot distinguish two work items sharing a hash8 prefix.

One correction worth carrying, because a source comment currently asserts otherwise: that fallback's comment says 'Rendered BUILD/CR ledgers carry no insrc:artifact marker', but only BUILD is markerless. The CR renderer does emit one and real CR.md files contain it. The comment should be corrected so it stops overstating the problem.

## Fix intent

A BUILD.md should identify the record it renders, the same way every other artifact's markdown does, so that resolving markdown back to JSON works uniformly and approval by path stops being a special case.

Two limits to state rather than design around. First, this does not retroactively repair anything: BUILD markdown already on disk stays markerless until it is next re-rendered, so any check that assumes a marker is present must tolerate the older files. Second, the migration's path-shape fallback for markerless BUILD markdown should NOT be removed as part of this — it is still the only way to locate those existing files, and removing it would strand them.

Worth covering as acceptance: a freshly rendered BUILD.md resolves back to its JSON by path, and the renderer's byte-identity goldens are updated deliberately rather than incidentally, since adding a line changes every expected output.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/standalone-record.ts:149` — "export function renderBuildRecordMd(rec: BuildRecord): string {"
- **[[c2]]** `code` `src/workflow/gates.ts:916` — "work-item artifact md must carry an insrc:artifact marker (its path no longer encodes the hash id)"
- **[[c3]]** `code` `src/workflow/storage.ts:370` — "export function artifactIdMarker(id: string): string {"
- **[[c4]]** `code` `src/workflow/artifacts/issue.ts:64` — "lines.push(artifactIdMarker(issueArtifactId(issueHash)));"
- **[[c5]]** `code` `src/workflow/code-review/runner.ts:331` — "artifactIdMarker(id),"
- **[[c6]]** `code` `src/workflow/migrate-docs-tree.ts` — "Markerless nested md. Rendered BUILD/CR ledgers carry no insrc:artifact marker, and a nested filename is the bare `<KIND>.md`"
- **[[c7]]** `prior-artifact` `BUILD-e20235c17f083a16-S001 — approval by artifactPath was refused this session and had to fall back to the epicHash form`
