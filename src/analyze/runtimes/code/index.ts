/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-target runtime catalog.
 *
 * Each template registered in analyze/planner/templates/code/index.ts
 * gets a runtime here. Aggregator runtimes (kind='leaf' but isAggregator)
 * are LLM-driven; discovery / surface / structure runtimes are
 * deterministic tool calls against the LMDB graph layer + filesystem.
 *
 * Bootstrap order matches the template catalog. Currently only
 * code.discovery.modules has a runtime; the other four leaf
 * templates land in follow-up commits per the per-family rollout
 * plan.
 */

import { codeDiscoveryModulesRuntime     } from './discovery-modules.js';
import { codeDiscoveryEntrypointsRuntime } from './discovery-entrypoints.js';
import { codeSurfaceFunctionalRuntime    } from './surface-functional.js';
import { codeStructureModuleTreeRuntime  } from './structure-module-tree.js';
import { codeAdherenceCheckRuntime       } from './adherence-check.js';
import { codeAggregateReportRuntime      } from './aggregate-report.js';

import type { TemplateRuntime } from '../../executor/types.js';

export { codeDiscoveryModulesRuntime     } from './discovery-modules.js';
export { codeDiscoveryEntrypointsRuntime } from './discovery-entrypoints.js';
export { codeSurfaceFunctionalRuntime    } from './surface-functional.js';
export { codeStructureModuleTreeRuntime  } from './structure-module-tree.js';
export {
	codeAdherenceCheckRuntime,
	CODE_ADHERENCE_CHECK_PROMPT_PATH,
} from './adherence-check.js';
export { codeAggregateReportRuntime, CODE_AGGREGATE_PROMPT_PATH } from './aggregate-report.js';

/**
 * Every code-target template runtime currently implemented.
 * Bootstrap passes this array to registerTemplateRuntime() in order.
 *
 * code.subrun.deep-dive is planner-kind and dispatched by the
 * executor's walker directly -- it intentionally has no runtime
 * entry here.
 */
export const CODE_RUNTIMES: readonly TemplateRuntime[] = [
	codeDiscoveryModulesRuntime,
	codeDiscoveryEntrypointsRuntime,
	codeSurfaceFunctionalRuntime,
	codeStructureModuleTreeRuntime,
	codeAdherenceCheckRuntime,
	codeAggregateReportRuntime,
];
