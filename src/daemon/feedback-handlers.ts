/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's feedback and identity methods (s5): `artifact.feedback.add`, `artifact.feedback.list`, `identity.show` and
 * `identity.declare`. Each goes through the repository's registry entry, so it shares the store's write queue, and answers
 * `{ error }` for a bad request rather than throwing.
 */

import { basename, resolve } from 'node:path';

import { ArtifactIds } from '../workflow/artifact-ids.js';
import { ArtifactFeedbackError } from '../workflow/artifacts/provenance/writer.js';
import { coerceRequest } from '../workflow/artifacts/provenance/tool.js';
import type { AppendFeedbackRequest, AppendFeedbackResult } from '../workflow/artifacts/provenance/writer.js';
import { feedbackAnchorOf } from '../workflow/feedback/legacy-anchor.js';
import { approvalActorOf } from '../workflow/artifact-core/approval-actor.js';
import type { Actor, Feedback } from '../workflow/artifact-core/types.js';
import type { FeedbackThread } from '../workflow/feedback/threads.js';
import type { IdentityFile, IdentityService } from '../workflow/identity/identity-service.js';
import { identityService, lifecycleFor, repoOfArtifactPath } from './lifecycle-registry.js';
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

/** Whether `file` is the artifact's own document (its JSON, its id or its kind's markdown mirror) and not a companion file. */
function isOwnDocument(file: string, artifactId: string, artifactPath: string): boolean {
	const name = basename(file).replace(/\.(json|md)$/, '');
	return resolve(file) === artifactPath || name === artifactId || name === ArtifactIds.parse(artifactId)?.kind;
}

/** The legacy kind, or failing that the decision it came with, as a Feedback kind. */
function kindOf(entry: AppendFeedbackRequest['entry']): Feedback['kind'] {
	const legacy = entry.kind ?? (entry.decision === 'feedback' ? 'feedback' : undefined);
	return legacy === 'feedback' ? 'revision-request' : legacy ?? 'comment';
}

/**
 * `artifact.feedback.append`, the legacy request, stored as a Feedback line through the repository's FeedbackService. The
 * request and the result keep their shapes ({ artifactPath, entryId, total }; { error } for a bad request). The author text
 * becomes the actor's name unless the request names an actor id; a companion file's path rides in anchor.section; the
 * request's timestamp is not used (the service stamps the time the line is stored).
 */
export async function handleFeedbackAppend(params: unknown, deps: FeedbackHandlerDeps = {}): Promise<AppendFeedbackResult | { error: string }> {
	const method = 'artifact.feedback.append';
	try {
		const { artifactPath, entry } = coerceRequest((params ?? {}) as Record<string, unknown>);
		const abs = resolve(artifactPath);
		const repo = repoOfArtifactPath(abs);
		const artifactId = basename(abs).replace(/\.json$/, '');
		if (repo === undefined || ArtifactIds.parse(artifactId) === undefined) {
			throw new ArtifactFeedbackError(`'${abs}' is not an artifact under a repo artifact root (.insrc/artifacts)`);
		}
		const author = entry.author.trim();
		if (author.length === 0) throw new ArtifactFeedbackError('feedback entry requires a non-empty author');
		const found = (deps.lifecycleFor ?? lifecycleFor)(repo);

		const raw = (params ?? {}) as { actor?: unknown };
		const base = raw.actor !== undefined && raw.actor !== null ? approvalActorOf(raw.actor) : await found.identity.currentActor(repo);
		const actor: Actor = { ...base, properties: { ...base.properties, name: author } };

		const anchor = feedbackAnchorOf(entry.anchor, entry.target, isOwnDocument(entry.target.file, artifactId, abs));
		const stored = await found.feedback.add(artifactId, {
			text: entry.comment.trim(), kind: kindOf(entry), anchor, batchId: entry.batchId,
		}, actor);
		return { artifactPath: abs, entryId: stored.id, total: (await found.feedback.entries(artifactId)).length };
	} catch (err) {
		return { error: `${method}: ${err instanceof ArtifactFeedbackError ? err.message : (err as Error).message}` };
	}
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
