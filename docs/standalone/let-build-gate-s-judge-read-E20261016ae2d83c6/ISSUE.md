<!-- insrc:artifact ISSUE-ae2d83c6ab06c595 -->

# Let the build gate's judge read with read-only commands and see a trivial build's scope

## Reproduction

Route the build tier to the codex CLI, then run insrc_build_step validate on any build. Observed on 2026-10-16 on the gate of ISSUE-e48e33ae6af03720 S001: the daemon's typecheck and both mapped tests passed, but the codex judge returned passed: false with every repository check unsatisfied, saying "Repository contents could not be inspected through the available non-command file-reading tools" and "The Story contract and changed-file list were not supplied". Expected: the judge reads the changed files, judges them against the build's contract or stated scope, and passes a build whose change and tests are real.

## Root cause

Both judge prompts tell the judge "You can read the repository (read, search, list files). You cannot run commands": the standalone prompt (src/daemon/steps/build-step/render.ts:261) and the per-task template (src/prompts/build/validate-task.md:9). That wording fits claude, whose reviewer session has read, search and list tools. A codex reviewer session has no such tools; it reads files by running commands inside a read-only sandbox (src/agent/providers/cli-provider.ts:124-126), so a codex judge that follows the prompt reads nothing. Separately, for a trivial standalone build, which has no LLD, the prompt asks the judge to judge the change against "its stated scope" (src/daemon/steps/build-step/render.ts:275), but the spec the prompt is rendered from (src/daemon/steps/build-step/render.ts:238-245) has no scope field, and the standalone validate call passes only the story id, size class, LLD path and evidence (src/daemon/steps/build-step/phases/validate.ts:350). The build's stated scope, the standalone focus, never reaches the judge.

## Fix intent

The judge prompts allow reading the repository with read-only commands as well as with read tools, while still telling the judge not to run the typecheck or the tests and not to change anything, so a codex judge can read. A trivial standalone build's validate prompt carries the build's stated scope. The existing prompt test that pins the old wording is updated, and tests show both prompts permit read-only commands and that the trivial prompt includes the scope.

## Citations

- **[[c1]]** `code` `src/daemon/steps/build-step/render.ts:261` — "'You can read the repository (read, search, list files). You cannot run commands, ' +"
- **[[c2]]** `code` `src/prompts/build/validate-task.md:9` — "You can read the repository (read, search, list files). You cannot run commands,"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:124-126` — "return ['exec', '--output-schema', schemaPath, '--json', '--sandbox', 'read-only', '-C', cwd, ...modelArgs];"
- **[[c4]]** `code` `src/daemon/steps/build-step/render.ts:238-245` — "export interface StandaloneValidateSpec {"
- **[[c5]]** `code` `src/daemon/steps/build-step/phases/validate.ts:350` — "const prompt = (evidence: string): string => renderStandaloneValidatePrompt({ storyId, sizeClass, lldMdRel: lldMdRelPath, evidence });"
- **[[c6]]** `code` `src/daemon/steps/build-step/render.ts:275` — "'2. **Contract** — judge the change against the LLD\'s contract (or, for a trivial build, its stated scope).',"
