/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executor -- barrel.
 *
 * Public surface:
 *   - runExecutor(args): walks a PlanTreeNode, runs every task
 *     against its registered runtime
 *   - registerTemplateRuntime / getRuntime / listRegisteredRuntimes:
 *     per-template runtime registry (per-target modules call these
 *     at boot)
 *   - readTaskOutput / purgeTaskOutput / purgeAllTaskOutputs:
 *     per-task persistence (tests + resumability use these)
 *   - Typed errors + result types
 *
 * Per-target template RUNTIMES (the actual analyses behind each
 * template id) are NOT included here -- those land per-target. The
 * executor skeleton is decoupled from any specific runtime
 * implementation so the per-target work can land incrementally.
 */

export { runExecutor } from './walker.js';
export {
	registerTemplateRuntime,
	getRuntime,
	listRegisteredRuntimes,
	TemplateRuntimeRegistrationError,
	_resetRuntimeRegistryForTests,
} from './registry.js';
export {
	taskOutputPathFor,
	writeTaskOutput,
	readTaskOutput,
	purgeTaskOutput,
	purgeAllTaskOutputs,
} from './cache.js';

export {
	ExecutorOutputShapeError,
	ExecutorRuntimeMissingError,
	type ExecutorErrorCode,
	type ExecutorResult,
	type PlanExecutionResult,
	type RunExecutorArgs,
	type TaskExecutionEvent,
	type TaskExecutionRecord,
	type TemplateExecuteArgs,
	type TemplateExecuteResult,
	type TemplateRuntime,
} from './types.js';
