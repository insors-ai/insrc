/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Explorations -- barrel.
 *
 * plans/exploration-based-context-build.md Phase 1. Public surface:
 *   - executePlan(args): runs an ExplorationPlan end-to-end
 *   - Per-type runners for callers that want to fire a single
 *     exploration directly (mostly tests)
 *   - Typed shapes: Exploration, ExplorationPlan, ExplorationOutput,
 *     ExecutedPlan, ExecutedExploration
 *
 * The decomposer emits plans of this shape; the shaper driver
 * hands them to executePlan; the synthesizer reads the results.
 */

export { executePlan, stepPlan, getNarrowRunner, NARROW_LLM_TYPES } from './executor.js';
export type {
	ExecutePlanArgs,
	NarrowPrepareResult,
	StepPlanResumeState,
	StepPlanPending,
	StepPlanDone,
	StepPlanResult,
} from './executor.js';

export { runConceptResolve }          from './concept-resolve.js';
export { runModuleProfile }           from './module-profile.js';
export { runSymbolLocate }            from './symbol-locate.js';
export { runImportGraph }             from './import-graph.js';
export { runDocMention }              from './doc-mention.js';
export {
	runDocDecisionTrace,
	runSharedDocDecisionTrace,
	DOC_DECISION_TRACE_PROMPT_PATH,
} from './doc-decision-trace.js';
export {
	runDocConstraintEnumerate,
	runSharedDocConstraintEnumerate,
	DOC_CONSTRAINT_ENUMERATE_PROMPT_PATH,
} from './doc-constraint-enumerate.js';
export { runUsageExample }            from './usage-example.js';
export { runClassHierarchy }          from './class-hierarchy.js';
export {
	runCapabilityReuseCheck,
	CAPABILITY_REUSE_CHECK_PROMPT_PATH,
} from './capability-reuse-check.js';
export { runSearchText }              from './search-text.js';
export { runConventionDetect }        from './convention-detect.js';
export { runConfigTrace }             from './config-trace.js';
export { runTestLocate }              from './test-locate.js';
export { runDataModelTrace }          from './data-model-trace.js';
export { runDbConnectionsList }       from './db-connections-list.js';
export { runDbTablesList }            from './db-tables-list.js';
export { runDbTableDescribe }         from './db-table-describe.js';
export { runManifestsLocate }         from './manifests-locate.js';
export { runFreeformProbe }           from './freeform-probe.js';

export type {
	AnswerType,
	CapabilityReuseCandidate,
	CapabilityReuseCheckOutput,
	ClassHierarchyNode,
	ClassHierarchyOutput,
	ConceptHit,
	ConceptResolveOutput,
	ConfigTraceHit,
	ConfigTraceOutput,
	ConfigTraceRole,
	ConventionBaseClassIdiom,
	ConventionDetectOutput,
	ConventionNamingSchema,
	DataModelField,
	DataModelNode,
	DataModelTraceOutput,
	DbColumnSummary,
	DbConnectionSummary,
	DbConnectionsListOutput,
	DbTableDescribeOutput,
	DbTableSummary,
	DbTablesListOutput,
	FreeformProbeOutput,
	ManifestFamily,
	ManifestHit,
	ManifestsLocateOutput,
	DocConstraintEnumerateOutput,
	DocConstraintRecord,
	DocDecisionRecord,
	DocDecisionTraceOutput,
	DocMentionHit,
	DocMentionOutput,
	ExecutedExploration,
	ExecutedPlan,
	Exploration,
	ExplorationOutput,
	ExplorationPlan,
	ExplorationRunner,
	ExplorationRunnerContext,
	ExplorationType,
	FailedExplorationOutput,
	ImportGraphOutput,
	ImportGraphSummary,
	ModuleProfile,
	ModuleProfileOutput,
	NamingCase,
	SearchTextHit,
	SearchTextOutput,
	SymbolHit,
	SymbolLocateOutput,
	TestFileConvention,
	TestLocateHit,
	TestLocateOutput,
	UnsupportedExplorationOutput,
	UsageExampleHit,
	UsageExampleOutput,
} from './types.js';
