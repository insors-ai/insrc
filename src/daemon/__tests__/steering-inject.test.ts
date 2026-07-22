/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	STEERING_MARKER_START,
	STEERING_MARKER_END,
	readSteeringBlock,
	renderMarkedSection,
	upsertMarkedSection,
	injectSteeringBlock,
} from '../steering-inject.js';

const BLOCK = 'THE STEERING BLOCK BODY';
const SECTION = renderMarkedSection(BLOCK);

// ---------------------------------------------------------------------------
// upsertMarkedSection — the pure marker logic (every branch)
// ---------------------------------------------------------------------------

test('absent file → create with only the marked section', () => {
	const r = upsertMarkedSection(null, BLOCK);
	assert.equal(r.action, 'created');
	assert.equal(r.content, SECTION + '\n');
});

test('file with user content but no marker → append, preserving content', () => {
	const existing = '# My project\n\nSome notes.\n';
	const r = upsertMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'created');
	assert.ok(r.content!.startsWith(existing), 'existing content preserved verbatim at the head');
	assert.ok(r.content!.includes(SECTION), 'marked section appended');
});

test('marked section present + identical → idempotent no-op (unchanged, no write)', () => {
	const existing = `# Proj\n\n${SECTION}\n`;
	const r = upsertMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
});

test('stale marked section → replace ONLY between markers, preserve surrounding', () => {
	const existing = `# Head\n\n${STEERING_MARKER_START}\nOLD BLOCK\n${STEERING_MARKER_END}\n\n## Tail kept\n`;
	const r = upsertMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'replaced');
	assert.ok(r.content!.startsWith('# Head\n\n'), 'head preserved');
	assert.ok(r.content!.includes('## Tail kept'), 'tail preserved');
	assert.ok(r.content!.includes(BLOCK) && !r.content!.includes('OLD BLOCK'), 'block swapped');
});

test('open marker without close → left untouched (never clobber to EOF)', () => {
	const existing = `# Head\n${STEERING_MARKER_START}\nhalf a block and then user content\n`;
	const r = upsertMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
	assert.match(r.note!, /malformed/);
});

test('duplicate open markers → left untouched (ambiguous)', () => {
	const existing = `${STEERING_MARKER_START}\na\n${STEERING_MARKER_END}\n${STEERING_MARKER_START}\nb\n${STEERING_MARKER_END}\n`;
	const r = upsertMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
	assert.match(r.note!, /duplicate/);
});

// ---------------------------------------------------------------------------
// readSteeringBlock — the shipped asset resolves + is non-empty
// ---------------------------------------------------------------------------

test('readSteeringBlock: resolves the shipped prompts/steering-block.md and is non-trivial', () => {
	const block = readSteeringBlock();
	assert.ok(block.length > 200, 'block body is substantial');
	assert.match(block, /insrc_triage/, 'block steers toward triage');
	assert.match(block, /insrc_review_step/, 'block steers toward review');
});

// ---------------------------------------------------------------------------
// injectSteeringBlock — per-file selection + real writes
// ---------------------------------------------------------------------------

async function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-steer-'));
	try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('injectSteeringBlock: nothing selected → both files skipped, no writes', async () => {
	await withTempRepo(async (dir) => {
		const { files } = await injectSteeringBlock(dir, {});
		assert.deepEqual(files.map(f => f.action).sort(), ['skipped', 'skipped']);
		assert.ok(!existsSync(join(dir, 'CLAUDE.md')) && !existsSync(join(dir, 'AGENTS.md')));
	});
});

test('injectSteeringBlock: claude only → CLAUDE.md created, AGENTS.md untouched', async () => {
	await withTempRepo(async (dir) => {
		const { files } = await injectSteeringBlock(dir, { claude: true });
		const claude = files.find(f => f.file.endsWith('CLAUDE.md'))!;
		const agents = files.find(f => f.file.endsWith('AGENTS.md'))!;
		assert.equal(claude.action, 'created');
		assert.equal(agents.action, 'skipped');
		assert.ok(existsSync(join(dir, 'CLAUDE.md')));
		assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'unselected file not written');
		assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /insrc:steering:start/);
	});
});

test('injectSteeringBlock: both selected + one pre-existing → created + preserved-append', async () => {
	await withTempRepo(async (dir) => {
		writeFileSync(join(dir, 'CLAUDE.md'), '# Existing project rules\n\nkeep me.\n', 'utf8');
		const { files } = await injectSteeringBlock(dir, { claude: true, agents: true });
		assert.equal(files.length, 2);
		// CLAUDE.md existed → appended, prior content kept
		const claudeText = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
		assert.ok(claudeText.includes('keep me.'), 'prior CLAUDE.md content preserved');
		assert.ok(claudeText.includes(STEERING_MARKER_START));
		// AGENTS.md created fresh
		assert.equal(files.find(f => f.file.endsWith('AGENTS.md'))!.action, 'created');
	});
});

test('injectSteeringBlock: re-run is idempotent (second run unchanged)', async () => {
	await withTempRepo(async (dir) => {
		await injectSteeringBlock(dir, { claude: true });
		const first = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
		const { files } = await injectSteeringBlock(dir, { claude: true });
		assert.equal(files.find(f => f.file.endsWith('CLAUDE.md'))!.action, 'unchanged');
		assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), first, 're-run byte-identical');
	});
});
