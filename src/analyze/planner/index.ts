/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan Builder -- barrel.
 *
 * Public surface (P0):
 *   - Types: PlanBuilderInput / PlanBuilderOpts / PlanBuilderResponse +
 *     error code enum
 *   - Schema: PLAN_TASK_SCHEMA + PLANNED_TASK_SCHEMA + Ajv validators
 *   - Validator: validatePlan() + the 15 invariant constants
 *
 * The LLM driver, prompt, persistence layer, daemon RPC, and
 * recursive Plan-tree support land in subsequent phases.
 *
 * See: design/analyze-plan-builder.md
 */

export {
	PLAN_TASK_SCHEMA,
	PLANNED_TASK_SCHEMA,
	PLAN_SCHEMA_VERSION,
	SCOPE_BUCKET_ENUM as PLAN_SCOPE_BUCKET_ENUM,
	TARGET_ENUM as PLAN_TARGET_ENUM,
	TASK_KIND_ENUM,
	TASK_ID_PATTERN,
	GOAL_MAX_LENGTH,
	PLAN_REASONING_MIN_LENGTH,
	RATIONALE_MIN_LENGTH,
	RATIONALE_MAX_LENGTH,
	REASONING_MAX_LENGTH,
	validatePlanShape,
	validatePlanShapeWithErrors,
	validatePlannedTaskShape,
	validatePlannedTaskShapeWithErrors,
} from './schema.js';

export {
	SCOPE_BAND,
	validatePlan,
	type PlanInvariantId,
	type PlanValidationFailure,
	type ValidateOpts,
} from './validate.js';

export type {
	PlanBuilderErrorCode,
	PlanBuilderErrorPayload,
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanBuilderResponse,
	PlanTask,
	PlannedTask,
	AnalyzeTaskTemplate,
	ClassifiedIntent,
} from './types.js';

// Template registry surface -- the Plan Builder validator + LLM driver
// both read from these.
export {
	registerTemplate,
	getTemplateCatalog,
	getTemplatesForTarget,
	getTemplate,
	getAggregatorFor,
	TemplateRegistrationError,
	_resetTemplateRegistryForTests,
} from './templates/registry.js';
export { registerBuiltinTemplates } from './templates/bootstrap.js';

// LLM driver -- runPlanner + typed errors + the prompt path the
// boot validator checks.
export {
	runPlanner,
	PLANNER_PROMPT_PATH,
	PlanBuilderExhausted,
	PlanBuilderLlmUnavailableError,
	PlanBuilderPromptMissingError,
	PlanBuilderSchemaUnrecoverable,
	MaxPlanDepthExceededError,
} from './driver.js';
export type { MaxPlanDepthMap } from './types.js';

// Catalog rendering helper -- exposed for tests + future planner
// orchestration that needs to materialise the prompt body.
export { renderCatalog, renderDepthPolicy } from './render-catalog.js';

// Recursive plan-tree builder -- drives a root plan + every
// planner-template task's child plan; returns the full tree.
export {
	runRecursivePlanner,
	countNodes,
	countPlannerTasks,
	maxDepth,
	type PlanTreeNode,
	type RecursivePlannerArgs,
} from './recursive.js';

// Plan persistence -- audit trail + final-accepted-plan read/write
// per (runId, parentTaskPath?). The driver writes through these
// automatically; the framework outer-loop reads for resume.
export {
	planDirFor,
	planFinalPathFor,
	planAttemptsDirFor,
	planAttemptPathFor,
	planFeedbackPathFor,
	writeAttempt,
	writeFeedback,
	writePlanFinal,
	readPlanFinal,
	purgePlan,
	type PersistArgs,
} from './cache.js';
