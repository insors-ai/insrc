/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generic-target template catalog. A single terminal aggregator that
 * stitches cross-target sub-plan reports into the workspace-level
 * view.
 *
 * The generic planner typically emits planner-template tasks (one
 * per per-target sub-target detected) whose execution spawns child
 * Plans. This aggregator runs last and consumes every sub-plan's
 * `report` output.
 */

import type { AnalyzeTaskTemplate } from '../../types.js';
import {
	AGGREGATOR_INPUT_SCHEMA,
	AGGREGATOR_OUTPUT_SCHEMA,
} from '../shared-schemas.js';
import { registerTemplate } from '../registry.js';

export const genericAggregateReport: AnalyzeTaskTemplate = {
	id:           'generic.aggregate.report',
	target:       'generic',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'Terminal aggregator for generic-target plans. Stitches per-target sub-plan reports into the workspace-level view.',
	inputSchema:  AGGREGATOR_INPUT_SCHEMA,
	outputSchema: AGGREGATOR_OUTPUT_SCHEMA,
	produces:     ['report'],
	isAggregator: true,
};

export const GENERIC_TEMPLATES: readonly AnalyzeTaskTemplate[] = [
	genericAggregateReport,
];

export function registerGenericTemplates(): void {
	for (const t of GENERIC_TEMPLATES) {
		registerTemplate(t);
	}
}
