/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) unit tests — the document-generation wiring (generateErCompanions) +
 * the S002 Diagrams extension-slot LINK rendering (companionBodyLines). Proves: a
 * warranted ER with a sound authored erDefinition is rendered to a sibling
 * companion + returns the ref; a not-warranted document produces no companion; an
 * invalid model is not rendered; and the extension slot renders the companion as a
 * LINK, never inlining its content (k1/ac2). Strictly additive/absent-safe.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/generate.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateErCompanions, type CompanionGenDoc, type CompanionGenCtx } from '../generate.js';
import { companionBodyLines } from '../../format/bindings.js';
import { deriveWorkItemIdentity } from '../../../path-scheme.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { ErDefinition } from '../er.js';
import { _setDocgenAssetDirForTests } from '../../../../docgen/render/shell.js';

const HASH = '185807ba9a6b35d3';
const CREATED = '2026-07-17T07:42:28.275Z';

const validEr: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const danglingEr: ErDefinition = { classes: { Order: { attributes: { customer: { range: 'Customer' } } } } };

/** A provider whose content-gate returns the given assessment JSON. */
function gateProvider(value: unknown): LLMProvider {
	return { capabilities: { structuredOutput: true }, completeStructured: async () => value } as unknown as LLMProvider;
}

function ctxFor(repoPath: string): CompanionGenCtx {
	return { repoPath, identity: deriveWorkItemIdentity(HASH, CREATED, 's1'), workItemKind: 'epic', slug: 'my-feature' };
}

afterEach(() => { _setDocgenAssetDirForTests(undefined); });

test('generateErCompanions: warranted + sound erDefinition → renders a sibling companion + returns the ref', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gen-companion-'));
	const doc: CompanionGenDoc = { kind: 'LLD', body: { erDefinition: validEr } };
	const provider = gateProvider({ warranted: true, diagrams: [{ type: 'er', rationale: 'related records' }] });
	const companions = await generateErCompanions(doc, provider, ctxFor(repo));
	assert.equal(companions.length, 1);
	assert.equal(companions[0]!.kind, 'diagram-mermaid');
	assert.match(companions[0]!.relPath, /docs\/epics\/my-feature-E20260717185807ba\/S001\/er-model\.html$/);
	assert.ok(existsSync(join(repo, companions[0]!.relPath)), 'the sibling companion file was written');
	rmSync(repo, { recursive: true, force: true });
});

test('generateErCompanions: not warranted → no companion (inert)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gen-companion-'));
	const doc: CompanionGenDoc = { kind: 'LLD', body: { erDefinition: validEr } };
	const provider = gateProvider({ warranted: false, diagrams: [] });
	assert.deepEqual(await generateErCompanions(doc, provider, ctxFor(repo)), []);
	rmSync(repo, { recursive: true, force: true });
});

test('generateErCompanions: an invalid (HIGH) erDefinition is not rendered', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gen-companion-'));
	const doc: CompanionGenDoc = { kind: 'LLD', body: { erDefinition: danglingEr } };
	const provider = gateProvider({ warranted: true, diagrams: [{ type: 'er', rationale: 'x' }] });
	assert.deepEqual(await generateErCompanions(doc, provider, ctxFor(repo)), []);
	rmSync(repo, { recursive: true, force: true });
});

// ── the S002 extension-slot LINK rendering (never inlined) ────────────────────────

test('companionBodyLines: renders each diagram companion as a LINK, never inlining content (k1/ac2)', () => {
	const lines = companionBodyLines([
		{ kind: 'diagram-mermaid', relPath: 'docs/epics/x/S001/er-model.html', title: 'ER model', ofSectionId: '4-data-model-changes' },
	]);
	assert.equal(lines.length, 1);
	assert.equal(lines[0], '- [ER model](docs/epics/x/S001/er-model.html) (§ 4-data-model-changes)');
});

test('companionBodyLines: absent/empty companions → [] (extension slot omitted; forward-only)', () => {
	assert.deepEqual(companionBodyLines(undefined), []);
	assert.deepEqual(companionBodyLines([]), []);
	// A non-diagram companion (e.g. an S004 ux-mock) is left for its own slot.
	assert.deepEqual(companionBodyLines([{ kind: 'ux-mock', relPath: 'docs/x/ux.html', title: 'UX' }]), []);
});
