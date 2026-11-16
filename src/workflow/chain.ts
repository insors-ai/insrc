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

import { approvalStateOf } from './artifact-core/approval-view.js';
import { signoffViewOf, type SignoffViewState } from './team/signoff.js';
import type { DefineArtifact } from './artifacts/define.js';
import type { HldArtifact } from './artifacts/hld.js';
import type { IssueArtifact } from './artifacts/issue.js';
import { artifactJsonPath, defineArtifactId, defineArtifactPaths, hldArtifactId, hldArtifactPaths, impliedIssueStories, issueArtifactId, issueArtifactPaths, lldArtifactId, lldArtifactPaths, readRevision, workItemAnchorCreatedAt, workItemKindOf } from './storage.js';
import { listAmendments } from './amendments/store.js';
import { unitIssueOf } from './tracker/unit-head.js';
import { scanLldStaleness } from './amendments/staleness.js';

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface ChainReport {
	readonly epicHash: string;
	readonly epicSlug?: string;
	/** Which artifact kind heads the work item: 'def' for a DEF, 'issue' for
	 *  an ISSUE-anchored bugfix (ISSUE-149283b0d0455a43). DEF wins when both
	 *  exist, as in readEpicDefinitionCore. */
	readonly definitionKind?: 'def' | 'issue';
	readonly define: {
		readonly exists:      boolean;
		readonly approved:    boolean;
		readonly rejected:    boolean;
		readonly path?:       string;
		/** The Define's signoff, apart from its approval; absent when it has none (Story s7). */
		readonly signoff?:    SignoffViewState;
	};
	readonly hld: {
		readonly exists:   boolean;
		readonly approved: boolean;
		readonly rejected: boolean;
		readonly path?:    string;
		readonly signoff?: SignoffViewState;
	};
	readonly stories: readonly {
		readonly id:       string;
		readonly title:    string;
		readonly hasLld:   boolean;
		readonly approved: boolean;
		/** The LLD's signoff, apart from its approval; absent when it has none. */
		readonly signoff?: SignoffViewState;
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
		/** The Define's artifact id and its revision (0 when absent). Shown only: nothing here is stored in `meta.tracker`. */
		readonly artifactId?: string;
		readonly revision?:   number;
		/** Each Story that has an issue, with its LLD's artifact id and revision (0 when it has no LLD or no revision). Shown only. */
		readonly stories?:    readonly { readonly id: string; readonly issue: string; readonly artifactId: string; readonly revision: number }[];
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
	const tracker = readTrackerMeta(repoPath, epicHash, define.artifact, define.issue);
	const nextAction = computeNextAction(epicHash, {
		define, hld, stories, amendments, tracker,
	});
	const epicSlug = define.artifact?.meta.epicSlug;
	return {
		epicHash,
		...(define.definitionKind !== undefined ? { definitionKind: define.definitionKind } : {}),
		...(epicSlug !== undefined ? { epicSlug } : {}),
		define: {
			exists:   define.exists,
			approved: define.approved,
			rejected: define.rejected,
			...(define.path !== undefined ? { path: define.path } : {}),
			...signoffOf(define.artifact?.meta),
		},
		hld: {
			exists:   hld.exists,
			approved: hld.approved,
			rejected: hld.rejected,
			...(hld.path !== undefined ? { path: hld.path } : {}),
			...signoffOf(hld.artifact?.meta),
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
	/** ISSUE-149283b0d0455a43: 'issue' when an ISSUE heads the work item (no DEF),
	 *  'def' when a DEF heads it. Set on every existing head, absent when neither
	 *  root exists. */
	readonly definitionKind?: 'def' | 'issue';
	/** The ISSUE artifact when the head is an ISSUE — the chain report's
	 *  definition read for a bugfix work item. */
	readonly issue?:    IssueArtifact;
}

function readDefineIfPresent(repoPath: string, epicHash: string): DefineState {
	const jsonPath = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	if (!existsSync(jsonPath)) {
		// ISSUE-149283b0d0455a43: the DEF is absent — the work item may still be
		// headed by an ISSUE (a bugfix), which is a definition head too. The DEF
		// wins when both exist, as in readEpicDefinitionCore.
		const issueJson = artifactJsonPath(repoPath, issueArtifactId(epicHash));
		if (!existsSync(issueJson)) return { exists: false, approved: false, rejected: false };
		const issue = JSON.parse(readFileSync(issueJson, 'utf8')) as IssueArtifact;
		const approved = approvalStateOf(issue.meta) === 'approved';
		const rejected = approvalStateOf(issue.meta) === 'rejected';
		const mdPath = issueArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(issue.meta), workItemKindOf(issue.meta), issue.meta.epicSlug).md;
		return { exists: true, approved, rejected, path: mdPath, definitionKind: 'issue', issue };
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as DefineArtifact;
	const approved = approvalStateOf(artifact.meta) === 'approved';
	const rejected = approvalStateOf(artifact.meta) === 'rejected';
	const mdPath = defineArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(artifact.meta), workItemKindOf(artifact.meta), artifact.meta.epicSlug).md;
	return { exists: true, approved, rejected, path: mdPath, artifact, definitionKind: 'def' };
}

interface HldState {
	readonly exists:   boolean;
	readonly approved: boolean;
	readonly rejected: boolean;
	readonly path?:    string;
	readonly artifact?: HldArtifact;
}

function readHldIfPresent(repoPath: string, epicHash: string): HldState {
	const jsonPath = artifactJsonPath(repoPath, hldArtifactId(epicHash));
	if (!existsSync(jsonPath)) return { exists: false, approved: false, rejected: false };
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as HldArtifact;
	const approved = approvalStateOf(artifact.meta) === 'approved';
	const rejected = approvalStateOf(artifact.meta) === 'rejected';
	const mdPath = hldArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(artifact.meta), workItemKindOf(artifact.meta), artifact.meta.epicSlug).md;
	return { exists: true, approved, rejected, path: mdPath, artifact };
}

function readStoryLldStatus(
	repoPath:  string,
	epicHash:  string,
	define:    DefineState,
	hld:       HldState,
): ChainReport['stories'] {
	if (define.artifact === undefined && define.issue === undefined) return [];
	// ISSUE-149283b0d0455a43: an ISSUE head declares no story list — its story
	// set is the one implied story, from the shared rule in storage.ts.
	const declared: readonly { readonly id: string; readonly title: string }[] =
		define.artifact !== undefined ? define.artifact.body.stories : impliedIssueStories(define.issue!);
	const staleness = hld.artifact === undefined ? new Map<string, { stale: boolean; staleReason?: string }>()
		: staleByStory(scanLldStaleness(repoPath, epicHash, hld.artifact));
	const epicSlug = define.artifact?.meta.epicSlug ?? define.issue?.meta.epicSlug;
	const headCreatedAt = define.artifact?.meta.createdAt ?? define.issue?.meta.createdAt;
	return declared.map(s => {
		const jsonPath = artifactJsonPath(repoPath, lldArtifactId(epicHash, s.id));
		const hasLld = existsSync(jsonPath);
		let approved = false;
		let signoff: { signoff?: SignoffViewState } = {};
		let lldMeta: Record<string, unknown> | undefined;
		if (hasLld) {
			try {
				const raw = readFileSync(jsonPath, 'utf8');
				const lld = JSON.parse(raw) as { meta: Record<string, unknown> };
				approved = approvalStateOf(lld.meta) === 'approved';
				signoff = signoffOf(lld.meta);
				lldMeta = lld.meta;
			} catch { /* malformed — treat as unapproved */ }
		}
		const stale = staleness.get(s.id);
		// ISSUE-149283b0d0455a43: the story path comes from the LLD's OWN meta
		// (anchor, kind, slug), so an ISSUE-anchored item resolves under
		// docs/standalone — the DEF route's define.artifact.meta.createdAt +
		// 'epic' construction would point at docs/epics.
		let path: string | undefined;
		if (hasLld && lldMeta !== undefined) {
			path = lldArtifactPaths(
				repoPath, epicHash, s.id,
				workItemAnchorCreatedAt(lldMeta),
				workItemKindOf(lldMeta),
				(epicSlug ?? lldMeta['epicSlug']) as string | undefined ?? lldMeta['epicSlug'] as string | undefined,
			).md;
		} else if (headCreatedAt !== undefined) {
			path = lldArtifactPaths(repoPath, epicHash, s.id, headCreatedAt, define.definitionKind === 'issue' ? 'standalone' : 'epic', epicSlug).md;
		}
		return {
			id: s.id, title: s.title,
			hasLld, approved,
			...signoff,
			stale: stale?.stale === true,
			...(stale?.staleReason !== undefined ? { staleReason: stale.staleReason } : {}),
			...(path !== undefined ? { path } : {}),
		};
	});
}

/** The signoff a head carries, shown apart from its approval; nothing when it has none. */
function signoffOf(meta: unknown): { signoff?: SignoffViewState } {
	if (meta === undefined) return {};
	const state = signoffViewOf(meta).state;
	return state === 'none' ? {} : { signoff: state };
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

/** The Epic's issue is the binding of its EPIC head; the time of the last sync is the Define's `meta.tracker`. */
function readTrackerMeta(repoPath: string, epicHash: string, define?: DefineArtifact, issue?: IssueArtifact): ChainReport['tracker'] {
	if (define === undefined && issue === undefined) return { pushed: false };
	// ISSUE-149283b0d0455a43: tracker handling for an ISSUE-anchored item is
	// deferred to ISSUE-5f9d4ab4c90c0b4c — the chain report still shows the
	// binding when one exists, but never derives a Define from it.
	const epicRef = unitIssueOf(repoPath, epicHash);
	if (epicRef === undefined) return { pushed: false };
	const head = (define ?? issue) as unknown as { readonly meta: { readonly tracker?: { lastSyncedAt?: string } } };
	const meta = head.meta;
	const declared = define !== undefined ? define.body.stories : impliedIssueStories(issue!);
	const stories = declared.flatMap(s => {
		const issueRef = unitIssueOf(repoPath, epicHash, s.id);
		if (issueRef === undefined) return [];
		const artifactId = lldArtifactId(epicHash, s.id);
		return [{ id: s.id, issue: issueRef, artifactId, revision: revisionOnDisk(repoPath, artifactId) }];
	});
	return {
		pushed:  true,
		epicRef,
		...(typeof meta.tracker?.lastSyncedAt === 'string' ? { lastSyncedAt: meta.tracker.lastSyncedAt } : {}),
		artifactId: define !== undefined ? defineArtifactId(epicHash) : issueArtifactId(epicHash),
		revision:   readRevision(head as unknown as Parameters<typeof readRevision>[0]),
		stories,
	};
}

/** `meta.revision` of the artifact stored under `artifactId`; 0 when it is absent, unreadable or has none. */
function revisionOnDisk(repoPath: string, artifactId: string): number {
	try { return readRevision(JSON.parse(readFileSync(artifactJsonPath(repoPath, artifactId), 'utf8'))); } catch { return 0; }
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
	// ISSUE-149283b0d0455a43: an ISSUE head reuses the define-level NextAction
	// kinds (user decision 2026-11-16: an ISSUE is equivalent to a define), but
	// its commands name the ISSUE document / rerun the issue stage, and the
	// chain never names an HLD, amendment, staleness or tracker step.
	if (s.define.definitionKind === 'issue') {
		if (!s.define.exists) {
			return {
				kind: 'run-define',
				command: `insrc_workflow_step phase=start workflow=issue focus="<the defect>"`,
			};
		}
		if (s.define.rejected) {
			return {
				kind: 'run-define',
				command: `insrc_workflow_step phase=start workflow=issue focus="<re-framed defect; prior ISSUE was rejected>"`,
			};
		}
		if (!s.define.approved) {
			return {
				kind: 'approve-define',
				command: `insrc workflow approve ${s.define.path}`,
			};
		}
		for (const story of s.stories) {
			if (!story.hasLld) {
				return {
					kind: 'run-lld',
					storyId: story.id,
					command: `insrc_workflow_step phase=start workflow=design.story focus="LLD for ${story.id}" params={"standalone":true,"epicHash":"${epicHash}","storyId":"${story.id}","sizeClass":"bugfix"}`,
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
		return { kind: 'chain-complete' };
	}
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
			command: `insrc workflow sync ${epicHash}`,
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
	// ISSUE-149283b0d0455a43: label which kind of definition heads the work item;
	// the DEF rendering stays byte-identical (no label line when definitionKind
	// is absent, which every pre-ISSUE caller produces only for a DEF head —
	// buildChainReport always sets it when a head exists).
	lines.push(r.definitionKind === 'issue' ? `## Issue (bugfix)` : `## Define`);
	lines.push(bullet('exists',   r.define.exists));
	lines.push(bullet('approved', r.define.approved));
	if (r.define.rejected) lines.push(`  - rejected: yes`);
	if (r.define.signoff !== undefined) lines.push(`  - signoff: ${r.define.signoff}`);
	lines.push('');
	lines.push(`## HLD`);
	lines.push(bullet('exists',   r.hld.exists));
	lines.push(bullet('approved', r.hld.approved));
	if (r.hld.rejected) lines.push(`  - rejected: yes`);
	if (r.hld.signoff !== undefined) lines.push(`  - signoff: ${r.hld.signoff}`);
	lines.push('');
	if (r.stories.length > 0) {
		lines.push(`## LLDs`);
		for (const s of r.stories) {
			const flags: string[] = [];
			if (!s.hasLld)           flags.push('missing');
			else if (!s.approved)    flags.push('unapproved');
			if (s.stale)             flags.push(`STALE (${s.staleReason ?? '?'})`);
			const status = (flags.length > 0 ? flags.join(', ') : 'up-to-date') + (s.signoff !== undefined ? `; signoff ${s.signoff}` : '');
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
		if (r.tracker.artifactId !== undefined) lines.push(`  - ${r.tracker.artifactId} revision ${r.tracker.revision ?? 0}`);
		for (const st of r.tracker.stories ?? []) lines.push(`  - ${st.id}: ${st.issue} (${st.artifactId} revision ${st.revision})`);
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
