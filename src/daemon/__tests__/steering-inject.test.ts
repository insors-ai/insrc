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
	refreshMarkedSection,
	refreshSteeringAcrossRepos,
	injectSteeringBlock,
	type SteeringRefreshDeps,
} from '../steering-inject.js';
import type { RegisteredRepo } from '../../shared/types.js';

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
// refreshMarkedSection — the REPLACE-ONLY sibling (opt-out honoured)
// ---------------------------------------------------------------------------

test('refresh: present + stale block → replaced, surrounding content byte-for-byte preserved', () => {
	const existing = `# Head\n\n${STEERING_MARKER_START}\nOLD BLOCK\n${STEERING_MARKER_END}\n\n## Tail kept\n`;
	const r = refreshMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'replaced');
	assert.equal(r.content, `# Head\n\n${SECTION}\n\n## Tail kept\n`);
});

test('refresh: present + identical block → unchanged, content null (no write)', () => {
	const existing = `# Proj\n\n${SECTION}\n`;
	const r = refreshMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
});

test('refresh: absent file → skipped, NEVER created', () => {
	const r = refreshMarkedSection(null, BLOCK);
	assert.equal(r.action, 'skipped');
	assert.equal(r.content, null);
});

test('refresh: present file WITHOUT markers → skipped, NEVER created/appended (opt-out)', () => {
	const r = refreshMarkedSection('# My project\n\nno insrc block here.\n', BLOCK);
	assert.equal(r.action, 'skipped');
	assert.equal(r.content, null);
});

test('refresh: duplicate markers → unchanged + note, untouched', () => {
	const existing = `${STEERING_MARKER_START}\na\n${STEERING_MARKER_END}\n${STEERING_MARKER_START}\nb\n${STEERING_MARKER_END}\n`;
	const r = refreshMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
	assert.match(r.note!, /duplicate/);
});

test('refresh: malformed markers (open without close) → unchanged + note, untouched', () => {
	const existing = `# Head\n${STEERING_MARKER_START}\nhalf a block\n`;
	const r = refreshMarkedSection(existing, BLOCK);
	assert.equal(r.action, 'unchanged');
	assert.equal(r.content, null);
	assert.match(r.note!, /malformed/);
});

// ---------------------------------------------------------------------------
// refreshSteeringAcrossRepos — the registry walk (via injected seams)
// ---------------------------------------------------------------------------

const repo = (path: string): RegisteredRepo => ({ path, name: path, status: 'ready', addedAt: 0 });

/** Build a deps fake over an in-memory file table. Missing keys ⇒ absent file
 *  (readFile resolves null). Records every writeFile call. */
function fakeDeps(
	repos: RegisteredRepo[],
	files: Record<string, string>,
	over: Partial<SteeringRefreshDeps> = {},
): { deps: SteeringRefreshDeps; writes: Array<{ path: string; content: string }> } {
	const writes: Array<{ path: string; content: string }> = [];
	const deps: SteeringRefreshDeps = {
		listRepos: async () => repos,
		readBlock: () => BLOCK,
		readFile:  async (p) => (p in files ? files[p]! : null),
		writeFile: async (p, c) => { writes.push({ path: p, content: c }); files[p] = c; },
		...over,
	};
	return { deps, writes };
}

test('walk: mixed repos — stale written, opted-out skipped-not-created, malformed untouched', async () => {
	const stale = `# a\n${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n`;
	const malformed = `# c\n${STEERING_MARKER_START}\nhalf\n`;
	const files: Record<string, string> = {
		'/stale/CLAUDE.md': stale,          // stale → replaced
		// /optout/* absent → skipped
		'/nomark/AGENTS.md': '# plain\n',   // present, no markers → skipped
		'/bad/CLAUDE.md': malformed,        // malformed → unchanged+note
	};
	const { deps, writes } = fakeDeps(
		[repo('/stale'), repo('/optout'), repo('/nomark'), repo('/bad')],
		files,
	);
	const report = await refreshSteeringAcrossRepos(deps);

	const byFile = Object.fromEntries(report.map(o => [o.file, o.action]));
	assert.equal(byFile['/stale/CLAUDE.md'], 'replaced');
	assert.equal(byFile['/optout/CLAUDE.md'], 'skipped');
	assert.equal(byFile['/optout/AGENTS.md'], 'skipped');
	assert.equal(byFile['/nomark/AGENTS.md'], 'skipped');
	assert.equal(byFile['/bad/CLAUDE.md'], 'unchanged');
	// only the stale file was written
	assert.deepEqual(writes.map(w => w.path), ['/stale/CLAUDE.md']);
	assert.ok(writes[0]!.content.includes(BLOCK) && !writes[0]!.content.includes('OLD'));
});

test('walk: per-file read rejection → skipped+note, walk continues to remaining repos', async () => {
	const files: Record<string, string> = { '/ok/CLAUDE.md': `${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n` };
	const { deps, writes } = fakeDeps([repo('/boom'), repo('/ok')], files, {
		readFile: async (p) => {
			if (p === '/boom/CLAUDE.md') throw new Error('EACCES read');
			return p in files ? files[p]! : null;
		},
	});
	const report = await refreshSteeringAcrossRepos(deps);
	const boom = report.find(o => o.file === '/boom/CLAUDE.md')!;
	assert.equal(boom.action, 'skipped');
	assert.match(boom.note!, /refresh failed: EACCES read/);
	// walk still reached /ok and refreshed it
	assert.equal(report.find(o => o.file === '/ok/CLAUDE.md')!.action, 'replaced');
	assert.deepEqual(writes.map(w => w.path), ['/ok/CLAUDE.md']);
});

test('walk: per-file write rejection → skipped+note, other repos still refreshed', async () => {
	const marked = `${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n`;
	const files: Record<string, string> = { '/perm/CLAUDE.md': marked, '/ok/CLAUDE.md': marked };
	const written: string[] = [];
	const { deps } = fakeDeps([repo('/perm'), repo('/ok')], files, {
		writeFile: async (p) => {
			if (p === '/perm/CLAUDE.md') throw new Error('EACCES write');
			written.push(p);
		},
	});
	const report = await refreshSteeringAcrossRepos(deps);
	assert.equal(report.find(o => o.file === '/perm/CLAUDE.md')!.action, 'skipped');
	assert.match(report.find(o => o.file === '/perm/CLAUDE.md')!.note!, /EACCES write/);
	assert.equal(report.find(o => o.file === '/ok/CLAUDE.md')!.action, 'replaced');
	assert.deepEqual(written, ['/ok/CLAUDE.md']);
});

test('walk: CLAUDE.md refreshed while sibling AGENTS.md absent → independent per-file', async () => {
	const files: Record<string, string> = { '/r/CLAUDE.md': `${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n` };
	const { deps, writes } = fakeDeps([repo('/r')], files);
	const report = await refreshSteeringAcrossRepos(deps);
	assert.equal(report.find(o => o.file === '/r/CLAUDE.md')!.action, 'replaced');
	assert.equal(report.find(o => o.file === '/r/AGENTS.md')!.action, 'skipped');
	assert.deepEqual(writes.map(w => w.path), ['/r/CLAUDE.md']);
});

test('walk: zero registered repos → empty report, no writes', async () => {
	const { deps, writes } = fakeDeps([], {});
	const report = await refreshSteeringAcrossRepos(deps);
	assert.deepEqual(report, []);
	assert.equal(writes.length, 0);
});

test('walk: partial deps fills the omitted members with production defaults', async () => {
	// Override ONLY listRepos (empty, so no real fs/DB is touched). A
	// partial-default bug that filled listRepos alone would leave readBlock
	// undefined and throw on `d.readBlock()`; the full-merge default keeps the
	// shipped-asset readBlock (+ fs readFile/writeFile) wired. Empty repos ⇒ the
	// readBlock default is exercised but no file is read or written.
	const report = await refreshSteeringAcrossRepos({ listRepos: async () => [] });
	assert.deepEqual(report, []);
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
