<!-- insrc:artifact ISSUE-67124d9a509d2bfd -->

# Write project file references relative to the project root and external ones in full

## Reproduction

Open LLD-1cd9a4c34f403a80-s1 (its call sites, in the Data model section) in the review pane, where file references are clickable. It lists the call site 'src/workflow/artifacts/plan.ts (new artifact module defining PlanTask, mirroring artifacts/lld.ts)'. Clicking it does nothing: the whole item, prose included, is drawn as one code span, so the reference is not a path, and the shortened 'artifacts/lld.ts' and 'artifacts/plan.ts' in the same record are not paths from the project root either. Expected: every file inside the project is written relative to the project root (src/workflow/artifacts/plan.ts, optionally with :line), on its own and without prose in the same span, and every file outside the project is written with its full path, so each one opens.

## Root cause

Nothing tells the authoring stages how to write a file reference, and nothing checks it. The schemas for the path-valued fields are bare string arrays: dataModel[].callSites in the design.story schema (src/workflow/runners/design-story/schemas.ts:260) and pathsCited in the analyze-bundle schemas of define, design.epic, design.story and plan carry no description or pattern. The step prompts only say callSites come from the analyze bundles (src/workflow/runners/design-story/index.ts:295); they say nothing about the form of a path. The model therefore writes shortened paths and adds explanations to the same string. The renderer then turns each callSites entry into a single code span (src/workflow/artifacts/lld.ts:388), so an entry with prose becomes one span that is not a path. The chat plugin's clickable references resolve only from the workspace root and refuse anything else (vscode-plugin/src/chat/link-opener.ts), which is why such references silently do nothing.

## Fix intent

Make the authoring stages write references in one form and say so where they write them: a file inside the project is written relative to the project root (optionally with :line), never shortened and never with prose in the same code span; a file outside the project is written with its full path. Put the rule in the step prompts that author path-valued fields and describe it in the schemas of those fields, defined once and shared like the existing scope rule. Consider a write-time check that flags an entry that is not a root-relative path (or an absolute external one), or that does not resolve from the root, so a bad reference is caught when the artifact is written and not when someone clicks it. The existing records are not rewritten.

## Citations

- **[[c1]]** `code` `src/workflow/runners/design-story/schemas.ts:260` — "callSites:  { type: 'array', items: { type: 'string' } },"
- **[[c2]]** `code` `src/workflow/runners/design-story/index.ts:295` — "'- `dataModel[].callSites` come from s1 analyze bundles.',"
- **[[c3]]** `code` `src/workflow/artifacts/lld.ts:388` — "if (d.callSites.length > 0) { l.push('**Call sites:**'); for (const cs of d.callSites) l.push(`- \`${cs}\``); }"
- **[[c4]]** `code` `src/workflow/runners/design-story/schemas.ts:32` — "pathsCited: { type: 'array', items: { type: 'string', minLength: 1 } },"
- **[[c5]]** `code` `vscode-plugin/src/chat/link-opener.ts`
- **[[c6]]** `prior-artifact` `.insrc/artifacts/LLD-1cd9a4c34f403a80-s1.json` — "src/workflow/artifacts/plan.ts (new artifact module defining PlanTask, mirroring artifacts/lld.ts)"
