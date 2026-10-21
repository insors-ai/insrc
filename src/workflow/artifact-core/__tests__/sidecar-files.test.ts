import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { FileSidecarStore } from '../sidecar-store.js';

const H = '2f27754d4ad00b8e';

describe('sidecar-files', () => {
	const store = new FileSidecarStore('/repo');

	it("filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files, and mergeAttributes returns the two union rules", () => {
		assert.deepEqual(store.filesOf(`LLD-${H}-s4`), {
			head:     `.insrc/artifacts/LLD-${H}-s4.json`,
			log:      `.insrc/artifacts/LLD-${H}-s4.log.jsonl`,
			feedback: `.insrc/artifacts/LLD-${H}-s4.feedback.jsonl`,
		});
		const a = store.filesOf(`TASK-${H}-s4-t1`);
		const b = store.filesOf(`TASK-${H}-s4-t2`);
		assert.equal(a.log, `.insrc/artifacts/TASKS-${H}-s4.log.jsonl`);
		assert.equal(a.feedback, `.insrc/artifacts/TASKS-${H}-s4.feedback.jsonl`);
		assert.equal(a.log, b.log);
		assert.notEqual(a.head, b.head);
		assert.equal(store.filesOf(`TASKS-${H}-s4`).log, a.log);
		assert.notEqual(store.filesOf(`TASK-${H}-s5-t1`).log, a.log);
		assert.throws(() => store.filesOf('not-an-id'), InvalidArtifactKeyError);
		assert.deepEqual(store.mergeAttributes(), [
			'.insrc/artifacts/*.log.jsonl merge=union',
			'.insrc/artifacts/*.feedback.jsonl merge=union',
		]);
	});
});
