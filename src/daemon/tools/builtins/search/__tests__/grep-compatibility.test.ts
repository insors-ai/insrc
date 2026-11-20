import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGrepSearch, GrepIncompleteError, NODE_EXCLUDED_BY_RULE } from '../grep.js';
import { runShell } from '../../../shell-helper.js';

test('Grep result shapes and Node/ripgrep omission rules remain truthful', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-grep-compat-'));
	try {
		const long = 'needle ' + 'x'.repeat(600);
		writeFileSync(join(root, 'a.txt'), `${long}\nneedle two\n`);
		const missing = { rgCommand: join(root, 'missing-rg') };
		const bounded = await runGrepSearch({ root, pattern: 'needle', limit: 1, _backend: missing });
		assert.equal(bounded.usedRipgrep, false); assert.equal(bounded.truncated, true);
		assert.equal(bounded.hits.length, 1); assert.equal(bounded.hits[0]!.text.length, 500);
		assert.equal(bounded.omitted.excludedByRule, NODE_EXCLUDED_BY_RULE);
		assert.deepEqual(bounded.omitted.shortenedLines, [{ path: 'a.txt', line: 1, totalChars: long.length }]);
		assert.deepEqual(bounded.omitted.skippedFiles, []);
		const complete = await runGrepSearch({ root, pattern: 'needle', limit: 1, complete: true, _backend: missing });
		assert.equal(complete.usedRipgrep, false); assert.equal(complete.truncated, false);
		assert.deepEqual(complete.hits.map(h => h.text), [long, 'needle two']);
		assert.deepEqual(complete.omitted.shortenedLines, []);
		await assert.rejects(runGrepSearch({ root: join(root, 'absent'), pattern: 'needle', _backend: missing }), /ENOENT/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('Complete-mode failure preserves allowed partial hits', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-grep-partial-'));
	try {
		writeFileSync(join(root, 'allowed.txt'), 'needle allowed\n');
		const failing = join(root, 'rg-fail');
		const line = `${join(root, 'allowed.txt')}:1:needle allowed\n`;
		writeFileSync(failing, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(line)}, () => { process.exitCode = 2; });\n`, { mode: 0o755 });
		await assert.rejects(runGrepSearch({ root, pattern: 'needle', complete: true, _backend: { rgCommand: failing } }), error => {
			assert.ok(error instanceof GrepIncompleteError); assert.equal(error.reason, 'exit-code');
			assert.deepEqual(error.hits, [{ path: 'allowed.txt', line: 1, text: 'needle allowed' }]); return true;
		});
		const bounded = await runGrepSearch({ root, pattern: 'needle', glob: '*.txt', _backend: { rgCommand: failing } });
		assert.equal(bounded.usedRipgrep, false); assert.equal(bounded.omitted.backendFallback?.reason, 'exit-code');
		assert.deepEqual(bounded.hits, [{ path: 'allowed.txt', line: 1, text: 'needle allowed' }]);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('Compiled shared grep applies store admission in both modes', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-grep-compiled-'));
	try {
		const home = join(root, 'home'); const store = join(home, '.insrc'); mkdirSync(store, { recursive: true });
		writeFileSync(join(store, 'graph.lmdb'), 'PRIVATE_DATA_NEEDLE\n'); writeFileSync(join(store, 'graph.lmdb-lock'), 'PRIVATE_LOCK_NEEDLE\n');
		writeFileSync(join(store, 'allowed.txt'), 'ALLOWED_NEEDLE\n');
		const script = join(root, 'check.mjs');
		writeFileSync(script, `import assert from 'node:assert/strict';
const { runGrepSearch } = await import(${JSON.stringify(pathToFileURL(resolve('out/daemon/tools/builtins/search/grep.js')).href)});
for (const complete of [false, true]) {
 const result = await runGrepSearch({ root: ${JSON.stringify(store)}, pattern: 'NEEDLE', complete });
 assert.equal(result.usedRipgrep, false); assert.deepEqual(result.hits.map(h => h.text), ['ALLOWED_NEEDLE']);
 await assert.rejects(runGrepSearch({ root: ${JSON.stringify(join(store, 'graph.lmdb-lock'))}, pattern: 'NEEDLE', complete }), /Refusing to touch/);
}
process.stdout.write('compiled-store-guard-passed');
`);
		const result = await runShell([process.execPath, script], { timeoutMs: 10000, env: { ...process.env, HOME: home, NODE_TEST_CONTEXT: undefined, INSRC_LOG_LEVEL: 'error' } });
		assert.equal(result.code, 0, result.stderr); assert.equal(result.timedOut, false); assert.match(result.stdout, /compiled-store-guard-passed/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
