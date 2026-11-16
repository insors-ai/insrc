<!-- insrc:artifact ISSUE-163e7bc3d6f0ccba -->

# Isolate code reviews with commit-parent baseline workspaces

## Reproduction

Submit a retained code-review workload covering 171 selected files across four attempts through the production preparation path. Preparation performs thousands of source queries, stages roughly 25.5 MiB, charges about 63.6 MiB of a 64 MiB budget, and then fails while acquiring another source body before any reviewer/provider call. Expected: the packet's exact selected changes remain the sole review scope, and only their pinned pre-change baselines are materialized without aggregate semantic hydration.

## Root cause

The production daemon enters review preparation through `src/daemon/threads/review-worker-preparation.ts`, whose sole preparation component is `src/workflow/review/code-preparation.ts`. That component depends directly on source-session, prepared-context, memory, views, packet, admission and checkpoint contracts, but the staged packet/source helpers are not integrated into this production path. The current eager path therefore acquires and retains decoded source bodies and broad prepared context under one aggregate memory budget instead of representing selected changes as immutable locators over local Git objects. This both exhausts memory before reviewer invocation and allows preparation breadth to exceed the submitted after-block change set.

## Fix intent

Make the submitted packet the exclusive scope contract. Require each selected change to be pinned to a mandatory local commit and final review revision; derive its pre-change file from the explicitly applicable parent in the local Git graph, including stacked and unpushed commits; materialize only relevant parent blobs into an immutable per-attempt temporary baseline workspace; and retain exact after ranges or blocks plus new-file, deletion, rename and merge-parent metadata and blob digests. Give the reviewer artifact/task paths, the packet, baseline workspace and complete test evidence, while rejecting uncommitted, unpinned or rewritten inputs. Remove eager source-body/semantic hydration and aggregate review-size dependence from production preparation without changing reviewer decisions, checkpoint history, recovery or publication behavior.

## Citations

- **[[c1]]** `analyze-bundle` `Deterministic code analysis of src/workflow/review/code-preparation.ts found one production importer, 11 direct dependencies, and test-heavy contract coverage; the subsequent in-session free-form probe was incomplete because its read-only registry was unavailable.`
- **[[c2]]** `code` `src/workflow/review/code-preparation.ts`
- **[[c3]]** `code` `src/daemon/threads/review-worker-preparation.ts`
- **[[c4]]** `code` `src/workflow/review/source-session.ts`
- **[[c5]]** `code` `src/workflow/review/staged-packet-construction.ts`
- **[[c6]]** `code` `src/workflow/review/staged-packet-sources.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c8]]** `code` `src/workflow/code-review/task-review/admission.ts`
- **[[c9]]** `code` `src/workflow/code-review/task-review/publication.ts`
- **[[c10]]** `stakeholder` `User requirement: review scope is the submitted change set; commits are provenance pointers, and baselines come from applicable local commit parents rather than remote origin.`
