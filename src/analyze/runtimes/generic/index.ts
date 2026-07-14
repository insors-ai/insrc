/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generic-target runtime catalog.
 *
 * Generic plans use a single template (generic.aggregate.report) per
 * the template registry -- there are no per-family discovery /
 * surface runtimes here. The aggregator is the entire generic
 * runtime surface.
 */

import { genericAggregateReportRuntime } from './aggregate-report.js';

import type { TemplateRuntime } from '../../executor/types.js';

export {
	genericAggregateReportRuntime,
	GENERIC_AGGREGATE_PROMPT_PATH,
} from './aggregate-report.js';

export const GENERIC_RUNTIMES: readonly TemplateRuntime[] = [
	genericAggregateReportRuntime,
];
