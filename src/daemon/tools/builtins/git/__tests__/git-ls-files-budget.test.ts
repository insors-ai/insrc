/**
 * git_ls_files takes an optional maxBytes (1 to 52428800); a listing over the budget is a failure, never a cut result
 * (the add-optional-output-budget-git-ls Story).
 * Run: npx tsx --test-force-exit src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { cleanup } from '../../../__tests__/_proc.js';
import { executeTool } from '../../../executor.js';
import { gitForEachRefTool } from '../for-each-ref.js';
import { readGit } from '../helpers.js';
import { gitLsFilesTool } from '../ls-files.js';
import { gitLsTreeTool } from '../ls-tree.js';
import { gitPathHistoryTool } from '../path-history.js';
import { gitRevListTool } from '../rev-list.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

const T = 'src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts';
const MiB = 1024 * 1024;

let standIn: StandIn | undefined;
afterEach(() => { standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

/** A git that prints exactly `bytes` bytes of NUL-terminated names (a name of `name`, repeated), the last one cut to fit. */
const printing = (bytes: number, name = 'file-name-of-some-length.ts'): string =>
	`{ yes '${name}' | head -c ${bytes - 1} | tr '\\n' '\\000'; printf '\\000'; }`;
const run = (input: Record<string, unknown>) => gitLsFilesTool.execute({ cwd: '/tmp', ...input }, toolDeps('/tmp'));
const accepts = (v: unknown) => validateAgainstSchema(gitLsFilesTool.inputSchema as StructuredSchema, { maxBytes: v }).ok;

test(`${T}: maxBytes is accepted as an integer from 1 to 52428800 and refused as 0, a negative, a fraction or 52428801 by the input schema, and every other input of the tool is unchanged`, () => {
	for (const ok of [1, 1000, 10 * MiB, 50 * MiB]) assert.equal(accepts(ok), true, String(ok));
	for (const bad of [0, -1, 1.5, 50 * MiB + 1, '10', null]) assert.equal(accepts(bad), false, String(bad));
	const props = Object.keys((gitLsFilesTool.inputSchema as { properties: object }).properties).sort();
	assert.deepEqual(props, ['cached', 'cwd', 'ignored', 'maxBytes', 'others', 'paths']);
	assert.equal(validateAgainstSchema(gitLsFilesTool.inputSchema as StructuredSchema, { paths: ['a'], others: true }).ok, true);
	assert.equal(validateAgainstSchema(gitLsFilesTool.inputSchema as StructuredSchema, { surprise: 1 }).ok, false, 'still additionalProperties false');
});

test(`${T}: with no maxBytes a listing over 10 MiB is a rejected failure, as before`, async () => {
	standIn = installStandInGit(printing(11 * MiB));
	const r = await run({});
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.error ?? '', /cut at the byte limit/);
	assert.equal(r.data, undefined);
});

test(`${T}: with maxBytes 52428800 a listing between 10 MiB and 50 MiB is returned whole`, async () => {
	const name = 'file-name-of-some-length.ts';
	const per = name.length + 1;
	const names = Math.floor((11 * MiB) / per);          // whole names only, so the listing is exactly names * per bytes
	const bytes = names * per;
	assert.ok(bytes > 10 * MiB && bytes < 50 * MiB);
	standIn = installStandInGit(printing(bytes, name));
	const r = await run({ maxBytes: 50 * MiB });
	assert.equal(r.success, true, r.output.slice(0, 200));
	const files = (r.data as { files: string[] }).files;
	assert.equal(files.length, names, 'every name is returned');
	assert.ok(files.every(f => f === name), 'every name is the one printed');
	assert.equal(files.reduce((n, f) => n + Buffer.byteLength(f, 'utf8') + 1, 0), bytes, 'the returned names account for every printed byte');
	assert.equal(standIn.calls().length, 1);
});

test(`${T}: a listing of exactly maxBytes bytes is returned and one of maxBytes plus one byte is a rejected failure that returns no files, with multibyte names counted in bytes`, async () => {
	standIn = installStandInGit(printing(1000));
	assert.equal((await run({ maxBytes: 1000 })).success, true, 'exactly the budget');
	standIn.restore(); cleanup(standIn.dir);
	standIn = installStandInGit(printing(1001));
	const over = await run({ maxBytes: 1000 });
	assert.equal(over.success, false, 'one byte over');
	assert.equal(over.failure?.kind, 'rejected');
	assert.equal(over.data, undefined, 'no files are returned');
	standIn.restore(); cleanup(standIn.dir);
	// a name of 200 three-byte characters is 600 bytes (601 with its NUL): 200 characters, but the budget counts bytes
	const euro = '\u20ac'.repeat(200);
	standIn = installStandInGit(`printf '%s\\000' '${euro}'`);
	assert.equal(Buffer.byteLength(euro, 'utf8') + 1, 601);
	assert.ok(euro.length + 1 < 601, 'fewer characters than bytes');
	assert.equal((await run({ maxBytes: 600 })).success, false, '600 bytes cannot hold 601 bytes of 201 characters');
	const ok = await run({ maxBytes: 601 });
	assert.equal(ok.success, true);
	assert.deepEqual((ok.data as { files: string[] }).files, [euro]);
});

/** The number of top-level arguments of the first `readGit('` call in `text`. */
function readGitArgCount(text: string): number {
	const start = text.indexOf("readGit('") + 'readGit('.length;
	let depth = 0, args = 1, quote = '';
	for (let i = start; i < text.length; i++) {
		const c = text[i]!;
		if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
		if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
		if ('([{'.includes(c)) depth++;
		else if (')]}'.includes(c)) { if (depth === 0) return args; depth--; }
		else if (c === ',' && depth === 0) args++;
	}
	throw new Error('unterminated readGit call');
}

test(`${T}: each of the six other readGit-based tools (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) still cuts at 10 MiB and passes no maxBytes, and git_ls_files still runs the same argv and refuses a NUL in a path before any command runs`, async () => {
	const here = dirname(fileURLToPath(import.meta.url));
	// each of the six calls readGit with at most five arguments (label, argv, cwd, timeout, signal): the sixth is maxBytes
	const files: Record<string, string> = { git_ls_tree: 'ls-tree.ts', git_rev_parse: 'rev-parse.ts', git_for_each_ref: 'for-each-ref.ts', git_path_history: 'path-history.ts', git_rev_list: 'rev-list.ts', git_hash_object: 'hash-object.ts' };
	for (const [id, file] of Object.entries(files)) {
		const text = readFileSync(join(here, '..', file), 'utf8');
		assert.ok(text.includes("readGit('"), `${id} calls readGit`);
		assert.ok(readGitArgCount(text) <= 5, `${id} passes no sixth argument to readGit`);
		assert.ok(!/maxBytes/.test(text), `${id} mentions no maxBytes`);
	}
	// readGit itself: without maxBytes the capture is cut at 10 MiB; with it, the whole output is kept
	standIn = installStandInGit(`yes 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' | head -c ${11 * MiB}`);
	const cut = await readGit('git_probe', ['git', 'probe'], '/tmp', 30_000);
	assert.ok(cut.ok);
	assert.equal(cut.ok && cut.r.stdoutTruncated, true, 'the default budget cuts 11 MiB');
	assert.equal(cut.ok && cut.r.stdout.length <= 10 * MiB, true);
	const whole = await readGit('git_probe', ['git', 'probe'], '/tmp', 30_000, undefined, 50 * MiB);
	assert.equal(whole.ok && whole.r.stdoutTruncated, false, 'a larger budget keeps it');
	// the tools that parse a listing turn the cut into a failure at the default budget
	const tools: Array<[string, { execute(input: Record<string, unknown>, deps: ReturnType<typeof toolDeps>): Promise<{ success: boolean; error?: string | undefined }> }, Record<string, unknown>]> = [
		['git_ls_tree', gitLsTreeTool, { rev: 'HEAD' }], ['git_for_each_ref', gitForEachRefTool, {}],
		['git_path_history', gitPathHistoryTool, {}], ['git_rev_list', gitRevListTool, {}],
	];
	for (const [id, tool, input] of tools) {
		const r = await tool.execute({ cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.success, false, `${id}: 11 MiB under the default budget is not returned whole`);
	}
	standIn.restore(); cleanup(standIn.dir);
	// git_ls_files: the same argv as before, and a NUL in a path is refused before any command runs
	standIn = installStandInGit("printf 'a.txt\\000'");
	registerForTests();
	const listed = await run({ others: true, paths: ['src'] });
	assert.equal(listed.success, true);
	assert.deepEqual(standIn.calls(), ['--literal-pathspecs ls-files -z --others --exclude-standard -- src']);
	const before = standIn.calls().length;
	const refused = await executeTool('git_ls_files', { cwd: '/tmp', paths: ['a\0b'] }, toolDeps('/tmp'));
	assert.equal(refused.success, false);
	assert.equal(standIn.calls().length, before, 'no command ran');
});
