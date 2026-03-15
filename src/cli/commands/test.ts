/**
 * CLI commands for the tester agent.
 *
 * Subcommands:
 *   insrc test run <files...>          — run full tester pipeline (non-interactive)
 *   insrc test run --review <files...> — run with code review gates
 *   insrc test plan <files...>         — generate test plan only
 */

import type { Command } from 'commander';

export function registerTestCommands(program: Command): void {
  const test = program.command('test').description('generate, write, and execute tests');

  test
    .command('run')
    .description('run tester agent (generate → write → execute → fix)')
    .argument('<files...>', 'source files or directories to test')
    .option('--review', 'enable test code review gates')
    .option('--cwd <path>', 'repo path (defaults to current directory)')
    .option('--framework <name>', 'override auto-detected test framework')
    .option('--kind <type>', 'override test kind (unit or live)', 'unit')
    .option('--timeout <ms>', 'per-test execution timeout', '60000')
    .action(cmdRun);

  test
    .command('plan')
    .description('generate test plan only (no execution)')
    .argument('<files...>', 'source files or directories to plan tests for')
    .option('--format <fmt>', 'output format: json (default) or md', 'json')
    .option('--cwd <path>', 'repo path (defaults to current directory)')
    .option('--framework <name>', 'override auto-detected test framework')
    .option('--kind <type>', 'override test kind (unit or live)', 'unit')
    .action(cmdPlan);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

interface RunOpts {
  review?: boolean;
  cwd?: string;
  framework?: string;
  kind?: string;
  timeout?: string;
}

interface PlanOpts {
  format?: string;
  cwd?: string;
  framework?: string;
  kind?: string;
}

async function cmdRun(files: string[], opts: RunOpts): Promise<void> {
  const repoPath = opts.cwd ?? process.cwd();

  try {
    const { testerAgent } = await import('../../agent/tasks/tester/agent.js');
    const { runAgent } = await import('../../agent/framework/runner.js');
    const { TestChannel } = await import('../../agent/framework/test-channel.js');
    const { OllamaProvider } = await import('../../agent/providers/ollama.js');
    const { ClaudeProvider } = await import('../../agent/providers/claude.js');
    const { loadConfig, ProviderResolver } = await import('../../agent/config.js');

    const config = loadConfig();
    const ollamaProvider = new OllamaProvider(config.models.local, config.ollama.host, config.models.context.local);
    const claudeProvider = config.keys.anthropic ? new ClaudeProvider({ apiKey: config.keys.anthropic }) : null;
    const resolver = new ProviderResolver(config, ollamaProvider, claudeProvider);

    // Build scripted replies for TestChannel
    const replies = opts.review
      ? [{ action: 'approve-review' }]   // approve-with-review at plan gate
      : [{ action: 'approve' }];          // auto-approve at plan gate

    // Add auto-approve for subsequent gates (review-tests, impl-bug-gate)
    for (let i = 0; i < files.length * 2 + 2; i++) {
      replies.push({ action: 'approve' });
    }
    // impl-bug-gate: skip (non-interactive)
    replies.push({ action: 'skip' });

    const channel = new TestChannel(replies);

    const message = `Write tests for: ${files.join(', ')}`;
    const input = {
      message,
      codeContext: '',
      session: { repoPath, closureRepos: [repoPath] },
    };

    console.log(`Running tester agent for ${files.length} file(s)...`);

    const result = await runAgent({
      definition: testerAgent as unknown as import('../../agent/framework/types.js').AgentDefinition,
      channel,
      options: { input, repo: repoPath },
      config,
      providers: {
        local: ollamaProvider,
        claude: claudeProvider,
        resolve: resolver.resolve.bind(resolver),
        resolveOrNull: resolver.resolveOrNull.bind(resolver),
      },
    });

    const finalState = result.result as import('../../agent/tasks/tester/agent-state.js').TesterState;

    // Print results
    const passing = finalState.fileResults.filter(r => r.status === 'passing').length;
    const total = finalState.fileResults.length;

    console.log(`\nResults: ${passing}/${total} passing`);
    for (const r of finalState.fileResults) {
      const icon = r.status === 'passing' ? '\x1b[32m✓\x1b[0m'
        : r.status === 'skipped' ? '\x1b[33m○\x1b[0m'
        : '\x1b[31m✗\x1b[0m';
      console.log(`  ${icon} ${r.targetFile} → ${r.testFile} [${r.status}]`);
      if (r.error) console.log(`    ${r.error}`);
    }

    if (finalState.implementationBugs.length > 0) {
      console.log(`\nImplementation bugs: ${finalState.implementationBugs.length}`);
      for (const bug of finalState.implementationBugs) {
        console.log(`  - [${bug.status}] ${bug.sourceFile}: ${bug.description.slice(0, 100)}`);
      }
    }

    if (finalState.summary) {
      console.log(`\n${finalState.summary}`);
    }

    process.exitCode = passing === total ? 0 : 1;
  } catch (err) {
    console.error(`Test run failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

async function cmdPlan(files: string[], opts: PlanOpts): Promise<void> {
  const repoPath = opts.cwd ?? process.cwd();

  try {
    const { testerAgent } = await import('../../agent/tasks/tester/agent.js');
    const { runAgent } = await import('../../agent/framework/runner.js');
    const { TestChannel } = await import('../../agent/framework/test-channel.js');
    const { OllamaProvider } = await import('../../agent/providers/ollama.js');
    const { ClaudeProvider } = await import('../../agent/providers/claude.js');
    const { loadConfig, ProviderResolver } = await import('../../agent/config.js');

    const config = loadConfig();
    const ollamaProvider = new OllamaProvider(config.models.local, config.ollama.host, config.models.context.local);
    const claudeProvider = config.keys.anthropic ? new ClaudeProvider({ apiKey: config.keys.anthropic }) : null;
    const resolver = new ProviderResolver(config, ollamaProvider, claudeProvider);

    // Plan-only: approve plan gate then reject all subsequent to abort early
    const channel = new TestChannel([
      { action: 'approve' },  // review-test-plan gate — approve to see final plan
    ]);

    const message = `Generate a test plan for: ${files.join(', ')}`;
    const input = {
      message,
      codeContext: '',
      session: { repoPath, closureRepos: [repoPath] },
    };

    const result = await runAgent({
      definition: testerAgent as unknown as import('../../agent/framework/types.js').AgentDefinition,
      channel,
      options: { input, repo: repoPath },
      config,
      providers: {
        local: ollamaProvider,
        claude: claudeProvider,
        resolve: resolver.resolve.bind(resolver),
        resolveOrNull: resolver.resolveOrNull.bind(resolver),
      },
    });

    const finalState = result.result as import('../../agent/tasks/tester/agent-state.js').TesterState;

    if (!finalState.testPlan) {
      console.error('No test plan generated.');
      process.exitCode = 1;
      return;
    }

    if (opts.format === 'md') {
      // Markdown output
      console.log(`# Test Plan: ${finalState.testPlan.summary}`);
      console.log(`Framework: ${finalState.testPlan.framework}\n`);
      for (const entry of finalState.testPlan.entries) {
        console.log(`## ${entry.index}. ${entry.targetFile} → ${entry.testFile} [${entry.kind}] (${entry.priority})`);
        for (const s of entry.scenarios) {
          console.log(`- ${s}`);
        }
        console.log('');
      }
    } else {
      // JSON output
      console.log(JSON.stringify(finalState.testPlan, null, 2));
    }
  } catch (err) {
    console.error(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
