/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The synchronous half of the integrity check, for the paths that have no History: does the stored content hash of a head on
 * disk still match the head's own description and payload? Used by the approval and review gates before they stamp or rewrite
 * anything. A head that cannot be decoded, or has no stored hash, is not reported: those gates behave as they always have.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { decodeArtifactHead } from './decode.js';
import { checkHeadIntegrity } from './lifecycle.js';
import type { IntegrityReason } from './types.js';

export interface HeadConflict {
	readonly artifactId: string;
	readonly reason:     IntegrityReason;
}

/** The conflict of the head at `jsonPath`, or undefined when it has none, has no stored hash, or cannot be read. */
export function headConflict(jsonPath: string): HeadConflict | undefined {
	try {
		const artifactId = basename(jsonPath).replace(/\.json$/, '');
		const { artifact } = decodeArtifactHead(artifactId, readFileSync(jsonPath, 'utf8'));
		const integrity = checkHeadIntegrity({ description: artifact.description, payload: artifact.payload, lifecycle: artifact.lifecycle });
		return integrity.ok ? undefined : { artifactId, reason: integrity.reason };
	} catch {
		return undefined;
	}
}
