<!-- insrc:artifact PLAN-99bc81bbe965eec3-s1 -->

# Plan: E2026092999bc81bb:S001

**Epic:** `lld-bugfix-scope-structural-label-build`
**LLD run:** `wf-1790664980219-t9lfhg`
**LLD effective hash:** `a7c7f317f01b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the optional epic scope to resolveWorkflowRef + resolveByLabel | S | — | unit: resolveByLabel/resolveWorkflowRef: in a MULTI-epic dir, resolveWorkflowRef(repo, 's1/t1', { epicHash }) resolves to that epic's task (via buildRef); full hash + 8-char prefix both resolve.; unit: resolveWorkflowRef: unscoped 's1/t1' still null in multi-epic; single-epic still resolves unscoped (unchanged).; unit: resolveWorkflowRef: epicHash matching zero epics → null; prefix matching >1 → null (refuse-to-guess). | [[c1]] |
| 2 | **`t2`** Widen the resolveRef callback type in bugfix/mount.ts | S | `t1` | unit: backward-compat: existing 2-arg resolveWorkflowRef consumers (workflowIdForIssue/issueForWorkflowId, bugfix/mount.ts resolveRef) typecheck + behave unchanged; tracker.test.ts stays green. | [[c3]] |
| 3 | **`t3`** Thread an optional epicHash through resolveTaskRef | S | `t1` | unit: resolveTaskRef: 3-arg call threads epicHash into resolveWorkflowRef; 2-arg call unchanged. | [[c2]] |
| 4 | **`t4`** Add the optional epicHash build-step input + MCP schema + wire both phases | S | `t3` | unit: handleImplement + handleValidate: { phase, target:'s1/t1', epicHash, repo } against a multi-epic dir resolves + proceeds (no 'unresolved-target').; unit: handleImplement/handleValidate: 's1/t1' without epicHash in a multi-epic dir still returns err('unresolved-target'); standalone path untouched (standalone-implement.test.ts green). | [[c2]] |
| 5 | **`t5`** Regression tests: multi-epic scoped resolve (resolver + build-step) + unchanged paths | M | `t1`, `t3`, `t4` | unit: resolveWorkflowRef: issue# (#N / owner/repo#N) and hierarchical-id forms resolve identically whether or not opts.epicHash is passed (scope ignored off the label path).; unit: the multi-epic fixture (two epics' DEF+LLD+PLAN, both with s1/t1) is shared by the resolver + build-step scoped-resolve cases; the pre-existing single-epic 's1/t1' tests + standalone-implement.test.ts stay green; full sweep green under tsx --test. | [[c1]] [[c2]] [[c4]] |

### E2026092999bc81bb:S001:T001 — Add the optional epic scope to resolveWorkflowRef + resolveByLabel

In src/workflow/tracker/resolve.ts: add `opts?: { readonly epicHash?: string | undefined }` as a 3rd param to resolveWorkflowRef (:292) and pass it through the LABEL_RE dispatch (:311) to resolveByLabel; add `epicHash?: string` as a 4th param to resolveByLabel (:266). When epicHash is set, prefix-match it against listEpicHashes(dir) (startsWith, mirroring resolveByHier's hash8 match) — exactly one match → buildRef(dir, thatHash, storyId, taskId); zero or >1 matches → null. When epicHash is unset, keep the current `hashes.length !== 1 → null` single-epic rule verbatim. No change to resolveByIssue/resolveByHier.

**Acceptance checks:**
- resolveWorkflowRef accepts an optional opts.epicHash; a structural label + a matching epicHash resolves in a multi-epic dir via buildRef
- unscoped resolveByLabel is byte-identical (single-epic → resolve, multi-epic → null)
- epicHash matching zero epics → null; a prefix matching >1 → null
- tsc clean; resolveByIssue/resolveByHier untouched

### E2026092999bc81bb:S001:T002 — Widen the resolveRef callback type in bugfix/mount.ts

Update the resolveRef dependency callback type at src/workflow/bugfix/mount.ts:116 so it admits resolveWorkflowRef's new optional 3rd arg (a ResolveRefFn = (repoPath, identifier, opts?) => ResolvedRef | null). Type-only, additive — mount.ts need not pass the opt; the existing 2-arg wiring stays valid.

**Acceptance checks:**
- bugfix/mount.ts typechecks against the widened resolveWorkflowRef signature
- the resolveRef callback still passes resolveWorkflowRef unchanged (no opt supplied)

### E2026092999bc81bb:S001:T003 — Thread an optional epicHash through resolveTaskRef

In src/mcp/build-step/render.ts: add `epicHash?: string` to resolveTaskRef (:53) and pass it as resolveWorkflowRef(repoPath, target, { epicHash }) at :54. The null-ref → 'could not resolve target' message + the non-task-level guard are unchanged. 2-arg callers unaffected.

**Acceptance checks:**
- resolveTaskRef forwards epicHash into resolveWorkflowRef's opts
- a 2-arg resolveTaskRef call behaves exactly as before
- tsc clean

### E2026092999bc81bb:S001:T004 — Add the optional epicHash build-step input + MCP schema + wire both phases

Add `readonly epicHash?: string | undefined` to BuildStepInputImplement (types.ts:45) and BuildStepInputValidate (:55), and add the same optional field to the insrc_build_step MCP tool INPUT SCHEMA so a caller can actually pass it. In handleImplement (implement.ts:56) and handleValidate (validate.ts:64) pass input.epicHash: resolveTaskRef(repoPath, input.target, input.epicHash). The standalone path (BuildStandaloneContext) is untouched.

**Acceptance checks:**
- both epic-tracked input types carry optional epicHash; the MCP tool input schema exposes it
- handleImplement/handleValidate pass input.epicHash into resolveTaskRef
- a build with { target:'s4/t1', epicHash } resolves; without epicHash in a multi-epic dir still returns 'unresolved-target'
- standalone path unchanged; tsc clean

### E2026092999bc81bb:S001:T005 — Regression tests: multi-epic scoped resolve (resolver + build-step) + unchanged paths

Extend tracker/__tests__/tracker.test.ts with a MULTI-epic fixture (two epics' DEF+LLD+PLAN, both with s1/t1): scoped resolveWorkflowRef(repo,'s1/t1',{epicHash}) resolves (full hash + 8-char prefix); unscoped stays null; zero-match/ambiguous-prefix → null; issue#/hierId forms unaffected by the opt; single-epic unscoped still resolves. Extend build-step.test.ts with a multi-epic + { target:'s1/t1', epicHash } scoped-resolve case (fake ValidateProvider + approved PLAN) and the without-epicHash still-'unresolved-target' case; confirm the existing single-epic 's1/t1' tests + standalone-implement.test.ts stay green.

**Acceptance checks:**
- tracker.test.ts covers scoped-resolve (full+prefix), unscoped-null, zero/ambiguous-scope-null, issue#/hierId-unaffected, single-epic-unchanged
- build-step.test.ts covers scoped-resolve end-to-end + without-scope still-refuses
- the pre-existing single-epic label tests + standalone tests remain green
- full sweep green under tsx --test (sole known failure = the better-sqlite3 native-ABI red herring)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveByLabel/resolveWorkflowRef: in a MULTI-epic dir, resolveWorkflowRef(repo, 's1/t1', { epicHash: <present hash> }) resolves to that epic's task (via buildRef); the full 16-hex hash and an 8-char prefix both resolve. | `t1`, `t5` |
| resolveWorkflowRef: in a multi-epic dir, an UNSCOPED 's1/t1' still returns null (unchanged); a single-epic dir still resolves unscoped (unchanged). | `t1`, `t5` |
| resolveWorkflowRef: an epicHash matching ZERO epics → null; a prefix matching >1 epics → null (refuse-to-guess). | `t1`, `t5` |
| resolveWorkflowRef: issue# (#N / owner/repo#N) and hierarchical-id forms resolve identically whether or not opts.epicHash is passed (scope ignored off the label path). | `t5` |
| backward-compat: the existing 2-arg resolveWorkflowRef calls (workflowIdForIssue/issueForWorkflowId, bugfix/mount.ts resolveRef callback type) still typecheck + behave unchanged. | `t2`, `t5` |
| handleImplement + handleValidate: { phase, target:'s1/t1', epicHash, repo } against a multi-epic dir resolves + proceeds (no 'unresolved-target'); the taskId/storyId surface correctly. | `t4`, `t5` |
| handleImplement/handleValidate: { target:'s1/t1' } WITHOUT epicHash in a multi-epic dir still returns err('unresolved-target', ...) (the fix is opt-in via scope). | `t4`, `t5` |
| resolveTaskRef: 3-arg call threads epicHash into resolveWorkflowRef; 2-arg call unchanged. | `t3` |
| the standalone path (BuildStandaloneContext) is untouched — standalone-implement.test.ts stays green. | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails+dataModel: resolveWorkflowRef/resolveByLabel epic-scoping (src/workflow/tracker/resolve.ts:266/:292 + buildRef:137 + resolveByHier:249 prefix-match)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails+dataModel: resolveTaskRef epicHash thread (render.ts:53-54) + build-step inputs/MCP schema + handleImplement/handleValidate wiring (types.ts:45/:55, implement.ts:56, validate.ts:64)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModel: resolveWorkflowRef opts + the bugfix/mount.ts:116 resolveRef callback-type widening (backward-compat surface)`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy: extend tracker/__tests__/tracker.test.ts + mcp/build-step/__tests__/build-step.test.ts with the multi-epic scoped-resolve regression; standalone-implement.test.ts stays green`
