/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6/t8: the analyzer's two exploration walkers
 * (concept.resolve's directory walk, module.profile's directory listing) and
 * the infra file walker ask the repository's FileFilter, so over one real git
 * fixture tree all three agree with its include/exclude set:
 *
 *   included  src/app.ts, src/util/x.ts         plain source
 *             coverage/report.ts, target/main.rs names on the old bare-name lists, not ignored
 *             vendor/forced.ts                   ignored by a rule, but tracked
 *             docs/sub/open.md, keep.log         a nested rule's sibling, a negation
 *   excluded  build/, node_modules/,             root .gitignore directory rules
 *             src/node_modules/
 *             docs/sub/secret/                   a nested .gitignore rule
 *             debug.log                          a root pattern rule
 *             app.min.js                         built-in: generated or minified
 *             .insrc/, .git/                     built-in: the daemon's and git's own directories
 *
 * The context's RepoIgnoreFilter is permissive, so only FileFilter decides.
 *
 * Run: npx tsx --test src/analyze/explore/__tests__/file-filter-walkers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { createFileFilter } from '../../../indexer/file-filter.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { walkFiles } from '../../runtimes/infra/_shared.js';
import { runConceptResolve } from '../concept-resolve.js';
import { runModuleProfile } from '../module-profile.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';

const NOW = '2026-11-01T00:00:00.000Z';

const INCLUDED_FILES = [
	'.gitignore', 'app.ts', 'coverage/report.ts', 'docs/sub/.gitignore', 'docs/sub/open.md',
	'keep.log', 'src/app.ts', 'src/util/x.ts', 'target/main.rs', 'vendor/forced.ts',
];

function exp(type: string, params: Record<string, unknown>): Exploration {
	return { id: 'e1', type, params } as unknown as Exploration;
}

async function withFixture(fn: (repo: string, ctx: ExplorationRunnerContext) => Promise<void>): Promise<void> {
	await closeGraphStore();
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s6-walkers-')));
	const repo = join(dir, 'repo');
	const write = (rel: string, body = 'x\n'): void => {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), body);
	};
	try {
		mkdirSync(repo);
		execFileSync('git', ['init', '-q'], { cwd: repo });
		write('.gitignore', 'build/\nnode_modules/\nvendor/\n*.log\n!keep.log\n');
		write('app.ts');
		write('src/app.ts');
		write('src/util/x.ts');
		write('coverage/report.ts');
		write('target/main.rs');
		write('vendor/forced.ts');
		write('docs/sub/.gitignore', 'secret/\n');
		write('docs/sub/open.md');
		write('docs/sub/secret/a.md');
		write('keep.log');
		write('debug.log');
		write('app.min.js');
		write('build/out.ts');
		write('node_modules/pkg/index.ts');
		write('src/node_modules/dep/index.ts');
		write('.insrc/state.ts');
		execFileSync('git', ['add', '-f', 'vendor/forced.ts'], { cwd: repo });

		setGraphStorePath(join(dir, 'graph.lmdb'));
		await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
		const ctx = {
			connectionExecution: savedAnalysisExecution(repo), runId: 'test', repoPath: repo, closureRepos: [repo],
			readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(repo),
		} as ExplorationRunnerContext;
		await fn(repo, ctx);
	} finally {
		await closeGraphStore();
		rmSync(dir, { recursive: true, force: true });
	}
}

test('the fixture\'s include/exclude set is FileFilter\'s own answer', async () => {
	await withFixture(async repo => {
		const listed = createFileFilter(repo).listFiles().map(f => relative(repo, f)).sort();
		assert.deepEqual(listed, INCLUDED_FILES);
	});
});

test('infra walkFiles yields exactly the files FileFilter includes', async () => {
	await withFixture(async repo => {
		const { files, truncated, unreadable } = await walkFiles(repo, null);
		assert.deepEqual(files.map(f => f.relPath).sort(), INCLUDED_FILES);
		assert.deepEqual([truncated, unreadable.length], [false, 0]);
	});
});

test('infra walkFiles of a directory inside the repository applies the repository\'s own rules', async () => {
	await withFixture(async repo => {
		const { files } = await walkFiles(join(repo, 'src'), null);
		assert.deepEqual(files.map(f => f.relPath).sort(), ['app.ts', 'util/x.ts'], 'the root .gitignore excludes src/node_modules/');
	});
});

test('infra walkFiles reports a directory it cannot read, and never descends into an ignored one', async () => {
	await withFixture(async repo => {
		// sealed/ is not ignored: it must be reported, not dropped. build/sealed/
		// is under an ignored directory the walk must not enter at all.
		const sealed = [join(repo, 'sealed'), join(repo, 'build/sealed')];
		for (const d of sealed) { mkdirSync(d); chmodSync(d, 0o000); }
		try {
			const { unreadable } = await walkFiles(repo, null);
			assert.deepEqual(unreadable.map(u => u.what), ['sealed']);
		} finally {
			for (const d of sealed) chmodSync(d, 0o755);
		}
	});
});

test('module.profile lists only the subdirectories and files FileFilter includes', async () => {
	await withFixture(async (repo, ctx) => {
		const root = await runModuleProfile(exp('module.profile', { path: repo }), ctx);
		assert.deepEqual(root.profile.subdirs.map(d => relative(repo, d)).sort(), ['coverage', 'docs', 'src', 'target', 'vendor']);
		assert.deepEqual(root.profile.filesInDir.map(f => relative(repo, f.file)).sort(), ['app.ts', 'keep.log']);

		const sub = await runModuleProfile(exp('module.profile', { path: join(repo, 'docs/sub') }), ctx);
		assert.deepEqual(sub.profile.subdirs, [], 'a nested .gitignore rule excludes secret/');
		assert.deepEqual(sub.profile.filesInDir.map(f => relative(repo, f.file)), ['docs/sub/open.md']);
	});
});

test('concept.resolve enumerates only the directories FileFilter includes', async () => {
	await withFixture(async (repo, ctx) => {
		const out = await runConceptResolve(exp('concept.resolve', {
			query: 'coverage target vendor util build node modules secret insrc', includeKinds: ['dir'],
		}), ctx);
		const dirs = out.hits.map(h => relative(repo, h.path)).sort();
		assert.deepEqual(dirs, ['coverage', 'src/util', 'target', 'vendor']);
	});
});
