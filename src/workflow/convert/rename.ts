/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one id rename the common model allows (k2): a story stored in the uppercase form (`S001`) becomes `s1`, in the file
 * names of the heads and in every reference that can be rewritten, with no alias left behind.
 *
 * What is rewritten: a head file `<KIND>-<hash>-S001.json` is renamed; inside a head (and in the rendered markdown under
 * `docs/epics` and `docs/standalone`) a string that is exactly `S001` becomes `s1`, and every full artifact id
 * (`LLD-<hash>-S001`) becomes `LLD-<hash>-s1`, wherever it stands. What is left: folder names under `docs/epics` keep their
 * names (k7), and a bare `S001` inside a sentence is a reference to a story that the planner lists in the report.
 *
 * Every step tests the stored text, so a rerun after a crash finds either the work still to do or nothing.
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { ARTIFACTS_DIR, writeAtomic } from '../storage.js';
import type { PlanRule, RulePlan } from './plan.js';
import type { ConversionChange, ConversionProblem, ProseReference } from './types.js';

const KINDS = 'DEF|HLD|LLD|PLAN|BUILD|CR|TESTS|ISSUE|SPEC|EXT|AMD';
const STEM = new RegExp(`\\b((?:${KINDS})-[0-9a-f]{16})-[Ss](\\d+)\\b`, 'g');
const HEAD_STEM = new RegExp(`^((?:${KINDS})-[0-9a-f]{16})-[Ss](\\d+)$`);
const STORY_EXACT = /^[Ss](\d+)$/;
const BARE = /\bS\d{3,}\b/g;
/** Folders of the epics' documents keep their names, so a story id between slashes is a correct reference. */
const IN_A_PATH = (s: string, at: number, len: number): boolean => s[at - 1] === '/' || s[at + len] === '/';

/** `S001` becomes `s1`, and so does a lowercase `s001` (a story id with leading zeros is not canonical either); `s1` is already right. */
export const newStoryId = (digits: string): string => `s${Number(digits)}`;

/** A string with the rewritable references replaced: an exact story id, or any full artifact id with an uppercase story. */
export function rewriteString(s: string): string {
	const exact = STORY_EXACT.exec(s);
	if (exact !== null) return newStoryId(exact[1]!);
	return s.replace(STEM, (_m, base: string, n: string) => `${base}-${newStoryId(n)}`);
}

/** The value with every string rewritten (keys are never ids). */
export function rewriteValue(v: unknown): unknown {
	if (typeof v === 'string') return rewriteString(v);
	if (Array.isArray(v)) return v.map(rewriteValue);
	if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, rewriteValue(x)]));
	return v;
}

/** The bare story ids that stand inside a longer string and so cannot be rewritten (a path component is not one). */
function proseTokens(v: unknown, into: Set<string>): void {
	if (typeof v === 'string') {
		const rewritten = rewriteString(v);
		if (STORY_EXACT.test(v)) return;
		for (const m of rewritten.matchAll(BARE)) if (!IN_A_PATH(rewritten, m.index ?? 0, m[0].length)) into.add(m[0]);
	} else if (Array.isArray(v)) for (const x of v) proseTokens(x, into);
	else if (typeof v === 'object' && v !== null) for (const x of Object.values(v as Record<string, unknown>)) proseTokens(x, into);
}

/** Every `.md` file under the documents of the epics and the standalone designs, as repo-relative paths. */
function markdownFiles(repo: string): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) walk(p);
			else if (name.endsWith('.md')) out.push(relative(repo, p));
		}
	};
	for (const root of ['docs/epics', 'docs/standalone']) if (existsSync(join(repo, root))) walk(join(repo, root));
	return out;
}

const jsonPath = (id: string): string => `${ARTIFACTS_DIR}/${id}.json`;
const newStemOf = (stem: string): string | undefined => {
	const m = HEAD_STEM.exec(stem);
	if (m === null) return undefined;
	const to = `${m[1]}-${newStoryId(m[2]!)}`;
	return to === stem ? undefined : to;
};

/** The plan rule: the renames, the files that need rewriting, the collisions and the prose references. */
export const renameRule: PlanRule = (ctx): RulePlan => {
	const changes: ConversionChange[] = [];
	const problems: ConversionProblem[] = [];
	const prose: ProseReference[] = [];
	const existing = new Set(ctx.heads.map(h => h.artifactId));
	const renames: { from: string; to: string }[] = [];
	const targets = new Map<string, string>();

	for (const head of ctx.heads) {
		const to = newStemOf(head.artifactId);
		const rewritten = JSON.stringify(rewriteValue(head.json));
		const changesContent = rewritten !== JSON.stringify(head.json);
		if (to !== undefined) {
			if (ArtifactIds.parse(to) === undefined) { problems.push({ file: jsonPath(head.artifactId), reason: `${to} is not an artifact id the model accepts` }); continue; }
			const taken = targets.get(to);
			if (taken !== undefined) { problems.push({ file: jsonPath(head.artifactId), reason: `${head.artifactId} and ${taken} would both be renamed to ${to}` }); continue; }
			targets.set(to, head.artifactId);
			if (existing.has(to)) {
				// the twin a crashed rerun leaves: the new file already holds the rewritten text, only the old one has to go
				const twin = ctx.heads.find(h => h.artifactId === to);
				if (twin !== undefined && JSON.stringify(twin.json) !== rewritten) { problems.push({ file: jsonPath(to), reason: `${to} already exists and differs from the renamed ${head.artifactId}` }); continue; }
			}
			renames.push({ from: head.artifactId, to });
			changes.push({ rule: 'rename-id', artifactId: head.artifactId, detail: `rename to ${to}` });
		} else if (changesContent) {
			changes.push({ rule: 'rename-id', artifactId: head.artifactId, detail: 'rewrite the story ids it refers to' });
		}
		const tokens = new Set<string>();
		proseTokens(head.json, tokens);
		for (const oldId of [...tokens].sort()) prose.push({ file: jsonPath(head.artifactId), oldId });
	}
	for (const file of markdownFiles(ctx.repo)) {
		const text = readFileSync(join(ctx.repo, file), 'utf8');
		if (text.replace(STEM, (_m, b: string, n: string) => `${b}-${newStoryId(n)}`) !== text) changes.push({ rule: 'rename-id', artifactId: file, detail: 'rewrite the artifact ids it refers to' });
	}
	return { changes, renames, problems, proseReferences: prose };
};

export interface RenameResult {
	/** Head files renamed by this call. */
	readonly renamed:   number;
	/** Files (heads and markdown) whose text was rewritten by this call. */
	readonly rewritten: number;
}

/**
 * Applies the renames and rewrites the references, by what is stored: each old head is written under its new name with its
 * references rewritten and then removed, every other head and markdown file is rewritten when it still holds a reference.
 * Throws when a target name is taken by a different file (no rename is then applied).
 */
export function applyRenames(repo: string): RenameResult {
	const dir = join(repo, ARTIFACTS_DIR);
	const names = existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.json')).sort() : [];
	const todo = names.map(n => ({ name: n, to: newStemOf(n.slice(0, -'.json'.length)) })).filter(x => x.to !== undefined);
	// check every target before the first write: a collision applies nothing
	for (const { name, to } of todo) {
		const target = join(dir, `${to}.json`);
		if (existsSync(target)) {
			const rewritten = JSON.stringify(rewriteValue(JSON.parse(readFileSync(join(dir, name), 'utf8'))), null, 2) + '\n';
			if (readFileSync(target, 'utf8') !== rewritten) throw new Error(`${to}.json already exists and differs from the renamed ${name}`);
		}
	}
	let renamed = 0;
	let rewrittenFiles = 0;
	for (const { name, to } of todo) {
		const rewritten = JSON.stringify(rewriteValue(JSON.parse(readFileSync(join(dir, name), 'utf8'))), null, 2) + '\n';
		const target = join(dir, `${to}.json`);
		if (!existsSync(target)) { writeAtomic(target, rewritten); rewrittenFiles += 1; }
		unlinkSync(join(dir, name));
		renamed += 1;
	}
	for (const name of existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.json')).sort() : []) {
		const path = join(dir, name);
		const text = readFileSync(path, 'utf8');
		let json: unknown;
		try { json = JSON.parse(text); } catch { continue; }
		const next = JSON.stringify(rewriteValue(json), null, 2) + '\n';
		if (next !== text && JSON.stringify(rewriteValue(json)) !== JSON.stringify(json)) { writeAtomic(path, next); rewrittenFiles += 1; }
	}
	for (const file of markdownFiles(repo)) {
		const path = join(repo, file);
		const text = readFileSync(path, 'utf8');
		const next = text.replace(STEM, (_m, b: string, n: string) => `${b}-${newStoryId(n)}`);
		if (next !== text) { writeAtomic(path, next); rewrittenFiles += 1; }
	}
	return { renamed, rewritten: rewrittenFiles };
}
