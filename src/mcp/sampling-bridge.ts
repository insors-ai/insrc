/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sampling bridge -- adapts the MCP SDK's `server.createMessage()`
 * (server -> client sampling) into a `SamplingCallback` the
 * `McpSamplingProvider` can consume.
 *
 * The bridge is a thin translator: it converts the framework's
 * `SamplingRequest` shape into the SDK's `CreateMessageRequestParamsBase`,
 * awaits the client's response, and translates the SDK's
 * `CreateMessageResult` back into the framework's `SamplingResponse`.
 *
 * Nothing about the analyze framework should reach through here to
 * touch the MCP SDK directly -- the abstraction that makes tests
 * cheap (`McpSamplingProvider` takes a plain function) also means
 * the SDK is contained to the MCP layer, so upgrading the SDK version
 * only touches this file.
 */

import type {
	CreateMessageRequestParamsBase,
	CreateMessageResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server as McpServerLowLevel } from '@modelcontextprotocol/sdk/server/index.js';

import type {
	SamplingCallback,
	SamplingRequest,
	SamplingResponse,
} from '../agent/providers/mcp-sampling-provider.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('mcp:sampling-bridge');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Build a `SamplingCallback` bound to a given MCP server instance.
 * Every invocation issues a fresh `sampling/createMessage` request
 * over the underlying transport; the returned callback is safe to
 * hold across many analyze runs.
 *
 * The caller is responsible for verifying the client declared the
 * `sampling` capability at initialize time. If it did not, invoking
 * this callback surfaces the SDK's error verbatim (typically an
 * `MCPError -32601 Method not found`).
 */
export function makeSamplerFromMcpServer(
	server: McpServerLowLevel,
): SamplingCallback {
	return async (request: SamplingRequest): Promise<SamplingResponse> => {
		const sdkParams = toSdkParams(request);
		const t0 = Date.now();
		let result: CreateMessageResult;
		try {
			result = await server.createMessage(sdkParams);
		} catch (err) {
			log.warn(
				{ err: (err as Error).message, elapsedMs: Date.now() - t0 },
				'mcp sampling/createMessage failed',
			);
			throw err;
		}
		log.debug(
			{
				elapsedMs:  Date.now() - t0,
				model:      result.model,
				stopReason: result.stopReason,
			},
			'mcp sampling/createMessage OK',
		);
		return fromSdkResult(result);
	};
}

// ---------------------------------------------------------------------------
// Translators
// ---------------------------------------------------------------------------

/**
 * Convert the framework's `SamplingRequest` into the SDK's
 * `CreateMessageRequestParamsBase`. The SDK's `Message` type carries
 * a discriminated `content` union (text / image / audio); we only
 * ever emit `type: 'text'` because the analyze framework's inner
 * calls are text-only.
 */
export function toSdkParams(request: SamplingRequest): CreateMessageRequestParamsBase {
	const messages = request.messages.map(m => ({
		role:    m.role,
		content: { type: 'text' as const, text: m.content },
	}));
	// `maxTokens` is required by the MCP spec (it's not optional at
	// the wire) -- if the caller didn't set one, pick a defensible
	// default so we never send an unbounded sampling request.
	const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
	const params: CreateMessageRequestParamsBase = {
		messages,
		maxTokens,
	};
	if (request.systemPrompt !== undefined) {
		(params as { systemPrompt?: string }).systemPrompt = request.systemPrompt;
	}
	if (request.temperature !== undefined) {
		(params as { temperature?: number }).temperature = request.temperature;
	}
	if (request.stopSequences !== undefined && request.stopSequences.length > 0) {
		(params as { stopSequences?: readonly string[] }).stopSequences = request.stopSequences;
	}
	if (request.modelPreferences !== undefined) {
		const hints = request.modelPreferences.hints;
		(params as { modelPreferences?: unknown }).modelPreferences = {
			...(hints !== undefined && hints.length > 0
				? { hints: hints.map(h => ({ name: h })) }
				: {}),
			...(request.modelPreferences.costPriority !== undefined
				? { costPriority: request.modelPreferences.costPriority }
				: {}),
			...(request.modelPreferences.speedPriority !== undefined
				? { speedPriority: request.modelPreferences.speedPriority }
				: {}),
			...(request.modelPreferences.intelligencePriority !== undefined
				? { intelligencePriority: request.modelPreferences.intelligencePriority }
				: {}),
		};
	}
	return params;
}

/**
 * Convert the SDK's `CreateMessageResult` into the framework's
 * `SamplingResponse`. Content blocks other than text (image, audio)
 * are dropped with a warning -- the analyze framework's inner calls
 * expect text-only responses, and a client that returns image/audio
 * would break every downstream code path anyway.
 */
export function fromSdkResult(result: CreateMessageResult): SamplingResponse {
	const content = extractTextContent(result.content);
	if (content === undefined) {
		throw new Error(
			`mcp sampling: response content was not text (type=${(result.content as { type?: string }).type ?? 'unknown'})`,
		);
	}
	const response: SamplingResponse = {
		role:    result.role === 'assistant' ? 'assistant' : 'user',
		content,
		...(result.model     !== undefined ? { model:     result.model     } : {}),
		...(result.stopReason !== undefined ? { stopReason: result.stopReason } : {}),
	};
	return response;
}

function extractTextContent(content: CreateMessageResult['content']): string | undefined {
	if (typeof content !== 'object' || content === null) return undefined;
	const c = content as { type?: string; text?: string };
	if (c.type === 'text' && typeof c.text === 'string') return c.text;
	return undefined;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default `maxTokens` when neither the caller nor the surrounding
 * framework sets one. `20_480` matches the analyze framework's
 * `ollamaNumPredict` default so a bundle sized to the qwen3.6
 * output budget also fits under the sampling wire.
 */
export const DEFAULT_MAX_TOKENS = 20_480;
