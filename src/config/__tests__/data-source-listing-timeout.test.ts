/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The setting `analyzer.dataSourceListingTimeoutMs` and its reader
 * (ISSUE-008e146ad1475ef9): the time one live data source is given to answer
 * when a request is measured.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS, dataSourceListingTimeoutMs } from '../analyze.js';
import { CONFIG_CATALOG } from '../config-catalog.js';

test('the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000', () => {
	const rows = CONFIG_CATALOG.filter(r => r.path === 'analyzer.dataSourceListingTimeoutMs');
	assert.equal(rows.length, 1);
	const row = rows[0]!;
	assert.deepEqual([row.type, row.default, row.group], ['number', 120000, 'Analysis & memory']);
	assert.match(row.desc, /live data source/);
	// The reader's own default is the catalog's.
	assert.equal(DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS, row.default);
});

test('the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-source-timeout-'));
	try {
		const path = join(dir, 'config.json');
		const withValue = (text: string): number => { writeFileSync(path, text); return dataSourceListingTimeoutMs(path); };
		// The setting's value, read from the file each time.
		assert.equal(withValue(JSON.stringify({ analyzer: { dataSourceListingTimeoutMs: 5000 } })), 5000);
		assert.equal(withValue(JSON.stringify({ analyzer: { useLocal: true, dataSourceListingTimeoutMs: 300000 } })), 300000);
		assert.equal(withValue(JSON.stringify({ analyzer: { dataSourceListingTimeoutMs: 0.5 } })), 0.5);
		// A value that cannot be a time limit: the default of 120 seconds.
		for (const bad of [0, -1, '30000', null, true, [], {}]) {
			assert.equal(withValue(JSON.stringify({ analyzer: { dataSourceListingTimeoutMs: bad } })), 120000, JSON.stringify(bad));
		}
		// No value, no section, a file that is not an object, a file that cannot be parsed, no file.
		for (const text of ['{}', '{"analyzer":{}}', '{"analyzer":5}', 'null', '[]', '{ not json']) {
			assert.equal(withValue(text), 120000, text);
		}
		assert.equal(dataSourceListingTimeoutMs(join(dir, 'absent.json')), 120000);
		assert.equal(dataSourceListingTimeoutMs(dir), 120000, 'a path that is a directory cannot be read');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
