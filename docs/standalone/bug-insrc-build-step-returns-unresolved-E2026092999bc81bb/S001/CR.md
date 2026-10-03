<!-- insrc:artifact CR-99bc81bbe965eec3-s1 -->

# Code review: 99bc81bbe965eec3:s1

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 4 · model `client`

**Changed files:** 9

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/locate/types.ts:82 | Implements the approved LLD/PLAN faithfully: resolveWorkflowRef gains an optional opts.epicHash (resolve.ts:302) threaded to resolveByLabel (resolve.ts:266), which prefix-matches via listEpicHashes + buildRef (exactly-one → resolve, zero/>1 → null) and keeps the unscoped single-epic rule verbatim; resolveTaskRef threads epicHash (render.ts:53); both build phases pass input.epicHash; types.ts + server.ts expose the optional field end-to-end. One in-scope deviation from the LLD's literal anchor: the callback-type widening landed on LocateParentDeps.resolveRef (locate/types.ts:82) — the ACTUAL declared type that bugfix/mount.ts:116 wires resolveWorkflowRef into via locateParent — which is more correct than the LLD's guessed bugfix/mount.ts site. No adherence breach. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/resolve.ts:266 | Conventions upheld: additive optional trailing params (backward-compatible), the scoped branch mirrors resolveByHier's `h.startsWith(hash8)` idiom, `matches[0]!` is guarded by the `length !== 1` check (noUncheckedIndexedAccess-safe), no console/Promise.all, docstrings updated. The `opts?: { readonly epicHash? }` object shape (vs a bare positional arg) matches the LLD's intent to leave room for future scope fields. No convention breach. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/__tests__/tracker.test.ts:1 | Coverage judged by RUNNING the suites (diff grounding is file-level/hollow, not authoritative). Independently verified: tsc --noEmit exit 0; full sweep 4024 tests / 3895 pass / 1 fail / 125 skip where the sole failure is the pre-existing ERR_DLOPEN_FAILED sqlite native-ABI red herring (NODE_MODULE_VERSION 127 vs 147), unrelated to the touched code; the resolver + build-step target suites re-ran 47/47 green. New tests cover every LLD subject: multi-epic scoped resolve (full hash + 8-char prefix), unscoped-null-in-multi/single-epic-resolves, zero-match + ambiguous-prefix → null, issue#/hierId unaffected by the opt, build-step scoped implement+validate resolve (asserting the correct epic's issueRef, not the sibling's), and without-epicHash still-'unresolved-target'. The pre-existing single-epic 's1/t1' tests + standalone-implement.test.ts stay green. No coverage gap. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/build-step/render.ts:54 | Sound, minimal fix. One trivial observation: resolveTaskRef always constructs `{ epicHash }` even when epicHash is undefined, yielding opts={epicHash:undefined}; resolveWorkflowRef guards with `opts?.epicHash` so this is byte-identical to the unscoped path — harmless, no change needed. The refuse-to-guess stance on an ambiguous prefix (return null rather than pick one) is the correct safety choice and is tested. The fix resolves the exact defect it was scoped to and reuses buildRef rather than forking a parallel lookup. |

