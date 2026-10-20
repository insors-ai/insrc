/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The repository version marker (sc8). `.insrc/schema.json` records whether a
 * repository has been converted to the common model; no marker means version 1,
 * unconverted. s2 only reads and requires; the s9 conversion writes it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RepoSchemaError } from './types.js';
import type { RepoSchema } from './types.js';

/** The marker file, relative to the repository root. */
export const REPO_SCHEMA_FILE = '.insrc/schema.json';

export const RepoSchemaGate = {
	/** The marker's content; a repository with no marker reads as version 1. Writes nothing. */
	read(repo: string): RepoSchema {
		const path = join(repo, REPO_SCHEMA_FILE);
		if (!existsSync(path)) return { version: 1 };
		let parsed: unknown;
		try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
		catch (err) { throw new RepoSchemaError(`${path} cannot be read as JSON (${(err as Error).message})`); }
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new RepoSchemaError(`${path} is not a JSON object`);
		const { version, convertedAt } = parsed as Record<string, unknown>;
		if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
			throw new RepoSchemaError(`${path} has no integer version of at least 1`);
		}
		if (convertedAt !== undefined && typeof convertedAt !== 'string') throw new RepoSchemaError(`${path} has a convertedAt that is not text`);
		return { version, ...(convertedAt !== undefined ? { convertedAt } : {}) };
	},

	/** ok when the repository is at least `atLeast`; otherwise a message that names the s9 conversion. */
	require(repo: string, atLeast: number): { ok: true } | { ok: false; message: string } {
		const found = RepoSchemaGate.read(repo).version;
		if (found >= atLeast) return { ok: true };
		return {
			ok: false,
			message: `this repository is at schema version ${found} but version ${atLeast} is needed; run the s9 conversion to convert it first`,
		};
	},
} as const;
