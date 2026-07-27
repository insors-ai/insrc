/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure presentation helpers for the Repos-pane tracker-setup modal.
 *
 * Presentation-only (no ink import) so it unit-tests without rendering: the
 * ReposPane 'tracker' modal maps each TrackerSetupStep through
 * `trackerStatusGlyph` for its glyph/colour and prints `trackerReportSummary`
 * as the footer. The engine + report shapes are reused verbatim from
 * src/workflow/tracker/setup.ts.
 */

import type { TrackerSetupReport, TrackerSetupStatus } from '../../workflow/tracker/setup.js';

/** Glyph + ink colour for a step status. Exhaustive over the closed
 *  TrackerSetupStatus union — a new member is a compile error (never arm),
 *  not a silent blank glyph. */
export function trackerStatusGlyph(status: TrackerSetupStatus): { readonly glyph: string; readonly color: string } {
	switch (status) {
		case 'done':    return { glyph: '✓', color: 'green' };
		case 'already': return { glyph: '✓', color: 'green' };
		case 'manual':  return { glyph: '!', color: 'yellow' };
		case 'skipped': return { glyph: '∘', color: 'gray' };
		case 'failed':  return { glyph: '✗', color: 'red' };
		default: {
			const _exhaustive: never = status;
			void _exhaustive;
			return { glyph: '?', color: 'gray' };
		}
	}
}

/** One-line footer for the modal. 'all set' only when NOTHING needs the user —
 *  no manual steps AND no failures; otherwise it names what's outstanding. */
export function trackerReportSummary(report: TrackerSetupReport): string {
	const manual = report.manualRemaining;
	const failed = report.steps.filter(s => s.status === 'failed').length;
	if (manual === 0 && failed === 0) return 'all set — press any key to dismiss';
	const parts: string[] = [];
	if (manual > 0) parts.push(`${manual} step${manual === 1 ? '' : 's'} need manual action`);
	if (failed > 0) parts.push(`${failed} failed`);
	return `${parts.join(' · ')} — resolve the commands above, then press any key`;
}
