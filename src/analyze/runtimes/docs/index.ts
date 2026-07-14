/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Docs-target runtime catalog. Runtimes for every non-planner
 * template in analyze/planner/templates/docs/index.ts.
 *
 * docs.subrun.deep-dive is planner-kind -- no runtime entry
 * (dispatched by the executor's walker).
 */

import { docsAggregateReportRuntime      } from './aggregate-report.js';
import { docsConstraintEnumerateRuntime  } from './constraint-enumerate.js';
import { docsDecisionTraceRuntime        } from './decision-trace.js';
import { docsDiscoveryInventoryRuntime   } from './discovery-inventory.js';
import { docsFamilySummariseRuntime      } from './family-summarise.js';

import type { TemplateRuntime } from '../../executor/types.js';

export {
	docsAggregateReportRuntime,
	DOCS_AGGREGATE_PROMPT_PATH,
} from './aggregate-report.js';
export {
	docsConstraintEnumerateRuntime,
	DOCS_CONSTRAINT_ENUMERATE_PROMPT_PATH,
} from './constraint-enumerate.js';
export {
	docsDecisionTraceRuntime,
	DOCS_DECISION_TRACE_PROMPT_PATH,
} from './decision-trace.js';
export { docsDiscoveryInventoryRuntime } from './discovery-inventory.js';
export { docsFamilySummariseRuntime    } from './family-summarise.js';

export const DOCS_RUNTIMES: readonly TemplateRuntime[] = [
	docsDiscoveryInventoryRuntime,
	docsFamilySummariseRuntime,
	docsDecisionTraceRuntime,
	docsConstraintEnumerateRuntime,
	docsAggregateReportRuntime,
];
