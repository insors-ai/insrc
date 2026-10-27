/** Stable diagnostics never echo model-generated IDs or answer text. */
export class ReviewCoverageError extends Error {
	constructor(readonly code: 'review-verdict-set-mismatch' | 'review-template-set-mismatch' | 'review-extraction-incomplete') { super(code); this.name = 'ReviewCoverageError'; }
}
export function assertExactReviewIds(expected: readonly string[], actual: readonly unknown[], code: ReviewCoverageError['code']): void {
	const wanted = new Set(expected);
	if (wanted.size !== expected.length || expected.some(id => typeof id !== 'string' || id.length === 0)
		|| actual.length !== expected.length || actual.some(id => typeof id !== 'string' || !wanted.has(id)) || new Set(actual).size !== actual.length) throw new ReviewCoverageError(code);
}
/** Validate a reply before normalization; completed and assigned sets must be disjoint.
 * Final aggregation must cover the full frozen extraction, including the genuine-empty case. */
export function validateVerdictCoverage<V extends { readonly claimId: string }>(input: {
	readonly expected: readonly string[]; readonly assigned: readonly string[];
	readonly completed: readonly V[]; readonly received: readonly V[] | undefined;
	readonly extractionComplete: boolean; readonly requireComplete?: boolean | undefined;
}): readonly V[] {
	const code = 'review-verdict-set-mismatch';
	if (!input.extractionComplete) throw new ReviewCoverageError('review-extraction-incomplete');
	assertExactReviewIds(input.expected, input.expected, code);
	const expected = new Set(input.expected);
	if (input.assigned.some(id => !expected.has(id)) || new Set(input.assigned).size !== input.assigned.length) throw new ReviewCoverageError(code);
	if (!Array.isArray(input.completed) || !Array.isArray(input.received)) throw new ReviewCoverageError(code);
	const completed = input.completed.map(v => v?.claimId);
	if (completed.some(id => typeof id !== 'string' || !expected.has(id) || input.assigned.includes(id)) || new Set(completed).size !== completed.length) throw new ReviewCoverageError(code);
	assertExactReviewIds(input.assigned, input.received.map(v => v?.claimId), code);
	const all = [...input.completed, ...input.received];
	if (input.requireComplete !== false) assertExactReviewIds(input.expected, all.map(v => v.claimId), code);
	const byId = new Map(all.map(v => [v.claimId, v]));
	return input.expected.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}
