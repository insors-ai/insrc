/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The BUILD approval check of ISSUE-1b3caadf04023d33 (LLD s1): a later Story whose approved LLD carries an Epic impact analysis that
 * applies must have a BUILD summary that opens a paragraph with the label "Epic impact:" and names each Story the analysis covered.
 * A pure read. It checks that the paragraph is there, long enough to say something and names the Stories; it does not judge the
 * paragraph's quality. A record that cannot be read makes the check not apply (and is logged), so approval is never blocked by
 * a read failure. An explicit overrideReview passes it (applied by the caller).
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { ArtifactIds } from './artifact-ids.js';
import { approvalStateOf } from './artifact-core/approval-view.js';
import { isEpicImpactAnalysis } from './artifacts/epic-impact.js';
import { EPIC_IMPACT_LABEL } from './epic-built-state.js';
import { artifactJsonPath, lldArtifactId } from './storage.js';

const log = getLogger('workflow:epic-impact-build-check');

/** The shortest labelled paragraph that counts (characters, label included): enough to say something beyond the label and the ids. */
export const EPIC_IMPACT_MIN_PARAGRAPH_CHARS = 80;

export type BuildEpicImpactCheck =
	| { readonly applies: false }
	| { readonly applies: true; readonly ok: true }
	| { readonly applies: true; readonly ok: false; readonly reason: string };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `id` as a whole token: not part of a longer identifier (s1 is not found in s10 or s1a). */
const namesStory = (text: string, id: string): boolean => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(id)}(?![A-Za-z0-9_-])`).test(text);

function readJson(path: string): unknown {
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : undefined;
}

export function checkBuildEpicImpact(repoPath: string, buildJsonPath: string): BuildEpicImpactCheck {
	try {
		const key = ArtifactIds.parse(basename(buildJsonPath).replace(/\.json$/, ''));
		if (key?.kind !== 'BUILD' || key.story === undefined) return { applies: false };
		const lld = readJson(artifactJsonPath(repoPath, lldArtifactId(key.epicHash, key.story))) as { meta?: unknown; body?: { epicImpact?: unknown } } | undefined;
		if (lld === undefined || approvalStateOf(lld.meta) !== 'approved') return { applies: false };
		const analysis = lld.body?.epicImpact;
		if (!isEpicImpactAnalysis(analysis) || !analysis.applies) return { applies: false };

		const build = readJson(buildJsonPath) as { body?: { summary?: unknown } } | undefined;
		const summary = typeof build?.body?.summary === 'string' ? build.body.summary : '';
		const paragraph = summary.split(/\n\s*\n/).map(p => p.trim()).find(p => p.startsWith(EPIC_IMPACT_LABEL));
		const how = `Open the BUILD summary (the last insrc_build_step validate call's \`summary\`) with a paragraph that starts with "${EPIC_IMPACT_LABEL}", is at least ${EPIC_IMPACT_MIN_PARAGRAPH_CHARS} characters, and names each Story the LLD's Epic impact analysis covered (${analysis.storiesCovered.join(', ')}); then approve again. An explicit overrideReview passes this check.`;
		if (paragraph === undefined) return { applies: true, ok: false, reason: `The BUILD summary has no "${EPIC_IMPACT_LABEL}" paragraph. ${how}` };
		if (paragraph.length < EPIC_IMPACT_MIN_PARAGRAPH_CHARS) return { applies: true, ok: false, reason: `The "${EPIC_IMPACT_LABEL}" paragraph is ${paragraph.length} characters, under the ${EPIC_IMPACT_MIN_PARAGRAPH_CHARS} minimum. ${how}` };
		const missing = analysis.storiesCovered.filter(id => !namesStory(paragraph, id));
		if (missing.length > 0) return { applies: true, ok: false, reason: `The "${EPIC_IMPACT_LABEL}" paragraph does not name ${missing.join(', ')}. ${how}` };
		return { applies: true, ok: true };
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err), buildJsonPath }, 'the Epic impact BUILD check could not read a record; it does not apply');
		return { applies: false };
	}
}
