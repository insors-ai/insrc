/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The free-form lookup's final answer in parts (LLD-b9d5c5c40df5a574-s3,
 * task t9). A tool loop ends in a conversation whose size depends on what the
 * tools returned. When the table or the admission rule says the conversation
 * is not answered in one call, each tool result becomes a block of evidence
 * and the answer is written in parts by the shared helper; the request and the
 * system prompt head every part. Pure apart from the model calls it makes.
 */

import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import type { HandlingReport } from '../completeness.js';
import type { AnswerStepFound } from './driver.js';
import type { AdmissionTarget, HandlingTrigger } from './handling.js';
import { assembleBundle } from './handling-adapters.js';
import type { BundleLayers, BundleNarrative } from './handling-adapters.js';
import { runDivided } from './handling-parts.js';
import type { PartAdapter } from './handling-parts.js';
import { renderSection } from './sections.js';
import type { EvidenceBlock } from './sections.js';

const SUMMARY_CAP = 2_000;

/**
 * A tool result larger than this many bytes is cut into blocks at line breaks, so a `path:line: text` entry is never cut
 * in two. It is below the least room a section is given (the minimum section room), so a chunk always fits whole next to
 * its envelope and is never cut again mid-line by the sectioning.
 */
const RESULT_CHUNK = 3_000;

const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

/**
 * The citation a line opens with: `path:line:` (a search hit, the path may hold spaces) or the padded line number and
 * tab of a file read. The rest of the line is the content.
 */
function citationOf(line: string): { readonly prefix: string; readonly content: string } {
	const hit = /^(.+?:\d+:)(\s.*)$/s.exec(line);
	if (hit !== null) return { prefix: hit[1] as string, content: hit[2] as string };
	const numbered = /^(\s*\d+\t)(.*)$/s.exec(line);
	if (numbered !== null) return { prefix: numbered[1] as string, content: numbered[2] as string };
	return { prefix: '', content: line };
}

/**
 * The pieces of one over-long line, each at most `size` bytes at a code-point boundary. The citation is cut off first
 * and the content alone is split, so every piece opens with the whole citation (the later ones marked as continued).
 */
function splitLongLine(line: string, size: number): readonly string[] {
	const { prefix, content } = citationOf(line);
	const lead = prefix === '' ? '' : `${prefix} (continued) `;
	// A citation that leaves no room is rare; the content then gets a floor so the split still ends.
	const room = Math.max(512, size - bytesOf(lead));
	const pieces: string[] = [];
	let current = '';
	for (const ch of content) {
		if (bytesOf(current) + bytesOf(ch) > room) { pieces.push(current); current = ''; }
		current += ch;
	}
	if (current.length > 0) pieces.push(current);
	return pieces.map((piece, i) => (i === 0 ? `${prefix}${piece}` : `${lead}${piece}`));
}

/** The text in chunks of at most `size` bytes that end at a line break; a longer line is split with its citation kept on every piece. */
export function chunkAtLines(text: string, size = RESULT_CHUNK): readonly string[] {
	if (bytesOf(text) <= size) return [text];
	const chunks: string[] = [];
	let current = '';
	const flush = (): void => { if (current.length > 0) chunks.push(current); current = ''; };
	for (const line of text.split('\n')) {
		for (const piece of bytesOf(line) > size ? splitLongLine(line, size) : [line]) {
			const next = current.length === 0 ? piece : `${current}\n${piece}`;
			if (current.length > 0 && bytesOf(next) > size) { flush(); current = piece; } else current = next;
		}
	}
	flush();
	return chunks;
}

const textOf = (content: LLMMessage['content']): string => (typeof content === 'string' ? content : JSON.stringify(content));

/** The tool results of a conversation as blocks, named after the tool call that produced each. */
export function conversationBlocks(messages: readonly LLMMessage[]): readonly EvidenceBlock[] {
	const calls = new Map<string, { name: string; input: unknown }>();
	const blocks: EvidenceBlock[] = [];
	for (const message of messages) {
		if (typeof message.content === 'string') continue;
		for (const block of message.content) {
			if (block.type === 'tool_use') calls.set(block.id, { name: block.name, input: block.input });
			if (block.type === 'tool_result') {
				const call = calls.get(block.tool_use_id);
				const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
				const chunks = chunkAtLines(text);
				const ordinal = new Set(blocks.map(b => b.key.split('.')[0])).size + 1;
				chunks.forEach((chunk, j) => blocks.push({
					key: `${call?.name ?? 'tool'}#${ordinal}${chunks.length > 1 ? `.${j + 1}` : ''}`,
					envelope: { tool: call?.name ?? 'tool', input: call?.input ?? {} },
					text: chunk,
				}));
			}
		}
	}
	return blocks;
}

/** What heads every part: the system prompt and the request (the first user turn that is text). */
function headOf(messages: readonly LLMMessage[]): { system: string; request: string } {
	const system = messages.find(m => m.role === 'system');
	const user = messages.find(m => m.role === 'user' && (typeof m.content === 'string' || m.content.some(b => b.type === 'text')));
	const request = user === undefined ? ''
		: typeof user.content === 'string' ? user.content
			: user.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n');
	return { system: system === undefined ? '' : textOf(system.content), request };
}

type Reply = BundleLayers & { summary: string };

function adapterFor(messages: readonly LLMMessage[], schema: StructuredSchema): PartAdapter<Reply, BundleNarrative> {
	const { system, request } = headOf(messages);
	const partSchema = structuredClone(schema) as { properties: Record<string, Record<string, unknown>> };
	partSchema.properties['summary'] = { type: 'string', maxLength: SUMMARY_CAP };
	return {
		partSchema: partSchema as unknown as StructuredSchema,
		combineSchema: {
			type: 'object', additionalProperties: false, required: ['system', 'focus', 'summary'],
			properties: { system: { type: 'string' }, focus: { type: 'string' }, summary: { type: 'string', maxLength: SUMMARY_CAP } },
		},
		renderPart: (part) => [
			{ role: 'system', content: system },
			{ role: 'user', content: `${request}\n\nThe search was run with tools and its results were too large to answer from at once. `
				+ `The results of this part (${part.id}) follow:\n\n${part.sections.map(renderSection).join('\n\n')}\n\n`
				+ `Emit the AnalyzeContextBundle for THIS PART only, as a JSON object with the seven string fields. Keep summary under ${SUMMARY_CAP} characters.` },
		],
		renderCombine: (summaries) => [
			{ role: 'system', content: system },
			{ role: 'user', content: `${request}\n\nThe answer was written in parts. Part summaries:\n\n`
				+ summaries.map(s => `### ${s.id}\n${s.summary}`).join('\n\n')
				+ `\n\nEmit {system, focus, summary} for the whole answer; the evidence layers are assembled from the parts.` },
		],
		summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
	};
}

/** The conversation answered in parts: the bundle layers and how it was handled. */
export async function emitDivided(args: {
	readonly provider:     LLMProvider;
	readonly target:       AdmissionTarget;
	readonly messages:     readonly LLMMessage[];
	readonly schema:       StructuredSchema;
	readonly found:        AnswerStepFound;
	readonly trigger:      HandlingTrigger | undefined;
	readonly maxAttempts:  number;
	readonly execution?:   ConnectionExecutionContext | undefined;
}): Promise<{ readonly layers: BundleLayers; readonly handling: HandlingReport }> {
	const result = await runDivided<Reply, BundleNarrative>({
		provider: args.provider, target: args.target, adapter: adapterFor(args.messages, args.schema),
		blocks: conversationBlocks(args.messages), reference: [], found: args.found,
		trigger: args.trigger, maxAttempts: args.maxAttempts, connectionExecution: args.execution,
	});
	return { layers: assembleBundle('code', result.covered, result.combine), handling: result.handling };
}
