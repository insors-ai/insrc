/**
 * Tests for resolver.ts Python relative-import handling
 * (plans/cross-file-references.md Phase 1).
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveRelations } from '../resolver.js';
import { makeEntityId } from '../parser/base.js';
import type { Entity, Relation } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Fixture: a synthetic Python package layout
//
//   <repo>/
//     pkg/
//       __init__.py
//       a.py
//       b.py
//       sub/
//         __init__.py
//         c.py
// ---------------------------------------------------------------------------

let repo: string;

before(() => {
	repo = mkdtempSync(join(tmpdir(), 'insrc-resolver-py-'));
	mkdirSync(join(repo, 'pkg', 'sub'), { recursive: true });
	writeFileSync(join(repo, 'pkg', '__init__.py'),     '# pkg init');
	writeFileSync(join(repo, 'pkg', 'a.py'),            '# a');
	writeFileSync(join(repo, 'pkg', 'b.py'),            '# b');
	writeFileSync(join(repo, 'pkg', 'sub', '__init__.py'), '# sub init');
	writeFileSync(join(repo, 'pkg', 'sub', 'c.py'),     '# c');
});

after(() => {
	try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileEntity(filePath: string): Entity {
	const id = makeEntityId(repo, filePath, 'file', filePath);
	return {
		id, kind: 'file', name: filePath, language: 'python',
		repoId: 1,
		repo, file: filePath, startLine: 0, endLine: 0,
		body: '', embedding: [], indexedAt: new Date().toISOString(),
	};
}

function makeRelativeImport(fromFile: string, specifier: string): Relation {
	const fromId = makeEntityId(repo, fromFile, 'file', fromFile);
	return {
		kind:     'IMPORTS',
		from:     fromId,
		to:       specifier,
		resolved: false,
		meta:     { file: fromFile, repo, isRelative: true },
	};
}

function expectedFileId(targetPath: string): string {
	return makeEntityId(repo, targetPath, 'file', targetPath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRelations -- Python relative imports', () => {
	it('`from .b import x` from pkg/a.py resolves to pkg/b.py', () => {
		const fromFile = join(repo, 'pkg', 'a.py');
		const rel = makeRelativeImport(fromFile, '.b');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', 'b.py')));
	});

	it('`from .sub.c import x` resolves to pkg/sub/c.py', () => {
		const fromFile = join(repo, 'pkg', 'a.py');
		const rel = makeRelativeImport(fromFile, '.sub.c');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', 'sub', 'c.py')));
	});

	it('`from .sub import x` resolves to pkg/sub/__init__.py', () => {
		const fromFile = join(repo, 'pkg', 'a.py');
		const rel = makeRelativeImport(fromFile, '.sub');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		// `.sub` could match a file (sub.py — doesn't exist) or
		// sub/__init__.py — should pick the existing one.
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', 'sub', '__init__.py')));
	});

	it('`from . import x` from pkg/a.py resolves to pkg/__init__.py', () => {
		const fromFile = join(repo, 'pkg', 'a.py');
		const rel = makeRelativeImport(fromFile, '.');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', '__init__.py')));
	});

	it('`from .. import x` from pkg/sub/c.py resolves to pkg/__init__.py', () => {
		const fromFile = join(repo, 'pkg', 'sub', 'c.py');
		const rel = makeRelativeImport(fromFile, '..');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', '__init__.py')));
	});

	it('`from ..a import x` from pkg/sub/c.py resolves to pkg/a.py', () => {
		const fromFile = join(repo, 'pkg', 'sub', 'c.py');
		const rel = makeRelativeImport(fromFile, '..a');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, true);
		assert.equal(out[0]?.to, expectedFileId(join(repo, 'pkg', 'a.py')));
	});

	it('missing target stays unresolved', () => {
		const fromFile = join(repo, 'pkg', 'a.py');
		const rel = makeRelativeImport(fromFile, '.no_such_module');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, false);
		// Raw specifier preserved for the cross-file pass to retry.
		assert.equal(out[0]?.to, '.no_such_module');
	});

	it('does not escape the repo root', () => {
		// `....` from pkg/sub/c.py would walk up 3 dirs (above repo).
		const fromFile = join(repo, 'pkg', 'sub', 'c.py');
		const rel = makeRelativeImport(fromFile, '....nope');
		const out = resolveRelations([rel], fromFile, repo, [makeFileEntity(fromFile)]);
		assert.equal(out[0]?.resolved, false);
	});
});
