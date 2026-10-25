import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseConfigList, parseTabRows } from '../parsers.js';

test('gh-parsers.test.ts: tab-column parser and config list parser on the fixtures', () => {
	// tab-separated lines: blank lines dropped, columns kept as they are (empty columns too), CRLF tolerated
	assert.deepEqual(parseTabRows('a\tb\tc\n\nd\t\tf\r\n  \n'), [['a', 'b', 'c'], ['d', '', 'f']]);
	assert.deepEqual(parseTabRows(''), []);
	assert.deepEqual(parseTabRows('single'), [['single']]);
	assert.deepEqual(parseTabRows('feature-x\thttps://github.com/o/r/tree/feature-x\n'), [['feature-x', 'https://github.com/o/r/tree/feature-x']]);

	// gh config list: key=value; a value may be empty or hold '='; lines without '=' are skipped
	const config = 'git_protocol=https\neditor=\nprompt=enabled\nbrowser=a=b\nnot a pair\n=orphan\n';
	assert.deepEqual(parseConfigList(config), [
		{ key: 'git_protocol', value: 'https' }, { key: 'editor', value: '' }, { key: 'prompt', value: 'enabled' }, { key: 'browser', value: 'a=b' },
	]);
	assert.deepEqual(parseConfigList(''), []);
});
