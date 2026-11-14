import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('live readiness and main-only signing policy fail closed after approval', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-release-policy-'));
	try {
		writeFileSync(join(root, 'gh'), `#!/bin/bash
case "$2" in
 */actions/variables/*) [[ "$STATE" != missing ]] || exit 1; printf '{"value":"%s"}\\n' "$STATE";;
 */branches/main) echo '{"name":"main","protected":true}';;
 */deployment-branch-policies*) printf '%s\\n' "$REFS";;
 */environments/*) printf '%s\\n' "$POLICY";;
 *) exit 3;;
esac
`, { mode: 0o700 });
		const policy = { name: 'daemon-pilot-production', can_admins_bypass: false,
			deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
			protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ id: 1 }] }] };
		const ref = { name: 'main', type: 'branch' };
		const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, GITHUB_REF: 'refs/heads/main', GH_REPO: 'owner/repo',
			INSRC_RELEASE_POLICY_READ_TOKEN: 'fixture', STATE: 'true', POLICY: JSON.stringify(policy),
			REFS: JSON.stringify({ total_count: 1, branch_policies: [ref] }) };
		const run = (override: Record<string, string> = {}) => spawnSync('/bin/bash',
			[new URL('../check-daemon-release-policy.sh', import.meta.url).pathname, 'daemon-pilot-production'],
			{ env: { ...env, ...override }, encoding: 'utf8' }).status;
		assert.equal(run(), 0);
		for (const override of [
			{ STATE: 'false' }, { STATE: 'missing' }, { GITHUB_REF: 'refs/heads/v2' }, { GITHUB_REF: 'refs/tags/main' },
			{ POLICY: JSON.stringify({ ...policy, can_admins_bypass: true }) },
			{ POLICY: JSON.stringify({ ...policy, protection_rules: [] }) },
			{ REFS: JSON.stringify({ total_count: 1, branch_policies: [{ ...ref, type: 'tag' }] }) },
			{ REFS: JSON.stringify({ total_count: 2, branch_policies: [ref, { name: 'v2', type: 'branch' }] }) },
		]) assert.notEqual(run(override as Record<string, string>), 0, JSON.stringify(override));
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('production publication rechecks policy before every mutation', () => {
	const yaml = readFileSync(new URL('../../.github/workflows/daemon-promotion.yml', import.meta.url), 'utf8');
	assert.match(yaml, /publish\(\) \{\s+bash scripts\/check-daemon-release-policy\.sh daemon-pilot-production\s+"\$@"/);
	assert.match(yaml, /publish gh api .*git\/refs/);
	for (const op of ['create', 'upload', 'edit']) assert.match(yaml, new RegExp(`publish gh release ${op}`));
	execFileSync('/bin/bash', ['-n', new URL('../check-daemon-release-policy.sh', import.meta.url).pathname]);
});
