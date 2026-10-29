/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { reviewRecordGap } from './record-validation.js';

const record = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

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
	const recordGap=reviewRecordGap(review);if(recordGap)return recordGap;
	if (build === undefined) return undefined;
	const b = record(build), r = record(review);
	const meta = record(b['meta']), body = record(b['body']);
	if (b['meta'] !== meta || b['body'] !== body) return 'the current BUILD structure cannot be verified';
	const reviewBody = record(r['body']);
	const subject = record(reviewBody['subject']);
	if (!['pass', 'warn', 'block'].includes(String(reviewBody['verdict'])) || !Array.isArray(subject['changedFiles'])
		|| !subject['changedFiles'].every(f => typeof f === 'string')) return 'the code review structure cannot be verified';
	const fingerprint = subject['buildFingerprint'];
	if (fingerprint === undefined) return 'the code review has no BUILD binding, so freshness cannot be verified; run a new code review';
	if (fingerprint !== reviewedBuildFingerprint(build)) return 'the BUILD content has changed since this code review';

	const targets = Array.isArray(body['changeLog']) ? body['changeLog'] : [];
	const files = subject['changedFiles'];
	const covered = new Set(Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string').map(f => resolve(repoPath, f)) : []);
	for (const entry of targets) {
		const file = record(record(entry)['target'])['file'];
		if (typeof file === 'string' && !covered.has(resolve(repoPath, file))) return `the code review does not cover BUILD file '${file}'`;
	}
	return undefined;
}
