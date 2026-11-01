export const REVIEW_SECTION = '<!-- insrc:review -->';

/** Strip a previously-appended review section so re-runs don't stack. */
export function stripReviewSection(md: string): string {
	const i = md.indexOf('\n' + REVIEW_SECTION);
	return i === -1 ? md : md.slice(0, i).replace(/\s+$/, '') + '\n';
}
