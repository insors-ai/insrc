<!-- insrc:artifact EXT-b9d5c5c40df5a574-s8 -->

# Extend: make-insrc-analysis-complete-used-right — The code tasks of a broad analysis work on a repository whose graph has no modules for its directories

> **Extends Epic `make-insrc-analysis-complete-used-right`** — this builds on existing docs + code; no new Epic was created.

**Scope:** M   ·   **New Story:** `s8`

Extends the Epic `make-insrc-analysis-complete-used-right` (DEF-b9d5c5c40df5a574, HLD-b9d5c5c40df5a574): a new Story for what the code plan tasks treat as a module, found by the first broad run of Story s7 on 2026-10-08 and split out by the stakeholder that day. It builds on the code tasks in src/analyze/runtimes/code/ and on Story s7's design (LLD-b9d5c5c40df5a574-s7).

## Added Story

### s8: The code tasks of a broad analysis work on a repository whose graph has no modules for its directories

**User value:** As someone asking for a broad analysis of a codebase, I get its modules and what each one offers, in any language the index covers, so the report is about my code and not a list of tasks that could not run.

**Acceptance criteria:**
- **ac1:** Given a repository whose stored graph holds no entity of kind 'module' for its own directories, as for a TypeScript repository today, when a broad code analysis lists the repository's modules and its module tree, then the directories that hold source are returned as its modules, and the result says what it rests on.
- **ac2:** Given a plan in which the planner names a directory of the repository as the module to describe, when the task that describes a module's functional surface runs, then it returns what that directory offers, and does not fail for want of a stored module entity.
- **ac3:** Given a repository whose graph does hold module entities, as for a language whose parser emits them, when the same tasks run, then they return at least what they return today.
- **ac4:** Given a module value that names nothing in the repository, when a task is given it, then the task fails with a reason that says so, and is not reported as an empty module.
- **ac5:** Given a broad code analysis of an indexed repository, once this Story and Story s7 are built, when it is run, then it returns a final report in which the functional-surface tasks succeeded.

## Building on

- `prior-artifact` LLD-b9d5c5c40df5a574-s7 — What the two module tasks and the functional-surface task of the code family treat as a module is not changed here; that is the subject of a separate Story
- `code` src/analyze/runtimes/code/surface-functional.ts — module entity '${moduleId}' not found in the graph
- `code` src/analyze/runtimes/code/discovery-modules.ts — if (e.kind !== 'module') continue;
- `stakeholder` 2026-10-08: split the first broad run's findings in three; record the new Story upstream now — go with A. Record both upstream now.

## Next

Proposed HLD amendment `AMD-b9d5c5c40df5a574-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b9d5c5c40df5a574-1`) and the updated Epic, then run `design.story` for the new Story `s8` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b9d5c5c40df5a574","storyId":"s8"}
```
