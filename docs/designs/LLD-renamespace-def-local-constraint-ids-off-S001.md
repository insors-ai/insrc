<!-- insrc:artifact LLD-dcbb529e465417af-S001 -->

# LLD: S001

**Epic:** `renamespace-def-local-constraint-ids-off`
**HLD base run:** `wf-1785923420912-fydinv`
**HLD effective hash:** `dcbb529e4654...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

## Data model changes

### `DEF Stories schema — localConstraints[].id (JSON-Schema property)` — field-modify

Narrow the local-constraint id pattern from the citation namespace ^c\d+$ to a distinct ^lc\d+$ so a local constraint id echoed into an LLD body renders as an lc-ref, which the synthesizer's c-only CITATION_REF_RE ignores (like a k-ref) instead of validating it as a dangling citation. This is the sole behavioural change. Enforced only at define time (new DEFs); existing on-disk DEFs are not re-validated/migrated (going-forward only).

```
localConstraints[].id.pattern: '^c\\d+$' -> '^lc\\d+$'
```

**Call sites:**
- `src/workflow/runners/define/schemas.ts`

### `DEF Stories schema — localConstraints[].source (JSON-Schema property)` — invariant-change

DELIBERATELY UNCHANGED: source stays ^c\d+$. A local constraint's source references a REAL DEF citation, so it must remain in the citation namespace; the DEF renderer emits it as a source citation and it grounds against the DEF's citation list. Documented here so the plan does not renamespace it (that was the rejected a3).

```
localConstraints[].source.pattern: '^c\\d+$' (unchanged)
```

**Call sites:**
- `src/workflow/runners/define/schemas.ts`
- `src/workflow/artifacts/define.ts`

### `define runner Stories prompt guidance (prose)` — field-modify

Align the define runner's Stories prompt so the model MINTS local-constraint ids as lcN (and references them in the lc namespace) rather than cN, keeping the emitted JSON consistent with the tightened schema. Around the existing guidance line that describes local constraints / operationalizes; no schema-validated field references a c-local-constraint (operationalizes is ^k\d+$-only), so this is a prose alignment, not a structural reference change.

```
(prompt text: 'mint local-constraint ids as lcN, reference them in the lc namespace')
```

**Call sites:**
- `src/workflow/runners/define/index.ts`

### `checkConstraintCoverage / DEF renderer (consumers) — contract preserved` — invariant-change

NO CHANGE required. checkConstraintCoverage (define.ts:278-292) builds localIds from local-constraint ids but only matches them against acceptanceCriteria.operationalizes, which the schema restricts to ^k\d+$ — so its localIds branch never matched a c-id and is unaffected by the c->lc rename. The DEF renderer (define.ts:170-176) uses c.id generically and renders lcN correctly. Recorded so the plan verifies (not edits) these consumers.

**Call sites:**
- `src/workflow/artifacts/define.ts`

## Error paths

### Error cases

- **A new define run emits a local constraint with a c-prefixed id (the old namespace) after the schema is tightened to ^lc\d+$.** (recoverable)
  - Detection: The define runner's ajv structured-output validation checks localConstraints[].id against the new ^lc\d+$ pattern and reports a pattern mismatch for that item.
  - Response: The existing structured-output retry loop re-prompts the model (the aligned prompt guidance now instructs lcN ids), and a corrected object with lc-ids validates; no partial/invalid DEF is persisted.
  - User impact: Transparent — a bounded retry; the approved DEF ends up with lc-namespaced local constraints.
- **A local constraint's `source` references a citation id that does not exist in the DEF's citations list.** (recoverable)
  - Detection: Unchanged from today: `source` keeps its ^c\d+$ shape and is validated by the DEF's own citation-grounding checks (checkConstraintCoverage covers operationalizes/assumption sources; the renderer emits the source citation validated against the DEF citation list).
  - Response: Same behaviour as before this change — the rename does not touch source validation; a dangling source is caught exactly as it is today.
  - User impact: None new — source grounding is preserved byte-for-byte.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A Story with NO localConstraints (the common case). | Nothing to renamespace; the schema change is inert and behaviour is byte-identical to today. |
| An EXISTING on-disk DEF that already carries c-prefixed local constraints (e.g. DEF-761a43a6), later read by design.story. | Not re-validated or migrated — the tightened pattern is enforced only at define-time for NEW DEFs. The legacy collision can still fire for such a DEF; this is the explicit going-forward-only boundary, not a regression introduced here. |
| The LLD synthesizer echoes a NEW story's local constraint (an lc-namespaced ref) in the LLD body. | The c-only CITATION_REF_RE does not match an lc-ref (exactly as it ignores a k-ref), so validateCitations does not treat it as a dangling citation — the LLD synthesizes successfully. This is the whole fix. |
| The LLD synthesizer echoes a local constraint's `source` (a real c-citation) in the LLD body. | The source c-ref still matches CITATION_REF_RE, but resolves numerically against the LLD's own citation list (LLDs number their citations from c1); unchanged, low-risk behaviour — the fix targets the constraint id, not source. |

### Invariants to preserve

- The synthesizer citation guard is unchanged: CITATION_REF_RE stays c-only and validateCitations still hard-fails only dangling c-refs while tolerating unreferenced citations — lc-refs and k-refs remain ignored. This story renames the constraint namespace so it lands on the ignored side; it does NOT alter the guard. [[c2]]
- checkConstraintCoverage semantics are preserved: operationalizes stays ^k\d+$-only and its localIds branch remains (harmlessly) unreachable for it, so the c->lc rename changes no coverage outcome. [[c4]]
- localConstraints[].source remains a citation reference in the ^c\d+$ namespace, so the DEF-level grounding link from a local constraint to its citation is preserved (the rejected a3 would have broken this). [[c1]]

## Test strategy

**Test framework:** `node:test via npx tsx --test`

### Test levels

- **unit** — Prove the tightened DEF schema accepts the new lc-namespace for local-constraint ids and rejects the old c-namespace, while source stays a c-citation reference.
  - Subjects: `a Story localConstraint with id 'lc1' validates against the define Stories schema`, `a Story localConstraint with a c-namespaced id is REJECTED by the schema (pattern ^lc\d+$ mismatch)`, `a Story localConstraint with a c-namespaced source still validates (source pattern ^c\d+$ unchanged)`
  - Fixtures: `the exported define Stories JSON schema + an ajv validate (the pattern that the define runner's structured-output validation uses)`
- **unit** — Prove the fix: the synthesizer's c-only citation guard ignores lc-namespaced refs, so an LLD body echoing a local constraint no longer fails as a dangling citation — while the guard still catches genuine dangling c-refs.
  - Subjects: `validateCitations over a body containing an lc-ref (and a k-ref) with a citations list that does NOT include them returns ok (no dangling-citation failure)`, `validateCitations over a body containing a c-ref absent from the citations list STILL fails (guard intact — not weakened)`
  - Fixtures: `validateCitations from src/workflow/synthesizer.ts + a minimal citations[] fixture`
- **unit** — Prove the diagnosed consumers are unaffected by the c->lc rename (contract preserved, not edited).
  - Subjects: `checkConstraintCoverage over a Story with lc-namespaced localConstraints + k-only operationalizes yields NO coverage error`, `the DEF renderer renders a local constraint whose id is 'lc1' with its source citation intact`
  - Fixtures: `a DefineBody fixture with one Story carrying an lc-local-constraint (a c-namespaced source) + a matching citation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a Story localConstraint with id 'lc1' validates against the define Stories schema`, `a Story localConstraint with a c-namespaced id is REJECTED by the schema (pattern ^lc\d+$ mismatch)`, `a Story localConstraint with a c-namespaced source still validates (source pattern ^c\d+$ unchanged)` |
| `ac2` | `validateCitations over a body containing an lc-ref (and a k-ref) with a citations list that does NOT include them returns ok (no dangling-citation failure)`, `validateCitations over a body containing a c-ref absent from the citations list STILL fails (guard intact — not weakened)` |
| `ac3` | `checkConstraintCoverage over a Story with lc-namespaced localConstraints + k-only operationalizes yields NO coverage error`, `the DEF renderer renders a local constraint whose id is 'lc1' with its source citation intact` |

## Migration

**State before:** The DEF Stories schema (src/workflow/runners/define/schemas.ts:216) constrains localConstraints[].id to ^c\d+$ — the SAME namespace as citations[].id. When design.story surfaces a Story into LLD synthesis it JSON.stringify's the whole story (incl. localConstraints) into the prompt (design-story/index.ts:100 + 169/212/309/354/454/510), the LLD synthesizer echoes the constraints as c-refs, and the c-only guard (synthesizer.ts:85 CITATION_REF_RE, hard-fail at :119) rejects them as dangling citations. The define runner prompt (define/index.ts:160) describes local constraints in the c-namespace. k-constraints (^k\d+$) are immune to the c-only guard.

**State after:** localConstraints[].id is constrained to ^lc\d+$ (schemas.ts:216) and the define runner prompt guidance mints local-constraint ids as lcN. New DEFs therefore carry lc-namespaced local constraints that flow through the unchanged design-story path and are ignored by the c-only synthesizer guard (like k-constraints), so LLD synthesis no longer fails on them. localConstraints[].source stays ^c\d+$ (a citation reference). The synthesizer guard, the design-story leak point, the DEF renderer, and checkConstraintCoverage are unchanged. Existing on-disk DEFs are not migrated.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Change the localConstraints[].id property pattern in the define Stories schema from ^c\d+$ to ^lc\d+$ (schemas.ts:216). Leave localConstraints[].source at ^c\d+$. — ↩ rollbackable
2. Align the define runner's Stories prompt guidance (define/index.ts, around :160) so it instructs the model to mint local-constraint ids as lcN and reference them in the lc namespace (not cN), keeping emitted JSON consistent with the tightened schema. — ↩ rollbackable
3. Add/adjust tests: define-schema accepts lc-ids and rejects c-ids for local constraints (source still c); validateCitations ignores lc-refs while still failing dangling c-refs; checkConstraintCoverage + the DEF renderer handle an lc-local-constraint unchanged. Run the workflow suite green. — ↩ rollbackable

**Backward compat:** No public/runtime API signature changes — this narrows an internal artifact-schema string pattern enforced only at define time. Going-forward only: NEW define runs must emit lc-namespaced local-constraint ids (the aligned prompt handles this; a stray c-id triggers the existing bounded structured-output retry). EXISTING on-disk DEFs that carry c-namespaced local constraints are NOT re-validated or migrated — they remain as-is per the user's explicit choice, and the legacy collision can still fire for those specific DEFs (an accepted, documented boundary, not a new regression). No reader of a persisted DEF breaks: the renderer + checkConstraintCoverage handle any id string generically. The change is fully rollbackable by reverting the pattern + prompt.

## Alternatives considered

### a1: lc-prefix on id only; source stays a c-citation reference — **CHOSEN**

Change localConstraints[].id pattern from ^c\d+$ to ^lc\d+$ in the define schema and align the define runner's prompt to mint lcN ids; localConstraints[].source stays ^c\d+$ (it references a real DEF citation).



### a2: lc-prefix via a single shared LOCAL_CONSTRAINT_ID pattern constant

Same behavioural change as a1, but extract the local-constraint id pattern into one exported named constant reused by the schema + tests so the lc namespace has a single source of truth.



**Rejected because:** Functionally identical to a1 (fixes the collision, preserves source) but scores partial on minimal-blast-radius: the shared-constant indirection is more machinery than a one-line pattern change warrants in a file that is idiomatically a plain JSON-Schema object literal. A reasonable refinement, not worth the extra surface here.

### a3: Renamespace BOTH id and source off the c-namespace

Change both localConstraints[].id and localConstraints[].source to ^lc\d+$, fully decoupling local constraints from the citation namespace.



**Rejected because:** Violates source-grounding-preserved: renamespacing source to lc breaks the semantic that source points at a real DEF citation — the renderer's source emission would land in the ignored lc namespace, so the constraint loses its DEF-citation grounding and becomes unverifiable against the citation list. It also enlarges the blast radius (renderer + source semantics) for no benefit, since the collision was only ever on the echoed id, not on source.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — DEF Stories schema: localConstraints[].id ^c\d+$ (schemas.ts:216), source ^c\d+$ (:219), operationalizes ^k\d+$ (:204); src/workflow/runners/define/schemas.ts`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — the c-only citation guard: CITATION_REF_RE = /\[\[c(\d+)\]\]/g (synthesizer.ts:85) + validateCitations hard-fail at :119; src/workflow/synthesizer.ts`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — the design-story leak point: readUpstream returns the whole story incl. localConstraints (index.ts:100), JSON.stringify(story) at 169/212/309/354/454/510; src/workflow/runners/design-story/index.ts`
- **[[c4]]** `analyze-bundle` `s1 data-model.trace — DEF renderer (define.ts:170-176, uses c.id generically) + checkConstraintCoverage (define.ts:278-292, localIds branch unreachable for k-only operationalizes); src/workflow/artifacts/define.ts`
- **[[c5]]** `analyze-bundle` `s1 search.text — the define runner Stories prompt guidance to align (define/index.ts:160); src/workflow/runners/define/index.ts`
- **[[c6]]** `analyze-bundle` `s1 test.locate — define schema/runner tests location (src/workflow/runners/define/__tests__) + artifact renderer tests (src/workflow/artifacts/__tests__)`
- **[[c7]]** `analyze-bundle` `s1 test.locate — validateCitations tests location under the workflow suite (src/workflow/__tests__ / synthesizer tests); node:test via npx tsx --test`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-08-05T10:00:41.459Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | The DEF Stories schema constrains localConstraints[].id to ^c\\d+$ (the field this LLD changes to ^lc\\d+$), keeps source at ^c\\d+$, and restricts acceptanceCriteria.operationalizes items to ^k\\d+$. | src/workflow/runners/define/schemas.ts carries the localConstraints block (localConstraints[].id ^c\\d+$ at :216, source ^c\\d+$ at :219 per direct read) and operationalizes items ^k\\d+$ at schemas.ts:204 (grep hit). The c-namespace is shared with citations (^c\\d+$ appears across orchestrator.ts citation schemas too). Confirmed. | None — the changed field + the k-only operationalizes are real. |
| cl2 | citation | LOW | auto | The synthesizer's citation guard CITATION_REF_RE matches only [[c(\\d+)]] (c-only) and validateCitations hard-fails a body ref not in the citations list; k/lc refs are ignored. | synthesizer.ts:85 CITATION_REF_RE = /\\[\\[c(\\d+)\\]\\]/g (c-only), :119 'no citation with that id exists' hard-fail, :93 validateCitations, and :202 validateCitations(renderedBody, artifact.citations) — the guard runs on the rendered body, so an lc-ref (non-c) is ignored exactly as claimed. Confirmed. | None — the guard behaviour is exactly as the LLD describes. |
| cl3 | citation | LOW | auto | design.story's readUpstream returns the whole story (incl. localConstraints) and multiple steps JSON.stringify(story) into their prompts, so local-constraint ids reach the LLD synthesizer. | design-story/index.ts:87 readUpstream + :169/:212 (and further) JSON.stringify(story) confirm the whole story (incl. localConstraints) is surfaced into the LLD prompts. Confirmed. | None — the leak path resolves. |
| cl4 | citation | LOW | auto | The DEF renderer emits each local constraint using c.id generically and checkConstraintCoverage builds localIds but only matches them against operationalizes (which is k-only), so its local-id branch never matches a c-id. | define.ts:278 checkConstraintCoverage, :282 localIds = localConstraints.map(c=>c.id), :285 matches operationalizes against globalIds ∪ localIds; since operationalizes is ^k\\d+$-only (schemas.ts:204) the localIds branch never matches a c-id — unaffected by the rename. The renderer (define.ts:170-176) uses c.id generically. Confirmed. | None — the preserved-consumer premise holds. |
| cl5 | citation | LOW | auto | The define runner's Stories prompt guidance (the prose this LLD aligns) instructs that operationalizes references Epic or the Story's localConstraints ids. | The define runner's Stories prompt guidance line 'operationalizes must reference constraint ids from Epic OR the Story's localConstraints' resolves at src/workflow/runners/define/index.ts:160 (direct read during grounding; the review grep was noisy on the plain word but the file + line are real). This is the prose the LLD aligns. | None — the prompt-guidance anchor resolves. |
