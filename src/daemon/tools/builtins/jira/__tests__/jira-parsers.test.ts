import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseAuthStatus, readBatch, readClonedKey, readCount, readVisibility } from '../readers.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');

test('jira-parsers.test.ts: readBatch handles all SUCCESS, all FAILURE at exit 0, partial, a count mismatch and the clone key from the message', () => {
  const ok = readBatch(fixture('batch-edit-success.json'));
  assert.equal(ok?.ok, true);
  assert.deepEqual(ok?.succeeded.map(e => e.id), ['IN-1']);
  assert.deepEqual(ok?.failed, []);
  // all FAILURE at exit 0: a missing key and a status the item cannot reach
  for (const name of ['batch-missing-key.json', 'batch-no-transition.json']) {
    const bad = readBatch(fixture(name));
    assert.equal(bad?.ok, false, name);
    assert.equal(bad?.succeeded.length, 0);
    assert.equal(bad?.failed.length, 1);
  }
  assert.equal(readBatch(fixture('batch-missing-key.json'))?.failed[0]?.id, 'IN-999');
  // partial: both lists are filled and the batch is not ok
  const partial = readBatch(fixture('batch-partial.json'));
  assert.equal(partial?.ok, false);
  assert.deepEqual(partial?.succeeded.map(e => e.id), ['IN-1']);
  assert.deepEqual(partial?.failed.map(e => e.id), ['IN-999']);
  // counts that disagree with the list are not ok even when every status is SUCCESS
  const mismatch = readBatch(JSON.stringify({ results: [{ status: 'SUCCESS', message: 'm', id: 'IN-1' }], totalCount: 2, successCount: 1 }));
  assert.equal(mismatch?.ok, false);
  assert.equal(readBatch(JSON.stringify({ results: [{ status: 'SUCCESS', message: 'm', id: 'IN-1' }], totalCount: 1, successCount: 0 }))?.ok, false);
  // an empty list is not ok; text that is not the shape is undefined
  assert.equal(readBatch(JSON.stringify({ results: [], totalCount: 0, successCount: 0 }))?.ok, false);
  assert.equal(readBatch('✓ done'), undefined);
  assert.equal(readBatch(JSON.stringify({ results: [{ status: 'SUCCESS' }], totalCount: 1, successCount: 1 })), undefined);
  // the clone's new key is in the message, not the result id (which is the source key)
  const clone = readBatch(fixture('batch-clone.json'));
  assert.equal(clone?.ok, true);
  assert.equal(clone?.succeeded[0]?.id, 'IN-1');
  assert.equal(readClonedKey(clone?.succeeded[0]?.message ?? ''), 'IN-3');
  assert.equal(readClonedKey('Work item IN-1 has been successfully edited'), undefined);
});

test('jira-parsers.test.ts: readCount and parseAuthStatus read recorded acli text', () => {
  assert.equal(readCount(fixture('count.txt')), 2);
  assert.equal(readCount('Number of work items in the search: 0'), 0);
  assert.equal(readCount('✓ Number of work items in the search: 1234\n'), 1234);
  assert.equal(readCount('3 work items'), undefined);
  assert.equal(readCount(''), undefined);
  assert.deepEqual(parseAuthStatus(fixture('auth-status.txt')), { signedIn: true, site: 'example.atlassian.net', email: 'user@example.com', authType: 'oauth' });
  assert.deepEqual(parseAuthStatus(fixture('auth-status-unauthorized.txt')), { signedIn: false });
  assert.equal(parseAuthStatus('').signedIn, false);
});

test('jira-parsers.test.ts: readVisibility group and role cases including count mismatch, heading only, unrecognised line and ANSI escapes', () => {
  // the recorded group table carries ANSI escapes and box characters
  const raw = fixture('visibility-group.txt');
  assert.ok(raw.includes('\u001b['), 'the recorded fixture has ANSI escapes');
  const groups = readVisibility(raw, 'group');
  assert.equal(groups?.groups.length, 26);
  assert.deepEqual(groups?.groups[0], { name: 'org-admins', id: '9cd994c5-146b-4711-8f60-c11d0c19c05b' });
  // the count must equal the parsed rows
  assert.equal(readVisibility(raw.replace('(26 total)', '(25 total)'), 'group'), undefined);
  assert.equal(readVisibility(raw.replace('(26 total)', '(27 total)'), 'group'), undefined);
  // heading only with a non-zero count, a missing heading and an unrecognised line are rejected
  assert.equal(readVisibility('✓ Available Groups (3 total):\n', 'group'), undefined);
  assert.equal(readVisibility('no groups here', 'group'), undefined);
  assert.equal(readVisibility(raw + '\nsomething else\n', 'group'), undefined);
  // '(0 total)' with no rows is the only empty group answer
  assert.deepEqual(readVisibility('✓ Available Groups (0 total):\n', 'group'), { groups: [] });
  assert.equal(readVisibility('✓ Available Groups (0 total):\n│ a │ b │\n', 'group'), undefined);
  // roles
  assert.deepEqual(readVisibility(fixture('visibility-role.txt'), 'role'), { roles: ['Administrators', 'atlassian-addons-project-access', 'jira-guest-member'] });
  assert.equal(readVisibility('✓ Available Roles:\n', 'role'), undefined);
  assert.equal(readVisibility('✓ Available Roles:\n- A\nnot a role line\n', 'role'), undefined);
  assert.equal(readVisibility('Roles: - A', 'role'), undefined);
  assert.deepEqual(readVisibility('\u001b[1m✓ Available Roles:\u001b[0m\n- A\n', 'role'), { roles: ['A'] });
});
