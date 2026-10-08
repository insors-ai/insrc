/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source-scan contract test for the 'workflow.delivery' and
 * 'workflow.deliveryEvidence' IPC entries (E1 s5, sc7). The handler map lives
 * inside main() and is not headlessly bootable, so — the
 * artifact-feedback-handler-contract idiom — each entry is checked against the
 * source text, and the module it lazy-imports is loaded for real so a wrong
 * path or export name fails here rather than on the first IPC call.
 *
 * Run: npx tsx --test src/daemon/__tests__/delivery-handler-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(resolve(HERE, '..', 'index.ts'), 'utf8');

/** Slice out one `'<method>': async (...) => { ... }` handler body. */
function handlerBody(method: string): string {
	const key = `'${method}':`;
	const start = indexSrc.indexOf(key);
	assert.ok(start >= 0, `no '${method}' handler registered in the index.ts handler map`);
	const rest = indexSrc.slice(start + key.length);
	const nextKey = rest.search(/\n\t\t'[a-zA-Z.]+':/);
	return nextKey >= 0 ? rest.slice(0, nextKey) : rest;
}

for (const [method, fn] of [['workflow.delivery', 'handleDelivery'], ['workflow.deliveryEvidence', 'handleDeliveryEvidence']] as const) {
	test(`index.ts registers '${method}', which lazy-imports ${fn} and passes INSRC_REPO`, async () => {
		const body = handlerBody(method);
		const imported = /await import\('([^']+)'\)/.exec(body)?.[1];
		assert.equal(imported, '../workflow/delivery/handlers.js');
		assert.match(body, new RegExp(`const \\{ ${fn} \\} = await import`));
		assert.match(body, new RegExp(`return ${fn}\\(`));
		assert.match(body, /process\.env\['INSRC_REPO'\]/);
		const mod = await import(resolve(HERE, '..', imported.replace(/\.js$/, '.ts'))) as Record<string, unknown>;
		assert.equal(typeof mod[fn], 'function', `${imported} exports ${fn}`);
	});
}
