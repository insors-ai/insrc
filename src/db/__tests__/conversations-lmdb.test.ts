/**
 * Phase 2.6 tests for the LMDB-backed `db/conversations.ts`.
 *
 * Verifies the public surface preserves the prior DuckDB-backed
 * behaviour at the contract level. Embedding-based ops are expected
 * to return [] until Phase 3.3 wires LanceDB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	saveTurn,
	addCompactedTurns,
	saveSession,
	closeSession,
	setSessionAgent,
	setSessionStatus,
	bumpSessionActivity,
	deleteSession,
	deleteTurnsForSession,
	deleteSessionRecord,
	deleteSessionsForRepo,
	deleteTurnsForRepo,
	deleteTurnsByIds,
	pruneConversations,
	searchTurnsByRepo,
	seedFromPrior,
	getAllTurnsForRepo,
	getAllTurns,
	getConversationStats,
	getSessionById,
	getTurnsForSession,
	listSessions,
	listSessionRecords,
	resetTableCaches,
	type TurnRecord,
} from '../conversations.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-conversations-lmdb-2.6-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';

function makeTurn(overrides: Partial<TurnRecord> = {}): TurnRecord {
	return {
		sessionId: overrides.sessionId ?? 'sess-1',
		idx:       overrides.idx       ?? 0,
		user:      overrides.user      ?? 'hi',
		assistant: overrides.assistant ?? 'hello',
		entities:  overrides.entities  ?? [],
		vector:    overrides.vector    ?? [], // Lance not yet wired
		repo:      overrides.repo      ?? REPO,
		...(overrides.type           !== undefined ? { type:           overrides.type           } : {}),
		...(overrides.tier           !== undefined ? { tier:           overrides.tier           } : {}),
		...(overrides.compactedAt    !== undefined ? { compactedAt:    overrides.compactedAt    } : {}),
		...(overrides.sourceIds      !== undefined ? { sourceIds:      overrides.sourceIds      } : {}),
		...(overrides.createdAt      !== undefined ? { createdAt:      overrides.createdAt      } : {}),
		...(overrides.format         !== undefined ? { format:         overrides.format         } : {}),
		...(overrides.assertionRefs  !== undefined ? { assertionRefs:  overrides.assertionRefs  } : {}),
	};
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test('saveSession + getSessionById round-trip', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'hello' });
	const back = await getSessionById(null, 'sess-1');
	assert.ok(back);
	assert.equal(back.id, 'sess-1');
	assert.equal(back.repo, REPO);
	assert.equal(back.summary, 'hello');
	assert.equal(back.status, 'active');
	assert.equal(back.agent, 'chat');
	assert.deepEqual(back.vector, []); // Lance not yet wired
});

test('saveSession with explicit fields preserves them', async () => {
	await saveSession(null, {
		id: 'sess-1', repo: REPO, summary: 'hi',
		agent: 'pair', category: 'implementation', status: 'paused',
	});
	const back = await getSessionById(null, 'sess-1');
	assert.equal(back?.agent, 'pair');
	assert.equal(back?.category, 'implementation');
});

test('saveSession upsert preserves single row', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'first' });
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'second' });
	const back = await getSessionById(null, 'sess-1');
	assert.equal(back?.summary, 'second');
});

test('getSessionById on unknown id returns null', async () => {
	assert.equal(await getSessionById(null, 'no-such'), null);
});

test('setSessionAgent updates agent + category', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await setSessionAgent(null, 'sess-1', 'delegate', 'refactor');
	const back = await getSessionById(null, 'sess-1');
	assert.equal(back?.agent, 'delegate');
	assert.equal(back?.category, 'refactor');
});

test('setSessionStatus mutates only the status', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'x' });
	await setSessionStatus(null, 'sess-1', 'completed');
	const back = await getSessionById(null, 'sess-1');
	assert.equal(back?.status, 'completed');
});

test('bumpSessionActivity is silent no-op for unknown id', async () => {
	await bumpSessionActivity(null, 'no-such');
});

test('closeSession upserts the row + sets status=completed', async () => {
	await closeSession(null,
		{ id: 'sess-1', repo: REPO, summary: 'final', seenEntities: ['e1'] },
		[]);
	const back = await getSessionById(null, 'sess-1');
	assert.equal(back?.status, 'completed');
	assert.equal(back?.summary, 'final');
	assert.deepEqual(back?.seenEntities, ['e1']);
});

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

test('saveTurn + getTurnsForSession round-trip', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, makeTurn({ idx: 0, user: 'hi', assistant: 'hello' }));
	await saveTurn(null, makeTurn({ idx: 1, user: 'how are you', assistant: 'great' }));
	const turns = await getTurnsForSession(null, 'sess-1');
	assert.equal(turns.length, 2);
	assert.equal(turns[0]!.idx, 0);
	assert.equal(turns[1]!.idx, 1);
});

test('getTurnsForSession returns idx-ordered turns only of type "turn"', async () => {
	await saveTurn(null, makeTurn({ idx: 2, type: 'directive' })); // filtered
	await saveTurn(null, makeTurn({ idx: 0 }));
	await saveTurn(null, makeTurn({ idx: 1 }));
	const turns = await getTurnsForSession(null, 'sess-1');
	assert.deepEqual(turns.map(t => t.idx), [0, 1]);
});

test('saveTurn round-trips assertionRefs (G6 of memory-context design)', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, makeTurn({
		idx: 0,
		user: 'always include unit tests',
		assistant: 'noted',
		assertionRefs: ['agent:chat/user-assertions/t1::test-policy'],
	}));
	const turns = await getTurnsForSession(null, 'sess-1');
	assert.equal(turns.length, 1);
	assert.deepEqual([...turns[0]!.assertionRefs ?? []], ['agent:chat/user-assertions/t1::test-policy']);
});

test('saveTurn omits assertionRefs when not provided (back-compat)', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, makeTurn({ idx: 0, user: 'hi', assistant: 'hi' }));
	const turns = await getTurnsForSession(null, 'sess-1');
	assert.equal(turns.length, 1);
	assert.equal(turns[0]!.assertionRefs, undefined);
});

test('saveTurn upsert preserves single row by (sessionId, idx)', async () => {
	await saveTurn(null, makeTurn({ idx: 0, user: 'first' }));
	await saveTurn(null, makeTurn({ idx: 0, user: 'second' }));
	const turns = await getAllTurns(null);
	assert.equal(turns.length, 1);
	assert.equal(turns[0]!.user, 'second');
});

test('saveTurn bumps session lastActivityAt', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	const before = await getSessionById(null, 'sess-1');
	await new Promise(r => setTimeout(r, 5));
	await saveTurn(null, makeTurn());
	const after = await getSessionById(null, 'sess-1');
	assert.notEqual(after?.lastActivityAt, before?.lastActivityAt);
});

test('addCompactedTurns sets defaults: type=merged, tier=cold', async () => {
	await addCompactedTurns(null, [
		makeTurn({ idx: 0 }),
		makeTurn({ idx: 1 }),
	]);
	const all = await getAllTurns(null);
	assert.equal(all.length, 2);
	for (const t of all) {
		assert.equal(t.type, 'merged');
		assert.equal(t.tier, 'cold');
	}
});

test('addCompactedTurns on empty array is a no-op', async () => {
	await addCompactedTurns(null, []);
});

// ---------------------------------------------------------------------------
// Repo-scoped queries via the by_repo index
// ---------------------------------------------------------------------------

test('getAllTurnsForRepo returns only that repo\'s turns', async () => {
	await saveTurn(null, makeTurn({ sessionId: 's-a', idx: 0, repo: '/repo/a' }));
	await saveTurn(null, makeTurn({ sessionId: 's-a', idx: 1, repo: '/repo/a' }));
	await saveTurn(null, makeTurn({ sessionId: 's-b', idx: 0, repo: '/repo/b' }));
	const a = await getAllTurnsForRepo(null, '/repo/a');
	const b = await getAllTurnsForRepo(null, '/repo/b');
	assert.equal(a.length, 2);
	assert.equal(b.length, 1);
});

test('getAllTurns returns every turn across repos', async () => {
	await saveTurn(null, makeTurn({ sessionId: 's-a', idx: 0, repo: '/repo/a' }));
	await saveTurn(null, makeTurn({ sessionId: 's-b', idx: 0, repo: '/repo/b' }));
	const all = await getAllTurns(null);
	assert.equal(all.length, 2);
});

test('listSessions returns sessions in createdAt-desc order', async () => {
	const t0 = '2026-01-01T00:00:00.000Z';
	const t1 = '2026-05-01T00:00:00.000Z';
	await saveSession(null, { id: 'older', repo: REPO, summary: 'x' });
	// Adjust createdAt by re-writing through saveSession won't change it
	// (already set on first insert). Test ordering by checking newer is
	// listed before older.
	void t0; void t1;
	await new Promise(r => setTimeout(r, 5));
	await saveSession(null, { id: 'newer', repo: REPO, summary: 'y' });
	const list = await listSessions(null, REPO);
	assert.equal(list[0]!.id, 'newer');
	assert.equal(list[1]!.id, 'older');
});

test('listSessions filters by repo', async () => {
	await saveSession(null, { id: 'a', repo: '/repo/a', summary: '' });
	await saveSession(null, { id: 'b', repo: '/repo/b', summary: '' });
	const a = await listSessions(null, '/repo/a');
	assert.equal(a.length, 1);
	assert.equal(a[0]!.id, 'a');
});

test('listSessionRecords filters by status', async () => {
	await saveSession(null, { id: 'a1', repo: REPO, summary: '', status: 'active' });
	await saveSession(null, { id: 'c1', repo: REPO, summary: '', status: 'completed' });
	const onlyActive = await listSessionRecords(null, { repo: REPO, statuses: ['active'] });
	assert.equal(onlyActive.length, 1);
	assert.equal(onlyActive[0]!.id, 'a1');
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

test('getConversationStats counts turns + sessions', async () => {
	await saveSession(null, { id: 's-a', repo: '/repo/a', summary: '' });
	await saveSession(null, { id: 's-b', repo: '/repo/b', summary: '' });
	await saveTurn(null, makeTurn({ sessionId: 's-a', idx: 0, repo: '/repo/a', type: 'turn' }));
	await saveTurn(null, makeTurn({ sessionId: 's-a', idx: 1, repo: '/repo/a', type: 'directive' }));
	await saveTurn(null, makeTurn({ sessionId: 's-b', idx: 0, repo: '/repo/b', type: 'turn' }));

	const all = await getConversationStats(null);
	assert.equal(all.totalTurns, 3);
	assert.equal(all.sessions, 2);
	assert.equal(all.byType['turn'], 2);
	assert.equal(all.byType['directive'], 1);

	const a = await getConversationStats(null, '/repo/a');
	assert.equal(a.totalTurns, 2);
	assert.equal(a.sessions, 1);
});

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

test('deleteSession removes the session + all its turns', async () => {
	await saveSession(null, { id: 's-1', repo: REPO, summary: '' });
	await saveTurn(null, makeTurn({ sessionId: 's-1', idx: 0 }));
	await saveTurn(null, makeTurn({ sessionId: 's-1', idx: 1 }));
	const r = await deleteSession(null, 's-1');
	assert.equal(r.sessionRows, 1);
	assert.equal(r.turnRows, 2);
	assert.equal(await getSessionById(null, 's-1'), null);
	assert.equal((await getTurnsForSession(null, 's-1')).length, 0);
});

test('deleteSession on unknown id returns 0/0', async () => {
	const r = await deleteSession(null, 'no-such');
	assert.deepEqual(r, { sessionRows: 0, turnRows: 0 });
});

test('deleteTurnsForSession removes all turns, leaves session', async () => {
	await saveSession(null, { id: 's-1', repo: REPO, summary: '' });
	await saveTurn(null, makeTurn({ idx: 0 }));
	await saveTurn(null, makeTurn({ idx: 1 }));
	await deleteTurnsForSession(null, 's-1');
	assert.equal((await getTurnsForSession(null, 's-1')).length, 0);
	assert.ok(await getSessionById(null, 's-1'));
});

test('deleteSessionRecord removes only the session row', async () => {
	await saveSession(null, { id: 's-1', repo: REPO, summary: '' });
	await deleteSessionRecord(null, 's-1');
	assert.equal(await getSessionById(null, 's-1'), null);
});

test('deleteSessionsForRepo removes only that repo\'s sessions', async () => {
	await saveSession(null, { id: 'a', repo: '/repo/a', summary: '' });
	await saveSession(null, { id: 'b', repo: '/repo/b', summary: '' });
	await deleteSessionsForRepo(null, '/repo/a');
	assert.equal(await getSessionById(null, 'a'), null);
	assert.ok(await getSessionById(null, 'b'));
});

test('deleteTurnsForRepo removes only that repo\'s turns', async () => {
	await saveTurn(null, makeTurn({ sessionId: 'a', idx: 0, repo: '/repo/a' }));
	await saveTurn(null, makeTurn({ sessionId: 'b', idx: 0, repo: '/repo/b' }));
	await deleteTurnsForRepo(null, '/repo/a');
	const all = await getAllTurns(null);
	assert.equal(all.length, 1);
	assert.equal(all[0]!.repo, '/repo/b');
});

test('deleteTurnsByIds removes the specific turns', async () => {
	await saveTurn(null, makeTurn({ idx: 0 }));
	await saveTurn(null, makeTurn({ idx: 1 }));
	await saveTurn(null, makeTurn({ idx: 2 }));
	await deleteTurnsByIds(null, ['sess-1:0', 'sess-1:2']);
	const remaining = await getAllTurns(null);
	assert.equal(remaining.length, 1);
	assert.equal(remaining[0]!.idx, 1);
});

test('deleteTurnsByIds on empty list is a no-op', async () => {
	await deleteTurnsByIds(null, []);
});

// ---------------------------------------------------------------------------
// Vector search stubs
// ---------------------------------------------------------------------------

test('searchTurnsByRepo returns [] (Phase 3.3 wires Lance)', async () => {
	await saveTurn(null, makeTurn());
	const r = await searchTurnsByRepo(null, REPO, [1, 2, 3], 5);
	assert.deepEqual(r, []);
});

test('seedFromPrior returns [] (Phase 3.3 wires Lance)', async () => {
	await saveSession(null, { id: 's-1', repo: REPO, summary: '' });
	const r = await seedFromPrior(null, REPO, [1, 2, 3], 3);
	assert.deepEqual(r, []);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('sessions + turns survive close + reopen', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'x' });
	await saveTurn(null, makeTurn());
	await closeGraphStore();
	const back = await getSessionById(null, 'sess-1');
	assert.ok(back);
	const turns = await getTurnsForSession(null, 'sess-1');
	assert.equal(turns.length, 1);
});

test('resetTableCaches is a no-op (back-compat shim)', () => {
	resetTableCaches();
});

