<!-- insrc:artifact LLD-99bc81bbe965eec3-s1 -->

# LLD: E2026092999bc81bb:S001

**Epic:** `lld-bugfix-scope-structural-label-build`
**HLD base run:** `wf-1790664980219-t9lfhg`
**HLD effective hash:** `a7c7f317f01b...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `resolveWorkflowRef`

```typescript
function resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null
```

**Parameters:**
- `repoPath: string` — Repo whose .insrc/artifacts/ holds the DEF/LLD/PLAN JSON (unchanged).
- `identifier: string` — Any identifier form: issue# / hierarchical id / structural label (unchanged).
- `opts: { epicHash?: string }` _(optional)_ — NEW additive optional scope. When a structural label is parsed and opts.epicHash is set, the label resolves against that epic instead of requiring a single-epic dir. Absent → today's behaviour verbatim.

**Returns:** `ResolvedRef | null` — The unified ref (unchanged shape, resolve.ts:50-68), or null when unlocatable. The only behavioural delta: a structural label in a multi-epic dir now resolves when opts.epicHash names a present epic.

**Preconditions:**
- opts.epicHash, when provided, is a full or prefix DEF hash of an epic present in the dir; a non-matching/ambiguous scope resolves to null (no throw).

**Postconditions:**
- Absent opts (or a non-label identifier) → byte-identical to the current resolver for all four existing 2-arg consumers.
- A structural label + a matching opts.epicHash → resolves via the existing buildRef(dir, epicHash, storyId, taskId).

### `resolveByLabel`

```typescript
function resolveByLabel(dir: string, storyId: string, taskId?: string, epicHash?: string): ResolvedRef | null
```

**Parameters:**
- `epicHash: string | undefined` _(optional)_ — NEW optional scope. When set, disambiguate to that epic (prefix-match against listEpicHashes, mirroring resolveByHier's hash8 match) and call buildRef with it; when unset, keep the current `hashes.length !== 1 → null` single-epic rule.

**Returns:** `ResolvedRef | null` — The resolved label ref, or null when the epic can't be uniquely determined (no scope + multi-epic dir, OR a scope that matches zero / >1 epics).

**Preconditions:**
- When epicHash is provided it is matched against listEpicHashes(dir); exactly one match → resolve, else null.

**Postconditions:**
- epicHash undefined → identical to the current single-epic behaviour (resolve.ts:266-270).
- epicHash matching one present epic → resolves the label in a multi-epic dir.

### `resolveTaskRef`

```typescript
function resolveTaskRef(repoPath: string, target: string, epicHash?: string): TaskResolution
```

**Parameters:**
- `epicHash: string | undefined` _(optional)_ — NEW optional scope threaded straight into resolveWorkflowRef(repoPath, target, { epicHash }). Absent → unchanged.

**Returns:** `TaskResolution` — { ok:true, ref } on a task-level resolve, else { ok:false, message } (unchanged shape). With epicHash set, a structural label in a multi-epic dir now reaches ok:true instead of the 'could not resolve target' message.

**Preconditions:**
- Called by the two build phases with the epic-tracked build's known epicHash.

**Postconditions:**
- The 2-arg call site behaviour is unchanged; the 3-arg call scopes the label.

### `handleImplement / handleValidate`

```typescript
// unchanged signatures; internal wiring only
handleImplement(input: BuildStepInputImplement): Promise<...>
handleValidate(input: BuildStepInputValidate): Promise<...>
```

**Parameters:**
- `input: BuildStepInputImplement | BuildStepInputValidate` — Now carries an optional epicHash on the epic-tracked path; each phase passes it: resolveTaskRef(repoPath, input.target, input.epicHash).

**Returns:** `Promise<BuildStep*>` — Unchanged; the only change is the extra scoped arg into resolveTaskRef so a structural target resolves in a multi-epic repo.

**Errors:**
- `err('unresolved-target', ...)` when still returned when resolveTaskRef fails — but no longer fires for a well-formed sN/tN label once input.epicHash is supplied (implement.ts:57, validate.ts:65).

**Preconditions:**
- The MCP caller supplies input.epicHash for an epic-tracked build (the approve/build flow already knows it).

**Postconditions:**
- A build invoked with { target:'s4/t1', epicHash } resolves and proceeds; a build without epicHash in a single-epic repo is unchanged.

## Data model changes

### `BuildStepInputImplement + BuildStepInputValidate (src/mcp/build-step/types.ts)` — field-add

Add an optional `epicHash?: string | undefined` to the epic-tracked build inputs (the standalone path already has its own epicHash on BuildStandaloneContext). Purely additive; a build that omits it behaves exactly as today (single-epic dirs, issue#, hierId all still work). The MCP tool input schema gains the same optional field so callers can pass it.

```
+ readonly epicHash?: string | undefined;  // on BuildStepInputImplement (:45) and BuildStepInputValidate (:55)
```

**Call sites:**
- `src/mcp/build-step/types.ts:45`
- `src/mcp/build-step/phases/implement.ts:56`
- `src/mcp/build-step/phases/validate.ts:64`

### `resolveByLabel epic-scoping (src/workflow/tracker/resolve.ts)` — invariant-change

Today's invariant: a structural label resolves ONLY in a single-epic dir (hashes.length !== 1 → null). New invariant: a structural label ALSO resolves when a caller-provided epicHash uniquely matches a present epic; the unscoped path keeps the single-epic invariant verbatim. This preserves the existing behaviour it might otherwise break (unscoped callers), which is why it is modelled as an additive scope rather than replacing the rule.

```
resolveByLabel(dir, storyId, taskId?, epicHash?) — epicHash scopes via prefix-match + buildRef; else unchanged.
```

**Call sites:**
- `src/workflow/tracker/resolve.ts:266`
- `src/workflow/tracker/resolve.ts:311`
- `src/workflow/tracker/resolve.ts:292`

### `resolveWorkflowRef opts + bugfix/mount.ts resolveRef callback type` — field-add

resolveWorkflowRef gains the optional opts param. The bugfix/mount.ts `resolveRef: resolveWorkflowRef` dependency callback type must admit (but need not pass) the optional 3rd arg — an additive widening, so the existing 2-arg call stays valid. workflowIdForIssue/issueForWorkflowId keep calling 2-arg unchanged.

```
type ResolveRefFn = (repoPath: string, identifier: string, opts?: { epicHash?: string }) => ResolvedRef | null;
```

**Call sites:**
- `src/workflow/tracker/resolve.ts:292`
- `src/workflow/bugfix/mount.ts:116`
- `src/mcp/build-step/render.ts:54`

## Error paths

### Error cases

- **The caller passes an epicHash scope that matches NO epic present in .insrc/artifacts/ (e.g. a stale/typo'd hash).** (recoverable)
  - Detection: resolveByLabel prefix-matches the provided epicHash against listEpicHashes(dir) and finds zero matches.
  - Response: Return null (no throw); resolveTaskRef maps null to { ok:false, message } and the build phase returns err('unresolved-target', ...) — the existing failure path, now for a genuinely unlocatable scope.
  - User impact: The build refuses with the same clear 'could not resolve target' guidance; the operator fixes the epicHash and retries.
- **The provided epicHash is a prefix that ambiguously matches MORE THAN ONE present epic.** (recoverable)
  - Detection: resolveByLabel's prefix-match against listEpicHashes(dir) yields >1 candidate hash.
  - Response: Return null (refuse to guess) rather than pick one — mirroring resolveByLabel's existing 'ambiguous → null' stance; the caller must pass a longer/full hash.
  - User impact: The build refuses instead of resolving the wrong epic's task; the operator disambiguates with a fuller hash.
- **The epicHash matches an epic, but that epic's PLAN has no such task (the label names a story/task the epic doesn't contain).** (recoverable)
  - Detection: buildRef locates the epic + mints ids but the PLAN read finds no task with taskId (task=undefined); resolveTaskRef's guard (render.ts:63) sees ref.level !== 'task' / taskId===undefined.
  - Response: resolveTaskRef returns { ok:false, message: "...resolved to a <level>, not a task..." } (the existing non-task message), so the build refuses cleanly.
  - User impact: The operator learns the label doesn't name a task in that epic (wrong story/task ordinal), and corrects it.

### Edge cases

| Input | Expected |
| :--- | :--- |
| epicHash omitted, single-epic .insrc/artifacts/ dir, target 's1/t1'. | Resolves exactly as today via the unchanged single-epic branch (hashes.length === 1 → buildRef). |
| epicHash omitted, multi-epic dir, target 's1/t1'. | Returns null (unchanged current behaviour) → build still surfaces 'unresolved-target'; the fix requires the caller to supply the scope, it does not change the unscoped verdict. |
| epicHash supplied as an 8-char prefix vs the full 16-hex hash, both naming the one epic. | Both resolve identically — the prefix-match (startsWith, like resolveByHier's hash8 match) accepts either. |
| A non-label identifier (issue# like '#42' or a hierarchical id) passed WITH an epicHash opt. | epicHash is ignored — only the resolveByLabel branch consults it; the issue#/hierId paths resolve exactly as today. |
| target 's1' (story-level, no task) with a matching epicHash on the build path. | resolveByLabel resolves the story ref, but resolveTaskRef's non-task guard still refuses it for build (build operates on a task) — unchanged level enforcement. |

### Invariants to preserve

- resolveWorkflowRef called with two args (no opts) is byte-identical to today for every existing consumer — render.ts's resolveTaskRef, bugfix/mount.ts's resolveRef callback, and the workflowIdForIssue/issueForWorkflowId helpers — so the epic-scope parameter is purely additive. [[c3]]
- The issue# (resolveByIssue) and hierarchical-id (resolveByHier) resolution paths are untouched; only the structural-label branch (resolveByLabel) gains the optional scope, and its unscoped single-epic rule (hashes.length !== 1 → null) is preserved verbatim. [[c1]]
- buildRef remains the SOLE epic-scoped ref assembler; the scoped label path reuses buildRef(dir, epicHash, storyId, taskId) rather than introducing a parallel lookup, so ResolvedRef shape + minting stay consistent. [[c1]]
- The existing single-epic label tests (build-step.test.ts target 's1/t1') and the resolver suite (tracker.test.ts) must stay green — the change adds cases, it does not alter the outcomes those tests pin. [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test), the repo-wide convention — colocated __tests__/*.test.ts, extending the existing tracker.test.ts + build-step.test.ts suites.`

### Test levels

- **unit** — Prove the resolver-level scoping: a structural label resolves against a caller-provided epicHash in a multi-epic dir, and every unscoped/other-form path is byte-identical to today.
  - Subjects: `resolveByLabel/resolveWorkflowRef: in a MULTI-epic dir, resolveWorkflowRef(repo, 's1/t1', { epicHash: <present hash> }) resolves to that epic's task (via buildRef); the full 16-hex hash and an 8-char prefix both resolve.`, `resolveWorkflowRef: in a multi-epic dir, an UNSCOPED 's1/t1' still returns null (unchanged); a single-epic dir still resolves unscoped (unchanged).`, `resolveWorkflowRef: an epicHash matching ZERO epics → null; a prefix matching >1 epics → null (refuse-to-guess).`, `resolveWorkflowRef: issue# (#N / owner/repo#N) and hierarchical-id forms resolve identically whether or not opts.epicHash is passed (scope ignored off the label path).`, `backward-compat: the existing 2-arg resolveWorkflowRef calls (workflowIdForIssue/issueForWorkflowId, bugfix/mount.ts resolveRef callback type) still typecheck + behave unchanged.`
  - Fixtures: `a tmp .insrc/artifacts/ dir seeded with TWO epics' DEF+LLD+PLAN (both containing s1/t1) — the multi-epic case the bug needs`, `a single-epic tmp dir (the existing fixture) for the unchanged-path assertions`, `a PLAN whose tasks include t1 so buildRef returns a task-level ref`
- **unit** — Prove the build-step seam threads the scope end-to-end: an epic-tracked build resolves a structural target when input.epicHash is supplied, and refuses cleanly on a bad scope.
  - Subjects: `handleImplement + handleValidate: { phase, target:'s1/t1', epicHash, repo } against a multi-epic dir resolves + proceeds (no 'unresolved-target'); the taskId/storyId surface correctly.`, `handleImplement/handleValidate: { target:'s1/t1' } WITHOUT epicHash in a multi-epic dir still returns err('unresolved-target', ...) (the fix is opt-in via scope).`, `resolveTaskRef: 3-arg call threads epicHash into resolveWorkflowRef; 2-arg call unchanged.`, `the standalone path (BuildStandaloneContext) is untouched — standalone-implement.test.ts stays green.`
  - Fixtures: `the multi-epic tmp repo + a fake ValidateProvider (_setBuildValidateProviderForTests) returning a canned verdict`, `an approved PLAN under the scoped epic so admitBuild admits`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `resolveByLabel/resolveWorkflowRef: in a MULTI-epic dir, resolveWorkflowRef(repo, 's1/t1', { epicHash }) resolves to that epic's task (via buildRef); full hash + 8-char prefix both resolve.`, `handleImplement + handleValidate: { phase, target:'s1/t1', epicHash, repo } against a multi-epic dir resolves + proceeds (no 'unresolved-target').` |
| `ac2` | `resolveWorkflowRef: unscoped 's1/t1' still null in multi-epic; single-epic still resolves unscoped (unchanged).`, `resolveWorkflowRef: issue#/hierId forms resolve identically with/without opts.epicHash.`, `backward-compat: existing 2-arg resolveWorkflowRef consumers (workflowIdForIssue/issueForWorkflowId, bugfix/mount.ts resolveRef) typecheck + behave unchanged; tracker.test.ts stays green.` |
| `ac3` | `resolveWorkflowRef: epicHash matching zero epics → null; prefix matching >1 → null (refuse-to-guess).`, `handleImplement/handleValidate: 's1/t1' without epicHash in a multi-epic dir still returns err('unresolved-target'); standalone path untouched (standalone-implement.test.ts green).` |

## Migration

**State before:** resolveWorkflowRef(repoPath, identifier) (tracker/resolve.ts:292) is the single 2-arg resolver; a structural label dispatches to resolveByLabel (:311), which refuses whenever the artifacts dir is not single-epic (`if (hashes.length !== 1) return null;` :266-270). The build step funnels through resolveTaskRef(repoPath, target) (render.ts:53-54) with only the bare target string, so an epic-tracked sN/tN build in a multi-epic repo returns err('unresolved-target', ...) (implement.ts:57, validate.ts:65). The epic-tracked build inputs (BuildStepInputImplement/Validate, types.ts:45/:55) carry no epic-scope field; only the standalone path has its own epicHash. resolveWorkflowRef's other consumers are 2-arg: render.ts's resolveTaskRef, bugfix/mount.ts's resolveRef callback (:116), and workflowIdForIssue/issueForWorkflowId (:322/:328).

**State after:** resolveWorkflowRef takes an additive optional 3rd arg `opts?: { epicHash? }`; when a structural label is parsed and opts.epicHash matches exactly one present epic (prefix-match like resolveByHier), resolveByLabel resolves it via the existing buildRef instead of requiring a single-epic dir. resolveTaskRef gains an optional epicHash threaded into that opts; the epic-tracked build inputs gain an optional epicHash the two phases pass. Every 2-arg / non-label / single-epic path is byte-identical to before. Net: an epic-tracked build invoked with { target:'s4/t1', epicHash } resolves and proceeds in a multi-epic repo.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional `opts?: { epicHash? }` parameter to resolveWorkflowRef and the optional `epicHash?` parameter to resolveByLabel; when set, prefix-match it against listEpicHashes and resolve via buildRef, else keep the current single-epic rule. Pure add — no existing call changes behaviour. — ↩ rollbackable
2. Widen the resolveRef callback type in bugfix/mount.ts to admit the optional 3rd arg (it need not pass it). Type-only, additive. — ↩ rollbackable
3. Thread an optional epicHash through resolveTaskRef (render.ts) into resolveWorkflowRef's opts. — ↩ rollbackable
4. Add the optional epicHash field to the epic-tracked build-step input types + the MCP tool input schema, and have handleImplement/handleValidate pass input.epicHash into resolveTaskRef. — ↩ rollbackable
5. Add the regression tests: resolver-level multi-epic scoped-resolve + unchanged-unscoped cases (tracker.test.ts) and a build-step scoped-resolve case (build-step.test.ts); confirm the existing single-epic label tests + standalone tests stay green. — ↩ rollbackable

**Backward compat:** Fully backward-compatible. resolveWorkflowRef / resolveTaskRef / resolveByLabel all gain OPTIONAL trailing parameters that default to undefined = today's exact behaviour, so every existing 2-arg consumer (render.ts resolveTaskRef, bugfix/mount.ts resolveRef callback, workflowIdForIssue/issueForWorkflowId) compiles and behaves unchanged. The build-step input change is an added optional field — a build that omits epicHash is unaffected (single-epic dirs, issue#, hierId, and hierarchical ids all resolve exactly as before). No public-API removal or rename; the unscoped single-epic label invariant is preserved verbatim.

## Alternatives considered

### a1: Additive optional epic-scope param on resolveWorkflowRef + optional epicHash on the build-step input — **CHOSEN**

Widen resolveWorkflowRef with an optional { epicHash } scope that resolveByLabel consults (falling back to today's single-epic rule when absent), and add an optional epicHash to the epic-tracked build-step input, threaded resolveTaskRef → resolveWorkflowRef.

resolveWorkflowRef(repoPath, identifier, opts?: { epicHash?: string }): when a structural label is parsed and opts.epicHash is provided, resolveByLabel resolves against that epic (validating it is a real DEF hash present in the dir, disambiguating by prefix like resolveByHier's hash8 match) and calls the existing buildRef(dir, epicHash, storyId, taskId); when opts.epicHash is absent it keeps the exact current behaviour (single-epic dir → resolve, else null). resolveTaskRef(repoPath, target, epicHash?) threads the scope; BuildStepInputImplement/Validate gain an optional epicHash?; the two phases pass input.epicHash. The issue#/hierId/single-epic-label forms are untouched. buildRef already does the epic-scoped read, so no new resolution machinery.

### a2: Caller composes a hierarchical id (no resolver change)

Leave resolveWorkflowRef untouched; when the build step has an epicHash + a bare sN/tN label, it composes the canonical E<date><hash>:S..:T.. id and passes THAT as the target so resolveByHier handles it.

resolveTaskRef (or the phases) detect a structural label + an available epicHash, read the epic's DEF createdAt, mint the canonical/slug hierarchical id via id.ts (taskWorkflowId/toCanonical), and call resolveWorkflowRef with the hierarchical id — which routes to resolveByHier and works in a multi-epic dir. resolveWorkflowRef + resolveByLabel stay exactly as today.

**Rejected because:** Smallest blast radius but scores 'violates' on ownership and only 'partial' on the fix (build-step-local), leaving the resolver defect in place for other callers. Loses to a1's resolver-level fix.

### a3: Infer the epic from label presence (heuristic, no param)

Make resolveByLabel, in a multi-epic dir, scan the epics and resolve the label against the one epic whose PLAN/LLD actually contains that story/task — no new parameter.

resolveByLabel drops the `hashes.length !== 1` refusal and instead locates the epic(s) whose artifacts contain the given storyId (and taskId); if exactly one matches, resolve it via buildRef; if zero or more than one match, return null. No signature change anywhere.

**Rejected because:** Fails the core case: realistic sN/tN collisions across epics resolve to null, so the bug persists exactly where it bites. Ignores the caller's known epic. Clearly last.

## Citations

- **[[c1]]** `analyze-bundle` `s1 root-cause-map: resolveByLabel (:266-270) multi-epic refusal + resolveWorkflowRef (:292) dispatch + buildRef (:137) epic-scoped lookup + resolveByHier (:249) prefix-match model (src/workflow/tracker/resolve.ts)`
- **[[c2]]** `analyze-bundle` `s1 seam-map: resolveTaskRef (render.ts:53-61) + implement.ts:56-57 + validate.ts:64-65 + BuildStepInput* (types.ts:45/:55) — the build-step target seam`
- **[[c3]]** `analyze-bundle` `s1 caller-inventory: resolveWorkflowRef consumers — render.ts:54, bugfix/mount.ts:116 (resolveRef callback dep), workflowIdForIssue/issueForWorkflowId (resolve.ts:322/:328); all 2-arg (backward-compat surface)`
- **[[c4]]** `analyze-bundle` `s1 test-map: tracker/__tests__/tracker.test.ts (resolver suite) + mcp/build-step/__tests__/build-step.test.ts (single-epic 's1/t1' fixture) + standalone-implement.test.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-29T07:04:26.724Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | resolveByLabel (src/workflow/tracker/resolve.ts ~:266) refuses a structural label whenever the artifacts dir is not single-epic: `if (hashes.length !== 1) return null;` then buildRef(dir, hashes[0], storyId, taskId). | Confirmed: resolve.ts:266 = `function resolveByLabel(dir: string, storyId: string, taskId?: string): ResolvedRef \| null {` and grep confirms the `hashes.length !== 1` refusal body — the exact multi-epic gate the fix scopes. | No change needed — the root-cause anchor resolves verbatim. |
| cl2 | citation | LOW | auto | resolveWorkflowRef (resolve.ts ~:292) is the single resolver taking (repoPath, identifier); a structural label (LABEL_RE) dispatches to resolveByLabel near :311. | Confirmed: resolve.ts:292 = `export function resolveWorkflowRef(repoPath: string, identifier: string): ResolvedRef \| null {` — the 2-arg signature the LLD widens with an optional 3rd param; resolveByLabel dispatch present. | No change needed. |
| cl3 | citation | LOW | auto | buildRef (resolve.ts ~:137) already performs the epic-scoped lookup (reads DEF/LLD/PLAN by epicHash) and is the sole ResolvedRef assembler the scoped-label path can reuse. | Confirmed: resolve.ts:137 = `function buildRef(dir: string, epicHash: string, storyId?: string, taskId?: string): ResolvedRef \| null {` — the epic-scoped assembler the scoped-label path reuses. | No change needed. |
| cl4 | citation | LOW | auto | resolveByHier (resolve.ts ~:249) resolves an epic in a multi-epic dir by prefix-matching hash8 against listEpicHashes + createdAt — the model the scoped resolveByLabel mirrors. | Confirmed: resolve.ts:249 = `function resolveByHier(dir: string, wfid: WorkflowId): ResolvedRef \| null {` + the hash8 startsWith prefix-match — the model the scoped resolveByLabel mirrors. | No change needed. |
| cl5 | citation | LOW | auto | resolveTaskRef (src/mcp/build-step/render.ts ~:53) calls resolveWorkflowRef(repoPath, target) and maps a null ref to the 'could not resolve target' message. | Confirmed: render.ts:54 = `const ref = resolveWorkflowRef(repoPath, target);` + the 'could not resolve target' message — the build-step chokepoint threaded by the fix. | No change needed. |
| cl6 | citation | LOW | auto | Both build phases surface a failed resolveTaskRef as err('unresolved-target', ...): implement.ts ~:57 and validate.ts ~:65. | Confirmed: implement.ts:57 = `if (!resolved.ok) return err('unresolved-target', resolved.message);` (validate.ts:65 mirrors) — the surfaced failure. | No change needed. |
| cl7 | citation | LOW | auto | The epic-tracked build inputs BuildStepInputImplement (~types.ts:45) and BuildStepInputValidate (~:55) carry only `target` (+ standalone? on implement); they have NO epic-scope field today — the field the fix adds. | Confirmed: types.ts:45 = `export interface BuildStepInputImplement {` — the epic-tracked input carrying only target today; the additive epicHash lands here + on BuildStepInputValidate. | No change needed. |
| cl8 | citation | LOW | auto | bugfix/mount.ts (~:116) passes `resolveRef: resolveWorkflowRef` as a dependency callback — a 2-arg consumer whose callback type must still accept the widened (optional 3rd arg) signature. | Confirmed: bugfix/mount.ts:116 = `resolveRef: resolveWorkflowRef,` — the callback-dep consumer whose type must admit the optional 3rd arg (drives the backward-compat requirement). | No change needed — the LLD correctly flags this as the callback type to widen. |
| cl9 | citation | LOW | auto | workflowIdForIssue (~resolve.ts:322) and issueForWorkflowId (~:328) call resolveWorkflowRef with two args — backward-compat consumers unaffected by an optional 3rd param. | Confirmed: resolve.ts:322 = `export function workflowIdForIssue(repoPath: string, issueNumber: number \| string): string \| null {` (issueForWorkflowId adjacent) — a 2-arg consumer unaffected by an optional param. | No change needed. |
| cl10 | citation | LOW | auto | The build-step tests drive handleBuildStep with target 's1/t1' against a SINGLE-epic tmp artifacts dir (build-step.test.ts), and the resolver suite lives at tracker/__tests__/tracker.test.ts — the suites the regression extends. | Confirmed: build-step.test.ts:98 = `handleBuildStep({ phase: 'implement', target: 's1/t1', repo })` against a single-epic tmp dir — exactly why the multi-epic bug never surfaced in CI; the regression extends this suite + tracker.test.ts. | No change needed. |
