/**
 * Plan tasks report cut documents and the project context's limits
 * (LLD-b9d5c5c40df5a574-s1, task t10).
 *
 * Documents are real files indexed through the real artifact parser and
 * stamped with the file hash as the indexer does, so their stored bodies
 * carry the indexer's cut and the lengths reported come from the files.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { docsProjectContextTool } from '../../../daemon/tools/builtins/docs/index.js';
import type { ToolDeps } from '../../../daemon/tools/types.js';
import { getDb } from '../../../db/client.js';
import { writeDocSummary } from '../../../db/doc-summaries.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { artifactParser } from '../../../indexer/parser/artifact.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { ClassifiedIntent, DocSummary } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { assembleLiveProjectContext } from '../../context/live-project-context.js';
import type { LiveProjectContextReport } from '../../context/live-project-context.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../executor/types.js';
import { createItemMeasurer, summarisedFrom } from '../../explore/item-measure.js';
import { indexerFileHash } from '../../item-length.js';
import { SUMMARISER_BODY_CHARS } from '../../summariser/driver.js';

import { codeAdherenceCheckRuntime } from '../code/adherence-check.js';
import { dataAdherenceCheckRuntime } from '../data/adherence-check.js';
import { docsDiscoveryInventoryRuntime } from '../docs/discovery-inventory.js';
import { countedSkip, docsFamilySummariseRuntime } from '../docs/family-summarise.js';
import { infraAdherenceCheckRuntime } from '../infra/adherence-check.js';

const NOW = '2026-10-08T10:00:00.000Z';

let dir: string;
let REPO: string;

async function index(rel: string, source: string): Promise<Entity[]> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	const { entities } = artifactParser.parse(file, source, REPO, 1);
	const fileEntity = entities.find(e => e.kind === 'file' && e.file === file);
	assert.ok(fileEntity, `${rel}: the parser produced a file entity`);
	fileEntity.hash = indexerFileHash(source);
	await upsertEntities(await getDb(), entities);
	return entities;
}

/** A code entity whose stored body IS its lines in the file, as the code parsers store it. */
async function indexFunction(rel: string, name: string, body: string): Promise<Entity> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	const lines = body.split('\n').length;
	const base = { language: 'typescript' as const, repoId: 1, repo: REPO, file, embedding: [], indexedAt: NOW };
	const fn: Entity = { ...base, id: makeEntityId(REPO, file, 'function', name), kind: 'function', name, startLine: 1, endLine: lines, body };
	const fileEntity: Entity = { ...base, id: makeEntityId(REPO, file, 'file', file), kind: 'file', name: rel, startLine: 1, endLine: lines, body: '', hash: indexerFileHash(body) };
	await upsertEntities(await getDb(), [fn, fileEntity]);
	return fn;
}

function summary(title: string, extra: Partial<DocSummary> = {}): DocSummary {
	return {
		title, family: 'docs', kind: 'reference' as DocSummary['kind'], subjects: ['refunds'], summary: `${title} in brief`,
		keyDecisions: ['refund in full'], keyConstraints: ['refunds MUST be issued within 30 days'], relatedEntities: [],
		status: 'current', summarisedAt: NOW, modelId: 'm', contentHash: 'h', ...extra,
	};
}

function args(templateId: string, params: Record<string, unknown>): TemplateExecuteArgs {
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'refunds', scopeRef: { kind: 'repo', value: REPO }, reasoning: 't' };
	const task = { taskId: 't01', template: templateId, kind: 'leaf', params, produces: [], rationale: 't' } as PlannedTask;
	return { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
}

const MODEL_ANSWER = { codeSubject: 's', dataSubject: 's', infraSubject: 's', matches: [], drifts: [], missingImpl: [], contradictions: [] };
const routing = {
	router: { resolveProviderForRole: () => ({ provider: { completeStructured: async () => MODEL_ANSWER } as unknown as LLMProvider }) },
} as unknown as RoutingSeamContext;

function run(runtime: TemplateRuntime, a: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
	return runWithRoutingContext(routing, () => runtime.execute(a));
}

const LONG_DOC = `# Refund policy\n\nRefunds MUST be issued within 30 days.\n${'More about refunds. '.repeat(1_000)}\n`;
const SHORT_DOC = '# Shipping\n\nOrders ship within two days.\n';
const CONSTRAINTS = [{ constraint: 'refunds MUST be issued within 30 days' }];

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-partly-read-tasks-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The adherence checks' 1,200-character cut
// ---------------------------------------------------------------------------

test('each adherence check reports a body it cut with the kept and full lengths', async () => {
	// code: a function of 3,000 characters; the model is shown its first 1,200.
	const fnBody = `export function settleRefund() {\n${'  // settle the refund step by step\n'.repeat(84)}}`;
	assert.ok(fnBody.length > 3_000);
	const fn = await indexFunction('src/pay/settle.ts', 'settleRefund', fnBody);
	const code = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'settleRefund', constraints: CONSTRAINTS }));
	assert.deepEqual(code.completeness.partlyRead, [{ what: `${fn.file}:1 settleRefund`, readChars: 1_200, totalChars: fnBody.length }]);
	assert.equal(code.completeness.complete, false);
	assert.equal(code.completeness.basis, 'graph');

	// data: a schema file of 20,000 characters, cut by the indexer at 8,192 and by the check at 1,200.
	const schema = `model Payment {\n${Array.from({ length: 900 }, (_, i) => `  field${i} String // refund column`).join('\n')}\n}\n`;
	assert.ok(schema.length > 8_192);
	await index('prisma/schema.prisma', schema);
	const data = await run(dataAdherenceCheckRuntime, args('data.adherence.check', { dataSubject: 'refund', constraints: CONSTRAINTS }));
	const dataCut = (data.completeness.partlyRead ?? []).find(p => p.what.startsWith(join(REPO, 'prisma/schema.prisma')));
	assert.ok(dataCut, `the schema file is reported; got ${JSON.stringify(data.completeness.partlyRead)}`);
	assert.deepEqual([dataCut.readChars, dataCut.totalChars], [1_200, schema.length], '1,200 of the file, not of the 8,192 the index stores');

	// infra: a manifest longer than the cut.
	const manifest = `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: refund\ndata:\n${Array.from({ length: 200 }, (_, i) => `  key${i}: "refund-${i}"`).join('\n')}\n`;
	await index('k8s/refund-config.yaml', manifest);
	const infra = await run(infraAdherenceCheckRuntime, args('infra.adherence.check', { infraSubject: 'refund', constraints: CONSTRAINTS }));
	const infraCut = (infra.completeness.partlyRead ?? []).find(p => p.what.startsWith(join(REPO, 'k8s/refund-config.yaml')));
	assert.ok(infraCut);
	assert.deepEqual([infraCut.readChars, infraCut.totalChars], [1_200, manifest.length]);

	// A body shorter than the cut is shown whole and is not reported.
	const small = await indexFunction('src/pay/tiny.ts', 'tinyRefund', 'export function tinyRefund() { return 1; }');
	const whole = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'tinyRefund', constraints: CONSTRAINTS }));
	assert.equal(whole.completeness.partlyRead, undefined, small.file);
});

// ---------------------------------------------------------------------------
// The project context
// ---------------------------------------------------------------------------

test('the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in the record', async () => {
	const [longDoc] = (await index('docs/refunds.md', LONG_DOC)).filter(e => e.kind === 'section' || e.kind === 'document');
	const [shortDoc] = (await index('docs/shipping.md', SHORT_DOC)).filter(e => e.kind === 'section' || e.kind === 'document');
	assert.ok(longDoc && shortDoc);
	const db = await getDb();
	await writeDocSummary(db, longDoc.id, REPO, summary('Refund policy', { keyConstraints: ['c1', 'c2', 'c3'], keyDecisions: ['d1', 'd2'] }));
	await writeDocSummary(db, shortDoc.id, REPO, summary('Shipping', { keyConstraints: ['s1'], keyDecisions: ['sd1'] }));

	// The assembler stops silently at its limits; with a report it says so.
	const report: LiveProjectContextReport = {};
	const ctx = await assembleLiveProjectContext(db, REPO, { maxConstraints: 2, maxDecisions: 10, report });
	assert.equal(ctx.constraints.length, 2);
	assert.deepEqual(report.limitsReached, [{ what: 'constraints', limit: 2, found: 4 }], 'four constraints exist and two are returned; the decisions fit');
	assert.deepEqual([...report.sourceEntityIds!].sort(), [longDoc.id, shortDoc.id].sort());
	// Within its limits it reports none.
	const roomy: LiveProjectContextReport = {};
	await assembleLiveProjectContext(db, REPO, { report: roomy });
	assert.deepEqual(roomy.limitsReached, []);
	// The context itself holds nothing new.
	assert.deepEqual(Object.keys(ctx).sort(), ['constraints', 'decisions', 'familyBreakdown', 'generatedAt', 'placeholderCount', 'recentActivity', 'repo', 'topSubjects', 'totalCodeEntities', 'totalDocs']);

	// The adherence check takes its constraints from the context by document id.
	// The long document's summary rests on its first 8,192 characters: reported.
	await indexFunction('src/pay/settle.ts', 'settleRefund', 'export function settleRefund() { return 1; }');
	const viaIds = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'settleRefund', constraintIds: [longDoc.id, shortDoc.id] }));
	const docCut = (viaIds.completeness.partlyRead ?? []).find(p => p.what === join(REPO, 'docs/refunds.md'));
	assert.ok(docCut, `the long source document is reported; got ${JSON.stringify(viaIds.completeness.partlyRead)}`);
	assert.equal(docCut.readChars, SUMMARISER_BODY_CHARS);
	assert.ok(docCut.totalChars !== null && docCut.totalChars > 8_192);
	assert.equal((viaIds.completeness.partlyRead ?? []).some(p => p.what === join(REPO, 'docs/shipping.md')), false, 'the short document was summarised whole');
	assert.equal((viaIds.completeness.limited ?? []).some(l => l.what === 'project constraints'), false, 'four constraints are well within the 500 asked for');

	// More constraints than the 500 the check asks for: the limit is in the record.
	await writeDocSummary(db, shortDoc.id, REPO, summary('Shipping', { keyConstraints: Array.from({ length: 600 }, (_, i) => `rule ${i}`) }));
	const overLimit = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'settleRefund', constraintIds: [longDoc.id, shortDoc.id] }));
	const limit = (overLimit.completeness.limited ?? []).find(l => l.what === 'project constraints');
	assert.deepEqual(limit, { what: 'project constraints', limit: 500, scope: 'source', reason: '603 project constraints were found and 500 are kept' });
	assert.equal(overLimit.completeness.complete, false);
});

// ---------------------------------------------------------------------------
// The docs plan tasks
// ---------------------------------------------------------------------------

test("the docs plan tasks report a document longer than the summariser's cut under partlyRead, and a missing summary and a failure placeholder under skipped (mutation: drop the partlyRead entry)", async () => {
	const pick = (es: Entity[]): Entity => es.find(e => e.kind === 'section') ?? es.find(e => e.kind === 'document')!;
	const long    = pick(await index('docs/refunds.md', LONG_DOC));
	const short   = pick(await index('docs/shipping.md', SHORT_DOC));
	const failed  = pick(await index('docs/broken.md', '# Broken\n\nThe summariser could not read this.\n'));
	const pending = pick(await index('docs/pending.md', '# Pending\n\nNot summarised yet.\n'));
	const db = await getDb();
	await writeDocSummary(db, long.id, REPO, summary('Refund policy'));
	await writeDocSummary(db, short.id, REPO, summary('Shipping'));
	await writeDocSummary(db, failed.id, REPO, summary('', { errorCode: 'llm-unavailable', summary: '', keyDecisions: [], keyConstraints: [], subjects: [] }));

	const longLabel = `${long.file} § ${long.name}`;
	const realLength = LONG_DOC.split('\n').slice(long.startLine - 1, long.endLine).join('\n').length;
	assert.ok(realLength > SUMMARISER_BODY_CHARS, `the long section is ${realLength} characters`);

	// --- docs.family.summarise ---
	const fam = await run(docsFamilySummariseRuntime, args('docs.family.summarise', { family: 'docs' }));
	const rollup = fam.outputs.get('family-summary') as { docCount: number; placeholderCount: number };
	assert.equal(rollup.docCount, 2, 'the two summarised documents are rolled up, as before');
	assert.equal(rollup.placeholderCount, 1);
	assert.deepEqual(fam.completeness.partlyRead, [{ what: long.file, readChars: SUMMARISER_BODY_CHARS, totalChars: realLength }],
		'the long document, the summariser\'s cut and its full length; the short one is not listed');
	assert.deepEqual(fam.completeness.skipped, [
		{ what: `1 document: ${failed.file}`, reason: 'summarising failed for them, so they are not in this roll-up' },
		{ what: `1 document: ${pending.file} § ${pending.name}`, reason: 'they have no summary yet, so they are not in this roll-up' },
	]);
	assert.equal(fam.completeness.complete, false);
	assert.equal(fam.completeness.basis, 'doc-index');

	// --- docs.discovery.inventory ---
	const inv = await run(docsDiscoveryInventoryRuntime, args('docs.discovery.inventory', { scopeRef: { kind: 'repo', value: REPO } }));
	const invOut = inv.outputs.get('docs-inventory') as { inventory: { file: string; hasSummary: boolean }[]; summariesReady: number };
	assert.equal(invOut.summariesReady, 2);
	assert.deepEqual(inv.completeness.partlyRead, [{ what: longLabel, readChars: SUMMARISER_BODY_CHARS, totalChars: realLength }]);
	const skipped = inv.completeness.skipped ?? [];
	assert.equal(skipped.length, 2);
	assert.match(skipped[0]!.what, new RegExp(`^1 document: ${failed.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
	assert.equal(skipped[0]!.reason, 'summarising failed for them, so their entries carry no status, subjects or counts');
	assert.ok(skipped[1]!.what.includes(pending.file), 'the document with no summary is named');
	assert.equal(skipped[1]!.reason, 'they have no summary yet, so their entries carry no status, subjects or counts');
	// Every document is still listed in the inventory itself.
	assert.ok(invOut.inventory.some(e => e.file === pending.file && e.hasSummary === false));

	// What was read is the summariser's cut even when the index stores more of the
	// document than that: a stored body of 20,000 characters, summarised from 8,192.
	const stored20k: Entity = { ...short, id: 'x'.repeat(32), body: 'z'.repeat(20_000) };
	const cut = await summarisedFrom(createItemMeasurer(db), stored20k, SUMMARISER_BODY_CHARS);
	assert.equal(cut?.readChars, SUMMARISER_BODY_CHARS);

	// The entry that names several documents: none when there are none, and every file in it.
	assert.deepEqual(countedSkip([], 'x'), []);
	assert.deepEqual(countedSkip(['b.md', 'a.md'], 'why'), [{ what: '2 documents: a.md, b.md', reason: 'why' }]);
});

// ---------------------------------------------------------------------------
// The docs tool exposed to agents
// ---------------------------------------------------------------------------

test('the docs tool exposed to agents returns what it returned before', async () => {
	const doc = (await index('docs/refunds.md', LONG_DOC)).find(e => e.kind === 'section')!;
	await writeDocSummary(await getDb(), doc.id, REPO, summary('Refund policy', { keyConstraints: ['c1', 'c2', 'c3'] }));

	const deps = { closureRepos: [REPO] } as unknown as ToolDeps;
	const result = await docsProjectContextTool.execute({ maxConstraints: 2 }, deps);
	assert.equal(result.success, true);
	// The assembler was given no report by the tool, and the context it returns as
	// `data` has exactly the fields it had: nothing about limits or source documents.
	assert.deepEqual(Object.keys(result.data as object).sort(), [
		'constraints', 'decisions', 'familyBreakdown', 'generatedAt', 'placeholderCount',
		'recentActivity', 'repo', 'topSubjects', 'totalCodeEntities', 'totalDocs',
	]);
	assert.equal((result.data as { constraints: unknown[] }).constraints.length, 2, 'its own limit still applies');
	assert.match(String(result.output), /^## Project docs context/);
	assert.equal(String(result.output).includes('limit'), false);
});
