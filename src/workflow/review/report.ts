/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Markdown renderer for a `ReviewReport` — suitable both as a checked-in
 * doc and as a GitHub issue comment. Header line carries the verdict +
 * counts; the table lists findings HIGH-first.
 */

import type { Finding, ReviewReport, Severity } from './types.js';

const VERDICT_EMOJI: Record<ReviewReport['verdict'], string> = {
	pass:  '✅',
	warn:  '⚠️',
	block: '⛔',
};

const SEVERITY_RANK: Record<Severity, number> = { HIGH: 0, MED: 1, LOW: 2 };

/** Render a `ReviewReport` as GitHub-flavoured markdown. */
export function renderReviewReport(r: ReviewReport): string {
	const lines: string[] = [];

	lines.push(
		`### ${VERDICT_EMOJI[r.verdict]} Review \`${r.verdict.toUpperCase()}\` — ${r.artifact} (${r.stage})`,
	);
	lines.push('');
	lines.push(
		`**${r.counts.high} HIGH · ${r.counts.med} MED · ${r.counts.low} LOW** · `
		+ `model \`${r.model}\` · reviewed ${r.reviewedAt}`,
	);
	lines.push('');

	if (r.findings.length === 0) {
		lines.push('_No load-bearing premises were extracted._');
		return lines.join('\n');
	}

	const sorted = [...r.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

	lines.push('| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |');
	lines.push('| --- | --- | --- | --- | --- | --- | --- |');
	for (const f of sorted) {
		lines.push(
			'| ' + [
				cell(f.ref ?? f.claimId),
				cell(f.kind),
				cell(f.severity),
				cell(f.fixability),
				cell(f.premise),
				cell(f.evidence),
				cell(f.action),
			].join(' | ') + ' |',
		);
	}

	const withFixes = sorted.filter(hasProposedFix);
	if (withFixes.length > 0) {
		lines.push('');
		lines.push('#### Proposed fixes');
		for (const f of withFixes) {
			lines.push('');
			lines.push(`- **${f.ref ?? f.claimId}** (${f.fixability}) — ${cellInline(f.proposedFix!.rationale)}`);
			for (const edit of f.proposedFix!.artifactEdits ?? []) {
				lines.push(`  - edit: \`${cellInline(edit.find)}\` → \`${cellInline(edit.replace)}\``);
			}
			for (const opt of f.proposedFix!.options ?? []) {
				lines.push(`  - option: ${cellInline(opt)}`);
			}
		}
	}

	return lines.join('\n');
}

function hasProposedFix(f: Finding): boolean {
	const p = f.proposedFix;
	if (p === undefined) return false;
	return (p.artifactEdits?.length ?? 0) > 0 || (p.options?.length ?? 0) > 0;
}

/** Escape a value for a markdown table cell (pipes + newlines break tables). */
function cell(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Escape a value used inline (outside a table): only newlines matter. */
function cellInline(value: string): string {
	return value.replace(/\r?\n/g, ' ');
}
