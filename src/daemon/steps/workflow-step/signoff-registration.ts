/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Signoff in the daemon (Story s7): the team gate runs here, so the completion hook is registered here, and a signoff is recorded
 * through the repository registry's lifecycle service, the same write queue every other change in the daemon uses.
 */

import { registerSignoffHook, registerSignoffLifecycle } from '../../../workflow/team/signoff.js';
import { lifecycleFor } from '../../lifecycle-registry.js';

/** Register the signoff hook and the registry's lifecycle service; the daemon does this when it builds its step tools. Idempotent. */
export function registerSignoff(): void {
	registerSignoffHook();
	registerSignoffLifecycle(repo => lifecycleFor(repo).service);
}
