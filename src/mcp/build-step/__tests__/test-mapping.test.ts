/**
 * The checks on the builder's mapping (LLD-9b4a74dc-S001, task t2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkTestMapping, type NamedTest, type TestMappingEntry } from '../test-mapping.js';

const TRACKED = ['src/a/__tests__/x.test.ts', 'src/a/__tests__/y.test.ts', 'src/a/x.ts', 'README.md'];
const NAMED: NamedTest[] = [
	{ level: 'unit',        name: 'the unit one' },
	{ level: 'integration', name: 'the integration one' },
	{ level: 'contract',    name: 'the contract one' },
	{ level: 'live',        name: 'the live one' },
	{ level: 'smoke',       name: 'the smoke one' },
	{                       name: 'the one with no level' },
];
const X = { file: 'src/a/__tests__/x.test.ts', title: 't' };

function faultsOf(mapping: unknown[]): readonly string[] {
	return checkTestMapping(mapping as TestMappingEntry[], NAMED, TRACKED);
}
/** Exactly one fault, matching. */
function oneFault(mapping: unknown[], re: RegExp): void {
	const f = faultsOf(mapping);
	assert.equal(f.length, 1, JSON.stringify(f));
	assert.match(f[0]!, re);
}

test("a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level", () => {
	oneFault([{ name: 'no such test', cases: [X] }], /tests\[0\]: 'no such test' is not a test this Task names/);
	oneFault([{ name: 'the unit one', cases: [X] }, { name: 'the unit one', cases: [X] }], /tests\[1\]: 'the unit one' is named more than once/);
	// Not tracked; tracked but not a test file; not a '.test.ts' name.
	oneFault([{ name: 'the unit one', cases: [{ file: 'src/a/__tests__/gone.test.ts', title: 't' }] }], /cases\[0\]: 'src\/a\/__tests__\/gone\.test\.ts' is not a tracked '\.test\.ts' file/);
	oneFault([{ name: 'the unit one', cases: [{ file: 'src/a/x.ts', title: 't' }] }], /not a tracked '\.test\.ts' file/);
	// A path that leaves the repository, in each form.
	for (const file of ['../other/__tests__/x.test.ts', 'src/../../x.test.ts', '/etc/x.test.ts', 'C:\\x.test.ts']) {
		oneFault([{ name: 'the unit one', cases: [{ file, title: 't' }] }], /is not a path inside the repository/);
	}
	oneFault([{ name: 'the unit one', cases: [{ file: X.file, title: '' }] }], /cases\[0\]: 'title' is empty/);
	oneFault([{ name: 'the unit one' }], /tests\[0\]: the entry has neither cases nor a reported result/);
	oneFault([{ name: 'the unit one', cases: [] }], /neither cases nor a reported result/);
	// A reported result on anything but a live or smoke test.
	const reported = { result: 'pass', evidence: 'run 12 in the build record' };
	oneFault([{ name: 'the unit one', reported }], /only for a 'live' or 'smoke' test; 'the unit one' is 'unit'/);
	oneFault([{ name: 'the integration one', reported }], /'the integration one' is 'integration'/);
	oneFault([{ name: 'the contract one', reported }], /'the contract one' is 'contract'/);
	oneFault([{ name: 'the one with no level', reported }], /'the one with no level' has no level/);
	// Cases beside the reported result do not excuse it.
	oneFault([{ name: 'the unit one', cases: [X], reported }], /only for a 'live' or 'smoke' test/);
	oneFault([{ name: 'the live one', reported: { result: 'pass', evidence: '  ' } }], /reported: 'evidence' is empty/);
	oneFault([{ name: 'the live one', reported: { result: 'maybe', evidence: 'e' } }], /'result' must be 'pass' or 'fail'/);
	// A key the shape does not have, on an entry and on a case.
	oneFault([{ name: 'the unit one', cases: [X], mutations: [] }], /tests\[0\]: unknown key 'mutations'/);
	oneFault([{ name: 'the unit one', cases: [{ ...X, line: 3 }] }], /cases\[0\]: unknown key 'line'/);

	// Every fault is listed, not the first only.
	const all = faultsOf([
		{ name: 'no such test', cases: [{ file: '../x.test.ts', title: '' }] },
		{ name: 'the unit one', reported },
		{ name: 'the unit one' },
	]);
	assert.deepEqual(all.map(f => f.replace(/:.*/, '')), ['tests[0]', 'tests[0].cases[0]', 'tests[0].cases[0]', 'tests[1].reported', 'tests[2]', 'tests[2]']);
});

test('a correct mapping with cases, with a reported result on a live test, and with both, is accepted', () => {
	assert.deepEqual(faultsOf([]), []);
	assert.deepEqual(faultsOf([
		{ name: 'the unit one', cases: [X, { file: 'src/a/__tests__/y.test.ts', title: 'another' }] },
		{ name: 'the integration one', cases: [X] },
		{ name: 'the live one', reported: { result: 'pass', evidence: 'run 12 in the build record' } },
		{ name: 'the smoke one', cases: [X], reported: { result: 'fail', evidence: 'see the log' } },
		{ name: 'the one with no level', cases: [X] },
	]), []);
	// Two entries may point at the same case.
	assert.deepEqual(faultsOf([{ name: 'the unit one', cases: [X] }, { name: 'the contract one', cases: [X] }]), []);
});
