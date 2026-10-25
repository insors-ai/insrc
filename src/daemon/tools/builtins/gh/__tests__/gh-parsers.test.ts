import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { ghGistTool, ghGpgKeyTool, ghSshKeyTool } from '../resources.js';
import { parseConfigList, parseTabRows } from '../parsers.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

test('gh-parsers.test.ts: tab-column parser and config list parser on the fixtures', () => {
	// tab-separated lines: blank lines dropped, columns kept as they are (empty columns too), CRLF tolerated
	assert.deepEqual(parseTabRows('a\tb\tc\n\nd\t\tf\r\n  \n'), [['a', 'b', 'c'], ['d', '', 'f']]);
	assert.deepEqual(parseTabRows(''), []);
	assert.deepEqual(parseTabRows('single'), [['single']]);
	assert.deepEqual(parseTabRows('feature-x\thttps://github.com/o/r/tree/feature-x\n'), [['feature-x', 'https://github.com/o/r/tree/feature-x']]);

	// gh config list: key=value; a value may be empty or hold '='; lines without '=' are skipped
	const config = 'git_protocol=https\neditor=\nprompt=enabled\nbrowser=a=b\nnot a pair\n=orphan\n';
	assert.deepEqual(parseConfigList(config), [
		{ key: 'git_protocol', value: 'https' }, { key: 'editor', value: '' }, { key: 'prompt', value: 'enabled' }, { key: 'browser', value: 'a=b' },
	]);
	assert.deepEqual(parseConfigList(''), []);
});

test('gh-parsers.test.ts: gist list columns and ssh-key and gpg-key rows as string arrays', async () => {
	const run = async (tool: typeof ghGistTool, input: Record<string, unknown>, stdout: string) => {
		const gh = installFakeGh('ok', stdout);
		try { const r = await tool.execute(input, deps); assert.equal(r.success, true, r.output); assert.ok(Value.Check(tool.outputSchema, r.data)); return r.data; } finally { gh.restore(); }
	};
	// gist list: the five verified columns become named string properties; a short line is padded with ''
	assert.deepEqual(await run(ghGistTool, { op: 'list' }, 'abc\tnotes\t2 files\tsecret\t2026-01-02T00:00:00Z\ndef\t\t1 file\tpublic\t2026-01-03T00:00:00Z\nshort\n'), {
		op: 'list', count: 3,
		items: [
			{ id: 'abc', description: 'notes', files: '2 files', visibility: 'secret', updated: '2026-01-02T00:00:00Z' },
			{ id: 'def', description: '', files: '1 file', visibility: 'public', updated: '2026-01-03T00:00:00Z' },
			{ id: 'short', description: '', files: '', visibility: '', updated: '' },
		],
	});
	// ssh-key list and gpg-key list: rows are the tab-split lines, no named columns
	assert.deepEqual(await run(ghSshKeyTool, { op: 'list' }, 'laptop\tssh-ed25519 AAAA\t2026-01-01\t123\tauthentication\n'), { op: 'list', count: 1, rows: [['laptop', 'ssh-ed25519 AAAA', '2026-01-01', '123', 'authentication']] });
	assert.deepEqual(await run(ghGpgKeyTool as never, { op: 'list' }, 'AB12\tuser@example.com\t2026-01-01\n\nCD34\tother@example.com\t2026-02-01\n'), { op: 'list', count: 2, rows: [['AB12', 'user@example.com', '2026-01-01'], ['CD34', 'other@example.com', '2026-02-01']] });
	assert.deepEqual(await run(ghSshKeyTool, { op: 'list' }, ''), { op: 'list', count: 0, rows: [] });
});
