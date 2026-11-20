/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The commands a project states for the build gate (LLD-787434000fa22691-s1, task t5): the
 * `typecheckCommand`, `testCommand` and `resultFormat` keys of the repository's own entry in
 * `~/.insrc/github.json`, the daemon's per-registered-repository settings store (edited through
 * `repo.settings.set`, rows in src/config/repo-fields.ts). There is no global layer: a repository
 * that sets none of them gets its project type's default.
 *
 * This module only reads the raw values. An absent key is "not set"; a key that is present, empty
 * included, is a value, and what makes the values valid is decided once, where the command profile
 * is built (validation-checks.ts).
 */

import { githubConfigPath } from '../../../workflow/config/github.js';
import { readRepoEntry } from '../../../workflow/config/github-store.js';

/** The raw values of the setting: a key that is not set is absent; a value that is not a string is kept as read. */
export interface BuildCommandSetting {
	readonly typecheckCommand?: unknown;
	readonly testCommand?:      unknown;
	readonly resultFormat?:     unknown;
}

/** The file holding the settings could not be read, so what a repository states cannot be told. */
export class BuildSettingUnreadable extends Error {
	constructor(message: string) { super(message); this.name = 'BuildSettingUnreadable'; }
}

const KEYS = ['typecheckCommand', 'testCommand', 'resultFormat'] as const;

/**
 * The setting of the registered repository at `repoPath`: the keys its own entry sets. `undefined`
 * when it sets none of the three, or has no entry (an absent file is an empty one). Throws
 * BuildSettingUnreadable when the file is unreadable or malformed: the gate must not fall back to a
 * default on a setting it could not read.
 */
export function readBuildCommandSetting(repoPath: string, configPath: string = githubConfigPath()): BuildCommandSetting | undefined {
	const read = readRepoEntry(repoPath, configPath);
	if (!read.ok) throw new BuildSettingUnreadable(read.error.message);
	const entry = read.entry as Record<string, unknown> | undefined;
	if (entry === undefined) return undefined;
	const out: Record<string, unknown> = {};
	for (const key of KEYS) if (Object.hasOwn(entry, key)) out[key] = entry[key];
	return Object.keys(out).length > 0 ? out : undefined;
}
