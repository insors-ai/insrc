/**
 * Tests for daemon/db/registry.ts -- in-memory driver registry.
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	_resetRegistryForTests,
	familyOf,
	getFactory,
	kindExists,
	listRegisteredKinds,
	registerDriver,
	unregisterDriver,
} from '../registry.js';
import type { Driver, DriverFactory } from '../../../shared/db-driver.js';

// Minimal factory stub -- the registry never calls it in these tests.
const stubFactory: DriverFactory = async () => ({} as Driver);

describe('registry', () => {
	beforeEach(() => { _resetRegistryForTests(); });

	it('registers + exposes kind + family + factory', () => {
		registerDriver({ kind: 'postgres', family: 'rdbms', factory: stubFactory });
		assert.equal(kindExists('postgres'), true);
		assert.equal(familyOf('postgres'), 'rdbms');
		assert.equal(getFactory('postgres'), stubFactory);
	});

	it('returns undefined for unknown kinds', () => {
		assert.equal(kindExists('no-such-kind'), false);
		assert.equal(familyOf('no-such-kind'), undefined);
		assert.equal(getFactory('no-such-kind'), undefined);
	});

	it('replaces a previously registered kind', () => {
		registerDriver({ kind: 'redis', family: 'kv', factory: stubFactory });
		const replacement: DriverFactory = async () => ({ id: 'x' } as Driver);
		registerDriver({ kind: 'redis', family: 'kv', factory: replacement });
		assert.equal(getFactory('redis'), replacement);
	});

	it('unregisterDriver removes a kind', () => {
		registerDriver({ kind: 'csv', family: 'file', factory: stubFactory });
		unregisterDriver('csv');
		assert.equal(kindExists('csv'), false);
	});

	it('listRegisteredKinds returns all registrations', () => {
		registerDriver({ kind: 'postgres', family: 'rdbms', factory: stubFactory });
		registerDriver({ kind: 'redis', family: 'kv', factory: stubFactory });
		registerDriver({ kind: 'csv', family: 'file', factory: stubFactory });
		const entries = listRegisteredKinds();
		assert.equal(entries.length, 3);
		const byKind = new Map(entries.map(e => [e.kind, e.family]));
		assert.equal(byKind.get('postgres'), 'rdbms');
		assert.equal(byKind.get('redis'), 'kv');
		assert.equal(byKind.get('csv'), 'file');
	});
});
