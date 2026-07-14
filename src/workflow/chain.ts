/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc workflow chain <epicHash>` support module.
 *
 * Reports the current state of an Epic across the whole workflow
 * lifecycle (define → design.epic → design.story per Story) and
 * prints the exact next MCP tool invocation the user should run.
 *
 * Epics are addressed by their 16-char hash. The human-readable
 * slug pulled from the Define artifact's `meta.epicSlug` is shown
 * in titles + prompts, but is never load-bearing.
 */

import { existsSync, readFileSync } from 'node:fs';

import type { DefineArtifact } from './artifacts/define.js';
import type { HldArtifact } from './artifacts/hld.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths } from './storage.js';
import { listAmendments } from './amendments/store.js';
import { scanLldStaleness } from './amendments/staleness.js';

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface ChainReport {
	readonly epicHash: string;
	readonly epicSlug?: string;
	readonly define: {
		readonly exists:      boolean;
		readonly approved:    boolean;
		readonly rejected:    boolean;
		readonly path?:       string;
	};
	readonly hld: {
		readonly exists:   boolean;
		readonly approved: boolean;
		readonly rejected: boolean;
		readonly path?:    string;
	};
	readonly stories: readonly {
		readonly id:       string;
		readonly title:    string;
		readonly hasLld:   boolean;
		readonly approved: boolean;
		readonly stale:    boolean;
		readonly staleReason?: string;
		readonly path?:    string;
	}[];
	readonly amendments: {
		readonly pending:  number;
		readonly approved: number;
		readonly rejected: number;
	};
	readonly tracker: {
		readonly pushed:      boolean;
		readonly epicRef?:    string;
		readonly lastSyncedAt?: string;
	};
	readonly nextAction: NextAction;
}

export type NextAction =
	| { readonly kind: 'run-define';       readonly command: string }
	| { readonly kind: 'approve-define';   readonly command: string }
	| { readonly kind: 'run-hld';          readonly command: string }
	| { readonly kind: 'approve-hld';      readonly command: string }
	| { readonly kind: 'run-lld';          readonly storyId: string; readonly command: string }
	| { readonly kind: 'approve-lld';      readonly storyId: string; readonly command: string }
	| { readonly kind: 'refresh-stale';    readonly storyId: string; readonly reason: string }
	| { readonly kind: 'review-amendment'; readonly amendmentId: string; readonly command: string }
	| { readonly kind: 'push-tracker';     readonly command: string }
	| { readonly kind: 'sync-tracker';     readonly command: string }
	| { readonly kind: 'chain-complete' };

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildChainReport(repoPath: string, epicHash: string): ChainReport {
	const define = readDefineIfPresent(repoPath, epicHash);
	const hld    = readHldIfPresent(repoPath, epicHash);
	const stories = readStoryLldStatus(repoPath, epicHash, define, hld);
	const amendments = countAmendments(repoPath, epicHash);
	const tracker = readTrackerMeta(define.artifact);
	const nextAction = computeNextAction(epicHash, {
		define, hld, stories, amendments, tracker,
	});
	const epicSlug = define.artifact?.meta.epicSlug;
	return {
		epicHash,
		...(epicSlug !== undefined ? { epicSlug } : {}),
		define: {
			exists:   define.exists,
			approved: define.approved,
			rejected: define.rejected,
			...(define.path !== undefined ? { path: define.path } : {}),
		},
		hld: {
			exists:   hld.exists,
			approved: hld.approved,
			rejected: hld.rejected,
			...(hld.path !== undefined ? { path: hld.path } : {}),
		},
		stories,
		amendments,
		tracker,
		nextAction,
	};
}

interface DefineState {
	readonly exists:   boolean;
	readonly approved: boolean;
	readonly rejected: boolean;
	readonly path?:    string;
	readonly artifact?: DefineArtifact;
}

interface HldState {
	readonly exists:   boolean;
	readonly approved: boolean;
	readonly rejected: boolean;
	readonly path?:    string;
	readonly artifact?: HldArtifact;
}

function readDefineIfPresent(repoPath: string, epicHash: string): DefineState {
	const paths = defineArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) return { exists: false, approved: false, rejected: false };
	const raw = readFileSync(paths.json, 'utf8');
	const artifact = JSON.parse(raw) as DefineArtifact;
	const approved = typeof artifact.meta.approvedAt === 'string' && artifact.meta.approvedAt.length > 0;
	const rejected = typeof artifact.meta.rejectedAt === 'string' && artifact.meta.rejectedAt.length > 0;
	return { exists: true, approved, rejected, path: paths.md, artifact };
}

function readHldIfPresent(repoPath: string, epicHash: string): HldState {
	const paths = hldArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) return { exists: false, approved: false, rejected: false };
	const raw = readFileSync(paths.json, 'utf8');
	const artifact = JSON.parse(raw) as HldArtifact;
	const approved = typeof artifact.meta.approvedAt === 'string' && artifact.meta.approvedAt.length > 0;
	const rejected = typeof artifact.meta.rejectedAt === 'string' && artifact.meta.rejectedAt.length > 0;
	return { exists: true, approved, rejected, path: paths.md, artifact };
}

function readStoryLldStatus(
	repoPath:  string,
	epicHash:  string,
	define:    DefineState,
	hld:       HldState,
): ChainReport['stories'] {
	if (define.artifact === undefined) return [];
	const stories = define.artifact.body.stories;
	const staleness = hld.artifact === undefined ? new Map<string, { stale: boolean; staleReason?: string }>()
		: staleByStory(scanLldStaleness(repoPath, epicHash, hld.artifact));
	return stories.map(s => {
		const paths = lldArtifactPaths(repoPath, epicHash, s.id);
		const hasLld = existsSync(paths.json);
		let approved = false;
		if (hasLld) {
			try {
				const raw = readFileSync(paths.json, 'utf8');
				const lld = JSON.parse(raw) as { meta: { approvedAt?: string } };
				approved = typeof lld.meta.approvedAt === 'string' && lld.meta.approvedAt.length > 0;
			} catch { /* malformed — treat as unapproved */ }
		}
		const stale = staleness.get(s.id);
		return {
			id: s.id, title: s.title,
			hasLld, approved,
			stale: stale?.stale === true,
			...(stale?.staleReason !== undefined ? { staleReason: stale.staleReason } : {}),
			...(hasLld ? { path: paths.md } : {}),
		};
	});
}

function staleByStory(entries: ReturnType<typeof scanLldStaleness>): Map<string, { stale: boolean; staleReason?: string }> {
	const m = new Map<string, { stale: boolean; staleReason?: string }>();
	for (const e of entries) {
		m.set(e.storyId, { stale: e.stale, ...(e.staleReason !== undefined ? { staleReason: e.staleReason } : {}) });
	}
	return m;
}

function countAmendments(repoPath: string, epicHash: string): ChainReport['amendments'] {
	const rows = listAmendments(repoPath, epicHash);
	let pending = 0, approved = 0, rejected = 0;
	for (const r of rows) {
		if (r.status === 'pending')       pending++;
		else if (r.status === 'approved') approved++;
		else if (r.status === 'rejected') rejected++;
	}
	return { pending, approved, rejected };
}

function readTrackerMeta(define?: DefineArtifact): ChainReport['tracker'] {
	if (define === undefined) return { pushed: false };
	const meta = define.meta as { tracker?: { epicRef?: string; lastSyncedAt?: string } };
	if (meta.tracker === undefined || typeof meta.tracker.epicRef !== 'string') return { pushed: false };
	return {
		pushed:  true,
		epicRef: meta.tracker.epicRef,
		...(typeof meta.tracker.lastSyncedAt === 'string' ? { lastSyncedAt: meta.tracker.lastSyncedAt } : {}),
	};
}

// ---------------------------------------------------------------------------
// Next-action decision tree
// ---------------------------------------------------------------------------

interface NextActionInput {
	readonly define:    DefineState;
	readonly hld:       HldState;
	readonly stories:   ChainReport['stories'];
	readonly amendments: ChainReport['amendments'];
	readonly tracker:   ChainReport['tracker'];
}

function computeNextAction(epicHash: string, s: NextActionInput): NextAction {
	// 1. Define isn't done or approved.
	if (!s.define.exists) {
		return {
			kind: 'run-define',
			command: `insrc_workflow_step phase=start workflow=define focus="<your ask>"`,
		};
	}
	if (s.define.rejected) {
		return {
			kind: 'run-define',
			command: `insrc_workflow_step phase=start workflow=define focus="<re-framed ask; prior was rejected>"`,
		};
	}
	if (!s.define.approved) {
		return {
			kind: 'approve-define',
			command: `insrc workflow approve ${s.define.path}`,
		};
	}
	// 2. Pending amendments block downstream: surface them first.
	if (s.amendments.pending > 0) {
		return {
			kind: 'review-amendment',
			amendmentId: `<list via: insrc workflow amend ${epicHash} --list>`,
			command: `insrc workflow amend ${epicHash} --list`,
		};
	}
	// 3. HLD.
	if (!s.hld.exists) {
		return {
			kind: 'run-hld',
			command: `insrc_workflow_step phase=start workflow=design.epic focus="HLD for ${epicHash}" params={"epicHash":"${epicHash}"}`,
		};
	}
	if (!s.hld.approved) {
		return {
			kind: 'approve-hld',
			command: `insrc workflow approve ${s.hld.path}`,
		};
	}
	// 4. LLDs: pick the first Story that's missing OR stale OR unapproved.
	for (const story of s.stories) {
		if (story.stale) {
			return {
				kind: 'refresh-stale',
				storyId: story.id,
				reason: story.staleReason ?? 'unknown',
			};
		}
		if (!story.hasLld) {
			return {
				kind: 'run-lld',
				storyId: story.id,
				command: `insrc_workflow_step phase=start workflow=design.story focus="LLD for ${story.id}" params={"epicHash":"${epicHash}","storyId":"${story.id}"}`,
			};
		}
		if (!story.approved) {
			return {
				kind: 'approve-lld',
				storyId: story.id,
				command: `insrc workflow approve ${story.path}`,
			};
		}
	}
	// 5. Tracker: suggest push once every LLD is approved.
	if (!s.tracker.pushed) {
		return {
			kind: 'push-tracker',
			command: `insrc_workflow_step phase=start workflow=tracker.push focus="push ${epicHash} to GitHub" params={"epicHash":"${epicHash}"}`,
		};
	}
	// 6. Suggest a sync if it's been a while (heuristic: never
	// synced OR older than 24h).
	if (s.tracker.lastSyncedAt === undefined) {
		return {
			kind: 'sync-tracker',
			command: `insrc_workflow_step phase=start workflow=tracker.sync focus="sync ${epicHash} from GitHub" params={"epicHash":"${epicHash}"}`,
		};
	}
	return { kind: 'chain-complete' };
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/** Render a chain report to plain text for CLI stdout. */
export function formatChainReport(r: ChainReport): string {
	const lines: string[] = [];
	const title = r.epicSlug !== undefined ? `${r.epicSlug} (${r.epicHash})` : r.epicHash;
	lines.push(`# Chain status: ${title}`);
	lines.push('');
	lines.push(`## Define`);
	lines.push(bullet('exists',   r.define.exists));
	lines.push(bullet('approved', r.define.approved));
	if (r.define.rejected) lines.push(`  - rejected: yes`);
	lines.push('');
	lines.push(`## HLD`);
	lines.push(bullet('exists',   r.hld.exists));
	lines.push(bullet('approved', r.hld.approved));
	if (r.hld.rejected) lines.push(`  - rejected: yes`);
	lines.push('');
	if (r.stories.length > 0) {
		lines.push(`## LLDs`);
		for (const s of r.stories) {
			const flags: string[] = [];
			if (!s.hasLld)           flags.push('missing');
			else if (!s.approved)    flags.push('unapproved');
			if (s.stale)             flags.push(`STALE (${s.staleReason ?? '?'})`);
			const status = flags.length > 0 ? flags.join(', ') : 'up-to-date';
			lines.push(`  - ${s.id}: ${s.title} — ${status}`);
		}
		lines.push('');
	}
	lines.push(`## Amendments`);
	lines.push(`  - pending: ${r.amendments.pending}   approved: ${r.amendments.approved}   rejected: ${r.amendments.rejected}`);
	lines.push('');
	lines.push(`## Tracker`);
	if (r.tracker.pushed) {
		lines.push(`  - pushed: ${r.tracker.epicRef}`);
		if (r.tracker.lastSyncedAt !== undefined) lines.push(`  - lastSyncedAt: ${r.tracker.lastSyncedAt}`);
	} else {
		lines.push('  - not yet pushed');
	}
	lines.push('');
	lines.push(`## Next action`);
	lines.push(formatNextAction(r.nextAction));
	return lines.join('\n') + '\n';
}

function bullet(label: string, value: boolean): string {
	return `  - ${label}: ${value ? 'yes' : 'no'}`;
}

function formatNextAction(a: NextAction): string {
	switch (a.kind) {
		case 'run-define':       return `Run define: \`${a.command}\``;
		case 'approve-define':   return `Approve Define: \`${a.command}\``;
		case 'run-hld':          return `Run HLD (design.epic): \`${a.command}\``;
		case 'approve-hld':      return `Approve HLD: \`${a.command}\``;
		case 'run-lld':          return `Run LLD for Story '${a.storyId}': \`${a.command}\``;
		case 'approve-lld':      return `Approve LLD for Story '${a.storyId}': \`${a.command}\``;
		case 'refresh-stale':    return `Story '${a.storyId}' LLD is stale (${a.reason}). Re-run design.story or ack-stale.`;
		case 'review-amendment': return `Pending amendment(s) block downstream progress. Review: \`${a.command}\``;
		case 'push-tracker':     return `All designs approved. Push to GitHub: \`${a.command}\``;
		case 'sync-tracker':     return `Sync tracker status: \`${a.command}\``;
		case 'chain-complete':   return `Chain complete — no next action.`;
		default:                 return 'unknown';
	}
}
