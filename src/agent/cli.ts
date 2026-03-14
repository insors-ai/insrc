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
  resolveTemplate,
  parseTemplateFlags,
  type DesignerInput,
} from './tasks/designer/index.js';
import { runDesignerReview } from './tasks/designer/review.js';
import { plannerAgent } from './planner/agent.js';
import type { PlannerInput, PlannerState } from './planner/agent-state.js';
import { brainstormAgent } from './tasks/brainstorm/agent.js';
import type { BrainstormState } from './tasks/brainstorm/agent-state.js';
import type { BrainstormInput } from './tasks/brainstorm/types.js';
import { pairAgent } from './tasks/pair/agent.js';
import type { PairInput } from './tasks/pair/types.js';
import { delegateAgent } from './tasks/delegate/agent.js';
import type { DelegateInput } from './tasks/delegate/types.js';
import { detectScope } from './classifier/scope.js';
import { runAgent } from './framework/runner.js';
import { ReplChannel } from './framework/channel.js';
import { TestChannel } from './framework/test-channel.js';
import type { RunResult } from './framework/types.js';
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
    llmProvider: ollamaOk ? session.resolver.resolve('classifier', 'classify') : undefined,
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
    const designerClaude = session.resolver.resolveOrNull('designer', 'review');
    if (!designerClaude) return `[error] Designer pipeline requires Claude. Set ANTHROPIC_API_KEY.`;
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
    const agentConfig = loadConfig();
    const replChannel = new ReplChannel({ log: { info: log, debug: log, error: log }, prompt: 'designer> ' });
    const result: RunResult = await runAgent({
      definition: (await import('./tasks/designer/agent.js')).designerAgent as unknown as import('./framework/types.js').AgentDefinition,
      channel: replChannel,
      options: { input: designerInput, repo: repoPath },
      config: agentConfig,
      providers: {
        local: session.ollamaProvider,
        claude: session.claudeProvider,
        resolve: session.activeResolver.resolve.bind(session.activeResolver),
        resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
      },
    });
    const finalState = result.result as Record<string, unknown>;
    return (finalState['assembledOutput'] as string | undefined) ?? '[error] Designer agent produced no output.';
  }

  if (intent === 'plan') {
    log('[cli] Running planner agent...');
    const plannerInput: PlannerInput = {
      message,
      codeContext,
      session: { repoPath, closureRepos: session.closureRepos },
    };
    const agentConfig = loadConfig();
    const replChannel = new ReplChannel({ log: { info: log, debug: log, error: log }, prompt: 'planner> ' });
    const result: RunResult = await runAgent({
      definition: plannerAgent as unknown as import('./framework/types.js').AgentDefinition,
      channel: replChannel,
      options: { input: plannerInput, repo: repoPath },
      config: agentConfig,
      providers: {
        local: session.ollamaProvider,
        claude: session.claudeProvider,
        resolve: session.activeResolver.resolve.bind(session.activeResolver),
        resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
      },
    });
    const finalState = result.result as PlannerState;
    if (finalState.plan) {
      await planSave(finalState.plan as unknown as import('../shared/types.js').Plan);
    }
    return finalState.serializedOutput ?? '[error] Planner agent produced no output.';
  }

  if (intent === 'brainstorm') {
    log('[cli] Running brainstorm agent...');
    const brainstormInput: BrainstormInput = {
      message,
      codeContext,
      session: { repoPath, closureRepos: session.closureRepos },
    };
    const agentConfig = loadConfig();
    const replChannel = new ReplChannel({ log: { info: log, debug: log, error: log }, prompt: 'brainstorm> ' });
    const result: RunResult = await runAgent({
      definition: brainstormAgent as unknown as import('./framework/types.js').AgentDefinition,
      channel: replChannel,
      options: { input: brainstormInput, repo: repoPath },
      config: agentConfig,
      providers: {
        local: session.ollamaProvider,
        claude: session.claudeProvider,
        resolve: session.activeResolver.resolve.bind(session.activeResolver),
        resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
      },
    });
    const finalState = result.result as BrainstormState;
    return finalState.assembledOutput ?? '[error] Brainstorm agent produced no output.';
  }

  if (intent === 'implement' || intent === 'refactor') {
    const scope = detectScope(message);
    const mode = intent as 'implement' | 'refactor';

    if (scope === 'batch') {
      log(`[cli] Running delegate agent (${intent}, batch scope)...`);
      return runDelegateCli(message, codeContext, session, repoPath, ctx);
    }

    log(`[cli] Running pair agent (${mode})...`);
    return runPairCli(message, codeContext, mode, session, repoPath, ctx);
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
      session.resolver.resolve('test', 'generate'),
      session.resolver.resolveOrNull('test', 'validate'), log,
    );
    if (result.passed) {
      return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
    }
    return result.message;
  }

  if (intent === 'debug') {
    log('[cli] Running pair agent (debug)...');
    return runPairCli(message, codeContext, 'debug', session, repoPath, ctx);
  }

  if (intent === 'review') {
    const reviewClaude = session.resolver.resolveOrNull('designer', 'review');
    if (!reviewClaude) return '[error] Review pipeline requires Claude. Set ANTHROPIC_API_KEY.';
    log('[cli] Running designer review pipeline...');
    const template = resolveTemplate({ format: 'markdown' });
    const designerInput: DesignerInput = {
      message, codeContext, template, intent: 'review',
      session: { repoPath, closureRepos: session.closureRepos },
    };
    const reviewResult = await runDesignerReview(designerInput, reviewClaude, false, log);
    return reviewResult.output || '[error] Review pipeline produced no output.';
  }

  if (intent === 'document') {
    log('[cli] Running document pipeline...');
    const result = await runDocumentPipeline(
      message, repoPath, codeContext,
      session.resolver.resolve('document', 'generate'),
      session.resolver.resolveOrNull('document', 'review'),
      false, log,
      session.resolver.resolveOrNull('document', 'escalate'),
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
      session.resolver.resolve('research', 'query'),
      session.resolver.resolveOrNull('research', 'synthesize'),
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
// Pair / Delegate CLI runners (non-interactive, auto-approve gates)
// ---------------------------------------------------------------------------

async function runPairCli(
  message: string,
  codeContext: string,
  mode: 'implement' | 'refactor' | 'debug' | 'explore',
  session: Session,
  repoPath: string,
  ctx: import('./context/index.js').ContextManager,
): Promise<string> {
  const designSpec = ctx.getTag('[design]') ?? undefined;
  const pairInput: PairInput = {
    message, codeContext, designSpec, mode,
    session: { repoPath, closureRepos: session.closureRepos },
  };
  const agentConfig = loadConfig();
  // CLI is non-interactive — use TestChannel with auto-approve for gates
  const channel = new TestChannel([
    { action: 'approve' },   // review-gate: approve first proposal
    { action: 'done' },      // review-gate: done after first apply
  ]);

  const result: RunResult = await runAgent({
    definition: pairAgent as unknown as import('./framework/types.js').AgentDefinition,
    channel,
    options: { input: pairInput, repo: repoPath },
    config: agentConfig,
    providers: {
      local: session.ollamaProvider,
      claude: session.claudeProvider,
      resolve: session.activeResolver.resolve.bind(session.activeResolver),
      resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
    },
  });

  const finalState = result.result as import('./tasks/pair/agent-state.js').PairState;
  const summary = finalState.conversationSummary || 'Pair session completed.';

  if (finalState.changesApplied.length > 0) {
    const files = finalState.changesApplied.map(c => c.file).join('\n  - ');
    return `${summary}\n\nFiles changed:\n  - ${files}`;
  }
  return summary;
}

async function runDelegateCli(
  message: string,
  codeContext: string,
  session: Session,
  repoPath: string,
  ctx: import('./context/index.js').ContextManager,
): Promise<string> {
  const designSpec = ctx.getTag('[design]') ?? undefined;
  const delegateInput: DelegateInput = {
    message, codeContext, designSpec,
    session: { repoPath, closureRepos: session.closureRepos },
  };
  const agentConfig = loadConfig();
  // CLI is non-interactive — auto-approve plan and continue through execution
  const channel = new TestChannel([
    { action: 'approve' },   // approve-plan-gate
    // failure-gate responses — retry then skip if still failing
    { action: 'retry' },
    { action: 'skip' },
    { action: 'skip' },
    { action: 'skip' },
  ]);

  const result: RunResult = await runAgent({
    definition: delegateAgent as unknown as import('./framework/types.js').AgentDefinition,
    channel,
    options: { input: delegateInput, repo: repoPath },
    config: agentConfig,
    providers: {
      local: session.ollamaProvider,
      claude: session.claudeProvider,
      resolve: session.activeResolver.resolve.bind(session.activeResolver),
      resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
    },
  });

  const finalState = result.result as import('./tasks/delegate/agent-state.js').DelegateState;
  const summary = `Delegate execution complete: ${finalState.stepResults.length} steps executed, ${finalState.filesChanged.length} files changed.`;

  if (finalState.commits.length > 0) {
    return `${summary}\n\nCommits:\n${finalState.commits.map(c => `  - ${c}`).join('\n')}`;
  }
  return summary;
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
