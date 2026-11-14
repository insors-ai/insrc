/**
 * The adherence checks read a body whole (LLD-b9d5c5c40df5a574-s4, task t7).
 *
 * The entities are real files in a temporary repository, stored with the file
 * hash the indexer stamps, so the content the checks read comes from the file.
 * The model is a stand-in that records what it was shown.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { artifactParser } from '../../../indexer/parser/artifact.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMMessage, LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../executor/types.js';
import { indexerFileHash } from '../../item-length.js';

import { codeAdherenceCheckRuntime } from '../code/adherence-check.js';
import { dataAdherenceCheckRuntime } from '../data/adherence-check.js';
import { infraAdherenceCheckRuntime } from '../infra/adherence-check.js';

const NOW = '2026-10-08T10:00:00.000Z';
const CONSTRAINTS = [{ constraint: 'refunds MUST be issued within 30 days' }];
const MODEL_ANSWER = { codeSubject: 's', dataSubject: 's', infraSubject: 's', matches: [], drifts: [], missingImpl: [], contradictions: [] };

let dir: string;
let REPO: string;
let shown: string[] = [];

/** An artifact file, indexed through the real parser and stamped with its hash. */
async function index(rel: string, source: string): Promise<Entity[]> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	const { entities } = artifactParser.parse(file, source, REPO, 1);
	const fileEntity = entities.find(e => e.kind === 'file' && e.file === file);
	assert.ok(fileEntity);
	fileEntity.hash = indexerFileHash(source);
	await upsertEntities(await getDb(), entities);
	return entities;
}

/** A code entity whose stored body is its lines in the file. `diskBody` is what the file holds now. */
async function indexFunction(rel: string, name: string, body: string, diskBody: string = body): Promise<Entity> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, diskBody);
	const lines = body.split('\n').length;
	const base = { language: 'typescript' as const, repoId: 1, repo: REPO, file, embedding: [], indexedAt: NOW };
	const fn: Entity = { ...base, id: makeEntityId(REPO, file, 'function', name), kind: 'function', name, startLine: 1, endLine: lines, body };
	const fileEntity: Entity = { ...base, id: makeEntityId(REPO, file, 'file', file), kind: 'file', name: rel, startLine: 1, endLine: lines, body: '', hash: indexerFileHash(body) };
	await upsertEntities(await getDb(), [fn, fileEntity]);
	return fn;
}

function args(templateId: string, params: Record<string, unknown>): TemplateExecuteArgs {
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'refunds', scopeRef: { kind: 'repo', value: REPO }, reasoning: 't' };
	const task = { taskId: 't01', template: templateId, kind: 'leaf', params, produces: [], rationale: 't' } as PlannedTask;
	return { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
}

const routing = {
	router: {
		resolveProviderForRole: () => ({
			provider: {
				completeStructured: async (messages: readonly LLMMessage[]) => {
					shown.push(messages.map(m => String(m.content)).join('\n'));
					return MODEL_ANSWER;
				},
			} as unknown as LLMProvider,
		}),
	},
} as unknown as RoutingSeamContext;

function run(runtime: TemplateRuntime, a: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
	return runWithRoutingContext(routing, () => runtime.execute(a));
}

test.beforeEach(async () => {
	await closeGraphStore();
	shown = [];
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-adherence-body-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('the code, data and infra adherence checks read a body over 1200 characters whole and an unconfirmable item is reported as not covered', async () => {
	// code: a function of 3,000 characters is shown whole, and nothing is reported as cut.
	const fnBody = `export function settleRefund() {\n${'  // settle the refund step by step\n'.repeat(84)}  // END-OF-SETTLE\n}`;
	assert.ok(fnBody.length > 3_000);
	await indexFunction('src/pay/settle.ts', 'settleRefund', fnBody);
	const code = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'settleRefund', constraints: CONSTRAINTS }));
	assert.ok(shown.at(-1)!.includes(fnBody), 'the whole function is shown to the model');
	assert.equal(code.completeness.partlyRead, undefined);

	// data: a schema file past the indexer's 8,192 characters is shown whole, to its last line.
	const schema = `model Payment {\n${Array.from({ length: 900 }, (_, i) => `  field${i} String // refund column`).join('\n')}\n  lastField String // refund END-OF-SCHEMA\n}\n`;
	assert.ok(schema.length > 8_192);
	await index('prisma/schema.prisma', schema);
	const data = await run(dataAdherenceCheckRuntime, args('data.adherence.check', { dataSubject: 'refund', constraints: CONSTRAINTS }));
	assert.ok(shown.at(-1)!.includes('END-OF-SCHEMA'), 'the end of the file is shown, past the stored body and the former cut');
	assert.equal((data.completeness.partlyRead ?? []).some(p => p.what.includes('prisma/schema.prisma')), false);

	// infra: a manifest longer than the former cut is shown whole.
	const manifest = `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: refund\ndata:\n${Array.from({ length: 200 }, (_, i) => `  key${i}: "refund-${i}"`).join('\n')}\n  last: "refund-END-OF-MANIFEST"\n`;
	await index('k8s/refund-config.yaml', manifest);
	const infra = await run(infraAdherenceCheckRuntime, args('infra.adherence.check', { infraSubject: 'refund', constraints: CONSTRAINTS }));
	assert.ok(shown.at(-1)!.includes('END-OF-MANIFEST'));
	assert.equal((infra.completeness.partlyRead ?? []).some(p => p.what.includes('refund-config.yaml')), false);

	// A body shorter than the former cut is shown whole and is not reported.
	await indexFunction('src/pay/tiny.ts', 'tinyRefund', 'export function tinyRefund() { return 1; }');
	const tiny = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'tinyRefund', constraints: CONSTRAINTS }));
	assert.equal(tiny.completeness.partlyRead, undefined);

	// An item whose file changed since it was indexed cannot be confirmed: it is shown from its stored body and
	// reported as not covered, with no length claimed.
	const stale = await indexFunction('src/pay/stale.ts', 'staleRefund', 'export function staleRefund() { return 1; }', 'export function staleRefund() { return 2; /* now longer */ }');
	const unconfirmed = await run(codeAdherenceCheckRuntime, args('code.adherence.check', { codeSubject: 'staleRefund', constraints: CONSTRAINTS }));
	assert.deepEqual(unconfirmed.completeness.partlyRead, [{
		what: `${stale.file}:1 staleRefund`, readChars: stale.body.length, totalChars: null, totalNote: 'the file changed since it was indexed',
	}]);
	assert.equal(unconfirmed.completeness.complete, false);
});
