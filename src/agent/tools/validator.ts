import type { ToolCall, LLMProvider } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Tool call validation — read-only vs mutating classification
//
// From design/agent.html tool execution pipeline:
//   - Read-only tools auto-execute (no Claude cost)
//   - Mutating tools require Claude/Haiku validation before execution
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { action: 'auto-execute' }
  | { action: 'approved' }
  | { action: 'rejected'; reason: string };

// ---------------------------------------------------------------------------
// Read-only tools — auto-execute without validation
// ---------------------------------------------------------------------------

const READ_ONLY_TOOLS: Set<string> = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  'graph_entity', 'graph_search', 'graph_callers', 'graph_callees', 'graph_query',
  'plan_get',
]);

// ---------------------------------------------------------------------------
// Bash command classification patterns
// ---------------------------------------------------------------------------

/** Read-only kubectl subcommands */
const KUBECTL_READONLY = /^\s*kubectl\s+(get|logs|describe|top|version|cluster-info|api-resources|explain)\b/;

/** Read-only git subcommands */
const GIT_READONLY = /^\s*git\s+(status|log|diff|blame|show|branch|tag|remote|stash\s+list|ls-files|ls-tree|shortlog)\b/;

/** Test runners / build / lint — no persistent side effects */
const TEST_BUILD_LINT = /^\s*(npm\s+(test|run\s+(test|lint|build|check|typecheck))|npx\s+(jest|vitest|mocha|tsx|tsc)|yarn\s+(test|lint|build)|pnpm\s+(test|lint|build)|pytest|go\s+test|cargo\s+test|make\s+(test|check|lint|build))\b/;

/** Read-only inspection commands */
const INSPECT_READONLY = /^\s*(ls|pwd|echo|env|printenv|whoami|hostname|uname|date|wc|sort|uniq|head|tail|cat|less|more|file|which|type|man|df|du|free|top|ps|id)\b/;

/**
 * Classify a Bash command as read-only or mutating.
 */
export function classifyBashCommand(command: string): 'read-only' | 'mutating' {
  if (KUBECTL_READONLY.test(command)) return 'read-only';
  if (GIT_READONLY.test(command)) return 'read-only';
  if (TEST_BUILD_LINT.test(command)) return 'read-only';
  if (INSPECT_READONLY.test(command)) return 'read-only';
  return 'mutating';
}

/**
 * Classify a tool call as read-only (auto-execute) or mutating (needs validation).
 */
export function classifyToolCall(call: ToolCall): 'read-only' | 'mutating' {
  if (READ_ONLY_TOOLS.has(call.name)) return 'read-only';

  if (call.name === 'Bash') {
    const command = call.input['command'];
    if (typeof command === 'string') {
      return classifyBashCommand(command);
    }
    return 'mutating'; // missing command — treat as unsafe
  }

  // Write, Edit, plan_step_update, and anything unknown → mutating
  return 'mutating';
}

// ---------------------------------------------------------------------------
// Claude/Haiku validation for mutating calls
// ---------------------------------------------------------------------------

/**
 * Send a mutating tool call to Claude/Haiku for validation.
 *
 * Claude sees only: the user's intent, the tool name, and the command/input.
 * It does NOT see tool output. Responds APPROVED or REJECTED with reason.
 */
export async function validateWithClaude(
  call: ToolCall,
  intent: string,
  validator: LLMProvider,
): Promise<ValidationResult> {
  const inputSummary = call.name === 'Bash'
    ? `command: ${call.input['command']}`
    : JSON.stringify(call.input, null, 2).slice(0, 500);

  const prompt = [
    {
      role: 'system' as const,
      content:
        `You are a tool call validator. The user's intent is "${intent}". ` +
        `A local AI model wants to execute the following tool call. ` +
        `Reply with exactly "APPROVED" if the call is safe and aligned with the intent, ` +
        `or "REJECTED: <reason>" if it is dangerous, misaligned, or suspicious.`,
    },
    {
      role: 'user' as const,
      content: `Tool: ${call.name}\nInput: ${inputSummary}`,
    },
  ];

  try {
    const response = await validator.complete(prompt, {
      maxTokens: 64,
      temperature: 0,
    });

    const text = response.text.trim();

    if (text.startsWith('APPROVED')) {
      return { action: 'approved' };
    }

    const rejectedMatch = text.match(/^REJECTED:\s*(.+)/i);
    if (rejectedMatch) {
      return { action: 'rejected', reason: rejectedMatch[1]!.trim() };
    }

    // Unparseable response — approve to avoid blocking (conservative would be reject)
    return { action: 'approved' };
  } catch {
    // Validator unavailable — approve to avoid blocking the agent
    return { action: 'approved' };
  }
}

/**
 * Full validation pipeline for a tool call.
 *
 * In auto-accept mode, all calls are auto-executed (no Claude validation).
 * In validate mode, mutating calls go to Claude/Haiku first.
 */
export async function validateToolCall(
  call: ToolCall,
  opts: {
    intent: string;
    mode: 'validate' | 'auto-accept';
    validator?: LLMProvider | undefined;
  },
): Promise<ValidationResult> {
  const classification = classifyToolCall(call);

  if (classification === 'read-only') {
    return { action: 'auto-execute' };
  }

  // Mutating call
  if (opts.mode === 'auto-accept') {
    return { action: 'auto-execute' };
  }

  // Validate mode — send to Claude/Haiku
  if (opts.validator) {
    return validateWithClaude(call, opts.intent, opts.validator);
  }

  // No validator available — auto-execute with warning
  return { action: 'auto-execute' };
}
