import { resolve } from 'node:path';
import type { Intent, ExplicitProvider } from '../shared/types.js';
import { loadConfig } from './config.js';
import { Session } from './session.js';
import { ensureAgentModel } from './lifecycle.js';
import { classify } from './classifier/index.js';
import { selectProvider } from './router.js';
import { shouldEscalate } from './escalation.js';
import { ClaudeProvider } from './providers/claude.js';
import { getToolDefinitions } from './tools/registry.js';
import { runToolLoop } from './tools/loop.js';
import { ping as pingDaemon, planGet, planSave } from './tools/mcp-client.js';
import {
  classifyOllamaError, formatOllamaFault, isOllamaDown,
  classifyDaemonError, formatDaemonFault,
} from './faults/index.js';
import {
  runDesignerPipeline,
  ValidationChannel,
  resolveTemplate,
  parseTemplateFlags,
  type DesignerInput,
} from './tasks/designer/index.js';
import { runPlanPipeline } from './tasks/plan.js';
import { runImplementPipeline } from './tasks/implement.js';
import { runRefactorPipeline } from './tasks/refactor.js';
import { runTestPipeline } from './tasks/test.js';
import { runDebugPipeline } from './tasks/debug.js';
import { findTestFile } from './tasks/test-runner.js';
import { runGraphQuery } from './tasks/graph.js';
import { runResearchPipeline } from './tasks/research.js';
// review.ts still used by designer/review.ts for context assembly helpers
import { runDocumentPipeline } from './tasks/document.js';
import {
  extractFilePaths, resolveAttachment, hasEscalationAttachment,
} from './attachments/router.js';
import { runForcedClaudePipeline } from './attachments/forced-claude.js';
import type { Attachment, ContentBlock } from '../shared/types.js';

// ---------------------------------------------------------------------------
// CLI One-Shot Mode
//
// From design doc (Phase 11):
//   insrc ask "question" — classify, execute one turn, print, exit
//   insrc plan "description" — shorthand for plan intent
//   --intent <name> — override classified intent
//   --claude — force Claude routing
//   --json — structured JSON output
//   Exit codes: 0=success, 1=error, 2=escalated but no API key
// ---------------------------------------------------------------------------

export interface OneShotOpts {
  /** Override the classified intent. */
  intent?: string | undefined;
  /** Force Claude routing. */
  claude?: boolean | undefined;
  /** Output structured JSON instead of text. */
  json?: boolean | undefined;
  /** Repo path (defaults to cwd). */
  cwd?: string | undefined;
}

export interface OneShotResult {
  /** Exit code: 0=success, 1=error, 2=escalated but no key */
  exitCode: number;
  /** The response text (or JSON string if --json). */
  output: string;
  /** The classified intent. */
  intent?: Intent | undefined;
  /** Whether Claude was used. */
  usedClaude?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Logging helpers — stderr for status, stdout for output
// ---------------------------------------------------------------------------

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run a single one-shot turn and return the result.
 *
 * Mirrors the REPL flow but executes exactly once:
 *   1. Load config, create session, init
 *   2. Classify intent (with optional override)
 *   3. Route provider (with optional --claude force)
 *   4. Assemble context
 *   5. Execute (pipeline, graph, or tool loop)
 *   6. Print output, return exit code
 */
export async function runOneShot(
  message: string,
  opts: OneShotOpts = {},
): Promise<OneShotResult> {
  const repoPath = resolve(opts.cwd ?? process.cwd());
  const config = loadConfig();

  // Wire Brave key
  if (config.keys.brave && !process.env['BRAVE_API_KEY']) {
    process.env['BRAVE_API_KEY'] = config.keys.brave;
  }

  // Quiet model check — skip pull in one-shot mode
  let ollamaOk = false;
  try {
    await ensureAgentModel(config.ollama.host);
    ollamaOk = true;
  } catch (err) {
    const fault = classifyOllamaError(err);
    log(`[cli] ${fault.message} ${fault.recovery}`);
  }

  // Create session (no periodic health checks in one-shot mode)
  const session = new Session({ repoPath, config });
  await session.init();
  session.health.stop(); // No periodic checks for one-shot
  session.health.recordOllamaResult(ollamaOk);

  const ctx = session.contextManager;

  // Extract file attachments
  const { paths: attachmentPaths, cleanedMessage: messageWithoutPaths } = extractFilePaths(message);
  const attachments: Attachment[] = [];
  const attachmentContentBlocks: ContentBlock[] = [];
  const attachmentTextParts: string[] = [];

  for (const p of attachmentPaths) {
    const resolved = resolveAttachment(
      p.startsWith('/') ? p : `${repoPath}/${p}`,
    );
    attachments.push(resolved.attachment);
    for (const w of resolved.warnings) log(w);
    if (resolved.textContent) {
      attachmentTextParts.push(`### ${resolved.attachment.name}\n${resolved.textContent}`);
    }
    if (resolved.contentBlocks) {
      attachmentContentBlocks.push(...resolved.contentBlocks);
    }
  }

  if (attachmentTextParts.length > 0) {
    ctx.setAttachmentContext(attachmentTextParts.join('\n\n'));
  }

  const classifyInput = attachments.length > 0 ? messageWithoutPaths || message : message;

  // Build classification input with overrides
  let classifyMessage = classifyInput;
  if (opts.intent) {
    classifyMessage = `/intent ${opts.intent} ${classifyInput}`;
  } else if (opts.claude) {
    classifyMessage = `@claude ${classifyInput}`;
  }

  // Classify
  const classified = await classify(classifyMessage, {
    signals: {},
    llmProvider: ollamaOk ? session.ollamaProvider : undefined,
  });

  // Force --claude if flag set but no @claude prefix was used
  let explicit = classified.explicit;
  if (opts.claude && !explicit) {
    explicit = 'claude';
  }

  // Route provider
  let route = selectProvider(classified.intent, explicit, {
    ollamaProvider: session.ollamaProvider,
    claudeProvider: session.claudeProvider,
    config: session.config,
    attachments,
  });

  log(`[cli] ${classified.intent} → ${route.label}`);

  // Exit code 2: Claude needed but no API key
  const needsClaude = route.tier !== undefined || route.label.includes('Claude');
  if (needsClaude && !session.hasClaudeKey) {
    const errMsg = `Escalated to Claude but no ANTHROPIC_API_KEY configured.`;
    if (opts.json) {
      return { exitCode: 2, output: JSON.stringify({ success: false, error: errMsg, exitCode: 2 }), intent: classified.intent };
    }
    return { exitCode: 2, output: errMsg, intent: classified.intent };
  }

  try {
    // Graph-only intent
    if (route.graphOnly) {
      const graphResult = await runGraphQuery(classified.message);
      if (!graphResult.handled) {
        // Re-route interpretive to research
        const queryEmbedding = await ctx.embedQuery(classified.message);
        const assembled = await ctx.assemble(classified.message, queryEmbedding);
        const response = await handlePipeline('research', classified.message, assembled.code.text, session, repoPath, ctx, !!opts.claude);
        return formatResult(response, classified.intent, route.tier !== undefined, opts.json);
      }
      return formatResult(graphResult.response, classified.intent, false, opts.json);
    }

    // Pipeline intents
    const pipelineIntents = ['requirements', 'design', 'plan', 'implement', 'refactor', 'test', 'debug', 'review', 'document', 'research'];
    if (pipelineIntents.includes(classified.intent)) {
      const queryEmbedding = await ctx.embedQuery(classified.message);
      const assembled = await ctx.assemble(classified.message, queryEmbedding);
      const codeContext = assembled.code.text;

      let response: string;

      // Forced-Claude path for implement/test with binary attachments
      if (route.attachmentForced && attachmentContentBlocks.length > 0
          && (classified.intent === 'implement' || classified.intent === 'test')) {
        const forcedResult = await runForcedClaudePipeline(
          classified.intent, classified.message, repoPath, codeContext,
          ctx.getActivePlanStep(), attachmentContentBlocks,
          route.provider, log,
        );
        if (forcedResult.accepted) {
          response = `${forcedResult.message}\n\nFiles:\n${forcedResult.filesWritten.map(f => `  - ${f}`).join('\n')}`;
        } else if (forcedResult.diff) {
          response = `Implementation needs review:\n\n\`\`\`diff\n${forcedResult.diff}\n\`\`\`\n\n${forcedResult.message}`;
        } else {
          response = forcedResult.message;
        }
      } else {
        response = await handlePipeline(classified.intent, classified.message, codeContext, session, repoPath, ctx, !!opts.claude);
      }

      return formatResult(response, classified.intent, route.tier !== undefined, opts.json);
    }

    // General tool loop path (fallback for any other classified intent)
    const queryEmbedding = await ctx.embedQuery(classified.message);
    const assembled = await ctx.assemble(classified.message, queryEmbedding);

    // Auto-escalation check
    if (!explicit && !route.graphOnly && route.label === 'Local') {
      const escalation = shouldEscalate(assembled, session.closureRepos);
      if (escalation.shouldEscalate && session.claudeProvider) {
        const tier = 'fast' as const;
        const model = session.config.models.tiers[tier];
        route = {
          provider: new ClaudeProvider({ model, apiKey: session.config.keys.anthropic }),
          label: 'Claude Haiku (auto-escalated)',
          graphOnly: false,
          tier,
        };
        log(`[cli] auto-escalated: ${escalation.reason}`);
      }
    }

    const messages = ctx.buildMessages(assembled, classified.message);

    // Inject content blocks for multimodal
    if (attachmentContentBlocks.length > 0 && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]!;
      if (lastMsg.role === 'user') {
        const textBlock: ContentBlock = {
          type: 'text',
          text: typeof lastMsg.content === 'string' ? lastMsg.content : '',
        };
        lastMsg.content = [textBlock, ...attachmentContentBlocks];
      }
    }

    let mcpAvailable: boolean;
    try {
      mcpAvailable = await pingDaemon();
      session.health.recordDaemonResult(mcpAvailable);
    } catch (err) {
      mcpAvailable = false;
      session.health.recordDaemonResult(false);
      const fault = classifyDaemonError(err);
      log(formatDaemonFault(fault));
    }
    const tools = getToolDefinitions({ mcpAvailable });

    let assistantResponse = '';

    if (route.provider.supportsTools) {
      const result = await runToolLoop(messages, {
        provider: route.provider,
        tools,
        intent: classified.intent,
        permissionMode: 'auto-accept',
        onTextDelta: (delta) => {
          if (!opts.json) process.stdout.write(delta);
        },
        onUsage: (usage) => {
          session.cost.inputTokens += usage.inputTokens;
          session.cost.outputTokens += usage.outputTokens;
          session.cost.turns++;
        },
      });
      if (!opts.json) process.stdout.write('\n');
      assistantResponse = result.response;
    } else {
      for await (const delta of route.provider.stream(messages)) {
        if (!opts.json) process.stdout.write(delta);
        assistantResponse += delta;
      }
      if (!opts.json) process.stdout.write('\n');
    }

    return formatResult(assistantResponse, classified.intent, route.tier !== undefined, opts.json);
  } catch (err) {
    // Classify Ollama faults for better error messages
    if (isOllamaDown(err)) {
      session.health.recordOllamaResult(false);
      const fault = classifyOllamaError(err);
      const errMsg = `${fault.message} ${fault.recovery}`;
      if (opts.json) {
        return { exitCode: 1, output: JSON.stringify({ success: false, error: errMsg, exitCode: 1 }), intent: classified.intent };
      }
      return { exitCode: 1, output: errMsg, intent: classified.intent };
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      return { exitCode: 1, output: JSON.stringify({ success: false, error: errMsg, exitCode: 1 }), intent: classified.intent };
    }
    return { exitCode: 1, output: `Error: ${errMsg}`, intent: classified.intent };
  }
}

// ---------------------------------------------------------------------------
// Plan shorthand: insrc plan "description"
// ---------------------------------------------------------------------------

/**
 * Run the plan pipeline and print the plan as a markdown checklist.
 */
export async function runPlanShorthand(
  description: string,
  opts: OneShotOpts = {},
): Promise<OneShotResult> {
  return runOneShot(description, { ...opts, intent: 'plan' });
}

// ---------------------------------------------------------------------------
// Pipeline intent handler (mirrors REPL handlePipelineIntent)
// ---------------------------------------------------------------------------

async function handlePipeline(
  intent: string,
  message: string,
  codeContext: string,
  session: Session,
  repoPath: string,
  ctx: import('./context/index.js').ContextManager,
  forceEscalate = false,
): Promise<string> {
  if (intent === 'requirements' || intent === 'design') {
    if (!session.claudeProvider) return `[error] Designer pipeline requires Claude. Set ANTHROPIC_API_KEY.`;
    log(`[cli] Running designer pipeline (${intent}, auto-approve)...`);
    const reqContext = intent === 'design' ? ctx.getTag('[requirements]') : undefined;
    const parsed = parseTemplateFlags(message);
    const template = resolveTemplate({ ...parsed, repoPath });
    const designerInput: DesignerInput = {
      message: parsed.message, codeContext, template,
      intent: intent as 'requirements' | 'design',
      requirementsDoc: reqContext ?? undefined,
      session: { repoPath, closureRepos: session.closureRepos },
    };
    const channel = new ValidationChannel();
    let output = '';
    for await (const event of runDesignerPipeline(
      designerInput, session.ollamaProvider, session.claudeProvider, channel,
      { autoApprove: true, log },
    )) {
      if (event.kind === 'progress') log(event.message);
      else if (event.kind === 'done') output = event.result.output;
    }
    return output || '[error] Designer pipeline produced no output.';
  }

  if (intent === 'plan') {
    const reqContext = ctx.getTag('[requirements]');
    const desContext = ctx.getTag('[design]');
    log('[cli] Running plan pipeline...');
    const result = await runPlanPipeline(
      message, repoPath, codeContext, reqContext, desContext,
      session.ollamaProvider, session.claudeProvider,
    );
    await planSave(result.plan);
    // Format as markdown checklist
    const lines: string[] = [`# ${result.plan.title}`, ''];
    for (const step of result.plan.steps) {
      const checkbox = step.status === 'done' ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${step.idx + 1}. ${step.title} (${step.complexity})`);
      if (step.description) lines.push(`  ${step.description}`);
    }
    return lines.join('\n');
  }

  if (intent === 'implement') {
    log('[cli] Running implement pipeline...');
    const result = await runImplementPipeline(
      message, repoPath, codeContext, '',
      session.ollamaProvider, session.claudeProvider, log,
    );
    if (result.accepted) {
      return `Implementation applied (${result.filesWritten.length} file(s)).\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    if (result.needsUserDecision) {
      return `Implementation needs review:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\nFeedback:\n${result.feedback}`;
    }
    return `Implementation failed: ${result.feedback}`;
  }

  if (intent === 'refactor') {
    log('[cli] Running refactor pipeline...');
    const result = await runRefactorPipeline(
      message, repoPath, codeContext, '',
      session.ollamaProvider, session.claudeProvider, log,
    );
    if (result.accepted) {
      return `Refactoring applied (${result.filesWritten.length} file(s)).\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    return `Refactoring failed: ${result.feedback}`;
  }

  if (intent === 'test') {
    log('[cli] Running test pipeline...');
    const fileMatch = message.match(/(?:test|spec)\s+(\S+\.\w+)/i)
      ?? message.match(/(\S+\.(?:test|spec)\.\w+)/i);
    let testFilePath = fileMatch?.[1] ?? '';
    if (!testFilePath && codeContext) {
      const srcFileMatch = codeContext.match(/(?:File|file):\s*(\S+)/);
      if (srcFileMatch) {
        const found = await findTestFile(srcFileMatch[1]!, repoPath);
        testFilePath = found ?? srcFileMatch[1]!.replace(/\.(\w+)$/, '.test.$1');
      }
    }
    if (!testFilePath) testFilePath = 'test.ts';
    if (!testFilePath.startsWith('/')) testFilePath = `${repoPath}/${testFilePath}`;

    const result = await runTestPipeline(
      message, testFilePath, codeContext, repoPath, '',
      session.ollamaProvider, session.claudeProvider, log,
    );
    if (result.passed) {
      return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    return result.message;
  }

  if (intent === 'debug') {
    const mcpUp = await pingDaemon();
    log('[cli] Running debug pipeline...');
    const result = await runDebugPipeline(
      message, repoPath, codeContext, '',
      session.ollamaProvider, session.claudeProvider,
      log, 'auto-accept', mcpUp,
    );
    if (result.fixed) {
      return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    return result.message;
  }

  if (intent === 'review') {
    if (!session.claudeProvider) return '[error] Review pipeline requires Claude. Set ANTHROPIC_API_KEY.';
    log('[cli] Running designer review pipeline...');
    const template = resolveTemplate({ format: 'markdown' });
    const designerInput: DesignerInput = {
      message, codeContext, template, intent: 'review',
      session: { repoPath, closureRepos: session.closureRepos },
    };
    const channel = new ValidationChannel();
    let output = '';
    for await (const event of runDesignerPipeline(
      designerInput, session.ollamaProvider, session.claudeProvider, channel,
    )) {
      if (event.kind === 'progress') log(event.message);
      else if (event.kind === 'done') output = event.result.output;
    }
    return output || '[error] Review pipeline produced no output.';
  }

  if (intent === 'document') {
    log('[cli] Running document pipeline...');
    const result = await runDocumentPipeline(
      message, repoPath, codeContext,
      session.ollamaProvider, session.claudeProvider,
      false, log, null,
    );
    if (result.applied) {
      return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    if (result.diff) {
      return `Documentation generated:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\n${result.message}`;
    }
    return result.message;
  }

  if (intent === 'research') {
    log('[cli] Running research pipeline...');
    const result = await runResearchPipeline(
      message, codeContext,
      session.ollamaProvider, session.claudeProvider,
      session.config.keys.brave,
      log, session.closureRepos, forceEscalate,
    );
    let response = result.answer;
    if (result.webResults.length > 0) {
      response += '\n\nSources:';
      for (let i = 0; i < result.webResults.length; i++) {
        const r = result.webResults[i]!;
        response += `\n  [${i + 1}] ${r.title} — ${r.url}`;
      }
    }
    return response;
  }

  return '';
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatResult(
  response: string,
  intent: Intent,
  usedClaude: boolean,
  json?: boolean,
): OneShotResult {
  if (json) {
    const output = JSON.stringify({
      success: true,
      intent,
      usedClaude,
      response,
    });
    return { exitCode: 0, output, intent, usedClaude };
  }
  return { exitCode: 0, output: response, intent, usedClaude };
}
