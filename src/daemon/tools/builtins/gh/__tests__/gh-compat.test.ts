import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import type { Tool } from '../../../types.js';
import * as actions from '../actions.js';
import * as issue from '../issue.js';
import * as pr from '../pr.js';
import * as project from '../project.js';
import * as release from '../release.js';
import * as repo from '../repo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const snapshot = (JSON.parse(readFileSync(join(HERE, '..', '..', '..', '__tests__', 'fixtures', 'approval-snapshot.json'), 'utf8')) as {
	tools: Array<{ id: string; inputSchema: unknown }>;
}).tools;

const converted = (m: Record<string, unknown>): Tool[] => Object.values(m).filter((v): v is Tool => typeof v === 'object' && v !== null && 'inputSchema' in v);

test("gh-compat.test.ts: issue and pr tools' input schemas serialise identically to the snapshot", () => {
	const tools = [...converted(issue), ...converted(pr)];
	assert.equal(tools.length, 20, 'eight issue tools and twelve pr tools');
	for (const tool of tools) {
		const row = snapshot.find(s => s.id === tool.id);
		assert.ok(row, `${tool.id} is in the snapshot`);
		assert.deepEqual(JSON.parse(JSON.stringify(tool.inputSchema)), row.inputSchema, tool.id);
		assert.ok(tool.outputSchema !== undefined, `${tool.id} declares an output schema`);
	}
});

test("gh-compat.test.ts: repo, release and project tools' input schemas serialise identically to the snapshot, extraArgs and newTag unchanged", () => {
	const tools = [...converted(repo), ...converted(release), ...converted(project)];
	assert.equal(tools.length, 20, 'six repo tools, six release tools and eight project tools');
	for (const tool of tools) {
		const row = snapshot.find(s => s.id === tool.id);
		assert.ok(row, `${tool.id} is in the snapshot`);
		assert.deepEqual(JSON.parse(JSON.stringify(tool.inputSchema)), row.inputSchema, tool.id);
		assert.ok(tool.outputSchema !== undefined, `${tool.id} declares an output schema`);
	}
	const props = (id: string) => (JSON.parse(JSON.stringify(tools.find(t => t.id === id)!.inputSchema)) as { properties: Record<string, unknown> }).properties;
	assert.deepEqual(props('gh_repo_clone')['extraArgs'], { type: 'array', items: { type: 'string' }, description: 'Extra git flags, e.g. ["--depth=1"].' });
	assert.ok('newTag' in props('gh_release_edit'));
});

test("gh-compat.test.ts: actions tools' input schemas serialise identically to the snapshot", () => {
	const tools = converted(actions);
	assert.equal(tools.length, 6);
	for (const tool of tools) {
		const row = snapshot.find(s => s.id === tool.id);
		assert.ok(row, `${tool.id} is in the snapshot`);
		assert.deepEqual(JSON.parse(JSON.stringify(tool.inputSchema)), row.inputSchema, tool.id);
		assert.ok(tool.outputSchema !== undefined, `${tool.id} declares an output schema`);
	}
});
