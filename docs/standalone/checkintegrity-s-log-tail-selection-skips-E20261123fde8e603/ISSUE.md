<!-- insrc:artifact ISSUE-fde8e603a1fedc1d -->

# checkIntegrity's log-tail selection skips revision-less entries, falsely reporting a stale-content hash-mismatch

## Reproduction

1) Approve a Task or PLAN record (insrc_workflow_approve), so its lifecycle.revision carries a contentHash. 2) Drive it through one or more insrc_build_step validate rounds that record 'update' log entries with only outcome/summary (no revision field) -- as every build-round retry does. 3) Correct the artifact's own body text directly (e.g. to match a later LLD revision) and recompute its lifecycle.revision.contentHash to match the new body, so the artifact is internally self-consistent (contentHash(description, {body, citations}) matches the stored hash). 4) Call insrc_workflow_approve on the Story's BUILD record. Observed: the story-completion follow-on returns ok:false with note "<artifact-id> is in conflict (hash-mismatch); a person has to resolve it before this can proceed", even though the artifact's own head is self-consistent. Expected: the completion follow-on succeeds once the artifact's head is internally self-consistent with its own current content.

## Root cause

insrc_workflow_approve's story-completion follow-on calls LifecycleService.completeIfRolledUp (src/workflow/artifact-core/lifecycle-service.ts:186), which calls rollUp (src/workflow/artifact-core/lifecycle.ts:378) -> storyTaskHolds -> reader.statusOf -> LifecycleService's statusOf closure (src/workflow/artifact-core/lifecycle-service.ts:81), which calls store.read(id); the store's read path runs checkIntegrity (src/workflow/artifact-core/lifecycle.ts:134) against the artifact's head and its change log. checkIntegrity's log-tail lookup (src/workflow/artifact-core/lifecycle.ts:137: `const logTail = ... .reverse().find(e => e.revision !== undefined)`) selects the LAST log entry that carries a `revision` field, then compares its contentHash against the head's current contentHash (src/workflow/artifact-core/lifecycle.ts:142). Every build-round 'update' log entry the build gate writes on each insrc_build_step validate call carries only `outcome` (result/summary), never a `revision` field (confirmed against the actual log entries for TASK-0765b3a578e43eec-s1-t3 in TASKS-0765b3a578e43eec-s1.log.jsonl: six consecutive 'update' entries with no revision, bracketed by only two revision-bearing entries -- the original 'create' and 'approve'). So for a Task with any build-round retries, the log-tail lookup always resolves to the ORIGINAL approve-time revision, not the artifact's current state -- meaning any later content-only correction to the artifact's body (which updates the head's own contentHash to match its new content) is compared against a stale pre-edit hash, producing a false hash-mismatch even though the head is perfectly self-consistent with what it currently contains.

## Fix intent

Correct checkIntegrity's log-tail selection (src/workflow/artifact-core/lifecycle.ts:134-144) so it does not silently skip every revision-less entry when deciding what the head should be compared against -- either by having every log-writing path (including the build gate's per-round 'update' entries) always carry the revision/contentHash current at write time, or by changing the lookup to use the log's true last entry's own implied state rather than hunting backward for the last revision-bearing one. Audit storyTaskHolds/rollUp's other callers (src/workflow/artifact-core/lifecycle.ts:355-399) for the same assumption, so a legitimate, self-consistent content correction to an approved Task, PLAN, LLD, HLD or DEF record never has to be worked around by hand-appending a log entry to pass integrity.

## Citations

- **[[c1]]** `code` `src/workflow/artifact-core/lifecycle.ts:134-144` — "export function checkIntegrity(a: ContentView, log: ChangeLogEntry | readonly ChangeLogEntry[] | undefined): Integrity {
	const own = checkHeadIntegrity(a);
	if (!own.ok) return own;
	const logTail = "
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle-service.ts:81-84` — "statusOf: async id => {
				try { return (await store.read(id)).lifecycle.status; }
				catch (err) { if (err instanceof ArtifactNotFoundError) return undefined; throw err; }
			},"
- **[[c3]]** `code` `src/workflow/artifact-core/lifecycle-service.ts:186-204` — "async completeIfRolledUp(id: string, by: Actor, ctx: EvidenceContext = {}): Promise<{ completed: string[] }> {"
- **[[c4]]** `code` `src/workflow/artifact-core/lifecycle.ts:355-368` — "export async function storyTaskHolds(id: string, epicHash: string, storyId: string, reader: ChildStatusReader, evidence: CompletionEvidence): Promise<StoryTaskHolds> {"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/TASKS-0765b3a578e43eec-s1.log.jsonl` — "Six consecutive 'update' log entries for TASK-0765b3a578e43eec-s1-t3, each carrying only outcome/summary and no revision field, bracketed by a 'create' and 'approve' entry that do carry one -- confirm"
