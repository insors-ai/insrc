/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Create-only publication (Story s2): write the content to a unique temporary file in the
 * destination's directory and hard-link it to the destination. A hard link to an existing
 * name fails, so an existing file (committed or not, valid or damaged) is never overwritten.
 */

import { randomBytes } from 'node:crypto';
import { linkSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Returns 'exists' when the destination is already there; throws on any other failure. */
export function publishCreateOnly(dest: string, content: string): 'created' | 'exists' {
	const dir = dirname(dest);
	mkdirSync(dir, { recursive: true });
	const tmp = join(dir, `.${basename(dest)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
	writeFileSync(tmp, content, { flag: 'wx' });
	try {
		linkSync(tmp, dest);
		return 'created';
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
		throw err;
	} finally {
		try { unlinkSync(tmp); } catch { /* best effort */ }
	}
}
