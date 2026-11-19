/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The commands a project states for the build gate (LLD-787434000fa22691-s1, task t5): the
 * `build.typecheckCommand`, `build.testCommand` and `build.resultFormat` keys of
 * `~/.insrc/config.json`, and the same three keys under `build.byRepo.<absolute repo path>`,
 * which win over the global ones for that repository. An absent key and an empty string both mean
 * "not set". This module only reads the raw values; what makes them valid is decided once, where
 * the command profile is built (validation-checks.ts).
 */

import { existsSync, readFileSync } from 'node:fs';

import { PATHS } from '../../../shared/paths.js';

/** The raw values of one level of the setting: a key that is not set is absent; a value that is not a string is kept as read. */
export interface BuildCommandSetting {
	readonly typecheckCommand?: unknown;
	readonly testCommand?:      unknown;
	readonly resultFormat?:     unknown;
}

const KEYS = ['typecheckCommand', 'testCommand', 'resultFormat'] as const;

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The keys of `section` that are set: present, and not the empty string. */
function setKeys(section: unknown): BuildCommandSetting {
	if (!isObject(section)) return {};
	const out: Record<string, unknown> = {};
	for (const key of KEYS) {
		const value = section[key];
		if (value !== undefined && value !== '') out[key] = value;
	}
	return out;
}

/**
 * The setting that applies to `repoPath`: each key from `build.byRepo.<repoPath>` when it is set
 * there, else from `build`. `undefined` when none of the three is set anywhere, and for a config
 * that is absent or unreadable (the gate then uses the project type's default).
 */
export function readBuildCommandSetting(repoPath: string, configPath: string = PATHS.config): BuildCommandSetting | undefined {
	if (!existsSync(configPath)) return undefined;
	let parsed: unknown;
	try { parsed = JSON.parse(readFileSync(configPath, 'utf-8')); } catch { return undefined; }
	const build = isObject(parsed) ? parsed['build'] : undefined;
	if (!isObject(build)) return undefined;
	const byRepo = isObject(build['byRepo']) ? build['byRepo'][repoPath] : undefined;
	const merged = { ...setKeys(build), ...setKeys(byRepo) };
	return Object.keys(merged).length > 0 ? merged : undefined;
}
