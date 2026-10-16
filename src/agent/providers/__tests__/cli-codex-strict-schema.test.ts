/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * codex runs `--output-schema` in strict mode, so both codex paths of the CLI
 * provider must hand it the strict form of the caller's schema, and must leave
 * the caller's schema object as it was (ISSUE-e48e33ae6af03720).
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
import type { StructuredSchema } from '../../../shared/types.js';

/** A fake codex: copies the `--output-schema` file to `schema-seen.json` beside it, then answers `{"ok":true}`. */
const FAKE = `#!/usr/bin/env node
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
for await (const _ of process.stdin) { /* drain */ }
const argv = process.argv.slice(2);
copyFileSync(argv[argv.indexOf('--output-schema') + 1], join(here, 'schema-seen.json'));
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } }) + '\\n');
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

function fakeCodex(): { bin: string; seen: () => unknown; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-codex-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
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
