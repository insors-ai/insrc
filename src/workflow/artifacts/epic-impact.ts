/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Epic impact analysis a later Story's LLD and PLAN carry (ISSUE-1b3caadf04023d33, LLD s1): what the Epic's already-built
 * Stories changed, set against the Story at hand. It is the controller's analysis, recorded verbatim from the first step of
 * design.story and plan; the BUILD check reads `storiesCovered` from the LLD's copy.
 *
 * An absent field means the artifact predates the analysis (rendered and validated exactly as before). `applies: false`
 * is the recorded answer for a first or standalone Story.
 */

/** Authored by the controller at the first step of design.story and plan; carried verbatim into the LLD and the PLAN. */
export interface EpicImpactAnalysis {
	/** false for a first or standalone Story (nothing built yet to analyse); then `reason` says why. */
	readonly applies:        boolean;
	readonly reason?:        string | undefined;
	/** The ids of the Epic's other Stories the analysis covered; the BUILD summary's paragraph must name each. */
	readonly storiesCovered: readonly string[];
	/** The analysis itself: what those Stories built that this Story touches, contradicts, reuses or must keep working. */
	readonly findings:       string;
	/** What was read to produce it (record paths, commits, files), so a reviewer can follow it. */
	readonly sources:        readonly string[];
}

/** The Markdown lines of the 'Epic impact analysis' section; the section is omitted when the field is absent. */
export function epicImpactBodyLines(analysis: EpicImpactAnalysis): string[] {
	if (!analysis.applies) {
		const why = analysis.reason?.trim() ?? '';
		return [`**Does not apply**${why.length > 0 ? `: ${why}` : '.'}`];
	}
	const lines: string[] = [`**Stories covered:** ${analysis.storiesCovered.map(s => `\`${s}\``).join(', ')}`, '', analysis.findings.trim()];
	if (analysis.sources.length > 0) lines.push('', '**Sources:**', ...analysis.sources.map(s => `- ${s}`));
	return lines;
}

/** Shape guard for a stored or carried analysis (used when reading artifacts back). */
export function isEpicImpactAnalysis(v: unknown): v is EpicImpactAnalysis {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	return typeof r['applies'] === 'boolean'
		&& Array.isArray(r['storiesCovered']) && r['storiesCovered'].every(s => typeof s === 'string')
		&& typeof r['findings'] === 'string'
		&& Array.isArray(r['sources']) && r['sources'].every(s => typeof s === 'string')
		&& (r['reason'] === undefined || typeof r['reason'] === 'string');
}

/**
 * Why a later Story's carried analysis is not acceptable, or undefined when it is. A Story with a non-null digest (an Epic with an
 * earlier built Story) must carry an analysis that applies, names the Stories it covered, has findings and cites what it read; a
 * Story with no digest may carry none, or one that says it does not apply. design.story and plan reject a synthesize with the reason.
 */
export function epicImpactProblem(digestPresent: boolean, analysis: EpicImpactAnalysis | undefined): string | undefined {
	if (!digestPresent) return undefined;
	if (analysis === undefined) return 'the Epic has already-built Stories, so the Epic impact analysis (epicImpact) is required and is missing';
	if (!analysis.applies) return 'the Epic has already-built Stories, so the analysis must apply (applies: true), not say it does not';
	if (analysis.storiesCovered.length === 0) return 'the Epic impact analysis names no Story it covered (storiesCovered is empty)';
	if (analysis.findings.trim().length === 0) return 'the Epic impact analysis has no findings';
	if (analysis.sources.length === 0) return 'the Epic impact analysis cites no source it read (sources is empty)';
	return undefined;
}
