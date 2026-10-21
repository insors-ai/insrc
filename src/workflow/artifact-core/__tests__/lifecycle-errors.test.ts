import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../types.js';
import {
	IllegalTransitionError, LifecycleConflictError, ReviewRequiredError, TerminalArtifactError, UnreadableChildError,
} from '../types.js';

describe('lifecycle errors', () => {
	it('the five lifecycle error classes carry their name, reason and ids, and the module exports exactly eleven error classes', () => {
		const conflict = new LifecycleConflictError('LLD-0123456789abcdef-s1', 'hash-mismatch');
		assert.ok(conflict instanceof Error);
		assert.equal(conflict.name, 'LifecycleConflictError');
		assert.equal(conflict.reason, 'hash-mismatch');
		assert.equal(conflict.artifactId, 'LLD-0123456789abcdef-s1');
		assert.match(conflict.message, /LLD-0123456789abcdef-s1.*hash-mismatch.*person/);
		assert.equal(new LifecycleConflictError('x', 'log-ahead-of-head', 'custom').message, 'custom');

		const unreadable = new UnreadableChildError(['TASK-0123456789abcdef-s1-t1', 'TASK-0123456789abcdef-s1-t2']);
		assert.ok(unreadable instanceof Error);
		assert.equal(unreadable.name, 'UnreadableChildError');
		assert.deepEqual(unreadable.unreadable, ['TASK-0123456789abcdef-s1-t1', 'TASK-0123456789abcdef-s1-t2']);
		assert.match(unreadable.message, /t1.*t2/);

		for (const [Cls, name] of [
			[IllegalTransitionError, 'IllegalTransitionError'], [TerminalArtifactError, 'TerminalArtifactError'], [ReviewRequiredError, 'ReviewRequiredError'],
		] as const) {
			const e = new Cls('why');
			assert.ok(e instanceof Error);
			assert.equal(e.name, name);
			assert.equal(e.message, 'why');
		}

		assert.equal(Object.keys(core).length, 11);
		for (const Cls of Object.values(core)) assert.ok(Cls.prototype instanceof Error, Cls.name);
	});
});
