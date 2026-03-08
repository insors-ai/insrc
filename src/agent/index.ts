import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import type { LLMMessage } from '../shared/types.js';
import { loadConfig } from './config.js';
import { Session } from './session.js';
import { ensureAgentModel } from './lifecycle.js';
import { classify } from './classifier/index.js';
import { selectProvider } from './router.js';
import { announceRoute, announceCost, announceOpus } from './escalation.js';
import { getToolDefinitions } from './tools/registry.js';
import { runToolLoop } from './tools/loop.js';
import { ping as pingDaemon } from './tools/mcp-client.js';

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

  // 2. Create session
  const session = new Session({ repoPath, config });
  await session.init();

  const ollamaOk = await session.ollamaAvailable;

  console.log(`[agent] repo: ${repoPath}`);
  console.log(`[agent] ollama: ${ollamaOk ? 'connected' : 'unavailable'}`);
  console.log(`[agent] claude: ${session.hasClaudeKey ? 'configured' : 'not configured (set ANTHROPIC_API_KEY or add to ~/.insrc/config.json)'}`);
  console.log('');
  console.log('Type a message to chat. Prefix with @claude, @opus, @local, or /intent <name> to route.');
  console.log(`[agent] permissions: ${session.permissionMode}`);
  console.log('Commands: /status, /cost, /toggle-permissions, /exit');
  console.log('');

  // 3. REPL loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'insrc> ',
  });

  const history: LLMMessage[] = [];

  rl.prompt();

  rl.on('line', async (line: string) => {
    const raw = line.trim();
    if (!raw) { rl.prompt(); return; }

    // Commands
    if (raw === '/exit') {
      console.log('Session closed.');
      rl.close();
      return;
    }

    if (raw === '/status') {
      const ok = await session.ollamaAvailable;
      console.log(`  ollama:  ${ok ? 'connected' : 'unavailable'}`);
      console.log(`  claude:  ${session.hasClaudeKey ? 'configured' : 'not configured'}`);
      console.log(`  repo:    ${session.repoPath}`);
      console.log(`  repos:   ${session.closureRepos.join(', ')}`);
      console.log(`  turns:   ${session.turnIndex}`);
      rl.prompt();
      return;
    }

    if (raw === '/cost') {
      // Placeholder — cost tracking will be added in later phases
      console.log('  Claude spend: $0.00 (cost tracking not yet implemented)');
      rl.prompt();
      return;
    }

    if (raw === '/toggle-permissions') {
      session.permissionMode = session.permissionMode === 'validate' ? 'auto-accept' : 'validate';
      console.log(`  permissions: ${session.permissionMode}`);
      rl.prompt();
      return;
    }

    // Classify intent and select provider
    const classified = await classify(raw, {
      ctx: {},
      llmProvider: ollamaOk ? session.ollamaProvider : undefined,
    });
    const route = selectProvider(classified.intent, classified.explicit, {
      ollamaProvider: session.ollamaProvider,
      claudeProvider: session.claudeProvider,
      config: session.config,
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

    // Graph-only intents — no LLM call (handled by graph handler in Phase 9)
    if (route.graphOnly) {
      console.log('  [graph] Pure graph queries not yet implemented. Use research intent for now.');
      rl.prompt();
      return;
    }

    // Build messages
    const messages: LLMMessage[] = [
      session.buildSystemPrompt(),
      ...history,
      { role: 'user', content: classified.message },
    ];

    // Check daemon availability for MCP tools
    const mcpAvailable = await pingDaemon();
    const tools = getToolDefinitions({ mcpAvailable });

    // Execute via tool loop (if provider supports tools) or plain stream
    try {
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
        });

        process.stdout.write('\n\n');

        // Track history
        history.push({ role: 'user', content: classified.message });
        for (const msg of result.messages) {
          history.push(msg);
        }

        if (result.hitLimit) {
          console.log('  [warning] Tool loop hit max iterations (25)');
        }
      } else {
        // Fallback: plain streaming (no tool use)
        let response = '';
        for await (const delta of route.provider.stream(messages)) {
          process.stdout.write(delta);
          response += delta;
        }
        process.stdout.write('\n\n');

        history.push({ role: 'user', content: classified.message });
        history.push({ role: 'assistant', content: response });
      }

      // Keep last 10 turns (20 messages) to stay within context limits
      while (history.length > 20) {
        history.shift();
      }

      session.turnIndex++;
    } catch (err) {
      console.error('\n[error]', err instanceof Error ? err.message : err);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
