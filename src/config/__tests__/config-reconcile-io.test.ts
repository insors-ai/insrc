/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the read/reconcile/write-once I/O wrapper (t8),
 * extending the on-disk fixture idiom (materialise a config file → run the
 * code under test → assert on the resulting file). A write-COUNTING fs seam
 * counts writeFile + rename invocations targeting the config document, so
 * "written at most once" is an assertion, not an inference — it fences off any
 * N-round-trip implementation, including one that writes the temp file twice.
 *
 * Run: npx tsx --test src/config/__tests__/config-reconcile-io.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import * as realFs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { CONFIG_CATALOG, type ConfigOption } from '../config-catalog.js';
import { reconcileConfig } from '../reconcile.js';
import { reconcileConfigFile, type ReconcileFsSeam } from '../reconcile-io.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const legacy = (): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, 'legacy-config.json'), 'utf-8'));
const baseline = (): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, 'legacy-config.baseline.json'), 'utf-8'));

interface Counts { writes: number; renames: number; unlinks: number }

/** Real-fs-backed seam that COUNTS config-document writes/renames/unlinks and
 *  can inject a write failure or a changed stat on the pre-rename re-stat. */
function countingSeam(opts: { throwOnWrite?: boolean; bumpStatAfter?: number } = {}): { seam: ReconcileFsSeam; counts: Counts } {
	const counts: Counts = { writes: 0, renames: 0, unlinks: 0 };
	let statCalls = 0;
	const seam: ReconcileFsSeam = {
		readFileSync: (p, enc) => realFs.readFileSync(p, enc),
		statSync: (p) => {
			statCalls += 1;
			const s = realFs.statSync(p);
			const bumped = opts.bumpStatAfter !== undefined && statCalls > opts.bumpStatAfter;
			return { mtimeMs: bumped ? s.mtimeMs + 100_000 : s.mtimeMs, size: s.size };
		},
		writeFileSync: (p, data, enc) => {
			counts.writes += 1;
			if (opts.throwOnWrite) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
			realFs.writeFileSync(p, data, enc);
		},
		renameSync: (from, to) => { counts.renames += 1; realFs.renameSync(from, to); },
		unlinkSync: (p) => { counts.unlinks += 1; realFs.unlinkSync(p); },
	};
	return { seam, counts };
}

function withTemp(fn: (configPath: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cfg-io-'));
	try { fn(join(dir, 'config.json')); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('legacy config on disk → exactly 1 writeFile + 1 rename; retired keys pruned, live namespaces byte-identical', () => {
	withTemp((configPath) => {
		writeFileSync(configPath, JSON.stringify(legacy(), null, 2));
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'written');
		assert.equal(counts.writes, 1);
		assert.equal(counts.renames, 1);
		const result = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const models = result['models'] as Record<string, unknown>;
		// the LIVE cloud/tiering namespaces survive byte-identical to the baseline
		const analyze = models['analyze'] as Record<string, unknown>;
		const bAnalyze = (baseline()['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
		assert.deepEqual(analyze['roleTiers'], bAnalyze['roleTiers']);
		assert.deepEqual(analyze['byRepo'], bAnalyze['byRepo']);
		// every retired key is now GONE (incl. the type-invalid embeddingDim + models.agents)
		for (const k of ['local', 'embedding', 'embeddingDim', 'tiers', 'context', 'agents']) {
			assert.equal(Object.prototype.hasOwnProperty.call(models, k), false, `models.${k} must be pruned`);
		}
		if (out.kind === 'written') assert.ok(out.result.pruned.length >= 5);
	});
});

test('prune-only change (nothing to fill/repair) → still exactly 1 writeFile + 1 rename', () => {
	withTemp((configPath) => {
		// A fully-reconciled doc (no fills/repairs left) with one stray retired key re-added.
		const normalized = reconcileConfig(legacy(), CONFIG_CATALOG).config as Record<string, unknown>;
		normalized['models'] = { ...(normalized['models'] as Record<string, unknown>), tiers: { fast: 'stray' } };
		writeFileSync(configPath, JSON.stringify(normalized, null, 2));
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'written');
		assert.equal(counts.writes, 1);
		assert.equal(counts.renames, 1);
		if (out.kind === 'written') {
			assert.deepEqual(out.result.filled, []);
			assert.deepEqual(out.result.repaired, []);
			assert.deepEqual(out.result.pruned, ['models.tiers']);   // prune-only trips changed
		}
	});
});

test('already-pruned/normalized config → 0 writeFile, 0 rename, mtime unchanged (steady state)', () => {
	withTemp((configPath) => {
		const normalized = reconcileConfig(legacy(), CONFIG_CATALOG).config;
		writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
		const mtimeBefore = statSync(configPath).mtimeMs;
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'unchanged');
		assert.equal(counts.writes, 0);
		assert.equal(counts.renames, 0);
		assert.equal(statSync(configPath).mtimeMs, mtimeBefore);
	});
});

test('ENOENT → degrades to reconcileConfig(undefined) and writes defaults once (first-boot equivalence)', () => {
	withTemp((configPath) => {
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'first-boot');
		assert.equal(counts.writes, 1);
		assert.equal(counts.renames, 1);
		assert.ok(existsSync(configPath));
	});
});

test('unreadable file (EISDIR) → nothing written, errno surfaced', () => {
	withTemp((configPath) => {
		mkdirSync(configPath);   // config path is a directory → readFileSync throws EISDIR
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'read-error');
		if (out.kind === 'read-error') assert.equal(out.errno, 'EISDIR');
		assert.equal(counts.writes, 0);
		assert.equal(counts.renames, 0);
	});
});

test('unreadable file (EACCES) → nothing written (skipped when running as root)', (t) => {
	if (typeof process.getuid === 'function' && process.getuid() === 0) { t.skip('running as root'); return; }
	withTemp((configPath) => {
		writeFileSync(configPath, '{}');
		realFs.chmodSync(configPath, 0o000);
		try {
			const { seam, counts } = countingSeam();
			const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
			assert.equal(out.kind, 'read-error');
			assert.equal(counts.writes, 0);
		} finally {
			realFs.chmodSync(configPath, 0o600);
		}
	});
});

test('corrupt / zero-byte JSON → aborts, writes NOTHING, on-disk bytes identical, no default-fill fallback', () => {
	for (const corrupt of ['{ "models": { not json', '']) {
		withTemp((configPath) => {
			writeFileSync(configPath, corrupt);
			const { seam, counts } = countingSeam();
			const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
			assert.equal(out.kind, 'parse-error');
			assert.equal(counts.writes, 0);
			assert.equal(counts.renames, 0);
			// bytes identical — the dynamic namespaces were NOT default-filled over
			assert.equal(readFileSync(configPath, 'utf-8'), corrupt);
		});
	}
});

test('write failure (ENOSPC) → temp file unlinked, no partial or half-renamed document', () => {
	withTemp((configPath) => {
		const original = JSON.stringify(legacy(), null, 2);
		writeFileSync(configPath, original);
		const { seam, counts } = countingSeam({ throwOnWrite: true });
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'write-error');
		assert.equal(counts.renames, 0);                 // never renamed
		assert.ok(counts.unlinks >= 1);                  // temp unlink attempted
		assert.ok(!existsSync(`${configPath}.tmp`));     // no partial temp left behind
		assert.equal(readFileSync(configPath, 'utf-8'), original); // original untouched
	});
});

test('concurrent modification between read stat and pre-rename re-stat → write abandoned, non-fatal', () => {
	withTemp((configPath) => {
		writeFileSync(configPath, JSON.stringify(legacy(), null, 2));
		const { seam, counts } = countingSeam({ bumpStatAfter: 1 }); // 2nd stat (pre-rename) looks changed
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG, fs: seam });
		assert.equal(out.kind, 'concurrent-modification');
		assert.equal(counts.writes, 0);
		assert.equal(counts.renames, 0);
	});
});

test('ConfigCatalogError surfaces as a structurally distinct outcome kind from I/O and parse failures', () => {
	withTemp((configPath) => {
		writeFileSync(configPath, '{}');
		const badCatalog: readonly ConfigOption[] = [{ path: 'x.y', type: 'nope' as never, default: '', desc: '' }];
		const { seam, counts } = countingSeam();
		const out = reconcileConfigFile({ configPath, catalog: badCatalog, fs: seam });
		assert.equal(out.kind, 'catalog-error');
		if (out.kind === 'catalog-error') assert.equal(out.catalogPath, 'x.y');
		assert.equal(counts.writes, 0);
	});
});

test('the wrapper source has no ~/.insrc or config.json string literal (path resolves via PATHS.config)', () => {
	const wrapperSrc = readFileSync(join(HERE, '..', 'reconcile-io.ts'), 'utf-8');
	const reconcilerSrc = readFileSync(join(HERE, '..', 'reconcile.ts'), 'utf-8');
	// Strip the deviation-note comment block (which legitimately NAMES the paths
	// as prose) before scanning for code-level literals.
	const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const [name, src] of [['reconcile-io.ts', wrapperSrc], ['reconcile.ts', reconcilerSrc]] as const) {
		const code = stripComments(src);
		assert.doesNotMatch(code, /~\/\.insrc/, `${name} must not hardcode ~/.insrc`);
		assert.doesNotMatch(code, /['"][^'"]*config\.json['"]/, `${name} must not hardcode a config.json path literal`);
	}
	// And it does resolve through PATHS.config.
	assert.match(wrapperSrc, /PATHS\.config/);
});
