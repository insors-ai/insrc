/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const record = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

/** Bind a review to build content, excluding lifecycle and regenerated change-log timestamps. */
export function reviewedBuildFingerprint(build: unknown): string {
	const head = record(build), meta = record(head['meta']), body = record(head['body']);
	const tasks = Array.isArray(body['tasks']) ? body['tasks'].map(t => {
		const task = record(t);
		return { id: task['id'], passed: task['passed'] };
	}).sort((a, b) => String(a.id).localeCompare(String(b.id))) : [];
	const targets = Array.isArray(body['changeLog'])
		? body['changeLog'].map(e => JSON.stringify(record(e)['target'])).sort() : [];
	return createHash('sha256').update(JSON.stringify({ builtAt: meta['updatedAt'] ?? meta['createdAt'], commit: body['commit'], tasks, targets, summary: body['summary'], focus: body['focus'] })).digest('hex');
}

/** A stale or incomplete review cannot satisfy completion, even with verdict enforcement off. */
export function reviewBuildGap(build: unknown, review: unknown, repoPath: string): string | undefined {
	if (build === undefined || build === null) return undefined;
	const b = record(build), r = record(review);
	const meta = record(b['meta']), body = record(b['body']);
	const subject = record(record(r['body'])['subject']);
	const fingerprint = subject['buildFingerprint'];
	if (fingerprint !== undefined) {
		if (fingerprint !== reviewedBuildFingerprint(build)) return 'the BUILD content has changed since this code review';
	} else {
		// Older records lack a binding. Their review must at least postdate the build.
		const times = [meta['createdAt'], meta['updatedAt']].filter(t => t !== undefined);
		if (times.length > 0) {
			const stamps = times.map(t => typeof t === 'string' ? Date.parse(t) : Number.NaN);
			const at = record(r['meta'])['createdAt'];
			const reviewedAt = typeof at === 'string' ? Date.parse(at) : Number.NaN;
			if (stamps.some(t => !Number.isFinite(t)) || !Number.isFinite(reviewedAt) || reviewedAt < Math.max(...stamps)) {
				return 'the code review predates the latest BUILD, or its freshness cannot be verified';
			}
		}
	}
	const targets = Array.isArray(body['changeLog']) ? body['changeLog'] : [];
	const files = subject['changedFiles'];
	const covered = new Set(Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string').map(f => resolve(repoPath, f)) : []);
	for (const entry of targets) {
		const file = record(record(entry)['target'])['file'];
		if (typeof file === 'string' && !covered.has(resolve(repoPath, file))) return `the code review does not cover BUILD file '${file}'`;
	}
	return undefined;
}
