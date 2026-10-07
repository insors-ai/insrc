/**
 * The planning call's user turn, built from the RESOLVED scope: the
 * directory the lookups run in, and -- for a scope narrower than a
 * directory -- one line naming the file, the entity or the connection.
 *
 * The real planning prompt is read from disk; the provider is a
 * stand-in. No LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { decompose, prepareDecompose } from '../decomposer.js';
import type { ResolvedScope } from '../scope.js';

const REPO = '/work/app';
const FILE = `${REPO}/src/pay.ts`;

function intent(kind: ClassifiedIntent['scopeRef']['kind'], value: string): ClassifiedIntent {
	return { target: 'code', scope: 'M', focused: true, focus: 'how does settlement work', scopeRef: { kind, value }, reasoning: 'test' };
}

const MODULE:     ResolvedScope = { kind: 'module', value: `${REPO}/src/billing`, repoPath: REPO, lookupPath: `${REPO}/src/billing` };
const A_FILE:     ResolvedScope = { kind: 'file', value: FILE, repoPath: REPO, lookupPath: REPO, filePath: FILE };
const A_SYMBOL:   ResolvedScope = { kind: 'symbol', value: `${FILE}#settle`, repoPath: REPO, lookupPath: REPO, filePath: FILE, entityId: 'e1', entityName: 'settle' };
const CONNECTION: ResolvedScope = { kind: 'connection', value: 'ledger-db', repoPath: REPO, lookupPath: REPO, connectionId: 'ledger-db' };

function lines(userTurn: string): string[] {
	return userTurn.split('\n');
}

test("planning user turn: 'Repo path' from lookupPath, and the line naming a file, entity or connection", () => {
	// A module: the 'Repo path' line is the module's own directory, as
	// it was when the raw value was printed. No further line.
	const mod = prepareDecompose(intent('module', MODULE.value), MODULE).userTurn;
	assert.ok(lines(mod).includes(`Repo path: ${REPO}/src/billing`), mod);
	assert.ok(!lines(mod).includes(`Repo path: ${REPO}`), 'not the repo root');
	assert.ok(!mod.includes('\nScope: '), 'a directory scope has no further line');

	// The same holds for every directory kind.
	for (const kind of ['repo', 'manifest-dir', 'workspace'] as const) {
		const scope: ResolvedScope = { kind, value: `${REPO}/x`, repoPath: REPO, lookupPath: `${REPO}/x` };
		const turn = prepareDecompose(intent(kind, scope.value), scope).userTurn;
		assert.ok(lines(turn).includes(`Repo path: ${REPO}/x`), kind);
		assert.ok(!turn.includes('\nScope: '), kind);
	}

	// A file: lookups run in the repo; the file is named on its own line.
	const file = prepareDecompose(intent('file', FILE), A_FILE).userTurn;
	assert.ok(lines(file).includes(`Repo path: ${REPO}`), file);
	assert.ok(lines(file).includes(`Scope: the file ${FILE}`), file);
	// The raw value is NOT printed as the repo path.
	assert.ok(!lines(file).includes(`Repo path: ${FILE}`));

	// A symbol: the entity and its file.
	const symbol = prepareDecompose(intent('symbol', A_SYMBOL.value), A_SYMBOL).userTurn;
	assert.ok(lines(symbol).includes(`Repo path: ${REPO}`), symbol);
	assert.ok(lines(symbol).includes(`Scope: the entity 'settle' in the file ${FILE}`), symbol);
	assert.ok(!lines(symbol).includes(`Repo path: ${FILE}#settle`));

	// A connection: its repo, and the connection by id.
	const conn = prepareDecompose({ ...intent('connection', 'ledger-db'), target: 'data' }, CONNECTION).userTurn;
	assert.ok(lines(conn).includes(`Repo path: ${REPO}`), conn);
	assert.ok(lines(conn).includes("Scope: the data connection 'ledger-db'"), conn);
	assert.ok(!lines(conn).includes('Repo path: ledger-db'));
});

test('the scope line sits directly under the repo path line', () => {
	const turn = lines(prepareDecompose(intent('file', FILE), A_FILE).userTurn);
	const at = turn.indexOf(`Repo path: ${REPO}`);
	assert.notEqual(at, -1);
	assert.equal(turn[at + 1], `Scope: the file ${FILE}`);
});

test('prepareDecompose and decompose build the same user turn for a resolved scope', async () => {
	for (const [i, scope] of [
		[intent('module', MODULE.value), MODULE],
		[intent('file', FILE), A_FILE],
		[intent('symbol', A_SYMBOL.value), A_SYMBOL],
		[{ ...intent('connection', 'ledger-db'), target: 'data' as const }, CONNECTION],
	] as const) {
		let sent: LLMMessage[] | undefined;
		const provider = {
			completeStructured: async (messages: LLMMessage[]) => {
				sent = messages;
				return { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [] };
			},
		} as unknown as LLMProvider;
		await decompose({ intent: i, runId: 'r', scope, provider });
		const prepared = prepareDecompose(i, scope);
		assert.ok(sent !== undefined);
		assert.equal(sent![0]!.content, prepared.systemPrompt, scope.kind);
		assert.equal(sent![1]!.content, prepared.userTurn, scope.kind);
	}
});
