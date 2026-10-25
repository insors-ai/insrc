/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source-scan contract test for the inline `artifact.feedback.append` IPC handler.
 * The daemon handler map is defined inside main() and is not headlessly bootable,
 * so — the repo-stats-handler-contract idiom — we assert the load-bearing wiring
 * against source text: the handler is registered, stores the entry through the
 * FeedbackService, returns {error} (not throw) on failure, and the tool
 * `artifact_feedback_append` and the body writers are gone.
 *
 * Run: npx tsx --test src/daemon/__tests__/artifact-feedback-handler-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'handler-runtime.ts');                           // the handler map, moved out of index.ts's main() (Epic 86197ac6 s2/t1)
const BUILTINS = resolve(HERE, '..', 'tools', 'builtins', 'index.ts');            // builtins aggregator
const PROVENANCE = resolve(HERE, '..', '..', 'workflow', 'artifacts', 'provenance');
const REQUEST = resolve(HERE, '..', '..', 'workflow', 'feedback', 'legacy-request.ts');

const indexSrc = readFileSync(INDEX, 'utf8');
const builtinsSrc = readFileSync(BUILTINS, 'utf8');

/** Slice out the `'artifact.feedback.append': async (...) => { ... }` handler body. */
function handlerBody(): string {
	const start = indexSrc.indexOf("'artifact.feedback.append':");
	assert.ok(start >= 0, "no 'artifact.feedback.append' handler registered in the index.ts handler map");
	const rest = indexSrc.slice(start + "'artifact.feedback.append':".length);
	const nextKey = rest.search(/\n\t\t'[a-zA-Z.]+':/);
	return nextKey >= 0 ? rest.slice(0, nextKey) : rest;
}

const HANDLERS = resolve(HERE, '..', 'feedback-handlers.ts');
const handlersSrc = readFileSync(HANDLERS, 'utf8');

test("index.ts registers an 'artifact.feedback.append' handler that delegates to the feedback handlers (s5: stored through the FeedbackService)", () => {
	assert.match(indexSrc, /'artifact\.feedback\.append':\s*async/, 'the handler is registered');
	assert.match(handlerBody(), /handleFeedbackAppend\(/, 'the handler delegates to handleFeedbackAppend');
	assert.match(handlersSrc, /coerceRequest\(/, 'the request is shaped via coerceRequest');
	assert.match(handlersSrc, /feedback\.add\(/, 'the entry is stored through FeedbackService.add');
});

test("index.ts registers the four s5 methods, each falling back to the daemon's INSRC_REPO or taking no repo", () => {
	for (const method of ['artifact.feedback.add', 'artifact.feedback.list', 'identity.show', 'identity.declare']) {
		assert.match(indexSrc, new RegExp(`'${method.replace('.', '\\.')}':\\s*async`), `${method} is registered`);
	}
	assert.match(indexSrc, /handleFeedbackAdd\(params, process\.env\['INSRC_REPO'\]\)/);
	assert.match(indexSrc, /handleFeedbackList\(params, process\.env\['INSRC_REPO'\]\)/);
	assert.match(indexSrc, /handleIdentityShow\(\)/);
	assert.match(indexSrc, /handleIdentityDeclare\(params\)/);
});

test("the append handler returns { error } (not throw) on a bad request / ArtifactFeedbackError", () => {
	const start = handlersSrc.indexOf('export async function handleFeedbackAppend');
	const body = handlersSrc.slice(start, handlersSrc.indexOf('\n}\n', start));
	assert.match(body, /return \{ error:/, 'returns an {error} object on failure');
	assert.match(body, /ArtifactFeedbackError/, 'discriminates the typed error');
});

test("the artifact-feedback tool and the body writers are gone, and the request type is the feedback module's", () => {
	assert.doesNotMatch(builtinsSrc, /registerArtifactFeedbackTool|artifact_feedback_append/, 'the tool is not mounted at boot');
	for (const gone of ['tool.ts', 'writer.ts', 'schema.ts']) assert.equal(existsSync(resolve(PROVENANCE, gone)), false, `provenance/${gone} is gone`);
	const requestSrc = readFileSync(REQUEST, 'utf8');
	assert.match(requestSrc, /export class ArtifactFeedbackError extends Error/, 'ArtifactFeedbackError is exported');
	assert.match(requestSrc, /export function coerceRequest\(/, 'coerceRequest is exported');
	assert.doesNotMatch(requestSrc, /writeArtifact|writeFileSync|appendFeedback\(/, 'and the module writes nothing');
});
