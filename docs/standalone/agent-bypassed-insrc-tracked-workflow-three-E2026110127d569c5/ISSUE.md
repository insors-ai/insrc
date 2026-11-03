<!-- insrc:artifact ISSUE-27d569c508f1232c -->

# Agent bypassed the insrc tracked workflow for three direct-built issue fixes; process records missing

## Reproduction

Ask the agent to fix recorded issues (ISSUE-16b8d3d50f14fc1d, ISSUE-7fa297efd4bd1c59, ISSUE-6dbf14435972af7a). Observed 2026-10-31: commits c7aa317bd, 453667947, 9da5a38b2 landed on main with fixes and tests, but the prescribed chain never ran — the two pending ISSUE records were not approved, no BUILD/CR records exist for any of the three, and no BUILD was approved. Expected: triage -> tracked issue -> issue approval -> build gate -> code review by the other party -> BUILD approval, per the repo AGENTS.md insrc:steering block ('never patched off-ledger').

## Root cause

The repo AGENTS.md (with its insrc:steering block) is loaded into the agent's context, but nothing forces applying it: the terse user instruction was treated as authorization to commit directly, substituting agent judgment for the prescribed process. No user-level steering directs the agent to a project's insrc:steering block, and no pre-commit adherence check exists for workflow-tracked work.

## Fix intent

(1) Back-fill: approve ISSUE-16b8d3d50f14fc1d and ISSUE-7fa297efd4bd1c59; run the build gate on each fix's commits so BUILD records are written and validated; run insrc_code_review_step over each change set; approve each BUILD record. (2) Create ~/.vibe/AGENTS.md with steering: when the current project's AGENTS.md contains an insrc:steering block, that block's prescribed process governs and overrides the agent's judgment about whether to run it. Verify the three fixes' ledger records exist and are approved.

## Citations

- **[[c1]]** `code` `insrc/AGENTS.md` — "a defect gets tracked exactly like a feature, never patched off-ledger"
- **[[c2]]** `step-output` `git log: c7aa317bd, 453667947, 9da5a38b2 on main`
- **[[c3]]** `step-output` `workflow.pending: ISSUE-16b8d3d50f14fc1d, ISSUE-7fa297efd4bd1c59 pending; no BUILD records for the three hashes`
