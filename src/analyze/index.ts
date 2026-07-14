/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Analyze framework -- top-level barrel.
 *
 * See: design/analyze-framework.md
 */

export { CONTRACT_FOOTER_MD } from './contract.js';
export { shaperFor, PROMPT_PATHS } from './context/index.js';
export { validateAnalyzePrompts, AnalyzePromptValidationError } from './context/boot-validator.js';
export type * from './context/types.js';

// Classifier surface -- consumed by the framework outer-loop after
// the classification shaper has built the workspace bundle.
export {
	classify,
	CLASSIFY_PROMPT_PATH,
	ClassifierLlmUnavailableError,
	ClassifierPromptMissingError,
	ClassifierSchemaUnrecoverable,
	ClassifierValidationExhausted,
	isKindCompatibleWithTarget,
	validateIntentSemantics,
	validateIntentShape,
	validateIntentShapeWithErrors,
	CLASSIFIED_INTENT_SCHEMA,
	CLASSIFIER_SCHEMA_VERSION,
	TARGET_ENUM,
	SCOPE_BUCKET_ENUM,
	SCOPE_REF_KIND_ENUM,
} from './classifier/index.js';
export type {
	ClassifyInput,
	ClassifyOpts,
	ClassifyResponse,
	ClassifyErrorCode,
	ClassifyErrorPayload,
	ValidationFailure,
} from './classifier/index.js';

// Planner surface -- types + validator + template registry + driver.
export {
	validatePlan,
	SCOPE_BAND,
	PLAN_TASK_SCHEMA,
	PLANNED_TASK_SCHEMA,
	registerTemplate,
	registerBuiltinTemplates,
	getTemplateCatalog,
	getTemplatesForTarget,
	getTemplate,
	getAggregatorFor,
	TemplateRegistrationError,
	runPlanner,
	PLANNER_PROMPT_PATH,
	PlanBuilderExhausted,
	PlanBuilderLlmUnavailableError,
	PlanBuilderPromptMissingError,
	PlanBuilderSchemaUnrecoverable,
	MaxPlanDepthExceededError,
	renderCatalog,
	renderDepthPolicy,
	runRecursivePlanner,
	countNodes,
	countPlannerTasks,
	maxDepth,
} from './planner/index.js';
export type { MaxPlanDepthMap, PlanTreeNode } from './planner/index.js';

// Executor surface -- task walker + per-template runtime registry +
// per-task persistence. Per-target runtime IMPLEMENTATIONS land per
// per-target work; this barrel exports the skeleton + registry.
export {
	runExecutor,
	registerTemplateRuntime,
	getRuntime as getTemplateRuntime,
	listRegisteredRuntimes as listRegisteredTemplateRuntimes,
	TemplateRuntimeRegistrationError,
	taskOutputPathFor,
	writeTaskOutput,
	readTaskOutput,
	purgeTaskOutput,
	purgeAllTaskOutputs,
	ExecutorOutputShapeError,
	ExecutorRuntimeMissingError,
} from './executor/index.js';
export type {
	ExecutorErrorCode,
	ExecutorResult,
	PlanExecutionResult,
	RunExecutorArgs,
	TaskExecutionEvent,
	TaskExecutionRecord,
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from './executor/index.js';

// Per-target runtime bootstrap -- registers every implemented
// per-template runtime with the executor's registry. Called by the
// daemon at boot (alongside registerBuiltinTemplates).
export {
	registerBuiltinRuntimes,
	_resetRuntimeBootstrapLatchForTests,
} from './runtimes/bootstrap.js';

// Orchestrator -- end-to-end driver. Stitches classify -> plan ->
// execute together; persists run lifecycle to <runRoot>/run.json.
export {
	runAnalyze,
	readRunRecord,
	runRecordPathFor,
	purgeRun,
} from './orchestrator/index.js';
export type {
	RunAnalyzeArgs,
	RunAnalyzeOpts,
	RunAnalyzeResult,
	RunAnalyzeOk,
	RunAnalyzeFail,
	RunErrorCode,
	RunFailure,
	RunRecord,
	RunStage,
	AnalyzeRunEvent,
} from './orchestrator/index.js';
export type {
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanBuilderResponse,
	PlanBuilderErrorCode,
	PlanBuilderErrorPayload,
	PlanTask,
	PlannedTask,
	PlanInvariantId,
	PlanValidationFailure,
} from './planner/index.js';
