/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_guide` (sc2) — the MCP tool's input shape.
 *
 * The result types + the section reader live daemon-side in
 * `../../daemon/guide-sections.js` (the daemon owns the steering content); this
 * module only declares the tool's zod input shape and re-exports the request
 * type for the thin handler.
 */

import { z } from 'zod';
import type { ZodRawShape } from 'zod';

export type { InsrcGuideInput } from '../../daemon/guide-sections.js';

/**
 * The `insrc_guide` tool's input zod raw shape. `workflow` is optional so an
 * omitted workflow reaches the handler as the "list the valid workflows"
 * structured path rather than a wire-level rejection.
 */
export const GUIDE_INPUT = {
	workflow: z
		.string()
		.optional()
		.describe(
			'The workflow whose full step-by-step guidance you want (e.g. ' +
				'"design.story"). Omit it to receive the list of workflows that have ' +
				'authored guidance.',
		),
} satisfies ZodRawShape;
