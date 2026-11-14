import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

test('live readiness and main-only signing policy fail closed after approval', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-release-policy-'));
	try {
		writeFileSync(join(root, 'gh'), `#!/bin/bash
case "$2" in
 */actions/variables/*) [[ "$STATE" != missing ]] || exit 1; printf '{"value":"%s"}\\n' "$STATE";;
 */branches/main) echo '{"name":"main","protected":true}';;
 */deployment-branch-policies*) printf '%s\\n' "$REFS";;
 */environments/*) [[ "$POLICY" != unavailable ]] || exit 1; printf '%s\\n' "$POLICY";;
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
		const run = (override: Record<string, string> = {}, target = 'daemon-pilot-production') => spawnSync('/bin/bash',
			[new URL('../check-daemon-release-policy.sh', import.meta.url).pathname, target],
			{ env: { ...env, ...override }, encoding: 'utf8' }).status;
		assert.equal(run(), 0);
		for (const target of ['daemon-pilot-qualification', 'daemon-pilot-production']) {
			const current = { ...policy, name: target };
			const base = { POLICY: JSON.stringify(current) };
			assert.equal(run(base, target), 0);
			for (const override of [
				{ STATE: 'false' }, { STATE: 'missing' }, { GITHUB_REF: 'refs/heads/v2' }, { GITHUB_REF: 'refs/tags/main' },
				{ POLICY: JSON.stringify({ ...current, can_admins_bypass: true }) },
				{ POLICY: JSON.stringify({ ...current, protection_rules: [] }) },
				{ POLICY: JSON.stringify({ ...current, protection_rules: [{ ...current.protection_rules[0], prevent_self_review: false }] }) },
				{ POLICY: 'unavailable' }, { POLICY: 'not json' }, { REFS: '{}' },
				{ REFS: JSON.stringify({ total_count: 1, branch_policies: [{ ...ref, type: 'tag' }] }) },
				{ REFS: JSON.stringify({ total_count: 2, branch_policies: [ref, { name: 'v2', type: 'branch' }] }) },
			]) assert.notEqual(run({ ...base, ...override } as Record<string, string>, target), 0, `${target}: ${JSON.stringify(override)}`);
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('production publication rechecks policy before every mutation', () => {
	const yaml = readFileSync(new URL('../../.github/workflows/daemon-promotion.yml', import.meta.url), 'utf8');
	assert.match(yaml, /publish\(\) \{\s+bash scripts\/check-daemon-release-policy\.sh daemon-pilot-production\s+"\$@"/);
	assert.match(yaml, /publish gh api .*git\/refs/);
	for (const op of ['create', 'upload', 'edit']) assert.match(yaml, new RegExp(`publish gh release ${op}`));
	execFileSync('/bin/bash', ['-n', new URL('../check-daemon-release-policy.sh', import.meta.url).pathname]);
});

test('disabling readiness after signing aborts the next publication mutation', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-disable-publish-'));
	try {
		const yaml = load(readFileSync(new URL('../../.github/workflows/daemon-promotion.yml', import.meta.url), 'utf8')) as {
			jobs: { publish: { steps: { name?: string; run?: string }[] } };
		};
		const body = yaml.jobs.publish.steps.find(step => step.name === 'Publish the same archive as a prerelease')?.run;
		assert.ok(body);
		execFileSync('mkdir', ['-p', join(root, 'candidate')]);
		writeFileSync(join(root, 'candidate/manifest.production.sig'), 'signed fixture');
		writeFileSync(join(root, 'promotion.json'), '{"tag":"example","commit":"example","archive":"example"}');
		writeFileSync(join(root, 'readiness'), 'true');
		writeFileSync(join(root, 'gh'), `#!/bin/bash
case "$*" in
 *actions/variables*) printf '{"value":"%s"}\\n' "$(cat "$RUNNER_TEMP/readiness")";;
 *branches/main*) echo '{"name":"main","protected":true}';;
 *deployment-branch-policies*) echo '{"total_count":1,"branch_policies":[{"name":"main","type":"branch"}]}';;
 *environments/*) echo '{"name":"daemon-pilot-production","can_admins_bypass":false,"deployment_branch_policy":{"custom_branch_policies":true,"protected_branches":false},"protection_rules":[{"type":"required_reviewers","prevent_self_review":true,"reviewers":[1]}]}';;
 *git/refs*) printf 'tag\\n' >> "$RUNNER_TEMP/writes"; printf 'false' > "$RUNNER_TEMP/readiness";;
 *) printf 'unexpected write\\n' >> "$RUNNER_TEMP/writes";;
esac
`, { mode: 0o700 });
		const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', body], {
			cwd: new URL('../../', import.meta.url), env: { ...process.env, GH_REPO: 'owner/repo', GITHUB_REF: 'refs/heads/main',
				RUNNER_TEMP: root, INSRC_RELEASE_POLICY_READ_TOKEN: 'fixture', PATH: `${root}:${process.env.PATH}` },
		});
		assert.equal(result.status, 1);
		assert.equal(readFileSync(join(root, 'writes'), 'utf8'), 'tag\n');
		assert.throws(() => readFileSync(join(root, 'candidate/manifest.production.sig')), { code: 'ENOENT' });
	} finally { rmSync(root, { recursive: true, force: true }); }
});
