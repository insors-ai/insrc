/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Infra-target runtime catalog.
 *
 * Every leaf template in analyze/planner/templates/infra has a runtime
 * here. Discovery + inventory runtimes walk the filesystem (no daemon
 * dependency); the aggregator delegates to the shared runAggregator
 * base.
 */

import { infraDiscoveryFamiliesRuntime    } from './discovery-families.js';
import { infraInventoryKubernetesRuntime  } from './inventory-kubernetes.js';
import { infraInventoryTerraformRuntime   } from './inventory-terraform.js';
import { infraAdherenceCheckRuntime       } from './adherence-check.js';
import { infraAggregateReportRuntime      } from './aggregate-report.js';

import type { TemplateRuntime } from '../../executor/types.js';

export { infraDiscoveryFamiliesRuntime    } from './discovery-families.js';
export { infraInventoryKubernetesRuntime  } from './inventory-kubernetes.js';
export { infraInventoryTerraformRuntime   } from './inventory-terraform.js';
export {
	infraAdherenceCheckRuntime,
	INFRA_ADHERENCE_CHECK_PROMPT_PATH,
} from './adherence-check.js';
export { infraAggregateReportRuntime, INFRA_AGGREGATE_PROMPT_PATH } from './aggregate-report.js';

export const INFRA_RUNTIMES: readonly TemplateRuntime[] = [
	infraDiscoveryFamiliesRuntime,
	infraInventoryKubernetesRuntime,
	infraInventoryTerraformRuntime,
	infraAdherenceCheckRuntime,
	infraAggregateReportRuntime,
];
