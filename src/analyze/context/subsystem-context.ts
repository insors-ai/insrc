/**
 * The subsystem block of the analyzer's context (Epic c2ba6fa6, Story s8).
 *
 * Written by code from the stored subsystems, never by a model, and added to
 * the bundle as it is served -- after any cache read or write -- so the cache
 * never holds it and a subsystem pass that completes after a bundle was cached
 * shows on the next request. The subsystems shown are those holding a code
 * file under the request's scope path, or a file the bundle cites (path or
 * path:line): only a file with a stored subsystem row selects one, so other
 * text that looks like a path selects nothing. Each is shown with its summary,
 * its connections (by subsystem name, with weight and kinds) and its member
 * files, followed by the note when the groups rest on an incomplete or older
 * graph. A scope of the whole repository lists every subsystem by name and
 * summary only, with the full block kept for the subsystems of cited files, so
 * the block never lists every file of the repository.
 *
 * The block only adds to the bundle: when the stored subsystems cannot be
 * read, the failure is logged and the bundle is served without it.
 */

import { isAbsolute, relative } from 'node:path';

import { readSubsystems, subsystemsAnswer, type SubsystemView } from '../../db/subsystems.js';
import { getLogger } from '../../shared/logger.js';
import type { AnalyzeContextBundle } from './types.js';

const log = getLogger('analyze:context:subsystems');

/**
 * A path, path:line or path#L10 as a bundle cites files -- with or without a
 * directory, and at the end of a sentence. Only a file with a stored row
 * selects a subsystem, so a match that is not a file costs one lookup.
 */
const PATH_LIKE = /[\w@.-]*(?:\/[\w@.-]+)*\.[A-Za-z0-9]+(?=[:)\],.;!?#\s`'"]|$)/g;

function citedFiles(bundle: AnalyzeContextBundle, repoPath: string): string[] {
	const text = [bundle.summary, bundle.structure, bundle.surface, bundle.artefacts, bundle.upstream].join('\n');
	const out = new Set<string>();
	for (const m of text.matchAll(PATH_LIKE)) {
		const p = m[0];
		out.add(isAbsolute(p) ? relative(repoPath, p) : p);
	}
	return [...out];
}

function render(
	subs:    readonly SubsystemView[],
	nameOf:  ReadonlyMap<string, string>,
	note:    string | undefined,
	compact: ReadonlySet<string>,
): string {
	const blocks = subs.map(s => {
		if (compact.has(s.id)) return [`#### Subsystem ${s.name}`, '', s.summary ?? '(no summary yet)', '', `Files: ${s.files.length} (not listed)`].join('\n');
		const conns = s.connections.length === 0 ? '  - (no connections to other subsystems)'
			: s.connections.map(c => `  - ${nameOf.get(c.to) ?? c.to} (weight ${c.weight}; ${Object.entries(c.kinds).map(([k, n]) => `${k} ${n}`).join(', ')})`).join('\n');
		return [
			`#### Subsystem ${s.name}`,
			'',
			s.summary ?? '(no summary yet)',
			'',
			'Connections:',
			conns,
			'',
			`Files (${s.files.length}):`,
			...s.files.map(f => `  - ${f}`),
		].join('\n');
	});
	return ['### Subsystems', '', ...blocks.flatMap(b => [b, '']), ...(note !== undefined ? [`_Note: ${note}._`] : [])].join('\n').trimEnd();
}

/**
 * The bundle with the subsystems of its scope and of the files it cites
 * appended to its structure layer; the bundle as it was when there is no
 * repository, no stored subsystem, or none it touches.
 */
export async function withSubsystemContext(
	bundle:    AnalyzeContextBundle,
	repoPath:  string | null | undefined,
	scopePath: string | undefined,
): Promise<AnalyzeContextBundle> {
	if (repoPath === null || repoPath === undefined) return bundle;
	try {
		return await addSubsystems(bundle, repoPath, scopePath);
	} catch (err) {
		log.warn({ err, repoPath }, 'the stored subsystems could not be read; the bundle is served without them');
		return bundle;
	}
}

async function addSubsystems(bundle: AnalyzeContextBundle, repoPath: string, scopePath: string | undefined): Promise<AnalyzeContextBundle> {
	const answer = await subsystemsAnswer(repoPath);
	if ('error' in answer || answer.subsystems.length === 0) return bundle;

	const selected = new Map<string, SubsystemView>();
	const cited = citedFiles(bundle, repoPath);
	const citedIds = new Set<string>();
	if (cited.length > 0) for (const s of (await readSubsystems(repoPath, { files: cited })).subsystems) { selected.set(s.id, s); citedIds.add(s.id); }
	const compact = new Set<string>();
	if (scopePath !== undefined) {
		const scope = (isAbsolute(scopePath) ? relative(repoPath, scopePath) : scopePath).replace(/\/+$/, '');
		const whole = scope === '' || scope === '.';
		for (const s of answer.subsystems) {
			if (whole) {
				if (!citedIds.has(s.id)) { selected.set(s.id, s); compact.add(s.id); }
			} else if (s.files.some(f => f === scope || f.startsWith(`${scope}/`))) {
				selected.set(s.id, s);
			}
		}
	}
	if (selected.size === 0) return bundle;

	const nameOf = new Map(answer.subsystems.map(s => [s.id, s.name]));
	const ordered = [...selected.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
	const block = render(ordered, nameOf, answer.note, compact);
	const structure = bundle.structure.trim() === '' ? block : `${bundle.structure}\n\n${block}`;
	return {
		...bundle,
		structure,
		...(bundle.meta !== undefined && { meta: { ...bundle.meta, emptyLayers: bundle.meta.emptyLayers.filter(l => l !== 'structure') } }),
	};
}
