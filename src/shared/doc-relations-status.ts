/**
 * The one line a repository's model-proposed document relationships are shown
 * with (Epic c2ba6fa6 s10), in the CLI repository pane. The editor plugins
 * render the same words from the same fields.
 */

import type { DocRelationsStatus } from './types.js';

const pct = (x: number): string => x.toFixed(2);

export function describeDocRelations(status: DocRelationsStatus): string {
	const f = status.figures;
	const figures = f === undefined ? '' : ` (P ${pct(f.precision)} / R ${pct(f.recall)} on ${f.checked} links)`;
	const head = status.switch === 'on' ? `document links: on${figures}`
		: status.switch === 'off' ? `document links: off${figures}`
		: 'document links: not-measured';
	const x = status.extraction;
	if (x?.state !== 'unavailable') return head;
	const why = x.reason !== undefined && x.reason !== '' ? x.reason : 'no reason recorded';
	return status.switch === 'on' ? `${head}; new documents not examined: ${why}` : `${head}; not extracted: ${why}`;
}
