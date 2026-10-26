/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t8: exact argv fixtures of the qs variant, the paginated-listing framing (a fixed -q
 * filter and one JSON value per line), and parseJsonLines.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';

import { apiPath, buildArgv, field, lit, query } from '../op-table.js';
import type { OpDef } from '../op-table.js';
import { parseJsonLines } from '../helpers.js';
import {
	ghListIssueComments, ghListIssuesByLabelsStrict, ghListIssuesByTitleTokenStrict,
} from '../../../../../workflow/tracker/github.js';
import { installFakeGh } from './_fakegh.js';

const COMMENTS_FILTER = '.[] | {id, author: .user.login, text: .body, at: .created_at, url: .html_url}';
const LABELS_FILTER = '.[] | select(.pull_request | not) | .number';
const TITLES_FILTER = '.[] | select(.pull_request | not) | {number, title}';
const OWNER_REPO = { owner: field.name(), repo: field.name() };

const base = (name: string, fields: NonNullable<OpDef['fields']>, args: OpDef['args']): OpDef => ({
	name, command: ['api'], cls: 'none', limitS: 60, fields, args,
	out: { kind: 'custom', shape: { ok: Type.Boolean() }, build: async () => ({ ok: true }) },
});
const commentsList = base('comments_list', { ...OWNER_REPO, number: field.int(), since: field.str() }, [
	lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' }, '/comments'),
	query({ key: 'per_page', value: '100' }, { key: 'since', field: 'since', optional: true }), lit('-q', COMMENTS_FILTER),
]);
const issuesByLabels = base('issues_by_labels', { ...OWNER_REPO, labels: field.strs() }, [
	lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'),
	query({ key: 'state', value: 'all' }, { key: 'per_page', value: '100' }, { key: 'labels', field: 'labels', join: ',' }), lit('-q', LABELS_FILTER),
]);
const issuesTitles = base('issues_titles', OWNER_REPO, [
	lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'),
	query({ key: 'state', value: 'all' }, { key: 'per_page', value: '100' }), lit('-q', TITLES_FILTER),
]);

test('gh-op-table-qs.test.ts: the qs variant builds constants only, a constant then an optional field present or absent, and two constants then a list field joined by a comma', () => {
	assert.deepEqual(buildArgv(commentsList, { owner: 'o', repo: 'r', number: 5 }), ['gh', 'api', '--paginate', 'repos/o/r/issues/5/comments?per_page=100', '-q', COMMENTS_FILTER]);
	assert.equal(buildArgv(commentsList, { owner: 'o', repo: 'r', number: 5, since: '2026-10-26T00:00:00Z' })[3], 'repos/o/r/issues/5/comments?per_page=100&since=2026-10-26T00%3A00%3A00Z');
	assert.equal(buildArgv(issuesByLabels, { owner: 'o', repo: 'r', labels: ['a', 'b c'] })[3], 'repos/o/r/issues?state=all&per_page=100&labels=a,b%20c');
	assert.deepEqual(buildArgv(issuesTitles, { owner: 'o', repo: 'r' }), ['gh', 'api', '--paginate', 'repos/o/r/issues?state=all&per_page=100', '-q', TITLES_FILTER]);
	const constantsOnly = base('c', OWNER_REPO, [apiPath('x/', { field: 'owner' }), query({ key: 'per_page', value: '100' })]);
	assert.equal(buildArgv(constantsOnly, { owner: 'o' })[2], 'x/o?per_page=100');
});

test('gh-op-table-qs.test.ts: a value with & # / and Unicode is encoded and adds no key; every entry an absent optional field appends nothing, not even a question mark', () => {
	const hostile = buildArgv(commentsList, { owner: 'o', repo: 'r', number: 5, since: 'a&b=c#d/e\u00e9' });
	assert.equal(hostile[3], 'repos/o/r/issues/5/comments?per_page=100&since=a%26b%3Dc%23d%2Fe%C3%A9');
	const labels = buildArgv(issuesByLabels, { owner: 'o', repo: 'r', labels: ['x&y', 'z,w', '\u00e9'] });
	assert.equal(labels[3], 'repos/o/r/issues?state=all&per_page=100&labels=x%26y,z%2Cw,%C3%A9', 'each member is encoded first, then they are joined by a literal comma');
	const optionalOnly = base('o', OWNER_REPO, [apiPath('x/', { field: 'owner' }), query({ key: 'since', field: 'since', optional: true })]);
	assert.equal(buildArgv(optionalOnly, { owner: 'o' })[2], 'x/o', 'no bare question mark');
});

test('gh-op-table-qs.test.ts: a list field without join, a required field that is absent and a query without a path are refused', () => {
	const noJoin = base('n', OWNER_REPO, [apiPath('x'), query({ key: 'labels', field: 'labels' })]);
	assert.throws(() => buildArgv(noJoin, { labels: ['a'] }), /needs join/);
	assert.throws(() => buildArgv(base('r', OWNER_REPO, [apiPath('x'), query({ key: 'state', field: 'state' })]), {}), /the query needs the field state/);
	assert.throws(() => buildArgv(base('p', OWNER_REPO, [query({ key: 'a', value: 'b' })]), {}), /needs a path before it/);
});

test('gh-op-table-qs.test.ts: the complete argv of the three paginated ops is api --paginate, the positional, then -q and a fixed filter that no input can change', () => {
	for (const [d, input, filter] of [[commentsList, { owner: 'o', repo: 'r', number: 5 }, COMMENTS_FILTER], [issuesByLabels, { owner: 'o', repo: 'r', labels: ['a'] }, LABELS_FILTER], [issuesTitles, { owner: 'o', repo: 'r' }, TITLES_FILTER]] as const) {
		const argv = buildArgv(d, input);
		assert.deepEqual([argv[0], argv[1], argv[2]], ['gh', 'api', '--paginate']);
		assert.deepEqual(argv.slice(-2), ['-q', filter]);
		const hostile = buildArgv(d, { ...input, owner: '. | ', ...('since' in input ? { since: filter } : {}) });
		assert.deepEqual(hostile.slice(-2), ['-q', filter], 'the filter is a constant');
		assert.equal(hostile.filter(t => t === '-q').length, 1);
	}
});

test('gh-op-table-qs.test.ts: the positionals equal the argv the tracker wrappers in src/workflow/tracker/github.ts send for the same inputs', () => {
	const gh = installFakeGh('ok', '');
	try {
		for (const run of [
			() => ghListIssueComments('o', 'r', 'o/r#5'),
			() => ghListIssueComments('o', 'r', 'o/r#5', '2026-10-26T00:00:00Z'),
			() => ghListIssuesByLabelsStrict('o', 'r', ['a', 'b c']),
			() => ghListIssuesByTitleTokenStrict('o', 'r', 'EP-1'),
		]) { try { run(); } catch { /* the fake prints nothing useful; only the argv matters */ } }
		const calls = gh.calls();
		assert.equal(calls.length, 4);
		const expected = [
			buildArgv(commentsList, { owner: 'o', repo: 'r', number: 5 }),
			buildArgv(commentsList, { owner: 'o', repo: 'r', number: 5, since: '2026-10-26T00:00:00Z' }),
			buildArgv(issuesByLabels, { owner: 'o', repo: 'r', labels: ['a', 'b c'] }),
			buildArgv(issuesTitles, { owner: 'o', repo: 'r' }),
		];
		for (let i = 0; i < 4; i++) assert.equal(calls[i], expected[i]!.slice(1).join(' '), `wrapper ${i}`);
	} finally { gh.restore(); }
});

test('gh-op-table-qs.test.ts: parseJsonLines returns the values in order across pages, skips blank lines, reads empty output as an empty list and reports the first bad line', () => {
	const page1 = ['{"id":1}', '{"id":2}'].join('\n');
	const page2 = ['{"id":3}', '', '  ', '{"id":4}'].join('\n');
	const r = parseJsonLines(`${page1}\n${page2}\n`);
	assert.deepEqual(r, { ok: true, values: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
	assert.deepEqual(parseJsonLines(''), { ok: true, values: [] });
	assert.deepEqual(parseJsonLines('\n\n'), { ok: true, values: [] });
	assert.deepEqual(parseJsonLines('7\n8\n'), { ok: true, values: [7, 8] }, 'numbers as in the labels listing');
	const bad = parseJsonLines('{"a":1}\n\nnot json at all\n{"b":2}');
	assert.deepEqual(bad, { ok: false, line: 3, text: 'not json at all' });
	const long = parseJsonLines(`{"ok":1}\n${'x'.repeat(500)}`);
	assert.ok(!long.ok && long.line === 2 && long.text.length === 200, 'the text is cut at 200 characters');
	// 150 items over two pages come back whole and in order
	const many = Array.from({ length: 150 }, (_, i) => JSON.stringify({ id: i }));
	const all = parseJsonLines([...many.slice(0, 100), ...many.slice(100)].join('\n'));
	assert.ok(all.ok && all.values.length === 150 && (all.values[149] as { id: number }).id === 149);
});
