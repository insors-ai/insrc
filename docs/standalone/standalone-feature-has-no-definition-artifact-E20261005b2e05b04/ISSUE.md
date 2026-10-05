<!-- insrc:artifact ISSUE-b2e05b043846451c -->

# Give a standalone feature a definition artifact so its plan can be built task by task

## Reproduction

Observed on 2026-10-05 with the standalone feature f2f08ccf89f8ab25 (structured design review template).

1. Brainstorm a feature and approve its SPEC (SPEC-1bb064e8e2a1edd1).
2. Run triage. It sizes the request as a feature and routes it to a standalone design.story, then plan, then build.
3. Run design.story with `standalone: true`. It mints its own epic hash (f2f08ccf89f8ab25) and writes LLD-f2f08ccf89f8ab25-S001. Approve it.
4. Run plan. It writes PLAN-f2f08ccf89f8ab25-S001 with seven tasks. Approve it.
5. Call insrc_build_step with phase `implement`, target `S001/t1` and epicHash `f2f08ccf89f8ab25`.

Expected: the build tool admits task t1 of the approved plan and returns its prompt, as it does for a Story under an Epic or for a bugfix.

Observed: `unresolved-target: could not resolve target 'S001/t1'`. The hierarchical id `E20261005f2f08ccf:S001:T001` fails the same way. The only route that works is the standalone build route, whose prompt says 'There is no separate plan; treat the LLD as the single unit of work', so the seven plan tasks, their order, their acceptance checks and their tests are not handed to the builder, and the BUILD record carries one task (`S001`) instead of seven.

Two further symptoms have the same cause:
- The LLD and the PLAN of the same Story were filed in different folders: `docs/standalone/structured-design-review-template-approved-spec-E20261005f2f08ccf/` and `docs/standalone/plan-build-structured-design-review-template-E20261005f2f08ccf/`. Each stage derived the folder name from its own focus text.
- Nothing links the feature to the SPEC it came from. The SPEC has a different hash (1bb064e8e2a1edd1) and no artifact under f2f08ccf89f8ab25 refers to it.

## Root cause

A standalone feature has no epic-level definition artifact, and several parts of the workflow assume one exists.

1. The task resolver only knows epics that have a definition. `listEpicHashes` in src/workflow/tracker/resolve.ts builds its list from files matching DEF-<hash>.json and ISSUE-<hash>.json and nothing else. `resolveByLabel` filters that list by the given epicHash and returns null when there is no match. `buildRef` reads the epic's slug and creation date through `readEpicIdentity`, which tries DEF-<hash>.json and then ISSUE-<hash>.json and returns null when neither exists. `resolveTaskRef` in src/mcp/build-step/render.ts turns that null into `unresolved-target`.

2. The two routes that work both write a definition first: the Epic route writes a DEF, and the bugfix route writes an ISSUE (an ISSUE is the epic-level definition for a fix). The standalone feature route goes straight from triage to design.story, so no artifact plays that role. A SPEC, when one exists, is filed under its own hash and is not read as a definition.

3. With no definition there is no single source for the work item's name, so each stage names its folder from its own focus text, and the documents of one Story are split across folders.

## Fix intent

Give every standalone feature an epic-level definition equivalent, as an Epic has a DEF and a fix has an ISSUE.

- A standalone feature has one definition artifact under its epic hash, written before or with its first design. It carries at least the feature's name and creation date, its single Story, and a link to the SPEC it came from when there is one.
- The task resolver, the hierarchical ids and the folder naming read that artifact the same way they read a DEF or an ISSUE, so `insrc_build_step` can admit the plan's tasks one at a time and every document of the Story lands in one folder.
- A standalone feature that already exists without a definition stays readable and buildable through the standalone route; what happens to its split folders is a decision for the design stage.

Whether the definition is a new artifact kind, a DEF with one Story, or the approved SPEC itself promoted to that role is a design decision for the next stage.

## Citations

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts` — "function listEpicHashes(dir: string): readonly string[] {"
- **[[c2]]** `code` `src/workflow/tracker/resolve.ts` — "for (const name of [`DEF-${epicHash}.json`, `ISSUE-${epicHash}.json`]) {"
- **[[c3]]** `code` `src/mcp/build-step/render.ts` — "`insrc_build_step: could not resolve target '${target}'. Pass a task issue ` +"
- **[[c4]]** `prior-artifact` `PLAN-f2f08ccf89f8ab25-S001`
- **[[c5]]** `stakeholder` `user, 2026-10-05` — "a standalone should also have a DEF/ISSUE equvalent. We will fix this later"
