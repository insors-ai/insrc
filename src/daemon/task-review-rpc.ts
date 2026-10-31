/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpath } from 'node:fs/promises';
import { TaskReviewCoordinator } from '../workflow/code-review/task-review/coordinator.js';
import { RegistryReviewSources } from '../workflow/code-review/task-review/sources.js';
import { parsePacket, requireReview } from '../workflow/code-review/task-review/contracts.js';
import { buildAuthorParty } from '../workflow/code-review/author.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { familyForClient } from './model-registry.js';
import type { LLMProvider } from '../shared/types.js';
import { publishTaskCheckpoint } from '../workflow/code-review/task-review/publication.js';
import { roundWriterFor } from './lifecycle-registry.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';

const coordinators = new Map<string, TaskReviewCoordinator>();
/** Explicit opt-in first-attempt route. Normal entrypoint migration is owned by S3. */
export async function startTaskReview(raw: unknown): Promise<unknown> {
 requireReview(raw && typeof raw === 'object', 'request', 'Expected task review request');
 const p = raw as Record<string, unknown>;
 requireReview(typeof p['repo'] === 'string' && p['repo'].startsWith('/'), 'repo', 'Expected absolute project path');
 const repo = await realpath(p['repo']);
 requireReview(!repoSchemaRefusal(repo), 'repo', 'Repository schema must be current');
 requireReview(typeof p['reviewId'] === 'string' && p['attempt'] === 1, 'request', 'Fresh reviewId and attempt=1 required');
 requireReview(typeof p['epicHash'] === 'string' && /^[0-9a-f]{16}$/.test(p['epicHash']), 'epicHash', 'Expected canonical epic hash');
 const packet = parsePacket(p['packet']);
 const story = /^s\d+$/.test(packet.storyId) ? packet.storyId : /^STORY-[0-9a-f]{16}-(s\d+)$/.exec(packet.storyId)?.[1];
 requireReview(story, 'storyId', 'Expected canonical story identity');
 requireReview(packet.documents.plan.path.endsWith(`PLAN-${p['epicHash']}-${story}.json`) || packet.documents.plan.path.endsWith('/PLAN.md'), 'documents.plan', 'Plan identity must match review subject');
 requireReview(buildAuthorParty(repo, p['epicHash'], story) !== 'daemon', 'reviewer', 'same-party-review: daemon cannot review its own build');
 requireReview(p['client'] === undefined || p['client'] === 'claude' || p['client'] === 'codex', 'client', 'Unsupported client');
 const client = p['client'] as 'claude' | 'codex' | undefined;
 // One coordinator per repository; provider selection remains the established critical-role path.
 let coordinator = coordinators.get(repo);
 if (!coordinator) {
  coordinator = new TaskReviewCoordinator({ sources: new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review', requestId: 0, send: () => {} }), provider: () => { throw new Error('Review provider context missing'); }, publish: (project, id, hash) => publishTaskCheckpoint(project, hash, id, publicationDeps(project)) });
  coordinators.set(repo, coordinator);
 }
 let provider: LLMProvider | undefined;
 return coordinator.start(repo, p['reviewId'], 1, packet, { epicHash: p['epicHash'], provider: () => provider ??= createRoleRouter({ clientDefault: familyForClient(client), cliTimeoutMs: 900000 }).resolveProviderForRole('review', loadAnalyzeConfig(), repo).provider });
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
 requireReview(!coordinators.get(repo)?.isActive(repo, p['reviewId']), 'reviewId', 'already-running');
 return publishTaskCheckpoint(repo, p['epicHash'], p['reviewId'], publicationDeps(repo));
}
