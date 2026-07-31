/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Surface-parity + precondition tests for docgen story s6.
 *
 * The registry (listDocTypes) is the one source of truth; this suite proves the
 * daemon tool's advertised input is DERIVED from it (t2/t3), that the union
 * schema is drift-free + registry-driven (t2/t6 drift guard), and that
 * generateDocument centralizes the registered/indexed precondition with
 * not-found precedence (t1). MCP-surface parity + daemon-owned reads are covered
 * by src/mcp/docgen/__tests__/handler.test.ts.
 *
 * Run: npx tsx --test src/docgen/__tests__/surface-parity.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateDocument, listDocTypes } from '../index.js';
import { buildDocgenInputSchema } from '../schema.js';
import { docgenTool } from '../tool.js';

type SchemaObj = { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { enum?: string[] }> };

// ── t2 · registry-derived input-schema builder ──────────────────────────────

test('buildDocgenInputSchema: docType enum = exactly listDocTypes(), no hard-coded list', () => {
	const s = buildDocgenInputSchema(listDocTypes()) as SchemaObj;
	const registryTypes = listDocTypes().map(d => d.docType);
	assert.deepEqual(s.properties['docType']!.enum, registryTypes);
	// the four built-in types are all present (s1-s4)
	for (const t of ['type-structure', 'component-dependency', 'call-sequence', 'narrative']) {
		assert.ok(registryTypes.includes(t), `${t} registered`);
	}
});

test('buildDocgenInputSchema: repo+docType required, per-type fields unioned + optional', () => {
	const s = buildDocgenInputSchema(listDocTypes()) as SchemaObj;
	assert.deepEqual(s.required, ['docType', 'repo']);          // repo required (backward-compat), docType required
	// the union carries every per-type field across the four extractors
	for (const f of ['repo', 'path', 'symbol', 'base', 'question', 'maxDepth']) {
		assert.ok(f in s.properties, `union has ${f}`);
	}
	assert.equal(s.additionalProperties, false);
});

test('buildDocgenInputSchema: a newly-registered docType appears with zero helper edits (drift guard)', () => {
	const extended = [
		...listDocTypes(),
		{ docType: 'brand-new-type', capability: { id: 'brand-new-type', summary: 'x' }, extractorInputSchema: { type: 'object', properties: { repo: { type: 'string' }, widget: { type: 'string' } } } },
	];
	const s = buildDocgenInputSchema(extended) as SchemaObj;
	assert.ok(s.properties['docType']!.enum!.includes('brand-new-type'));
	assert.ok('widget' in s.properties, 'a new per-type field is unioned in automatically');
});

// ── t3 · the daemon tool advertises the registry-derived shape ──────────────

test('docgenTool.inputSchema is the registry-derived shape (not a fixed {docType,repo,path} literal)', () => {
	assert.deepEqual(docgenTool.inputSchema, buildDocgenInputSchema(listDocTypes()));
	const props = (docgenTool.inputSchema as SchemaObj).properties;
	// the pre-s6 tool only advertised docType/repo/path; the generalized tool now
	// reaches the call-sequence + narrative fields too (ac1/ac4).
	assert.ok('symbol' in props && 'base' in props && 'question' in props);
});

// ── t6 · cross-surface docType parity (in-process) ──────────────────────────

test('tool docType enum equals the registry docType set (no surface omits a type, ac1/ac4)', () => {
	const toolTypes = (docgenTool.inputSchema as SchemaObj).properties['docType']!.enum;
	const registryTypes = listDocTypes().map(d => d.docType);
	// docgen.list IPC returns listDocTypes() verbatim (daemon/index.ts), so the
	// tool ↔ IPC ↔ (MCP-derivable) docType sets are the same list by construction.
	assert.deepEqual(toolTypes, registryTypes);
});

// ── t1 · centralized registered/indexed precondition + precedence ───────────

test('generateDocument: unknown docType → not-found, WITHOUT consulting repo readiness (precedence)', async () => {
	let readinessCalls = 0;
	const out = await generateDocument('no-such-type', { repo: '/whatever' }, {
		isRepoReady: async () => { readinessCalls++; return true; },
	});
	assert.equal(out.status, 'not-found');
	if (out.status === 'not-found') assert.equal(out.symbol, 'no-such-type');
	assert.equal(readinessCalls, 0, 'not-found short-circuits before the readiness check (ac3 precedence)');
});

test('generateDocument: registered docType + not-ready repo → source-not-ready BEFORE extraction (ac3)', async () => {
	const out = await generateDocument('type-structure', { repo: '/not/registered' }, {
		isRepoReady: async () => false,     // repo unregistered / still indexing
	});
	assert.equal(out.status, 'source-not-ready');
	if (out.status === 'source-not-ready') assert.match(out.reason, /not registered or has not finished indexing/);
});

test('generateDocument: no repo in input skips the readiness check (left to the extractor → empty-scope)', async () => {
	let readinessCalls = 0;
	const out = await generateDocument('type-structure', {}, {
		isRepoReady: async () => { readinessCalls++; return true; },
	});
	// a missing repo is a malformed scope, not source-not-ready: the readiness
	// gate is skipped and the extractor's parseScope reports empty-scope.
	assert.equal(readinessCalls, 0);
	assert.equal(out.status, 'empty-scope');
});
