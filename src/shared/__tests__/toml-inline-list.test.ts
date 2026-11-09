import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moveInlineListToTables, TomlInlineListError } from '../toml-inline-list.js';

const move = (text: string): string => moveInlineListToTables(text, 'mcp_servers');

test('a config with no inline list comes back unchanged', () => {
	for (const text of ['', 'theme = "x"\n', 'theme = "x"\n\n[[mcp_servers]]\nname = "a"\n']) assert.equal(move(text), text);
});

test('an empty inline list is removed and every other line is kept', () => {
	assert.equal(move('theme = "x"\nmcp_servers = []\n\n[tools.bash]\nmode = 1\n'), 'theme = "x"\n\n[tools.bash]\nmode = 1\n');
});

test('an empty list in a file that also has tables under the key is repaired', () => {
	assert.equal(
		move('a = 1\nmcp_servers = []\n\n[[mcp_servers]]\nname = "insrc"\n'),
		'a = 1\n\n[[mcp_servers]]\nname = "insrc"\n',
	);
});

test('entries in the form Vibe saves become tables after everything else', () => {
	const text = 'a = 1\nmcp_servers = [\n    { name = "docs", transport = "stdio", env = { A = "b" } },\n    { name = "two", args = ["x", "y"] },\n]\n\n[other]\nb = 2\n';
	assert.equal(move(text), [
		'a = 1',
		'',
		'[other]',
		'b = 2',
		'',
		'[[mcp_servers]]',
		'name = "docs"',
		'transport = "stdio"',
		'env = { A = "b" }',
		'',
		'[[mcp_servers]]',
		'name = "two"',
		'args = ["x", "y"]',
		'',
	].join('\n'));
});

test('commas, brackets and hashes inside strings do not split an entry', () => {
	assert.equal(
		move(`mcp_servers = [{ name = "a,]}#b", path = 'c:\\d,e' }]\n`),
		`[[mcp_servers]]\nname = "a,]}#b"\npath = 'c:\\d,e'\n`,
	);
});

test('only the root-level key is moved', () => {
	const inTable = 'a = 1\n\n[other]\nmcp_servers = []\n';
	assert.equal(move(inTable), inTable);
	const inString = 'notes = """\nmcp_servers = []\n"""\n';
	assert.equal(move(inString), inString);
	const inArray = 'list = [\n  # mcp_servers = []\n  1,\n]\n';
	assert.equal(move(inArray), inArray);
});

test('a quoted or escaped spelling of the key is the same key', () => {
	for (const spelling of ['"mcp_servers"', "'mcp_servers'", '"mcp\\u005fservers"']) {
		assert.equal(move(`${spelling} = []\na = 1\n`), 'a = 1\n', spelling);
	}
});

test('a comment after the list is kept on its own line', () => {
	assert.equal(move('mcp_servers = [] # none yet\na = 1\n'), '# none yet\na = 1\n');
});

test('a file ending without a newline after the list is handled', () => {
	assert.equal(move('a = 1\nmcp_servers = []'), 'a = 1\n');
	assert.equal(move('mcp_servers = [{ name = "a" }]'), '[[mcp_servers]]\nname = "a"\n');
});

test('what cannot be moved without loss is refused', () => {
	for (const [text, why] of [
		['mcp_servers = "x"\n', /is not a list/],
		['mcp_servers = [\n  # keep me\n]\n', /comment/],
		['mcp_servers = ["a"]\n', /not an inline table/],
		['mcp_servers = [{ name = "a" }] b\n', /unexpected text/],
		['mcp_servers = [\n', /not closed/],
		['[mcp_servers]\nname = "a"\n', /single table/],
		['["mcp_servers"]\nname = "a"\n', /single table/],
		['mcp_servers.a = 1\n', /dotted keys/],
		['"mcp\\qservers" = []\n', /cannot be read/],
		['not a key\n', /not a key/],
	] as const) {
		assert.throws(() => move(text), (err: unknown) => err instanceof TomlInlineListError && why.test(err.message), text);
	}
});
