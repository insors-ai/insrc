/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD on-disk read helpers. Kept in its own module so the tracker
 * runners (and later plan/build/test) can pull them without
 * dragging the whole orchestrator import graph.
 */

import { existsSync, readFileSync } from 'node:fs';

import { lldArtifactPaths } from '../storage.js';
import { ArtifactMissingError } from '../gates.js';
import type { LldArtifact } from './lld.js';

export function readLldArtifact(repoPath: string, epicHash: string, storyId: string): LldArtifact {
	const paths = lldArtifactPaths(repoPath, epicHash, storyId);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`LLD not found at ${paths.json}. Run design.story for '${storyId}' first.`,
		);
	}
	const raw = readFileSync(paths.json, 'utf8');
	return JSON.parse(raw) as LldArtifact;
}
