/**
 * The TAP reader (LLD-9b4a74dc-S001, task t1), pinned to a capture of the real
 * runner: `npx tsx --test --test-force-exit --test-reporter=tap` under Node 22
 * over one file with nested suites, subtests, skipped and todo tests, a
 * duplicated title and a title with '#', a backslash and both kinds of quote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTapRun, resultOfTitle } from '../tap-results.js';

const SAMPLE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tap-sample.tap'), 'utf8');

test("the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO'", () => {
	const run = parseTapRun(SAMPLE);
	assert.equal(run.understood, true);
	// Every result line of the capture, in the order printed.
	assert.deepEqual(run.titles.map(t => `${t.depth} ${t.result} ${t.title}`), [
		'0 pass plain pass',
		'0 fail plain fail',
		'0 skipped skipped by option',
		'0 skipped skipped with reason',
		'0 skipped todo one',
		`0 pass has # hash and \\ backslash and "double" and 'single' quotes`,
		'0 pass dup title',
		'0 fail dup title',
		'1 pass nested pass',
		'2 fail deep fail',
		'1 fail inner suite',
		'0 fail outer suite',
		'1 pass sub one',
		'1 skipped sub two',
		'0 pass parent with subtests',
	]);
	assert.equal(resultOfTitle(run, 'plain pass'), 'pass');
	assert.equal(resultOfTitle(run, 'plain fail'), 'fail');
	assert.equal(resultOfTitle(run, 'skipped by option'), 'skipped');
	assert.equal(resultOfTitle(run, 'skipped with reason'), 'skipped');
	assert.equal(resultOfTitle(run, 'todo one'), 'skipped');
	assert.equal(resultOfTitle(run, 'no such title'), 'not found');
});

test('a title nested in a suite or a subtest is found at its depth by its own title', () => {
	const run = parseTapRun(SAMPLE);
	assert.equal(resultOfTitle(run, 'nested pass'), 'pass');
	assert.equal(resultOfTitle(run, 'deep fail'), 'fail');
	assert.equal(resultOfTitle(run, 'sub one'), 'pass');
	assert.equal(resultOfTitle(run, 'sub two'), 'skipped');
	// A suite's or a parent's own line is a title like any other.
	assert.equal(resultOfTitle(run, 'outer suite'), 'fail');
	assert.equal(resultOfTitle(run, 'parent with subtests'), 'pass');
	// Not matched by the titles of the blocks around it.
	assert.equal(resultOfTitle(run, 'outer suite nested pass'), 'not found');
	assert.deepEqual(run.titles.filter(t => t.title === 'deep fail').map(t => t.depth), [2]);
});

test("TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line)", () => {
	const run = parseTapRun(SAMPLE);
	// The capture prints `has \# hash and \\ backslash ...`.
	assert.ok(SAMPLE.includes('ok 6 - has \\# hash and \\\\ backslash and "double" and \'single\' quotes'));
	const declared = `has # hash and \\ backslash and "double" and 'single' quotes`;
	assert.equal(resultOfTitle(run, declared), 'pass');
	assert.equal(resultOfTitle(run, 'has \\# hash and \\\\ backslash and "double" and \'single\' quotes'), 'not found');
	// An escaped '#' does not start a directive; an unescaped one does.
	const made = parseTapRun('TAP version 13\nok 1 - a \\# SKIP b\nok 2 - c # SKIP d\nnot ok 3 - e # TODO\n');
	assert.deepEqual(made.titles.map(t => `${t.result} ${t.title}`), ['pass a # SKIP b', 'skipped c', 'skipped e']);
});

test('a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped', () => {
	// The capture has `dup title` once ok and once not ok.
	assert.equal(resultOfTitle(parseTapRun(SAMPLE), 'dup title'), 'fail');
	const run = (lines: string[]) => parseTapRun(['TAP version 13', ...lines].join('\n'));
	assert.equal(resultOfTitle(run(['not ok 1 - d', 'ok 2 - d']), 'd'), 'fail');
	assert.equal(resultOfTitle(run(['ok 1 - d', 'ok 2 - d # SKIP']), 'd'), 'pass');
	assert.equal(resultOfTitle(run(['ok 1 - d # SKIP', 'ok 2 - d']), 'd'), 'pass');
	assert.equal(resultOfTitle(run(['ok 1 - d # SKIP', 'ok 2 - d # TODO']), 'd'), 'skipped');
	assert.equal(resultOfTitle(run(['ok 1 - d # SKIP', '    not ok 1 - d']), 'd'), 'fail');
});

test('output with no TAP version line and no result line is reported as not understood, with no titles', () => {
	assert.deepEqual(parseTapRun(''), { understood: false, titles: [] });
	assert.deepEqual(parseTapRun('Error: Cannot find module x\n    at node:internal\n'), { understood: false, titles: [] });
	// A version line alone, or a result line alone, is understood.
	assert.equal(parseTapRun('TAP version 13\n').understood, true);
	assert.equal(parseTapRun('ok 1 - a\n').understood, true);
	// A line inside a YAML block is not a result, whatever it looks like.
	const yaml = parseTapRun('TAP version 13\nnot ok 1 - a\n  ---\n  error: |-\nok 2 - not a test\n  ...\nok 2 - b\n');
	assert.deepEqual(yaml.titles.map(t => `${t.result} ${t.title}`), ['fail a', 'pass b']);
});
