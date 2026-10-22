/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where the daemon update gets its code from: the git remote URL and branch named by `daemonUpdate.repoUrl` and
 * `daemonUpdate.branch` in `~/.insrc/config.json`. Both are optional; an empty string or an absent key means "keep the checkout
 * as it is". The values are checked here, once, because they end up as arguments of git commands run by the update.
 */

import { existsSync, readFileSync } from 'node:fs';

import { PATHS } from './paths.js';

export interface UpdateSource {
	readonly repoUrl?: string | undefined;
	readonly branch?:  string | undefined;
}

/** The config holds a value the update cannot safely use, or cannot be read. */
export class UpdateSourceError extends Error {
	constructor(message: string) { super(message); this.name = 'UpdateSourceError'; }
}

const URL_FORMS = [
	/^(?:https?|ssh|git|file):\/\/\S+$/,
	/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:\S+$/,   // scp-style: git@host:owner/repo.git
	/^\/\S+$/,                                   // an absolute local path
];
const BRANCH_FORM = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function checkUrl(url: string): string {
	if (url.startsWith('-')) throw new UpdateSourceError('daemonUpdate.repoUrl must not start with "-"');
	if (/[\s\u0000-\u001f\u007f]/.test(url)) throw new UpdateSourceError('daemonUpdate.repoUrl must not contain whitespace or control characters');
	if (!URL_FORMS.some(re => re.test(url))) throw new UpdateSourceError('daemonUpdate.repoUrl must be an https, ssh, git or file URL, an scp-style git@host:path, or an absolute path');
	return url;
}

function checkBranch(branch: string): string {
	if (!BRANCH_FORM.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.lock') || branch.endsWith('.')) {
		throw new UpdateSourceError(`daemonUpdate.branch "${branch}" is not a branch name the update accepts`);
	}
	return branch;
}

/** The configured update source: only the keys that are set, each checked. An absent file or empty keys give `{}`. */
export function readUpdateSource(configPath: string = PATHS.config): UpdateSource {
	if (!existsSync(configPath)) return {};
	let parsed: unknown;
	try { parsed = JSON.parse(readFileSync(configPath, 'utf-8')); }
	catch (err) { throw new UpdateSourceError(`${configPath} cannot be read as JSON (${(err as Error).message})`); }
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new UpdateSourceError(`${configPath} is not a JSON object`);
	const section = (parsed as Record<string, unknown>)['daemonUpdate'];
	if (section === undefined) return {};
	if (typeof section !== 'object' || section === null || Array.isArray(section)) throw new UpdateSourceError('daemonUpdate must be an object');
	const { repoUrl, branch } = section as Record<string, unknown>;
	for (const [key, value] of [['repoUrl', repoUrl], ['branch', branch]] as const) {
		if (value !== undefined && typeof value !== 'string') throw new UpdateSourceError(`daemonUpdate.${key} must be a string`);
	}
	const url = typeof repoUrl === 'string' ? repoUrl.trim() : '';
	const br = typeof branch === 'string' ? branch.trim() : '';
	return {
		...(url.length > 0 ? { repoUrl: checkUrl(url) } : {}),
		...(br.length > 0 ? { branch: checkBranch(br) } : {}),
	};
}

/** The command-line flags that hand an update source to daemon-ctl.sh. */
export function updateSourceArgs(source: UpdateSource): string[] {
	return [
		...(source.repoUrl !== undefined ? ['--repo-url', source.repoUrl] : []),
		...(source.branch !== undefined ? ['--branch', source.branch] : []),
	];
}
