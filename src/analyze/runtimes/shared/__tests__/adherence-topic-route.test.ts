/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An adherence check that is given a topic finds its constraints in the
 * repository's documents (ISSUE-0f17539c): the three family runtimes, run as
 * the plan walk runs them, against a real temporary store.
 *
 * One stand-in model serves both calls and counts them: the enumeration (the
 * model that reads the retrieved sections) and the judging.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../../db/client.js';
import { findEntitiesByFile, listEntitiesForRepo, upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo, listRepos } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../../shared/types.js';
import type { Completeness } from '../../../completeness.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateRuntime } from '../../../executor/types.js';
import { codeAdherenceCheckRuntime } from '../../code/adherence-check.js';
import { dataAdherenceCheckRuntime } from '../../data/adherence-check.js';
import { infraAdherenceCheckRuntime } from '../../infra/adherence-check.js';
import type { ConstraintInput, ConstraintSource } from '../adherence.js';
import { constraintRecordPathFor, purgeConstraintRecords } from '../adherence-topic-constraints.js';
import { _setTaskScopeDepsForTest } from '../task-scope.js';

const NOW = '2026-10-10T10:00:00.000Z';
const TOPIC = 'CI workflow rules';

let dir: string;
let REPO: string;
let sections: Entity[] = [];
let enumerations = 0;
let judgings = 0;
let judgingPrompts: string[] = [];
let enumerationMode: 'rules' | 'none' | 'down' = 'rules';
let judgingDown = false;
const runs: string[] = [];

function section(name: string, rel: string, body: string): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, 'section', name), kind: 'section', name, language: 'markdown', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body, embedding: [], indexedAt: NOW, artifact: true,
	} as Entity;
}

function code(name: string, rel: string, body: string): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, 'function', name), kind: 'function', name, language: 'typescript', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 3, body, embedding: [], indexedAt: NOW,
	} as Entity;
}

/** The judging call's schema requires `matches`; the enumeration's does not. */
const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>, schema: { required?: readonly string[] }) => {
		const prompt = String(messages[1]!.content);
		if (schema.required?.includes('matches') === true) {
			judgings++;
			judgingPrompts.push(prompt);
			if (judgingDown) throw new Error('the judging model is down');
			return { [schema.required[0]!]: 'subject', matches: [], drifts: [], missingImpl: [], contradictions: [] };
		}
		enumerations++;
		if (enumerationMode === 'down') throw new Error('the reading model is down');
		const constraints = enumerationMode === 'none' ? [] : sections
			.filter(s => prompt.includes(s.id))
			.map(s => ({ constraint: s.body.slice(0, 80), kind: 'must', sourceEntityId: s.id, file: s.file, heading: s.name, rationale: 'stated' }));
		return { subject: TOPIC, constraints, notFoundNote: constraints.length === 0 ? 'nothing stated' : '' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

function uniqueRun(label: string): string {
	const runId = `topic-route-test-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runs.push(runId);
	return runId;
}

interface Report {
	readonly constraints:      readonly ConstraintInput[];
	readonly constraintSource: ConstraintSource;
	readonly diagnostics:      { readonly constraintCount: number };
	readonly completeness:     Completeness;
}

const SUBJECT_KEY: Record<string, string> = {
	'code.adherence.check': 'codeSubject', 'data.adherence.check': 'dataSubject', 'infra.adherence.check': 'infraSubject',
};

async function check(
	runtime: TemplateRuntime,
	runId:   string,
	params:  Record<string, unknown>,
	over:    { scopeRef?: AnalyzeScopeRef; taskId?: string } = {},
): Promise<Report> {
	const target = runtime.templateId.split('.')[0] as ClassifiedIntent['target'];
	const task = {
		taskId: over.taskId ?? 't01', template: runtime.templateId, kind: 'leaf',
		params: { [SUBJECT_KEY[runtime.templateId]!]: 'settle', ...params }, produces: ['adherence-report'], rationale: 'test',
	} as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target, scope: 'M', focused: true, focus: 'ci', scopeRef: over.scopeRef ?? { kind: 'repo', value: REPO }, reasoning: 'test' };
	// A map that fails the test if the check asks it for anything.
	const upstreamOutputs = new Proxy(new Map<string, unknown>(), {
		get: (_t, prop) => { throw new Error(`the check read upstreamOutputs.${String(prop)}`); },
	});
	const args: TemplateExecuteArgs = { task, intent, upstreamOutputs, runId };
	const result = await runWithRoutingContext(routing, () => runtime.execute(args));
	return { ...(result.outputs.get('adherence-report') as Omit<Report, 'completeness'>), completeness: result.completeness as Completeness };
}

const recordPath = (runId: string, topic = TOPIC, maxSources?: number): string => constraintRecordPathFor(runId, REPO, topic, maxSources);
const what = (c: Completeness, field: 'limited' | 'partlyRead' | 'skipped'): string[] => (c[field] ?? []).map(x => x.what);

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-topic-route-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	sections = [
		section('CI rules', 'docs/ci.md', 'Every CI workflow MUST run the test suite before a build.'),
		section('Release rules', 'docs/release.md', 'A CI release workflow MUST NOT publish from a branch other than main.'),
	];
	await upsertEntities(await getDb(), [...sections, code('settle', 'src/pay.ts', 'export function settle() { return 1; }')]);
	enumerations = 0;
	judgings = 0;
	judgingPrompts = [];
	enumerationMode = 'rules';
	judgingDown = false;
});

test.afterEach(async () => {
	_setTaskScopeDepsForTest(undefined);
	for (const runId of runs.splice(0)) purgeConstraintRecords(runId);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('a check with a topic judges against the constraints enumerated from the repository\'s documents, and its output carries those constraints, their citations and the record\'s path', async () => {
	const runId = uniqueRun('judges');
	const report = await check(codeAdherenceCheckRuntime, runId, { constraintTopic: TOPIC });
	assert.deepEqual([enumerations, judgings], [1, 1]);

	// What it judged against: the two constraints of the documents, each cited to its section.
	const expected = sections.map(s => ({ constraint: s.body, sourceEntityId: s.id, file: s.file, heading: s.name }));
	const byId = (a: ConstraintInput, b: ConstraintInput): number => String(a.sourceEntityId).localeCompare(String(b.sourceEntityId));
	assert.deepEqual([...report.constraints].sort(byId), [...expected].sort(byId));
	assert.equal(report.diagnostics.constraintCount, 2);
	// ... and those are what the judging model was shown.
	for (const s of sections) assert.ok(judgingPrompts[0]!.includes(s.body), s.name);

	// Where they came from, with the record a reader can open.
	assert.deepEqual(report.constraintSource, { kind: 'documents', topic: TOPIC, repoPath: REPO, retrievedSectionCount: 2, record: recordPath(runId) });
	assert.ok(existsSync(recordPath(runId)));
});

test('four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not', async () => {
	const runId = uniqueRun('four');
	const reports: Report[] = [];
	for (const taskId of ['t12', 't13', 't14', 't15']) {
		reports.push(await check(infraAdherenceCheckRuntime, runId, { infraSubject: `.github/workflows/${taskId}.yml`, constraintTopic: TOPIC }, { taskId }));
	}
	assert.deepEqual([enumerations, judgings], [1, 4]);
	for (const r of reports) {
		assert.deepEqual(r.constraints, reports[0]!.constraints);
		assert.deepEqual(r.constraintSource, reports[0]!.constraintSource);
	}
	assert.equal(reports[0]!.constraints.length, 2);

	// The same topic in other letters and spacing, and from another family's check: still the one enumeration.
	const respelt = await check(codeAdherenceCheckRuntime, runId, { constraintTopic: '  ci   WORKFLOW rules ' });
	assert.equal(enumerations, 1);
	assert.deepEqual(respelt.constraints, reports[0]!.constraints);

	// Another limit of sections, another topic, another run: one enumeration each.
	const limited = await check(codeAdherenceCheckRuntime, runId, { constraintTopic: TOPIC, maxConstraintSources: 1 });
	assert.equal(enumerations, 2);
	assert.deepEqual([limited.constraints.length, limited.constraintSource], [1, { kind: 'documents', topic: TOPIC, repoPath: REPO, retrievedSectionCount: 1, record: recordPath(runId, TOPIC, 1) }]);
	await check(codeAdherenceCheckRuntime, runId, { constraintTopic: 'release workflow rules' });
	assert.equal(enumerations, 3);
	await check(codeAdherenceCheckRuntime, uniqueRun('four-other'), { constraintTopic: TOPIC });
	assert.equal(enumerations, 4);
});

test('the enumeration\'s reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record', async () => {
	// Two long sections on one subject; the enumeration is allowed one of them
	// and reads only its first part. No embedding backend runs in a test, so the
	// search by meaning is skipped.
	const long = (marker: string): string => `${marker} A rollback of a deploy MUST be announced. ` + 'deploy rollback detail. '.repeat(200);
	const extra = [section('Rollback A', 'docs/rollback-a.md', long('RB-A')), section('Rollback B', 'docs/rollback-b.md', long('RB-B'))];
	sections.push(...extra);
	await upsertEntities(await getDb(), extra);

	const runId = uniqueRun('completeness');
	const params = { constraintTopic: 'deploy rollback', maxConstraintSources: 1 };
	const made = await check(codeAdherenceCheckRuntime, runId, params, { taskId: 't01' });
	const read = await check(codeAdherenceCheckRuntime, runId, params, { taskId: 't02' });
	assert.equal(enumerations, 1, 'the second check read the record');

	for (const [who, report] of [['the check that enumerated', made], ['the check that read the record', read]] as const) {
		assert.equal(report.completeness.complete, false, who);
		assert.deepEqual(what(report.completeness, 'limited'), ['document sections'], who);
		assert.equal(report.completeness.limited![0]!.limit, 1, who);
		assert.equal(report.completeness.partlyRead?.length, 1, who);
		assert.match(report.completeness.partlyRead![0]!.what, /rollback-[ab]\.md/, who);
		assert.deepEqual(what(report.completeness, 'skipped'), ["the document index's search by meaning"], who);
	}
	assert.deepEqual(read.completeness, made.completeness);

	// A check on inline constraints has none of them.
	const inline = await check(codeAdherenceCheckRuntime, runId, { constraints: [{ constraint: 'x MUST y' }] });
	assert.deepEqual([inline.completeness.limited, inline.completeness.partlyRead, inline.completeness.skipped], [undefined, undefined, undefined]);
});

test('an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic', async () => {
	const { writeDocSummary } = await import('../../../../db/doc-summaries.js');
	const doc = { ...section('Design', 'design/pay.md', '# Design'), kind: 'document' } as Entity;
	doc.id = makeEntityId(REPO, doc.file, 'document', 'Design');
	await upsertEntities(await getDb(), [doc]);
	await writeDocSummary(null, doc.id, REPO, {
		title: 'Pay design', family: 'design', kind: 'design', subjects: ['pay'], summary: 'gist', keyDecisions: [],
		keyConstraints: ['a settlement MUST be idempotent'], relatedEntities: [], status: 'current', summarisedAt: NOW, modelId: 'm', contentHash: 'h',
	});
	const runId = uniqueRun('overrides');

	const inline = await check(codeAdherenceCheckRuntime, runId, { constraints: [{ constraint: 'refunds MUST be issued within 30 days' }], constraintIds: [doc.id], constraintTopic: TOPIC });
	assert.deepEqual([inline.constraints, inline.constraintSource], [[{ constraint: 'refunds MUST be issued within 30 days' }], { kind: 'inline' }]);

	const ids = await check(codeAdherenceCheckRuntime, runId, { constraintIds: [doc.id], constraintTopic: TOPIC });
	assert.deepEqual([ids.constraints.map(c => c.constraint), ids.constraintSource], [['a settlement MUST be idempotent'], { kind: 'stored-documents', ids: [doc.id] }]);

	const emptyInlineIds = await check(codeAdherenceCheckRuntime, runId, { constraints: [], constraintIds: [doc.id], constraintTopic: TOPIC });
	assert.deepEqual(emptyInlineIds.constraintSource, { kind: 'stored-documents', ids: [doc.id] });
	assert.equal(enumerations, 0, 'no override made an enumeration');
	assert.equal(existsSync(recordPath(runId)), false);

	// With nothing but empty lists beside it, the topic is used.
	const emptyInlineTopic = await check(codeAdherenceCheckRuntime, runId, { constraints: [], constraintIds: [], constraintTopic: TOPIC });
	assert.equal(enumerations, 1);
	assert.equal(emptyInlineTopic.constraintSource.kind, 'documents');
	assert.equal(emptyInlineTopic.constraints.length, 2);
});

test('a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository\'s documents', async () => {
	const fromRepo = (r: Report, runId: string): void => {
		assert.deepEqual(r.constraintSource, { kind: 'documents', topic: TOPIC, repoPath: REPO, retrievedSectionCount: 2, record: recordPath(runId) });
		assert.deepEqual(r.constraints.map(c => c.file).sort(), sections.map(s => s.file).sort());
	};

	// A code check on one file: the documents are not under the file, and are read all the same.
	const fileRun = uniqueRun('scope-file');
	fromRepo(await check(codeAdherenceCheckRuntime, fileRun, { constraintTopic: TOPIC }, { scopeRef: { kind: 'file', value: join(REPO, 'src/pay.ts') } }), fileRun);

	// An infra check on a manifest directory inside the repository: the containing repository's documents.
	mkdirSync(join(REPO, 'deploy'));
	const dirRun = uniqueRun('scope-manifest-dir');
	fromRepo(await check(infraAdherenceCheckRuntime, dirRun, { constraintTopic: TOPIC }, { scopeRef: { kind: 'manifest-dir', value: join(REPO, 'deploy') } }), dirRun);

	// A data check on a connection: the documents of the repository that declares it.
	_setTaskScopeDepsForTest({
		listRepos:           () => listRepos(null),
		findEntitiesByFile:  (file) => findEntitiesByFile(null, file),
		listEntitiesForRepo: (repoPath) => listEntitiesForRepo(null, repoPath),
		loadConnections:     async (repoPath) => ({ file: { connections: [] }, resolved: repoPath === REPO ? [{ id: 'ledger-db', kind: 'sqlite' }] : [], warnings: [] }) as never,
	});
	const connRun = uniqueRun('scope-connection');
	fromRepo(await check(dataAdherenceCheckRuntime, connRun, { constraintTopic: TOPIC }, { scopeRef: { kind: 'connection', value: 'ledger-db' } }), connRun);
	assert.equal(enumerations, 3);
});

test('when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration', async () => {
	// Sections were read and state no constraint.
	const runId = uniqueRun('none');
	enumerationMode = 'none';
	const reason = `code.adherence.check: the documents of ${REPO} state no constraint on "${TOPIC}" (2 section(s) were retrieved and read)`;
	await assert.rejects(() => check(codeAdherenceCheckRuntime, runId, { constraintTopic: TOPIC }), (err: Error) => err.message === reason);
	assert.ok(existsSync(recordPath(runId)), 'the finished enumeration is recorded');
	await assert.rejects(() => check(codeAdherenceCheckRuntime, runId, { constraintTopic: TOPIC }, { taskId: 't02' }), (err: Error) => err.message === reason);
	assert.deepEqual([enumerations, judgings], [1, 0], 'one enumeration, and nothing was judged');

	// No section matches the topic at all: the model is not even asked.
	const noMatch = uniqueRun('no-match');
	await assert.rejects(
		() => check(codeAdherenceCheckRuntime, noMatch, { constraintTopic: 'zzzunmatchedzzz' }),
		(err: Error) => err.message === `code.adherence.check: the documents of ${REPO} state no constraint on "zzzunmatchedzzz" (no section of the documents matches the topic)`,
	);
	assert.equal(enumerations, 1);
	assert.ok(existsSync(recordPath(noMatch, 'zzzunmatchedzzz')));
});

test('when the enumeration\'s model call fails the check fails with \'could not be enumerated\', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging\'s and the record stays', async () => {
	const runId = uniqueRun('failures');
	enumerationMode = 'down';
	await assert.rejects(
		() => check(infraAdherenceCheckRuntime, runId, { constraintTopic: TOPIC }),
		(err: Error) => {
			assert.equal(
				err.message,
				`infra.adherence.check: the constraints on "${TOPIC}" could not be enumerated from the documents of ${REPO}: `
				+ 'doc.constraint.enumerate: the model call that reads the retrieved sections failed: the reading model is down',
			);
			assert.ok(err.cause instanceof Error, 'the enumeration\'s error is kept as the cause');
			return true;
		},
	);
	assert.equal(existsSync(recordPath(runId)), false);
	assert.deepEqual([enumerations, judgings], [1, 0]);

	// The next check tries again, and this time the judging fails.
	enumerationMode = 'rules';
	judgingDown = true;
	await assert.rejects(
		() => check(infraAdherenceCheckRuntime, runId, { constraintTopic: TOPIC }, { taskId: 't02' }),
		/^Error: infra\.adherence\.check: the model call that judges adherence failed: the judging model is down\. 2 constraint\(s\) and \d+ excerpt\(s\) were gathered and not judged\.$/,
	);
	assert.deepEqual([enumerations, judgings], [2, 1]);
	assert.ok(existsSync(recordPath(runId)), 'the enumeration is kept');

	// A third check does not enumerate again.
	judgingDown = false;
	const ok = await check(infraAdherenceCheckRuntime, runId, { constraintTopic: TOPIC }, { taskId: 't03' });
	assert.deepEqual([enumerations, judgings, ok.constraints.length], [2, 2, 2]);
});

test('an override that yields no constraint fails naming the override and does not fall back to the topic', async () => {
	const runId = uniqueRun('empty-override');
	await assert.rejects(
		() => check(codeAdherenceCheckRuntime, runId, { constraints: [{ note: 'no constraint text' }, 'not an object'], constraintTopic: TOPIC }),
		(err: Error) => err.message === 'code.adherence.check: params.constraints holds no usable constraint (2 item(s), none with a constraint text)',
	);
	await assert.rejects(
		() => check(codeAdherenceCheckRuntime, runId, { constraintIds: ['no-such-document', 'nor-this-one'], constraintTopic: TOPIC }),
		(err: Error) => err.message === 'code.adherence.check: none of the 2 ids in params.constraintIds names a summarised document with a constraint',
	);
	assert.deepEqual([enumerations, judgings], [0, 0], 'the topic was not tried');
	assert.equal(existsSync(recordPath(runId)), false);
});
