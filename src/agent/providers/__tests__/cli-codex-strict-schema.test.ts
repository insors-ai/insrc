/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * codex runs `--output-schema` in strict mode, so both codex paths of the CLI
 * provider must hand it the strict form of the caller's schema, and must leave
 * the caller's schema object as it was (ISSUE-e48e33ae6af03720). The copy
 * leaves out the keywords strict mode refuses, and the reply is still held to
 * the caller's full schema (ISSUE-487ad7a67474d321).
 *
 * Driven against a FAKE `codex` that records the schema file it was given.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-codex-strict-schema.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';
import { codexStrictSchema } from '../structured-output.js';
import { modelFacingBundleSchema } from '../../../analyze/context/schema.js';
import type { StructuredSchema } from '../../../shared/types.js';

/** A fake codex: copies the `--output-schema` file to `schema-seen.json` beside it, then answers
 *  the text of `answer.json` beside it, or `{"ok":true}`. */
const FAKE = `#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
for await (const _ of process.stdin) { /* drain */ }
const argv = process.argv.slice(2);
copyFileSync(argv[argv.indexOf('--output-schema') + 1], join(here, 'schema-seen.json'));
const answer = existsSync(join(here, 'answer.json')) ? readFileSync(join(here, 'answer.json'), 'utf8') : '{"ok":true}';
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: answer } }) + '\\n');
`;

/** Shaped like the build gate's judge schema: no additionalProperties anywhere, an optional field. */
function judgeLikeSchema(): StructuredSchema {
	return {
		type: 'object',
		required: ['ok'],
		properties: {
			ok:     { type: 'boolean' },
			note:   { type: 'string' },
			checks: { type: 'array', items: { type: 'object', required: ['check'], properties: { check: { type: 'string' }, evidence: { type: 'string' } } } },
		},
	};
}

const STRICT = {
	type: 'object',
	required: ['ok', 'note', 'checks'],
	additionalProperties: false,
	properties: {
		ok:     { type: 'boolean' },
		note:   { type: 'string' },
		checks: { type: 'array', items: { type: 'object', required: ['check', 'evidence'], additionalProperties: false, properties: { check: { type: 'string' }, evidence: { type: 'string' } } } },
	},
};

function fakeCodex(answer?: unknown): { bin: string; seen: () => unknown; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-codex-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	if (answer !== undefined) writeFileSync(join(dir, 'answer.json'), JSON.stringify(answer));
	return {
		bin,
		seen: () => JSON.parse(readFileSync(join(dir, 'schema-seen.json'), 'utf8')),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

test('a codex structured completion sends the strict form of a non-strict schema and leaves the caller\'s schema unchanged', async () => {
	const f = fakeCodex();
	try {
		const schema = judgeLikeSchema();
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		assert.deepEqual(await p.completeStructured([{ role: 'user', content: 'judge' }], schema), { ok: true });
		assert.deepEqual(f.seen(), STRICT);
		assert.deepEqual(schema, judgeLikeSchema(), 'the caller\'s schema is not modified');
	} finally {
		f.cleanup();
	}
});

test('a codex reviewer session sends the strict form of a non-strict schema and leaves the caller\'s schema unchanged', async () => {
	const f = fakeCodex();
	const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-codex-review-cwd-')));
	try {
		const schema = judgeLikeSchema();
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		assert.deepEqual(await p.runReviewSession('review', schema, { cwd, deadlineMs: 30_000 }), { ok: true });
		assert.deepEqual(f.seen(), STRICT);
		assert.deepEqual(schema, judgeLikeSchema(), 'the caller\'s schema is not modified');
	} finally {
		f.cleanup();
		rmSync(cwd, { recursive: true, force: true });
	}
});

/** Every keyword used at a schema position (property NAMES are not keywords). */
function keywordsIn(node: unknown, out = new Set<string>()): Set<string> {
	if (Array.isArray(node)) { for (const n of node) keywordsIn(n, out); return out; }
	if (typeof node !== 'object' || node === null) return out;
	for (const [k, v] of Object.entries(node)) {
		out.add(k);
		if ((k === 'properties' || k === '$defs' || k === 'patternProperties') && typeof v === 'object' && v !== null) {
			for (const sub of Object.values(v)) keywordsIn(sub, out);
		} else {
			keywordsIn(v, out);
		}
	}
	return out;
}

const REFUSED = ['uniqueItems', 'contains', 'not', 'allOf', 'if', 'then', 'else', 'propertyNames', 'minProperties', 'maxProperties'];

/** A property per refused keyword, a property per kept one, and properties NAMED like refused keywords. */
function mixedSchema(): StructuredSchema {
	return {
		type: 'object',
		properties: {
			tags:     { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, contains: { const: 'a' }, minItems: 1, maxItems: 5 },
			mode:     { type: 'string', enum: ['a', 'b'], not: { const: 'c' } },
			nested:   { type: 'object', properties: { n: { type: 'integer', minimum: 0, maximum: 9 } }, minProperties: 1, maxProperties: 2, propertyNames: { pattern: '^n$' } },
			cond:     { type: 'string', if: { const: 'a' }, then: { minLength: 1 }, else: { minLength: 2 }, allOf: [{ type: 'string' }] },
			when:     { type: 'string', format: 'date-time' },
			site:     { type: 'string', format: 'uri', pattern: '^https?://' },
			either:   { anyOf: [{ type: 'array', items: { type: 'string' }, uniqueItems: true }, { type: 'null' }] },
			pair:     { type: 'array', prefixItems: [{ type: 'array', items: { type: 'string' }, uniqueItems: true }] },
			// Never probed, and each holds a refused keyword.
			deps:     { type: 'object', properties: { a: { type: 'string' } }, dependentSchemas: { a: { properties: { b: { type: 'array', uniqueItems: true } } } } },
			rest:     { type: 'array', items: { type: 'string' }, unevaluatedItems: { not: { const: 'x' } } },
			choice:   { oneOf: [{ type: 'object', properties: { k: { type: 'string' } } }, { type: 'null' }] },
			// Property NAMES that match a refused keyword are data, not keywords.
			not:         { type: 'string' },
			uniqueItems: { type: 'boolean' },
		},
		required: ['tags'],
	};
}

test('the codex copy of a schema keeps only the keywords codex was probed to accept, leaves out every format but date-time, and leaves the caller\'s schema unchanged', () => {
	const schema = mixedSchema();
	const copy = codexStrictSchema(schema) as Record<string, any>;
	const seen = keywordsIn(copy);
	for (const kw of REFUSED) assert.ok(!seen.has(kw), `${kw} left out`);
	const p = copy['properties'];
	assert.deepEqual(p.tags, { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 5 });
	assert.deepEqual(p.mode, { type: 'string', enum: ['a', 'b'] });
	assert.deepEqual(p.nested, { type: 'object', properties: { n: { type: 'integer', minimum: 0, maximum: 9 } }, required: ['n'], additionalProperties: false });
	assert.deepEqual(p.cond, { type: 'string' });
	assert.deepEqual(p.when, { type: 'string', format: 'date-time' }, 'date-time is kept');
	assert.deepEqual(p.site, { type: 'string', pattern: '^https?://' }, 'uri is left out');
	assert.deepEqual(p.either, { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] });
	assert.deepEqual(p.pair, { type: 'array' }, 'prefixItems (never probed) is left out');
	assert.deepEqual(p.deps, { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false }, 'dependentSchemas is left out');
	assert.deepEqual(p.rest, { type: 'array', items: { type: 'string' } }, 'unevaluatedItems is left out');
	assert.deepEqual(p.choice, { anyOf: [{ type: 'object', properties: { k: { type: 'string' } }, required: ['k'], additionalProperties: false }, { type: 'null' }] }, 'oneOf is kept as the strict anyOf');
	assert.deepEqual(p.not, { type: 'string' }, 'a property named not is kept');
	assert.deepEqual(p.uniqueItems, { type: 'boolean' }, 'a property named uniqueItems is kept');
	assert.deepEqual(copy['required'], Object.keys(mixedSchema().properties as object));
	assert.deepEqual(schema, mixedSchema(), 'the caller\'s schema is not modified');
});

test('the analyzer bundle schema reaches codex without uniqueItems or any other refused keyword', async () => {
	const schema = modelFacingBundleSchema({ withMeta: true });
	assert.ok(keywordsIn(schema).has('uniqueItems'), 'the caller\'s schema does carry uniqueItems');
	const f = fakeCodex();
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		await p.completeStructured([{ role: 'user', content: 'bundle' }], schema).catch(() => undefined);
		const sent = keywordsIn(f.seen());
		for (const kw of REFUSED) assert.ok(!sent.has(kw), `${kw} not sent`);
	} finally {
		f.cleanup();
	}
});

/** A schema with three constraints codex is not given: the items must be distinct, `site` must be a URI,
 *  and the first entry of `pair` must hold distinct items. */
const DISTINCT: StructuredSchema = {
	type: 'object', required: ['tags', 'site', 'pair'], additionalProperties: false,
	properties: {
		tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
		site: { type: 'string', format: 'uri' },
		pair: { type: 'array', prefixItems: [{ type: 'array', items: { type: 'string' }, uniqueItems: true }] },
	},
};
const GOOD = { tags: ['a', 'b'], site: 'https://example.com/x', pair: [['a', 'b']] };

test('a codex structured completion rejects a reply that breaks a keyword (also inside prefixItems) or a format left out of the codex copy, and accepts one that meets them', async () => {
	const dup = fakeCodex({ ...GOOD, tags: ['a', 'a'] });
	const notUri = fakeCodex({ ...GOOD, site: 'not a uri' });
	const dupFirst = fakeCodex({ ...GOOD, pair: [['a', 'a']] });
	const good = fakeCodex(GOOD);
	try {
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: dup.bin }).completeStructured([{ role: 'user', content: 'x' }], DISTINCT),
			/codex answer does not satisfy the caller's schema: .*duplicate items/,
		);
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: notUri.bin }).completeStructured([{ role: 'user', content: 'x' }], DISTINCT),
			/codex answer does not satisfy the caller's schema: \/site: must match format "uri"/,
		);
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: dupFirst.bin }).completeStructured([{ role: 'user', content: 'x' }], DISTINCT),
			/codex answer does not satisfy the caller's schema: \/pair\/0: .*duplicate items/,
		);
		assert.deepEqual(await new CliProvider({ kind: 'codex', binPath: good.bin }).completeStructured([{ role: 'user', content: 'x' }], DISTINCT), GOOD);
	} finally {
		dup.cleanup();
		notUri.cleanup();
		dupFirst.cleanup();
		good.cleanup();
	}
});

test('a codex reviewer session rejects a reply that breaks a keyword (also inside prefixItems) or a format left out of the codex copy, and accepts one that meets them', async () => {
	const dup = fakeCodex({ ...GOOD, tags: ['a', 'a'] });
	const notUri = fakeCodex({ ...GOOD, site: 'not a uri' });
	const dupFirst = fakeCodex({ ...GOOD, pair: [['a', 'a']] });
	const good = fakeCodex(GOOD);
	const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-codex-review-cwd-')));
	try {
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: dup.bin }).runReviewSession('review', DISTINCT, { cwd, deadlineMs: 30_000 }),
			/codex review session answer does not satisfy the caller's schema: .*duplicate items/,
		);
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: notUri.bin }).runReviewSession('review', DISTINCT, { cwd, deadlineMs: 30_000 }),
			/codex review session answer does not satisfy the caller's schema: \/site: must match format "uri"/,
		);
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: dupFirst.bin }).runReviewSession('review', DISTINCT, { cwd, deadlineMs: 30_000 }),
			/codex review session answer does not satisfy the caller's schema: \/pair\/0: .*duplicate items/,
		);
		assert.deepEqual(await new CliProvider({ kind: 'codex', binPath: good.bin }).runReviewSession('review', DISTINCT, { cwd, deadlineMs: 30_000 }), GOOD);
	} finally {
		dup.cleanup();
		notUri.cleanup();
		dupFirst.cleanup();
		good.cleanup();
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('a schema with a format the reply check cannot enforce, anywhere including a branch the copy leaves out, is refused before codex is called; the same word as data or as a property name is not', async () => {
	const schema: StructuredSchema = { type: 'object', properties: { body: { type: 'string', format: 'markdown' } } };
	assert.throws(() => codexStrictSchema(schema), /codex cannot be given format 'markdown'/);
	const inDroppedBranch: StructuredSchema = { type: 'object', properties: { body: { allOf: [{ type: 'string', format: 'markdown' }] } } };
	assert.throws(() => codexStrictSchema(inDroppedBranch), /codex cannot be given format 'markdown'/);
	// Properties and dependent schemas NAMED like data keywords are still schemas.
	for (const named of ['enum', 'const', 'default', 'examples', 'format']) {
		const asProperty: StructuredSchema = { type: 'object', properties: { [named]: { type: 'string', format: 'markdown' } } };
		assert.throws(() => codexStrictSchema(asProperty), /codex cannot be given format 'markdown'/, `property ${named}`);
		const asDependent: StructuredSchema = { type: 'object', properties: { a: { type: 'string' } }, dependentSchemas: { [named]: { properties: { b: { type: 'string', format: 'markdown' } } } } };
		assert.throws(() => codexStrictSchema(asDependent), /codex cannot be given format 'markdown'/, `dependent schema ${named}`);
	}
	const asData: StructuredSchema = { type: 'object', properties: {
		format: { type: 'string', enum: ['markdown'] },
		opts:   { type: 'object', properties: { f: { type: 'string' } }, default: { format: 'markdown' }, examples: [{ format: 'markdown' }] },
	} };
	assert.doesNotThrow(() => codexStrictSchema(asData));
	const f = fakeCodex();
	try {
		await assert.rejects(
			new CliProvider({ kind: 'codex', binPath: f.bin }).completeStructured([{ role: 'user', content: 'x' }], schema),
			/codex cannot be given format 'markdown'/,
		);
		assert.throws(() => f.seen(), /ENOENT/, 'codex was not called');
	} finally {
		f.cleanup();
	}
});
