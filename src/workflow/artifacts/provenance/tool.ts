/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) — the daemon tool wrapper for the append-only
 * feedback writer.
 *
 * `artifact_feedback_append` is a thin boundary: validate the input, delegate to
 * `appendFeedback`, and return the `{ artifactPath, entryId, total }` result. The
 * identical capability is reachable on the IPC surface (`artifact.feedback.append`
 * in daemon/index.ts). Mirrors the `registerDocgenTool` idiom.
 */

import { registerTool } from '../../../daemon/tools/registry.js';
import type { Tool, ToolInput, ToolResult } from '../../../daemon/tools/types.js';
import { getLogger } from '../../../shared/logger.js';

import { appendFeedback, ArtifactFeedbackError, type AppendFeedbackRequest } from './writer.js';
import type { FeedbackEntry, ProvenanceTarget } from './types.js';

const log = getLogger('artifacts:provenance:tool');

export const ARTIFACT_FEEDBACK_TOOL_ID = 'artifact_feedback_append';

/** The append-feedback daemon tool. Exported so a surface-parity test can assert
 *  its inputSchema shape. */
export const artifactFeedbackTool: Tool = {
	id: ARTIFACT_FEEDBACK_TOOL_ID,
	description:
		'Append one post-hoc, human-authored feedback entry to a workflow artifact JSON ' +
		'(DEF/HLD/LLD/PLAN). Append-only: existing entries are never edited or removed, and ' +
		'every other artifact key is preserved byte-for-byte. Inputs: { artifactPath, author, ' +
		'comment, target: { file, version?, segment? }, kind? }. Returns { artifactPath, entryId, total }.',
	inputSchema: {
		type: 'object',
		required: ['artifactPath', 'author', 'comment', 'target'],
		additionalProperties: false,
		properties: {
			artifactPath: { type: 'string', description: 'Absolute path to the artifact JSON under .insrc/artifacts or docs/.' },
			author:       { type: 'string', minLength: 1 },
			comment:      { type: 'string', minLength: 1 },
			timestamp:    { type: 'string', description: 'ISO-8601; defaults to now when omitted.' },
			kind:         { enum: ['feedback', 'suggestion', 'comment'] },
			target: {
				type: 'object',
				required: ['file'],
				additionalProperties: false,
				properties: {
					file:    { type: 'string' },
					version: { type: 'string' },
					segment: {
						type: 'object',
						required: ['startLine', 'endLine'],
						additionalProperties: false,
						properties: { startLine: { type: 'integer' }, endLine: { type: 'integer' } },
					},
				},
			},
		},
	},
	requiresApproval: false,

	async execute(input: ToolInput): Promise<ToolResult> {
		try {
			const req = coerceRequest(input);
			const result = appendFeedback(req);
			return {
				output: `feedback appended (${result.entryId}); total ${result.total}`,
				format: 'json',
				success: true,
				data: result,
			};
		} catch (err) {
			const msg = err instanceof ArtifactFeedbackError ? err.message : (err as Error).message;
			log.info({ err: msg }, 'artifact_feedback_append failed');
			return { output: `artifact_feedback_append failed: ${msg}`, format: 'text', success: false, error: msg };
		}
	},
};

/** Shape the loosely-typed tool input into a validated AppendFeedbackRequest.
 *  Throws ArtifactFeedbackError on a missing/blank required field. */
export function coerceRequest(input: ToolInput): AppendFeedbackRequest {
	const artifactPath = typeof input['artifactPath'] === 'string' ? input['artifactPath'] : '';
	if (artifactPath.length === 0) throw new ArtifactFeedbackError('artifact_feedback_append requires `artifactPath`');
	const targetIn = input['target'];
	if (typeof targetIn !== 'object' || targetIn === null || typeof (targetIn as { file?: unknown }).file !== 'string') {
		throw new ArtifactFeedbackError('artifact_feedback_append requires `target.file`');
	}
	const t = targetIn as { file: string; version?: unknown; segment?: unknown };
	const target: ProvenanceTarget = {
		file: t.file,
		...(typeof t.version === 'string' ? { version: t.version } : {}),
		...(isSegment(t.segment) ? { segment: t.segment } : {}),
	};
	const kind = input['kind'];
	const entry: AppendFeedbackRequest['entry'] = {
		author:  typeof input['author'] === 'string' ? input['author'] : '',
		comment: typeof input['comment'] === 'string' ? input['comment'] : '',
		target,
		...(typeof input['timestamp'] === 'string' ? { timestamp: input['timestamp'] } : {}),
		...(kind === 'feedback' || kind === 'suggestion' || kind === 'comment' ? { kind } : {}),
	};
	return { artifactPath, entry };
}

function isSegment(v: unknown): v is NonNullable<FeedbackEntry['target']['segment']> {
	return typeof v === 'object' && v !== null
		&& typeof (v as { startLine?: unknown }).startLine === 'number'
		&& typeof (v as { endLine?: unknown }).endLine === 'number';
}

/** Register the artifact-feedback tool on the daemon tool surface. Idempotent-safe
 *  via the registry's overwrite-warn; called once at daemon boot. */
export function registerArtifactFeedbackTool(): void {
	registerTool(artifactFeedbackTool);
}
