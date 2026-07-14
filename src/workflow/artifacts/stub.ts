/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * StubArtifact — Phase A only. Written to `docs/stub/<slug>.{md,json}`
 * so the executor + storage + synthesizer wiring can be exercised
 * end-to-end without needing any real workflow.
 *
 * Schema is intentionally trivial. Two paragraphs of body, one
 * citation per step. The renderer + validator have the same shape
 * every real artifact type will follow, so real artifacts drop in
 * later without touching the framework.
 */

import type { Citation, WorkflowArtifact } from '../types.js';

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface StubBody {
	readonly title:      string;
	readonly summary:    string;
	readonly bulletList: readonly string[];
}

export type StubArtifact = WorkflowArtifact<StubBody>;

export const STUB_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Schema (JSON schema — used by validator)
// ---------------------------------------------------------------------------

export const STUB_ARTIFACT_JSON_SCHEMA = {
	type: 'object',
	required: ['meta', 'body', 'citations'],
	additionalProperties: true,
	properties: {
		meta: {
			type: 'object',
			required: ['workflow', 'runId', 'repoPath', 'createdAt', 'model', 'elapsedMs', 'schemaVersion'],
			additionalProperties: true,
		},
		body: {
			type: 'object',
			required: ['title', 'summary', 'bulletList'],
			additionalProperties: false,
			properties: {
				title:      { type: 'string', minLength: 1 },
				summary:    { type: 'string', minLength: 1 },
				bulletList: {
					type:     'array',
					minItems: 1,
					items:    { type: 'string', minLength: 1 },
				},
			},
		},
		citations: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'kind', 'ref'],
				additionalProperties: true,
				properties: {
					id:         { type: 'string' },
					kind:       { type: 'string' },
					ref:        { type: 'string' },
					quotedText: { type: 'string' },
				},
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderStubMarkdown(artifact: StubArtifact): string {
	const lines: string[] = [];
	lines.push(`# ${artifact.body.title}`);
	lines.push('');
	lines.push(artifact.body.summary);
	lines.push('');
	lines.push('## Highlights');
	lines.push('');
	for (const b of artifact.body.bulletList) {
		lines.push(`- ${b}`);
	}
	return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Runtime type guard
// ---------------------------------------------------------------------------

export function isStubArtifact(v: unknown): v is StubArtifact {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['meta'] !== 'object' || r['meta'] === null) return false;
	if (typeof r['body'] !== 'object' || r['body'] === null) return false;
	if (!Array.isArray(r['citations'])) return false;
	const body = r['body'] as Record<string, unknown>;
	if (typeof body['title'] !== 'string')   return false;
	if (typeof body['summary'] !== 'string') return false;
	if (!Array.isArray(body['bulletList']))  return false;
	return true;
}

/** Runtime guard for a citation array. */
export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string')   return false;
		if (typeof r['kind'] !== 'string') return false;
		if (typeof r['ref'] !== 'string')  return false;
	}
	return true;
}
