import type { ReviewDimension } from './types.js';

/** Returns an error message if the finding is malformed, else null. */
export function validateFinding(f: unknown, dimension: ReviewDimension): string | null {
	if (typeof f !== 'object' || f === null) return `dimension '${dimension}' has a non-object finding.`;
	const o = f as Record<string, unknown>;
	if (o['severity'] !== 'HIGH' && o['severity'] !== 'MED' && o['severity'] !== 'LOW') {
		return `dimension '${dimension}' has a finding with severity '${String(o['severity'])}' (expected HIGH|MED|LOW).`;
	}
	if (typeof o['location'] !== 'string' || !/^.+:[1-9]\d*$/.test(o['location']) || o['location'].slice(0, o['location'].lastIndexOf(':')).trim().length === 0 || !Number.isSafeInteger(Number(o['location'].slice(o['location'].lastIndexOf(':') + 1)))) {
		return `dimension '${dimension}' has a finding whose location '${String(o['location'])}' is not a \`file:line\`.`;
	}
	if (typeof o['message'] !== 'string' || o['message'].length === 0) {
		return `dimension '${dimension}' has a finding with no message.`;
	}
	return null;
}

/** Extract the repo-relative file from a `file:line` location (mirrors the
 *  dimension modules' private `fileOf`). */
