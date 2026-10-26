/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A stand-in executable first on PATH, shared by the spawn tests (not a test file). POSIX only. */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolDeps } from '../types.js';
import { tmp } from './_proc.js';

export interface StandInBin { dir: string; calls(): string[]; restore(): void }

export function installStandInBin(name: string, body: string): StandInBin {
	const dir = tmp();
	const log = join(dir, 'calls.log');
	writeFileSync(join(dir, name), `#!/bin/sh\necho "$*" >> '${log}'\n${body}\n`);
	chmodSync(join(dir, name), 0o755);
	const old = process.env['PATH'];
	process.env['PATH'] = `${dir}:${old}`;
	return {
		dir,
		calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
		restore: () => { process.env['PATH'] = old; },
	};
}

/** PATH with no kubectl, ssh, aws: a spawn of the named command fails with ENOENT. */
export function withEmptyPath(): () => void {
	const old = process.env['PATH'];
	process.env['PATH'] = tmp();
	return () => { process.env['PATH'] = old; };
}

export function toolDeps(frames: unknown[], signal?: AbortSignal): ToolDeps {
	return { sessionId: 's', repoPath: '/tmp', requestId: 9, send: (f: unknown) => { frames.push(f); }, ...(signal ? { signal } : {}) } as ToolDeps;
}
export const messages = (frames: unknown[]): string[] => frames.map(f => (f as { data: { message: string } }).data.message);
