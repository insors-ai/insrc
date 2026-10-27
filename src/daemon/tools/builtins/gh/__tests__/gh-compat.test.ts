import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { registerBuiltinTools } from '../../index.js';
import { getTool } from '../../../registry.js';
import type { Tool } from '../../../types.js';
import { CASES } from './_cases.js';
import { installFakeGh } from './_fakegh.js';
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

// the snapshot is pinned and never edited; a tool whose input was corrected afterwards is compared with its corrected schema instead.
// item-archive and item-delete passed --project-id, a flag gh 2.46.0 lacks; they take the project number as a positional.
const projectItemSchema = (extra: Record<string, unknown>) => ({
	type: 'object', additionalProperties: false, required: ['number', 'itemId'],
	properties: { cwd: { type: 'string' }, number: { type: 'number', minimum: 1, description: 'Project number.' }, itemId: { type: 'string' }, owner: { type: 'string' }, ...extra },
});
const CHANGED_SINCE_SNAPSHOT: Record<string, unknown> = {
	'gh:project:item-archive': projectItemSchema({ undo: { type: 'boolean', description: 'Unarchive instead.' } }),
	'gh:project:item-delete': projectItemSchema({}),
};

// Story s10: gh_pr_view gained the optional jsonFields input; every other property is the snapshot's.
const PR_VIEW_JSON_FIELDS = {
	description: 'Extra gh JSON fields to return besides the default ones: state, mergedAt, reviewDecision, reviews, headRefName, url.',
	type: 'array',
	items: { anyOf: ['state', 'mergedAt', 'reviewDecision', 'reviews', 'headRefName', 'url'].map(c => ({ const: c, type: 'string' })) },
};
const withJsonFields = (schema: unknown) => { const s = schema as { properties: Record<string, unknown> }; return { ...s, properties: { ...s.properties, jsonFields: PR_VIEW_JSON_FIELDS } }; };

test("gh-compat.test.ts: issue and pr tools' input schemas serialise identically to the snapshot", () => {
	const tools = [...converted(issue), ...converted(pr)];
	assert.equal(tools.length, 20, 'eight issue tools and twelve pr tools');
	for (const tool of tools) {
		const row = snapshot.find(s => s.id === tool.id);
		assert.ok(row, `${tool.id} is in the snapshot`);
		assert.deepEqual(JSON.parse(JSON.stringify(tool.inputSchema)), tool.id === 'gh_pr_view' ? withJsonFields(row.inputSchema) : row.inputSchema, tool.id);
		assert.ok(tool.outputSchema !== undefined, `${tool.id} declares an output schema`);
	}
});

test("gh-compat.test.ts: repo, release and project tools' input schemas serialise identically to the snapshot, extraArgs and newTag unchanged", () => {
	const tools = [...converted(repo), ...converted(release), ...converted(project)];
	assert.equal(tools.length, 20, 'six repo tools, six release tools and eight project tools');
	for (const tool of tools) {
		const row = snapshot.find(s => s.id === tool.id);
		assert.ok(row, `${tool.id} is in the snapshot`);
		assert.deepEqual(JSON.parse(JSON.stringify(tool.inputSchema)), CHANGED_SINCE_SNAPSHOT[tool.id] ?? row.inputSchema, tool.id);
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

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
const OLD_IDS = snapshot.map(t => t.id).filter(id => id.startsWith('gh_') || id.startsWith('gh:'));

test('gh-compat.test.ts: the 46 existing tool ids are all still registered', () => {
	registerBuiltinTools();
	assert.equal(OLD_IDS.length, 46);
	for (const id of OLD_IDS) { assert.ok(getTool(id), `${id} is registered`); }
});

async function argvOf(tool: Tool, input: Record<string, unknown>): Promise<string[]> {
	const gh = installFakeGh('ok', '');
	try {
		const r = await tool.execute(input, deps);
		assert.equal(r.success, true, `${tool.id}: ${r.output}`);
		return gh.calls();
	} finally { gh.restore(); }
}

test('gh-compat.test.ts: gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add accept their old inputs and run the same gh argv', async () => {
	registerBuiltinTools();
	const get = (id: string): Tool => getTool(id)!;
	assert.deepEqual(await argvOf(get('gh_pr_create'), { title: 'T', body: 'B', base: 'main', head: 'f', draft: true, labels: ['a', 'b'], repo: 'o/r' }),
		['pr create -t T -b B -B main -H f -d -l a,b -R o/r']);
	assert.deepEqual(await argvOf(get('gh_issue_comment'), { number: 7, body: 'hi', repo: 'o/r' }), ['issue comment 7 -b hi -R o/r']);
	assert.deepEqual(await argvOf(get('gh_release_delete'), { tag: 'v1', cleanupTag: true, repo: 'o/r' }), ['release delete v1 -y --cleanup-tag -R o/r']);
	assert.deepEqual(await argvOf(get('gh:project:item-add'), { number: 2, url: 'https://github.com/o/r/issues/1', owner: 'o' }),
		['project item-add 2 --url https://github.com/o/r/issues/1 --owner o']);
});

test('gh-compat.test.ts: gh_repo_clone keeps extraArgs and forwards it after --, and gh_release_edit keeps newTag, unchanged apart from their approval class', async () => {
	registerBuiltinTools();
	assert.deepEqual(await argvOf(getTool('gh_repo_clone')!, { repo: 'o/r', dir: 'd', extraArgs: ['--depth=1'] }), ['repo clone o/r d -- --depth=1']);
	assert.deepEqual(await argvOf(getTool('gh_repo_clone')!, { repo: 'o/r' }), ['repo clone o/r']);
	assert.deepEqual(await argvOf(getTool('gh_release_edit')!, { tag: 'v1', newTag: 'v2', title: 'T' }), ['release edit v1 --tag v2 -t T']);
});

test('gh-compat.test.ts: existing result data (count, repos, runs, workflows, number, diffBytes, truncated, runId, jobs) keep their shape, with only truncated added to gh_run_view', async () => {
	const keys = new Map<string, string[]>();
	for (const [tool, input, stdout, logs] of CASES) {
		const gh = installFakeGh('ok', stdout, logs);
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
			keys.set(tool.id, Object.keys(r.data as object).sort());
		} finally { gh.restore(); }
	}
	assert.deepEqual(keys.get('gh_repo_list'), ['count', 'repos']);
	assert.deepEqual(keys.get('gh_run_list'), ['count', 'runs']);
	assert.deepEqual(keys.get('gh_workflow_list'), ['count', 'workflows']);
	assert.deepEqual(keys.get('gh_issue_list'), ['count', 'issues']);
	assert.deepEqual(keys.get('gh_pr_list'), ['count', 'prs']);
	assert.deepEqual(keys.get('gh_release_list'), ['count', 'releases']);
	assert.deepEqual(keys.get('gh_project_list'), ['count', 'projects']);
	assert.deepEqual(keys.get('gh_pr_checks'), ['checks', 'number']);
	assert.deepEqual(keys.get('gh_pr_files'), ['files', 'number']);
	assert.deepEqual(keys.get('gh_issue_edit'), ['number']);
	assert.deepEqual(keys.get('gh_issue_comment'), ['number', 'url']);
	assert.deepEqual(keys.get('gh_issue_close'), ['number', 'op']);
	assert.deepEqual(keys.get('gh_pr_diff'), ['diffBytes', 'number', 'truncated']);
	assert.deepEqual(keys.get('gh_run_view'), ['jobs', 'runId', 'truncated']);
	assert.deepEqual(keys.get('gh_run_rerun'), ['runId']);
	assert.deepEqual(keys.get('gh_repo_clone'), ['dir', 'repo']);
	assert.deepEqual(keys.get('gh_release_create'), ['tag', 'url']);
});

test('gh-compat.test.ts: legacy failure texts stay in output and error', async () => {
	// gh fails with its own text: '[id] <text>' in output, the bare text in error
	for (const [tool, input] of CASES) {
		const gh = installFakeGh('fail404');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, false, tool.id);
			assert.equal(r.error, 'HTTP 404: not found', tool.id);
			assert.equal(r.output, `[${tool.id}] HTTP 404: not found`, tool.id);
		} finally { gh.restore(); }
	}
	// gh is not installed: the old spawn text and the old error
	const savedPath = process.env['PATH'];
	process.env['PATH'] = mkdtempSync(join(tmpdir(), 'insrc-nogh-'));
	try {
		const r = await getTool('gh_issue_list')!.execute({}, deps);
		assert.equal(r.success, false);
		assert.equal(r.error, 'gh not found');
		assert.match(r.output, /^\[gh_issue_list\] gh CLI not on PATH or failed to spawn -- /);
		assert.equal(r.failure?.kind, 'missing-tool');
	} finally { process.env['PATH'] = savedPath; }
	// a missing required input keeps its old text
	const missing = await getTool('gh_issue_view')!.execute({}, deps);
	assert.equal(missing.output, '[gh_issue_view] missing number');
	assert.equal(missing.error, 'missing number');
});
