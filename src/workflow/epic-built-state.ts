/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The built state of an Epic, for the first prompt of design.story, plan and build of a Story that is not the Epic's first
 * (ISSUE-1b3caadf04023d33, LLD s1).
 *
 * `buildEpicBuiltStateDigest` lists what the Epic's OTHER Stories have already built, read from records that already exist:
 * the Epic's approved Define (which Stories there are, in what order), each other Story's approved BUILD record (its summary,
 * per-Task verdicts, the files its build changed), its TESTS record (how the tests ran) and its LLD (the contracts it names).
 * It is read-only (nothing is written, no ref, index or working tree is touched), deterministic for the same records, and
 * bounded: the newest Stories are shown in full and older ones as one line and the path of their records, within a total cap.
 * A record that is missing or unreadable is noted for that Story and never stops the others; the function never throws.
 *
 * The prompt builders it serves are synchronous, so the digest reads the BUILD record's own change log (the file-level change set
 * collected at validate) and not git.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { approvalStateOf } from './artifact-core/approval-view.js';
import { readDefineArtifact } from './gates.js';
import { artifactJsonPath, buildArtifactId, lldArtifactId } from './storage.js';

const log = getLogger('workflow:epic-built-state');

/** Starts the BUILD summary's impact paragraph; the implement prompt asks for it and the approval check looks for it. */
export const EPIC_IMPACT_LABEL = 'Epic impact:' as const;

/**
 * The instruction placed first in the first prompt of design.story, plan and build for a later Story. One text, so the three
 * prompts, the steering and the BUILD check cannot drift apart.
 */
export const EPIC_IMPACT_FIRST_ACTION =
	'FIRST, before anything else: make a complete impact analysis of what this Epic has already built. Read the Epic built-state digest below ' +
	'against this Story: for each earlier built Story, what it changed (files, contracts, tests, disclosed deviations) that this Story touches, ' +
	'reuses, contradicts or must keep working. Open the cited records for anything the digest reduces or does not show. ' +
	'Record the result as the `epicImpact` analysis (applies, storiesCovered, findings, sources); for the build, open the BUILD summary ' +
	`with a paragraph that starts with "${EPIC_IMPACT_LABEL}" and names each Story the analysis covered.`;

/** One line for a stage whose Story has no earlier built Story to analyse. */
export const EPIC_IMPACT_NOT_APPLICABLE =
	'Epic impact analysis: does not apply. This is a standalone Story, the Epic\'s first Story, or no other Story of this Epic has an approved BUILD yet, so there is nothing already built to analyse.';

export interface EpicDigestOptions {
	/** Characters of one full Story's entry (default 1800). */
	readonly perStoryChars?: number | undefined;
	/** Characters of the whole rendered digest (default 9000). */
	readonly totalChars?: number | undefined;
	/** How many of the newest built Stories are shown in full (default 3). */
	readonly fullStories?: number | undefined;
	/** Reads and parses one JSON record; undefined when absent. A seam for tests; the default reads the file. */
	readonly readJson?: ((path: string) => unknown) | undefined;
}

export interface EpicBuiltStory {
	readonly storyId: string;
	readonly title:   string;
	/** 'full' shows the record's content; 'line' only a summary line and where the records are. */
	readonly detail:  'full' | 'line';
	readonly buildPath: string;
	readonly buildSummary?: string | undefined;
	readonly taskVerdicts?: readonly { readonly id: string; readonly passed: boolean }[] | undefined;
	readonly testsPath?: string | undefined;
	readonly testsResult?: string | undefined;
	readonly changedFiles?: readonly string[] | undefined;
	readonly contractNames?: readonly string[] | undefined;
	/** What could not be read or is not recorded for this Story. */
	readonly note?: string | undefined;
	/** When the BUILD was last written; orders which Stories are newest. */
	readonly builtAt?: string | undefined;
}

export interface EpicBuiltStateDigest {
	readonly epicHash:  string;
	readonly forStory:  string;
	readonly stories:   readonly EpicBuiltStory[];
	/** The caps the digest was fitted to; the renderer keeps to them. */
	readonly caps:      { readonly perStoryChars: number; readonly totalChars: number };
	/** Set when Stories were reduced to a line or left out to stay within the cap. */
	/** Set when Stories were reduced to a line (`reducedStories`, which includes the omitted) or left out (`omittedStories`) to stay within the caps. */
	readonly truncated: { readonly reducedStories: number; readonly omittedStories: number } | null;
}

const DEFAULTS = { perStoryChars: 1800, totalChars: 9000, fullStories: 3 } as const;
const MAX_FILES_SHOWN = 40;
const MAX_CONTRACTS_SHOWN = 30;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function defaultReadJson(path: string): unknown {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`);

interface StoryRead { readonly story: EpicBuiltStory; readonly builtAt: string; readonly approved: boolean }

function readStory(repoPath: string, epicHash: string, id: string, title: string, read: (p: string) => unknown, perStoryChars: number): StoryRead | undefined {
	const buildPath = artifactJsonPath(repoPath, buildArtifactId(epicHash, id));
	let build: unknown;
	try {
		build = read(buildPath);
	} catch (e) {
		return { builtAt: '', approved: false, story: { storyId: id, title, detail: 'full', buildPath, note: `BUILD record unreadable: ${e instanceof Error ? e.message : String(e)}` } };
	}
	if (build === undefined) return undefined;   // no BUILD record: not built yet
	if (!isObj(build)) return { builtAt: '', approved: false, story: { storyId: id, title, detail: 'full', buildPath, note: 'BUILD record unreadable: it is not a record object' } };
	if (approvalStateOf(build['meta']) !== 'approved') return undefined;   // not approved yet
	const meta = isObj(build['meta']) ? build['meta'] : {};
	const body = isObj(build['body']) ? build['body'] : {};
	const notes: string[] = [];

	const summary = typeof body['summary'] === 'string' ? body['summary'].trim() : '';
	if (summary.length === 0) notes.push('the BUILD summary is empty');
	const taskVerdicts = (Array.isArray(body['tasks']) ? body['tasks'] : [])
		.filter(isObj).map(t => ({ id: String(t['id'] ?? '?'), passed: t['passed'] === true }));
	const log_ = Array.isArray(body['changeLog']) ? body['changeLog'] : undefined;
	let changedFiles: string[] | undefined;
	if (log_ !== undefined) {
		changedFiles = [...new Set(log_.filter(isObj).map(c => (isObj(c['target']) ? c['target']['file'] : undefined)).filter((f): f is string => typeof f === 'string'))].sort();
	}
	if (changedFiles === undefined || changedFiles.length === 0) notes.push('the files this Story changed are not recorded');

	let testsPath: string | undefined;
	let testsResult: string | undefined;
	const testsRel = isObj(body['testRecord']) && typeof body['testRecord']['md'] === 'string' ? body['testRecord']['md'] : undefined;
	try {
		const tests = read(artifactJsonPath(repoPath, `TESTS-${epicHash}-${id}`));
		if (isObj(tests) && isObj(tests['body']) && Array.isArray(tests['body']['tasks'])) {
			const rows = tests['body']['tasks'].filter(isObj);
			const passed = rows.filter(r => r['testsPassed'] === true).length;
			testsResult = `${passed} of ${rows.length} task test run(s) passed`;
			testsPath = testsRel;
		} else notes.push(tests === undefined ? 'TESTS record missing' : 'TESTS record unreadable: it has no task list');
	} catch (e) {
		notes.push(`TESTS record unreadable: ${e instanceof Error ? e.message : String(e)}`);
	}

	let contractNames: string[] | undefined;
	try {
		const lld = read(artifactJsonPath(repoPath, lldArtifactId(epicHash, id)));
		if (isObj(lld) && isObj(lld['body']) && isObj(lld['body']['contractDetails'])) {
			const api = lld['body']['contractDetails']['api'];
			contractNames = (Array.isArray(api) ? api : []).filter(isObj).map(a => a['name']).filter((n): n is string => typeof n === 'string');
		}
	} catch (e) {
		notes.push(`LLD record unreadable: ${e instanceof Error ? e.message : String(e)}`);
	}

	const builtAt = [meta['updatedAt'], meta['createdAt']].find((v): v is string => typeof v === 'string') ?? '';
	return {
		builtAt, approved: true,
		story: {
			storyId: id, title, detail: 'full', buildPath, builtAt,
			...(summary.length > 0 ? { buildSummary: clip(summary, perStoryChars) } : {}),
			taskVerdicts,
			...(testsResult !== undefined ? { testsResult } : {}),
			...(testsPath !== undefined ? { testsPath } : {}),
			...(changedFiles !== undefined ? { changedFiles } : {}),
			...(contractNames !== undefined ? { contractNames } : {}),
			...(notes.length > 0 ? { note: notes.join('; ') } : {}),
		},
	};
}

/**
 * The digest for the Story `storyId` of the Epic `epicHash`, or null when there is nothing to analyse: a standalone Story (no Epic
 * Define), an Epic with no other Story, or no other Story with an approved BUILD. Never throws.
 */
export function buildEpicBuiltStateDigest(repoPath: string, epicHash: string, storyId: string, opts: EpicDigestOptions = {}): EpicBuiltStateDigest | null {
	try {
		const perStoryChars = opts.perStoryChars ?? DEFAULTS.perStoryChars;
		const fullStories = Math.max(0, opts.fullStories ?? DEFAULTS.fullStories);
		const read = opts.readJson ?? defaultReadJson;

		let stories: readonly { readonly id: string; readonly title: string }[];
		try {
			stories = readDefineArtifact(repoPath, epicHash).body.stories.map(s => ({ id: s.id, title: s.title }));
		} catch {
			return null;   // a standalone Story or an unreadable Define: the stage's own gates report the latter
		}

		if (stories[0]?.id === storyId) return null;   // the Epic's first Story has no earlier Story to analyse
		const read_ = stories.filter(s => s.id !== storyId)
			.map(s => readStory(repoPath, epicHash, s.id, s.title, read, perStoryChars))
			.filter((r): r is StoryRead => r !== undefined);
		if (!read_.some(r => r.approved)) return null;   // unreadable records are listed only beside at least one approved BUILD

		// the newest `fullStories` stay in full, the rest are lines; then the whole is fitted to the total cap (output in the Define's order)
		const newest = new Set([...read_].sort((a, b) => b.builtAt.localeCompare(a.builtAt) || b.story.storyId.localeCompare(a.story.storyId)).slice(0, fullStories).map(r => r.story.storyId));
		const shaped = read_.map(r => (newest.has(r.story.storyId) ? r.story : { ...r.story, detail: 'line' as const }));
		const totalChars = opts.totalChars ?? DEFAULTS.totalChars;
		const fitted = fit(storyId, epicHash, shaped, perStoryChars, totalChars);
		const reduced = fitted.stories.filter(x => x.detail === 'line').length + fitted.omitted;
		return { epicHash, forStory: storyId, stories: fitted.stories, caps: { perStoryChars, totalChars }, truncated: reduced > 0 ? { reducedStories: reduced, omittedStories: fitted.omitted } : null };
	} catch (e) {
		log.warn({ err: e instanceof Error ? e.message : String(e) }, 'the Epic built-state digest could not be built');
		return null;
	}
}

function fullLines(s: EpicBuiltStory, perStoryChars: number): string[] {
	const lines = [`### ${s.storyId} — ${s.title}`, `- BUILD record: \`${s.buildPath}\`${s.testsPath !== undefined ? `; test record: \`${s.testsPath}\`` : ''}`];
	if (s.taskVerdicts !== undefined && s.taskVerdicts.length > 0) lines.push(`- Tasks: ${s.taskVerdicts.map(t => `${t.id} ${t.passed ? 'passed' : 'FAILED'}`).join(', ')}`);
	if (s.testsResult !== undefined) lines.push(`- Tests: ${s.testsResult}`);
	if (s.changedFiles !== undefined && s.changedFiles.length > 0) {
		const shown = s.changedFiles.slice(0, MAX_FILES_SHOWN);
		lines.push(`- Changed files (${s.changedFiles.length}): ${shown.map(f => `\`${f}\``).join(', ')}${s.changedFiles.length > shown.length ? `, +${s.changedFiles.length - shown.length} more` : ''}`);
	}
	if (s.contractNames !== undefined && s.contractNames.length > 0) {
		const shown = s.contractNames.slice(0, MAX_CONTRACTS_SHOWN);
		lines.push(`- Contracts its LLD names: ${shown.map(n => `\`${n}\``).join(', ')}${s.contractNames.length > shown.length ? `, +${s.contractNames.length - shown.length} more` : ''}`);
	}
	if (s.buildSummary !== undefined) lines.push('- BUILD summary (including any deviations it discloses):', ...s.buildSummary.split('\n').map(l => `  > ${l}`));
	if (s.note !== undefined) lines.push(`- Not available: ${s.note}`);
	const text = lines.join('\n');
	return text.length <= perStoryChars ? lines : [clip(text, perStoryChars)];
}

function lineOf(s: EpicBuiltStory): string {
	const first = (s.buildSummary ?? '').split('\n')[0] ?? '';
	return `- ${s.storyId} — ${s.title}: ${first.length > 0 ? clip(first, 160) : 'no BUILD summary'} (records: \`${s.buildPath}\`)${s.note !== undefined ? ` — not available: ${s.note}` : ''}`;
}

interface Fitted { readonly stories: readonly EpicBuiltStory[]; readonly omitted: number; readonly text: string }

/** Reduces the oldest full Stories to lines, then leaves out the oldest lines, until the text fits `totalChars`. Output stays in the Define's order. */
function fit(forStory: string, epicHash: string, input: readonly EpicBuiltStory[], perStoryChars: number, totalChars: number, alreadyOmitted = 0): Fitted {
	const head = [`## Epic built-state digest (Epic ${epicHash}; for Story ${forStory})`, '', 'What this Epic\'s other Stories have already built, from their approved BUILD, TESTS and LLD records.', ''];
	const render = (stories: readonly EpicBuiltStory[], omitted: number): string => {
		const body: string[] = [];
		for (const s of stories) body.push(...(s.detail === 'full' ? fullLines(s, perStoryChars) : [lineOf(s)]), '');
		const lined = stories.filter(s => s.detail === 'line').length;
		const tail = lined > 0 || omitted > 0
			? [`(${lined} Stor${lined === 1 ? 'y' : 'ies'} shown as a line only${omitted > 0 ? `, ${omitted} more left out to stay within the size cap` : ''}; open their records for the rest.)`]
			: [];
		return [...head, ...body, ...tail].join('\n').trimEnd();
	};
	const oldestFirst = (list: readonly EpicBuiltStory[]): EpicBuiltStory[] =>
		[...list].sort((a, b) => (a.builtAt ?? '').localeCompare(b.builtAt ?? '') || a.storyId.localeCompare(b.storyId));

	let stories = [...input];
	let text = render(stories, alreadyOmitted);
	for (const old of oldestFirst(input)) {
		if (text.length <= totalChars) break;
		if (old.detail === 'full') { stories = stories.map(s => (s.storyId === old.storyId ? { ...s, detail: 'line' as const } : s)); text = render(stories, alreadyOmitted); }
	}
	let omitted = alreadyOmitted;
	for (const old of oldestFirst(input)) {
		if (text.length <= totalChars || stories.length <= 1) break;
		stories = stories.filter(s => s.storyId !== old.storyId); omitted++; text = render(stories, omitted);
	}
	return { stories, omitted, text: text.length <= totalChars ? text : totalChars < 1 ? '' : `${text.slice(0, totalChars - 1).trimEnd()}…` };
}

/** The block placed above the Story detail; one line for a null digest. Pure and deterministic; a cap given here narrows the digest further. */
export function renderEpicBuiltStateDigest(digest: EpicBuiltStateDigest | null, opts: Pick<EpicDigestOptions, 'perStoryChars' | 'totalChars'> = {}): string {
	if (digest === null) return EPIC_IMPACT_NOT_APPLICABLE;
	return fit(digest.forStory, digest.epicHash, digest.stories, Math.min(opts.perStoryChars ?? digest.caps.perStoryChars, digest.caps.perStoryChars), Math.min(opts.totalChars ?? digest.caps.totalChars, digest.caps.totalChars), digest.truncated?.omittedStories ?? 0).text;
}

/**
 * What the first step of design.story and plan adds for a Story: for a later Story of an Epic the instruction (`first`, to lead the
 * system prompt) and the rendered digest (`digest`, for the user turn above the Story detail or the LLD handoff); for a first or
 * standalone Story no instruction and the one-line "does not apply". One place, so both stages match.
 */
export function epicImpactPromptParts(repoPath: string, epicHash: string, storyId: string): { readonly first: string[]; readonly digest: string[] } {
	const digest = buildEpicBuiltStateDigest(repoPath, epicHash, storyId);
	return digest === null
		? { first: [], digest: [renderEpicBuiltStateDigest(null), ''] }
		: { first: [EPIC_IMPACT_FIRST_ACTION, ''], digest: [renderEpicBuiltStateDigest(digest), ''] };
}
