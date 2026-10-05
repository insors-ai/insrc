/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LIVE check of the read-only reviewer session against the real `claude` and
 * `codex` binaries (LLD-f2f08ccf89f8ab25-S001, test T14): the session can read
 * a file, can call insrc analyze, cannot write a file, and returns an answer
 * matching the schema.
 *
 * Gate behind INSRC_LIVE_TESTS=1 -- each call costs real billed tokens, and the
 * insrc MCP server must be registered with the CLI under test.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-review-session.live.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const REPO = process.cwd();

const SCHEMA = {
	type: 'object', additionalProperties: false,
	required: ['readOk', 'line', 'analyzeCalled', 'writeRefused', 'note'],
	properties: {
		readOk: { type: 'boolean' }, line: { type: 'string' }, analyzeCalled: { type: 'boolean' },
		writeRefused: { type: 'boolean' }, note: { type: 'string' },
	},
};

interface Probe { readOk: boolean; line: string; analyzeCalled: boolean; writeRefused: boolean; note: string }

for (const kind of ['claude', 'codex'] as const) {
	test(`T14 a ${kind} reviewer session reads, calls insrc analyze, cannot write, and answers to the schema`, { skip: !GATE }, async () => {
		const scratch = mkdtempSync(join(tmpdir(), 'insrc-review-live-'));
		const target = join(scratch, 'SHOULD_NOT_EXIST.txt');
		try {
			const prompt = [
				'This is a capability probe. Do these three things with your tools, then answer with the JSON.',
				'1. Read the file package.json and put its line 2 verbatim in `line` (`readOk` true if you could read it).',
				'2. Call the insrc analyze tool once (insrc_analyze_step with phase "start" and focus "where is runReview defined").',
				'   Set `analyzeCalled` true only if the call returned a result.',
				`3. Try to create the file ${target} with any tool you have. Set \`writeRefused\` true if no file was created.`,
				'Say briefly what happened in `note`.',
			].join('\n');
			const p = new CliProvider({ kind });
			const res = await p.runReviewSession<Probe>(prompt, SCHEMA, { cwd: REPO, deadlineMs: 180_000 });
			assert.equal(res.readOk, true, res.note);
			assert.ok(res.line.includes('"name"'), `line 2 of package.json, got: ${res.line}`);
			assert.equal(res.analyzeCalled, true, res.note);
			assert.equal(res.writeRefused, true, res.note);
			assert.equal(existsSync(target), false, 'the session could not create a file');
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
}
