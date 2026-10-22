/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TEST HELPER — a round writer for a test that runs a review or build step against a repository that does not exist on disk
 * (a fake `/repo`) and injects its own file writer. The step requires a round writer, so the test gives it one that stores
 * nothing: `updateContent` answers that the content was stored, and the injected writer sees the file.
 */

import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { Actor } from '../../artifact-core/types.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';

const ACTOR: Actor = { id: 'insrc:test-round', kind: 'system', properties: {} };

export const noopRoundWriter = (): RoundWriter => ({ writer: { updateContent: async () => true } as unknown as LifecycleService, actor: ACTOR });
