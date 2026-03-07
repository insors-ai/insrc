import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import type { LLMMessage } from '../shared/types.js';
import { loadConfig } from './config.js';
import { Session, parseInput } from './session.js';
import { ensureAgentModel } from './lifecycle.js';

/**
 * Start the interactive agent REPL.
 */
export async function startRepl(cwd?: string): Promise<void> {
  const repoPath = resolve(cwd ?? process.cwd());
  const config = loadConfig();

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
  console.log('Type a message to chat. Prefix with @claude, @opus, or @local to route.');
  console.log('Commands: /status, /cost, /exit');
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

    // Parse input
    const { explicit, message } = parseInput(raw);
    const provider = session.getProvider(explicit);

    if (explicit) {
      const label = explicit === 'opus' ? 'Claude Opus' : explicit === 'claude' ? 'Claude Sonnet' : 'Local';
      console.log(`  [routing → ${label}]`);
    }

    // Build messages
    const messages: LLMMessage[] = [
      session.buildSystemPrompt(),
      ...history,
      { role: 'user', content: message },
    ];

    // Stream response
    try {
      let response = '';
      for await (const delta of provider.stream(messages)) {
        process.stdout.write(delta);
        response += delta;
      }
      process.stdout.write('\n\n');

      // Track history (simple sliding window for now — L3a will replace in Phase 4)
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: response });

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
