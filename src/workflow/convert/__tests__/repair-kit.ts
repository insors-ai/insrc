/** A repository already on the common model, written as raw heads, for the repair tests. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { reviewedBuildFingerprint } from '../../code-review/build-freshness.js';
import { History } from '../../artifact-core/history.js';
import { writeRepoSchema } from '../../artifact-core/repo-schema.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { artifactJsonPath } from '../../storage.js';
import { citations } from '../../tasks/__tests__/task-kit.js';
import { threeRows } from '../../tasks/__tests__/task-set-kit.js';
import { taskPayloadFromRow } from '../../tasks/pure.js';
import type { RepairReport, RepairResult } from '../types.js';

export const H = '0123456789abcdef';
export const K = 'fedcba9876543210';
export const AT = '2026-10-10T00:00:00.000Z';
export const BY = { id: 'insrc:system', kind: 'system', properties: {} };
export const ACTOR = { id: 'insrc:build', kind: 'system', properties: {} };
type Obj = Record<string, unknown>;

export function lifecycle(status: string, number = 1, approvedAt = AT, override?: string): Obj {
	return { status, revision: { number, contentHash: '', at: AT, by: BY }, signoffs: [], ...(status !== 'draft' ? { approval: { revision: number, by: BY, at: approvedAt, ...(override !== undefined ? { override: { reason: override } } : {}) } } : {}) };
}
export function repository(): { repo: string; put(id: string, meta: Obj, body: Obj, cites?: unknown[]): void; done(): void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-repair-tasks-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	writeRepoSchema(repo, { version: 2, convertedAt: AT });
	return {
		repo,
		put: (id, meta, body, cites = []) => {
			const path = artifactJsonPath(repo, id);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify({ meta: { repoPath: repo, createdAt: AT, epicCreatedAt: AT, revision: 1, ...meta }, body, citations: cites }, null, 2) + '\n');
		},
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}
export type Repo = ReturnType<typeof repository>;
export const head = (repo: string, id: string): { meta: Record<string, any>; body: Record<string, any> } => JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8'));
export const has = (repo: string, id: string): boolean => existsSync(artifactJsonPath(repo, id));
export const result = (r: RepairReport): RepairResult => { assert.ok(r.result !== undefined, JSON.stringify(r)); return r.result; };
export const rows = (n = 3): PlanTask[] => threeRows().slice(0, n).map(r => ({ ...r, dependsOn: [] }));
export const plan = (r: Repo, hash: string, story: string, status: string, n = 3, number = 1): void => r.put(`PLAN-${hash}-${story}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle(status, number), revision: number }, { tasks: rows(n) }, citations);
/** A Task head made from plan row `row`, under the Story's head. */
export function task(r: Repo, hash: string, story: string, number: string, row: PlanTask, status = 'approved'): void {
	r.put(`TASK-${hash}-${story}-${number}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle(status), envelope: { description: row.title, parent: { entityId: `STORY-${hash}-${story}`, type: 'STORY', relation: 'derived-from' }, references: [], attachments: [] } }, taskPayloadFromRow(row) as unknown as Obj);
}
export const tasksHead = (r: Repo, hash: string, story: string, planRevision: number, taskIds: string[]): void => r.put(`TASKS-${hash}-${story}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle('draft') }, { planRevision, taskIds, nextNumber: taskIds.length + 1 });
export const storyHead = (r: Repo, hash: string, story: string): void => r.put(`STORY-${hash}-${story}`, { workflow: 'define', epicHash: hash, storyId: story, lifecycle: lifecycle('draft'), envelope: { description: '', parent: { entityId: `EPIC-${hash}`, type: 'EPIC', relation: 'derived-from' }, references: [], attachments: [] } }, {});
export const epicHead = (r: Repo, hash: string): void => { r.put(`DEF-${hash}`, { workflow: 'define', epicHash: hash, lifecycle: lifecycle('approved') }, { stories: [] }); r.put(`EPIC-${hash}`, { workflow: 'define', epicHash: hash, lifecycle: lifecycle('draft'), envelope: { description: '', references: [], attachments: [] } }, {}); };
/** An approved BUILD with these task results and a passing code review bound to it. */
export function buildAndReview(r: Repo, hash: string, story: string, results: { id: string; passed: boolean }[], approvedAt = AT, override?: string): void {
	r.put(`BUILD-${hash}-${story}`, { workflow: 'build', epicHash: hash, storyId: story, authoredBy: 'controller', lifecycle: lifecycle('approved', 1, approvedAt, override) }, { commit: 'abc1234', focus: 'Change it', summary: 'Changed', tasks: results, changeLog: [{ target: { file: 'src/a.ts' } }] });
	const commit = 'a'.repeat(40);
	const scope = { storyId: story, documents: {}, reviewSet: [{ commit, parent: 'b'.repeat(40), files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }] };
	const review = (taskId: string) => ({ taskId, status: 'passed', summary: 'Correct', findings: [], testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] }, limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [] });
	const summary = { reviewId: 'review-1', attempt: 1, storyId: story, reviewer: 'daemon', status: 'passed', scope, tasks: results.map(t => review(t.id)), summary: 'Reviewed', completedAt: '2026-11-03T01:00:00.000Z', buildFingerprint: reviewedBuildFingerprint(head(r.repo, `BUILD-${hash}-${story}`)) };
	r.put(`CR-${hash}-${story}`, { workflow: 'code-review', schemaVersion: 2, epicHash: hash, storyId: story, reviewedBy: 'daemon', lifecycle: lifecycle('draft') }, { kind: 'code-review', format: 'task-based', storyId: story, status: 'passed', reviews: [summary] });
}
export const rounds = async (repo: string, id: string) => (await new History(createFileSidecarStore(repo)).log(id)).filter(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === 'build-round');
export const appendRound = (repo: string, id: string, res: 'pass' | 'fail'): Promise<void> => new History(createFileSidecarStore(repo)).appendLog(id, { id: `own-${id}`, actor: ACTOR, timestamp: AT, operation: 'update', outcome: { result: res, summary: 'own round', data: { kind: 'build-round' } } });

