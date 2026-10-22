import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { IpcStreamMessage, LLMProvider } from '../../../shared/types.js';
import { codeReviewRunStart } from '../../../daemon/code-review-rpc.js';
import { DEFAULT_DEPS as STEP_DEFAULT_DEPS, handleCodeReviewStep } from '../../../daemon/steps/code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../../../daemon/steps/code-review-step/state-store.js';
import { runCodeReview, writeRecordFile as DEFAULT_WRITE } from '../../code-review/runner.js';
import type { CodeReviewRunnerDeps } from '../../code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../code-review/types.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, planArtifactId, testsArtifactId } from '../../storage.js';
import { approveWorkflowTarget } from '../../gates.js';
import { reviewArtifactFile } from '../../review/run-artifact.js';
import { LifecycleConflictError } from '../types.js';
import { LifecycleService } from '../lifecycle-service.js';
import { persistBuildRecord } from '../../runners/build/standalone-record.js';
import type { BuildRecord } from '../../runners/build/standalone-record.js';
import { persistTestRecordTask, testRecordPaths } from '../../runners/build/test-record.js';
import type { TestRecordTask } from '../../runners/build/test-record.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { lifecycleFor, resetLifecycleRegistry, roundWriterFor } from '../../../daemon/lifecycle-registry.js';
import { persistStandaloneBuildRecord } from '../../runners/build/standalone-record.js';
import { H, alice, artifact } from './store-kit.js';
import { durableKit } from './durable-kit.js';
import type { DurableKit } from './durable-kit.js';
import { stubEvidence } from './lifecycle-kit.js';

const BUILD = buildArtifactId(H, 's1');
const TESTS = testsArtifactId(H, 's1');
const T1 = '2026-10-21T10:00:00.000Z';
const T2 = '2026-10-21T11:00:00.000Z';

const buildRec = (at: string, passed: boolean): BuildRecord => ({
	meta: { workflow: 'build', epicHash: H, storyId: 's1', createdAt: at, updatedAt: at },
	body: { tasks: [{ id: 't1', passed }] },
});
const testTask = (at: string, testsPassed: boolean): TestRecordTask => ({ taskId: 't1', ranAt: at, testsPassed, tests: [], files: [] });

async function seeded(): Promise<{ k: DurableKit; through: RoundWriter; service: LifecycleService }> {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	const service = new LifecycleService({ store: k.store, evidence: stubEvidence([]) });
	return { k, service, through: { writer: service, actor: { id: 'insrc:build', kind: 'system', properties: {} } } };
}
const logOf = async (k: DurableKit, id: string) => (await k.store.readWithHistory(id)).changeLog;
const bodyOf = async (k: DurableKit, id: string) => (await k.store.read(id)).payload.body as { tasks: { id?: string; taskId?: string; passed?: boolean; testsPassed?: boolean }[] };

describe('round-recording', () => {
	it('persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log', async () => {
		const { k, through } = await seeded();
		try {
			// BUILD: the first round is created through the store, the second replaces it; both are in the log with their outcome.
			await persistBuildRecord(k.repo, buildRec(T1, false), through);
			await persistBuildRecord(k.repo, buildRec(T2, true), through);
			let log = await logOf(k, BUILD);
			assert.deepEqual(log.map(e => e.operation), ['create', 'update']);
			assert.equal(log[0]?.outcome?.result, 'failed');
			assert.equal(log[1]?.outcome?.result, 'passed');
			assert.equal(log[1]?.revision?.number, (log[0]?.revision?.number ?? 0) + 1);
			assert.equal((await bodyOf(k, BUILD)).tasks[0]?.passed, true);
			assert.equal((await k.store.read(BUILD)).lifecycle.revision.number, log[1]?.revision?.number, 'the raw refresh kept the head in step with the log');
			assert.equal((await k.store.read(BUILD)).lifecycle.status, 'draft');

			// TESTS: the same, and the rendered markdown follows.
			const first = await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T1 }, testTask(T1, false), {}, through);
			await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through);
			log = await logOf(k, TESTS);
			assert.deepEqual(log.map(e => e.operation), ['create', 'update']);
			assert.deepEqual(log.map(e => e.outcome?.result), ['failed', 'passed']);
			assert.equal((await bodyOf(k, TESTS)).tasks[0]?.testsPassed, true);
			assert.ok(readFileSync(first.md, 'utf8').includes('TESTS'), 'the document is rendered');
			// the head still carries its lifecycle after the raw refresh
			assert.equal((await k.store.read(TESTS)).lifecycle.revision.number, log[1]?.revision?.number);
			assert.equal((await new LifecycleService({ store: k.store, evidence: stubEvidence([]) }).inspect(TESTS))?.integrity.ok, true);
		} finally { k.done(); }
	});

	it('a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown', async () => {
		const { k, through } = await seeded();
		try {
			await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T1 }, testTask(T1, false), {}, through);
			const paths = testRecordPaths(k.repo, H, 's1', { now: T1 }, { kind: 'read' });
			// the document cannot be written: a directory sits where it goes
			rmSync(paths.md, { force: true });
			mkdirSync(paths.md);
			const before = (await logOf(k, TESTS)).length;
			await assert.rejects(persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through));
			// the content and its entry were committed and are not rolled back
			assert.equal((await bodyOf(k, TESTS)).tasks[0]?.testsPassed, true);
			assert.equal((await logOf(k, TESTS)).length, before + 1);
			// the next persist finds the content unchanged and renders the markdown
			rmSync(paths.md, { recursive: true, force: true });
			const again = await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through);
			assert.ok(readFileSync(again.md, 'utf8').includes('TESTS'));
			assert.equal((await logOf(k, TESTS)).length, before + 1, 'no second entry for the same content');
		} finally { k.done(); }
	});

	it('a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused', async () => {
		const { k, through, service } = await seeded();
		try {
			await persistBuildRecord(k.repo, buildRec(T1, false), through);
			k.faults.append = true;
			await assert.rejects(persistBuildRecord(k.repo, buildRec(T2, true), through), /injected append failure/);
			const staged = await k.journal.pending(BUILD);
			assert.ok(staged, 'the staged write stays in the journal');
			// the next update finishes it first, and the artifact can then be approved
			await persistBuildRecord(k.repo, buildRec(T2, true), through);
			assert.equal(await k.journal.pending(BUILD), undefined);
			const log = await logOf(k, BUILD);
			assert.equal(log.filter(e => e.id === staged.operationId).length, 1, 'the staged entry is logged once');
			assert.equal((await service.inspect(BUILD))?.integrity.ok, true);
			await service.apply(BUILD, 'approve', alice);
			assert.equal((await k.store.read(BUILD)).lifecycle.status, 'approved');
		} finally { k.done(); }
	});

	it('runCodeReview with a RoundWriter stores the content through the service and logs the round on the daemon route and the controller route, and a failed store replaces no record', async () => {
		const { k, through } = await seeded();
		const CR = codeReviewArtifactId(H, 's1');
		const CREATED = '2026-10-21T00:00:00.000Z';
		const subject: CodeReviewSubject = {
			repoPath: k.repo, epicHash: H, storyId: 's1', changedFiles: ['src/a.ts'],
			approvedLld:  { meta: { epicHash: H, storyId: 's1', epicSlug: 'demo', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
			approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
			buildRecord: null,
		};
		const grounding: CodeReviewGrounding = { symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }] };
		const dims: ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
		const judges = dims.map(dimension => ({ dimension, judge: async (): Promise<DimensionResult> => ({ dimension, findings: [] }) }));
		const crJson = () => join(k.repo, '.insrc', 'artifacts', `${CR}.json`);
		try {
			// Daemon route: every branch of codeReviewRunStart hands the runner the repository's round writer.
			const seen: (CodeReviewRunnerDeps | undefined)[] = [];
			const viaRunner = async (s: CodeReviewSubject, p: LLMProvider, o: Parameters<typeof runCodeReview>[2], d?: CodeReviewRunnerDeps) => {
				seen.push(d);
				return runCodeReview(s, p, o, { judges, assembleGrounding: async () => grounding, write: d?.write ?? DEFAULT_WRITE, ...(d?.through !== undefined ? { through: d.through } : {}) });
			};
			const run = async (extra: Record<string, unknown>, params: Record<string, unknown> = {}): Promise<IpcStreamMessage[]> => {
				const sent: IpcStreamMessage[] = [];
				await codeReviewRunStart({ epicHash: H, storyId: 's1', repo: k.repo, ...params }, m => sent.push(m), new AbortController().signal, {
					resolveSubject: async () => ({ ok: true, subject }),
					resolveProvider: () => ({ provider: {} as LLMProvider, modelLabel: 'm' }),
					assembleDiffGrounding: (async () => ({ grounding, changedFiles: ['src/a.ts'] })) as never,
					runReview: viaRunner as never,
					roundWriterFor: () => through,
					...extra,
				});
				return sent;
			};
			const dbg = (sent: IpcStreamMessage[]) => JSON.stringify(sent.filter(m => m.stream === 'error'));
			const first = await run({});                                                    // default branch
			assert.ok(first.some(m => m.stream === 'done'), dbg(first));
			const second = await run({ write: DEFAULT_WRITE });                              // injected-write branch
			assert.ok(second.some(m => m.stream === 'done'), dbg(second));
			const third = await run({}, { groundingMode: 'degraded', fallbackReason: { kind: 'declined' } });   // degraded branch
			assert.ok(third.some(m => m.stream === 'done'), dbg(third));
			assert.deepEqual(seen.map(d => d?.through === through), [true, true, true], 'every branch hands the runner the round writer');
			let log = await logOf(k, CR);
			assert.equal(log[0]?.operation, 'create');
			assert.ok(log.length >= 2 && log.every(e => e.outcome !== undefined), 'each review round is logged with its outcome');
			assert.equal((await k.store.read(CR)).lifecycle.revision.number, log.at(-1)?.revision?.number);

			// Controller route: the step handler stores the round through the service too.
			_clearCodeReviewStateStoreForTests();
			const before = (await logOf(k, CR)).length;
			const stepDeps = {
				...STEP_DEFAULT_DEPS,
				resolveSubject: async () => ({ ok: true as const, subject }),
				fetchGrounding: async () => ({ ok: true as const, grounding }),
				fetchFreshness: async () => ({ ok: true as const, isProcessing: false, staleFiles: [] }),
				readBuildAuthor: () => 'daemon' as const,
				roundWriterFor: () => through,
			};
			const parse = (env: { content: readonly { text: string }[] }) => JSON.parse(env.content[0]!.text) as { next: string; state?: string };
			const judgements = { judgements: dims.map(d => ({ dimension: d, findings: [] })) };
			const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: H, storyId: 's1', repo: k.repo }, stepDeps));
			const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements, state: start.state! } as never, stepDeps));
			assert.equal(done.next, 'done', JSON.stringify(done));
			log = await logOf(k, CR);
			assert.equal(log.length, before + 1, 'the controller round is logged through the service');
			assert.ok(log.every(e => e.outcome !== undefined));

			// A failed store fails the run's finalize and replaces no record.
			const headBefore = readFileSync(crJson(), 'utf8');
			_clearCodeReviewStateStoreForTests();
			const start2 = parse(await handleCodeReviewStep({ phase: 'start', epicHash: H, storyId: 's1', repo: k.repo }, stepDeps));
			k.faults.append = true;
			const judgements2 = { judgements: dims.map((d, i) => ({ dimension: d, findings: i === 0 ? [{ dimension: d, severity: 'MED', location: 'src/a.ts:1', message: 'a new finding' }] : [] })) };
			const failed = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements2, state: start2.state! } as never, stepDeps));
			assert.equal(failed.next, 'error', JSON.stringify(failed));
			assert.equal(readFileSync(crJson(), 'utf8'), headBefore, 'no record was replaced');
			assert.ok(existsSync(crJson()));
		} finally { k.done(); }
	});

	it('the first BUILD round of a Trivial standalone build, with no earlier record in the work item, is created through the registry store on the record\'s own time', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'round-trivial-'));
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const created = await persistStandaloneBuildRecord(repo, {
				meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: H, storyId: 's1', createdAt: T1, authoredBy: 'controller' },
				body: { focus: 'rename a flag', producesLld: false },
			}, roundWriterFor(repo));
			const stored = await lifecycleFor(repo).store.readWithHistory(BUILD);
			assert.deepEqual(stored.changeLog.map(e => e.operation), ['create'], 'the first round is logged by the store');
			const head = JSON.parse(readFileSync(created.json, 'utf8')) as { meta: { createdAt: string; standalone?: boolean } };
			assert.equal(head.meta.createdAt, T1, 'the record keeps the time the build gave it, not the store\'s clock');
			assert.equal(head.meta.standalone, true);
			assert.ok(readFileSync(created.md, 'utf8').includes('BUILD'), 'the markdown is rendered');
			assert.equal((await lifecycleFor(repo).service.inspect(BUILD))?.integrity.ok, true);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
	});

	it('an unreadable BUILD head is replaced by a round that keeps the time the build gave it, not the store\'s clock', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'round-unreadable-'));
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			writeFileSync(join(repo, '.insrc', 'artifacts', `${BUILD}.json`), '{ not json');
			const created = await persistStandaloneBuildRecord(repo, {
				meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: H, storyId: 's1', createdAt: T1, authoredBy: 'controller' },
				body: { focus: 'rename a flag', producesLld: false },
			}, roundWriterFor(repo));
			const head = JSON.parse(readFileSync(created.json, 'utf8')) as { meta: { createdAt: string } };
			assert.equal(head.meta.createdAt, T1);
			assert.deepEqual((await lifecycleFor(repo).store.readWithHistory(BUILD)).changeLog.map(e => e.operation), ['create']);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
	});

	it('a round head with merge conflict markers or a meta the store cannot read is refused untouched, and one with nothing in it is replaced', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'round-conflict-'));
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const path = join(repo, '.insrc', 'artifacts', `${BUILD}.json`);
			const rec = { meta: { workflow: 'build' as const, standalone: true, sizeClass: 'trivial', epicHash: H, storyId: 's1', createdAt: T1, authoredBy: 'controller' as const }, body: { focus: 'x', producesLld: false } };
			const marked = '<<<<<<< HEAD\n{ "meta": { "approvedAt": "2026-10-20T00:00:00Z" } }\n=======\n{}\n>>>>>>> branch\n';
			writeFileSync(path, marked);
			await assert.rejects(persistStandaloneBuildRecord(repo, rec, roundWriterFor(repo)), /merge conflict markers/);
			assert.equal(readFileSync(path, 'utf8'), marked);
			const stamped = JSON.stringify({ meta: { approvedAt: '2026-10-20T00:00:00Z', lifecycle: { status: 'nonsense' } }, body: {} });
			writeFileSync(path, stamped);
			await assert.rejects(persistStandaloneBuildRecord(repo, rec, roundWriterFor(repo)), /cannot be read/);
			assert.equal(readFileSync(path, 'utf8'), stamped);
			writeFileSync(path, '{}');
			await persistStandaloneBuildRecord(repo, rec, roundWriterFor(repo));
			assert.deepEqual((await lifecycleFor(repo).store.readWithHistory(BUILD)).changeLog.map(e => e.operation), ['create']);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
	});

	it('round-recording.test.ts: round recording runs with a mandatory lifecycle service', async () => {
		const { k, through, service } = await seeded();
		try {
			// a round is recorded through the service the request names
			await persistBuildRecord(k.repo, buildRec(T1, true), through);
			assert.deepEqual((await logOf(k, BUILD)).map(e => e.operation), ['create']);

			// a head edited behind the store is out of step with its log: the full log check refuses it on every path, with the service in hand
			const PLAN = planArtifactId(H, 's1');
			await k.store.write(artifact(PLAN, { payload: { body: { text: 'one' }, citations: [] } }), alice);
			const planPath = artifactJsonPath(k.repo, PLAN);
			const head = JSON.parse(readFileSync(planPath, 'utf8'));
			head.body.text = 'edited behind the store';
			writeFileSync(planPath, JSON.stringify(head, null, 2) + '\n');

			const approved = await approveWorkflowTarget({ repoPath: k.repo, artifactPath: planPath, lifecycle: service }, { enforce: false });
			assert.deepEqual(approved.approved, []);
			assert.match(approved.skipped[0]?.reason ?? '', /out of step|changed|integrity|hash|log/i);

			const md = join(k.repo, 'PLAN.md');
			writeFileSync(md, '# Plan\n');
			await assert.rejects(
				reviewArtifactFile({ mdPath: md, jsonPath: planPath, repo: k.repo, lifecycle: service, provider: {} as LLMProvider, model: 'm' }),
				(e: unknown) => e instanceof LifecycleConflictError,
			);
			assert.equal((await k.store.readWithHistory(PLAN)).lifecycle.status, 'draft', 'and nothing was approved');
		} finally { k.done(); }
	});
});
