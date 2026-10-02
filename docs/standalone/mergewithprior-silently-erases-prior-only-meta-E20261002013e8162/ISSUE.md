<!-- insrc:artifact ISSUE-013e816250937aa5 -->

# Preserve prior meta fields across a BUILD-record upsert

## Reproduction

A BUILD record is written twice for one Story — once by the build's implement phase, once by its validate phase — and the second write erases meta the first one recorded.

STEPS, as actually executed against a throwaway repo. Write a standalone record the way the implement phase does, with every prior-only meta field populated. Then write the record the way the validate phase does, supplying only the fields it actually sends (workflow, standalone, epicHash, storyId, createdAt, updatedAt). Then read the persisted json back.

OBSERVED. After implement, meta carries workflow build, standalone true, sizeClass 'trivial', triageRationale 'why it was trivial', epicHash, storyId s1 and createdAt 2026-01-01. After validate, meta carries workflow build, standalone false, epicHash, storyId, the SAME createdAt, and a fresh updatedAt — with sizeClass DROPPED and triageRationale DROPPED. createdAt is preserved.

EXPECTED. Both fields still present. The validate write never mentions either of them, so neither should change; createdAt surviving demonstrates that preservation is possible and already happens for some fields.

The same loss is observable end-to-end through the real build phases rather than the persist functions: driving a standalone build through implement then validate leaves the persisted record with no sizeClass.

SECOND, SHARPER REPRODUCTION — the one showing the erasure is not merely cosmetic. Remove the `standalone: false` that the validate write currently sends, which is the correction a separate approved plan specifies for this flag. The field does NOT revert to the `true` the implement phase wrote; it becomes undefined. Observed: standalone is true after implement and undefined after validate. Because undefined is falsy the record still routes exactly as false would, so that correction can be applied, its own acceptance check can pass, and the defect it targets can remain open.

## Root cause

The upsert merges meta and body by OPPOSITE rules, and only body's rule preserves what an earlier phase recorded.

For body, the prior record is spread FIRST and the new write layered over it, so prior keys survive and the new write wins only where it supplies a value. For meta, the prior record is never spread at all: the merged object is built from the new write plus an explicit allowlist of five fields copied across from prior — createdAt, approvedAt, rejectedAt, rejectReason and reviewOverride. Any other prior meta key is simply absent from the result unless the new write happens to re-supply it.

So the retention rule for meta is not 'the new write wins where it speaks' but 'everything the new write omits is deleted'. The five allowlisted fields are the only reason that is not immediately obvious — createdAt visibly surviving makes the merge look like it preserves prior state generally.

The two fields observed to vanish are both written only by the standalone implement route and never by validate, which is precisely the combination the rule destroys. Both are declared, long-lived fields on the record's meta type, not incidental extras.

This also explains an already-committed record that looked anomalous when found during earlier planning: a BUILD record carrying standalone true with no sizeClass at all and a plan-driven body. That is not a corrupted artifact — it is the ordinary output of two writes under this rule.

Two consequences are worth separating, because they have different causes and conflating them is what produced an insufficient fix elsewhere. A field the new write ACTIVELY sets is overwritten, which is ordinary and intended. A field the new write OMITS is deleted, which is the defect. `standalone` currently suffers the first and `sizeClass` the second — and the sharper reproduction shows that removing the active write converts `standalone` from the first case into the second rather than fixing it.

## Fix intent

Make the upsert's retention rule for meta match the one body already follows: a later write to the same record must not remove meta the record already carried. A field the new write supplies still takes the new value, a field it omits keeps the value it had, and the existing precedence for the completion and rejection stamps — where the prior value deliberately wins so a finished Story can never be un-finished — must be preserved exactly as it is today.

The correction introduces no new field and changes no field's type, so every already-written record stays readable, and a record whose new write happens to supply every field it previously carried must render byte-identically.

One consequence should be stated rather than discovered: under this rule a meta field can no longer be cleared by omitting it from a write. Nothing depends on clearing-by-omission today, and that claim will be settled by running the full suite after the change rather than by a search — any committed test that depends on a meta field disappearing would go red. Any future need to genuinely unset a field will have to do so explicitly.

Deliberately NOT in scope: changing which fields the validate phase sends, changing the body merge, altering the completion-stamp precedence, and the two downstream corrections in the other plan that this unblocks. Repairing already-written records is also out of scope — the fix changes future upserts only.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/standalone-record.ts:246-266 — mergeWithPrior: merged meta is the NEW write plus a five-field prior allowlist, while body spreads prior FIRST. The asymmetry is visible within a dozen lines.` — "const meta = { ...rec.meta, createdAt: prior.meta.createdAt, ...(prior.meta.approvedAt !== undefined ? { approvedAt: prior.meta.approvedAt } : {}), ...(prior.meta.rejectedAt ...), ...(prior.meta.rejec"
- **[[c2]]** `code` `src/workflow/runners/build/standalone-record.ts:194 — persistBuildRecord is the single non-test caller of the merge, and the one persist entry point both the plan-driven and standalone routes funnel through` — "const merged = mergeWithPrior(jsonPath, rec);"
- **[[c3]]** `code` `src/mcp/build-step/phases/validate.ts:163 — the validate write, which supplies six meta fields and mentions neither sizeClass nor triageRationale` — "meta: { workflow: 'build', standalone: false, epicHash, storyId, createdAt: now, updatedAt: now },"
- **[[c4]]** `code` `src/mcp/build-step/phases/implement.ts:133-139 — the standalone implement write, the only producer of the two erased fields` — "persistStandaloneBuildRecord(repoPath, { meta: { workflow: 'build', standalone: true, sizeClass, epicHash, storyId, createdAt: new Date().toISOString(), ...(ctx.triageRationale !== undefined ? { triag"
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:49-52 — sizeClass and triageRationale are DECLARED fields on BuildRecord.meta, so preserving them implies no schema change` — "readonly standalone: boolean; readonly sizeClass?: string | undefined; readonly triageRationale?: string | undefined;"
- **[[c6]]** `convention` `src/workflow/runners/build/__tests__/build-record.test.ts:74 and :97 — the committed upsert tests assert preservation in the OTHER direction, so the fix moves meta toward what the suite already expects elsewhere` — ":74 'a second validate UNIONS tasks by id, preserves createdAt, refreshes updatedAt (one record, not N)'; :97 'an existing meta.approvedAt (+ reviewOverride) is PRESERVED across an upsert (never un-co"
- **[[c7]]** `convention` `src/mcp/build-step/__tests__/standalone-implement.test.ts:64-65 — a committed test already asserts both fields are present after implement; the defect is that they are not still present after validate` — "assert.equal(rec.meta.sizeClass, 'trivial'); assert.equal(rec.meta.triageRationale, 'one-line mechanical edit');"
- **[[c8]]** `prior-artifact` `.insrc/artifacts/BUILD-be8708a9cd20e286-S001.json — a committed record that looked anomalous when found during earlier planning and is in fact the ordinary output of two writes under this rule` — "meta carries standalone:true with NO sizeClass key, alongside a plan-driven {commit, tasks} body — the shape left behind by an implement write followed by a validate write."
- **[[c9]]** `prior-artifact` `.insrc/artifacts/PLAN-93081bff91ae5108-S001.json — the approved plan this defect blocks: its t8 keys a converged renderer's title on meta.sizeClass, and its t9 expects omitting the standalone write to let the prior value survive` — "t8: 'The title derives from meta.sizeClass, asserted against a record whose standalone is false but whose sizeClass is set'. t9: 'The shared validate persist does NOT write standalone at all — asserte"
- **[[c10]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts — the characterisation test added for that plan's t1 records this finding as B2, so the defect is already pinned by a committed, mutation-proved test asserting the erasure as current behaviour` — "CHARACTERISATION B (inverts at t9) asserts rec.meta['sizeClass'] === undefined after validate, noting that mergeWithPrior spreading the NEW meta drops prior-only keys so not writing sizeClass is not e"
