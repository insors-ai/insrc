<!-- insrc:artifact LLD-599a9b506f22b896-s1 -->

# LLD: E20260915599a9b50:S001

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**HLD base run:** `wf-1789491140629-zj0bd2`
**HLD effective hash:** `196ad617cc5c...`

## HLD context

**Framework:** A single work-item path-scheme module becomes the sole authority on where a work item's artifacts live. It is built on a uniform work-item identity — the existing canonical WorkflowId, fixed so every story-id form (lowercase s1 and uppercase S001) canonicalizes the same way — and maps that identity plus a human slug to a nested, work-item-first tree: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed features, each holding item-root artifacts (SPEC/DEF/HLD) at its root and per-story S<nnn>/ subfolders (LLD/PLAN/BUILD/CR/EXT). Every per-type path helper delegates to this module and every directory-enumeration / filename-prefix finder is replaced by its listing functions, so the write side and the read side resolve the layout through one definition and can never disagree. The one-time migration reuses the very same resolver to compute each existing file's destination; the hash-flat .insrc/artifacts JSON store is left untouched.
**Rollout phase:** Phase A — foundational identity contract
**Owns:** `sc1` (Uniform work-item identity)

## Contract details

**Surface level:** internal-shared

### `storyIdToOrdinal`

```typescript
function storyIdToOrdinal(storyId: string): number
```

**Parameters:**
- `storyId: string` — a structural story id in either the lowercase 's<n>' form (epic-parented) or the uppercase 'S<nnn>' / 'S<n>' form (triage-routed standalone)

**Returns:** `number` — the 1-based story ordinal parsed from the numeric portion; 's1', 'S1' and 'S001' all yield 1

**Errors:**
- `Error` when storyId does not match /^[sS](\d+)$/ (message unchanged: "invalid storyId '<id>' (expected s<n>)")

**Preconditions:**
- storyId is a non-empty string whose numeric suffix (leading zeros allowed) is the ordinal

**Postconditions:**
- The regex is widened from /^s(\d+)$/ to accept both cases; the numeric group is parsed with Number(), so leading zeros ('S001') and no zeros ('s1') map to the same ordinal
- Behaviour for every previously-valid lowercase input is byte-identical (same ordinal, same throw on the same bad inputs) — no regression (ac2)
- Callers storyWorkflowId (id.ts:129) and by extension toCanonical/toSlug become case-total with no change of their own

### `deriveWorkItemIdentity`

```typescript
function deriveWorkItemIdentity(epicHash: string, createdAtISO: string, storyId?: string): WorkItemIdentity
```

**Parameters:**
- `epicHash: string` — the 16-hex epic hash whose first 8 chars form the epic segment
- `createdAtISO: string` — the work item's creation timestamp; supplies the E<YYYYMMDD> date component
- `storyId: string` _(optional)_ — the story id (either case); omitted for an epic-level identity

**Returns:** `WorkItemIdentity` — the bundled identity: canonical (E<date><hash8>[:S<nnn>]), slug (same with ':' -> '-'), epicSegment (E<date><hash8>), and story ordinal (or undefined at epic level)

**Errors:**
- `Error` when storyId is provided but does not parse via storyIdToOrdinal (propagated verbatim)

**Preconditions:**
- epicHash is a valid hex hash and createdAtISO is a parseable ISO date (the same inputs storyWorkflowId/epicWorkflowId already require)

**Postconditions:**
- Pure composition of existing converters: story-level uses storyWorkflowId(epicHash, createdAtISO, storyId) then toCanonical/toSlug; epic-level uses epicWorkflowId
- epicSegment === `E${date}${hash8}`; canonical === toCanonical(id); slug === toSlug(id); story === the ordinal or undefined
- Adds no new parsing logic beyond the widened storyIdToOrdinal it delegates through

## Data model changes

### `WorkItemIdentity (interface, src/workflow/id.ts)` — new

New readonly interface { canonical: string; slug: string; epicSegment: string; story?: number } — the bundled both-way identity sc1 exposes. It is the surface S002's path-scheme resolver consumes (epicSegment + slug -> folder key; canonical -> lookup key). Purely a composition target; carries no behaviour.

**Call sites:**
- `src/workflow/id.ts`

### `storyIdToOrdinal story-id pattern` — invariant-change

Widen the accepted story-id form from /^s(\d+)$/ to /^[sS](\d+)$/ so an uppercase 'S001' parses to the same ordinal as 's1'. This is the single funnel every minter (storyWorkflowId at id.ts:129) passes through, so the whole canonicalization path becomes case-total. ordinalToStoryId (id.ts:107) is deliberately NOT changed — its lowercase 's<n>' output is depended on by tracker/resolve.ts:260 — and toCanonical continues to emit the uppercase padded S<nnn>.

**Call sites:**
- `src/workflow/id.ts`
- `src/workflow/tracker/resolve.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns sc1 (HLD ownedByStory s1). It realizes the contract by (1) widening storyIdToOrdinal so canonicalization is total over both story-id cases and (2) adding the WorkItemIdentity interface + deriveWorkItemIdentity composition. The both-way property (lc1) holds because parseWorkflowId already reverses toCanonical, and the widened storyIdToOrdinal <-> unchanged ordinalToStoryId ordinal round-trip is preserved. |

## Error paths

### Error cases

- **A genuinely malformed story id (neither 's<n>' nor 'S<n>' — e.g. 'story-1', 'sx', '' ) reaches storyIdToOrdinal.** (recoverable)
  - Detection: The widened /^[sS](\d+)$/ .exec() returns null, exactly as the original /^s(\d+)$/ did for the same inputs.
  - Response: Throw the same Error with the unchanged message "invalid storyId '<id>' (expected s<n>)"; the widening only ADDS the uppercase-accepting branch, it removes no rejection.
  - User impact: Identical to today for truly-bad ids — a mint attempt fails (or safeCanonical falls back), never silently mis-parses.
- **deriveWorkItemIdentity is called with a storyId that cannot be parsed.** (recoverable)
  - Detection: The delegated storyWorkflowId -> storyIdToOrdinal throws, and deriveWorkItemIdentity lets it propagate (no swallow).
  - Response: The exception propagates to the caller (S002 resolver / S003 migration), where under the Epic's fail-loud invariant (k3) it surfaces the offending work item rather than guessing.
  - User impact: A work item whose id is genuinely unparseable is reported loudly instead of being misfiled — the intended guardrail.

### Edge cases

| Input | Expected |
| :--- | :--- |
| 'S1' (uppercase, unpadded) and 's1' and 'S001' for the same epic | All three parse to ordinal 1 and canonicalize to the identical E<date><hash8>:S001 — the padding/casing of the input does not affect identity. |
| 'S010' vs 's10' | Both parse to ordinal 10 and canonicalize to E<date><hash8>:S010 (toCanonical's padOrdinal zero-pads); leading zeros in the input are inert. |
| deriveWorkItemIdentity called with storyId omitted (epic-level identity) | Returns { epicSegment: 'E<date><hash8>', canonical: 'E<date><hash8>', slug: 'E<date><hash8>', story: undefined } — no story segment, via epicWorkflowId. |
| An epic-parented story id 's10' after the change | Produces byte-identical output to before the change (ordinal 10, same canonical/slug), confirming no regression for the already-canonicalizing class. |

### Invariants to preserve

- ordinalToStoryId (id.ts:107) continues to return the lowercase 's<n>' structural form; it is NOT changed, because tracker/resolve.ts:260 reconstructs a storyId from it and expects that form. [[c2]]
- toCanonical (id.ts:152) continues to emit the uppercase zero-padded canonical form S<nnn> via padOrdinal (id.ts:93); the canonical serialization is unchanged for every input. [[c2]]
- For every story id that was valid before (lowercase 's<n>'), storyIdToOrdinal returns the identical ordinal and throws on the identical set of bad inputs — the widening is strictly additive (ac2). [[c2]]
- The identity stays both-way: parseWorkflowId (id.ts:177) reverses toCanonical, and the widened storyIdToOrdinal composed with the unchanged ordinalToStoryId preserves the ordinal round-trip (lc1). [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test) with node:assert/strict, matching src/workflow/__tests__/id-resolve.test.ts`

### Test levels

- **unit** — Prove the widened storyIdToOrdinal + deriveWorkItemIdentity make canonicalization total over both story-id cases while leaving already-canonicalizing inputs byte-stable, extending the existing id-resolve.test.ts.
  - Subjects: `storyIdToOrdinal('S001') === storyIdToOrdinal('s1') === storyIdToOrdinal('S1') === 1 (case + padding inert)`, `storyWorkflowId(hash, createdAt, 'S001') toCanonical === storyWorkflowId(hash, createdAt, 's1') toCanonical === E<date><hash8>:S001 (ac1)`, `storyIdToOrdinal still throws the unchanged 'invalid storyId' Error on a genuinely bad id (e.g. 'story-1', '')`, `a lowercase 's10' produces byte-identical ordinal + canonical/slug before and after the change (ac2)`, `ordinalToStoryId(n) still returns lowercase 's<n>' (unchanged) — tracker/resolve reconstruction unaffected`, `deriveWorkItemIdentity(hash, createdAt, 'S001') === deriveWorkItemIdentity(hash, createdAt, 's1') for canonical/slug/epicSegment/story, and the epic-level (storyId omitted) yields story:undefined + no :S segment`, `both-way round-trip: parseWorkflowId(toCanonical(storyWorkflowId(...,'S001'))) yields story ordinal 1 (lc1)`
  - Fixtures: `A fixed epicHash + createdAtISO pair reused across the case-equivalence assertions (mirroring existing id-resolve.test.ts fixtures)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `storyWorkflowId(...,'S001') toCanonical === E<date><hash8>:S001 (identical to the epic-parented lowercase sibling), instead of throwing/falling back to a bare id`, `deriveWorkItemIdentity(...,'S001').canonical === deriveWorkItemIdentity(...,'s1').canonical` |
| `ac2` | `a lowercase 's10' yields byte-identical ordinal + canonical/slug before and after the change`, `storyIdToOrdinal still throws the identical Error on the same set of bad inputs; ordinalToStoryId output unchanged` |

## Migration

**State before:** src/workflow/id.ts:101 storyIdToOrdinal matches only /^s(\d+)$/ and throws on any other form, so a triage-routed standalone story emitted as uppercase 'S001' fails to canonicalize — storyWorkflowId throws and safeCanonical swallows it into the bare-id fallback (observed: an LLD title rendered '# LLD: S001' instead of the canonical E...:S001). ordinalToStoryId (:107) returns lowercase 's<n>' and is consumed by tracker/resolve.ts:260. Neither WorkItemIdentity nor deriveWorkItemIdentity exists in src/ (grep-confirmed). [cites s1 bundles: 'storyIdToOrdinal / ordinalToStoryId exact shape' and 'sc1 identity bundle does not exist yet']

**State after:** storyIdToOrdinal accepts both cases (/^[sS](\d+)$/), so every minter that funnels through it — storyWorkflowId, and hence toCanonical/toSlug — is case-total and a standalone 'S001' canonicalizes to the same E...:S001 as its epic-parented sibling. ordinalToStoryId and toCanonical are unchanged (lowercase structural form / uppercase padded canonical form respectively). A new WorkItemIdentity interface + deriveWorkItemIdentity composition expose the bundled both-way identity for S002's resolver to consume.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen the storyIdToOrdinal accepted-form (add the uppercase branch to its story-id pattern) so 's1' and 'S001' parse to the same ordinal; leave its throw message and reject-set otherwise identical. — ↩ rollbackable
2. Add the WorkItemIdentity interface and the deriveWorkItemIdentity function as a thin composition over the existing epicWorkflowId/storyWorkflowId + toCanonical/toSlug converters; introduce no new parsing. — ↩ rollbackable
3. Extend src/workflow/__tests__/id-resolve.test.ts with the case-equivalence, no-regression, epic-level, and both-way round-trip assertions; no production behaviour change. — ↩ rollbackable

**Backward compat:** storyIdToOrdinal is an internal exported converter; the change is strictly additive (it accepts a superset of inputs and rejects the identical bad set with the identical message), so every existing lowercase caller is byte-stable. ordinalToStoryId's output and toCanonical's canonical serialization are deliberately untouched, so tracker/resolve.ts:260 and every other consumer are unaffected. No public/IPC surface changes.

## Alternatives considered

### a1: Widen storyIdToOrdinal at the source + thin identity bundle — **CHOSEN**

Make storyIdToOrdinal accept both s<n> and S<n> at the single lowest point every minter funnels through, and add WorkItemIdentity + deriveWorkItemIdentity as a thin composition over the existing converters.

The story-id parse regex in storyIdToOrdinal is widened from /^s(\d+)$/ to accept both cases (e.g. /^[sS](\d+)$/), returning the same ordinal for 's1' and 'S001'. Because storyWorkflowId and taskWorkflowId both funnel through storyIdToOrdinal, every minter path — and therefore toCanonical/toSlug — becomes case-total for free. ordinalToStoryId stays returning the lowercase structural form (its tracker/resolve consumer depends on that), and toCanonical continues to emit the uppercase padded S<nnn>.

The sc1 surface is completed by adding a WorkItemIdentity interface {canonical, slug, epicSegment, story?} and deriveWorkItemIdentity(epicHash, createdAtISO, storyId?) that simply assembles epicWorkflowId/storyWorkflowId + toCanonical + toSlug + the epic segment into one value — no new parsing, so the whole Story adds one regex character-class and a thin composition function.

### a2: Case-tolerance only at the deriveWorkItemIdentity boundary

Leave storyIdToOrdinal strict-lowercase; normalize the storyId to lowercase inside deriveWorkItemIdentity / the new sc1 surface before it reaches the converter.

storyIdToOrdinal keeps its /^s(\d+)$/ regex unchanged. Instead, the new deriveWorkItemIdentity normalizes its storyId argument (lowercases the leading letter) before delegating to storyWorkflowId, so the sc1 entry point tolerates 'S001' while the low-level converter stays exactly as-is.

The WorkItemIdentity bundle is the same as a1; only the placement of the case-tolerance differs — it lives at the new boundary rather than in the shared converter.

**Rejected because:** Same XS cost and same ac2 safety as a1, but partial on ac1 and sc1 because the case-tolerance sits at a boundary rather than the shared converter, leaving other minter callers uncovered — the exact non-uniformity the contract exists to remove.

### a3: Parallel case-insensitive parser alongside the strict one

Keep storyIdToOrdinal strict and add a second, case-insensitive story-id parser that the new sc1 surface uses.

Introduce a new converter (e.g. parseStoryOrdinalLoose) that accepts both cases, leaving storyIdToOrdinal exactly as it is. storyWorkflowId is pointed at the new loose parser, and deriveWorkItemIdentity uses it too.

The WorkItemIdentity bundle is unchanged from a1; the difference is two parsers coexist — a strict one and a loose one.

**Rejected because:** Meets both acceptance criteria but scores partial on sc1: maintaining a strict AND a loose parser for the same question institutionalizes the drift the identity contract is meant to remove, at higher cost (S) than a1's one-character widening.

## Citations

- **[[c1]]** `code` `src/workflow/id.ts — storyIdToOrdinal (:101, /^s(\d+)$/ the fix site), ordinalToStoryId (:107, lowercase s<n>), storyWorkflowId (:129), toCanonical (:152), toSlug (:169), parseWorkflowId (:177), padOrdinal (:93).`
- **[[c2]]** `code` `src/workflow/id.ts canonical WorkflowId bundle — the toCanonical/parseWorkflowId both-way converters + storyIdToOrdinal/ordinalToStoryId that the invariants (ordinalToStoryId unchanged, canonical serialization unchanged, additive widening, both-way round-trip) are grounded on.`
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts:260 — the ordinalToStoryId consumer whose lowercase-storyId reconstruction constrains the fix to the input side only.`
- **[[c4]]** `test` `src/workflow/__tests__/id-resolve.test.ts — the existing id-converter test file S001's case-equivalence / no-regression / round-trip assertions extend.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-15T17:55:43.837Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/workflow/id.ts:101-105 storyIdToOrdinal uses /^s(\\d+)$/ (lowercase-only) and throws "invalid storyId ... (expected s<n>)" — the exact fix site S001 widens. | id.ts:101 storyIdToOrdinal; :102 `const m = /^s(\\d+)$/.exec(storyId)`; :103 throws "invalid storyId '${storyId}' (expected s<n>)" — the exact fix site + message the LLD widens/preserves. | none — verified sound |
| cl2 | citation | LOW | manual | src/workflow/id.ts's storyWorkflowId (:129) calls storyIdToOrdinal, so widening it makes the mint path case-total; toCanonical (:152) pads via padOrdinal (:93); parseWorkflowId (:177) reverses it. | id.ts exports storyWorkflowId, toCanonical, parseWorkflowId (3/3); storyWorkflowId funnels through storyIdToOrdinal so the widening is case-total by construction. | none — verified sound |
| cl3 | citation | LOW | manual | src/workflow/id.ts:107 ordinalToStoryId returns lowercase `s${ordinal}` and is consumed by tracker/resolve.ts to reconstruct a storyId — which is why S001 must NOT change its output. | id.ts:107 ordinalToStoryId returns lowercase s${ordinal}; tracker/resolve.ts:260 `ordinalToStoryId(wfid.story)` reconstructs the storyId — confirming the LLD's decision to leave ordinalToStoryId unchanged (fix on the input side only). | none — verified sound |
| cl4 | semantic | LOW | manual | Neither WorkItemIdentity nor deriveWorkItemIdentity exists in src/ yet — S001 introduces them as new surface. | grep for WorkItemIdentity / deriveWorkItemIdentity in id.ts returns 0 — both are genuinely new surface S001 introduces, as the contract states. | none — verified sound |
| cl5 | citation | LOW | manual | src/workflow/__tests__/id-resolve.test.ts exists and exercises the id converters (the file S001's tests extend). | src/workflow/__tests__/id-resolve.test.ts exists with 19 references to the id converters — the real file S001's case-equivalence/no-regression/round-trip assertions extend. | none — verified sound |
