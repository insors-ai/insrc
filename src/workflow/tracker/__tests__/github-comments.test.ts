import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from '../github.js';
import type { Reference } from '../../artifact-core/types.js';

afterEach(() => _setTrackerExecForTests());

const row = (id: number, at: string, text: string, author = 'alice') => JSON.stringify({ id, author, text, at, url: `https://github.com/o/r/issues/7#issuecomment-${id}` });
const artifact: Reference = { entityId: 'LLD-0123456789abcdef-s6', type: 'LLD', relation: 'documents' };

test("the GitHub adapter's listComments pages comments in time order and passes since, attach posts one comment holding the link and returns its id, and a failing gh gives a classified failure and never an empty list", () => {
	const calls: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => {
		calls.push([...args]);
		if (args.includes('POST')) return '987654321\n';
		// --paginate prints each page's rows one after the other: here the pages arrive out of order and with a tie
		return [row(12, '2026-10-21T10:00:00Z', 'second page, later'), row(5, '2026-10-21T09:00:00Z', 'first page'), row(3, '2026-10-21T09:00:00Z', 'same instant, lower id')].join('\n');
	});
	const port = createGithubTracker('o', 'r');

	const listed = port.listComments('o/r#7', '2026-10-20T00:00:00Z');
	assert.ok(listed.ok);
	assert.deepEqual(listed.value.map(c => c.externalId), ['3', '5', '12'], 'ascending by time, then by id');
	assert.deepEqual(listed.value[2], { externalId: '12', author: 'alice', text: 'second page, later', at: '2026-10-21T10:00:00Z', url: 'https://github.com/o/r/issues/7#issuecomment-12' });
	const listCall = calls[0]!;
	assert.ok(listCall.includes('--paginate'), 'every page is read');
	assert.ok(listCall.some(a => a.startsWith('repos/o/r/issues/7/comments?') && a.includes('since=2026-10-20T00%3A00%3A00Z')), 'since is passed to gh');
	port.listComments('o/r#7');
	assert.ok(!calls[1]!.some(a => a.includes('since=')), 'no since, no filter');

	const attached = port.attach('o/r#7', artifact, 'https://github.com/o/r/blob/abc123/docs/LLD.md');
	assert.deepEqual(attached, { ok: true, value: { externalId: '987654321' } });
	const post = calls[2]!;
	assert.equal(calls.filter(c => c.includes('POST')).length, 1, 'one comment');
	assert.ok(post.includes('repos/o/r/issues/7/comments'));
	const body = post[post.indexOf('-f') + 1]!;
	assert.match(body, /^body=Attached LLD `LLD-0123456789abcdef-s6`: https:\/\/github\.com\/o\/r\/blob\/abc123\/docs\/LLD\.md$/);

	// a failing gh is a classified failure, never an empty list
	_setTrackerExecForTests(() => { throw Object.assign(new Error('boom'), { stderr: 'You are not logged in. Run gh auth login' }); });
	const down = createGithubTracker('o', 'r').listComments('o/r#7');
	assert.equal(down.ok, false);
	assert.equal(!down.ok && down.kind, 'missing-signin');
	_setTrackerExecForTests(() => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); });
	const gone = createGithubTracker('o', 'r').attach('o/r#7', artifact, 'https://x');
	assert.equal(!gone.ok && gone.kind, 'missing-tool');

	// an answer that is not comment rows is a failure too, as is a post that returns no id
	_setTrackerExecForTests(() => 'not json');
	const odd = createGithubTracker('o', 'r').listComments('o/r#7');
	assert.equal(odd.ok, false);
	_setTrackerExecForTests(() => '');
	assert.equal(createGithubTracker('o', 'r').attach('o/r#7', artifact, 'https://x').ok, false);
	// an empty listing is a real empty list
	_setTrackerExecForTests(() => '');
	assert.deepEqual(createGithubTracker('o', 'r').listComments('o/r#7'), { ok: true, value: [] });
});
