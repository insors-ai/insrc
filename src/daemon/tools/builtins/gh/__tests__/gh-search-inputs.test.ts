import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { ghSearchTool } from '../account.js';
import { buildArgv, isExpression } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
const op = (name: string) => ghSearchTool.ops.find(o => o.name === name)!;

test('gh-search-inputs.test.ts: comparison and range expressions pass through unchanged for comments, interactions, reactions, followers, forks, stars, size and the date qualifiers', async () => {
	const gh = installFakeGh('ok', '[]');
	try {
		const run = async (input: Record<string, unknown>): Promise<string> => {
			const before = gh.calls().length;
			const r = await ghSearchTool.execute(input, deps);
			assert.equal(r.success, true, `${JSON.stringify(input)}: ${r.output}`);
			assert.equal(gh.calls().length, before + 1);
			return gh.calls().at(-1)!;
		};
		// issues and prs: comments, interactions, reactions and the dates
		assert.equal(await run({ op: 'issues', query: 'crash', comments: '>100', interactions: '5..20', reactions: '>=5', created: '>=2024-01-01', updated: '2024-01-01..2024-02-01', closed: '<2025-06-30' }),
			'search issues --closed <2025-06-30 --comments >100 --created >=2024-01-01 --interactions 5..20 --reactions >=5 --updated 2024-01-01..2024-02-01 --json ' + op('issues').out.jsonFields!.join(',') + ' crash');
		assert.match(await run({ op: 'prs', query: 'fix', mergedAt: '2024-03-01..*', comments: '<10' }), /--comments <10 .*--merged-at 2024-03-01\.\.\* .*fix$/);
		// repos: followers, forks, stars, size and the dates
		assert.match(await run({ op: 'repos', query: 'cli', followers: '>1000', forks: '10..50', stars: '>=100', size: '<500', created: '*..2020-01-01', updated: '>2025-01-01' }),
			/--created \*\.\.2020-01-01 --followers >1000 --forks 10\.\.50 .*--size <500 --stars >=100 --updated >2025-01-01 .*cli$/);
		// commits: the two dates; code: size
		assert.match(await run({ op: 'commits', query: 'fix', authorDate: '>=2024-01-01', committerDate: '2024-01-01..2024-12-31' }), /--author-date >=2024-01-01 --committer-date 2024-01-01\.\.2024-12-31 .*fix$/);
		assert.match(await run({ op: 'code', query: 'TODO', size: '10..500' }), /--size 10\.\.500 --json .* TODO$/);
		// a query that starts with '-' (an exclusion) goes after --, so gh does not read it as a flag
		assert.match(await run({ op: 'issues', query: '-label:bug' }), / -- -label:bug$/);
		// array filters repeat the flag; a boolean qualifier can be switched off
		assert.match(await run({ op: 'issues', query: 'x', label: ['a', 'b'], owner: ['o1'], archived: false, noLabel: true }), /--archived=false --label a --label b .*--no-label .*--owner o1 /);
	} finally { gh.restore(); }

	// the expressions are accepted by the schema and by the op; nonsense is refused and gh does not run
	for (const good of ['>100', '5..20', '>=2024-01-01', '<5', '*..10', '10..*', '42']) { assert.equal(isExpression(good), true, good); }
	for (const bad of ['', '>', '..', 'a b', '5..20..30', '>>1', '=5']) { assert.equal(isExpression(bad), false, bad); }
	const schema = ghSearchTool.inputSchema as unknown as StructuredSchema;
	assert.equal(validateAgainstSchema(schema, { op: 'issues', query: 'x', comments: '>100', created: '2024-01-01..2024-02-01' }).ok, true);
	const gh2 = installFakeGh('ok', '[]');
	try {
		const r = await ghSearchTool.execute({ op: 'repos', query: 'x', stars: 'many' as never }, deps);
		assert.equal(r.success, true, 'a bare word is a legal bare value for gh to judge');
		const bad = await ghSearchTool.execute({ op: 'repos', query: 'x', stars: '> 100' }, deps);
		assert.equal(bad.success, false);
		assert.match(bad.error ?? '', /stars must be a number, size or date/);
		// an enum value that another op of the tool allows is refused by this one
		const sort = await ghSearchTool.execute({ op: 'prs', query: 'x', sort: 'stars' }, deps);
		assert.equal(sort.success, false);
		const matchBad = await ghSearchTool.execute({ op: 'code', query: 'x', match: ['title'] }, deps);
		assert.match(matchBad.error ?? '', /match must be one of file, path/);
	} finally { gh2.restore(); }
	assert.deepEqual(buildArgv(op('code'), { op: 'code', query: 'q', extension: 'ts' }).slice(0, 5), ['gh', 'search', 'code', '--extension', 'ts']);
});
