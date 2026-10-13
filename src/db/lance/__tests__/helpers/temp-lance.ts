/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * For a test file that reaches the vector store through code that takes no
 * path: point the vector store at a temporary directory for the whole file,
 * and remove it after. The vector store at the default path belongs to the
 * daemon alone (Epic c2ba6fa6, Story s11). Call once, at the top level of the
 * test file, after its imports.
 */

import { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../../conn.js';

export function useTemporaryLance(): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-test-lance-'));
	setLanceConnPath(join(dir, 'lance'));
	after(async () => {
		await closeLanceConn();
		rmSync(dir, { recursive: true, force: true });
	});
	return dir;
}
