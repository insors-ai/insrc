import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REPO_TRACKER_FIELDS, validateBranchPattern, validateRepoSetting } from '../repo-fields.js';
import type { BranchPatternRule, RepoFieldDef } from '../repo-fields.js';
import { buildSettingsCatalog } from '../settings-catalog.js';
import { CONFIG_CATALOG } from '../config-catalog.js';
import { SIGNOFF_STAGES } from '../../workflow/team/types.js';
import type { TeamPolicy } from '../../workflow/team/types.js';

test('table keys, kinds, GithubEntry fields and one policy row per TeamPolicy rule', () => {
	const keys = REPO_TRACKER_FIELDS.map(r => r.key);
	assert.equal(new Set(keys).size, keys.length, 'keys are unique');
	for (const r of REPO_TRACKER_FIELDS) {
		assert.ok(['local', 'status', 'policy'].includes(r.kind), `${r.key} kind`);
		assert.equal(r.group, 'Tracker');
		assert.ok(r.label.length > 0 && r.description.length > 0, `${r.key} text`);
		if (r.type === 'enum') assert.ok((r.enumValues ?? []).length > 0, `${r.key} enum values`);
	}

	const local = REPO_TRACKER_FIELDS.filter(r => r.kind === 'local').map(r => r.key);
	assert.deepEqual(local, ['type', 'owner', 'repo', 'ghPath', 'ghHost', 'branchPattern']);
	const sample: Record<string, unknown> = { type: 'github', owner: 'o', repo: 'r', ghPath: 'p', ghHost: 'h', branchPattern: 'b' };
	assert.deepEqual(Object.keys(sample).sort(), [...local].sort());

	// One policy row per rule of a real TeamPolicy value (every key except its provenance).
	const policy: TeamPolicy = {
		teamMode: true, signoffStages: [...SIGNOFF_STAGES], claimsEnforced: true, administrators: ['a'],
		claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] },
		forceTaskIssues: true,
		source: { ref: 'r', fetchedAt: 't', firstCommit: 'c', firstCommitTime: 't', anchorKnown: true },
	};
	const rules = Object.keys(policy).filter(k => k !== 'source').sort();
	const policyRows = REPO_TRACKER_FIELDS.filter(r => r.kind === 'policy').map(r => r.key).sort();
	assert.deepEqual(policyRows, rules);

	assert.deepEqual(REPO_TRACKER_FIELDS.filter(r => r.kind === 'status').map(r => r.key), ['signin', 'target']);
	for (const k of ['ghPath', 'ghHost', 'branchPattern']) {
		assert.equal(REPO_TRACKER_FIELDS.find(r => r.key === k)?.note, 'saved; not used yet');
	}
	assert.equal(REPO_TRACKER_FIELDS.find(r => r.key === 'ghHost')?.default, 'github.com');
});

test('branchPattern validator accepts and rejects every listed form with the failing rule', () => {
	for (const ok of ['feature/{type}/{id}-{slug}', '{id}', '{id}-{slug}', 'release/v1.2', 'a'.repeat(200)]) {
		assert.deepEqual(validateBranchPattern(ok), { ok: true }, ok);
	}
	const bad: Array<[string, BranchPatternRule]> = [
		['{user}', 'placeholder'],
		['{id', 'unmatched-brace'],
		['id}', 'unmatched-brace'],
		['{{id}}', 'unmatched-brace'],
		['{}', 'placeholder'],
		['a{b', 'unmatched-brace'],
		['a b', 'characters'],
		['a~b', 'characters'],
		['a^b', 'characters'],
		['a:b', 'characters'],
		['a?b', 'characters'],
		['a*b', 'characters'],
		['a[b', 'characters'],
		['a\\b', 'characters'],
		['', 'length'],
		['a'.repeat(201), 'length'],
		['/a', 'leading-slash'],
		['a/', 'trailing-slash'],
		['a//b', 'consecutive-slashes'],
		['a..b', 'dot-dot'],
		['a.lock', 'lock-suffix'],
		['{id}.lock', 'lock-suffix'],
	];
	for (const [pattern, rule] of bad) {
		const r = validateBranchPattern(pattern);
		assert.equal(r.ok, false, JSON.stringify(pattern));
		if (!r.ok) {
			assert.equal(r.rule, rule, JSON.stringify(pattern));
			assert.ok(r.message.length > 0);
		}
	}
});

test('a table copy with another placeholder changes what the validator accepts', () => {
	assert.equal(validateBranchPattern('{owner}/{id}').ok, false);
	const copy: RepoFieldDef[] = REPO_TRACKER_FIELDS.map(r =>
		r.key === 'branchPattern' && r.grammar !== undefined
			? { ...r, grammar: { ...r.grammar, placeholders: [...r.grammar.placeholders, 'owner'] } }
			: r);
	assert.deepEqual(validateBranchPattern('{owner}/{id}', copy), { ok: true });
	assert.deepEqual(validateRepoSetting('branchPattern', '{owner}/{id}', copy), { ok: true, value: '{owner}/{id}' });
	assert.equal(validateRepoSetting('branchPattern', '{owner}/{id}').ok, false);
	// The shipped table is untouched.
	assert.equal(REPO_TRACKER_FIELDS.find(r => r.key === 'branchPattern')?.grammar?.placeholders.length, 3);
});

test('buildSettingsCatalog keeps existing fields, adds repoFields and never throws', () => {
	const empty = buildSettingsCatalog({});
	assert.equal(empty.options, CONFIG_CATALOG);
	assert.deepEqual(empty.values, {});
	assert.equal(empty.repoFields, REPO_TRACKER_FIELDS);
	assert.deepEqual(Object.keys(empty).sort(), ['groups', 'options', 'repoFields', 'roles', 'tierNames', 'values']);

	const garbage = [{ logLevel: 5 }, { models: null }, { models: [] }, { 'a.b': { c: undefined } }] as Array<Record<string, unknown>>;
	for (const g of garbage) {
		const p = buildSettingsCatalog(g);
		assert.equal(p.repoFields, REPO_TRACKER_FIELDS);
		assert.equal(p.options, CONFIG_CATALOG);
	}
	// repoFields is static: it does not depend on the config.
	assert.equal(buildSettingsCatalog({ logLevel: 'debug' }).repoFields, empty.repoFields);
});

test('validateRepoSetting per row for type, owner, repo, ghPath and ghHost', () => {
	assert.deepEqual(validateRepoSetting('type', 'github'), { ok: true, value: 'github' });
	assert.deepEqual(validateRepoSetting('type', 'none'), { ok: true, value: 'none' });
	for (const v of ['gitlab', '', 3, true]) assert.equal(validateRepoSetting('type', v).ok, false, String(v));

	assert.deepEqual(validateRepoSetting('owner', 'my-org'), { ok: true, value: 'my-org' });
	for (const v of ['-org', 'my org', 'a/b', '', 5]) assert.equal(validateRepoSetting('owner', v).ok, false, String(v));

	assert.deepEqual(validateRepoSetting('repo', 'my.repo_1'), { ok: true, value: 'my.repo_1' });
	for (const v of ['..', '.', 'a/b', 'a b', '', 7]) assert.equal(validateRepoSetting('repo', v).ok, false, String(v));

	assert.deepEqual(validateRepoSetting('ghPath', '/usr/local/bin/gh'), { ok: true, value: '/usr/local/bin/gh' });
	assert.deepEqual(validateRepoSetting('ghHost', 'ghe.example.com'), { ok: true, value: 'ghe.example.com' });
	for (const key of ['ghPath', 'ghHost']) {
		for (const v of ['a\nb', 'a\rb', 'a\u0000b', '', 'x'.repeat(1025), true]) {
			assert.equal(validateRepoSetting(key, v).ok, false, `${key} ${JSON.stringify(v)}`);
		}
	}

	// null clears any local row.
	for (const key of ['type', 'owner', 'repo', 'ghPath', 'ghHost', 'branchPattern']) {
		assert.deepEqual(validateRepoSetting(key, null), { ok: true, value: null }, key);
	}

	// Codes for keys that are not editable.
	assert.deepEqual(codeOf(validateRepoSetting('nope', 'x')), 'unknown-key');
	assert.deepEqual(codeOf(validateRepoSetting('signin', 'x')), 'read-only-key');
	assert.deepEqual(codeOf(validateRepoSetting('target', 'x')), 'read-only-key');
	assert.deepEqual(codeOf(validateRepoSetting('teamMode', true)), 'read-only-key');

	// An invalid branch pattern names its rule.
	const r = validateRepoSetting('branchPattern', '{user}');
	assert.ok(!r.ok && r.code === 'invalid-value' && r.rule === 'placeholder');
});

function codeOf(r: ReturnType<typeof validateRepoSetting>): string | undefined { return r.ok ? undefined : r.code; }
