/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Classifier driver.
 *
 * Pipeline:
 *
 *   1. Invoke shaperFor('classification') to get a target-agnostic
 *      workspace bundle. (Cache-aware -- the shaper layer handles
 *      caching internally.)
 *   2. Build the classifier message list: load prompts/analyze/
 *      classify.system.md, prepend it as the system message;
 *      compose the user message from the rendered bundle Markdown
 *      + the raw user prompt + a structured-output reminder.
 *   3. Call OllamaProvider.completeStructured with
 *      CLASSIFIED_INTENT_SCHEMA. Ollama enforces the JSON shape at
 *      the wire layer; Ajv re-validates as a backstop.
 *   4. Run semantic validation (validate.ts). On failure: append a
 *      corrective note + the failure reason to the user message
 *      and retry ONCE.
 *   5. Return the typed ClassifiedIntent on success, throw a typed
 *      error on exhaustion / unrecoverable failures.
 *
 * No tool-loop: the classifier consumes the bundle's content
 * directly. Tool-driven discovery happens INSIDE the classification-
 * shaper before this driver fires.
 *
 * See: design/analyze-framework.md "Flow / 2. Classify"
 *      design/analyze-context-builder.md "Invocation modes / classification"
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildShaperProvider } from '../context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMMessage, LLMProvider } from '../../shared/types.js';
import { CONTRACT_FOOTER_MD } from '../contract.js';
import { shaperFor } from '../context/index.js';
import { assembleMarkdown } from '../context/bundle.js';

import {
	CLASSIFIED_INTENT_SCHEMA,
	CLASSIFIER_SCHEMA_VERSION,
	validateIntentShapeWithErrors,
} from './schema.js';
import type {
	ClassifyInput,
	ClassifyOpts,
} from './types.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import { validateIntentSemantics, type ValidationFailure } from './validate.js';

const log = getLogger('analyze:classifier');

const CLASSIFY_PROMPT_REL = 'prompts/analyze/classify.system.md';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class ClassifierLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for classifier: ${cause}`);
		this.name = 'ClassifierLlmUnavailableError';
	}
}

export class ClassifierSchemaUnrecoverable extends Error {
	constructor(lastErrors: readonly string[]) {
		super(`Classifier structured output unrecoverable: ${lastErrors.join('; ')}`);
		this.name = 'ClassifierSchemaUnrecoverable';
	}
}

export class ClassifierValidationExhausted extends Error {
	readonly lastFailure: ValidationFailure;

	constructor(lastFailure: ValidationFailure) {
		super(
			`Classifier validation failed after corrective retry: ` +
				`${lastFailure.code} -- ${lastFailure.message}`,
		);
		this.name = 'ClassifierValidationExhausted';
		this.lastFailure = lastFailure;
	}
}

export class ClassifierPromptMissingError extends Error {
	constructor(promptPath: string) {
		super(`Classifier prompt file missing: ${promptPath}`);
		this.name = 'ClassifierPromptMissingError';
	}
}

// ---------------------------------------------------------------------------
// classify -- public entry point
// ---------------------------------------------------------------------------

export interface ClassifyDriverArgs {
	readonly input:    ClassifyInput;
	readonly opts:     ClassifyOpts;
	readonly provider?: LLMProvider | undefined;
	/** Optional connection-existence check for `kind=connection` scopes. */
	readonly connectionExists?: (id: string) => Promise<boolean>;
}

export async function classify(args: ClassifyDriverArgs): Promise<ClassifiedIntent> {
	const { input, opts } = args;
	const cfg = loadAnalyzeConfig();

	// (1) Build the classification context bundle. The shaper layer
	// handles caching + LLM tool-loop discovery.
	const shaper = shaperFor('classification');
	const bundle = await shaper.buildClassificationBundle(input, {
		runId:        opts.runId,
		bypassCache:  opts.bypassCache ?? false,
	});
	const bundleMd = assembleMarkdown(bundle);

	// (2) Load classifier prompt + build messages.
	const promptContent = loadPromptFile();
	const provider = args.provider ?? buildShaperProvider(cfg);

	let messages = buildInitialMessages(promptContent, bundleMd, input);

	let lastValidationFailure: ValidationFailure | null = null;

	// (3-4) One initial attempt + at most one corrective retry on
	// semantic-validation failure. Total: 2 model calls in the worst
	// case (matches the design's "after two failures, the analyze
	// run aborts with a clear scopeRef-unresolved error").
	for (let attempt = 0; attempt < 2; attempt++) {
		let raw: ClassifiedIntent;
		try {
			raw = await provider.completeStructured<ClassifiedIntent>(
				messages,
				CLASSIFIED_INTENT_SCHEMA as Record<string, unknown>,
				{
					maxAttempts:     cfg.shaper.structuredOutputRetries,
					disableThinking: true,
				},
			);
		} catch (err) {
			throw classifyError(err);
		}

		// Defensive: Ajv re-validate even though Ollama enforced at the wire.
		const shapeOk = validateIntentShapeWithErrors(raw);
		if (!shapeOk.ok) {
			throw new ClassifierSchemaUnrecoverable(shapeOk.errors);
		}

		// Semantic validation: scopeRef.kind ↔ target match + path resolution.
		const failure = await validateIntentSemantics(raw, args.connectionExists);
		if (failure === null) {
			log.debug(
				{ runId: opts.runId, target: raw.target, scope: raw.scope, attempt },
				'classifier intent validated',
			);
			return raw;
		}

		lastValidationFailure = failure;
		log.info(
			{ runId: opts.runId, attempt, code: failure.code, message: failure.message },
			'classifier validation failure -- corrective retry',
		);

		// Compose corrective retry: append the failure reason to the
		// user message so the model can fix the next attempt. We DO
		// NOT drop the prior assistant turn -- giving the model its
		// own bad output back keeps the correction grounded.
		messages = appendCorrectionTurn(messages, raw, failure);
	}

	// Exhausted both attempts.
	if (lastValidationFailure === null) {
		// Defensive: should be unreachable -- the loop only exits with
		// a returned-good or a recorded failure.
		throw new Error('classifier: unexpected exhaustion without a recorded failure');
	}
	throw new ClassifierValidationExhausted(lastValidationFailure);
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function buildInitialMessages(
	promptContent: string,
	bundleMd:      string,
	input:         ClassifyInput,
): LLMMessage[] {
	const systemContent = `${promptContent.trimEnd()}\n\n${CONTRACT_FOOTER_MD}`;

	const userContent =
		`SchemaVersion: ${CLASSIFIER_SCHEMA_VERSION}\n` +
		`\n` +
		`User request (raw):\n` +
		'```\n' +
		input.userPrompt.trim() +
		'\n```\n' +
		`\n` +
		`Surfaced scope reference:\n` +
		'```json\n' +
		JSON.stringify(input.scopeRef, null, 2) +
		'\n```\n' +
		`\n` +
		`Workspace context (from the classification shaper):\n` +
		'```markdown\n' +
		bundleMd +
		'\n```\n' +
		`\n` +
		'Now classify. Emit ONLY the JSON object matching the ClassifiedIntent ' +
		'schema -- no prose, no fenced block. Required fields: target, scope, ' +
		'focused, scopeRef ({kind, value}), reasoning. Optional: focus ' +
		'(required when focused=true). Every layer value is a single string ' +
		'or boolean per the schema -- never nested objects.';

	return [
		{ role: 'system', content: systemContent },
		{ role: 'user',   content: userContent },
	];
}

function appendCorrectionTurn(
	prior:    LLMMessage[],
	rejected: ClassifiedIntent,
	failure:  ValidationFailure,
): LLMMessage[] {
	return [
		...prior,
		{ role: 'assistant', content: JSON.stringify(rejected) },
		{
			role:    'user',
			content:
				`The intent above failed validation:\n` +
				`  code:    ${failure.code}\n` +
				`  message: ${failure.message}\n` +
				`\n` +
				`Emit a corrected ClassifiedIntent. Common fixes:\n` +
				`  - scope-ref-kind-target-mismatch: pick a different target ` +
					`(e.g. data when scopeRef.kind=connection), or change ` +
					`scopeRef.kind to match the target.\n` +
				`  - scope-ref-unresolved: pick a path/connection that actually ` +
					`exists. Do NOT invent paths.\n` +
				`\nRespond with ONLY the corrected JSON object.`,
		},
	];
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(): string {
	const abs = isAbsolute(CLASSIFY_PROMPT_REL)
		? CLASSIFY_PROMPT_REL
		: resolveRelativeToInsrcRoot(CLASSIFY_PROMPT_REL);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new ClassifierPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/classifier/driver.js -> .../classifier -> .../analyze -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Error classification (matches the shaper driver's surface)
// ---------------------------------------------------------------------------

const UNAVAILABLE_PATTERNS = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

function classifyError(err: unknown): Error {
	if (!(err instanceof Error)) return new Error(String(err));
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new ClassifierLlmUnavailableError(msg);
	}
	// Anything else is a schema / unexpected error -- surface
	// verbatim with the unrecoverable marker.
	return new ClassifierSchemaUnrecoverable([msg]);
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _classifyErrorForTest = classifyError;
export const _buildInitialMessagesForTest = buildInitialMessages;
export const _appendCorrectionTurnForTest = appendCorrectionTurn;
export const CLASSIFY_PROMPT_PATH = CLASSIFY_PROMPT_REL;
