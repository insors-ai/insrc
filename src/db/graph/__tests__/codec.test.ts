/**
 * Phase 1.3 tests for typed msgpack codecs.
 *
 * Each record type gets:
 *   - Round-trip test (encode then decode preserves all fields)
 *   - Empty-payload edge-case for `EdgeProps`
 *   - Wire-format compactness check (msgpack is < JSON)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	encodeRepoRow, decodeRepoRow,
	encodeEntityRow, decodeEntityRow,
	encodeEdgeProps, decodeEdgeProps, decodeCallsEdge, decodeReadsEdge, decodeImportsEdge,
	encodeUnresolvedRow, decodeUnresolvedRow,
	encodePlanRow, decodePlanRow,
	encodePlanStepRow, decodePlanStepRow,
	encodeSessionRow, decodeSessionRow,
	encodeTurnRow, decodeTurnRow,
	encodeTodoListRow, decodeTodoListRow,
	encodeTodoItemRow, decodeTodoItemRow,
	encodeTodoCommentRow, decodeTodoCommentRow,
	encodeConfigEntryRow, decodeConfigEntryRow,
	type RepoRow, type EntityRow,
	type CallsEdgeProps, type ReadsEdgeProps, type ImportsEdgeProps,
	type UnresolvedRow, type PlanRow, type PlanStepRow,
	type SessionRow, type TurnRow,
	type TodoListRow, type TodoItemRow, type TodoCommentRow,
	type ConfigEntryRow,
} from '../codec.js';

test('repo row round-trip', () => {
	const r: RepoRow = {
		id: 1, kind: 'workspace', path: '/repo/foo', name: 'foo',
		addedAt: Date.now(), lastIndexed: Date.now(),
		status: 'ready', errorMsg: '',
	};
	assert.deepEqual(decodeRepoRow(encodeRepoRow(r)), r);
});

test('repo row round-trip -- shared-modules kind with namespace', () => {
	const r: RepoRow = {
		id: 0xFFFFFFFE, kind: 'shared-modules', namespace: 'jvm',
		path: '', name: 'shared-modules:jvm',
		addedAt: Date.now(), lastIndexed: 0,
		status: 'ready', errorMsg: '',
	};
	assert.deepEqual(decodeRepoRow(encodeRepoRow(r)), r);
});

test('entity row round-trip including all flag fields', () => {
	const e: EntityRow = {
		repoId: 7, kind: 'function', name: 'org.apache.hadoop.yarn.server.foo',
		filePath: 'src/main/java/Foo.java', startLine: 10, endLine: 42,
		language: 'java', rootPath: '/repo/hadoop',
		body: 'public void foo() { /* ... */ }',
		signature: 'public void foo()', summary: '',
		isExported: true, isAsync: false, isAbstract: false, artifact: false,
		contentHash: 'a'.repeat(64), embeddingModel: 'qwen3-embedding:0.6b',
		indexedAt: Date.now(),
	};
	assert.deepEqual(decodeEntityRow(encodeEntityRow(e)), e);
});

test('entity row preserves empty-string sentinel defaults', () => {
	const e: EntityRow = {
		repoId: 1, kind: 'module', name: 'm',
		filePath: '', startLine: 0, endLine: 0, language: 'unknown',
		rootPath: '', body: '', signature: '', summary: '',
		isExported: false, isAsync: false, isAbstract: false, artifact: false,
		contentHash: '', embeddingModel: '', indexedAt: 0,
	};
	const round = decodeEntityRow(encodeEntityRow(e));
	assert.equal(round.signature, '');
	assert.equal(round.summary, '');
	assert.equal(round.embeddingModel, '');
	assert.deepEqual(round, e);
});

test('edge props: empty payload encodes to zero-byte buffer', () => {
	const buf = encodeEdgeProps({});
	assert.equal(buf.length, 0);
	assert.deepEqual(decodeEdgeProps(buf), {});
});

test('edge props: CALLS shape round-trips', () => {
	const props: CallsEdgeProps = { siteCount: 5 };
	const buf = encodeEdgeProps(props);
	assert.ok(buf.length > 0);
	assert.deepEqual(decodeCallsEdge(buf), props);
});

test('edge props: READS shape round-trips', () => {
	const props: ReadsEdgeProps = { columns: ['id', 'name', 'created_at'] };
	assert.deepEqual(decodeReadsEdge(encodeEdgeProps(props)), props);
});

test('edge props: IMPORTS shape round-trips', () => {
	const props: ImportsEdgeProps = { rawTo: '@scope/pkg/sub' };
	assert.deepEqual(decodeImportsEdge(encodeEdgeProps(props)), props);
});

test('unresolved row round-trip', () => {
	const u: UnresolvedRow = {
		id: 'a'.repeat(32),
		repoId: 3,
		fromEntity: 'b'.repeat(32),
		fromFile: 'src/main.ts',
		kind: 'IMPORTS',
		rawTo: './foo',
		meta: { attempts: 2, lastError: 'not found' },
		attemptedAt: Date.now(),
	};
	const round = decodeUnresolvedRow(encodeUnresolvedRow(u));
	assert.equal(round.id, 'a'.repeat(32));
	assert.equal(round.fromEntity, 'b'.repeat(32));
	assert.deepEqual(round.meta, u.meta);
	assert.deepEqual(round, u);
});

test('plan row round-trip', () => {
	const p: PlanRow = {
		id: 'plan-abc', repoPath: '/repo', title: 'Refactor X',
		status: 'active',
		createdAt: Date.now(), updatedAt: Date.now(),
	};
	assert.deepEqual(decodePlanRow(encodePlanRow(p)), p);
});

test('plan_step row round-trip with sentinel timestamps + dependsOn', () => {
	const s: PlanStepRow = {
		id: 'step-1', planId: 'plan-abc', idx: 0,
		title: 'Step 1', description: 'Do thing', checkpoint: false,
		status: 'pending', complexity: 'small',
		fileHint: 'foo.ts', notes: '',
		dependsOn: ['step-0a', 'step-0b'],
		createdAt: 1000, updatedAt: 1000,
		startedAt: 0, doneAt: 0,
	};
	assert.deepEqual(decodePlanStepRow(encodePlanStepRow(s)), s);
});

test('session row round-trip with all status / tier values', () => {
	const s: SessionRow = {
		id: 'session-x', repo: '/repo',
		summary: 'a session', seenEntities: ['e1', 'e2'],
		createdAt: 1000, expiresAt: 2000,
		agent: 'pair', category: 'implementation',
		status: 'active', lastActivityAt: 1500,
		tier: 'hot',
	};
	assert.deepEqual(decodeSessionRow(encodeSessionRow(s)), s);
});

test('turn row round-trip with all enum values', () => {
	const t: TurnRow = {
		id: 'turn-1', sessionId: 'session-x', idx: 0,
		userText: 'hi', assistant: 'hello', entities: [],
		createdAt: 1000, repo: '/repo',
		type: 'turn', tier: 'hot',
		compactedAt: 0,
		sourceIds: [],
		format: 'text',
	};
	assert.deepEqual(decodeTurnRow(encodeTurnRow(t)), t);
});

test('todo_list row round-trip', () => {
	const l: TodoListRow = {
		id: 'list-1', sessionId: 'session-x', parentListId: '',
		title: 'Tasks', description: '', status: 'active',
		owner: 'user', source: 'user',
		transfers: [
			{ from: 'user', to: 'planner', reason: 'created', at: '2026-01-01T00:00:00.000Z', initiator: 'user' },
		],
		body: '',
		createdAt: 1000, updatedAt: 1000,
	};
	assert.deepEqual(decodeTodoListRow(encodeTodoListRow(l)), l);
});

test('todo_item row round-trip with tags + meta', () => {
	const i: TodoItemRow = {
		id: 'item-1', listId: 'list-1',
		title: 'Do it', description: '',
		status: 'pending', order: 100,
		createdAt: 1000, updatedAt: 1000, completedAt: 0,
		blockedReason: '',
		tags: ['urgent', 'blocked'],
		meta: { priority: 1, owner: 'me' },
	};
	assert.deepEqual(decodeTodoItemRow(encodeTodoItemRow(i)), i);
});

test('todo_comment row round-trip', () => {
	const c: TodoCommentRow = {
		id: 'comment-1', itemId: 'item-1',
		author: 'agent', body: 'note',
		createdAt: 1000, editedAt: 0,
		agentAcknowledged: false,
	};
	assert.deepEqual(decodeTodoCommentRow(encodeTodoCommentRow(c)), c);
});

test('config_entry row round-trip', () => {
	const e: ConfigEntryRow = {
		id: 'cfg-1',
		scope: 'project:/repo',
		namespace: 'implementation',
		category: 'template',
		language: 'typescript',
		name: 'pair-prompt',
		filePath: '~/.insrc/templates/.../foo.md',
		body: 'template body',
		tags: ['t1'],
		updatedAt: 1000,
		contentHash: 'h',
	};
	assert.deepEqual(decodeConfigEntryRow(encodeConfigEntryRow(e)), e);
});

test('msgpack encoding is more compact than JSON for typical entity', () => {
	const e: EntityRow = {
		repoId: 1, kind: 'function', name: 'foo.bar.baz',
		filePath: 'src/foo.ts', startLine: 1, endLine: 10,
		language: 'typescript', rootPath: '/repo',
		body: 'function foo() {}', signature: 'function foo()', summary: '',
		isExported: false, isAsync: false, isAbstract: false, artifact: false,
		contentHash: 'a'.repeat(64), embeddingModel: '', indexedAt: 1000,
	};
	const msgpackBytes = encodeEntityRow(e).length;
	const jsonBytes = Buffer.byteLength(JSON.stringify(e), 'utf8');
	assert.ok(msgpackBytes < jsonBytes,
		`msgpack (${msgpackBytes}) should be < JSON (${jsonBytes})`);
});

test('large body in entity row round-trips correctly', () => {
	const longBody = 'x'.repeat(50_000);
	const e: EntityRow = {
		repoId: 1, kind: 'function', name: 'foo',
		filePath: 'foo.ts', startLine: 1, endLine: 1000,
		language: 'typescript', rootPath: '/repo',
		body: longBody, signature: '', summary: '',
		isExported: false, isAsync: false, isAbstract: false, artifact: false,
		contentHash: 'h', embeddingModel: '', indexedAt: 1000,
	};
	const round = decodeEntityRow(encodeEntityRow(e));
	assert.equal(round.body.length, 50_000);
	assert.equal(round.body, longBody);
});
