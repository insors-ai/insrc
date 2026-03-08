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
import { ClaudeProvider } from './providers/claude.js';
import { getToolDefinitions } from './tools/registry.js';
import { runToolLoop } from './tools/loop.js';
import { ping as pingDaemon, sessionSave, sessionPrune, planGet, planSave, planStepUpdate, planDelete, planNextStep, planResetStale } from './tools/mcp-client.js';
import { runRequirementsPipeline } from './tasks/requirements.js';
import { runDesignPipeline } from './tasks/design.js';
import { runPlanPipeline } from './tasks/plan.js';
import { runImplementPipeline } from './tasks/implement.js';
import { runRefactorPipeline } from './tasks/refactor.js';
import { runTestPipeline } from './tasks/test.js';
import { runDebugPipeline } from './tasks/debug.js';
import { findTestFile } from './tasks/test-runner.js';
import { runGraphQuery } from './tasks/graph.js';
import { runResearchPipeline } from './tasks/research.js';
import { runReviewPipeline } from './tasks/review.js';
import { runDocumentPipeline } from './tasks/document.js';
import {
  extractFilePaths, resolveAttachment, hasEscalationAttachment,
  type ResolvedAttachment,
} from './attachments/router.js';
import { runForcedClaudePipeline } from './attachments/forced-claude.js';
import type { Attachment, ContentBlock } from '../shared/types.js';

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
  console.log('[agent] starting...');

  // 1. Check Ollama and pull agent model if needed
  try {
    await ensureAgentModel(config.ollama.host, pct => {
      process.stdout.write(`\r[agent] pulling model... ${pct}%`);
    });
  } catch {
    console.warn('[agent] Ollama not available — local model disabled. Use @claude prefix.');
  }

  // 1b. First-run Brave key setup (one-time, skippable)
  await promptBraveKeySetup(config);

  // 2. Create session
  const session = new Session({ repoPath, config });
  await session.init();

  // Best-effort pruning of expired sessions on start (fire-and-forget)
  void sessionPrune();

  // Reset stale in_progress plan step locks from crashed sessions (fire-and-forget)
  void (async () => {
    const plan = await planGet({ repoPath });
    if (plan?.status === 'active') {
      const reset = await planResetStale(plan.id);
      if (reset > 0) console.log(`[agent] reset ${reset} stale plan step lock(s)`);
    }
  })();

  const ollamaOk = await session.ollamaAvailable;

  console.log(`[agent] repo: ${repoPath}`);
  console.log(`[agent] ollama: ${ollamaOk ? 'connected' : 'unavailable'}`);
  console.log(`[agent] claude: ${session.hasClaudeKey ? 'configured' : 'not configured (set ANTHROPIC_API_KEY or add to ~/.insrc/config.json)'}`);
  console.log('');
  console.log('Type a message to chat. Prefix with @claude, @opus, @local, or /intent <name> to route.');
  console.log(`[agent] permissions: ${session.permissionMode}`);
  console.log('Commands: /status, /cost, /plan, /forget, /toggle-permissions, /exit');
  console.log('');

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
      console.log('Closing session...');
      await closeSession();
      console.log('Session closed.');
      rl.close();
      return;
    }

    if (raw === '/status') {
      const ok = await session.ollamaAvailable;
      const daemonOk = await pingDaemon();
      const age = Math.floor((Date.now() - session.startedAt) / 1000);
      const mins = Math.floor(age / 60);
      const secs = age % 60;
      console.log(`  session: ${session.id.slice(0, 8)}... (${mins}m${secs}s)`);
      console.log(`  daemon:  ${daemonOk ? 'connected' : 'unavailable'}`);
      console.log(`  ollama:  ${ok ? 'connected' : 'unavailable'}`);
      console.log(`  claude:  ${session.hasClaudeKey ? 'configured' : 'not configured'}`);
      console.log(`  repo:    ${session.repoPath}`);
      console.log(`  repos:   ${session.closureRepos.join(', ')}`);
      console.log(`  turns:   ${session.turnIndex}`);
      console.log(`  recent:  ${ctx.getRecentCount()} turns`);
      console.log(`  semantic: ${ctx.getSemanticSize()} stored`);
      console.log(`  summary: ${ctx.getSummary() ? 'yes' : 'none'}`);
      console.log(`  seeded:  ${seeded ? 'yes' : 'no'}`);
      const activePlan = await planGet({ repoPath });
      if (activePlan) {
        const done = activePlan.steps.filter(s => s.status === 'done').length;
        const total = activePlan.steps.length;
        console.log(`  plan:    ${activePlan.title} (${done}/${total} done) [${activePlan.status}]`);
      } else {
        console.log(`  plan:    none`);
      }
      rl.prompt();
      return;
    }

    if (raw === '/cost') {
      const c = session.cost;
      // Pricing: Haiku input=$0.25/M output=$1.25/M, Sonnet input=$3/M output=$15/M
      const estCost = (c.inputTokens * 3 + c.outputTokens * 15) / 1_000_000;
      console.log(`  Claude turns:   ${c.turns}`);
      console.log(`  Input tokens:   ${c.inputTokens.toLocaleString()}`);
      console.log(`  Output tokens:  ${c.outputTokens.toLocaleString()}`);
      console.log(`  Estimated cost: $${estCost.toFixed(4)}`);
      rl.prompt();
      return;
    }

    if (raw === '/forget') {
      await session.forget();
      console.log('  All session summaries for this repo deleted from persistent store.');
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
          if (response) { console.log(response); console.log(''); }
          const turn = { userMessage: desc, assistantResponse: response, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        } catch (err) {
          console.error('\n[error]', err instanceof Error ? err.message : err);
        }
      }
      rl.prompt();
      return;
    }

    if (raw === '/toggle-permissions') {
      session.permissionMode = session.permissionMode === 'validate' ? 'auto-accept' : 'validate';
      console.log(`  permissions: ${session.permissionMode}`);
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
      for (const w of resolved.warnings) console.log(w);
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
    const classified = await classify(classifyInput, {
      ctx: {},
      llmProvider: ollamaOk ? session.ollamaProvider : undefined,
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
          console.log('  [graph] Interpretive question — routing to research...');
          const queryEmbedding = await ctx.embedQuery(classified.message);
          const assembled = await ctx.assemble(classified.message, queryEmbedding);
          const response = await handlePipelineIntent('research', classified.message, assembled.code.text);
          if (response) {
            console.log(response);
            console.log('');
            const turn = { userMessage: classified.message, assistantResponse: response, entityIds: [] as string[] };
            await ctx.recordTurn(turn, queryEmbedding);
            session.turnIndex++;
          }
        } else {
          console.log(graphResult.response);
          console.log('');
          const queryEmbedding = await ctx.embedQuery(classified.message);
          const turn = { userMessage: classified.message, assistantResponse: graphResult.response, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        }
      } catch (err) {
        console.error('\n[error]', err instanceof Error ? err.message : err);
      }
      rl.prompt();
      return;
    }

    // Pipeline intents (requirements, design, plan, implement, refactor) — two-stage processing
    if (['requirements', 'design', 'plan', 'implement', 'refactor', 'test', 'debug', 'review', 'document', 'research'].includes(classified.intent)) {
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
            route.provider, console.log,
          );
          if (forcedResult.accepted) {
            assistantResponse = `${forcedResult.message}\n\nFiles:\n${forcedResult.filesWritten.map(f => `  - ${f}`).join('\n')}`;
          } else if (forcedResult.diff) {
            assistantResponse = `Forced-Claude implementation needs review:\n\n\`\`\`diff\n${forcedResult.diff}\n\`\`\`\n\n${forcedResult.message}`;
          } else {
            assistantResponse = forcedResult.message;
          }
        } else {
          assistantResponse = await handlePipelineIntent(classified.intent, classified.message, codeContext);
        }
        if (assistantResponse) {
          console.log(assistantResponse);
          console.log('');
          const turn = { userMessage: classified.message, assistantResponse, entityIds: [] as string[] };
          await ctx.recordTurn(turn, queryEmbedding);
          session.turnIndex++;
        }
      } catch (err) {
        console.error('\n[error]', err instanceof Error ? err.message : err);
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
        console.log('  [context] seeded from prior session');
      }
    }

    // Pre-turn: inject active plan step into L4 context
    await injectActivePlanStep();

    // Embed user message once — shared between L3b retrieval and L4 code search
    const queryEmbedding = await ctx.embedQuery(classified.message);

    // Assemble layered context (L1–L4) with overflow enforcement
    const assembled = await ctx.assemble(classified.message, queryEmbedding);

    // Check automatic escalation thresholds (only for local routes without explicit prefix)
    if (!classified.explicit && !route.graphOnly && route.label === 'Local') {
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
        console.log(`  [escalation] ${escalation.reason} → auto-escalated to Claude`);
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

    // Check daemon availability for MCP tools
    const mcpAvailable = await pingDaemon();
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
            console.log(`  [tool] ${call.name} → ${status}`);
          },
          onToolResult: (call, result) => {
            const preview = result.content.slice(0, 100).replace(/\n/g, ' ');
            const suffix = result.content.length > 100 ? '...' : '';
            console.log(`  [result] ${call.name}: ${preview}${suffix}`);
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
          console.log('  [warning] Tool loop hit max iterations (25)');
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
      });

      if (assembled.dropped.length > 0) {
        for (const d of assembled.dropped) {
          console.log(`  [context] dropped ${d.layer}: ${d.reason} (${d.tokensDropped} tokens)`);
        }
      }

      session.turnIndex++;
    } catch (err) {
      console.error('\n[error]', err instanceof Error ? err.message : err);
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
  ): Promise<string> {
    if (intent === 'requirements') {
      if (!session.claudeProvider) {
        return '[error] Requirements pipeline requires Claude. Set ANTHROPIC_API_KEY.';
      }
      console.log('  [pipeline] Running requirements pipeline (local sketch → Claude enhance)...');
      const result = await runRequirementsPipeline(
        message, codeContext, session.ollamaProvider, session.claudeProvider,
      );
      ctx.setTag('[requirements]', result.enhanced);
      return result.enhanced;
    }

    if (intent === 'design') {
      if (!session.claudeProvider) {
        return '[error] Design pipeline requires Claude. Set ANTHROPIC_API_KEY.';
      }
      const reqContext = ctx.getTag('[requirements]');
      console.log('  [pipeline] Running design pipeline (local sketch → Claude enhance)...');
      if (reqContext) console.log('  [pipeline] Using [requirements] from L2');
      const result = await runDesignPipeline(
        message, codeContext, reqContext, session.ollamaProvider, session.claudeProvider,
      );
      ctx.setTag('[design]', result.enhanced);
      return result.enhanced;
    }

    if (intent === 'plan') {
      const reqContext = ctx.getTag('[requirements]');
      const desContext = ctx.getTag('[design]');
      console.log('  [pipeline] Running plan pipeline...');
      if (reqContext) console.log('  [pipeline] Using [requirements] from L2');
      if (desContext) console.log('  [pipeline] Using [design] from L2');
      if (!reqContext && !desContext) console.log('  [pipeline] No prior requirements/design — running condensed mode');

      const result = await runPlanPipeline(
        message, repoPath, codeContext, reqContext, desContext,
        session.ollamaProvider, session.claudeProvider,
      );

      // Persist plan to Kuzu via daemon
      await planSave(result.plan);
      ctx.setTag(result.tag, `Plan: ${result.plan.title}`);
      console.log(`  [pipeline] Plan saved: ${result.plan.steps.length} steps (id: ${result.plan.id.slice(0, 8)}...)`);

      // Display the plan
      printPlan(result.plan);
      return result.enhanced;
    }

    if (intent === 'implement') {
      const planStepCtx = ctx.getActivePlanStep();
      console.log('  [pipeline] Running implement pipeline (local diff → Claude validate)...');
      if (planStepCtx) console.log('  [pipeline] Active plan step injected');

      const result = await runImplementPipeline(
        message, repoPath, codeContext, planStepCtx,
        session.ollamaProvider, session.claudeProvider,
      );

      if (result.needsUserDecision) {
        return `Implementation needs your review:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\nFeedback from validation:\n${result.feedback}\n\nReply with "accept" to apply, or provide corrections.`;
      }

      if (result.accepted) {
        return `Implementation applied (${result.filesWritten.length} file(s) written, ${result.retries} retries).\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
      }

      return `Implementation failed: ${result.feedback}`;
    }

    if (intent === 'refactor') {
      const planStepCtx = ctx.getActivePlanStep();
      console.log('  [pipeline] Running refactor pipeline (local diff → Claude validate)...');
      if (planStepCtx) console.log('  [pipeline] Active plan step injected');

      const result = await runRefactorPipeline(
        message, repoPath, codeContext, planStepCtx,
        session.ollamaProvider, session.claudeProvider,
      );

      if (result.needsUserDecision) {
        return `Refactoring needs your review:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\nFeedback from validation:\n${result.feedback}\n\nReply with "accept" to apply, or provide corrections.`;
      }

      if (result.accepted) {
        return `Refactoring applied (${result.filesWritten.length} file(s) written, ${result.retries} retries).\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
      }

      return `Refactoring failed: ${result.feedback}`;
    }

    if (intent === 'test') {
      const planStepCtx = ctx.getActivePlanStep();
      console.log('  [pipeline] Running test pipeline (generate → validate → execute → fix loop)...');
      if (planStepCtx) console.log('  [pipeline] Active plan step injected');

      // Try to find the test file from the message or infer from context
      // For now, use a heuristic: look for file paths in the message
      const fileMatch = message.match(/(?:test|spec)\s+(\S+\.\w+)/i)
        ?? message.match(/(\S+\.(?:test|spec)\.\w+)/i);
      let testFilePath = fileMatch?.[1] ?? '';

      // If no explicit test file, try to infer from entity context
      if (!testFilePath && codeContext) {
        const srcFileMatch = codeContext.match(/(?:File|file):\s*(\S+)/);
        if (srcFileMatch) {
          const found = await findTestFile(srcFileMatch[1]!, repoPath);
          testFilePath = found ?? srcFileMatch[1]!.replace(/\.(\w+)$/, '.test.$1');
        }
      }

      if (!testFilePath) {
        testFilePath = 'test.ts'; // fallback
      }

      // Make absolute if relative
      if (!testFilePath.startsWith('/')) {
        testFilePath = `${repoPath}/${testFilePath}`;
      }

      const result = await runTestPipeline(
        message, testFilePath, codeContext, repoPath, planStepCtx,
        session.ollamaProvider, session.claudeProvider,
      );

      if (result.needsUserDecision) {
        return `Tests need your review:\n\n${result.message}\n\nReply with "accept" to keep current state, "discard" to revert, or provide corrections.`;
      }

      if (result.passed) {
        return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
      }

      return `Test pipeline completed: ${result.message}`;
    }

    if (intent === 'debug') {
      const planStepCtx = ctx.getActivePlanStep();
      const mcpUp = await pingDaemon();
      console.log('  [pipeline] Running debug pipeline (tool loop → stuck escalation → fix)...');
      if (planStepCtx) console.log('  [pipeline] Active plan step injected');

      const result = await runDebugPipeline(
        message, repoPath, codeContext, planStepCtx,
        session.ollamaProvider, session.claudeProvider,
        console.log,
        session.permissionMode,
        mcpUp,
      );

      if (result.needsUserDecision) {
        return `Debug session needs your input:\n\n${result.message}`;
      }

      if (result.fixed) {
        return `${result.message}\n\nFiles:\n${result.filesWritten.map(f => `  - ${f}`).join('\n')}`;
      }

      return `Debug session completed: ${result.message}`;
    }

    if (intent === 'review') {
      if (!session.claudeProvider) {
        return '[error] Review pipeline requires Claude. Set ANTHROPIC_API_KEY.';
      }
      // @opus prefix → use Opus provider for deep architectural reviews
      const isOpus = classified.explicit === 'opus';
      const reviewProvider = isOpus && route.tier === 'powerful'
        ? route.provider
        : session.claudeProvider;
      console.log(`  [pipeline] Running review pipeline (context assembly → Claude review${isOpus ? ' [Opus]' : ''})...`);

      const result = await runReviewPipeline(
        message, codeContext, reviewProvider, isOpus,
      );

      return result.review;
    }

    if (intent === 'document') {
      const requestReview = /--review\b/.test(message);
      const cleanMessage = message.replace(/--review\b/, '').trim();
      console.log(`  [pipeline] Running document pipeline (local generation${requestReview ? ' + Claude review' : ''})...`);

      // Build Sonnet provider for cross-cutting doc escalation
      let sonnetProvider: import('../shared/types.js').LLMProvider | null = null;
      if (session.config.keys.anthropic) {
        sonnetProvider = new ClaudeProvider({
          model: session.config.models.tiers.standard,
          apiKey: session.config.keys.anthropic,
        });
      }

      const result = await runDocumentPipeline(
        cleanMessage, repoPath, codeContext,
        session.ollamaProvider, session.claudeProvider,
        requestReview,
        console.log,
        sonnetProvider,
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
      const forceEscalate = classified.explicit === 'claude' || classified.explicit === 'opus';
      console.log(`  [pipeline] Running research pipeline${forceEscalate ? ' (escalated to Claude)' : ''}...`);

      const result = await runResearchPipeline(
        message, codeContext,
        session.ollamaProvider, session.claudeProvider,
        session.config.keys.brave,
        console.log,
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
      console.log('  No active plan for this repo.');
      return;
    }
    printPlan(plan);
    return;
  }

  // /plan delete
  if (arg === 'delete') {
    const plan = await planGet({ repoPath });
    if (!plan) {
      console.log('  No active plan to delete.');
      return;
    }
    await planDelete(plan.id);
    console.log(`  Plan "${plan.title}" deleted.`);
    return;
  }

  // /plan skip
  if (arg === 'skip') {
    const plan = await planGet({ repoPath });
    if (!plan) { console.log('  No active plan.'); return; }
    const next = plan.steps.find(s => s.status === 'pending' || s.status === 'in_progress');
    if (!next) { console.log('  No pending steps to skip.'); return; }
    const result = await planStepUpdate(next.id, 'skipped', 'skipped by user');
    if (result.ok) {
      console.log(`  Skipped: ${next.title}`);
    } else {
      console.log(`  Error: ${result.error}`);
    }
    return;
  }

  // /plan undo <step-number>
  if (arg.startsWith('undo')) {
    const stepNum = parseInt(arg.slice(4).trim(), 10);
    const plan = await planGet({ repoPath });
    if (!plan) { console.log('  No active plan.'); return; }
    if (isNaN(stepNum) || stepNum < 1 || stepNum > plan.steps.length) {
      console.log(`  Usage: /plan undo <step-number> (1-${plan.steps.length})`);
      return;
    }
    const step = plan.steps[stepNum - 1]!;
    const result = await planStepUpdate(step.id, 'pending', 'reverted by user');
    if (result.ok) {
      console.log(`  Reverted step ${stepNum}: ${step.title} → pending`);
    } else {
      console.log(`  Error: ${result.error}`);
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

  console.log('');
  console.log('[setup] Web search: Brave Search API provides high-quality web search (2,000 free queries/month).');
  console.log('[setup] Without it, web searches will be handled by Claude (still works, but queries pass through Anthropic).');
  console.log('[setup] Get a free key at: https://brave.com/search/api/');

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
      console.log('[setup] Brave API key saved to ~/.insrc/config.json');
    } catch {
      console.warn('[setup] Could not save key to config file');
    }
  } else {
    console.log('[setup] Skipped — Claude will handle web searches automatically.');
  }
  console.log('');
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

function printPlan(plan: import('../shared/types.js').Plan): void {
  const statusIcon: Record<string, string> = {
    pending: ' ', in_progress: '>', done: 'x', failed: '!', skipped: '-',
  };
  console.log(`\n  Plan: ${plan.title} [${plan.status}]`);
  console.log(`  ${'─'.repeat(60)}`);
  for (const step of plan.steps) {
    const icon = statusIcon[step.status] ?? '?';
    const cp = step.checkpoint ? ' [checkpoint]' : '';
    const cx = ` (${step.complexity})`;
    console.log(`  [${icon}] ${step.idx + 1}. ${step.title}${cx}${cp}`);
    if (step.status === 'failed' && step.notes) {
      const lastNote = step.notes.split('\n').pop() ?? '';
      console.log(`      ${lastNote}`);
    }
  }
  console.log('');
}
