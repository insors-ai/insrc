/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Who is acting, for attribution (s5). Builds the namespaced person Actor for feedback and review comments from the
 * tracker's login (else the git email, else the OS user), and keeps the person's own declaration of the several ids they
 * use in ~/.insrc/identity.json. The file is self-declared, local to the machine and for display and attribution only:
 * the gates in src/workflow/team decide on TrackerPort.whoAmI and never read it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { localIdentityDeps, resolveLearner } from '../../understanding/identity.js';
import type { IdentityCommand, IdentityDeps, IdentityLookup } from '../../understanding/identity.js';
import { isNamespacedActorId } from '../artifact-core/decode.js';
import type { Actor } from '../artifact-core/types.js';
import { writeAtomic } from '../storage.js';
import { loadTracker } from '../tracker/github-adapter.js';
import type { Capability, LoadTracker } from '../tracker/port.js';

const log = getLogger('identity');

export const MAX_ALIASES = 20;

/** ~/.insrc/identity.json: the person's own ids, every one namespaced and lower-case. */
export interface IdentityFile {
	readonly primary: string;
	readonly aliases: readonly string[];
}

export class IdentityError extends Error {
	constructor(message: string) { super(message); this.name = 'IdentityError'; }
}

export interface IdentityServiceDeps {
	/** The identity file; defaults to ~/.insrc/identity.json. */
	readonly path?:        string | undefined;
	/** Passed to the shared learner resolution as its host id. */
	readonly hostId?:      string | undefined;
	readonly loadTracker?: LoadTracker | undefined;
	/** Runs git for the email fallback (the shared resolution's command runner). */
	readonly run?:         IdentityCommand | undefined;
	readonly osUser?:      (() => string) | undefined;
	readonly hostname?:    (() => string) | undefined;
}

function check(decl: unknown): IdentityFile {
	if (typeof decl !== 'object' || decl === null || Array.isArray(decl)) throw new IdentityError('the identity is not an object');
	const { primary, aliases } = decl as { primary?: unknown; aliases?: unknown };
	if (!isNamespacedActorId(primary)) throw new IdentityError(`the primary '${String(primary)}' is not a namespaced lower-case id such as github:alice`);
	if (!Array.isArray(aliases)) throw new IdentityError('aliases is not a list');
	if (aliases.length > MAX_ALIASES) throw new IdentityError(`more than ${MAX_ALIASES} aliases`);
	const seen = new Set<string>([primary]);
	for (const a of aliases) {
		if (!isNamespacedActorId(a)) throw new IdentityError(`the alias '${String(a)}' is not a namespaced lower-case id such as github:alice`);
		if (seen.has(a)) throw new IdentityError(`'${a}' is declared twice`);
		seen.add(a);
	}
	return { primary, aliases: [...aliases] as string[] };
}

export class IdentityService {
	constructor(private readonly deps: IdentityServiceDeps = {}) {}

	private get path(): string { return this.deps.path ?? join(homedir(), '.insrc', 'identity.json'); }

	/** The declared identity, or undefined when none was declared. An existing file that is not valid is an IdentityError, not empty. */
	async show(): Promise<IdentityFile | undefined> {
		if (!existsSync(this.path)) return undefined;
		let parsed: unknown;
		try { parsed = JSON.parse(readFileSync(this.path, 'utf8')); }
		catch (err) { throw new IdentityError(`${this.path} is not valid JSON (${(err as Error).message})`); }
		try { return check(parsed); }
		catch (err) { throw new IdentityError(`${this.path}: ${(err as Error).message}`); }
	}

	/** Replace the declaration, atomically. */
	async declare(decl: { readonly primary: string; readonly aliases: readonly string[] }): Promise<IdentityFile> {
		const file = check(decl);
		writeAtomic(this.path, JSON.stringify(file, null, 2) + '\n');
		return file;
	}

	/**
	 * The person acting: github:<login> from the tracker, else git:<email>, else os:<user>@<host>. The choice is the shared
	 * learner resolution's, so the two always agree. The declared aliases ride in properties.aliases when this id is the
	 * declared primary or one of its aliases. Never throws: a file that is not valid is logged and the actor has no aliases.
	 */
	async currentActor(repoPath: string): Promise<Actor> {
		const id = await this.idOf(repoPath);
		const properties: Record<string, unknown> = {};
		try {
			const file = await this.show();
			if (file !== undefined && (file.primary === id || file.aliases.includes(id))) {
				properties['aliases'] = [file.primary, ...file.aliases].filter(a => a !== id);
			}
		} catch (err) { log.warn({ err: (err as Error).message }, 'the identity file is not valid; recording the actor without aliases'); }
		return { id, kind: 'person', properties };
	}

	private async idOf(repoPath: string): Promise<string> {
		const osId = (): string => {
			let user = 'unknown';
			try { user = (this.deps.osUser ?? (() => userInfo().username))(); } catch { /* keep the placeholder */ }
			let host = 'localhost';
			try { host = (this.deps.hostname ?? hostname)(); } catch { /* keep the placeholder */ }
			return `os:${user}@${host}`.toLowerCase().replace(/\s+/g, '-');
		};
		try {
			const base = localIdentityDeps(this.deps.hostId ?? 'insrc', this.deps.run);
			const tracker = this.deps.loadTracker ?? loadTracker;
			const github = async (): Promise<IdentityLookup> => {
				try {
					const loaded = tracker(repoPath, new Set<Capability>());
					const who = loaded.ok ? loaded.value.whoAmI() : undefined;
					if (who?.ok === true && who.value.trim() !== '') {
						return { source: 'github', status: 'available', identities: [{ source: 'github', authority: 'https://github.com', subject: who.value.trim() }] };
					}
					return { source: 'github', status: 'unavailable', identities: [] };
				} catch { return { source: 'github', status: 'unavailable', identities: [] }; }
			};
			const deps: IdentityDeps = { ...base, providers: [{ source: 'github', lookup: github }] };
			const { learner } = await resolveLearner(repoPath, deps);
			const id = learner.source === 'github' ? `github:${learner.subject}`
				: learner.source === 'git' ? `git:${learner.subject}`
				: osId();
			const lowered = id.toLowerCase();
			return isNamespacedActorId(lowered) ? lowered : osId();
		} catch (err) {
			log.warn({ err: (err as Error).message }, 'could not resolve the acting identity; using the OS user');
			return osId();
		}
	}
}
