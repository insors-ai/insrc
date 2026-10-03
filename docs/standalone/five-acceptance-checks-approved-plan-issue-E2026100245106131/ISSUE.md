<!-- insrc:artifact ISSUE-4510613183357b66 -->

# Close five acceptance checks that shipped unmet in the BUILD-provenance Story

## Reproduction

Read the approved PLAN for ISSUE-93081bff91ae5108 / S001 alongside the code it produced, grading each acceptance check against what actually shipped. Five do not hold.

1. The plan's t6 says verbatim: "UNLIKE t5 this task is NOT constrained to a synchronous implementation and should follow those sites' argv-array runShell idiom. t5 must be sync because gates.ts is; **do not copy t5's execFileSync approach here**." OBSERVED: the resolver imports `execFileSync` and calls it, and is declared synchronous. EXPECTED: the async argv-array `runShell` idiom used by the sites the plan cited.

2. t6 requires "a DIRTY tree yields exactly today's result and never consults the base — asserted via a recording seam". OBSERVED: both dirty-tree tests assert at RESULT level only. The one recording seam in the suite sits at the outer collector's boundary and cannot observe whether a range was requested inside the inner derivation. EXPECTED: a seam that records what git was actually asked for.

3. t6 requires "an unresolvable base LOGS and returns empty". OBSERVED: the returns-empty half is covered; nothing asserts the log call, even though a sibling task asserts its own warn explicitly, so the pattern was available and simply not applied.

4. t6 and t10 both state TEST C was INVERTED. OBSERVED: it was re-labelled — its assertion is unchanged from the original characterisation — and the audit test added later was written to accept the weaker marker, matching `/re-labelled at t6/` for C while requiring `/\(INVERTED at t8\)/` and `/\(INVERTED at t9\)/` of its siblings. EXPECTED: either a genuine inversion, or the claim of inversion withdrawn in both places.

5. t9 requires the inverted characterisation to still render '## Scope' AND '## Triage rationale'. OBSERVED: only the Scope half is asserted. The standalone context the integration harness passes supplies `sizeClass` and `focus` but no `triageRationale`, so the field is absent and the heading could never appear. EXPECTED: the field supplied and the heading asserted on that path.

Important context on scope: an independent review ran seven mutations against the production code and could NOT prove a single test vacuous. This item is about checks not satisfied as written — not a hollow suite.

One limitation recorded by the s2 audit: the plan names four `runShell` sites as the idiom to follow; only two of them were re-verified here and only those two are cited.

## Root cause

These are not one defect with one cause; they are five independent shortfalls that share a reason for going unnoticed, and the record should not pretend otherwise.

One is a production-code departure. The resolver was written with the synchronous `execFileSync` idiom that the immediately-preceding task legitimately required, in a file whose plan explicitly prohibited copying it and named the async alternative. The prohibition was specific and still did not survive contact with the adjacent task's habit — the author had just written the sync form and carried it forward.

Four are assertion gaps, and three of those share a shape: the check named HOW the property was to be proved (via a recording seam, by asserting the log call) and the implementation proved the property a weaker way that still passes. A result-level assertion that a dirty tree's output is unchanged is good evidence but not the specified evidence: it would still hold if a future change unioned the range for files the working tree also touched.

The fifth is the most instructive. The claim of inversion was written into two tasks' records and then into an audit test whose stated job is to stop exactly this — a characterisation being quietly weakened instead of flipped. The audit was authored by the same actor as the thing it audits and encoded the weaker marker as acceptable, so the guard agreed with the author by construction. That is the same failure mode as asserting a regression as desired behaviour: the test cannot fail, because it was written from the claim rather than from the requirement.

Why none of this failed the suite: every item is either a property no test asserts, or a claim asserted only in prose and commit messages. Nothing contradicts anything; the gaps are silent.

## Fix intent

Make the shipped code and tests satisfy the five checks as the approved plan worded them, or withdraw the claims that they were satisfied.

- Bring the range-base resolver onto the async argv-array shell idiom the plan mandated, accepting that its signature becomes asynchronous and that both writers consuming it change accordingly.
- Prove the dirty-tree independence at the seam level the check names, so the property is pinned by what git is asked rather than by what comes back.
- Assert the log on the unresolvable-base path, so a swallowed condition stays observably recorded.
- Resolve the TEST C question explicitly rather than inheriting it: either invert it so the inversion claim becomes true, or withdraw the claim in both tasks' records AND tighten the audit so it no longer accepts a weaker marker for one characterisation than it demands of the others. This record does not decide which.
- Supply the triage rationale on the integration path so the heading the check names is actually exercised.

Hard constraint: no existing assertion may be weakened or deleted to achieve any of this. The suite was mutation-proved across seven independent mutations with none vacuous, and that property must survive — each change should be confirmed by a mutation that turns the new assertion red.

Out of scope: the provenance behaviour itself, which works and is covered. This is about the specified evidence for it.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts:41` — "import { execFileSync } from 'node:child_process';"
- **[[c2]]** `code` `src/workflow/runners/build/range-base.ts:90` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"
- **[[c3]]** `code` `src/workflow/runners/build/range-base.ts:110` — "log.warn("
- **[[c4]]** `code` `src/daemon/tools/builtins/git/cherry-pick.ts:114` — "const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });"
- **[[c5]]** `code` `src/daemon/tools/builtins/git/merge.ts:144` — "const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });"
- **[[c6]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:670` — "test('CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no '## Changes' section', async () => {"
- **[[c7]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:811` — "['CHARACTERISATION C', /re-labelled at t6/],"
- **[[c8]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:809` — "['CHARACTERISATION A', /\(INVERTED at t8\)/],"
- **[[c9]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:597` — "const standalone = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'Add a --json flag to the status subcommand.' };"
- **[[c10]]** `prior-artifact` `docs/standalone/build-ledger-record-s-provenance-broken-E2026100293081bff/S001/PLAN.md — approved PLAN, task t6` — "t5 must be sync because gates.ts is; do not copy t5's execFileSync approach here"
- **[[c11]]** `prior-artifact` `docs/standalone/build-ledger-record-s-provenance-broken-E2026100293081bff/S001/PLAN.md — approved PLAN, task t6 acceptance checks` — "A DIRTY tree yields exactly today's result and never consults the base — asserted via a recording seam, proving independence from the commit/validate ordering"
- **[[c12]]** `prior-artifact` `docs/standalone/build-ledger-record-s-provenance-broken-E2026100293081bff/S001/PLAN.md — approved PLAN, task t9 acceptance checks` — "integration: INVERTED characterisation B: a standalone build runs implement then validate and the record still renders '## Scope' and '## Triage rationale'"
