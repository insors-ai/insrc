/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Resolve a companion page's header (LLD-d9f85b3c S001/t4).
 *
 * One header per finalize site, shared by every companion that site writes:
 *
 *   projectName  `<repo>/.insrc/config.json` `projectName` when a non-empty
 *                string, else the repo folder's name;
 *   workItemId   the hierarchical epic (HLD) or story (LLD) id, else the plain
 *                epic hash / story id when the id cannot be minted;
 *   sourceDoc    the source artifact's id and a link to its markdown, which
 *                sits beside the companion;
 *   date         render time from an injectable clock, 'YYYY-MM-DD HH:mm' local;
 *   user         git user.name in the repo, else the OS login, else 'unknown';
 *   contextLine  where the visual sits (Epic / Story placement) and one line
 *                of what that is.
 *
 * Never throws: every lookup degrades to its fallback, because a header must
 * not be the reason a finalize fails.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename } from 'node:path';

import { repoConfigPath } from '../../../indexer/repo-ignore-config.js';
import { epicWorkflowId, safeCanonical, storyIdToOrdinal, storyWorkflowId } from '../../id.js';
import type { CompanionHeader } from './types.js';

/** What the finalize site knows about the document the companion belongs to. */
export type CompanionHeaderSource =
	/** An Epic's HLD: placement is the Epic; the line is its summary. */
	| {
		readonly kind:            'HLD';
		readonly epicHash:        string;
		readonly epicSlug?:       string | undefined;
		readonly anchorCreatedAt: string;
		readonly summary?:        string | undefined;
	}
	/** A Story's LLD under an Epic: the line is the Story's title and value, from the DEF. */
	| {
		readonly kind:            'LLD-epic';
		readonly epicHash:        string;
		readonly epicSlug?:       string | undefined;
		readonly storyId:         string;
		readonly anchorCreatedAt: string;
		readonly storyTitle?:     string | undefined;
		readonly userValue?:      string | undefined;
	}
	/** A standalone Story's LLD: the line is the story title and the LLD's summary. */
	| {
		readonly kind:            'LLD-standalone';
		readonly epicHash:        string;
		readonly storyId:         string;
		readonly anchorCreatedAt: string;
		readonly storyTitle?:     string | undefined;
		readonly summary?:        string | undefined;
	};

export interface CompanionHeaderInput {
	readonly repoPath:   string;
	readonly source:     CompanionHeaderSource;
	/** The source artifact's id, e.g. LLD-<hash>-s1. */
	readonly artifactId: string;
	/** The source markdown's path; the link is to its file name, as the companion is its sibling. */
	readonly sourceMdPath: string;
}

/** Seams for the lookups that read the machine, so tests can pin them. */
export interface CompanionHeaderDeps {
	readonly now?:         (() => Date) | undefined;
	readonly gitUserName?: ((repoPath: string) => string | undefined) | undefined;
	readonly osUserName?:  (() => string | undefined) | undefined;
}

export function resolveCompanionHeader(input: CompanionHeaderInput, deps: CompanionHeaderDeps = {}): CompanionHeader {
	return {
		projectName: projectName(input.repoPath),
		workItemId:  workItemId(input.source),
		sourceDoc:   { id: input.artifactId, href: `./${basename(input.sourceMdPath)}` },
		date:        formatDate((deps.now ?? (() => new Date()))()),
		user:        resolveReviewer(input.repoPath, deps).name,
		contextLine: contextLine(input.source),
	};
}

/** Who is at the machine, and where the name came from. */
export interface Reviewer {
	readonly name:   string;
	readonly source: 'git' | 'os' | 'unknown';
}

/** The lookups resolveReviewer reads the machine with. */
export type ReviewerDeps = Pick<CompanionHeaderDeps, 'gitUserName' | 'osUserName'>;

/**
 * The person a header or a saved comment is attributed to: git user.name in the
 * repo, else the OS login, else 'unknown'. Never throws.
 */
export function resolveReviewer(repoPath: string, deps: ReviewerDeps = {}): Reviewer {
	const git = nonEmpty((deps.gitUserName ?? defaultGitUserName)(repoPath));
	if (git !== undefined) return { name: git, source: 'git' };
	const os = nonEmpty((deps.osUserName ?? defaultOsUserName)());
	if (os !== undefined) return { name: os, source: 'os' };
	return { name: 'unknown', source: 'unknown' };
}

function nonEmpty(v: string | undefined): string | undefined {
	const t = v?.trim();
	return t !== undefined && t.length > 0 ? t : undefined;
}

function projectName(repoPath: string): string {
	try {
		const parsed = JSON.parse(readFileSync(repoConfigPath(repoPath), 'utf8')) as unknown;
		if (typeof parsed === 'object' && parsed !== null) {
			const name = nonEmpty(typeof (parsed as { projectName?: unknown }).projectName === 'string'
				? (parsed as { projectName: string }).projectName : undefined);
			if (name !== undefined) return name;
		}
	} catch { /* absent or malformed config: use the folder name */ }
	return basename(repoPath);
}

function workItemId(source: CompanionHeaderSource): string {
	if (source.kind === 'HLD') {
		return safeCanonical(() => epicWorkflowId(source.epicHash, source.anchorCreatedAt)) ?? source.epicHash;
	}
	return safeCanonical(() => storyWorkflowId(source.epicHash, source.anchorCreatedAt, source.storyId)) ?? source.storyId;
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD HH:mm' in local time. */
export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultGitUserName(repoPath: string): string | undefined {
	try {
		return execFileSync('git', ['config', 'user.name'], { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
	} catch {
		return undefined;
	}
}

function defaultOsUserName(): string | undefined {
	try {
		return userInfo().username;
	} catch {
		return undefined;
	}
}

/** The first sentence of a paragraph, or its first 80 characters. */
function firstSentence(s: string | undefined): string | undefined {
	const t = nonEmpty(s?.replace(/\s+/g, ' '));
	if (t === undefined) return undefined;
	const m = /^(.+?[.!?])(\s|$)/.exec(t);
	if (m !== null) return m[1]!;
	return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

/** `S001` for any spelling of the story id (`s1`, `S1`, `S001`). */
function storyLabel(storyId: string): string {
	try { return `S${String(storyIdToOrdinal(storyId)).padStart(3, '0')}`; } catch { return storyId; }
}

function joinLine(placement: string, ...parts: (string | undefined)[]): string {
	const text = parts.filter((p): p is string => p !== undefined).join(' — ');
	return text.length > 0 ? `${placement} · ${text}` : placement;
}

function contextLine(source: CompanionHeaderSource): string {
	switch (source.kind) {
		case 'HLD':
			return joinLine(`Epic ${nonEmpty(source.epicSlug) ?? source.epicHash}`, firstSentence(source.summary));
		case 'LLD-epic':
			return joinLine(
				`Story ${storyLabel(source.storyId)} of Epic ${nonEmpty(source.epicSlug) ?? source.epicHash}`,
				nonEmpty(source.storyTitle), firstSentence(source.userValue),
			);
		case 'LLD-standalone':
			return joinLine(`Standalone story ${storyLabel(source.storyId)}`, nonEmpty(source.storyTitle), firstSentence(source.summary));
	}
}
