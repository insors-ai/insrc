import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Ollama } from 'ollama';
import { setGraphStorePath, closeGraphStore } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { upsertEntities } from '../../../../db/entities.js';
import { upsertRelations } from '../../../../db/relations.js';
import type { Entity } from '../../../../shared/types.js';
import { sessionConnectionExecution, runWithConnectionExecution, connectionExecutionErrorCode, ConnectionExecutionError } from '../../../../shared/step-context.js';
import { RequestLifetime } from '../../../request-context.js';
import { getLogger } from '../../../../shared/logger.js';
import { embedQuery, embedText, embedEntities, setActiveEmbedderBackend } from '../../../../indexer/embedder.js';
import { onnxEmbedQuery, onnxEmbedDocument, onnxEmbedDocuments, isOnnxEmbedderAvailable, _setOnnxPipelineForTest } from '../../../../agent/providers/onnx-embedder.js';
import { OllamaProvider } from '../../../../agent/providers/ollama.js';
import { CliProvider } from '../../../../agent/providers/cli-provider.js';
import { retrieveDocSections, retrieveDocSectionsInRepo, hydrateDocSection, _setVectorPassForTest } from '../../../../analyze/docs-retrieval.js';
import { docsRetrieveTool, docsProjectContextTool, docsSummaryGetTool, docsFamilyListTool } from '../../../tools/builtins/docs/index.js';
import { graphSearchTool, graphQueryTool } from '../../../tools/builtins/graph/index.js';
import { dataLineageTool } from '../../../tools/builtins/data/lineage.js';
import { executeTool } from '../../../tools/executor.js';
import { registerTool } from '../../../tools/registry.js';
import { buildHandlerRuntime } from '../../../handler-runtime.js';
import type { ToolDeps } from '../../../tools/types.js';

test('all unsupported embedding retrieval and lineage paths refuse before backend and data access', async () => {
	const root = await mkdtemp(join(tmpdir(), 'cm-embedding-denial-')); setGraphStorePath(join(root, 'graph.lmdb')); const lifetime = new RequestLifetime(); let active = true;
	const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: root, daemonEpoch: 'embedding-fixture', sessionHandle: 'owner' }), { bindingId: 'embedding', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { assert.ok(active); } });
	const id = (name: string) => createHash('sha256').update(root + name).digest('hex').slice(0, 32);
	const entity = (name: string, kind: Entity['kind'], body: string): Entity => ({ id: id(name), kind, name, language: kind === 'document' ? 'markdown' : 'typescript', repoId: 1, repo: root, file: join(root, name + (kind === 'document' ? '.md' : '.ts')), startLine: 1, endLine: 1, body, embedding: [], indexedAt: '2026-10-26T00:00:00Z' });
	const doc = entity('saved-guide', 'document', 'SAVED_DOC_CONTROL describes schema and decisions'), file = entity('file', 'file', ''), fn = entity('fn', 'function', 'function fn() {}');
	await addRepo(null, { path: root, name: 'fixture', addedAt: 'now', status: 'ready' }); await upsertEntities(null, [doc, file, fn]); await upsertRelations(null, [{ kind: 'DEFINES', from: file.id, to: fn.id, resolved: true }]);
	let backendCalls = 0, onnxCalls = 0, injectedCalls = 0, vectorQueries = 0, reads = 0, logs = 0;
	const sdk = mock.method(Ollama.prototype, 'embed', async () => { backendCalls++; return { embeddings: [[1, 0]], model: 'fixture', total_duration: 1, load_duration: 1, prompt_eval_count: 1 }; });
	_setOnnxPipelineForTest(async () => { onnxCalls++; return { data: new Float32Array(768).fill(0.1) }; });
	_setVectorPassForTest({ embedQuery: async () => { injectedCalls++; return []; }, searchEntityVecs: async () => { vectorQueries++; return []; } });
	for (const tool of [docsRetrieveTool, docsProjectContextTool, docsSummaryGetTool, docsFamilyListTool, graphSearchTool, dataLineageTool]) registerTool(tool);
	const spies = ['tools-executor', 'embedder', 'onnx-embedder', 'analyze:docs-retrieval', 'daemon'].flatMap(name => { const logger = getLogger(name); return (['trace', 'debug', 'info', 'warn', 'error'] as const).map(level => mock.method(logger, level, () => { logs++; })); });
	const poison = new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; reads++; throw Error('CM_PRIVATE_EMBED_INPUT'); } });
	const args = new Proxy({ connectionExecution: execution }, { get(target, key) { if (key === 'connectionExecution') return target.connectionExecution; reads++; throw Error('CM_PRIVATE_EMBED_INPUT'); } });
	const deps = args as unknown as ToolDeps;
	const deny = (error: unknown) => connectionExecutionErrorCode(error) === 'unsupported-temporary';
	try {
		for (const backend of ['unknown', 'disabled', 'ollama', 'onnx'] as const) {
			setActiveEmbedderBackend(backend); logs = 0;
			const operations = [() => embedQuery(poison as never, execution), () => embedText(poison as never, execution), () => embedEntities(poison as never, { connectionExecution: execution }), () => onnxEmbedQuery(poison as never, execution), () => onnxEmbedDocument(poison as never, execution), () => onnxEmbedDocuments(poison as never, execution), () => isOnnxEmbedderAvailable(execution), () => Object.create(OllamaProvider.prototype).embed(poison, execution), () => Object.create(CliProvider.prototype).embed(poison, execution), () => retrieveDocSections(args as never), () => retrieveDocSectionsInRepo(root, 'CM_PRIVATE_QUERY', args), () => hydrateDocSection(null, poison as never, execution)];
			for (const tool of [docsRetrieveTool, docsProjectContextTool, docsSummaryGetTool, docsFamilyListTool, graphSearchTool, dataLineageTool]) operations.push(() => tool.execute(poison as never, deps) as never);
			for (const tool of [docsRetrieveTool, docsProjectContextTool, docsSummaryGetTool, docsFamilyListTool, graphSearchTool, dataLineageTool]) operations.push(() => executeTool(tool.id, poison as never, deps) as never);
			for (const operation of operations) await assert.rejects(async () => operation(), deny);
			assert.equal(backendCalls, 0); assert.equal(onnxCalls, 0); assert.equal(injectedCalls, 0); assert.equal(vectorQueries, 0); assert.equal(reads, 0); assert.equal(logs, 0);
		}
		// The real RPC table refuses before destructuring parameters or logging queries.
		const runtime = buildHandlerRuntime({ db: null, configStore: poison, queue: poison, indexer: poison, startedAt: 0, shutdown() { throw Error('unexpected shutdown'); }, attachedClients: () => [], understandingService: () => undefined } as never);
		for (const name of ['search.query', 'artifact.search', 'repo.search_cross_repo', 'session.search_turns', 'conversation.saveTurn', 'conversation.compact', 'config.search', 'config.resolveTemplate']) await assert.rejects(runtime.rpcHandlers[name]!(poison, { connectionExecution: execution }), deny);
		assert.equal(reads, 0); assert.equal(logs, 0); assert.equal(backendCalls, 0); assert.equal(vectorQueries, 0);
		await runWithConnectionExecution(execution, async () => {
			// Loss stays typed, and cannot return [] merely because a backend is disabled.
			setActiveEmbedderBackend('disabled'); logs = 0; await assert.rejects(embedQuery('private-without-policy'), error => connectionExecutionErrorCode(error) === 'session-expired');
			const structural = await graphQueryTool.execute({ op: 'defined_in', fileEntityId: file.id }, { connectionExecution: execution } as ToolDeps); assert.equal(structural.success, true); assert.equal((structural.data as { total: number }).total, 1);
		});
		// Real Saved keyword retrieval and both backend dispatch controls still work.
		setActiveEmbedderBackend('ollama'); assert.deepEqual(await embedQuery('SAVED_QUERY_CONTROL'), [1, 0]); assert.equal(backendCalls, 1);
		setActiveEmbedderBackend('onnx'); assert.equal((await embedQuery('SAVED_QUERY_CONTROL')).length, 768); assert.equal(onnxCalls, 1);
		const saved = await retrieveDocSections({ db: null, query: 'SAVED_DOC_CONTROL', closureRepos: [root] }); assert.equal(saved[0]!.entityId, doc.id); assert.equal(injectedCalls, 1);
		// A typed vector refusal must not become a successful lexical fallback, even
		// when the lexical corpus is warm and would otherwise produce a result.
		_setVectorPassForTest({ embedQuery: async () => { throw new ConnectionExecutionError('unsupported-temporary'); }, searchEntityVecs: async () => { vectorQueries++; return []; } }); logs = 0;
		await assert.rejects(retrieveDocSections({ db: null, query: 'SAVED_DOC_CONTROL', closureRepos: [root] }), deny); assert.equal(logs, 0); assert.equal(vectorQueries, 0);
		const direct = Object.assign(Object.create(OllamaProvider.prototype), { client: { async embed() { throw new ConnectionExecutionError('unsupported-temporary'); } } }); await assert.rejects(direct.embed('saved-typed-refusal'), deny);
		active = false; const before = backendCalls; await assert.rejects(embedQuery(poison as never, execution), error => connectionExecutionErrorCode(error) === 'session-expired'); assert.equal(backendCalls, before); assert.equal(reads, 0);
	} finally { for (const spy of spies) spy.mock.restore(); sdk.mock.restore(); _setVectorPassForTest(undefined); _setOnnxPipelineForTest(undefined); active = false; lifetime.abort(); lifetime.complete(); await lifetime.drained; await closeGraphStore(); await rm(root, { recursive: true, force: true }); }
});
