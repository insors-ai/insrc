<!-- insrc:artifact ISSUE-99bc81bbe965eec3 -->

# insrc_build_step can't resolve a structural task label (sN/tN) in a multi-epic repo

## Reproduction

In a repo whose .insrc/artifacts/ holds more than one epic DEF (e.g. this repo, which has dozens of DEF-<hash>.json), call insrc_build_step with an epic-tracked structural label as the target — e.g. { phase: 'implement', target: 's4/t1', repo } or { phase: 'validate', target: 's2/t1', repo }. OBSERVED: the tool returns an error { code: 'unresolved-target', message: "insrc_build_step: could not resolve target 's4/t1'. Pass a task issue (#N / owner/repo#N), a hierarchical task id, or a structural label (s1/t3)." } — even though the label is well-formed and the epic's PLAN/LLD exist. EXPECTED: the task resolves to its PLAN task and the build proceeds. WORKAROUND that currently succeeds: pass the hierarchical id instead (e.g. target: 'E20260927c5824e17:S004:T001'), which routes through resolveByHier and is unaffected.

## Root cause

resolveByLabel refuses any structural label whenever the artifacts dir does not contain exactly one epic: `const hashes = listEpicHashes(dir); if (hashes.length !== 1) return null;` (tracker/resolve.ts:266-270). listEpicHashes scans .insrc/artifacts/ for DEF-<hash16>.json, so in a multi-epic repo it returns many hashes and every sN/tN label collapses to null. resolveWorkflowRef (tracker/resolve.ts:292) — the single resolver the build step funnels through — takes only the identifier string and carries NO epic-scope argument, so it cannot disambiguate the label even when the caller knows the epic. The build step then surfaces that null as 'unresolved-target': resolveTaskRef (render.ts:54) maps ref===null to the failure message (render.ts:58-61), and both build phases return err('unresolved-target', ...) (implement.ts:57, validate.ts:65). This is a pure resolver-scoping bug, reproducible without the daemon — not a daemon/socket issue. The standalone build path sidesteps it because it takes epicHash directly rather than resolving a label.

## Fix intent

Give the epic-tracked resolution path a way to scope a structural label to a specific epic: thread an optional epic scope (the epicHash the build caller already knows) from the build-step input through resolveTaskRef into resolveWorkflowRef, and have resolveByLabel resolve against that provided epic instead of requiring listEpicHashes(dir).length === 1. The change must be backward-compatible — the existing issue# (#N / owner/repo#N), hierarchical-id, and single-epic bare-label forms must keep resolving exactly as today; the new scope is additive and only consulted for a structural label in a multi-epic dir. (Intent only — the exact contract shape and call wiring are designed in the LLD.)

## Citations

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts:266 resolveByLabel — `const hashes = listEpicHashes(dir); if (hashes.length !== 1) return null;` (the multi-epic refusal that produces the null)`
- **[[c2]]** `code` `src/workflow/tracker/resolve.ts:292 resolveWorkflowRef — the single shared resolver; signature takes only (repoPath, identifier), no epic scope; label form dispatches to resolveByLabel at :311-312`
- **[[c3]]** `code` `src/mcp/build-step/render.ts:53 resolveTaskRef — calls resolveWorkflowRef; maps ref===null to the 'could not resolve target' message (:58-61)`
- **[[c4]]** `code` `src/mcp/build-step/phases/implement.ts:57 + src/mcp/build-step/phases/validate.ts:65 — both return err('unresolved-target', resolved.message) when resolveTaskRef fails`
- **[[c5]]** `code` `src/workflow/tracker/resolve.ts:248 resolveByHier + :298-300 — the hierarchical-id path locates the epic by hash8+date regardless of epic count, hence the working workaround and the model for the scoped fix`
