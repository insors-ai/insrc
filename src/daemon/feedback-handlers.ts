/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's feedback and identity methods (s5): `artifact.feedback.add`, `artifact.feedback.list`, `identity.show` and
 * `identity.declare`. Each goes through the repository's registry entry, so it shares the store's write queue, and answers
 * `{ error }` for a bad request rather than throwing.
 */

import { approvalActorOf } from '../workflow/artifact-core/approval-actor.js';
import type { Actor, Feedback } from '../workflow/artifact-core/types.js';
import type { FeedbackThread } from '../workflow/feedback/threads.js';
import type { IdentityFile, IdentityService } from '../workflow/identity/identity-service.js';
import { identityService, lifecycleFor } from './lifecycle-registry.js';
import type { RepoLifecycle } from './lifecycle-registry.js';

export interface FeedbackHandlerDeps {
	/** The repository's registry entry. The daemon's registry by default. */
	readonly lifecycleFor?: ((repoPath: string) => RepoLifecycle) | undefined;
}

const KINDS = new Set<Feedback['kind']>(['comment', 'suggestion', 'revision-request']);

function entryOf(method: string, repoEnv: string | undefined, p: { repo?: unknown }, deps: FeedbackHandlerDeps): { entry: RepoLifecycle; repo: string } | { error: string } {
	const repo = (typeof p.repo === 'string' && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	if (repo.length === 0) return { error: `${method}: \`repo\` is required` };
	try { return { entry: (deps.lifecycleFor ?? lifecycleFor)(repo), repo }; }
	catch (err) { return { error: `${method}: ${(err as Error).message}` }; }
}

const optionalText = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;

/** Add an entry or reply. The author is the request's `actor` (a namespaced lower-case id), else the current actor. */
export async function handleFeedbackAdd(params: unknown, repoEnv: string | undefined, deps: FeedbackHandlerDeps = {}): Promise<Feedback | { error: string }> {
	const method = 'artifact.feedback.add';
	const p = (params ?? {}) as Record<string, unknown>;
	const found = entryOf(method, repoEnv, p, deps);
	if ('error' in found) return found;
	const { entry, repo } = found;
	if (typeof p['artifactId'] !== 'string' || p['artifactId'].length === 0) return { error: `${method}: \`artifactId\` (non-empty string) required` };
	if (typeof p['text'] !== 'string') return { error: `${method}: \`text\` (string) required` };
	const kind = p['kind'];
	if (kind !== undefined && !KINDS.has(kind as Feedback['kind'])) return { error: `${method}: \`kind\` has to be comment, suggestion or revision-request` };
	try {
		let actor: Actor;
		if (p['actor'] !== undefined && p['actor'] !== null) actor = approvalActorOf(p['actor']);
		else actor = await entry.identity.currentActor(repo);
		return await entry.feedback.add(p['artifactId'], {
			text: p['text'],
			kind: kind as Feedback['kind'] | undefined,
			anchor: p['anchor'] as Feedback['anchor'] | undefined,
			inReplyTo: optionalText(p['inReplyTo']),
			batchId: optionalText(p['batchId']),
			id: optionalText(p['id']),
		}, actor);
	} catch (err) { return { error: `${method}: ${(err as Error).message}` }; }
}

/** The threads of an artifact; with `open: true`, only those whose root no later update addressed. */
export async function handleFeedbackList(params: unknown, repoEnv: string | undefined, deps: FeedbackHandlerDeps = {}): Promise<{ threads: FeedbackThread[] } | { error: string }> {
	const method = 'artifact.feedback.list';
	const p = (params ?? {}) as Record<string, unknown>;
	const found = entryOf(method, repoEnv, p, deps);
	if ('error' in found) return found;
	if (typeof p['artifactId'] !== 'string' || p['artifactId'].length === 0) return { error: `${method}: \`artifactId\` (non-empty string) required` };
	try { return { threads: await found.entry.feedback.threads(p['artifactId'], { open: p['open'] === true }) }; }
	catch (err) { return { error: `${method}: ${(err as Error).message}` }; }
}

/** The declared identity (or none); the file is per user, so no repository is named. */
export async function handleIdentityShow(deps: { identity?: Pick<IdentityService, 'show'> | undefined } = {}): Promise<{ identity: IdentityFile | null } | { error: string }> {
	try { return { identity: (await (deps.identity ?? identityService).show()) ?? null }; }
	catch (err) { return { error: `identity.show: ${(err as Error).message}` }; }
}

/** Replace the declared identity. */
export async function handleIdentityDeclare(params: unknown, deps: { identity?: Pick<IdentityService, 'declare'> | undefined } = {}): Promise<{ identity: IdentityFile } | { error: string }> {
	const p = (params ?? {}) as { primary?: unknown; aliases?: unknown };
	try { return { identity: await (deps.identity ?? identityService).declare({ primary: p.primary as string, aliases: (p.aliases ?? []) as string[] }) }; }
	catch (err) { return { error: `identity.declare: ${(err as Error).message}` }; }
}
