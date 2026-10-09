/**
 * The one definition of a module for the code plan tasks, and the reading of
 * a task's module value (LLD-b9d5c5c4-s8, task t1).
 *
 * Entities are plain arrays built by hand: no store, no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { Entity, EntityKind } from '../../../../shared/types.js';
import type { ResolvedScope } from '../../../context/scope.js';
import { moduleOfDirectory, moduleOfEntityId, sourceModulesOf } from '../source-modules.js';
import { inAreaOf } from '../task-scope.js';

const REPO = '/work/app';

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = rel === '' ? '' : `${REPO}/${rel}`;
	return {
		// A stored id is a hex string: it holds no path separator.
		id: makeEntityId(REPO, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 5, body: '', embedding: [], indexedAt: '2026-10-09T00:00:00.000Z', ...extra,
	} as Entity;
}
const src = (rel: string, extra: Partial<Entity> = {}): Entity => ent('file', rel.split('/').pop()!, rel, extra);
const doc = (rel: string): Entity => src(rel, { artifact: true, language: 'markdown' });

/** A resolved scope on a directory of the repo (or the repo itself). */
function dirScope(kind: 'repo' | 'module' | 'workspace' | 'manifest-dir', rel = '', repoPath: string | null = REPO): ResolvedScope {
	const dir = rel === '' ? REPO : `${REPO}/${rel}`;
	return { kind, value: dir, repoPath, lookupPath: dir };
}
const fileScope = (rel: string): ResolvedScope =>
	({ kind: 'file', value: `${REPO}/${rel}`, repoPath: REPO, lookupPath: REPO, filePath: `${REPO}/${rel}` });
const symbolScope = (entity: Entity): ResolvedScope =>
	({ kind: 'symbol', value: `${entity.file}#${entity.name}`, repoPath: REPO, lookupPath: REPO, filePath: entity.file, entityId: entity.id, entityName: entity.name });

/** The modules of a scope over all the repo's entities, as a runtime computes them. */
function modulesOf(scope: ResolvedScope, all: readonly Entity[]) {
	return sourceModulesOf(scope, all.filter(inAreaOf(scope)), all.filter(e => e.kind === 'module'));
}
const view = (scope: ResolvedScope, all: readonly Entity[]): string[] =>
	modulesOf(scope, all).map(m => `${m.name}|${m.directory.slice(REPO.length) || '/'}|${m.fileCount}${m.entity !== undefined ? `|${m.entity.id}` : ''}`);

test('sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)', () => {
	const all = [
		src('src/pay/settle.ts'), src('src/pay/ledger.ts'),
		ent('function', 'settle', 'src/pay/settle.ts'),         // a symbol is not a file
		src('src/pay/rules/late.ts'),
		src('src/ship/track.ts'),
		doc('docs/policy.md'), doc('docs/design/plan.md'),      // artifacts only
		doc('src/pay/README.md'),                               // an artifact beside source: not counted
	];
	// `src` holds source only in its sub-directories: it is not a module; its sub-directories are.
	assert.deepEqual(view(dirScope('repo'), all), ['src/pay|/src/pay|2', 'src/pay/rules|/src/pay/rules|1', 'src/ship|/src/ship|1']);
	// Sorted by directory, whatever the order of the entities.
	assert.deepEqual(view(dirScope('repo'), [...all].reverse()), view(dirScope('repo'), all));
	// A directory of artifacts only gives nothing, and neither does an empty area.
	assert.deepEqual(view(dirScope('module', 'docs'), all), []);
	assert.deepEqual(sourceModulesOf(dirScope('repo'), [], []), []);
	// No limit: every directory is listed.
	const many = Array.from({ length: 400 }, (_, i) => src(`pkg/d${String(i).padStart(3, '0')}/a.ts`));
	assert.equal(modulesOf(dirScope('repo'), many).length, 400);

	// The language is the one most of the directory's source files have; the first by name on a tie.
	const mixed = [src('m/a.ts'), src('m/b.py', { language: 'python' }), src('m/c.py', { language: 'python' }), src('n/a.ts'), src('n/b.go', { language: 'go' })];
	assert.deepEqual(modulesOf(dirScope('repo'), mixed).map(m => [m.name, m.language]), [['m', 'python'], ['n', 'go']]);
});

test('sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area\'s entities only)', () => {
	const pay = ent('module', 'pay-pkg', 'pay/package.json', { language: 'json' });
	const all = [
		pay,
		src('pay/settle.ts'), src('pay/rules/late.ts'), src('pay/rules/deep/x.ts'),
		src('ship/track.ts'),
	];
	// The stored module keeps its name, its id and its own language; nothing in or under `pay` is a module of its own.
	const modules = modulesOf(dirScope('repo'), all);
	assert.deepEqual(modules.map(m => [m.name, m.directory, m.fileCount, m.language, m.entity?.id]), [
		['pay-pkg', `${REPO}/pay`, 1, 'json', pay.id],
		['ship', `${REPO}/ship`, 1, 'typescript', undefined],
	]);

	// A run scoped UNDER the stored module: the entity lies above the area and is not listed,
	// and the directories of the area are still that module's, so none is listed.
	assert.deepEqual(view(dirScope('module', 'pay/rules'), all), []);
	// Scoped to the module's own directory: the entity is in the area and is the one module.
	assert.deepEqual(view(dirScope('module', 'pay'), all), [`pay-pkg|/pay|1|${pay.id}`]);
	// Scoped beside it: the other directory, untouched by the stored module.
	assert.deepEqual(view(dirScope('module', 'ship'), all), ['ship|/ship|1']);

	// A stored module at the repo's root owns everything.
	const root = ent('module', 'app', 'package.json');
	assert.deepEqual(view(dirScope('repo'), [root, ...all.slice(1)]), [`app|/|0|${root.id}`]);
	assert.deepEqual(view(dirScope('module', 'ship'), [root, ...all.slice(1)]), []);
	// Two stored modules that nest are both listed.
	const inner = ent('module', 'rules-pkg', 'pay/rules/package.json');
	assert.deepEqual(view(dirScope('repo'), [pay, inner, ...all.slice(1)]).slice(0, 2), [`pay-pkg|/pay|1|${pay.id}`, `rules-pkg|/pay/rules|1|${inner.id}`]);

	// An imported module, as a parser stores it (empty file), owns no directory of the repo.
	const imported = ent('module', 'lodash', '', { repo: '' });
	assert.deepEqual(sourceModulesOf(dirScope('repo'), [src('ship/track.ts')], [imported]).map(m => m.name), ['ship']);
	// Nor is it a module of the area, should one ever be among the area's entities: it has no directory.
	assert.deepEqual(sourceModulesOf(dirScope('repo'), [imported, src('ship/track.ts')], [imported]).map(m => m.name), ['ship']);

	// Under a file scope and a symbol scope no directory is a module; a stored module entity the area contains is kept.
	assert.deepEqual(view(fileScope('ship/track.ts'), all), []);
	assert.deepEqual(view(fileScope('pay/package.json'), all), [`pay-pkg|/pay|0|${pay.id}`]);
	assert.deepEqual(view(symbolScope(pay), all), [`pay-pkg|/pay|0|${pay.id}`]);
	assert.deepEqual(view(symbolScope(ent('function', 'settle', 'pay/settle.ts')), all), []);
});

test("sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash)", () => {
	const all = [src('main.ts'), src('pay/a.ts'), src('payments/b.ts'), src('payments/eu/c.ts')];
	assert.deepEqual(view(dirScope('repo'), all), ['.|/|1', 'pay|/pay|1', 'payments|/payments|1', 'payments/eu|/payments/eu|1']);

	// A stored module at `pay` owns `pay`, and not `payments` or what lies under it.
	const pay = ent('module', 'pay-pkg', 'pay/package.json');
	assert.deepEqual(view(dirScope('repo'), [pay, ...all]), ['.|/|1', `pay-pkg|/pay|1|${pay.id}`, 'payments|/payments|1', 'payments/eu|/payments/eu|1']);

	// With no known repo the scope's own directory is the base of the name.
	assert.deepEqual(view(dirScope('module', 'payments', null), all), ['.|/payments|1', 'eu|/payments/eu|1']);
	// A workspace and a manifest directory on a sub-directory keep to it and are named from the repo.
	assert.deepEqual(view(dirScope('workspace', 'payments'), all), ['payments|/payments|1', 'payments/eu|/payments/eu|1']);
	assert.deepEqual(view(dirScope('manifest-dir', 'pay'), all), ['pay|/pay|1']);
});

test("moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)", async () => {
	const all = [src('main.ts'), src('src/pay/a.ts'), src('src/pay/rules/b.ts')];
	const scope = dirScope('repo');
	const pay = { directory: `${REPO}/src/pay`, name: 'src/pay', path: `${REPO}/src/pay` };
	for (const value of [`${REPO}/src/pay`, `${REPO}/src/pay/`, 'src/pay', 'src/pay/', './src/pay', 'src/pay//']) {
		assert.deepEqual(moduleOfDirectory(value, scope, all), pay, value);
	}
	// '.', the empty relative path and the repo's own path name the repo's directory.
	for (const value of ['.', './', '', REPO, `${REPO}/`]) {
		assert.deepEqual(moduleOfDirectory(value, scope, all), { directory: REPO, name: '.', path: REPO }, JSON.stringify(value));
	}
	// '.' and '..' segments are resolved before anything is tested: the path names the directory it leads to.
	for (const value of ['src/./pay', 'src/pay/rules/..', 'src/other/../pay', `${REPO}/src/../src/pay/.`]) {
		assert.deepEqual(moduleOfDirectory(value, scope, all), pay, value);
	}
	// A directory that holds source only in its sub-directories is a valid value.
	assert.deepEqual(moduleOfDirectory('src', scope, all), { directory: `${REPO}/src`, name: 'src', path: `${REPO}/src` });

	// --- an entity id: looked up with the callback alone ---
	const stored = ent('module', 'pay-pkg', 'src/pay/package.json');
	const asked: string[] = [];
	const lookup = async (id: string): Promise<Entity | null> => { asked.push(id); return id === stored.id ? stored : null; };
	assert.deepEqual(await moduleOfEntityId(stored.id, lookup, 't07'), { directory: `${REPO}/src/pay`, name: 'pay-pkg', path: stored.file, entity: stored });
	// A value that is no entity's id is not a module by id: the caller reads it as a directory.
	assert.equal(await moduleOfEntityId('analyze', lookup, 't07'), null);
	assert.deepEqual(asked, [stored.id, 'analyze']);
	// A path is never looked up as an id.
	asked.length = 0;
	assert.equal(await moduleOfEntityId(`${REPO}/src/pay`, lookup, 't07'), null);
	assert.equal(await moduleOfEntityId('src/pay', lookup, 't07'), null);
	assert.deepEqual(asked, []);
	// The function takes a value, a lookup and the task's id for its one message: no scope, no entity list.
	assert.equal(moduleOfEntityId.length, 3);
});

test("moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory", async () => {
	const all = [src('src/pay/a.ts'), src('src/ship/b.ts'), doc('docs/policy.md')];
	const repo = dirScope('repo');
	const message = (run: () => unknown): string => { try { run(); } catch (err) { return (err as Error).message; } return 'NOT REFUSED'; };

	// --- no stored source under it: a directory that does not exist, one of documents only, a bare name ---
	for (const [value, directory] of [['src/none', `${REPO}/src/none`], ['docs', `${REPO}/docs`], ['analyze', `${REPO}/analyze`], [`${REPO}/src/pa`, `${REPO}/src/pa`]] as const) {
		assert.equal(message(() => moduleOfDirectory(value, repo, all)),
			`code.surface.functional: the module value '${value}' names the directory '${directory}', and no stored source file lies under it in the repo '${REPO}'.`);
	}
	// --- outside the repo that was read ---
	assert.equal(message(() => moduleOfDirectory('/elsewhere/src', repo, all)),
		`code.surface.functional: the module value '/elsewhere/src' names the directory '/elsewhere/src', which lies outside the area of the run's scope ('${REPO}').`);
	assert.match(message(() => moduleOfDirectory(`${REPO}-other/src`, repo, all)), /lies outside the area of the run's scope/);
	// --- outside the area of a module scope, though inside the repo and holding source ---
	const payScope = dirScope('module', 'src/pay');
	const inPay = all.filter(inAreaOf(payScope));
	assert.equal(message(() => moduleOfDirectory('src/ship', payScope, inPay)),
		`code.surface.functional: the module value 'src/ship' names the directory '${REPO}/src/ship', which lies outside the area of the run's scope ('${REPO}/src/pay').`);
	assert.match(message(() => moduleOfDirectory('src', payScope, inPay)), /lies outside the area/, 'the parent of the area is outside it');
	assert.equal(moduleOfDirectory('src/pay', payScope, inPay).directory, `${REPO}/src/pay`, 'the area itself is in it');
	// A path that climbs out of the area is outside it, and is told so; one that climbs out of the repo too.
	assert.equal(message(() => moduleOfDirectory('src/pay/../ship', payScope, inPay)),
		`code.surface.functional: the module value 'src/pay/../ship' names the directory '${REPO}/src/ship', which lies outside the area of the run's scope ('${REPO}/src/pay').`);
	assert.match(message(() => moduleOfDirectory('../elsewhere', repo, all)), /names the directory '\/work\/elsewhere', which lies outside the area/);
	assert.equal(moduleOfDirectory('src/ship/../pay', payScope, inPay).directory, `${REPO}/src/pay`, 'a path that climbs and comes back into the area is in it');
	// --- a directory path under a file scope or a symbol scope: refused before anything else is tested ---
	for (const scope of [fileScope('src/pay/a.ts'), symbolScope(ent('function', 'settle', 'src/pay/a.ts'))]) {
		for (const value of ['src/pay', '/elsewhere', 'src/none']) {
			assert.equal(message(() => moduleOfDirectory(value, scope, all)),
				`code.surface.functional: the module value '${value}' is a directory path, and the run's scope is a ${scope.kind} scope. A scope of one file or one symbol holds no directory to describe.`);
		}
	}
	// The order of the tests: outside the area is said before 'no stored source'.
	assert.match(message(() => moduleOfDirectory('/elsewhere/none', repo, all)), /lies outside the area/);

	// --- with no known repo a relative value is joined to the scope's own directory ---
	const lenient = dirScope('module', 'src', null);
	const inSrc = all.filter(inAreaOf(lenient));
	assert.deepEqual(moduleOfDirectory('pay', lenient, inSrc), { directory: `${REPO}/src/pay`, name: 'pay', path: `${REPO}/src/pay` });
	assert.equal(message(() => moduleOfDirectory('src/pay', lenient, inSrc)),
		`code.surface.functional: the module value 'src/pay' names the directory '${REPO}/src/src/pay', and no stored source file lies under it in the repo '${REPO}/src'.`);

	// --- the id of an entity of another kind ---
	const fn = ent('function', 'settle', 'src/pay/a.ts');
	await assert.rejects(moduleOfEntityId(fn.id, async () => fn, 't07'), (err: Error) => {
		// Word for word the message of src/analyze/runtimes/code/surface-functional.ts before this Story.
		assert.equal(err.message, `code.surface.functional: entity '${fn.id}' has kind='function', expected 'module' (taskId=t07)`);
		return true;
	});
});
