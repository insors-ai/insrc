import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { buildArgv, buildInputSchema, buildOutputSchema, defineGhFamily, field, lit, on, pos, refuseInput, rep, val } from '../op-table.js';
import type { OpDef } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';

const OPS: OpDef[] = [
	{ name: 'show', command: ['probe', 'show'], cls: 'none', limitS: 30, repo: true, fields: { number: field.int() }, required: ['number'], args: [pos('number')], out: { kind: 'text' } },
	{
		name: 'make', command: ['probe', 'make'], cls: 'common', limitS: 60, fields: {
			name: field.str(), file: field.str(), content: field.str(), color: field.oneOf(['red', 'green']), loud: field.bool(), tags: field.strs(),
			size: field.expr(), a: field.str(), b: field.str(), c: field.str(), note: field.str('', true),
		},
		oneOf: [['file', 'content']], atLeastOne: [['name', 'a']], exclusive: [['b', 'c']], with: { tags: ['name'] },
		args: [val('--name', 'name'), val('--color', 'color'), on('--loud', 'loud'), rep('--tag', 'tags'), lit('--yes')], out: { kind: 'mutation' },
	},
	{ name: 'list', command: ['probe', 'list'], cls: 'none', limitS: 30, fields: { limit: field.int() }, args: [val('-L', 'limit')], out: { kind: 'items', jsonFields: ['id', 'name'] } },
];

test('gh-op-schema.test.ts: requiredness, exclusive pairs, at-least-one groups, enums and expression strings of the builder', () => {
	const schema = buildInputSchema(OPS);
	const json = JSON.parse(JSON.stringify(schema)) as { required: string[]; additionalProperties: boolean; properties: Record<string, { enum?: string[]; type: string; minimum?: number }> };
	// op is always required; a field is required in the schema only when every op requires it
	assert.deepEqual(json.required, ['op']);
	assert.equal(json.additionalProperties, false);
	assert.deepEqual(json.properties['op']!.enum, ['show', 'make', 'list']);
	assert.deepEqual(json.properties['color']!.enum, ['red', 'green']);
	assert.equal(json.properties['number']!.type, 'integer');
	assert.equal(json.properties['number']!.minimum, 1);
	assert.ok('repo' in json.properties && 'cwd' in json.properties);

	const ok = (i: Record<string, unknown>) => validateAgainstSchema(schema as unknown as StructuredSchema, i).ok;
	assert.equal(ok({ op: 'show', number: 1 }), true);
	assert.equal(ok({ op: 'show', number: 0 }), false, 'below the minimum');
	assert.equal(ok({ op: 'show', number: 1.5 }), false, 'an integer field refuses a fraction');
	assert.equal(ok({ op: 'zap' }), false, 'an op outside the enum');
	assert.equal(ok({ op: 'make', color: 'blue' }), false, 'a value outside the enum');
	assert.equal(ok({ op: 'make', nope: 1 }), false, 'an unknown field');
	assert.equal(ok({ op: 'make', tags: [] }), false, 'an empty list');

	const op = (name: string) => OPS.find(o => o.name === name)!;
	// requiredness is per op
	assert.match(refuseInput(op('show'), {}) ?? '', /needs the field number/);
	assert.equal(refuseInput(op('show'), { number: 3, repo: 'o/r' }), undefined);
	// a field the op does not accept
	assert.match(refuseInput(op('show'), { number: 3, color: 'red' }) ?? '', /does not accept the field color/);
	assert.match(refuseInput(op('list'), { repo: 'o/r' }) ?? '', /does not accept the field repo/);
	// exactly one of file, content
	assert.match(refuseInput(op('make'), { name: 'x' }) ?? '', /exactly one of file, content/);
	assert.match(refuseInput(op('make'), { name: 'x', file: 'f', content: 'c' }) ?? '', /exactly one of file, content/);
	assert.equal(refuseInput(op('make'), { name: 'x', file: 'f' }), undefined);
	// at least one of name, a
	assert.match(refuseInput(op('make'), { file: 'f' }) ?? '', /at least one of name, a/);
	assert.equal(refuseInput(op('make'), { a: 'v', content: 'c' }), undefined);
	// an exclusive pair: not both
	assert.match(refuseInput(op('make'), { name: 'x', file: 'f', b: '1', c: '2' }) ?? '', /at most one of b, c/);
	assert.equal(refuseInput(op('make'), { name: 'x', file: 'f', b: '1' }), undefined);
	// a field only with another
	assert.match(refuseInput(op('make'), { a: 'x', file: 'f', tags: ['t'] }) ?? '', /tags only together with name/);
	assert.equal(refuseInput(op('make'), { name: 'x', file: 'f', tags: ['t'] }), undefined);
	// a false boolean counts as not given
	assert.equal(refuseInput(op('make'), { name: 'x', file: 'f', loud: false }), undefined);
	// expression strings: comparisons, ranges, bare values; anything else is refused
	for (const good of ['>100', '>=2024-01-01', '<5', '10..50', '2024-01-01..2024-02-01', '*..10', '10..*', '42', '1k']) {
		assert.equal(refuseInput(op('make'), { name: 'x', file: 'f', size: good }), undefined, good);
	}
	for (const bad of ['> 100', 'big small', '>>5', '10..20..30', '']) {
		assert.match(refuseInput(op('make'), { name: 'x', file: 'f', size: bad }) ?? '', /must be a number, size or date/, JSON.stringify(bad));
	}
	// a string that may be empty is allowed to be; others are not
	const noteSchema = JSON.parse(JSON.stringify(buildInputSchema([op('make')]))) as { properties: Record<string, { minLength?: number }> };
	assert.equal(noteSchema.properties['note']!.minLength, undefined);
	assert.equal(noteSchema.properties['name']!.minLength, 1);
});

test('gh-op-schema.test.ts: the argv follows the op arguments in order, and the output union carries the literal op', async () => {
	const make = OPS.find(o => o.name === 'make')!;
	assert.deepEqual(buildArgv(make, { op: 'make', name: 'n', color: 'red', loud: true, tags: ['a', 'b'] }), ['gh', 'probe', 'make', '--name', 'n', '--color', 'red', '--loud', '--tag', 'a', '--tag', 'b', '--yes']);
	assert.deepEqual(buildArgv(make, { op: 'make', name: 'n', loud: false }), ['gh', 'probe', 'make', '--name', 'n', '--yes']);
	assert.deepEqual(buildArgv(OPS[0]!, { op: 'show', number: 4, repo: 'o/r' }), ['gh', 'probe', 'show', '4', '-R', 'o/r']);
	assert.deepEqual(buildArgv(OPS[2]!, { op: 'list', limit: 5 }), ['gh', 'probe', 'list', '-L', '5', '--json', 'id,name']);

	const out = buildOutputSchema(OPS);
	assert.ok(Value.Check(out, { op: 'show', text: 'x' }));
	assert.ok(Value.Check(out, { op: 'make', ok: true, target: 't', message: 'm' }));
	assert.ok(Value.Check(out, { op: 'list', count: 1, items: [{ id: 1, name: 'a' }] }));
	assert.equal(Value.Check(out, { op: 'show', ok: true, target: 't', message: 'm' }), false, 'the literal op selects the member');
	assert.equal(Value.Check(out, { op: 'other', text: 'x' }), false);

	// end to end under a fake gh: the literal op comes back, a rejected input never runs gh
	const gh = installFakeGh('ok', '[{"id":1,"name":"a"}]');
	try {
		const tool = defineGhFamily({ id: 'gh_probe_family', description: 'probe', ops: OPS });
		const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
		const r = await tool.execute({ op: 'list', limit: 5 }, deps);
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { op: 'list', count: 1, items: [{ id: 1, name: 'a' }] });
		assert.deepEqual(gh.calls(), ['probe list -L 5 --json id,name']);
		const bad = await tool.execute({ op: 'show' }, deps);
		assert.equal(bad.success, false);
		assert.equal(bad.failure?.kind, 'rejected');
		assert.equal(gh.calls().length, 1, 'gh did not run for a refused input');
	} finally { gh.restore(); }
});
