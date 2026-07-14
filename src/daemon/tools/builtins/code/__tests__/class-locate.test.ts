/**
 * Tests for `code_class_locate` (code-analyzer-skills.md Phase 0.1).
 *
 * Two layers:
 *
 *   1. Pure helpers: similarityScore / levenshtein / commonPrefixLen
 *      -- ranking math, no graph access.
 *
 *   2. End-to-end against an in-memory LMDB graph: spin up a tmpdir
 *      env, register a repo, upsert class / interface / type entities,
 *      register the tool, exercise execute() over the typed-refusal
 *      contract:
 *        - exact hit -> { found: true, entityId, path, ... }
 *        - typo near a real class -> { found: false, nearest: [...] }
 *        - missing class with no neighbours -> { found: false, nearest: [] }
 *        - empty className -> success: false
 *        - language filter narrows multi-language hits
 *        - repoPath filter narrows multi-repo hits
 *        - kind coverage: interfaces and types resolve too
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../../db/graph/store.js';
import { upsertEntities } from '../../../../../db/entities.js';
import { addRepo } from '../../../../../db/repos.js';
import { _resetRegistryForTests, getTool } from '../../../registry.js';
import {
	registerCodeClassLocateTool,
	_similarityScoreForTest as similarityScore,
	_levenshteinForTest as levenshtein,
	_commonPrefixLenForTest as commonPrefixLen,
} from '../class-locate.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import type { Entity, EntityKind, Language } from '../../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('levenshtein: identity is 0', () => {
	assert.equal(levenshtein('Foo', 'Foo'), 0);
});

test('levenshtein: single-char swap is 1', () => {
	assert.equal(levenshtein('Foo', 'Fop'), 1);
});

test('levenshtein: empty vs N is N', () => {
	assert.equal(levenshtein('', 'abcde'), 5);
	assert.equal(levenshtein('abcde', ''), 5);
});

test('commonPrefixLen: counts matching prefix', () => {
	assert.equal(commonPrefixLen('purchaseOrder', 'purchaseOrders'), 13);
	assert.equal(commonPrefixLen('foo', 'bar'), 0);
});

test('similarityScore: identity returns 1', () => {
	assert.equal(similarityScore('foo', 'foo'), 1);
});

test('similarityScore: total mismatch (long edits) returns 0', () => {
	// Far-apart strings -- distance > 60% of max length -> 0.
	assert.equal(similarityScore('xx', 'completelydifferent'), 0);
});

test('similarityScore: typo (one trailing char) ranks above unrelated', () => {
	const close = similarityScore('inpurchaseorder', 'inpurchaseorders');
	const farish = similarityScore('inpurchaseorder', 'invoiceorder');
	assert.ok(close > farish, `close=${close} should be > farish=${farish}`);
	assert.ok(close > 0.85, `close=${close} should be high (typo)`);
});

test('similarityScore: shared prefix outranks shared suffix', () => {
	// With prefix-overlap bonus, 'PurchaseOrder' should beat
	// 'OtherPurchaseOrder' against target 'PurchaseOrders'.
	const prefix = similarityScore('purchaseorders', 'purchaseorder');
	const suffix = similarityScore('purchaseorders', 'otherpurchaseorder');
	assert.ok(prefix > suffix, `prefix=${prefix} should beat suffix=${suffix}`);
});

// ---------------------------------------------------------------------------
// End-to-end -- tool execute() against an in-memory LMDB graph
// ---------------------------------------------------------------------------

const REPO_A = '/repo/alpha';
const REPO_B = '/repo/beta';

let dir: string;
let tool: Tool;

const stubDeps = {
	session: {} as ToolDeps['session'],
	send: () => { /* drop */ },
	requestId: 0,
} as unknown as ToolDeps;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeClassEntity(
	name: string,
	opts: {
		repo?: string;
		file?: string;
		kind?: EntityKind;
		language?: Language;
		startLine?: number;
		isAbstract?: boolean;
	} = {},
): Entity {
	const repo = opts.repo ?? REPO_A;
	const file = opts.file ?? `${repo}/src/${name}.ts`;
	const kind = opts.kind ?? 'class';
	const language = opts.language ?? 'typescript';
	const e: Entity = {
		id:        makeEntityId(repo, file, kind, name),
		kind,
		name,
		language,
		repoId:    1,
		repo,
		file,
		startLine: opts.startLine ?? 10,
		endLine:   (opts.startLine ?? 10) + 20,
		body:      `class ${name} {}`,
		embedding: [],
		indexedAt: '2026-05-09T10:00:00.000Z',
	};
	if (opts.isAbstract === true) e.isAbstract = true;
	return e;
}

test.beforeEach(async () => {
	await closeGraphStore();
	_resetRegistryForTests();
	dir = mkdtempSync(join(tmpdir(), 'insrc-class-locate-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const now = new Date().toISOString();
	for (const path of [REPO_A, REPO_B]) {
		await addRepo(null, { path, name: '', addedAt: now, status: 'pending' });
	}
	registerCodeClassLocateTool();
	const t = getTool('code_class_locate');
	assert.ok(t, 'code_class_locate must be registered');
	tool = t;
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('execute: empty className returns 400-shape error', async () => {
	const r: ToolResult = await tool.execute({ className: '' }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /className is required/);
});

test('execute: exact hit returns { found: true } with location metadata', async () => {
	const e = makeClassEntity('PurchaseOrder', { startLine: 42 });
	await upsertEntities(null, [e]);

	const r = await tool.execute({ className: 'PurchaseOrder' }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], true);
	assert.equal(data['entityId'], e.id);
	assert.equal(data['path'], e.file);
	assert.equal(data['line'], 42);
	assert.equal(data['language'], 'typescript');
	assert.equal(data['kind'], 'class');
	assert.equal(data['isAbstract'], undefined);
});

test('execute: abstract class surfaces isAbstract flag', async () => {
	const e = makeClassEntity('BaseHandler', { isAbstract: true });
	await upsertEntities(null, [e]);

	const r = await tool.execute({ className: 'BaseHandler' }, stubDeps);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], true);
	assert.equal(data['isAbstract'], true);
});

test('execute: interface and type kinds also resolve', async () => {
	const iface = makeClassEntity('Loggable', { kind: 'interface' });
	const ty    = makeClassEntity('UserId',   { kind: 'type' });
	await upsertEntities(null, [iface, ty]);

	const ri = await tool.execute({ className: 'Loggable' }, stubDeps);
	assert.equal((ri.data as Record<string, unknown>)['kind'], 'interface');

	const rt = await tool.execute({ className: 'UserId' }, stubDeps);
	assert.equal((rt.data as Record<string, unknown>)['kind'], 'type');
});

test('execute: typo near a real class returns { found: false, nearest } with the real class first', async () => {
	const real = makeClassEntity('INPurchaseOrder');
	await upsertEntities(null, [real]);

	const r = await tool.execute({ className: 'INPurchaseOrders' }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], false);
	const nearest = data['nearest'] as { className: string; score: number; entityId: string }[];
	assert.ok(Array.isArray(nearest));
	assert.ok(nearest.length >= 1, 'should suggest at least one nearest class');
	assert.equal(nearest[0]!.className, 'INPurchaseOrder');
	assert.equal(nearest[0]!.entityId, real.id);
	assert.ok(nearest[0]!.score > 0.8);
});

test('execute: missing class with no neighbours returns { found: false, nearest: [] }', async () => {
	// Empty graph (no entities upserted) -> nothing to suggest.
	const r = await tool.execute({ className: 'TotallyAbsent' }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], false);
	assert.deepEqual(data['nearest'], []);
});

test('execute: language filter excludes other-language matches', async () => {
	// Same name in two languages -- filter narrows to one.
	const tsClass = makeClassEntity('Order', {
		language: 'typescript', file: `${REPO_A}/src/Order.ts`,
	});
	const javaClass = makeClassEntity('Order', {
		language: 'java',       file: `${REPO_A}/src/Order.java`,
	});
	await upsertEntities(null, [tsClass, javaClass]);

	const rj = await tool.execute({ className: 'Order', language: 'java' }, stubDeps);
	const dj = rj.data as Record<string, unknown>;
	assert.equal(dj['found'], true);
	assert.equal(dj['language'], 'java');
	assert.equal(dj['entityId'], javaClass.id);

	const rt = await tool.execute({ className: 'Order', language: 'typescript' }, stubDeps);
	const dt = rt.data as Record<string, unknown>;
	assert.equal(dt['found'], true);
	assert.equal(dt['language'], 'typescript');
	assert.equal(dt['entityId'], tsClass.id);
});

test('execute: repoPath filter narrows to a single repo', async () => {
	const inA = makeClassEntity('Shared', { repo: REPO_A, file: `${REPO_A}/src/Shared.ts` });
	const inB = makeClassEntity('Shared', { repo: REPO_B, file: `${REPO_B}/src/Shared.ts` });
	await upsertEntities(null, [inA, inB]);

	const rA = await tool.execute({ className: 'Shared', repoPath: REPO_A }, stubDeps);
	const dA = rA.data as Record<string, unknown>;
	assert.equal(dA['found'], true);
	assert.equal(dA['entityId'], inA.id);

	const rB = await tool.execute({ className: 'Shared', repoPath: REPO_B }, stubDeps);
	const dB = rB.data as Record<string, unknown>;
	assert.equal(dB['found'], true);
	assert.equal(dB['entityId'], inB.id);
});

test('execute: unknown repoPath returns { found: false, nearest: [] }', async () => {
	await upsertEntities(null, [makeClassEntity('Foo')]);

	const r = await tool.execute(
		{ className: 'Foo', repoPath: '/repo/never-registered' },
		stubDeps,
	);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], false);
	assert.deepEqual(data['nearest'], []);
});

// ---- Plan SCS Phase 3: multi-repo `repos` filter ----

test('execute: `repos` filter scopes to the listed workspace repos', async () => {
	const inA = makeClassEntity('Shared', { repo: REPO_A, file: `${REPO_A}/src/Shared.ts` });
	const inB = makeClassEntity('Shared', { repo: REPO_B, file: `${REPO_B}/src/Shared.ts` });
	await upsertEntities(null, [inA, inB]);

	// Only REPO_A in the filter -> finds the A copy.
	const r = await tool.execute({ className: 'Shared', repos: [REPO_A] }, stubDeps);
	const d = r.data as Record<string, unknown>;
	assert.equal(d['found'], true);
	assert.equal(d['entityId'], inA.id);
});

test('execute: `repos` and `repoPath` together -> error', async () => {
	const r = await tool.execute(
		{ className: 'Shared', repoPath: REPO_A, repos: [REPO_A, REPO_B] },
		stubDeps,
	);
	// fail() shape: success=false + error message
	assert.equal(r.success, false);
	assert.match(String(r.error ?? r.output ?? ''), /either `repoPath` \(single\) or `repos` \(multi\)/);
});

test('execute: empty `repos` array short-circuits to { found: false, nearest: [] }', async () => {
	await upsertEntities(null, [makeClassEntity('Foo')]);
	const r = await tool.execute({ className: 'Foo', repos: [] }, stubDeps);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], false);
	assert.deepEqual(data['nearest'], []);
});

test('execute: `repos` with unknown paths drops them silently', async () => {
	const inA = makeClassEntity('Shared', { repo: REPO_A, file: `${REPO_A}/src/Shared.ts` });
	await upsertEntities(null, [inA]);

	const r = await tool.execute(
		{ className: 'Shared', repos: [REPO_A, '/repo/never-registered'] },
		stubDeps,
	);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], true);
	assert.equal(data['entityId'], inA.id);
});

test('execute: nearest dedupes same name across repos', async () => {
	// 'PurchaseOrder' exists in both repos. Typo target should
	// suggest it once, not twice.
	const a = makeClassEntity('PurchaseOrder', { repo: REPO_A, file: `${REPO_A}/src/PurchaseOrder.ts` });
	const b = makeClassEntity('PurchaseOrder', { repo: REPO_B, file: `${REPO_B}/src/PurchaseOrder.ts` });
	await upsertEntities(null, [a, b]);

	const r = await tool.execute({ className: 'PurchaseOrders' }, stubDeps);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['found'], false);
	const nearest = data['nearest'] as { className: string }[];
	const names = nearest.map(n => n.className);
	assert.equal(names.filter(n => n === 'PurchaseOrder').length, 1,
		'PurchaseOrder should be deduped to a single suggestion');
});
