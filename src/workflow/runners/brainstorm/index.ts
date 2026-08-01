/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `brainstorm` stage runner registration (Epic
 * `frame-epic-new-pre-workflow-brainstorm`, Story S001 — sc2).
 *
 * Makes brainstorm a first-class, peer workflow stage: it self-registers its
 * step runner(s) into the SAME executor registry (`registerRunner`) the design
 * stages use, and is wired into `registerWorkflowRunners()` in
 * `src/workflow/index.ts`. No parallel execution or persistence path (k5).
 *
 * SCAFFOLD ONLY (S001): the registered runner is a placeholder so the stage is
 * invokable + resumable through the existing step loop; the real
 * questioning / convergence behaviour is S002–S005.
 *
 * k10 — this module is the `brainstorm` WORKFLOW STAGE. It shares ONLY the
 * `BrainstormCategory` vocabulary concept with the shared/chat-agent
 * `brainstorm` idea-capture concept, and it NEVER imports or invokes the
 * `brainstorm.addIdea` offlineRpc stub (src/daemon/index.ts). The two stay
 * separately addressable.
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner } from '../../types.js';
import { brainstormElicitSchema } from './schemas.js';
import { standaloneBrainstormContext } from './standalone.js';

// Silence unused-import lint while keeping the sc2 wiring explicit: the scaffold
// references its sibling contract pieces so S002–S005 extend them in place.
void brainstormElicitSchema;
void standaloneBrainstormContext;

/** SCAFFOLD placeholder step runner. Returns a trivial output so the stage
 *  round-trips through the executor step loop; S002–S005 replace its body with
 *  the real elicitation turn (questions / working-statement convergence). */
const elicit: StepRunner = {
	id:       'elicit',
	workflow: 'brainstorm',
	run:      async () => ({
		type:    'output',
		output:  { scaffold: true },
		summary: 'brainstorm scaffold placeholder (elicitation behaviour lands in S002–S005)',
	}),
};

let registered = false;

/** Idempotent registration, mirroring `registerDesignStoryRunners`
 *  (design-story/index.ts:541). Wired into `registerWorkflowRunners()`. */
export function registerBrainstormRunners(): void {
	if (registered) return;
	registerRunner(elicit);
	registered = true;
}
