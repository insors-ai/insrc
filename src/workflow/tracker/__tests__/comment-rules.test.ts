import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { actorOfLogin, classifyComment, feedbackIdOfComment, isFrameworkComment } from '../comment-rules.js';

describe('comment-rules', () => {
	it('classifyComment gives revision-request, suggestion or comment from the first line only', () => {
		for (const text of ['/revise rename the field', '/REVISE', 'Revision: use the other name', 'revision:x', '  \n/revise after blank lines']) assert.equal(classifyComment(text), 'revision-request', text);
		for (const text of ['/suggest a shorter title', '/Suggest', 'Suggestion: split it', 'suggestion:x']) assert.equal(classifyComment(text), 'suggestion', text);
		// only the first line decides: a later command is just text, and the first line's command wins
		assert.equal(classifyComment('looks fine\n/revise this'), 'comment');
		assert.equal(classifyComment('/revise this\n/suggest that'), 'revision-request');
		// ordinary prose that starts with the word is a plain comment: only the command forms count
		for (const text of ['Suggestion for the title: rename it', 'I suggest we rename it', 'Revision of the plan looks good', '/reviser', '/suggestion', '', '   ']) assert.equal(classifyComment(text), 'comment', JSON.stringify(text));
	});

	it('isFrameworkComment recognises every insrc marker and no human text', () => {
		for (const text of [
			'<!-- insrc:post:LLD-0123456789abcdef-s1:design -->\n## LLD',
			'<!-- insrc:post:PLAN-0123456789abcdef-s1:plan -->\n<!-- insrc:review -->\nreport',
			'<!-- insrc:handoff -->\nhanded off',
			'<!-- insrc:attach:TASK-0123456789abcdef-s1-t1 -->\nAttached TASK `x`: https://github.com/o/r/blob/a/b.md',
			'<!-- insrc:feedback:TASK-0123456789abcdef-s1-t1:abc -->\nfeedback',
			'text before\n<!--insrc:review-->',
		]) assert.equal(isFrameworkComment(text), true, text);
		for (const text of [
			'looks good to me',
			'/revise rename it',
			'<!-- a human html comment -->',
			'<!-- insrc --> with no kind',
			'Attached TASK `TASK-0123456789abcdef-s1-t1`: https://github.com/o/r/blob/a/b.md',
			'',
		]) assert.equal(isFrameworkComment(text), false, text);
	});

	it('the author and the entry id are derived from a tracker comment, a mixed-case login lowercased', () => {
		assert.deepEqual(actorOfLogin('Subho-Ghosh'), { id: 'github:subho-ghosh', kind: 'person', name: 'Subho-Ghosh', properties: {} });
		assert.equal(actorOfLogin('alice').id, 'github:alice');
		assert.equal(actorOfLogin('octo[bot]').id, 'github:octo[bot]');
		// an empty or blank author (a deleted user) is the unknown actor, never a malformed id
		for (const login of ['', '   ']) assert.deepEqual(actorOfLogin(login), { id: 'github:unknown', kind: 'person', properties: {} });
		assert.equal(actorOfLogin('has space').id, 'github:unknown');

		assert.equal(feedbackIdOfComment('4711'), 'tracker:4711');
		assert.equal(feedbackIdOfComment('4711'), feedbackIdOfComment('4711'));
	});
});
