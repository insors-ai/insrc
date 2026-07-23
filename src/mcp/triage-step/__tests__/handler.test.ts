/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleTriageStep } from '../handler.js';
import type { TriageDone, TriageEmitClassification } from '../types.js';

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
	assert.equal(done.nextCall.tool, 'insrc_workflow_run');
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
	assert.equal((done.nextCall.params as { workflow?: string }).workflow, 'define');
	assert.equal(done.nextCall.params['params'], undefined, 'no standalone params for an Epic');
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
