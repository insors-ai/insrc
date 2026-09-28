/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source-scan contract test for the inline `artifact.feedback.append` IPC handler
 * + the `artifact_feedback_append` daemon tool (Story S001 — provenance/feedback).
 * The daemon handler map is defined inside main() and is not headlessly bootable,
 * so — the repo-stats-handler-contract idiom — we assert the load-bearing wiring
 * against source text: the handler is registered, delegates to appendFeedback,
 * returns {error} (not throw) on failure, and the tool is mounted at boot.
 *
 * Run: npx tsx --test src/daemon/__tests__/artifact-feedback-handler-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'index.ts');                                    // src/daemon/index.ts
const BUILTINS = resolve(HERE, '..', 'tools', 'builtins', 'index.ts');            // builtins aggregator
const TOOL = resolve(HERE, '..', '..', 'workflow', 'artifacts', 'provenance', 'tool.ts');
const WRITER = resolve(HERE, '..', '..', 'workflow', 'artifacts', 'provenance', 'writer.ts');

const indexSrc = readFileSync(INDEX, 'utf8');
const builtinsSrc = readFileSync(BUILTINS, 'utf8');
const toolSrc = readFileSync(TOOL, 'utf8');
const writerSrc = readFileSync(WRITER, 'utf8');

/** Slice out the `'artifact.feedback.append': async (...) => { ... }` handler body. */
function handlerBody(): string {
	const start = indexSrc.indexOf("'artifact.feedback.append':");
	assert.ok(start >= 0, "no 'artifact.feedback.append' handler registered in the index.ts handler map");
	const rest = indexSrc.slice(start + "'artifact.feedback.append':".length);
	const nextKey = rest.search(/\n\t\t'[a-zA-Z.]+':/);
	return nextKey >= 0 ? rest.slice(0, nextKey) : rest;
}

test("index.ts registers an 'artifact.feedback.append' handler that delegates to appendFeedback", () => {
	assert.match(indexSrc, /'artifact\.feedback\.append':\s*async/, 'the handler is registered');
	const body = handlerBody();
	assert.match(body, /appendFeedback\(/, 'the handler delegates to appendFeedback');
	assert.match(body, /coerceRequest\(/, 'the handler shapes params via coerceRequest');
});

test("the handler returns { error } (not throw) on a bad request / ArtifactFeedbackError", () => {
	const body = handlerBody();
	assert.match(body, /return\s*\{\s*error:/, 'returns an {error} object on failure');
	assert.match(body, /ArtifactFeedbackError/, 'discriminates the typed error');
	assert.doesNotMatch(body, /throw\s+new/, 'the handler does not throw for a bad request');
});

test("the artifact-feedback tool is mounted at boot and single-sources appendFeedback", () => {
	assert.match(builtinsSrc, /import \{ registerArtifactFeedbackTool \} from '\.\.\/\.\.\/\.\.\/workflow\/artifacts\/provenance\/tool\.js'/, 'the register fn is imported');
	assert.match(builtinsSrc, /registerArtifactFeedbackTool\(\);/, 'the tool is registered in registerBuiltinTools()');
	assert.match(toolSrc, /export function registerArtifactFeedbackTool\(\)/, 'registerArtifactFeedbackTool is exported');
	assert.match(toolSrc, /registerTool\(/, 'it registers a Tool');
	assert.match(toolSrc, /appendFeedback\(/, "the tool's execute delegates to appendFeedback");
	assert.match(toolSrc, /id:\s*ARTIFACT_FEEDBACK_TOOL_ID/, 'the tool carries a canonical id');
});

test("the writer exports the append-only API + typed error", () => {
	assert.match(writerSrc, /export function appendFeedback\(/, 'appendFeedback is exported');
	assert.match(writerSrc, /export function writeArtifactJson\(/, 'writeArtifactJson is exported');
	assert.match(writerSrc, /export class ArtifactFeedbackError extends Error/, 'ArtifactFeedbackError is exported');
});
