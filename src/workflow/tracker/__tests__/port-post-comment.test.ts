import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from './_legacy-table.js';
import type { Reference } from '../../artifact-core/types.js';

afterEach(() => _setTrackerExecForTests());

const artifact: Reference = { entityId: 'TASK-0123456789abcdef-s1-t2', type: 'TASK', relation: 'documents' };

test("the GitHub adapter's postComment answers the comment id and attach posts its marker", async () => {
	const calls: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => { calls.push([...args]); return '4242\n'; });
	const port = createGithubTracker('o', 'r');

	// one comment, its body as given, and its id answered
	const posted = (await port.postComment('o/r#9', '<!-- insrc:feedback:X:Y -->\nhello'));
	assert.deepEqual(posted, { ok: true, value: { externalId: '4242' } });
	assert.equal(calls.length, 1);
	assert.ok(calls[0]!.includes('POST') && calls[0]!.includes('repos/o/r/issues/9/comments'));
	assert.equal(calls[0]![calls[0]!.indexOf('-f') + 1], 'body=<!-- insrc:feedback:X:Y -->\nhello');

	// attach posts its marker as the first line, then the Attached line with the link
	const attached = (await port.attach('o/r#9', artifact, 'https://github.com/o/r/blob/abc/docs/TASK.md'));
	assert.deepEqual(attached, { ok: true, value: { externalId: '4242' } });
	const body = calls[1]![calls[1]!.indexOf('-f') + 1]!;
	assert.equal(body, 'body=<!-- insrc:attach:TASK-0123456789abcdef-s1-t2 -->\nAttached TASK `TASK-0123456789abcdef-s1-t2`: https://github.com/o/r/blob/abc/docs/TASK.md');

	// a post that fails, or that answers no id, is a failure and never a made-up id
	_setTrackerExecForTests(() => { throw Object.assign(new Error('boom'), { stderr: 'You are not logged in. Run gh auth login' }); });
	const down = (await createGithubTracker('o', 'r').postComment('o/r#9', 'x'));
	assert.equal(down.ok, false);
	assert.equal(!down.ok && down.kind, 'missing-signin');
	_setTrackerExecForTests(() => '');
	assert.equal((await createGithubTracker('o', 'r').postComment('o/r#9', 'x')).ok, false);

	// the older comment call is unchanged: it posts and answers nothing
	const seen: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => { seen.push([...args]); return ''; });
	const plain = (await createGithubTracker('o', 'r').issueOps.comment('o/r#9', 'plain'));
	assert.equal(plain.ok, true);
	assert.ok(seen[0]!.includes('comment') || seen[0]!.some(a => a.includes('comments')));
});
