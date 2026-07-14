/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Public entry: register every workflow's runners + re-export the
 * types + orchestrator + storage helpers. Callers only need to
 * import from `workflow/index.js`.
 */

import { registerDefineRunners }      from './runners/define/index.js';
import { registerDesignEpicRunners }  from './runners/design-epic/index.js';
import { registerDesignStoryRunners } from './runners/design-story/index.js';
import { registerStubRunners }        from './runners/stub/index.js';
import { registerTrackerRunners }     from './runners/tracker/index.js';

let registered = false;

/** Idempotent bootstrap. Call from the daemon / MCP subprocess /
 *  CLI at start-up before any workflow tool dispatch. */
export function registerWorkflowRunners(): void {
	if (registered) return;
	registerStubRunners();
	registerDefineRunners();
	registerDesignEpicRunners();
	registerDesignStoryRunners();
	registerTrackerRunners();
	registered = true;
}

export * from './types.js';
export * from './slug.js';
export * from './storage.js';
export * from './executor.js';
export * from './synthesizer.js';
export * from './orchestrator.js';
