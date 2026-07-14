/**
 * Tests for daemon/db/secrets.ts -- `${secret:<ref>}` resolution +
 * URL-password redaction.
 *
 * We swap in an in-memory fake keystore via the module's
 * `_setKeystoreForTests` hook so tests don't touch the real OS
 * keychain. (`mock.method` against the keystore namespace doesn't
 * work in strict ESM -- exports are non-configurable.)
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

import { _setKeystoreForTests, extractUrlPassword, makeSecretRef, resolveSecrets } from '../secrets.js';

const store = new Map<string, string>();

_setKeystoreForTests({
	getKey:    async (name: string) => store.get(name) ?? null,
	setKey:    async (name: string, value: string) => { store.set(name, value); },
	deleteKey: async (name: string) => { store.delete(name); },
});

// ---------------------------------------------------------------------------
// makeSecretRef
// ---------------------------------------------------------------------------

describe('makeSecretRef', () => {
	it('follows the db:<repoId>:<connId> convention', () => {
		assert.equal(makeSecretRef('abc', 'primary'), 'db:abc:primary');
	});
});

// ---------------------------------------------------------------------------
// resolveSecrets
// ---------------------------------------------------------------------------

describe('resolveSecrets', () => {
	beforeEach(() => { store.clear(); });

	it('returns the value unchanged when no tokens present', async () => {
		const out = await resolveSecrets('postgres://user@host/db');
		assert.equal(out, 'postgres://user@host/db');
	});

	it('substitutes a single token', async () => {
		store.set('db:r1:c1', 'p@ssw0rd');
		const out = await resolveSecrets('postgres://user:${secret:db:r1:c1}@host/db');
		assert.equal(out, 'postgres://user:p@ssw0rd@host/db');
	});

	it('substitutes multiple tokens', async () => {
		store.set('db:r:a', 'AAA');
		store.set('db:r:b', 'BBB');
		const out = await resolveSecrets('${secret:db:r:a}+${secret:db:r:b}');
		assert.equal(out, 'AAA+BBB');
	});

	it('throws for unresolved refs', async () => {
		await assert.rejects(
			resolveSecrets('postgres://user:${secret:missing-ref}@h/d'),
			/missing keychain secret for ref 'missing-ref'/,
		);
	});
});

// ---------------------------------------------------------------------------
// extractUrlPassword
// ---------------------------------------------------------------------------

describe('extractUrlPassword', () => {
	beforeEach(() => { store.clear(); });

	it('redacts the password + stores it under the ref', async () => {
		const ref = 'db:r:c';
		const redacted = await extractUrlPassword('postgres://user:secret@host:5432/db', ref);
		assert.ok(redacted.includes('${secret:db:r:c}'), `got: ${redacted}`);
		assert.ok(!redacted.includes('secret@'), `password leaked: ${redacted}`);
		assert.equal(store.get(ref), 'secret');
	});

	it('round-trips: extract then resolve reproduces the original URL', async () => {
		const ref = 'db:r:rt';
		const original = 'postgres://user:s3cret@host/db';
		const redacted = await extractUrlPassword(original, ref);
		const resolved = await resolveSecrets(redacted);
		assert.equal(resolved, original);
	});

	it('returns input unchanged when no password is present', async () => {
		const url = 'postgres://user@host/db';
		assert.equal(await extractUrlPassword(url, 'db:r:c'), url);
		assert.equal(store.size, 0);
	});

	it('returns input unchanged when URL is not parseable (sqlite path)', async () => {
		const path = '/var/lib/app/db.sqlite';
		assert.equal(await extractUrlPassword(path, 'db:r:c'), path);
		assert.equal(store.size, 0);
	});
});
