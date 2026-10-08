/**
 * A Story's test record among the other artifacts (LLD-9b4a74dc-S001, task t4).
 *
 * `TESTS-<epicHash>-<storyId>.json` sits in the artifacts directory beside the
 * approvable artifacts. Every reader of that directory must leave it alone, and
 * no route may approve or reject it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { approve as tuiApprove, reject as tuiReject, listEpics } from '../../cli/services/workflow.js';
import { listAmendments, nextAmendmentId } from '../amendments/store.js';
import { scanLldStaleness } from '../amendments/staleness.js';
import type { HldArtifact } from '../artifacts/hld.js';
import { loadArtifactRecordSet } from '../delivery/load.js';
import {
	approveArtifactByJsonPath, approveWorkflowTarget, epicCatalog, NotApprovableError, NOT_APPROVABLE_REASON, rejectArtifactByJsonPath,
} from '../gates.js';
import { buildOwnershipIndex } from '../locate/ownership.js';
import { listArtifactMdPaths, listWorkItems } from '../path-scheme.js';
import { listPendingArtifacts } from '../pending.js';
import { listDeferred, questionId } from '../questions.js';
import { parseArtifactId } from '../resolve-comment.js';
import { persistTestRecordTask } from '../runners/build/test-record.js';
import { artifactIdMarker, artifactJsonPath, testsArtifactId } from '../storage.js';
import { resolveWorkflowRef } from '../tracker/resolve.js';

const HASH = 'abc123def4567890';
const AT = '2026-01-15T00:00:00.000Z';
const ROOT = 'docs/epics/pay-things-E20260115abc123de';

/** A repo with one Epic's artifacts: DEF, HLD, an LLD, a PLAN and a BUILD for
 *  Story s1, one amendment, a code review, and their documents. */
function seedRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-artifact-kinds-'));
	const wr = (rel: string, body: string): void => {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), body);
	};
	const art = (id: string, meta: Record<string, unknown>, body: Record<string, unknown> = {}, citations: unknown[] = []): void =>
		wr(`.insrc/artifacts/${id}.json`, JSON.stringify({ meta: { epicHash: HASH, epicSlug: 'pay-things', createdAt: AT, runId: `run-${id}`, ...meta }, body, citations }));
	art(`DEF-${HASH}`, { workflow: 'define' }, {
		epic: { title: 'Pay things' },
		stories: [{ id: 's1', title: 'Story one', userValue: 'v', acceptanceCriteria: [] }],
		openQuestions: ['an open one?'],
	}, [{ id: 'c1', kind: 'code', ref: 'src/pay.ts' }]);
	art(`HLD-${HASH}`, { workflow: 'design.epic' }, { openQuestions: [] });
	const deferred = 'a question left for the review?';
	art(`LLD-${HASH}-s1`, {
		workflow: 'design.story', storyId: 's1', hldBaseRunId: `run-HLD-${HASH}`, hldEffectiveHash: 'x',
		questionResolutions: { [questionId(deferred)]: { question: deferred, status: 'deferred', resolvedAt: AT } },
	}, { openQuestions: [deferred] }, [{ id: 'c1', kind: 'code', ref: 'src/pay.ts' }]);
	art(`PLAN-${HASH}-s1`, { workflow: 'plan', storyId: 's1' }, { tasks: [{ id: 't1', title: 'T', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['a'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'n' }] }], testStrategyCoverage: [] });
	art(`BUILD-${HASH}-s1`, { workflow: 'build', storyId: 's1' }, { tasks: [{ id: 't1', passed: true }] });
	wr(`.insrc/artifacts/AMD-${HASH}-1.json`, JSON.stringify({
		id: `AMD-${HASH}-1`, epicHash: HASH, epicSlug: 'pay-things', hldBaseRunId: `run-HLD-${HASH}`,
		amendment: { type: 'nonFunctional.retarget', key: 'latency', newTarget: '100 ms' },
		rationale: 'r', citations: [], proposedBy: { workflow: 'design.story', storyId: 's1' }, proposedAt: AT, status: 'pending',
	}));
	// A code review that blocks, for the approval case with enforcement on.
	art(`CR-${HASH}-s1`, { workflow: 'code-review', storyId: 's1', reviewedBy: 'daemon' }, { verdict: 'block', findings: [{ id: 'f1', severity: 'HIGH', title: 'x', status: 'open' }] });
	for (const [rel, id] of [['DEF.md', `DEF-${HASH}`], ['HLD.md', `HLD-${HASH}`], ['S001/LLD.md', `LLD-${HASH}-s1`], ['S001/PLAN.md', `PLAN-${HASH}-s1`], ['S001/BUILD.md', `BUILD-${HASH}-s1`]] as const) {
		wr(`${ROOT}/${rel}`, `${artifactIdMarker(id)}\n\n# ${id}\n`);
	}
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Write the Story's test record with the real writer. */
function addTestRecord(repo: string): { json: string; md: string } {
	return persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T10:00:00.000Z' }, {
		taskId: 't1', commit: 'abc1234', ranAt: '2026-03-01T10:00:00.000Z', testsPassed: true,
		tests: [{ name: 'n', level: 'unit', source: 'mapping', files: [], cases: [{ file: 'src/a/__tests__/x.test.ts', title: 't', result: 'pass' }] }],
		files: [{ file: 'src/a/__tests__/x.test.ts', exitCode: 0, timedOut: false, durationMs: 5, otherFailures: [], titles: [{ title: 't', result: 'pass' }] }],
	});
}

/** What each reader of the artifacts directory returns, as plain data. A reader
 *  that throws is recorded as its error, so a throw shows as a difference. */
function readAll(repo: string): Record<string, unknown> {
	const safe = (fn: () => unknown): unknown => {
		try { return JSON.parse(JSON.stringify(fn() ?? null)); } catch (err) { return { threw: (err as Error).message }; }
	};
	const set = loadArtifactRecordSet(repo, undefined, () => 'READ-AT');
	return {
		deliveryRecords:  safe(() => set.records.map(r => r.artifactId)),
		deliveryFailures: safe(() => set.failures),
		pending:          safe(() => listPendingArtifacts(repo)),
		ownership:        safe(() => [...buildOwnershipIndex(repo).byPath.entries()]),
		deferred:         safe(() => listDeferred(repo, HASH)),
		epicCatalog:      safe(() => epicCatalog(repo)),
		refStory:         safe(() => resolveWorkflowRef(repo, 's1', { epicHash: HASH })),
		refTask:          safe(() => resolveWorkflowRef(repo, 's1/t1', { epicHash: HASH })),
		refUnscoped:      safe(() => resolveWorkflowRef(repo, 's1/t1')),
		cliEpics:         safe(() => listEpics(repo)),
		staleness:        safe(() => scanLldStaleness(repo, HASH, { meta: { runId: `run-HLD-${HASH}` }, body: {}, citations: [] } as unknown as HldArtifact)),
		nextAmendmentId:  safe(() => nextAmendmentId(repo, HASH)),
		amendments:       safe(() => listAmendments(repo, HASH)),
		workItems:        safe(() => listWorkItems(repo)),
	};
}

test("with a TESTS record in the artifacts directory, each reader of that directory (the delivery view, for which both its records and its load failures are compared, the pending list, the ownership scan, the question scan, the Epic catalogue, the tracker's resolver, the CLI's workflow service, the amendment staleness scan, both scans of the amendment store, the path walk, the id parser) returns what it returned without it, and none throws", () => {
	const r = seedRepo();
	try {
		const before = readAll(r.repo);
		// The fixture is one the readers do read: without this the comparison could pass on empty results.
		assert.deepEqual(before['deliveryRecords'], [`BUILD-${HASH}-s1`, `CR-${HASH}-s1`, `DEF-${HASH}`, `HLD-${HASH}`, `LLD-${HASH}-s1`, `PLAN-${HASH}-s1`].concat((before['deliveryRecords'] as string[]).filter(id => id.startsWith('AMD-'))).sort());
		assert.ok((before['pending'] as unknown[]).length >= 4, JSON.stringify(before['pending']));
		assert.equal((before['epicCatalog'] as unknown[]).length, 1);
		assert.equal((before['cliEpics'] as unknown[]).length, 1);
		assert.notEqual(before['refTask'], null);
		assert.equal((before['workItems'] as unknown[]).length, 1);
		assert.equal((before['ownership'] as unknown[]).length, 1, JSON.stringify(before['ownership']));
		assert.equal((before['deferred'] as unknown[]).length, 1, JSON.stringify(before['deferred']));
		assert.equal((before['amendments'] as unknown[]).length, 1, JSON.stringify(before['amendments']));
		assert.equal(before['nextAmendmentId'], `AMD-${HASH}-2`);
		assert.ok((before['staleness'] as unknown[]).length >= 1, JSON.stringify(before['staleness']));
		for (const [name, value] of Object.entries(before)) {
			assert.ok(!(typeof value === 'object' && value !== null && 'threw' in value), `${name} threw before: ${JSON.stringify(value)}`);
		}
		const mdBefore = listArtifactMdPaths(r.repo, listWorkItems(r.repo)[0]!);

		const { json, md } = addTestRecord(r.repo);
		assert.ok(existsSync(json) && existsSync(md));
		assert.equal(md, join(r.repo, ROOT, 'S001', 'TESTS.md'));

		assert.deepEqual(readAll(r.repo), before);
		// The path walk lists the documents of a folder, so it lists the record's
		// document too, and nothing else changes in it.
		assert.deepEqual(listArtifactMdPaths(r.repo, listWorkItems(r.repo)[0]!), [...mdBefore, md].sort());
		// The comment tool's id parser gives no identity for the record.
		assert.equal(parseArtifactId(testsArtifactId(HASH, 's1')), null);
		assert.notEqual(parseArtifactId(`LLD-${HASH}-s1`), null);
	} finally { r.cleanup(); }
});

test("approval of a TESTS record by its md path and by its json path through the approval tool's route comes back in skipped[] with a reason that begins 'not-approvable:' and with no code-review outcome, also for a Story whose code review blocks with enforcement on; the TUI service's approve and reject throw NotApprovableError; the batch for its Epic does not stamp it; and the record is unchanged (mutations: put the kind check in the approval tool's route only; make it after the code-review gate)", async () => {
	const r = seedRepo();
	try {
		const { json, md } = addTestRecord(r.repo);
		const jsonBefore = readFileSync(json, 'utf8');
		const mdBefore = readFileSync(md, 'utf8');
		const unchanged = (): void => {
			assert.equal(readFileSync(json, 'utf8'), jsonBefore);
			assert.equal(readFileSync(md, 'utf8'), mdBefore);
		};
		assert.ok(NOT_APPROVABLE_REASON.startsWith('not-approvable:'));

		// The approval tool's route: by md, by json, with and without enforcement,
		// with and without an override. The Story's code review blocks, and no
		// code-review outcome is produced for the record.
		for (const artifactPath of [md, json]) {
			for (const enforce of [true, false]) {
				for (const overrideReview of [undefined, 'because']) {
					const out = await approveWorkflowTarget(
						{ repoPath: r.repo, artifactPath, ...(overrideReview !== undefined ? { overrideReview } : {}) }, { enforce },
					);
					assert.deepEqual(out.approved, []);
					assert.deepEqual(out.skipped, [{ path: json, reason: NOT_APPROVABLE_REASON }]);
					assert.deepEqual(out.codeReview, []);
					unchanged();
				}
			}
		}
		// The same Story's BUILD record IS put through the code-review gate: the
		// refusal above is by kind, not because the gate is off in this fixture.
		const build = await approveWorkflowTarget({ repoPath: r.repo, artifactPath: artifactJsonPath(r.repo, `BUILD-${HASH}-s1`) }, { enforce: true });
		assert.equal(build.codeReview.length, 1);

		// The two functions every approval and rejection go through.
		assert.throws(() => approveArtifactByJsonPath(json), NotApprovableError);
		assert.throws(() => approveArtifactByJsonPath(json, { overrideReview: 'because' }), NotApprovableError);
		assert.throws(() => rejectArtifactByJsonPath(json, 'no'), NotApprovableError);
		// ... also for a path that does not exist: the kind decides, not the file.
		assert.throws(() => approveArtifactByJsonPath(join(dirname(json), `TESTS-${HASH}-s9.json`)), NotApprovableError);
		unchanged();

		// The TUI's service, which calls them directly.
		assert.throws(() => tuiApprove(md, false), (err: unknown) => err instanceof NotApprovableError && err.message.startsWith('not-approvable:'));
		assert.throws(() => tuiApprove(json, false, 'because'), NotApprovableError);
		assert.throws(() => tuiReject(md, 'no'), NotApprovableError);
		assert.throws(() => tuiReject(json, 'no'), NotApprovableError);
		unchanged();

		// The batch for the Epic neither stamps nor lists it.
		const batch = await approveWorkflowTarget({ repoPath: r.repo, epicHash: HASH, overrideReview: 'batch' }, { enforce: false });
		const touched = [...batch.approved.map(a => a.path), ...batch.skipped.map(s => s.path)];
		assert.ok(touched.length > 0, 'the batch must have found the Epic\'s pending artifacts');
		assert.ok(!touched.includes(json), JSON.stringify(touched));
		unchanged();
		assert.equal((JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta['approvedAt'], undefined);
	} finally { r.cleanup(); }
});
