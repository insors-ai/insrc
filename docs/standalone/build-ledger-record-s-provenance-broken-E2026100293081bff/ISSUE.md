<!-- insrc:artifact ISSUE-93081bff91ae5108 -->

# BUILD records ship with no change set, summary or commit — and sometimes with a wrong change set

## Reproduction

Complete any plan-driven Story by following the build step's own instructions, then read the BUILD.md it produced.

Steps:
1. Run `insrc_build_step` with `phase: 'implement'` for a task. The returned prompt instructs: "4. If green, **commit** referencing the Task ... then submit this Task to the build validation gate."
2. Follow it — commit the task's work.
3. Run `insrc_build_step` with `phase: 'validate'` for the same task.
4. Repeat for every task, then open `docs/epics/<slug>/S<nnn>/BUILD.md`.

OBSERVED: the record lists only the validated task ids. There is no `## Changes` section, no `## Summary`, and no `**Commit:**` line. For Story s4 of Epic bfe98ff7 the whole BUILD.md was eight lines, for a Story that changed 24 files across 8 commits.

EXPECTED: a ledger entry that says what changed, summarises it, and names the commit.

The root cause reproduces directly, without the workflow. Calling `collectBuildChangeLog(repo, {author, timestamp})`:
  - with a CLEAN working tree  -> 0 entries
  - after dirtying ONE tracked file -> 1 entry, naming that file
That is the whole mechanism: the collector sees the working tree, and by validate time the work is already committed.

A SECOND, WORSE SYMPTOM. The change set is not merely absent — it can be wrong. Each validate call writes the BUILD record's own json and md. If a later validate runs while those writes are still uncommitted, they are the only dirty paths, so the collector captures them and the record claims the Story changed `BUILD-<hash>-<story>.json` and `BUILD.md`. This was observed on Story s4: after running validate for the remaining tasks, the `## Changes` section listed exactly those two files and nothing else. An empty section reads as "nothing recorded"; a wrong one reads as fact.

## Root cause

Three producer-side defects sharing one root: nothing writes the provenance the renderer is ready to show.

1. THE CHANGE SET IS DERIVED FROM THE WRONG PLACE. `changedFiles` collects paths from the working-tree diff — unstaged union staged — via the `git_diff` builtin, and `collectBuildChangeLog` maps those paths into the change log. But the build step's own implement prompt mandates commit-BEFORE-validate, so the tree is clean at exactly the moment the collector runs. `validate.ts` then drops the key entirely rather than persisting an empty array, so the section never renders. The same working-tree dependency defeats `ensureBuildRecordOnCompletion`, which would otherwise be a second chance at approval time — by then the tree is cleaner still.

Note what is NOT broken: the collector, the omit-slot guard and the renderer all behave exactly as designed. `changeLogBodyLines` correctly returns no lines for an absent or empty log. The defect is that the collector is asked a question about the working tree when the answer it needs is about the commits.

2. `body.summary` AND `body.commit` HAVE NO PRODUCER AT ALL. Both are declared on the record type and both are rendered — the renderer pushes a `## Summary` heading for a non-empty trimmed summary and a `**Commit:**` line for a defined commit. There are exactly three places a BuildRecord body is written in the whole source tree (`validate.ts`, `implement.ts`, `completion-record.ts`), and none of them sets either field. They are dead renderer branches: declared, rendered, never written.

3. THE PROVENANCE SECTIONS ARE PLAN-PATH-ONLY. `renderStandaloneBuildRecordMd` reads none of `changeLog`, `feedback` or `summary`, and the `StandaloneBuildRecord` body type does not declare them. So a build routed `trivial` — which triage does routinely for bugfixes — cannot show a change set even once (1) and (2) are fixed, because the fields cannot reach that renderer.

A RELATED HAZARD, NOT YET CONFIRMED REACHABLE. The renderer is chosen on `meta.standalone`, `validate.ts` writes `standalone: false` unconditionally, and `mergeWithPrior` spreads `{...rec.meta}` so the newer write wins that flag. If a trivial build can run implement (which writes `standalone: true`) and then validate, the merged record would flip renderers and silently lose its `## Scope` and `## Triage rationale` sections. Whether that sequence is reachable needs checking before anything on that boundary is changed.

## Fix intent

Make a completed Story's BUILD record carry an accurate account of what the Story changed, so the ledger entry is worth reading.

1. The change set must be derived from something that survives the mandated commit-before-validate ordering, so it reflects the Story's actual work rather than whatever happened to be uncommitted. It must also never capture the record's own writes — a change set naming `BUILD.md` is worse than none.

2. The narrative summary and the commit reference must actually be written by something. Both already render; both need an author.

3. A trivial/standalone build must be able to carry the same provenance a plan-driven one does, so the route a bugfix usually takes is not the route with the thinnest ledger entry.

4. The standalone/plan-driven renderer split must be confirmed safe under upsert, or made so.

DELIBERATELY NOT DECIDED HERE — these belong to the design stage:
  - WHICH range the change set comes from when the tree is clean. The Story's approved-PLAN commit, `HEAD^`, and a caller-supplied base all differ materially: `HEAD^` captures one task, the PLAN range captures the Story. A by-hand repair of s4's record used the PLAN range, but that is a choice to ratify, not a precedent.
  - WHO authors the summary. The only party that knows what changed and why is the implementer, and it sits on the far side of the MCP boundary — so this may be a change to the build-step contract rather than to a writer.
  - WHETHER to fix the collector or the prompt. Changing the prompt to validate-before-commit would also close (1), but it makes correctness depend on an instruction being followed; deriving from committed history survives either ordering. The design stage should weigh these rather than inherit the first one.
  - WHETHER the standalone body widens to carry the provenance fields, or the two renderers converge into one.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/changed-files.ts:41-55` — "/** Derive the changed-file set from the working-tree diff (unstaged ∪ staged) via the `git_diff` builtin. Read-only; throws `NoBuildChangesError` on git failure. */ export async function changedFiles"
- **[[c2]]** `code` `src/mcp/build-step/phases/validate.ts:161-164` — "const changeLog = await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now }); persistBuildRecord(repoPath, { ... body: { tasks: [{ id: taskId, passed }], ...(changeLog.length > 0"
- **[[c3]]** `code` `src/prompts/build/implement-task.md:26` — "4. If green, **commit** referencing the Task and its issue: — the implement prompt's Process step 4, and the ordering that guarantees a clean working tree by the time the validate phase collects the c"
- **[[c4]]** `code` `src/workflow/runners/build/standalone-record.ts:139-149` — "if (rec.body.commit !== undefined) { lines.push('', `**Commit:** ${rec.body.commit}`); } ... const summary = rec.body.summary?.trim() ?? ''; if (summary.length > 0) { lines.push('', '## Summary', '', "
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:114-130` — "renderStandaloneBuildRecordMd returns only the title, size-class/created line, `## Scope` and an optional `## Triage rationale` — it reads none of changeLog, feedback or summary."
- **[[c6]]** `code` `src/workflow/runners/build/standalone-record.ts:186-203` — "const merged = mergeWithPrior(jsonPath, rec); ... const md = merged.meta.standalone ? renderStandaloneBuildRecordMd(...) : renderPlanBuildRecordMd(merged);"
- **[[c7]]** `code` `src/workflow/runners/build/standalone-record.ts:246-266` — "function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord { ... const meta: BuildRecord['meta'] = { ...rec.meta, createdAt: prior.meta.createdAt, ... }"
- **[[c8]]** `code` `src/workflow/runners/build/completion-record.ts:38-45` — "const changeLog = listChanged !== undefined ? await collectBuildChangeLog(...) : await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now }); const rec: BuildRecord = { ... body: "
- **[[c9]]** `code` `src/workflow/artifacts/format/bindings.ts:91-93` — "export function changeLogBodyLines(changeLog: ChangeLog | undefined): string[] { if (changeLog === undefined || changeLog.length === 0) return []; — the renderer correctly shows nothing for an absent "
- **[[c10]]** `code` `src/mcp/build-step/phases/implement.ts:133-140` — "persistStandaloneBuildRecord(repoPath, { meta: { workflow: 'build', standalone: true, sizeClass, ... }, body: { focus: specFocus, producesLld: false } }); — the third and last BuildRecord body writer;"
- **[[c11]]** `prior-artifact` `BUILD-bfe98ff7f97178cf-s4 (Epic bfe98ff7, Story s4)` — "The record this defect was found on: eight lines, no Changes/Summary/Commit, for a Story spanning 24 files; after re-running validate it gained a `## Changes` section listing only its own json and md."
