import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  ToolCall,
  ToolResult,
  ToolDefinition,
} from '../../shared/types.js';
import { executeTool } from './executor.js';
import { validateToolCall, type ValidationResult } from './validator.js';

// ---------------------------------------------------------------------------
// Tool Loop Runner
//
// Implements the agentic tool-use loop:
//   1. Send messages + tool definitions to LLM
//   2. If LLM returns tool_use → validate → execute → append results → re-prompt
//   3. Repeat until LLM returns end_turn or max iterations
//
// From design/agent.html:
//   - Read-only tools auto-execute (no validation cost)
//   - Mutating tools require Claude/Haiku validation before execution
//   - Max 25 iterations per turn to prevent runaway loops
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 25;

export interface ToolLoopOpts {
  /** The LLM provider to use for completions */
  provider: LLMProvider;
  /** Tool definitions to inject */
  tools: ToolDefinition[];
  /** User's intent string for validation context */
  intent: string;
  /** Permission mode */
  permissionMode: 'validate' | 'auto-accept';
  /** Validator LLM provider (Claude/Haiku) — only needed in validate mode */
  validator?: LLMProvider | undefined;
  /** Callback for streaming text deltas to the user */
  onTextDelta?: (delta: string) => void;
  /** Callback when a tool call is about to be executed */
  onToolCall?: (call: ToolCall, validation: ValidationResult) => void;
  /** Callback when a tool call returns */
  onToolResult?: (call: ToolCall, result: ToolResult) => void;
  /** Max tokens for LLM completions */
  maxTokens?: number | undefined;
}

export interface ToolLoopResult {
  /** Final assistant text response */
  response: string;
  /** All messages produced during the loop (for history tracking) */
  messages: LLMMessage[];
  /** Number of tool-use iterations executed */
  iterations: number;
  /** Whether the loop hit the max iteration limit */
  hitLimit: boolean;
}

/**
 * Run the agentic tool loop.
 *
 * Takes initial messages (system + history + user), sends to the LLM with
 * tool definitions, and loops on tool_use responses until the LLM produces
 * a final text response (end_turn).
 */
export async function runToolLoop(
  messages: LLMMessage[],
  opts: ToolLoopOpts,
): Promise<ToolLoopResult> {
  const { provider, tools, intent, permissionMode, validator, onTextDelta, onToolCall, onToolResult } = opts;

  // Working copy of messages — we append tool results as we go
  const workingMessages = [...messages];
  const producedMessages: LLMMessage[] = [];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    // Call LLM with tool definitions — stream text via onToken if callback provided
    const completionOpts: { tools: ToolDefinition[]; maxTokens?: number; onToken?: (t: string) => void } = { tools };
    if (opts.maxTokens !== undefined) completionOpts.maxTokens = opts.maxTokens;
    if (onTextDelta) {
      completionOpts.onToken = (token: string) => {
        finalResponse += token;
        onTextDelta(token);
      };
    }
    const llmResponse: LLMResponse = await provider.complete(workingMessages, completionOpts);

    // If no streaming callback, pick up text from the full response
    if (!onTextDelta && llmResponse.text) {
      finalResponse += llmResponse.text;
    }

    // If no tool calls, we're done
    if (llmResponse.stopReason !== 'tool_use' || !llmResponse.toolCalls?.length) {
      // Record assistant message
      producedMessages.push({ role: 'assistant', content: finalResponse });
      break;
    }

    // Process tool calls
    iterations++;
    const toolResults: ToolResult[] = [];

    for (const call of llmResponse.toolCalls) {
      // Validate
      const validation = await validateToolCall(call, {
        intent,
        mode: permissionMode,
        validator,
      });

      onToolCall?.(call, validation);

      if (validation.action === 'rejected') {
        toolResults.push({
          toolCallId: call.id,
          content: `[rejected] ${validation.reason}`,
          isError: true,
        });
        continue;
      }

      // Execute (auto-execute or approved)
      const result = await executeTool(call);
      onToolResult?.(call, result);
      toolResults.push(result);
    }

    // Build the assistant message with tool calls (text so far + indication of tool use)
    const assistantContent = llmResponse.text
      ? `${llmResponse.text}\n[tool calls executed]`
      : '[tool calls executed]';

    workingMessages.push({ role: 'assistant', content: assistantContent });
    producedMessages.push({ role: 'assistant', content: assistantContent });

    // Append tool results as user message (standard pattern for tool-use loops)
    const resultContent = toolResults
      .map(r => {
        const prefix = r.isError ? '[error] ' : '';
        return `<tool_result tool_call_id="${r.toolCallId}">\n${prefix}${r.content}\n</tool_result>`;
      })
      .join('\n\n');

    workingMessages.push({ role: 'user', content: resultContent });
    producedMessages.push({ role: 'user', content: resultContent });

    // Reset accumulated text for next iteration
    finalResponse = '';
  }

  const hitLimit = iterations >= MAX_ITERATIONS;
  if (hitLimit && !finalResponse) {
    finalResponse = '[max tool iterations reached]';
    producedMessages.push({ role: 'assistant', content: finalResponse });
  }

  return {
    response: finalResponse,
    messages: producedMessages,
    iterations,
    hitLimit,
  };
}
