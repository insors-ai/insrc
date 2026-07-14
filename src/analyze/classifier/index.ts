/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Classifier -- barrel.
 *
 * Public surface:
 *   - classify(args): drives the LLM call + validation pipeline
 *   - ClassifyInput / ClassifyOpts / ClassifyResponse: typed I/O
 *   - Typed error classes for orchestrator dispatch
 *   - CLASSIFY_PROMPT_PATH: relative path the boot validator checks
 *
 * See: design/analyze-framework.md "Flow / 2. Classify"
 */

export {
	classify,
	ClassifierLlmUnavailableError,
	ClassifierPromptMissingError,
	ClassifierSchemaUnrecoverable,
	ClassifierValidationExhausted,
	CLASSIFY_PROMPT_PATH,
} from './driver.js';

export {
	pickScope,
	ScopePickerLlmUnavailableError,
	ScopePickerPromptMissingError,
	ScopePickerSchemaUnrecoverable,
	SCOPE_PICKER_PROMPT_PATH,
} from './scope-picker.js';
export type {
	PickScopeArgs,
	PickScopeResult,
} from './scope-picker.js';

export {
	CLASSIFIED_INTENT_SCHEMA,
	CLASSIFIER_SCHEMA_VERSION,
	SCOPE_BUCKET_ENUM,
	SCOPE_REF_KIND_ENUM,
	TARGET_ENUM,
	validateIntentShape,
	validateIntentShapeWithErrors,
} from './schema.js';

export {
	isKindCompatibleWithTarget,
	validateIntentSemantics,
	type ValidationFailure,
} from './validate.js';

export type {
	ClassifyErrorCode,
	ClassifyErrorPayload,
	ClassifyInput,
	ClassifyOpts,
	ClassifyResponse,
	ClassifiedIntent,
	AnalyzeScopeRef,
	AnalyzeScope,
	AnalyzeTarget,
} from './types.js';
