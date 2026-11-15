/**
 * The analyzer's documents state no fixed result limit or content cut
 * (LLD-b9d5c5c40df5a574-s4, task t14).
 *
 * Reads the four documents the Story names and looks for the constants and the
 * parameter names that were removed. A name that belongs to another caller
 * (a time limit, a review's size limit) is not one of these.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = ['design/analyze-context-builder.md', 'design/analyze-plan-builder.md', 'site/analyze.html', 'docs/daemon.md'];

/** The removed constants and parameters, by the name each was known by. */
const REMOVED: readonly RegExp[] = [
	/\btopK\b/, /\bmaxSources\b/, /\bpreviewChars\b/, /\bmaxConstraintSources\b/,
	/\bMAX_LIMIT\b/, /\bMAX_LINE_CHARS\b/, /\bMAX_FILE_BYTES\b/, /\bRG_MAX_OUTPUT_BYTES\b/,
	/\bSECTION_BODY_CHARS\b/, /\bENTRYPOINT_SCAN_CHARS\b/, /\bSUMMARISER_BODY_CHARS\b/,
	/\bFILE_LIST_LIMIT\b/, /\bDEFAULT_FILE_CAP\b/, /\bSAMPLE_CAP_PER_FAMILY\b/, /\bTOP_SUBJECTS\b/,
	/\bPROJECT_CONTEXT_LIMIT\b/, /\bKV_SUMMARY_(FIELDS|KEYS)\b/, /\bMAX_(TARGETS|FIELDS|TOP_CALLERS|REPR_SUBCLASSES|BASE_CLASS_IDIOMS)\b/,
	/\bDEFAULT_TOP_K\b/, /\bMAX_TOP_K\b/,
	// A result count or a cut the analyzer used to state.
	/limit of \d+ (hits|files|tables|sections|symbols|callers|matches)/i,
	/stops at \d+ (hits|files|tables|sections|symbols|callers|matches)/i,
	/first \d[\d,]* characters/i,
];

test('the four named documents contain no analyzer limit constant or parameter name', () => {
	for (const doc of DOCS) {
		const text = readFileSync(join(process.cwd(), doc), 'utf8');
		for (const rx of REMOVED) {
			const m = rx.exec(text);
			assert.equal(m, null, `${doc} names ${rx}: "${m?.[0]}"`);
		}
	}
});
