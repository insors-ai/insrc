import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { loadConfig } from './config.js';
import { Session } from './session.js';
import { ensureAgentModel } from './lifecycle.js';
import { classify } from './classifier/index.js';
import { selectProvider } from './router.js';
import { announceRoute, announceCost, announceOpus, shouldEscalate } from './escalation.js';
import { buildSignals } from './smart-router.js';
import { ClaudeProvider } from './providers/claude.js';
import { getToolDefinitions } from './tools/registry.js';
import { runToolLoop } from './tools/loop.js';
import { ping as pingDaemon, sessionSave, sessionPrune, planGet, planSave, planStepUpdate, planDelete, planNextStep, planResetStale } from './tools/mcp-client.js';
import {
  classifyOllamaError, formatOllamaFault, isOllamaDown,
  classifyDaemonError, formatDaemonFault, attemptRestart, annotateStale, isGraphPotentiallyStale,
  type ComponentState,
} from './faults/index.js';
import {
  resolveTemplate,
  parseTemplateFlags,
  type DesignerInput,
} from './tasks/designer/index.js';
import { runDesignerReview } from './tasks/designer/review.js';
import { designerAgent } from './tasks/designer/agent.js';
import type { DesignerState } from './tasks/designer/agent-state.js';
import { plannerAgent } from './planner/agent.js';
import type { PlannerState, PlannerInput } from './planner/agent-state.js';
import { brainstormAgent } from './tasks/brainstorm/agent.js';
import type { BrainstormState } from './tasks/brainstorm/agent-state.js';
import type { BrainstormInput } from './tasks/brainstorm/types.js';
import { pairAgent } from './tasks/pair/agent.js';
import type { PairState } from './tasks/pair/agent-state.js';
import type { PairInput, PairMode } from './tasks/pair/types.js';
import { delegateAgent } from './tasks/delegate/agent.js';
import type { DelegateState } from './tasks/delegate/agent-state.js';
import type { DelegateInput } from './tasks/delegate/types.js';
import { detectScope } from './classifier/scope.js';
import { runAgent } from './framework/runner.js';
import { ReplChannel } from './framework/channel.js';
import { readIndex, readCheckpoint, resolveRunDir } from './framework/checkpoint.js';
import type { RunResult } from './framework/types.js';
import { runImplementPipeline } from './tasks/implement.js';
import { runRefactorPipeline } from './tasks/refactor.js';
import { runTestPipeline } from './tasks/test.js'; // legacy — kept for fallback
import { testerAgent } from './tasks/tester/agent.js';
import type { TesterState } from './tasks/tester/agent-state.js';
import type { TesterInput } from './tasks/tester/types.js';
import { runDebugPipeline } from './tasks/debug.js';
import { findTestFile } from './tasks/test-runner.js';
import { runGraphQuery } from './tasks/graph.js';
import { runResearchPipeline } from './tasks/research.js';
// review.ts still used by designer/review.ts for context assembly helpers
import { runDocumentPipeline } from './tasks/document.js';
import {
  extractFilePaths, resolveAttachment, hasEscalationAttachment,
  type ResolvedAttachment,
} from './attachments/router.js';
import { runForcedClaudePipeline } from './attachments/forced-claude.js';
import type { Attachment, ContentBlock } from '../shared/types.js';
import { getLogger, toLogFn } from '../shared/logger.js';
const log = getLogger('agent');

/**
 * Start the interactive agent REPL.
 */
export async function startRepl(cwd?: string): Promise<void> {
  const repoPath = resolve(cwd ?? process.cwd());
  const config = loadConfig();

  // Wire config keys into env for executor tools (WebSearch uses BRAVE_API_KEY)
  if (config.keys.brave && !process.env['BRAVE_API_KEY']) {
    process.env['BRAVE_API_KEY'] = config.keys.brave;
  }

  // Pre-flight checks
  log.info('starting...');

  // 1. Check Ollama and pull agent model if needed
  try {
    await ensureAgentModel(config.ollama.host, pct => {
      process.stdout.write(`\r[agent] pulling model... ${pct}%`);
    });
  } catch {
    log.warn('Ollama not available — local model disabled. Use @claude prefix.');
  }

  // 1b. First-run Brave key setup (one-time, skippable)
  await promptBraveKeySetup(config);

  // 2. Create session
  const session = new Session({ repoPath, config });
  await session.init();

  // Health change logging
  session.health.setOnChange((component, prev, next) => {
    if (next === 'unavailable') {
      log.info(`${component} is now unavailable (was ${prev})`);
    } else if (next === 'healthy' && prev !== 'healthy') {
      log.info(`${component} recovered → healthy`);
    }
  });

  // Best-effort pruning of expired sessions on start (fire-and-forget)
  void sessionPrune();

  // Reset stale in_progress plan step locks from crashed sessions (fire-and-forget)
  void (async () => {
    const plan = await planGet({ repoPath });
    if (plan?.status === 'active') {
      const reset = await planResetStale(plan.id);
      if (reset > 0) log.info(`reset ${reset} stale plan step lock(s)`);
    }
  })();

  const ollamaOk = await session.ollamaAvailable;
  session.health.recordOllamaResult(ollamaOk);

  // Record initial daemon health
  const daemonInitOk = await pingDaemon();
  session.health.recordDaemonResult(daemonInitOk);

  log.info(`repo: ${repoPath}`);
  log.info(`ollama: ${ollamaOk ? 'connected' : 'unavailable'}`);
  log.info(`claude: ${session.hasClaudeKey ? 'configured' : 'not configured (set ANTHROPIC_API_KEY or add to ~/.insrc/config.json)'}`);
  log.info('');
  log.info('Type a message to chat. Prefix with @claude, @opus, @local, or /intent <name> to route.');
  log.info(`permissions: ${session.permissionMode}`);
  log.info('Commands: /status, /cost, /plan, /forget, /toggle-permissions, /auto, /exit');
  log.info('');

  // 3. REPL loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'insrc> ',
  });

  const ctx = session.contextManager;
  let seeded = false; // cross-session seeding happens on first turn

  rl.prompt();

  // Session close helper — used by /exit and SIGINT
  let closed = false;
  async function closeSession(): Promise<void> {
    if (closed) return;
    closed = true;
    try {
      await session.close();
    } catch {
      // Daemon may be down — silently skip
    }
  }

  rl.on('line', async (line: string) => {
    const raw = line.trim();
    if (!raw) { rl.prompt(); return; }

    // Commands
    if (raw === '/exit') {
      log.info('Closing session...');
      await closeSession();
      log.info('Session closed.');
      rl.close();
      return;
    }

    if (raw === '/status') {
      const snap = session.healthSnapshot();
      const age = Math.floor((Date.now() - session.startedAt) / 1000);
      const mins = Math.floor(age / 60);
      const secs = age % 60;
      log.info(`session: ${session.id.slice(0, 8)}... (${mins}m${secs}s)`);
      log.info(`daemon:  ${formatHealthLine(snap.daemon.state, snap.daemon.lastOk)}`);
      log.info(`ollama:  ${formatHealthLine(snap.ollama.state, snap.ollama.lastOk)}`);
      log.info(`claude:  ${session.hasClaudeKey ? 'configured' : 'not configured'}`);
      if (isGraphPotentiallyStale()) {
        log.info(`graph:   [stale] index is being rebuilt`);
      }
      log.info(`repo:    ${session.repoPath}`);
      log.info(`repos:   ${session.closureRepos.join(', ')}`);
      log.info(`turns:   ${session.turnIndex}`);
      log.info(`recent:  ${ctx.getRecentCount()} turns`);
      log.info(`semantic: ${ctx.getSemanticSize()} stored`);
      log.info(`summary: ${ctx.getSummary() ? 'yes' : 'none'}`);
      log.info(`seeded:  ${seeded ? 'yes' : 'no'}`);
      const activePlan = await planGet({ repoPath });
      if (activePlan) {
        const done = activePlan.steps.filter(s => s.status === 'done').length;
        const total = activePlan.steps.length;
        log.info(`plan:    ${activePlan.title} (${done}/${total} done) [${activePlan.status}]`);
      } else {
        log.info(`plan:    none`);
      }
      rl.prompt();
      return;
    }

    if (raw === '/cost') {
      const c = session.cost;
      // Pricing: Haiku input=$0.25/M output=$1.25/M, Sonnet input=$3/M output=$15/M
      const estCost = (c.inputTokens * 3 + c.outputTokens * 15) / 1_000_000;
      log.info(`Claude turns:   ${c.turns}`);
      log.info(`Input tokens:   ${c.inputTokens.toLocaleString()}`);
      log.info(`Output tokens:  ${c.outputTokens.toLocaleString()}`);
      log.info(`Estimated cost: $${estCost.toFixed(4)}`);
      rl.prompt();
      return;
    }

    if (raw === '/forget') {
      await session.forget();
      log.info('All session summaries for this repo deleted from persistent store.');
      rl.prompt();
      return;
    }

    // /plan commands
    if (raw === '/plan' || raw.startsWith('/plan ')) {
      const planArg = raw.slice(5).trim();
      const result = await handlePlanCommand(planArg, session.repoPath);
      if (result?.startsWith('plan-intent:')) {
        // /plan <desc> shorthand — treat as plan intent
        const desc = result.slice('plan-intent:'.length);
        try {
          const queryEmbedding = await ctx.embedQuery(desc);
          const assembled = await ctx.assemble(desc, queryEmbedding);
          const response = await handlePipelineIntent('plan', desc, assembled.code.text);
          if (response) { log.info(response); log.info(''); }
          const turn = { userMessage: desc, assistantResponse: response, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        } catch (err) {
          log.error(err instanceof Error ? err.message : String(err));
        }
      }
      rl.prompt();
      return;
    }

    if (raw === '/toggle-permissions') {
      session.permissionMode = session.permissionMode === 'validate' ? 'auto-accept' : 'validate';
      log.info(`permissions: ${session.permissionMode}`);
      rl.prompt();
      return;
    }

    if (raw === '/auto') {
      if (!await session.ollamaAvailable) {
        log.info('Auto routing requires Ollama. Start Ollama first.');
      } else {
        const mode = session.toggleRouting();
        log.info(`routing: ${mode}`);
      }
      rl.prompt();
      return;
    }

    // Extract file path attachments from input
    const { paths: attachmentPaths, cleanedMessage: messageWithoutPaths } = extractFilePaths(raw);
    const resolvedAttachments: ResolvedAttachment[] = [];
    const attachments: Attachment[] = [];
    const attachmentContentBlocks: ContentBlock[] = [];
    const attachmentTextParts: string[] = [];

    for (const p of attachmentPaths) {
      const resolved = resolveAttachment(
        p.startsWith('/') ? p : `${repoPath}/${p}`,
      );
      resolvedAttachments.push(resolved);
      attachments.push(resolved.attachment);
      for (const w of resolved.warnings) log.warn(w);
      if (resolved.textContent) {
        attachmentTextParts.push(`### ${resolved.attachment.name}\n${resolved.textContent}`);
      }
      if (resolved.contentBlocks) {
        attachmentContentBlocks.push(...resolved.contentBlocks);
      }
    }

    // Inject text attachment content into L4 context
    if (attachmentTextParts.length > 0) {
      ctx.setAttachmentContext(attachmentTextParts.join('\n\n'));
    }

    // Use cleaned message (without file paths) for classification if attachments found
    const classifyInput = attachments.length > 0 ? messageWithoutPaths || raw : raw;

    // Classify intent and select provider
    const classifyProvider = session.resolver.resolve('classifier', 'classify');
    const classified = await classify(classifyInput, {
      signals: {},
      llmProvider: ollamaOk ? classifyProvider : undefined,
    });
    let route = selectProvider(classified.intent, classified.explicit, {
      ollamaProvider: session.ollamaProvider,
      claudeProvider: session.claudeProvider,
      config: session.config,
      attachments,
    });

    // Announce routing
    announceRoute(classified.intent, route, {
      confidence: classified.confidence,
      explicit: classified.explicit !== undefined,
    });

    if (route.tier) {
      announceCost(route.tier);
    }
    if (classified.explicit === 'opus') {
      announceOpus();
    }

    // Graph-only intents — no LLM call
    if (route.graphOnly) {
      try {
        const graphResult = await runGraphQuery(classified.message);
        if (!graphResult.handled) {
          // Re-route interpretive questions to research
          log.info('[graph] Interpretive question — routing to research...');
          const queryEmbedding = await ctx.embedQuery(classified.message);
          const assembled = await ctx.assemble(classified.message, queryEmbedding);
          const response = await handlePipelineIntent('research', classified.message, assembled.code.text);
          if (response) {
            log.info(response);
            log.info('');
            const turn = { userMessage: classified.message, assistantResponse: response, entityIds: [] as string[] };
            await ctx.recordTurn(turn, queryEmbedding);
            session.turnIndex++;
          }
        } else {
          log.info(graphResult.response);
          log.info('');
          const queryEmbedding = await ctx.embedQuery(classified.message);
          const turn = { userMessage: classified.message, assistantResponse: graphResult.response, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        }
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
      }
      rl.prompt();
      return;
    }

    // Pipeline intents (requirements, design, plan, implement, refactor) — two-stage processing
    if (['requirements', 'design', 'plan', 'brainstorm', 'implement', 'refactor', 'test', 'debug', 'review', 'document', 'research'].includes(classified.intent)) {
      try {
        const queryEmbedding = await ctx.embedQuery(classified.message);
        const assembled = await ctx.assemble(classified.message, queryEmbedding);
        const codeContext = assembled.code.text;

        // Forced-Claude path: when image/PDF attachment forces escalation on implement/test
        let assistantResponse: string;
        if (route.attachmentForced && attachmentContentBlocks.length > 0
            && (classified.intent === 'implement' || classified.intent === 'test')) {
          const forcedResult = await runForcedClaudePipeline(
            classified.intent, classified.message, repoPath, codeContext,
            ctx.getActivePlanStep(), attachmentContentBlocks,
            route.provider, toLogFn(log),
          );
          if (forcedResult.accepted) {
            assistantResponse = `${forcedResult.message}\n\nFiles:\n${forcedResult.filesWritten.map(f => `  - ${f}`).join('\n')}`;
          } else if (forcedResult.diff) {
            assistantResponse = `Forced-Claude implementation needs review:\n\n\`\`\`diff\n${forcedResult.diff}\n\`\`\`\n\n${forcedResult.message}`;
          } else {
            assistantResponse = forcedResult.message;
          }
        } else {
          assistantResponse = await handlePipelineIntent(classified.intent, classified.message, codeContext, {
            explicit: classified.explicit ?? undefined, routeProvider: route.provider, routeTier: route.tier ?? undefined,
          });
        }
        if (assistantResponse) {
          log.info(assistantResponse);
          log.info('');
          const turn = { userMessage: classified.message, assistantResponse, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        }
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
      }
      rl.prompt();
      return;
    }

    // Cross-session seeding: on the first turn, seed L2 from prior sessions
    if (!seeded) {
      seeded = true;
      const seed = await session.seedFromPriorSessions(classified.message);
      if (seed) {
        ctx.seedSummary(seed);
        log.info('[context] seeded from prior session');
      }
    }

    // Pre-turn: inject active plan step into L4 context
    await injectActivePlanStep();

    // Embed user message once — shared between L3b retrieval and L4 code search
    const queryEmbedding = await ctx.embedQuery(classified.message);

    // Assemble layered context (L1–L4) with overflow enforcement
    const assembled = await ctx.assemble(classified.message, queryEmbedding);

    // Smart routing or static escalation check
    if (!classified.explicit && !route.graphOnly) {
      if (session.smartRouter) {
        // Smart routing: LLM-assessed complexity
        const filePattern = /\[(?:function|method|class|interface|type|variable) .+ — (.+?):\d+-\d+\]/g;
        const files = new Set<string>();
        let fMatch: RegExpExecArray | null;
        while ((fMatch = filePattern.exec(assembled.code.text)) !== null) {
          files.add(fMatch[1]!);
        }
        const signals = buildSignals(
          classified.intent, classified.message,
          assembled.totalTokens, files.size, session.closureRepos.length,
          attachments.length > 0,
        );
        route = await session.smartRouter.route(
          classified.intent, classified.explicit, signals,
          classified.message,
          { ollamaProvider: session.ollamaProvider, claudeProvider: session.claudeProvider, config: session.config, attachments },
        );
      } else if (route.label === 'Local') {
        // Static escalation fallback
        const escalation = shouldEscalate(assembled, session.closureRepos);
        if (escalation.shouldEscalate && session.claudeProvider) {
          const tier = 'fast' as const;
          const model = session.config.models.tiers[tier];
          route = {
            provider: new ClaudeProvider({ model, apiKey: session.config.keys.anthropic }),
            label: `Claude Haiku (auto-escalated)`,
            graphOnly: false,
            tier,
          };
          log.info(`[escalation] ${escalation.reason} → auto-escalated to Claude`);
        }
      }
    }

    // Build LLM messages from assembled context
    const messages = ctx.buildMessages(assembled, classified.message);

    // If image/PDF attachments present, inject content blocks into the last user message
    if (attachmentContentBlocks.length > 0 && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]!;
      if (lastMsg.role === 'user') {
        const textBlock: import('../shared/types.js').ContentBlock = {
          type: 'text',
          text: typeof lastMsg.content === 'string' ? lastMsg.content : '',
        };
        lastMsg.content = [textBlock, ...attachmentContentBlocks];
      }
    }

    // Check daemon availability for MCP tools (with health tracking)
    let mcpAvailable: boolean;
    try {
      mcpAvailable = await pingDaemon();
      session.health.recordDaemonResult(mcpAvailable);
      if (!mcpAvailable && session.health.daemonState === 'unavailable') {
        log.info('[daemon] Attempting auto-restart...');
        const restarted = await attemptRestart(toLogFn(log));
        if (restarted) {
          mcpAvailable = true;
          session.health.recordDaemonResult(true);
        }
      }
    } catch (err) {
      mcpAvailable = false;
      session.health.recordDaemonResult(false);
      const fault = classifyDaemonError(err);
      log.warn(formatDaemonFault(fault));
    }
    const tools = getToolDefinitions({ mcpAvailable });

    // Execute via tool loop (if provider supports tools) or plain stream
    try {
      let assistantResponse = '';

      if (route.provider.supportsTools) {
        const result = await runToolLoop(messages, {
          provider: route.provider,
          tools,
          intent: classified.intent,
          permissionMode: session.permissionMode,
          validator: session.claudeProvider ?? undefined,
          onTextDelta: (delta) => process.stdout.write(delta),
          onToolCall: (call, validation) => {
            const status = validation.action === 'rejected'
              ? `rejected: ${validation.reason}`
              : validation.action;
            log.info(`[tool] ${call.name} → ${status}`);
          },
          onToolResult: (call, result) => {
            const preview = result.content.slice(0, 100).replace(/\n/g, ' ');
            const suffix = result.content.length > 100 ? '...' : '';
            log.info(`[result] ${call.name}: ${preview}${suffix}`);
          },
          onUsage: (usage) => {
            session.cost.inputTokens += usage.inputTokens;
            session.cost.outputTokens += usage.outputTokens;
            session.cost.turns++;
          },
        });

        process.stdout.write('\n\n');
        assistantResponse = result.response;

        if (result.hitLimit) {
          log.warn('Tool loop hit max iterations (25)');
        }
      } else {
        // Fallback: plain streaming (no tool use)
        for await (const delta of route.provider.stream(messages)) {
          process.stdout.write(delta);
          assistantResponse += delta;
        }
        process.stdout.write('\n\n');
      }

      // Record turn in context manager (handles eviction + summary automatically)
      const turn = { userMessage: classified.message, assistantResponse, entityIds: [] as string[] };
      await ctx.recordTurn(turn, queryEmbedding);

      // Track entity IDs for session close
      session.trackEntities(turn.entityIds);

      // Persist turn to daemon LanceDB (fire-and-forget)
      void sessionSave({
        sessionId: session.id,
        idx: session.turnIndex,
        user: classified.message,
        assistant: assistantResponse,
        entities: turn.entityIds,
        vector: queryEmbedding,
        repo: session.repoPath,
      });

      if (assembled.dropped.length > 0) {
        for (const d of assembled.dropped) {
          log.info(`[context] dropped ${d.layer}: ${d.reason} (${d.tokensDropped} tokens)`);
        }
      }

      session.turnIndex++;
    } catch (err) {
      // Classify and report Ollama faults with Claude fallback suggestion
      if (isOllamaDown(err)) {
        session.health.recordOllamaResult(false);
        const fault = classifyOllamaError(err);
        log.warn(formatOllamaFault(fault));
        if (fault.suggestClaude && session.hasClaudeKey) {
          log.info('Retry with @claude prefix to use Claude for this turn.');
        }
      } else {
        log.error(err instanceof Error ? err.message : String(err));
      }
    }

    rl.prompt();
  });

  // Pre-turn: inject active plan step into L4 context
  async function injectActivePlanStep(): Promise<void> {
    const plan = await planGet({ repoPath });
    if (!plan || plan.status !== 'active') {
      ctx.setActivePlanStep('');
      return;
    }
    const next = plan.steps.find(s => s.status === 'pending' || s.status === 'in_progress');
    if (next) {
      const stepCtx = `Step ${next.idx + 1}/${plan.steps.length}: ${next.title}\n${next.description}\nComplexity: ${next.complexity}${next.checkpoint ? ' (checkpoint — test before continuing)' : ''}`;
      ctx.setActivePlanStep(stepCtx);
    } else {
      ctx.setActivePlanStep('');
    }
  }

  // Handle pipeline intents (requirements, design, plan, implement, refactor)
  async function handlePipelineIntent(
    intent: string,
    message: string,
    codeContext: string,
    opts?: { explicit?: import('../shared/types.js').ExplicitProvider | undefined; routeProvider?: import('../shared/types.js').LLMProvider; routeTier?: string | undefined },
  ): Promise<string> {
    if (intent === 'requirements' || intent === 'design') {
      const designerClaude = session.resolver.resolveOrNull('designer', 'review');
      if (!designerClaude) {
        return `[error] Designer pipeline requires Claude. Set ANTHROPIC_API_KEY.`;
      }

      const reqContext = intent === 'design' ? ctx.getTag('[requirements]') : undefined;
      const parsed = parseTemplateFlags(message);
      const template = resolveTemplate({ ...parsed, repoPath });

      const designerInput: DesignerInput = {
        message: parsed.message,
        codeContext,
        template,
        intent: intent as 'requirements' | 'design',
        requirementsDoc: reqContext ?? undefined,
        session: { repoPath, closureRepos: session.closureRepos },
      };

      return await runDesignerAgent(designerInput, intent);
    }

    if (intent === 'plan') {
      log.info('[pipeline] Running planner agent...');
      const planResult = await runPlannerAgent(message, codeContext);
      return planResult;
    }

    if (intent === 'brainstorm') {
      log.info('[pipeline] Running brainstorm agent...');
      const brainstormResult = await runBrainstormAgent(message, codeContext);
      return brainstormResult;
    }

    if (intent === 'implement') {
      const scope = detectScope(message);
      if (scope === 'batch') {
        log.info('[pipeline] Batch scope detected — routing to Delegate agent');
        return await runDelegateAgent(message, codeContext);
      }
      log.info('[pipeline] Running Pair agent (implement mode)...');
      return await runPairAgent(message, codeContext, 'implement');
    }

    if (intent === 'refactor') {
      const scope = detectScope(message);
      if (scope === 'batch') {
        log.info('[pipeline] Batch scope detected — routing to Delegate agent');
        return await runDelegateAgent(message, codeContext);
      }
      log.info('[pipeline] Running Pair agent (refactor mode)...');
      return await runPairAgent(message, codeContext, 'refactor');
    }

    if (intent === 'test') {
      log.info('[pipeline] Running Tester agent...');
      return await runTesterAgent(message, codeContext);
    }

    if (intent === 'debug') {
      log.info('[pipeline] Running Pair agent (debug mode)...');
      return await runPairAgent(message, codeContext, 'debug');
    }

    if (intent === 'review') {
      const reviewClaude = session.resolver.resolveOrNull('designer', 'review');
      if (!reviewClaude) {
        return '[error] Review pipeline requires Claude. Set ANTHROPIC_API_KEY.';
      }
      const isOpus = opts?.explicit === 'opus';
      const reviewProvider = isOpus && opts?.routeTier === 'powerful' && opts?.routeProvider
        ? opts.routeProvider
        : reviewClaude;

      const template = resolveTemplate({ format: 'markdown' });
      const designerInput: DesignerInput = {
        message,
        codeContext,
        template,
        intent: 'review',
        session: { repoPath, closureRepos: session.closureRepos },
      };

      const result = await runDesignerReview(designerInput, reviewProvider, isOpus, toLogFn(log));
      return result.output || '[error] Review pipeline produced no output.';
    }

    if (intent === 'document') {
      const requestReview = /--review\b/.test(message);
      const cleanMessage = message.replace(/--review\b/, '').trim();
      log.info(`[pipeline] Running document pipeline (local generation${requestReview ? ' + Claude review' : ''})...`);

      const result = await runDocumentPipeline(
        cleanMessage, repoPath, codeContext,
        session.resolver.resolve('document', 'generate'),
        session.resolver.resolveOrNull('document', 'review'),
        requestReview,
        toLogFn(log),
        session.resolver.resolveOrNull('document', 'escalate'),
      );

      if (result.applied) {
        return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
      }

      if (result.diff) {
        return `Documentation generated but not applied:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\n${result.message}`;
      }

      return result.message;
    }

    if (intent === 'research') {
      const forceEscalate = opts?.explicit === 'claude' || opts?.explicit === 'opus';
      log.info(`[pipeline] Running research pipeline${forceEscalate ? ' (escalated to Claude)' : ''}...`);

      const result = await runResearchPipeline(
        message, codeContext,
        session.resolver.resolve('research', 'query'),
        session.resolver.resolveOrNull('research', 'synthesize'),
        session.config.keys.brave,
        toLogFn(log),
        session.closureRepos,
        forceEscalate,
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

  // -----------------------------------------------------------------------
  // Designer agent runner
  // -----------------------------------------------------------------------

  async function runDesignerAgent(
    designerInput: DesignerInput,
    intent: string,
  ): Promise<string> {
    // Check for active/crashed runs for this repo
    const activeRuns = readIndex().filter(
      e => e.agentId === 'designer' && e.repo === repoPath &&
        (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );

    let resumeCheckpoint = null;
    if (activeRuns.length > 0) {
      const entry = activeRuns[0]!;
      log.info(`[designer] Found ${entry.status} run: ${entry.runId}`);
      const answer = await askOnce('Resume this run? [Y/n] ');
      if (answer.trim().toLowerCase() !== 'n') {
        const runDir = resolveRunDir(entry.runId);
        resumeCheckpoint = readCheckpoint(runDir);
      }
    }

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: 'designer> ' });

    try {
      const result: RunResult = await runAgent({
        definition: designerAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: designerInput, repo: repoPath },
        config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
      });

      const finalState = result.result as DesignerState;
      if (finalState.summary) {
        ctx.setTag('[requirements]', finalState.summary);
      }
      if (intent === 'design' && finalState.assembledOutput) {
        ctx.setTag('[design]', finalState.assembledOutput);
      }
      return finalState.assembledOutput ?? '[error] Designer agent produced no output.';
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[designer] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Planner agent runner
  // -----------------------------------------------------------------------

  async function runPlannerAgent(
    message: string,
    codeContext: string,
  ): Promise<string> {
    // Check for active/crashed runs for this repo
    const activeRuns = readIndex().filter(
      e => e.agentId === 'planner' && e.repo === repoPath &&
        (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );

    let resumeCheckpoint = null;
    if (activeRuns.length > 0) {
      const entry = activeRuns[0]!;
      log.info(`[planner] Found ${entry.status} run: ${entry.runId}`);
      const answer = await askOnce('Resume this run? [Y/n] ');
      if (answer.trim().toLowerCase() !== 'n') {
        const runDir = resolveRunDir(entry.runId);
        resumeCheckpoint = readCheckpoint(runDir);
      }
    }

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: 'planner> ' });

    // Enrich planner message with prior session context (requirements, design)
    let enrichedMessage = message;
    const reqContext = ctx.getTag('[requirements]');
    if (reqContext) {
      enrichedMessage += `\n\n## Prior Requirements\n${reqContext}`;
    }
    const designContext = ctx.getTag('[design]');
    if (designContext) {
      enrichedMessage += `\n\n## Prior Design Summary\n${designContext.slice(0, 2000)}`;
    }

    const plannerInput: PlannerInput = {
      message: enrichedMessage,
      codeContext,
      session: {
        repoPath,
        closureRepos: session.closureRepos,
      },
    };

    try {
      const result: RunResult = await runAgent({
        definition: plannerAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: plannerInput, repo: repoPath },
        config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
      });

      const finalState = result.result as PlannerState;
      if (finalState.summary) {
        ctx.setTag(`[plan:${finalState.plan?.id ?? 'unknown'}]`, finalState.summary);
      }

      // Persist plan to Kuzu if available
      if (finalState.plan) {
        try {
          await planSave(finalState.plan as unknown as import('../shared/types.js').Plan);
          log.info(`[planner] Plan saved to Kuzu: ${finalState.plan.steps.length} steps`);
        } catch (err) {
          log.debug(`[planner] Could not save plan to Kuzu: ${err instanceof Error ? err.message : String(err)}`);
        }
        printPlan(finalState.plan as unknown as import('../shared/types.js').Plan);
      }

      return finalState.serializedOutput ?? '[error] Planner agent produced no output.';
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[planner] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  async function runBrainstormAgent(
    message: string,
    codeContext: string,
  ): Promise<string> {
    // Check for active/crashed runs for this repo
    const activeRuns = readIndex().filter(
      e => e.agentId === 'brainstorm' && e.repo === repoPath &&
        (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );

    let resumeCheckpoint = null;
    if (activeRuns.length > 0) {
      const entry = activeRuns[0]!;
      log.info(`[brainstorm] Found ${entry.status} run: ${entry.runId}`);
      const answer = await askOnce('Resume this run? [Y/n] ');
      if (answer.trim().toLowerCase() !== 'n') {
        const runDir = resolveRunDir(entry.runId);
        resumeCheckpoint = readCheckpoint(runDir);
      }
    }

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: 'brainstorm> ' });

    // Load prior brainstorm spec if available (for continuation)
    const priorBrainstorm = ctx.getTag('[brainstorm]') || undefined;

    const brainstormInput: BrainstormInput = {
      message,
      codeContext,
      existingSpec: priorBrainstorm,
      session: {
        repoPath,
        closureRepos: session.closureRepos,
      },
    };

    try {
      const result: RunResult = await runAgent({
        definition: brainstormAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: brainstormInput, repo: repoPath },
        config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
      });

      const finalState = result.result as BrainstormState;
      if (finalState.summary) {
        ctx.setTag('[brainstorm]', finalState.summary);
      }

      return finalState.assembledOutput ?? '[error] Brainstorm agent produced no output.';
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[brainstorm] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Pair coding agent runner
  // -----------------------------------------------------------------------

  async function runPairAgent(
    message: string,
    codeContext: string,
    mode: PairMode,
  ): Promise<string> {
    // Check for active/crashed runs for this repo
    const activeRuns = readIndex().filter(
      e => e.agentId === 'pair' && e.repo === repoPath &&
        (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );

    let resumeCheckpoint = null;
    if (activeRuns.length > 0) {
      const entry = activeRuns[0]!;
      log.info(`[pair] Found ${entry.status} run: ${entry.runId}`);
      const answer = await askOnce('Resume this run? [Y/n] ');
      if (answer.trim().toLowerCase() !== 'n') {
        const runDir = resolveRunDir(entry.runId);
        resumeCheckpoint = readCheckpoint(runDir);
      }
    }

    // Check for design context
    const designSpec = ctx.getTag('[design]') ?? undefined;

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: `pair(${mode})> ` });

    // Enrich message with prior session context
    let enrichedMessage = message;
    const reqCtx = ctx.getTag('[requirements]');
    if (reqCtx && !designSpec) {
      enrichedMessage += `\n\n## Prior Requirements\n${reqCtx}`;
    }

    const pairInput: PairInput = {
      message: enrichedMessage,
      codeContext,
      designSpec,
      mode,
      session: {
        repoPath,
        closureRepos: session.closureRepos,
      },
    };

    try {
      const result: RunResult = await runAgent({
        definition: pairAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: pairInput, repo: repoPath },
        config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
      });

      const finalState = result.result as PairState;
      const summary = finalState.conversationSummary || 'Pair session completed.';

      // Set session tag for downstream agents
      const pairSummary = finalState.changesApplied.length > 0
        ? `${summary} Files: ${finalState.changesApplied.map(c => c.file).join(', ')}`
        : summary;
      ctx.setTag('[pair]', pairSummary);

      if (finalState.changesApplied.length > 0) {
        const files = finalState.changesApplied.map(c => c.file).join('\n  - ');
        return `${summary}\n\nFiles changed:\n  - ${files}`;
      }

      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[pair] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Delegate coding agent runner
  // -----------------------------------------------------------------------

  async function runDelegateAgent(
    message: string,
    codeContext: string,
  ): Promise<string> {
    // Check for active/crashed runs for this repo
    const activeRuns = readIndex().filter(
      e => e.agentId === 'delegate' && e.repo === repoPath &&
        (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );

    let resumeCheckpoint = null;
    if (activeRuns.length > 0) {
      const entry = activeRuns[0]!;
      log.info(`[delegate] Found ${entry.status} run: ${entry.runId}`);
      const answer = await askOnce('Resume this run? [Y/n] ');
      if (answer.trim().toLowerCase() !== 'n') {
        const runDir = resolveRunDir(entry.runId);
        resumeCheckpoint = readCheckpoint(runDir);
      }
    }

    const designSpec = ctx.getTag('[design]') ?? undefined;

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: 'delegate> ' });

    // Enrich message with prior session context
    let enrichedDelegateMessage = message;
    const delegateReqCtx = ctx.getTag('[requirements]');
    if (delegateReqCtx && !designSpec) {
      enrichedDelegateMessage += `\n\n## Prior Requirements\n${delegateReqCtx}`;
    }

    const delegateInput: DelegateInput = {
      message: enrichedDelegateMessage,
      codeContext,
      designSpec,
      session: {
        repoPath,
        closureRepos: session.closureRepos,
      },
    };

    try {
      const result: RunResult = await runAgent({
        definition: delegateAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: delegateInput, repo: repoPath },
        config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
      });

      const finalState = result.result as DelegateState;
      const summary = `Delegate execution complete: ${finalState.stepResults.length} steps executed, ${finalState.filesChanged.length} files changed.`;

      // Set session tag for downstream agents
      ctx.setTag('[delegate]', summary);

      if (finalState.commits.length > 0) {
        return `${summary}\n\nCommits:\n${finalState.commits.map(c => `  - ${c}`).join('\n')}`;
      }

      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[delegate] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Tester agent runner
  // -----------------------------------------------------------------------

  async function runTesterAgent(
    message: string,
    codeContext: string,
  ): Promise<string> {
    // Check for active/crashed tester runs for this repo
    let resumeCheckpoint: import('./framework/types.js').Checkpoint | undefined;
    const runs = readIndex().filter(
      e => e.agentId === 'tester' && e.repo === repoPath && (e.status === 'running' || e.status === 'paused' || e.status === 'crashed'),
    );
    if (runs.length > 0) {
      const entry = runs[0]!;
      log.info(`[tester] Found ${entry.status} run: ${entry.runId}. Resuming...`);
      const { readCheckpoint, resolveRunDir } = await import('./framework/checkpoint.js');
      const runDir = resolveRunDir(entry.runId);
      resumeCheckpoint = readCheckpoint(runDir) ?? undefined;
    }

    const replChannel = new ReplChannel({ log: { info: (m: string) => log.info(m), debug: (m: string) => log.debug(m), error: (m: string) => log.error(m) }, prompt: 'tester> ' });

    // Enrich with prior session context
    let enrichedMessage = message;
    const designSpec = ctx.getTag('[design]') ?? undefined;
    const reqCtx = ctx.getTag('[requirements]');
    if (reqCtx && !designSpec) {
      enrichedMessage += `\n\n## Prior Requirements\n${reqCtx}`;
    }

    const testerInput: TesterInput = {
      message: enrichedMessage,
      codeContext,
      designSpec,
      session: {
        repoPath,
        closureRepos: session.closureRepos,
      },
    };

    try {
      const result: RunResult = await runAgent({
        definition: testerAgent as unknown as import('./framework/types.js').AgentDefinition,
        channel: replChannel,
        options: resumeCheckpoint
          ? { resumeFrom: resumeCheckpoint }
          : { input: testerInput, repo: repoPath },
        config: session.config,
        providers: {
          local: session.ollamaProvider,
          claude: session.claudeProvider,
          resolve: session.activeResolver.resolve.bind(session.activeResolver),
          resolveOrNull: session.activeResolver.resolveOrNull.bind(session.activeResolver),
        },
        // rpcFn: not yet wired at REPL level — config context degrades gracefully
      });

      const finalState = result.result as TesterState;

      // Set session tag
      ctx.setTag('[test]', finalState.summary ?? 'Test session completed.');

      const passing = finalState.fileResults.filter(r => r.status === 'passing').length;
      const total = finalState.fileResults.length;
      const summary = finalState.summary ?? `Test session: ${passing}/${total} passing.`;

      if (finalState.filesChanged.length > 0) {
        const files = [...new Set(finalState.filesChanged)].join('\n  - ');
        return `${summary}\n\nFiles changed:\n  - ${files}`;
      }

      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === 'AgentCancelledError') {
        return '[tester] Run paused. Resume with `insrc agent resume <runId>`.';
      }
      throw err;
    }
  }

  rl.on('close', () => {
    void closeSession().finally(() => process.exit(0));
  });
}

// ---------------------------------------------------------------------------
// /plan command handler
// ---------------------------------------------------------------------------

async function handlePlanCommand(arg: string, repoPath: string): Promise<string | void> {
  // /plan — view active plan
  if (!arg) {
    const plan = await planGet({ repoPath });
    if (!plan) {
      log.info('No active plan for this repo.');
      return;
    }
    printPlan(plan);
    return;
  }

  // /plan delete
  if (arg === 'delete') {
    const plan = await planGet({ repoPath });
    if (!plan) {
      log.info('No active plan to delete.');
      return;
    }
    await planDelete(plan.id);
    log.info(`Plan "${plan.title}" deleted.`);
    return;
  }

  // /plan skip
  if (arg === 'skip') {
    const plan = await planGet({ repoPath });
    if (!plan) { log.info('No active plan.'); return; }
    const next = plan.steps.find(s => s.status === 'pending' || s.status === 'in_progress');
    if (!next) { log.info('No pending steps to skip.'); return; }
    const result = await planStepUpdate(next.id, 'skipped', 'skipped by user');
    if (result.ok) {
      log.info(`Skipped: ${next.title}`);
    } else {
      log.error(`Error: ${result.error}`);
    }
    return;
  }

  // /plan undo <step-number>
  if (arg.startsWith('undo')) {
    const stepNum = parseInt(arg.slice(4).trim(), 10);
    const plan = await planGet({ repoPath });
    if (!plan) { log.info('No active plan.'); return; }
    if (isNaN(stepNum) || stepNum < 1 || stepNum > plan.steps.length) {
      log.info(`Usage: /plan undo <step-number> (1-${plan.steps.length})`);
      return;
    }
    const step = plan.steps[stepNum - 1]!;
    const result = await planStepUpdate(step.id, 'pending', 'reverted by user');
    if (result.ok) {
      log.info(`Reverted step ${stepNum}: ${step.title} → pending`);
    } else {
      log.error(`Error: ${result.error}`);
    }
    return;
  }

  // /plan <desc> — shorthand for plan intent (not a subcommand)
  return 'plan-intent:' + arg;
}

// ---------------------------------------------------------------------------
// First-run Brave API key setup (one-time, skippable)
// ---------------------------------------------------------------------------

const BRAVE_SETUP_FLAG = '.brave-setup-done';

/**
 * On first daemon start, if BRAVE_API_KEY is absent, offer one-time interactive setup.
 * Prompt shown once, never repeated regardless of user choice.
 * Writes flag file to ~/.insrc/.brave-setup-done.
 */
export async function promptBraveKeySetup(config: import('../shared/types.js').AgentConfig): Promise<void> {
  // Already configured — skip
  if (config.keys.brave) return;

  const flagPath = resolve(PATHS.insrc, BRAVE_SETUP_FLAG);
  // Already prompted before — never repeat
  if (existsSync(flagPath)) return;

  // Ensure directory exists
  mkdirSync(PATHS.insrc, { recursive: true });

  // Write flag immediately (before prompt) so even if user kills process, we don't re-prompt
  writeFileSync(flagPath, new Date().toISOString(), 'utf-8');

  log.info('');
  log.info('[setup] Web search: Brave Search API provides high-quality web search (2,000 free queries/month).');
  log.info('[setup] Without it, web searches will be handled by Claude (still works, but queries pass through Anthropic).');
  log.info('[setup] Get a free key at: https://brave.com/search/api/');

  const answer = await askOnce('  Enter Brave API key (or press Enter to skip): ');

  if (answer.trim()) {
    // Save to config
    try {
      const configRaw = existsSync(PATHS.config)
        ? JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>
        : {};
      const keys = (typeof configRaw['keys'] === 'object' && configRaw['keys'] !== null)
        ? configRaw['keys'] as Record<string, string>
        : {};
      keys['brave'] = answer.trim();
      configRaw['keys'] = keys;
      writeFileSync(PATHS.config, JSON.stringify(configRaw, null, 2), 'utf-8');
      config.keys.brave = answer.trim();
      process.env['BRAVE_API_KEY'] = answer.trim();
      log.info('[setup] Brave API key saved to ~/.insrc/config.json');
    } catch {
      log.warn('[setup] Could not save key to config file');
    }
  } else {
    log.info('[setup] Skipped — Claude will handle web searches automatically.');
  }
  log.info('');
}

function askOnce(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Plan display
// ---------------------------------------------------------------------------

function formatHealthLine(state: ComponentState, lastOk: number): string {
  const label = state === 'healthy' ? 'connected' : state;
  if (lastOk > 0) {
    const ago = Math.floor((Date.now() - lastOk) / 1000);
    return `${label} (last ok ${ago}s ago)`;
  }
  return label;
}

function printPlan(plan: import('../shared/types.js').Plan): void {
  const statusIcon: Record<string, string> = {
    pending: ' ', in_progress: '>', done: 'x', failed: '!', skipped: '-',
  };
  log.info(`Plan: ${plan.title} [${plan.status}]`);
  log.info(`${'─'.repeat(60)}`);
  for (const step of plan.steps) {
    const icon = statusIcon[step.status] ?? '?';
    const cp = step.checkpoint ? ' [checkpoint]' : '';
    const cx = ` (${step.complexity})`;
    log.info(`[${icon}] ${step.idx + 1}. ${step.title}${cx}${cp}`);
    if (step.status === 'failed' && step.notes) {
      const lastNote = step.notes.split('\n').pop() ?? '';
      log.info(lastNote);
    }
  }
  log.info('');
}
