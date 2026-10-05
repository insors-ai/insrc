/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Who wrote the code a code review is about.
 *
 * The review subject does not carry the author, so both reviewers (the daemon's
 * `codeReview.run` and the controller's `insrc_code_review_step`) read it from
 * the Story's BUILD record in the artifact store.
 */

import { readFileSync } from 'node:fs';

import { authorPartyOf } from '../review/party.js';
import type { PartyOrUnknown } from '../review/party.js';
import { artifactJsonPath, buildArtifactId } from '../storage.js';

/** The party that wrote the code under review. `unknown` when the Story has no
 *  BUILD record, the record cannot be read, or it names no author (an older one). */
export function buildAuthorParty(repoPath: string, epicHash: string, storyId: string): PartyOrUnknown {
	try {
		const rec = JSON.parse(readFileSync(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId)), 'utf8')) as { meta?: unknown };
		return authorPartyOf(rec.meta);
	} catch {
		return 'unknown';
	}
}
