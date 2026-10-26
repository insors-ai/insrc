/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A stand-in git on PATH for the cancellation tests (not a test file). POSIX only. */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp } from '../../../__tests__/_proc.js';

export interface StandIn { dir: string; log: string; calls(): string[]; restore(): void }

/** Put a git script first on PATH. The script body runs for every git call; each call is logged first. */
export function installStandInGit(body: string): StandIn {
	const dir = tmp();
	const log = join(dir, 'calls.log');
	writeFileSync(join(dir, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\n${body}\n`);
	chmodSync(join(dir, 'git'), 0o755);
	const old = process.env['PATH'];
	process.env['PATH'] = `${dir}:${old}`;
	return {
		dir, log,
		calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
		restore: () => { process.env['PATH'] = old; },
	};
}
