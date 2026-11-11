<!-- insrc:artifact ISSUE-66d4d41d99f805af -->

# Code review refuses a correction packet because projection reads every interleaved commit

## Reproduction

1. Build a Story whose commits are spread over a branch that also receives other work (for example, merges of the upstream branch between the Story's commits and its latest fix).
2. Run three code review rounds, then commit one more fix and start a new attempt whose packet lists the Story's commits and pins the new commit as reviewRevision.
3. Observed: start is refused with `review-request-failed` / `projection_limit: Projection decoded byte limit`, and no attempt is recorded. Seen on Story eedc4519199b24b4/s1: the same packet admitted at pin 5f422dfa1 (63 commits after the Story's first commit) failed at pin 92491bba9 (191 commits, after three upstream merges) although only one commit was added. A local replay of the packet against the real repository read src/workflow/gates.ts 119 times, src/workflow/storage.ts 118 times and similar for other files, 62.8 MiB in total, before the 64 MiB cap stopped it.
4. Expected: the review is admitted. Its scope is what the packet selects; commits between a selected change and the pin matter only where they change the selected code, and that is cheap to establish whatever the number of unrelated commits.

## Root cause

Packet preparation projects every selected change to the pinned revision (src/workflow/code-review/task-review/packet.ts:208 calls projectReviewScope at src/workflow/code-review/task-review/projection.ts:106). For each selected file, finalPath (src/workflow/code-review/task-review/projection.ts:65) ends in pathContinuity (src/workflow/code-review/task-review/projection.ts:51), which walks every commit reachable from the pin back to the selected commit, merge parents included, and at each one reads the full file contents at the commit and at its parent only to learn whether the file exists. Each read is charged to the ProjectionBudget (src/workflow/code-review/task-review/projection.ts:21), whose decoded-byte cap is 64 MiB (src/workflow/code-review/task-review/projection.ts:9). The cost is therefore files selected x commits between selection and pin x file size, so it grows with unrelated work landing on the branch rather than with the review. The cache is keyed by commit and path, so a file unchanged across those commits is still read once per commit. Start also re-prepares every saved attempt (src/workflow/code-review/task-review/admission.ts:47), so each earlier attempt pays the same cost again.

The walk and the limits came from ISSUE-599f1d0bd42e0c37 (Story s1, Task t3; commits f863d63fb, 1c50bcfb5 and 4336568d8). Its design deliberately caps projection at 10000 reads, 100000 fragments and 64 MiB of decoded bytes, reported as field projection_limit, and uses the walk to prove that each selected change survives to the pin, including a file deleted, recreated or renamed by a later commit. Those intentions are sound; the defect is the way the walk is carried out.

## Fix intent

Make the review scope follow the submitted packet. Admission establishes where each selected change sits at the pinned revision from the selected commits and the pin, and treats commits between them as relevant only where they change the selected path, without reading file contents at every intermediate commit and without a cost that grows with unrelated commits. Code brought in by a merge is not review scope, as ISSUE-f9ced66a0e8835b8 already established for the earlier review grounding. Review chunks are built from the packet, and each chunk decides which later changes affect its code.

Constraints from related work:
- ISSUE-599f1d0bd42e0c37: its projection limits (10000 reads, 100000 fragments, 64 MiB decoded bytes), the projection_limit error and the continuity outcomes stay unchanged. A selected file that disappears or is recreated by an unselected commit, and a selected rename, keep their current results. No limit is raised.
- ISSUE-e4af63128c7cbec2 (review worker isolation, in progress): it rules projection-budget increases and optimisation out of its own scope and names this 64 MiB failure as needing a separate correction. It moves projection onto the review worker and is changing src/workflow/code-review/task-review/admission.ts. This fix stays in the projection code and its Git source reads and does not edit admission.ts, so the two do not conflict; saved attempts re-prepared at admission benefit without changes there.

Saved attempts keep preparing to the same final-scope identity, so the stored review history stays readable. A packet like Story eedc4519/s1's correction attempt is admitted.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/projection.ts:51-64` — "for (const parent of await sources.commit(commit)) { ... const before = await sources.file(parent, path), after = await sources.file(commit, path);"
- **[[c2]]** `code` `src/workflow/code-review/task-review/projection.ts:9` — "const LIMITS = { reads: 10000, fragments: 100000, bytes: 64 * 1024 * 1024, snapshot: 0 };"
- **[[c3]]** `code` `src/workflow/code-review/task-review/projection.ts:21` — "decode(bytes: number): void { this.bytes += bytes; requireReview(this.bytes <= this.limits.bytes, 'projection_limit', 'Projection decoded byte limit'); }"
- **[[c4]]** `code` `src/workflow/code-review/task-review/projection.ts:65-90`
- **[[c5]]** `code` `src/workflow/code-review/task-review/packet.ts:208` — "const projection = packet.reviewRevision ? await projectReviewScope(changes, packet.reviewRevision, sources, budget) : undefined;"
- **[[c6]]** `code` `src/workflow/code-review/task-review/admission.ts:47` — "const prepared = await prepareReviewPacket(entry.submitted, sources, true, undefined, entry.header.derived);"
- **[[c7]]** `stakeholder` `User direction 2026-11-11` — "the interleaved commits are not relevant unless they have some changes that impact the current batch. so based on the submitted packet the review chunks should be created, each chunk can decide what i"
- **[[c8]]** `prior-artifact` `LLD-599f1d0bd42e0c37-s1` — "New internal projection counters are capped at 10000 distinct object/diff reads, 100000 projected fragments and 64 MiB cumulative decoded source bytes, and emit field=projection_limit before attributi"
- **[[c9]]** `prior-artifact` `LLD-e4af63128c7cbec2-s1` — "No token-accounting code, review judgment algorithm changes, timeout expansion, projection budget increases/optimization, or automatic restarting of another session's reviews. The current TU1 S1 64MiB"
- **[[c10]]** `prior-artifact` `LLD-f9ced66a0e8835b8-s1` — "Merged-in files and merged-in lines never reach the reviewer, so the bounded diff is spent only on the Story's work."
- **[[c11]]** `stakeholder` `User direction 2026-11-11 (amendment)` — "yes, make the changes"
