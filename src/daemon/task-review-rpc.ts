import { isMainThread } from 'node:worker_threads';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpath } from 'node:fs/promises';
import { TaskReviewCoordinator } from '../workflow/code-review/task-review/coordinator.js';
import { RegistryReviewSources } from '../workflow/code-review/task-review/sources.js';
import { parsePacket, requireReview } from '../workflow/code-review/task-review/contracts.js';
import { checkpointPath, loadCheckpoint } from '../workflow/code-review/task-review/checkpoint.js';
import { buildAuthorParty } from '../workflow/code-review/author.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { familyForClient } from './model-registry.js';
import type { TrustedRpcContext } from './request-context.js';
import type { ControllerReviewOwner } from '../workflow/code-review/task-review/controller.js';
import type { LLMProvider } from '../shared/types.js';
import { publishTaskCheckpoint } from '../workflow/code-review/task-review/publication.js';
import { roundWriterFor } from './lifecycle-registry.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';

const coordinators = new Map<string, TaskReviewCoordinator>();
/** Explicit task-review start/resume route. Normal entrypoint migration is owned by S3. */
export interface TaskReviewRpcDeps { readonly provider?: ((repo: string, client: 'claude' | 'codex' | undefined) => LLMProvider) | undefined; }
export async function startTaskReview(raw: unknown, trusted?: TrustedRpcContext, deps: TaskReviewRpcDeps = {}): Promise<unknown> {
 requireReview(raw && typeof raw === 'object', 'request', 'Expected task review request');
 const p = raw as Record<string, unknown>;
 requireReview(typeof p['repo'] === 'string' && p['repo'].startsWith('/'), 'repo', 'Expected absolute project path');
 const repo = await realpath(p['repo']);
 requireReview(!repoSchemaRefusal(repo), 'repo', 'Repository schema must be current');
 requireReview(typeof p['reviewId'] === 'string' && Number.isSafeInteger(p['attempt']) && Number(p['attempt']) > 0, 'request', 'Expected reviewId and positive safe attempt');
 requireReview(p['operation'] === undefined || p['operation'] === 'start' || p['operation'] === 'resume', 'operation', 'Expected start or resume');
 const operation = p['operation'] === 'resume' ? 'resume' : 'start', attempt = Number(p['attempt']);
 requireReview(typeof p['epicHash'] === 'string' && /^[0-9a-f]{16}$/.test(p['epicHash']), 'epicHash', 'Expected canonical epic hash');
 const epicHash = p['epicHash'];
 const stored = operation === 'resume' ? await loadCheckpoint(checkpointPath(repo, p['reviewId'])) : undefined;
 if (operation === 'resume') requireReview(stored, 'checkpoint', 'missing-checkpoint');
 const packet = parsePacket(operation === 'resume' ? stored!.attempts.at(-1)!.submitted : p['packet'], operation === 'resume');
 const input = operation === 'resume' ? p['packet'] : packet;
 const story = /^s\d+$/.test(packet.storyId) ? packet.storyId : /^STORY-[0-9a-f]{16}-(s\d+)$/.exec(packet.storyId)?.[1];
 requireReview(story, 'storyId', 'Expected canonical story identity');
 requireReview(packet.documents.plan.path.endsWith(`PLAN-${epicHash}-${story}.json`) || packet.documents.plan.path.endsWith('/PLAN.md'), 'documents.plan', 'Plan identity must match review subject');
 requireReview(p['client'] === undefined || p['client'] === 'claude' || p['client'] === 'codex', 'client', 'Unsupported client');
 const client = p['client'] as 'claude' | 'codex' | undefined;
 const coordinator = coordinatorFor(repo);
 if (buildAuthorParty(repo, epicHash, story) === 'daemon') {
  const owner=controllerOwner(trusted, () => requireReview(buildAuthorParty(repo, epicHash, story) === 'daemon', 'reviewer', 'wrong-reviewer: current build is not daemon-authored'));
  requireReview(p['timingProtocol']==='activity-v1','timingProtocol','Controller must support activity-v1 timing protocol');
  return coordinator.startController(repo, p['reviewId'], attempt, input, owner, epicHash, operation);
 }
 let provider: LLMProvider | undefined;
 return coordinator.start(repo, p['reviewId'], attempt, input, { epicHash, operation, provider: () => provider ??= deps.provider?.(repo, client) ?? createRoleRouter({ clientDefault: familyForClient(client), cliTimeoutMs: 900000 }).resolveProviderForRole('review', loadAnalyzeConfig(), repo).provider });
}

export function coordinatorFor(repo: string): TaskReviewCoordinator {
 requireReview(isMainThread, 'reviewer', 'Task review ownership belongs to the main daemon; route through the existing request router');
 let coordinator = coordinators.get(repo);
 if (!coordinator) {
  coordinator = new TaskReviewCoordinator({ sources: new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review', requestId: 0, send: () => {} }), provider: () => { throw new Error('Review provider context missing'); }, publish: (project, id, hash) => publishTaskCheckpoint(project, hash, id, publicationDeps(project)) });
  coordinators.set(repo, coordinator);
 }
 return coordinator;
}
/** S1's explicit controller exchange uses an existing persistent connection. Full MCP/session-thread integration remains S3. */
function controllerOwner(trusted: TrustedRpcContext | undefined, assertReviewer?: () => void): ControllerReviewOwner {
 requireReview(trusted?.connectionIdentity && trusted.connectionSignal instanceof AbortSignal, 'reviewer', 'Trusted controller connection lifetime is required');
 return { id: trusted.connectionIdentity, signal: trusted.connectionSignal, ...(trusted.signal ? { requestSignal: trusted.signal } : {}), ...(assertReviewer ? { assertReviewer } : {}) };
}
export async function exchangeControllerTaskReview(raw: unknown, trusted: TrustedRpcContext | undefined, phase: 'assignment' | 'scope' | 'result' | 'activity'): Promise<unknown> {
 requireReview(raw && typeof raw === 'object', 'request', 'Expected controller review exchange');
 const p = raw as Record<string, unknown>;
 requireReview(typeof p['repo'] === 'string' && p['repo'].startsWith('/'), 'repo', 'Expected absolute project');
 const repo = await realpath(p['repo']);
 requireReview(typeof p['reviewId'] === 'string' && Number.isSafeInteger(p['attempt']) && Number(p['attempt']) > 0, 'request', 'Expected reviewId and attempt');
 const coordinator = coordinatorFor(repo), owner = controllerOwner(trusted), attempt = Number(p['attempt']);
 const envelope={taskId:p['taskId'],executionId:p['executionId'],sequence:p['sequence']};
 if (phase === 'activity') return coordinator.controllerActivity(repo,p['reviewId'],attempt,p['event'],owner,envelope);
 if (phase === 'scope') return coordinator.controllerScope(repo, p['reviewId'], attempt, p['scope'], owner,envelope);
 if (phase === 'result') return coordinator.controllerResult(repo, p['reviewId'], attempt, p['result'], owner,envelope);
 return coordinator.controllerAssignment(repo, p['reviewId'], attempt, owner);
}


function publicationDeps(repo: string) {
 return { sources: new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-publication', requestId: 0, send: () => {} }), through: roundWriterFor(repo, { id: 'insrc:code-review', kind: 'system', properties: {} }) };
}
/** Explicit publication retry consumes only saved feedback, never a provider. */
export async function publishStoredTaskReview(raw: unknown): Promise<unknown> {
 requireReview(raw && typeof raw === 'object', 'request', 'Expected publication request');
 const p = raw as Record<string, unknown>;
 requireReview(typeof p['repo'] === 'string' && p['repo'].startsWith('/'), 'repo', 'Expected absolute project');
 const repo = await realpath(p['repo']);
 requireReview(!repoSchemaRefusal(repo), 'repo', 'Repository schema must be current');
 requireReview(typeof p['reviewId'] === 'string' && typeof p['epicHash'] === 'string' && /^[a-f0-9]{16}$/.test(p['epicHash']), 'request', 'Expected reviewId and canonical epicHash');
 return coordinatorFor(repo).publishStored(repo, p['reviewId'], p['epicHash'], () => publishTaskCheckpoint(repo, p['epicHash'] as string, p['reviewId'] as string, publicationDeps(repo)));
}

/** Read-only observation. Never starts/resumes a review or resolves an LLM provider. */
export async function readTaskReviewProgress(raw:unknown):Promise<unknown>{
 requireReview(raw&&typeof raw==='object','request','Expected progress request');
 const p=raw as Record<string,unknown>;
 requireReview(typeof p['repo']==='string'&&p['repo'].startsWith('/'),'repo','Expected absolute project');
 requireReview(typeof p['reviewId']==='string'&&Number.isSafeInteger(p['attempt'])&&Number(p['attempt'])>0,'request','Expected reviewId and positive safe attempt');
 const repo=await realpath(p['repo']);
 return coordinatorFor(repo).progress(repo,p['reviewId'],Number(p['attempt']));
}
