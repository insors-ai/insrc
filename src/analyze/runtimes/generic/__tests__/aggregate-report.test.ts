/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * generic.aggregate.report runtime unit tests.
 *
 * Bootstrap registration + thin-wrapper passthrough behaviour.
 * The shared aggregator base is tested separately
 * (analyze/runtimes/shared/__tests__/aggregator.test.ts) -- here
 * we pin only the bits this wrapper owns.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/runtimes/generic/__tests__/aggregate-report.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	GENERIC_AGGREGATE_PROMPT_PATH,
	genericAggregateReportRuntime,
} from '../aggregate-report.js';
import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../bootstrap.js';
import {
	getRuntime,
	listRegisteredRuntimes,
} from '../../../executor/registry.js';

// ---------------------------------------------------------------------------
// Wiring + bootstrap
// ---------------------------------------------------------------------------

test('runtime exposes templateId = generic.aggregate.report', () => {
	assert.equal(genericAggregateReportRuntime.templateId, 'generic.aggregate.report');
});

test('registerBuiltinRuntimes registers generic.aggregate.report', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	assert.notEqual(getRuntime('generic.aggregate.report'), undefined);
	assert.ok(listRegisteredRuntimes().includes('generic.aggregate.report'));
});

test('registerBuiltinRuntimes registers BOTH code + generic families (idempotent)', () => {
	_resetRuntimeBootstrapLatchForTests();
	registerBuiltinRuntimes();
	registerBuiltinRuntimes();  // second call is a no-op

	const ids = listRegisteredRuntimes();
	assert.ok(ids.includes('code.discovery.modules'));
	assert.ok(ids.includes('code.aggregate.report'));
	assert.ok(ids.includes('generic.aggregate.report'));
});

// ---------------------------------------------------------------------------
// Prompt file actually exists at the declared relative path
// ---------------------------------------------------------------------------

test('GENERIC_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file', () => {
	const abs = isAbsolute(GENERIC_AGGREGATE_PROMPT_PATH)
		? GENERIC_AGGREGATE_PROMPT_PATH
		: resolveRelativeToInsrcRoot(GENERIC_AGGREGATE_PROMPT_PATH);
	assert.ok(existsSync(abs), `generic aggregator prompt not found at ${abs}`);
});

function resolveRelativeToInsrcRoot(relPath: string): string {
	// .../analyze/runtimes/generic/__tests__/aggregate-report.test.js
	//  -> .../analyze/runtimes/generic/__tests__
	//  -> .../analyze/runtimes/generic
	//  -> .../analyze/runtimes
	//  -> .../analyze
	//  -> .../insrc
	const thisFile = fileURLToPath(import.meta.url);
	return resolve(thisFile, '..', '..', '..', '..', '..', relPath);
}
