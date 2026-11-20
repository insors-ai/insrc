# Batch 01 build evidence

## t1 — baseline

Approved issue: ISSUE-3275fb2e9a542cd6. Approved LLD and PLAN: s1.

Merged origin/v2 separately with `git merge --no-ff`, producing
`97ec6496f0594b8e512186e3829be1b7d99944a1`. The four upstream commits change
build test mapping and an unrelated workflow plan; they do not change the
approved harness ownership design. Local audit, issue and companion files were
preserved. No conflicting source edits were present.

Immediately before the merge, process inspection found no existing tsx/Node
test, tsc or npm test/build process (only the inspection command itself).
The source-tree probe filename search found no `__sc4probe_` file. No process
was stopped and no unknown file was removed; the installed daemon was untouched.

The validation gate requested captured evidence instead of the narrative alone.
The repeated inspection is captured with timestamp, exact commands, filters and
results in [baseline capture](test-harness-baseline-2026-11-20.json). It found
zero matching test/compiler processes, zero source-adjacent probes and no active
harness lease. It does not reconstruct past process state; it establishes a new
quiescent checkpoint before any shared-output implementation. The only t1
actions were the merge and adding these evidence files.

No full sweep was started: the approved PLAN requires ownership controls before
focused validation and forbids overlapping broad sweeps. This task's smoke
evidence is the baseline/overlap/quiescence inspection above.
