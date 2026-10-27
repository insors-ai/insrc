/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LLMMessage, ToolDefinition } from '../../shared/types.js';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Native tool calls on an assistant turn (Ollama SDK passes these
   *  through to the chat template; for qwen3-coder they render as
   *  `<tool_call>` chat-template tokens the model recognises). */
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

/**
 * Translate `LLMMessage[]` into Ollama's native shape. Structured
 * content blocks (`tool_use` on assistant turns, `tool_result` on
 * user turns) are converted to the SDK's `tool_calls` field and
 * `role: 'tool'` messages respectively, so the chat template carries
 * the structured signal instead of a mimicable text marker.
 */
export function toOllamaMessages(messages: readonly LLMMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    // Multi-block content. Separate by type.
    const texts: string[] = [];
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const toolResults: Array<{ id: string; content: string; isError: boolean }> = [];
    for (const b of m.content) {
      if (b.type === 'text') texts.push(b.text);
      else if (b.type === 'tool_use') toolUses.push({ id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      else if (b.type === 'tool_result') toolResults.push({ id: b.tool_use_id, content: b.content, isError: b.isError === true });
      // image / document blocks are skipped here -- this provider doesn't surface them.
    }

    if (toolResults.length > 0) {
      // Each tool_result becomes a separate `role: 'tool'` message
      // so the model sees them as the conversation's tool-side
      // returns rather than mixed user content.
      for (const tr of toolResults) {
        out.push({
          role: 'tool',
          content: tr.isError ? `[error] ${tr.content}` : tr.content,
        });
      }
      continue;
    }

    if (m.role === 'assistant' && toolUses.length > 0) {
      out.push({
        role: 'assistant',
        content: texts.join('\n'),
        tool_calls: toolUses.map(tu => ({
          function: { name: tu.name, arguments: tu.input },
        })),
      });
      continue;
    }

    out.push({ role: m.role, content: texts.join('\n') });
  }
  return out;
}


export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function toOllamaTools(tools: readonly ToolDefinition[]): OllamaTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

