/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synchronous git runner for the team module (Story s2).
 *
 * Runs `git` with an argv array (no shell) and never throws: a failure is a
 * value. The reader, the anchor finder and the starter all go through this so
 * a non-git directory, a missing git or a bad ref is an ordinary result.
 */

import { execFileSync } from 'node:child_process';

export type GitRun =
	| { readonly ok: true;  readonly stdout: string }
	| { readonly ok: false; readonly stderr: string };

export const POLICY_PATH = '.insrc/policy.json';

const LOCAL_GIT_TIMEOUT_MS = 5_000;

export function runGit(cwd: string, args: readonly string[], timeoutMs: number = LOCAL_GIT_TIMEOUT_MS): GitRun {
	try {
		const stdout = execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
		return { ok: true, stdout };
	} catch (err) {
		const e = err as { stderr?: Buffer | string | undefined; message?: string | undefined };
		return { ok: false, stderr: (e.stderr ? String(e.stderr) : e.message ?? 'git failed').trim() };
	}
}
