/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t8: the path, kv and qs argument variants of the op table, and that the existing ops
 * build exactly the argv they build today.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';

import { apiPath, buildArgv, kvField, lit, query } from '../op-table.js';
import type { OpDef } from '../op-table.js';
import { ROWS, ROWS2 } from './_family-rows.js';

const def = (args: OpDef['args'], extra: Partial<OpDef> = {}): OpDef => ({
	name: 't', command: ['api'], cls: 'none', limitS: 30, args,
	out: { kind: 'custom', shape: { ok: Type.Boolean() }, build: async () => ({ ok: true }) }, ...extra,
});

test('gh-op-table-args.test.ts: the path variant encodes a slash, question mark, hash, percent and Unicode in a field value and never splices it', () => {
	const d = def([apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' })]);
	assert.deepEqual(buildArgv(d, { owner: 'o', repo: 'r', number: 5 }), ['gh', 'api', 'repos/o/r/issues/5']);
	const hostile = buildArgv(d, { owner: 'a/b', repo: 'x?y#z', number: '1%2F2' });
	assert.equal(hostile.length, 3, 'still one positional');
	assert.equal(hostile[2], 'repos/a%2Fb/x%3Fy%23z/issues/1%252F2');
	assert.equal(buildArgv(d, { owner: 'caf\u00e9', repo: '\u65e5', number: 1 })[2], 'repos/caf%C3%A9/%E6%97%A5/issues/1');
	assert.throws(() => buildArgv(d, { owner: 'o', repo: 'r' }), /needs the field number/);
});

test('gh-op-table-args.test.ts: the kv variant emits the flag and key=value, with repeat one pair per list member, and nothing for an absent field', () => {
	const d = def([kvField('-f', 'title', 'title'), kvField('-F', 'sub_issue_id', 'subIssueId'), kvField('-f', 'labels[]', 'labels', true)]);
	assert.deepEqual(buildArgv(d, { title: 'T', subIssueId: 42, labels: ['a', 'b c'] }), ['gh', 'api', '-f', 'title=T', '-F', 'sub_issue_id=42', '-f', 'labels[]=a', '-f', 'labels[]=b c']);
	assert.deepEqual(buildArgv(d, {}), ['gh', 'api'], 'absent fields emit nothing');
	assert.deepEqual(buildArgv(d, { title: 'x=y&z' }), ['gh', 'api', '-f', 'title=x=y&z'], 'the value is passed as is: gh api reads the pair itself');
	assert.throws(() => buildArgv(def([kvField('-f', 'labels', 'labels')]), { labels: ['a'] }), /needs repeat/);
});

test('gh-op-table-args.test.ts: path, kv, qs and the old variants combine in the order the op declares them', () => {
	const d = def([lit('-X', 'POST'), apiPath('repos/', { field: 'owner' }, '/issues'), query({ key: 'per_page', value: '100' }), kvField('-f', 'title', 'title')]);
	assert.deepEqual(buildArgv(d, { owner: 'o', title: 'T' }), ['gh', 'api', '-X', 'POST', 'repos/o/issues?per_page=100', '-f', 'title=T']);
});

test('gh-op-table-args.test.ts: existing ops build exactly the argv the recorded table gives, and use none of the new variants', () => {
	let checked = 0;
	for (const [tool, input, argv] of [...ROWS, ...ROWS2]) {
		const d = tool.ops.find(o => o.name === input['op'])!;
		assert.ok(d, `${tool.id}.${String(input['op'])} exists`);
		for (const a of d.args) assert.equal('path' in a || 'kv' in a || 'qs' in a, false, `${tool.id}.${d.name} uses no new variant`);
		assert.equal(buildArgv(d, input).slice(1).join(' '), argv, `${tool.id}.${d.name}`);
		checked++;
	}
	assert.ok(checked > 40, `checked ${checked} recorded ops`);
});

// ---------------------------------------------------------------------------
// The failure diagnostic seam
// ---------------------------------------------------------------------------

import { installStandInBin } from '../../../__tests__/_bin.js';
import { cleanup } from '../../../__tests__/_proc.js';
import { ORIGINAL_MAX_CHARS } from '../../../executor.js';
import { FAILURE_ORIGINAL_MAX_CHARS } from '../helpers.js';
import { defineGhFamily } from '../op-table.js';

test('gh-op-table-args.test.ts: an op that opts in keeps gh\'s text of a command-exit failure in failure.original, capped at the executor\'s cap; an op that does not keeps today\'s failure', async () => {
	assert.equal(FAILURE_ORIGINAL_MAX_CHARS, ORIGINAL_MAX_CHARS, 'one cap, defined in two places and pinned equal');
	const out = { kind: 'custom', shape: { ok: Type.Boolean() }, build: async () => ({ ok: true }) } as const;
	const fam = defineGhFamily({ id: 'gh_t8_diag', description: 'x', ops: [
		{ name: 'with', command: ['api'], cls: 'none', limitS: 30, args: [], out, diagnostic: 'stderr' },
		{ name: 'without', command: ['api'], cls: 'none', limitS: 30, args: [], out },
	] });
	const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
	// a 5000-character diagnostic and a plain exit 1
	const bin = installStandInBin('gh', "printf '%05000d' 0 1>&2; exit 1");
	try {
		const a = await fam.execute({ op: 'with' }, deps);
		assert.equal(a.success, false);
		assert.equal(a.failure?.kind, 'rejected');
		assert.equal(a.failure?.original?.length, FAILURE_ORIGINAL_MAX_CHARS, 'cut by the seam itself');
		assert.equal(a.failure?.message.length, 5000, 'the message is not cut');
		const b = await fam.execute({ op: 'without' }, deps);
		assert.equal(b.failure?.original, undefined, 'no opt-in, no original');
	} finally { bin.restore(); cleanup(bin.dir); }
	// a spawn error keeps its own original (the stderr), opt-in or not
	const saved = process.env['PATH']; process.env['PATH'] = '/nonexistent';
	try {
		const c = await fam.execute({ op: 'with' }, deps);
		assert.equal(c.failure?.kind, 'missing-tool');
		assert.ok((c.failure?.original ?? '').length > 0);
	} finally { process.env['PATH'] = saved; }
});
