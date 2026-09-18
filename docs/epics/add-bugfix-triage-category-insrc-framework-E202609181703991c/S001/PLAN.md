<!-- insrc:artifact PLAN-1703991c69967193-s1 -->

# Plan: E202609181703991c:S001

**Epic:** `add-bugfix-triage-category-insrc-framework`
**LLD run:** `wf-1789731733575-1sfn9q`
**LLD effective hash:** `e08e0c0d9f7b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the enabling 'issue' literal to WORKFLOW_NAMES | S | — | unit: WORKFLOW_NAMES/ WorkflowName includes 'issue' (type-admits + array-contains) | [[c3]] [[c1]] |
| 2 | **`t2`** Extend triage types: bugfix SizeClass, BugfixMagnitude, TriageResult.magnitude | S | — | unit: SIZE_CLASSES includes 'bugfix' and stays in lockstep with the SizeClass union; unit: BugfixMagnitude type admits exactly 'small' \\| 'sized' | [[c2]] [[c1]] |
| 3 | **`t3`** Add the bugfix arm to routeForSizeClass (magnitude-gated) + exhaustiveness backstop | S | `t1`, `t2` | unit: routeForSizeClass('bugfix','small') -> issue/standalone/needsPlan:false/producesLld:false; unit: routeForSizeClass('bugfix','sized') -> issue/standalone/needsPlan:true/producesLld:true; unit: routeForSizeClass('bugfix') with no magnitude throws; unit: routeForSizeClass('small','sized') ignores magnitude and equals routeForSizeClass('small') (four-tier regression) | [[c1]] [[c2]] |
| 4 | **`t4`** Bugfix-aware classification schema + prompt (declaredBugfix, magnitude, conditional-required) | M | `t2` | unit: CLASSIFY_SCHEMA.sizeClass.enum includes 'bugfix' (auto-derived from SIZE_CLASSES) + magnitude enum prop exists; unit: validateAgainstSchema accepts a bugfix+magnitude payload and rejects an out-of-enum magnitude; unit: buildClassifyPrompt: declaredBugfix:true emits bugfix+magnitude guidance; unset emits the current four-tier prompt unchanged | [[c2]] [[c1]] |
| 5 | **`t5`** Extend classify.test.ts: four-tier regression + bugfix route/schema/prompt/contract tests | M | `t3`, `t4` | unit: routeForSizeClass('epic'\\|'feature'\\|'small'\\|'trivial') returns the exact current literals (regression); unit: SIZE_CLASSES loop invariants re-expressed to cover 'bugfix' without weakening standalone===sc!=='epic' / producesLld===sc!=='trivial' for the four tiers; unit: CLASSIFY_SCHEMA rejects a magnitude-less bugfix (schema conditional or the t3 runtime guard); unit: sc1 contract: a bugfix TriageResult carries magnitude + startStage 'issue'; the four sizes carry no magnitude and their current route; unit: specScopeFitsStandalone behaviour for the four existing sizes is unchanged (route.standalone regression) | [[c4]] [[c1]] [[c2]] |

### E202609181703991c:S001:T001 — Add the enabling 'issue' literal to WORKFLOW_NAMES

Append the string literal 'issue' to the `export const WORKFLOW_NAMES = [...] as const` array in src/workflow/types.ts (line ~73) so `WorkflowName` (typeof WORKFLOW_NAMES[number]) admits 'issue' and TriageRoute.startStage can reference it. NAME only — no runner/synthesizer/artifact (that machinery stays s2/sc2). This is the approved Phase-A enabling amendment (additive, non-breaking).

**Acceptance checks:**
- WORKFLOW_NAMES includes 'issue' and `WorkflowName` type resolves 'issue' as a valid member.
- No existing WORKFLOW_NAMES member is removed or reordered in a way that changes behaviour; the addition is purely additive.
- tsc compiles with the new member (no runner registration or stage machinery added — out of scope for s1).

### E202609181703991c:S001:T002 — Extend triage types: bugfix SizeClass, BugfixMagnitude, TriageResult.magnitude

In src/workflow/triage/types.ts: add 'bugfix' to the `SizeClass` union (line 16) and to the `SIZE_CLASSES` array (line 18) in lockstep; add `export type BugfixMagnitude = 'small' | 'sized'`; add `readonly magnitude?: BugfixMagnitude` to the `TriageResult` interface (present iff bugfix). All additive; existing members untouched.

**Acceptance checks:**
- SizeClass = 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix' and SIZE_CLASSES = [...four..., 'bugfix'] stay in lockstep.
- BugfixMagnitude admits exactly 'small' | 'sized'.
- TriageResult gains an optional magnitude field; the four existing fields are unchanged.
- tsc compiles.

### E202609181703991c:S001:T003 — Add the bugfix arm to routeForSizeClass (magnitude-gated) + exhaustiveness backstop

In src/workflow/triage/classify.ts widen `routeForSizeClass(sizeClass: SizeClass, magnitude?: BugfixMagnitude): TriageRoute`. Leave the epic/feature/small/trivial case bodies BYTE-FOR-BYTE unchanged. Add `case 'bugfix':` returning { startStage: 'issue', standalone: true, needsPlan: magnitude === 'sized', producesLld: magnitude === 'sized' } with a guard that throws when magnitude is undefined (this runtime guard is the AUTHORITATIVE backstop that a bugfix never routes without a magnitude, independent of schema keyword support). Add a default/exhaustiveness backstop (`const _exhaustive: never = sizeClass; ...`) so a future SizeClass member is a compile error (no assertNever helper exists — use a small local pattern).

**Acceptance checks:**
- routeForSizeClass('bugfix','small') -> { startStage:'issue', standalone:true, needsPlan:false, producesLld:false }; ('bugfix','sized') -> needsPlan/producesLld true.
- routeForSizeClass('bugfix') with no magnitude throws (the authoritative magnitude-less guard).
- The four existing tiers return identical literals; magnitude is not consulted for them (routeForSizeClass('small','sized') === routeForSizeClass('small')).
- The switch is exhaustive: removing a case or adding an unhandled member is a tsc error.

### E202609181703991c:S001:T004 — Bugfix-aware classification schema + prompt (declaredBugfix, magnitude, conditional-required)

In src/workflow/triage/classify.ts: add an optional `magnitude` property (enum ['small','sized']) to CLASSIFY_SCHEMA and a conditional 'required magnitude when sizeClass===bugfix' rule. Prefer the allOf[{if/then}] form the validateAgainstSchema walker already handles (it walks anyOf/allOf); if the if/then keyword is not honoured by that walker, the routeForSizeClass runtime guard (t3) is the authoritative enforcement and the schema conditional is best-effort — do NOT block the build on an unsupported keyword. Add `readonly declaredBugfix?: boolean` to ClassifyPromptInput and extend the SYSTEM prompt (buildClassifyPrompt) so that when declaredBugfix is set the turn is told to return sizeClass 'bugfix' + a magnitude; when unset the prompt is byte-for-byte the current four-tier prompt.

**Acceptance checks:**
- CLASSIFY_SCHEMA.properties.sizeClass.enum includes 'bugfix' (auto-derived from SIZE_CLASSES) and a magnitude enum prop exists.
- validateAgainstSchema accepts { sizeClass:'bugfix', magnitude:'small'|'sized', ... }; rejects an out-of-enum magnitude; and (via the allOf/if-then conditional OR, if unsupported by the walker, via the t3 runtime guard proven in t5) a magnitude-less bugfix is not allowed to route.
- buildClassifyPrompt without declaredBugfix returns a prompt identical to the pre-change four-tier prompt; with declaredBugfix:true the SYSTEM text includes bugfix+magnitude guidance.
- tsc compiles.

### E202609181703991c:S001:T005 — Extend classify.test.ts: four-tier regression + bugfix route/schema/prompt/contract tests

Update src/workflow/triage/__tests__/classify.test.ts: re-express the two SIZE_CLASSES loop invariants (`standalone===sc!=='epic'`, `producesLld===sc!=='trivial'`) so 'bugfix' is covered without weakening the four existing tiers; add unit tests for the bugfix route (small/sized/no-magnitude-throws/magnitude-ignored-for-non-bugfix), the CLASSIFY_SCHEMA magnitude validation (valid/out-of-enum + an EXPLICIT assertion on how a magnitude-less bugfix is rejected — schema if allOf/if-then works, else the routeForSizeClass runtime guard), buildClassifyPrompt with/without declaredBugfix, and the sc1 contract (TriageResult carries magnitude iff bugfix; startStage 'issue'). Run `npx tsx --test 'src/workflow/triage/**/*.test.ts'` and confirm green locally.

**Acceptance checks:**
- All ac1 proving tests pass: four existing tiers return exact current literals; enum includes 'bugfix'; unchanged prompt without declaredBugfix; specScopeFitsStandalone unaffected for the four tiers.
- All ac2 proving tests pass: bugfix small/sized routes; a magnitude-less bugfix is provably rejected (schema or runtime guard); contract test on TriageResult.magnitude.
- The full triage test suite is green locally via tsx --test; no existing assertion is deleted or weakened for the four tiers.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| routeForSizeClass('epic'\|'feature'\|'small'\|'trivial') returns the exact current literals (regression) | `t5`, `t3` |
| routeForSizeClass('bugfix','small') -> { startStage:'issue', standalone:true, needsPlan:false, producesLld:false } | `t3` |
| routeForSizeClass('bugfix','sized') -> { startStage:'issue', standalone:true, needsPlan:true, producesLld:true } | `t3` |
| routeForSizeClass('bugfix') with no magnitude throws (invariant guard) | `t3` |
| routeForSizeClass('small','sized') ignores magnitude and returns the small literal (param only read on bugfix arm) | `t3` |
| the classify.test.ts SIZE_CLASSES loop invariants re-expressed so 'bugfix' is covered without weakening `standalone===sc!=='epic'` / `producesLld===sc!=='trivial'` for the four existing tiers | `t5` |
| CLASSIFY_SCHEMA validates a { sizeClass:'bugfix', magnitude:'small'\|'sized', ... } payload | `t4` |
| CLASSIFY_SCHEMA REJECTS { sizeClass:'bugfix' } with no magnitude (conditional required) | `t5`, `t4` |
| CLASSIFY_SCHEMA rejects an out-of-enum magnitude (e.g. 'medium') | `t4` |
| CLASSIFY_SCHEMA.sizeClass.enum includes 'bugfix' (auto-derived from SIZE_CLASSES) | `t4` |
| buildClassifyPrompt({..., declaredBugfix:true}) emits bugfix+magnitude guidance in SYSTEM; buildClassifyPrompt without declaredBugfix emits the current four-tier prompt unchanged | `t4` |
| A TriageResult with sizeClass 'bugfix' has a magnitude and route.startStage 'issue' | `t5` |
| A TriageResult with any of the four existing sizes has no magnitude field and its current route | `t5` |
| BugfixMagnitude type admits exactly 'small' \| 'sized' | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails — sc1 (routeForSizeClass(sizeClass, magnitude?) + buildClassifyPrompt) + interactionWithShared sc1 implements`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges — SizeClass/SIZE_CLASSES/BugfixMagnitude/TriageResult.magnitude/ClassifyPromptInput.declaredBugfix/CLASSIFY_SCHEMA`
- **[[c3]]** `prior-artifact` `LLD s1 migration step 1 + approved HLD amendment — the 'issue' WORKFLOW_NAMES literal moved into s1/Phase A (additive, non-breaking)`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy — unit + contract test levels + acceptanceMapping (ac1/ac2) over classify.test.ts`
