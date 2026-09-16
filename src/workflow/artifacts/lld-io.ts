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

import { artifactJsonPath, lldArtifactId } from '../storage.js';
import { ArtifactMissingError } from '../gates.js';
import type { LldArtifact } from './lld.js';

export function readLldArtifact(repoPath: string, epicHash: string, storyId: string): LldArtifact {
	const jsonPath = artifactJsonPath(repoPath, lldArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(
			`LLD not found at ${jsonPath}. Run design.story for '${storyId}' first.`,
		);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	return JSON.parse(raw) as LldArtifact;
}
