/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [evidenceFile, repoUrl, branch, sequenceText, signingKey, publicKey, output] = process.argv.slice(2);
if ([evidenceFile, repoUrl, branch, sequenceText, signingKey, publicKey, output].some(value => !value)) {
	throw new Error('usage: node scripts/prepare-source-release.mjs EVIDENCE REPO_URL BRANCH SEQUENCE SIGNING_KEY PUBLIC_KEY OUTPUT_INSTALLER');
}
if (!/^(https:\/\/[^\s]+|ssh:\/\/[^\s]+|[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[^\s]+|\/[^\s]+)$/.test(repoUrl)
	|| !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(branch) || !/^[1-9]\d*$/.test(sequenceText)
	|| !Number.isSafeInteger(Number(sequenceText))) throw new Error('invalid source release channel or sequence');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 }).trim();
const tag = 'insrc-release/' + branch;
git('check-ref-format', 'refs/tags/' + tag);
const commit = git('rev-parse', '--verify', 'refs/heads/' + branch + '^{commit}');
const tree = git('rev-parse', '--verify', commit + '^{tree}');
const remoteHead = git('ls-remote', '--exit-code', '--refs', '--', repoUrl, 'refs/heads/' + branch);
if (remoteHead !== commit + '\trefs/heads/' + branch) throw new Error('configured source branch does not match the proposed head');
const catalog = git('rev-parse', '--verify', commit + ':release/macos-compatibility.json');
const catalogSize = Number(git('cat-file', '-s', catalog));
if (git('cat-file', '-t', catalog) !== 'blob' || !Number.isSafeInteger(catalogSize)
	|| catalogSize < 1 || catalogSize > 64 * 1024) throw new Error('missing or invalid source release compatibility catalog');
const required = ['fresh-start', 'fresh-idle', 'legacy-broker-denied', 'managed-running', 'managed-stopped',
	'guarded-rollback', 'restored-retry', 'linux-regression', 'full-regression'];
const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
if (evidence.version !== 1 || evidence.commit !== commit || evidence.tree !== tree || !Array.isArray(evidence.checks)) {
	throw new Error('qualification evidence does not match the proposed source head');
}
for (const name of required) {
	const entries = evidence.checks.filter(check => check?.name === name);
	if (entries.length !== 1 || entries[0].result !== 'pass'
		|| !/^[a-zA-Z0-9._-]+$/.test(entries[0].file ?? '') || !/^[a-f0-9]{64}$/.test(entries[0].sha256 ?? '')) {
		throw new Error('missing passing qualification evidence for ' + name);
	}
	const file = resolve(evidenceFile, '..', entries[0].file);
	const info = lstatSync(file);
	if (!info.isFile() || info.size === 0 || info.size > 16 * 1024 * 1024
		|| createHash('sha256').update(readFileSync(file)).digest('hex') !== entries[0].sha256) {
		throw new Error('qualification receipt differs for ' + name);
	}
	const report = JSON.parse(readFileSync(file, 'utf8'));
	if (report.version !== 1 || report.name !== name || report.commit !== commit || report.tree !== tree
		|| report.execution !== 'source-build' || report.exitCode !== 0 || !Number.isSafeInteger(report.passed)
		|| report.passed < 1 || report.failed !== 0 || report.skipped !== 0) {
		throw new Error('qualification receipt did not record a passing source build for ' + name);
	}
}
const script = fileURLToPath(new URL('./bundle-release-bootstrap.mjs', import.meta.url));
execFileSync(process.execPath, [script, publicKey, output], { stdio: 'inherit', timeout: 120_000 });
const key = readFileSync(publicKey, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
const temporary = mkdtempSync(join(tmpdir(), 'insrc-release-promotion-'));
const allowedSigners = join(temporary, 'allowed-signers');
const bare = join(temporary, 'source.git');
try {
	writeFileSync(allowedSigners, 'insrc-release ' + key + '\n', { flag: 'wx', mode: 0o600 });
	git('init', '--quiet', '--bare', '--template=', bare);
	git('-C', bare, 'fetch', '--quiet', '--no-tags', process.cwd(), commit);
	const name = git('var', 'GIT_COMMITTER_IDENT').match(/^(.*?) <([^<>]+)> /);
	if (!name) throw new Error('configure the release tagger identity');
	const signing = ['-C', bare, '-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=/usr/bin/ssh-keygen',
		'-c', 'user.name=' + name[1], '-c', 'user.email=' + name[2]];
	git(...signing, '-c', 'user.signingkey=' + resolve(signingKey), 'tag', '-s',
		tag, commit, '-m', JSON.stringify({ version: 1, repoUrl, branch, sequence: Number(sequenceText) }));
	git(...signing, '-c', 'gpg.ssh.allowedSignersFile=' + allowedSigners, 'verify-tag', tag);
	const ref = 'refs/tags/' + tag;
	const tagObject = git('-C', bare, 'rev-parse', ref);
	git('fetch', '--quiet', '--no-tags', bare, tagObject);
	const staged = 'refs/insrc/promote/' + branch + '/' + sequenceText;
	git('update-ref', staged, tagObject, '0'.repeat(tagObject.length));
	process.stdout.write(JSON.stringify({ tag, tagObject, staged, commit, tree, installer: resolve(output) }) + '\n');
} finally { rmSync(temporary, { recursive: true, force: true }); }
