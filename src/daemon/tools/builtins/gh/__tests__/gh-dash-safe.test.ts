import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	ghIssueManageTool, ghPrManageTool, ghProjectManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool,
} from '../manage.js';
import { ghProjectItemArchiveTool, ghProjectItemDeleteTool } from '../project.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghLabelTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
const families = [
	ghIssueManageTool, ghPrManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool, ghProjectManageTool,
	ghLabelTool, ghGistTool, ghSecretTool, ghVariableTool, ghCacheTool, ghSshKeyTool, ghGpgKeyTool,
];

test('gh-dash-safe.test.ts: a positional that starts with - is refused by every op of the manage and resources families and gh does not run', async () => {
	const gh = installFakeGh('ok', '');
	try {
		let positionals = 0;
		for (const tool of families) {
			for (const def of tool.ops) {
				for (const a of def.args) {
					const name = 'pos' in a ? a.pos : 'spread' in a ? a.spread : undefined;
					if (name === undefined) { continue; }
					positionals++;
					// every required field is given, so the only thing wrong is the positional that starts with '-'
					const input: Record<string, unknown> = { op: def.name };
					for (const k of def.required ?? []) { input[k] = 'x'; }
					input[name] = 'spread' in a ? ['-x'] : '-x';
					const r = await tool.execute(input, deps);
					assert.equal(r.success, false, `${tool.id} ${def.name} ${name}`);
					assert.match(r.output, new RegExp(`op ${def.name}: ${name} must not start with '-'`), `${tool.id} ${def.name} ${name}`);
				}
			}
		}
		assert.ok(positionals > 10, `only ${positionals} positionals were found`);
		assert.equal(gh.calls().length, 0, 'gh never ran');
	} finally { gh.restore(); }
});

test('gh-dash-safe.test.ts: gh:project:item-archive and gh:project:item-delete pass the project number as a positional, not --project-id', async () => {
	const gh = installFakeGh('ok', '');
	try {
		assert.equal((await ghProjectItemArchiveTool.execute({ number: 3, itemId: 'I', owner: 'o', undo: true }, deps)).success, true);
		assert.equal(gh.calls().at(-1), 'project item-archive 3 --id I --undo --owner o');
		assert.equal((await ghProjectItemDeleteTool.execute({ number: 3, itemId: 'I' }, deps)).success, true);
		assert.equal(gh.calls().at(-1), 'project item-delete 3 --id I');
		assert.ok(!gh.calls().some(c => c.includes('--project-id')));
	} finally { gh.restore(); }
});
