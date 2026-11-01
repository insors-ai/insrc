# Outcome: file-modifying daemon calls must name their repository (ISSUE-64703b708590bd68, Story s1)

Built 2026-11-02 on `v2`. The daemon now refuses a call that modifies files in a user repository unless it names an absolute, registered repo; it
never falls back to its own `INSRC_REPO`, the session workspace or its working directory. The design is `LLD-64703b708590bd68-s1`, the audit of
which calls modify files is `docs/plans/repo-call-audit.md`, and the user-facing description is the section "Calls that modify files name their
repository" in `docs/daemon.md`.

## Full sweep (2026-11-02)

Run once after t7, in foreground chunks: every `*.test.ts` under `src` and `scripts` (1141 files), four files at a time, one `npx tsx --test-force-exit`
per file with TAP output. Compared by test name with the tree before the fix (commit `e87df83c2`, the plan approval, in a separate worktree) for every
file that had a failing, skipped or unloadable test.

- 7518 test results: 7209 pass, 170 fail, 133 skipped, 5 unloadable files, 1 timeout.
- 167 of the failing results fail in the tree before the fix too (the "PENDING REVIEW RE-IMPLEMENTATION" tests, the mcp review and schema tests, `pipeline-outcome`,
  `typecheck-config`, `team-settle`, `signoff-e2e`, `team-gate-callers`, `gate-guarded-entry-points`, the handler-runtime key-set test and the others listed in the
  s9 sweep of `docs/plans/tool-registry.md`). The fix changes none of them.
- Nine results failed only in the new tree under four-at-a-time load: the three shutdown test files (`shutdown-bounded`, `shutdown-lifecycle-evidence`,
  `shutdown-store-failure`) pass when run alone, and `indexing-port` "daemon.status queue fields reflect the code-indexing worker's real lanes" fails alone in the tree
  before the fix too (a 20-second timeout).
- No new skipped test.

## Deviations from the LLD and the plan, and why

- **A sixth refusal code, `repo-mismatch`**, for a later phase of a workflow run whose `repo` differs from the repo its state token recorded. The LLD named five codes;
  the redirect case needed its own.
- **`artifact.feedback.append` takes a `repo`.** It had none: it resolved its path against the daemon's working directory and walked up to find the repository (the same defect
  as the approval). It now stores into the repo the call names. No caller in this repository sends it; external clients (an editor plugin) must send `repo`.
- **`gateRepoCall` refuses a call with no usable repo before reading the registry**, so a missing repo is reported as such even when the registry cannot be read.
- **The step forwarder (MCP) makes the session repo explicit** for the workflow and build step tools only (`withExplicitRepo`); the analyze and triage tools keep the
  daemon-side session resolution because they write nothing in a repository.
- **`mcp-process-e2e`**: the repo is registered with the daemon (the gate requires it), and the byte comparison of the analyze prompt leaves out the size letter, which the analyzer
  derives from the registry entry (the daemon's is registered and indexing; the in-process store has none).
- **The analyzer's call closure was not run for every handler** (t1): the read-only and daemon-store groups were classified by reading each registration and the module it
  delegates to. A wrong classification surfaces as a handler found writing under a repository; the table test keeps the lists complete.
- **`workflow.review` and `codeReview.run`** are in the table although their engines are removed, so a restored engine is covered.

## Scope decision

The rule covers writes under a user repository. Methods that write the daemon's own stores under `~/.insrc` (`config.*`, `keys.*`, `session.*`, `conversation.*`, `todos.*`, `db.*`,
`docSummary.*`, `agent.*`) and those that change the registry or the index queue (`repo.add`, `repo.remove`, `repo.reindex`, `index.file`) are outside it.

## Installed daemon

The daemon installed at `~/.insrc/daemon` is a separate checkout. It holds no uncommitted artifact files (checked 2026-11-02). It runs the old code until it is updated from this
branch and restarted: the gate takes effect only then.

## Open items

- Update and restart the installed daemon; until then the 2026-11-01 misrouting is still possible through a call that names no repo.
- External clients of the now-gated methods (the editor plugins; any script that relied on the daemon's `INSRC_REPO`) must send `repo`.
- `insrc_present`, `insrc_docgen` and the analyze and triage tool descriptions still say `repo` falls back to the session workspace or `INSRC_REPO`; they are read-only and unchanged.
- No test run of the whole IDE flow was possible here; the daemon, MCP and terminal-client sides are covered by the tests named in the plan.
