/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTriageStep } from '../handler.js';
import { decodeState, encodeState } from '../state.js';
import type { TriageDone, TriageEmitClassification } from '../types.js';
import { SPEC_SCHEMA_VERSION, type SpecArtifact } from '../../../../workflow/artifacts/spec.js';
import { specArtifactPaths, writeAtomic } from '../../../../workflow/storage.js';
import { approvedMeta } from '../../../../workflow/__tests__/lifecycle-fixtures.js';

const REPO = '/tmp/some-repo';

async function start(focus: string): Promise<TriageEmitClassification> {
	const env = await handleTriageStep({ phase: 'start', focus, repo: REPO });
	assert.equal(env.isError, undefined, 'start should not error');
	return JSON.parse(env.content[0]!.text) as TriageEmitClassification;
}

async function classify(state: string, result: Record<string, unknown>): Promise<TriageDone> {
	const env = await handleTriageStep({ phase: 'classify', result, state });
	assert.equal(env.isError, undefined, env.content[0]?.text);
	return JSON.parse(env.content[0]!.text) as TriageDone;
}

const wellFormed = (sizeClass: string): Record<string, unknown> => ({
	sizeClass,
	rationale: 'sized against the graph',
	storyTitle: 'Add a per-repo cache TTL override',
	signals: [{ kind: 'modules-touched', detail: 'one module', evidence: ['src/config/analyze.ts'] }],
});

test('start: returns emit_classification with a schema, prompt, and state token', async () => {
	const out = await start('Add a --json flag to the status command');
	assert.equal(out.next, 'emit_classification');
	assert.ok(out.schema && typeof out.schema === 'object');
	assert.match(out.prompt.system, /Classify ONE code change request/);
	assert.ok(out.state.length > 0);
});

test('start: errors without a focus', async () => {
	const env = await handleTriageStep({ phase: 'start', repo: REPO });
	assert.equal(env.isError, true);
});

test('feature → standalone design.story with plan; nextCall pre-fills standalone params', async () => {
	const s = await start('Add a triage router with a classifier and MCP tool');
	const done = await classify(s.state, wellFormed('feature'));
	assert.equal(done.next, 'done');
	assert.equal(done.route.startStage, 'design.story');
	assert.equal(done.route.standalone, true);
	assert.equal(done.route.needsPlan, true);
	assert.equal(done.nextCall.tool, 'insrc_workflow_step');
	assert.equal((done.nextCall.params as { phase?: string }).phase, 'start');
	assert.equal((done.nextCall.params as { workflow?: string }).workflow, 'design.story');
	const p = done.nextCall.params['params'] as Record<string, unknown>;
	assert.equal(p['standalone'], true);
	assert.equal(p['sizeClass'], 'feature');
	assert.equal(p['storyTitle'], 'Add a per-repo cache TTL override');
	assert.match(done.summary, /standalone LLD → plan → build/);
});

test('small → standalone design.story, no plan', async () => {
	const s = await start('Add a config flag');
	const done = await classify(s.state, wellFormed('small'));
	assert.equal(done.route.startStage, 'design.story');
	assert.equal(done.route.needsPlan, false);
	assert.match(done.summary, /standalone LLD → build/);
});

test('trivial → build (no LLD), routed to insrc_build_step standalone', async () => {
	const s = await start('Fix a typo in a log message');
	const done = await classify(s.state, wellFormed('trivial'));
	assert.equal(done.route.startStage, 'build');
	assert.equal(done.route.producesLld, false);
	assert.equal(done.nextCall.tool, 'insrc_build_step');
	const sa = done.nextCall.params['standalone'] as Record<string, unknown>;
	assert.equal(sa['standalone'], true);
	assert.equal(sa['sizeClass'], 'trivial');
});

test('epic → define, full chain, no standalone params', async () => {
	const s = await start('Build a whole new deployment-design subsystem');
	const done = await classify(s.state, wellFormed('epic'));
	assert.equal(done.route.startStage, 'define');
	assert.equal(done.route.standalone, false);
	assert.equal(done.nextCall.tool, 'insrc_workflow_step');
	assert.equal((done.nextCall.params as { phase?: string }).phase, 'start');
	assert.equal((done.nextCall.params as { workflow?: string }).workflow, 'define');
	assert.equal(done.nextCall.params['params'], undefined, 'no standalone params for an Epic');
});

test('bugfix (small) → issue → build; nextCall enters the issue workflow with the magnitude', async () => {
	const s = await start('The pager drops the last row on the final page');
	const done = await classify(s.state, { ...wellFormed('bugfix'), magnitude: 'small' });
	assert.equal(done.next, 'done');
	assert.equal(done.route.startStage, 'issue');
	assert.equal(done.route.standalone, true);
	assert.equal(done.route.needsPlan, false);
	assert.equal(done.route.producesLld, false);
	assert.equal(done.nextCall.tool, 'insrc_workflow_step');
	assert.equal((done.nextCall.params as { phase?: string }).phase, 'start');
	assert.equal((done.nextCall.params as { workflow?: string }).workflow, 'issue');
	const p = done.nextCall.params['params'] as Record<string, unknown>;
	assert.equal(p['magnitude'], 'small');
	assert.equal(p['sizeClass'], 'bugfix');
	assert.match(done.summary, /issue → build/);
});

test('bugfix (sized) → issue → design → plan → build', async () => {
	const s = await start('A cross-module contract drift needing real design to correct');
	const done = await classify(s.state, { ...wellFormed('bugfix'), magnitude: 'sized' });
	assert.equal(done.route.startStage, 'issue');
	assert.equal(done.route.needsPlan, true);
	assert.equal(done.route.producesLld, true);
	assert.match(done.summary, /issue → design → plan → build/);
});

test('classify: rejects a bugfix emitted WITHOUT a magnitude (no unhandled throw)', async () => {
	// Regression: S001 opened the schema enum to bugfix; a magnitude-less bugfix
	// must fail schema validation cleanly (isError), never throw deeper in
	// routeForSizeClass.
	const s = await start('some defect');
	const env = await handleTriageStep({ phase: 'classify', result: wellFormed('bugfix'), state: s.state });
	assert.equal(env.isError, true);
});

test('classify: rejects an unknown sizeClass emitted by the controller', async () => {
	const s = await start('x');
	const env = await handleTriageStep({ phase: 'classify', result: wellFormed('medium'), state: s.state });
	assert.equal(env.isError, true);
});

test('classify: rejects a tampered/undecodable state token', async () => {
	const env = await handleTriageStep({ phase: 'classify', result: wellFormed('small'), state: 'not-base64-json!!' });
	assert.equal(env.isError, true);
});

// ---------------------------------------------------------------------------
// ISSUE-c00559b7 — an approved SPEC rides triage into the routed stage.
// ---------------------------------------------------------------------------

const SPEC_HASH = 'abcd1234ef567890';

/** A repo holding one SPEC, approved or not. */
function specRepo(approved: boolean): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-triage-spec-'));
	const artifact: SpecArtifact = {
		meta: {
			workflow: 'brainstorm', runId: 'wf-spec', repoPath: repo, createdAt: '2026-10-01T00:00:00.000Z', epicCreatedAt: '2026-10-01T00:00:00.000Z',
			elapsedMs: 1, repoIndexedAt: null, schemaVersion: SPEC_SCHEMA_VERSION,
			specHash: SPEC_HASH, epicSlug: 'a-converged-spec',
			...(approved ? approvedMeta({ at: '2026-10-01T01:00:00.000Z' }) : {}),
		},
		body: { category: 'requirements', intent: 'Do the thing.', scopeBoundary: 'Only the thing.', nonGoals: [], decisions: [], openItems: [] },
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
	writeAtomic(specArtifactPaths(repo, SPEC_HASH, artifact.meta.createdAt, 'standalone', 'a-converged-spec').json, JSON.stringify(artifact));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function startWithSpec(repo: string, specHash: string): Promise<{ isError?: boolean; out: Record<string, unknown> }> {
	const env = await handleTriageStep({ phase: 'start', focus: 'Build the converged thing', repo, specHash });
	return { ...(env.isError !== undefined ? { isError: env.isError } : {}), out: JSON.parse(env.content[0]!.text) as Record<string, unknown> };
}

test('c00559b7 — start with an approved specHash forwards it into the design.story nextCall', async () => {
	const r = specRepo(true);
	try {
		const s = await startWithSpec(r.repo, SPEC_HASH);
		assert.equal(s.isError, undefined, JSON.stringify(s.out));
		const done = await classify(s.out['state'] as string, wellFormed('feature'));
		const p = done.nextCall.params['params'] as Record<string, unknown>;
		assert.equal(p['specHash'], SPEC_HASH);
		assert.equal(p['storyTitle'], 'Add a per-repo cache TTL override', 'the existing params are untouched');

		// Small routes to the same standalone LLD and carries it too.
		const small = await classify(s.out['state'] as string, wellFormed('small'));
		assert.equal((small.nextCall.params['params'] as Record<string, unknown>)['specHash'], SPEC_HASH);
	} finally { r.cleanup(); }
});

test('c00559b7 — an epic routed with an approved specHash forwards it into the define call', async () => {
	const r = specRepo(true);
	try {
		const s = await startWithSpec(r.repo, SPEC_HASH);
		const done = await classify(s.out['state'] as string, wellFormed('epic'));
		assert.equal((done.nextCall.params as { workflow?: string }).workflow, 'define');
		assert.deepEqual(done.nextCall.params['params'], { specHash: SPEC_HASH });
	} finally { r.cleanup(); }
});

test('c00559b7 — start with an UNAPPROVED spec errors and hands back no state', async () => {
	const r = specRepo(false);
	try {
		const s = await startWithSpec(r.repo, SPEC_HASH);
		assert.equal(s.isError, true);
		assert.match(String(s.out['message']), /not approved/);
		assert.equal(s.out['state'], undefined);
	} finally { r.cleanup(); }
});

test('c00559b7 — start with a MISSING spec errors and hands back no state', async () => {
	const r = specRepo(true);
	try {
		const s = await startWithSpec(r.repo, '0000000000000000');
		assert.equal(s.isError, true);
		assert.equal(s.out['state'], undefined);
	} finally { r.cleanup(); }
});

test('c00559b7 — without a specHash the nextCall is unchanged (no specHash key anywhere)', async () => {
	const s = await start('Add a triage router with a classifier and MCP tool');
	const feature = await classify(s.state, wellFormed('feature'));
	assert.ok(!('specHash' in (feature.nextCall.params['params'] as Record<string, unknown>)));
	const epic = await classify(s.state, wellFormed('epic'));
	assert.deepEqual(epic.nextCall.params, { phase: 'start', repo: REPO, workflow: 'define', focus: 'Add a triage router with a classifier and MCP tool' });
});

test('c00559b7 — the triage state token round-trips specHash, and omits it when absent', () => {
	const withSpec = { runId: 'tri-1', focus: 'f', repo: '/r', specHash: SPEC_HASH };
	assert.deepEqual(decodeState(encodeState(withSpec)), withSpec);
	const without = { runId: 'tri-2', focus: 'f', repo: '/r' };
	assert.deepEqual(decodeState(encodeState(without)), without);
	assert.ok(!('specHash' in decodeState(encodeState(without))));
	// A tampered, non-string specHash is refused rather than forwarded.
	const bad = Buffer.from(JSON.stringify({ ...without, specHash: 7 }), 'utf8').toString('base64');
	assert.throws(() => decodeState(bad), /specHash/);
});
