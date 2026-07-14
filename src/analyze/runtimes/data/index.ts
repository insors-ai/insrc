/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Data-target runtime catalog.
 *
 * Every leaf template in analyze/planner/templates/data has a runtime
 * here. The aggregator delegates to the shared runAggregator base
 * (analyze/runtimes/shared/aggregator.ts); the discovery + schema
 * runtimes call the per-repo data-driver pool via acquirePool.
 */

import { dataDiscoveryConnectionsRuntime } from './discovery-connections.js';
import { dataDiscoveryObjectsRuntime     } from './discovery-objects.js';
import { dataSchemaTableRuntime          } from './schema-table.js';
import { dataAdherenceCheckRuntime       } from './adherence-check.js';
import { dataAggregateReportRuntime      } from './aggregate-report.js';

import type { TemplateRuntime } from '../../executor/types.js';

export { dataDiscoveryConnectionsRuntime } from './discovery-connections.js';
export { dataDiscoveryObjectsRuntime     } from './discovery-objects.js';
export { dataSchemaTableRuntime          } from './schema-table.js';
export {
	dataAdherenceCheckRuntime,
	DATA_ADHERENCE_CHECK_PROMPT_PATH,
} from './adherence-check.js';
export { dataAggregateReportRuntime, DATA_AGGREGATE_PROMPT_PATH } from './aggregate-report.js';

export const DATA_RUNTIMES: readonly TemplateRuntime[] = [
	dataDiscoveryConnectionsRuntime,
	dataDiscoveryObjectsRuntime,
	dataSchemaTableRuntime,
	dataAdherenceCheckRuntime,
	dataAggregateReportRuntime,
];
