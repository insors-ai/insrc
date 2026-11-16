/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireLinuxBranchRef, readLinuxReleaseJson, requireLinuxFields } from './linux-daemon-metadata.mjs';

const digest = /^[a-f0-9]{64}$/;
const channelPattern = /^linux-x64-(?:development|production)-[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const maxLedgerRecord = 1024;

function checkedBinding(value) {
	requireLinuxFields(value, ['sequence', 'manifestSha256'], 'signing sequence binding');
	if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || typeof value.manifestSha256 !== 'string' ||
		!digest.test(value.manifestSha256)) throw new Error('invalid Linux signing sequence binding');
	return value;
}

function ledgerCommand(cwd, args, input) {
	return execFileSync('git', ['-C', cwd, ...args], {
		input, timeout: 45_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
	});
}

function readBinding(git, head, path) {
	const result = git(['ls-tree', head, '--', path]).toString();
	if (!result) return undefined;
	if (!/^100644 blob [a-f0-9]{40}\t[^\n]+\n$/.test(result)) throw new Error('invalid Linux signing ledger entry');
	const bytes = git(['show', `${head}:${path}`]);
	return checkedBinding(readLinuxReleaseJson(bytes, maxLedgerRecord));
}

export async function reserveLinuxSigningSequence({ remote, ref, channel, sequence, manifestSha256 }) {
	requireLinuxBranchRef(ref);
	if (typeof remote !== 'string' || !remote || remote.startsWith('-') || /[\x00-\x1f]/.test(remote) ||
		typeof channel !== 'string' || !channelPattern.test(channel)) throw new Error('invalid Linux signing ledger coordinates');
	const requested = checkedBinding({ sequence, manifestSha256 });
	const directory = await mkdtemp(join(tmpdir(), 'insrc-linux-sequence-'));
	const git = (args, input) => ledgerCommand(directory, args, input);
	const folder = `linux-signing/${channel}`;
	const headPath = `${folder}/head.json`;
	const entryPath = `${folder}/sequence-${sequence}.json`;
	try {
		git(['init', '--bare', '--object-format=sha1', '--quiet']);
		for (let retry = 0; retry < 5; retry++) {
			// A provisioned, protected append-only ref is mandatory. A missing
			// remote ledger is never silently recreated on a signing retry.
			git(['fetch', '--no-tags', '--no-recurse-submodules', '--quiet', '--', remote, ref]);
			const head = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).toString().trim();
			if (!commit.test(head)) throw new Error('invalid Linux signing ledger head');
			const current = readBinding(git, head, headPath);
			if (current) {
				const retained = readBinding(git, head, `${folder}/sequence-${current.sequence}.json`);
				if (retained?.sequence !== current.sequence || retained?.manifestSha256 !== current.manifestSha256) {
					throw new Error('corrupt Linux signing ledger head binding');
				}
				if (sequence < current.sequence) throw new Error('stale Linux signing sequence');
				if (sequence === current.sequence) {
					if (manifestSha256 !== current.manifestSha256) throw new Error('Linux signing sequence already bound to different bytes');
					return current;
				}
			} else if (git(['log', '-1', '--format=%H', head, '--', folder]).length > 0) {
				throw new Error('corrupt Linux signing ledger is missing its initialized channel head');
			}
			if (readBinding(git, head, entryPath)) throw new Error('corrupt Linux signing ledger has a future sequence binding');
			const payload = Buffer.from(JSON.stringify(requested));
			const blob = git(['hash-object', '-w', '--stdin'], payload).toString().trim();
			git(['read-tree', head]);
			for (const path of [headPath, entryPath]) {
				git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
			}
			const tree = git(['write-tree']).toString().trim();
			const next = git(['-c', 'user.name=Insrc Linux Release Signer', '-c', 'user.email=release-signing@insrc.invalid',
				'commit-tree', tree, '-p', head], `Reserve Linux release sequence ${sequence}\n`).toString().trim();
			try {
				// Both writers append to the same parent. The protected ref
				// admits only a fast-forward update, so one proposal can win.
				git(['push', '--porcelain', '--', remote, `${next}:${ref}`]);
				return requested;
			} catch (error) {
				if (retry === 4) throw error;
				// Fetch the winner (or our own committed update after a
				// transport interruption) and perform the same checks again.
			}
		}
		throw new Error('Linux signing ledger update did not settle');
	} finally { await rm(directory, { recursive: true, force: true }); }
}
