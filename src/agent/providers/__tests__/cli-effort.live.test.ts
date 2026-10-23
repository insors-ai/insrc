/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live checks for the per-tier reasoning effort (Story a27df028 S001, t8): the
 * real claude and codex CLIs accept the flag CliProvider passes. A wrapper
 * script records the argv and execs the real binary, so each check shows both
 * the flag sent and the CLI's own answer.
 *
 * Gate behind INSRC_LIVE_TESTS=1 -- each call costs real billed tokens.
 *
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-effort.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const skip = !GATE && 'set INSRC_LIVE_TESTS=1 (real CLI calls)';

/** A wrapper for `bin` that appends its argv (one JSON line per call) and execs the real binary. */
function recordingWrapper(bin: string): { path: string; argvs: () => string[][]; cleanup: () => void } {
	const real = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
	const dir = mkdtempSync(join(tmpdir(), `insrc-effort-${bin}-`));
	const log = join(dir, 'argv.jsonl');
	const path = join(dir, bin);
	writeFileSync(path, `#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nconst r = require('child_process').spawnSync(${JSON.stringify(real)}, process.argv.slice(2), { stdio: 'inherit' });\nprocess.exit(r.status ?? 1);\n`);
	chmodSync(path, 0o755);
	return {
		path,
		argvs: () => readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l) as string[]),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

test('a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high', { skip, timeout: 300_000 }, async () => {
	const w = recordingWrapper('codex');
	try {
		const p = new CliProvider({ kind: 'codex', binPath: w.path, model: 'gpt-6.1-sol', effort: 'high', timeoutMs: 240_000 });
		const res = await p.complete([{ role: 'user', content: 'Reply with the single word: ok' }]);
		assert.match(res.text.toLowerCase(), /ok/);
		assert.deepEqual(w.argvs()[0]!.slice(-4), ['--model', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=high']);
		// The same flags, without --json, make codex print its session header: it reports the effort it runs at.
		const header = spawnSync('codex', ['exec', '--skip-git-repo-check', '--model', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=high', 'Reply with the single word: ok'], { encoding: 'utf8', cwd: tmpdir(), timeout: 240_000 });
		assert.match(`${header.stdout}${header.stderr}`, /reasoning effort: high/);
	} finally { w.cleanup(); }
});

test('a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default', { skip, timeout: 300_000 }, async () => {
	const w = recordingWrapper('claude');
	try {
		const p = new CliProvider({ kind: 'claude', binPath: w.path, effort: 'low', timeoutMs: 240_000 });
		const res = await p.complete([{ role: 'user', content: 'Reply with the single word: ok' }]);
		assert.match(res.text.toLowerCase(), /ok/);
		assert.deepEqual(w.argvs()[0]!.slice(-2), ['--effort', 'low']);
	} finally { w.cleanup(); }
	const bogus = spawnSync('claude', ['-p', '--effort', 'bogus', 'Reply with the single word: ok'], { encoding: 'utf8', cwd: tmpdir(), timeout: 240_000 });
	assert.equal(bogus.status, 0, 'claude does not fail on an unknown effort');
	assert.match(`${bogus.stdout}${bogus.stderr}`, /Unknown --effort value 'bogus'/);
});
