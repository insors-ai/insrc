/**
 * Tester agent steps — 8 steps implementing scenario-level test planning,
 * code generation, classify-then-fix execution, and Pair agent handoff.
 *
 * analyze → generate-test-plan → review-test-plan → write-tests →
 *   review-tests → execute-tests → impl-bug-gate → report
 */

import type { AgentStep, StepContext } from '../../framework/types.js';
import type { LLMMessage } from '../../../shared/types.js';
import type { TesterState } from './agent-state.js';
import type {
  TestPlan, TestPlanEntry, TestFileResult,
  FailureClassification, ImplementationBug,
} from './types.js';
import {
  parseProviderMention, resolveStepProvider, consumeOverride, applyOverride,
} from '../../framework/provider-mention.js';
import { investigate } from '../shared/investigate.js';
import { loadConfigContext } from '../shared/config-context.js';
import { detectFramework, findTestFile, runTests, formatTestResultForLLM } from '../test-runner.js';
import { generateAndValidate, applyApprovedDiff } from '../shared/codegen.js';
import { classifyFailure, isLiveTest, frameworkToLanguage } from './classify.js';
import {
  ANALYZE_SYSTEM, GENERATE_TEST_PLAN_SYSTEM, VALIDATE_TEST_PLAN_SYSTEM,
  WRITE_TESTS_SYSTEM, REVIEW_TESTS_SYSTEM,
  FIX_TEST_SYSTEM, FIX_TEST_ESCALATION_SYSTEM,
  REPORT_SYSTEM,
} from './prompts.js';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import {
  parseDiff, applyDiff, extractDiffFromResponse,
} from '../diff-utils.js';
import { requestReindex } from '../reindex.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 3;
const MAX_FIX_ATTEMPTS = 3;
const MAX_CLAUDE_ROUNDS = 2;

// ---------------------------------------------------------------------------
// Step: analyze
// ---------------------------------------------------------------------------

export const analyzeStep: AgentStep<TesterState> = {
  name: 'analyze',
  async run(state, ctx) {
    ctx.progress('Analyzing code for testing...');

    // Investigation
    const provider = resolveStepProvider(ctx, state, 'tester', 'analyze');
    const investigation = await investigate(
      `Investigate for test generation: ${state.input.message}\n\nFocus on understanding function signatures, dependencies, and existing test patterns.`,
      ctx,
      { provider, systemSuffix: ANALYZE_SYSTEM, onProgress: (msg) => ctx.progress(msg) },
    );

    // Detect framework
    ctx.progress('Detecting test framework...');
    const framework = await detectFramework(state.input.repoPath);
    ctx.progress(`Framework: ${framework}`);

    // Extract source files from investigation
    const sourceFiles = investigation.filesExamined
      .filter(f => !f.startsWith('glob:') && !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__'));

    // Find existing test files
    ctx.progress('Discovering existing tests...');
    const existingTests: string[] = [];
    for (const src of sourceFiles) {
      const testFile = await findTestFile(src, state.input.repoPath);
      if (testFile) existingTests.push(testFile);
    }

    // Load config context
    const language = frameworkToLanguage(framework);
    let configContext = await loadConfigContext(ctx, 'tester', language, state.input.repoPath) || undefined;

    // Targeted feedback search
    if (ctx.searchConfig) {
      try {
        const feedback = await ctx.searchConfig({
          query: `test generation patterns for ${framework}`,
          namespace: ['tester', 'common'],
          category: 'feedback',
          limit: 3,
          boostProject: true,
        });
        if (feedback.length > 0) {
          const feedbackText = feedback.map(f => f.entry.body).join('\n');
          configContext = configContext
            ? `${configContext}\n\n### Tester Learnings\n${feedbackText}`
            : `## Tester Learnings\n${feedbackText}`;
        }
      } catch { /* config search unavailable */ }
    }

    // Resolve test template
    if (ctx.resolveTemplate) {
      try {
        const template = await ctx.resolveTemplate({
          namespace: 'tester',
          language,
          name: `${framework}-unit`,
          repoPath: state.input.repoPath,
        });
        if (template) {
          configContext = configContext
            ? `${configContext}\n\n### Test Template\n${template.body}`
            : `## Test Template\n${template.body}`;
        }
      } catch { /* template resolution unavailable */ }
    }

    const newState = consumeOverride({
      ...state,
      investigationSummary: investigation.summary,
      detectedFramework: framework,
      existingTests,
      sourceFiles,
      configContext,
    });

    ctx.progress(`Analysis complete: ${sourceFiles.length} source files, ${existingTests.length} existing tests.`);
    return { state: newState, next: 'generate-test-plan' };
  },
};

// ---------------------------------------------------------------------------
// Step: generate-test-plan
// ---------------------------------------------------------------------------

export const generateTestPlanStep: AgentStep<TesterState> = {
  name: 'generate-test-plan',
  async run(state, ctx) {
    ctx.progress('Generating test plan...');

    const provider = resolveStepProvider(ctx, state, 'tester', 'generate-test-plan');

    // Build prompt context
    const userParts: string[] = [];
    if (state.investigationSummary) userParts.push(`## Investigation\n${state.investigationSummary}`);
    userParts.push(`## Source Files\n${state.sourceFiles.join('\n')}`);
    if (state.existingTests.length > 0) {
      userParts.push(`## Existing Tests\n${state.existingTests.join('\n')}`);
    }
    userParts.push(`## Framework: ${state.detectedFramework}`);
    if (state.configContext) userParts.push(state.configContext);
    userParts.push(`## User Request\n${state.input.message}`);

    const messages: LLMMessage[] = [
      { role: 'system', content: GENERATE_TEST_PLAN_SYSTEM },
      { role: 'user', content: userParts.join('\n\n') },
    ];

    // Generate with retry on malformed JSON
    let testPlan: TestPlan | null = null;
    for (let attempt = 0; attempt < 3 && !testPlan; attempt++) {
      const response = await provider.complete(messages, {
        maxTokens: 3000,
        temperature: 0.3,
      });

      testPlan = parseTestPlan(response.text, state.detectedFramework);
      if (!testPlan && attempt < 2) {
        ctx.progress(`Plan generation attempt ${attempt + 1} produced invalid JSON, retrying...`);
        messages.push({ role: 'assistant', content: response.text });
        messages.push({ role: 'user', content: 'The previous output was not valid JSON. Please output ONLY a valid JSON object matching the schema.' });
      }
    }

    // Fallback: one entry per source file
    if (!testPlan) {
      ctx.progress('Plan generation failed — using fallback plan.');
      testPlan = {
        framework: state.detectedFramework,
        summary: 'Fallback plan: one test file per source file',
        entries: state.sourceFiles.map((src, i) => ({
          index: i + 1,
          targetFile: src,
          testFile: inferTestFilePath(src),
          kind: 'unit' as const,
          scenarios: ['happy path', 'error handling', 'edge cases'],
          fixtures: [],
          setup: null,
          priority: 'medium' as const,
        })),
      };
    }

    // Claude review (if available)
    const claudeProvider = ctx.providers.resolveOrNull('tester', 'validate-plan');
    if (claudeProvider && testPlan.entries.length > 0) {
      ctx.progress('Claude reviewing test plan...');
      const reviewMessages: LLMMessage[] = [
        { role: 'system', content: VALIDATE_TEST_PLAN_SYSTEM },
        { role: 'user', content: `## Test Plan\n${JSON.stringify(testPlan, null, 2)}\n\n## Source Files\n${state.sourceFiles.join('\n')}` },
      ];

      const reviewResponse = await claudeProvider.complete(reviewMessages, {
        maxTokens: 1500,
        temperature: 0.1,
      });

      if (!reviewResponse.text.trim().startsWith('APPROVED')) {
        const feedback = reviewResponse.text.replace(/^CHANGES_NEEDED\s*/i, '').trim();
        ctx.progress('Claude suggested changes — refining plan...');

        // One refinement round with local
        const refineMessages: LLMMessage[] = [
          { role: 'system', content: GENERATE_TEST_PLAN_SYSTEM },
          { role: 'user', content: `${userParts.join('\n\n')}\n\n## Reviewer Feedback\n${feedback}` },
        ];

        const refineResponse = await provider.complete(refineMessages, {
          maxTokens: 3000,
          temperature: 0.3,
        });

        const refined = parseTestPlan(refineResponse.text, state.detectedFramework);
        if (refined) testPlan = refined;
      }
    }

    ctx.writeArtifact('test-plan.json', JSON.stringify(testPlan, null, 2));

    const newState = consumeOverride({ ...state, testPlan });
    ctx.progress(`Test plan created: ${testPlan.entries.length} entries.`);
    return { state: newState, next: 'review-test-plan' };
  },
  artifacts: () => ['test-plan.json'],
};

// ---------------------------------------------------------------------------
// Step: review-test-plan (gate)
// ---------------------------------------------------------------------------

export const reviewTestPlanStep: AgentStep<TesterState> = {
  name: 'review-test-plan',
  async run(state, ctx) {
    const plan = state.testPlan;
    if (!plan || plan.entries.length === 0) {
      ctx.progress('No test plan entries. Skipping to report.');
      return { state, next: 'report' };
    }

    const content = formatTestPlanForGate(plan);

    const reply = await ctx.gate({
      stage: 'test-plan',
      title: 'Test Plan Review',
      content,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'approve-review', label: 'Approve with code review' },
        { name: 'edit', label: 'Edit', hint: '<feedback>' },
        { name: 'reject', label: 'Reject', hint: '<reason>' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    switch (reply.action) {
      case 'approve': {
        const fileResults = initFileResults(plan);
        return {
          state: { ...newState, reviewTests: false, fileResults, currentEntryIndex: 0 },
          next: 'write-tests',
        };
      }

      case 'approve-review': {
        const fileResults = initFileResults(plan);
        return {
          state: { ...newState, reviewTests: true, fileResults, currentEntryIndex: 0 },
          next: 'write-tests',
        };
      }

      case 'edit': {
        if (ctx.recordFeedback && (cleanFeedback || reply.feedback)) {
          ctx.recordFeedback({
            content: `User edited test plan: ${cleanFeedback || reply.feedback}`,
            namespace: 'tester',
            language: frameworkToLanguage(state.detectedFramework),
            repoPath: state.input.repoPath,
            provider: ctx.providers.local,
          }).catch(() => {});
        }
        const key = 'test-plan';
        const rounds = (newState.editRounds[key] ?? 0) + 1;
        if (rounds > MAX_EDIT_ROUNDS) {
          ctx.progress(`Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding.`);
          const fileResults = initFileResults(plan);
          return {
            state: { ...newState, reviewTests: false, fileResults, currentEntryIndex: 0 },
            next: 'write-tests',
          };
        }
        return {
          state: {
            ...newState,
            testPlan: null,
            editRounds: { ...newState.editRounds, [key]: rounds },
          },
          next: 'generate-test-plan',
        };
      }

      case 'reject': {
        if (ctx.recordFeedback && (cleanFeedback || reply.feedback)) {
          ctx.recordFeedback({
            content: `User rejected test plan: ${cleanFeedback || reply.feedback}`,
            namespace: 'tester',
            language: frameworkToLanguage(state.detectedFramework),
            repoPath: state.input.repoPath,
            provider: ctx.providers.local,
          }).catch(() => {});
        }
        return { state: { ...newState, testPlan: null }, next: 'analyze' };
      }

      default:
        return { state: newState, next: 'write-tests' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: write-tests (per-group)
// ---------------------------------------------------------------------------

export const writeTestsStep: AgentStep<TesterState> = {
  name: 'write-tests',
  async run(state, ctx) {
    const plan = state.testPlan;
    if (!plan || state.currentEntryIndex >= plan.entries.length) {
      return { state, next: nextAfterEntry(state) };
    }

    const entry = plan.entries[state.currentEntryIndex]!;
    ctx.progress(`Writing tests for ${entry.targetFile} (${state.currentEntryIndex + 1}/${plan.entries.length})...`);

    // Read source and existing test files
    const sourceCode = await readFileSafe(resolve(state.input.repoPath, entry.targetFile));
    const existingTest = await readFileSafe(resolve(state.input.repoPath, entry.testFile));

    const extraContext: string[] = [];
    if (sourceCode) extraContext.push(`## Target Source\n\`\`\`\n${sourceCode.slice(0, 4000)}\n\`\`\``);
    if (existingTest) extraContext.push(`## Existing Tests (extend, do not rewrite)\n\`\`\`\n${existingTest.slice(0, 2000)}\n\`\`\``);
    extraContext.push(`## Scenarios\n${entry.scenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    if (entry.fixtures.length > 0) extraContext.push(`## Fixtures\n${entry.fixtures.join('\n')}`);
    if (state.configContext) extraContext.push(state.configContext);

    const provider = resolveStepProvider(ctx, state, 'tester', 'write-tests');
    const claudeProvider = ctx.providers.resolveOrNull('tester', 'validate-tests');

    const codegenResult = await generateAndValidate({
      userMessage: `Write tests for ${entry.targetFile} covering: ${entry.scenarios.join(', ')}`,
      repoPath: state.input.repoPath,
      codeContext: state.input.codeContext,
      generateSystem: WRITE_TESTS_SYSTEM,
      localProvider: provider,
      claudeProvider,
      maxRetries: 2,
      extraContext,
      log: (msg) => ctx.progress(msg),
    });

    const fileResults = [...state.fileResults];
    const result = fileResults[state.currentEntryIndex]!;

    if (!codegenResult.approved || !codegenResult.diff) {
      ctx.progress(`Codegen failed for ${entry.targetFile}. Skipping.`);
      fileResults[state.currentEntryIndex] = {
        ...result,
        status: 'codegen-failed',
        error: codegenResult.feedback || 'Code generation failed',
      };
      return {
        state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
        next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
      };
    }

    // Apply diff
    const applyResult = await applyApprovedDiff(
      codegenResult.diff,
      state.input.repoPath,
      (msg) => ctx.progress(msg),
    );

    if (!applyResult.success) {
      fileResults[state.currentEntryIndex] = {
        ...result,
        status: 'codegen-failed',
        error: applyResult.error ?? 'Diff apply failed',
      };
      return {
        state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
        next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
      };
    }

    fileResults[state.currentEntryIndex] = {
      ...result,
      status: 'written',
      filesWritten: applyResult.filesWritten,
    };

    ctx.writeArtifact(`test-${entry.index}.diff`, codegenResult.diff);
    ctx.progress(`Tests written for ${entry.targetFile}.`);

    return {
      state: {
        ...state,
        fileResults,
        filesChanged: [...state.filesChanged, ...applyResult.filesWritten],
      },
      next: 'review-tests',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: review-tests (Claude + conditional gate)
// ---------------------------------------------------------------------------

export const reviewTestsStep: AgentStep<TesterState> = {
  name: 'review-tests',
  async run(state, ctx) {
    const plan = state.testPlan;
    if (!plan) return { state, next: 'execute-tests' };

    const entry = plan.entries[state.currentEntryIndex]!;
    const result = state.fileResults[state.currentEntryIndex]!;

    if (result.status !== 'written') {
      return { state, next: 'execute-tests' };
    }

    // Claude review (always runs if available)
    const claudeProvider = ctx.providers.resolveOrNull('tester', 'review-tests');
    let reviewSummary = '';

    if (claudeProvider) {
      ctx.progress(`Claude reviewing tests for ${entry.targetFile}...`);
      const testCode = await readFileSafe(resolve(state.input.repoPath, entry.testFile));
      const sourceCode = await readFileSafe(resolve(state.input.repoPath, entry.targetFile));

      const reviewMessages: LLMMessage[] = [
        { role: 'system', content: REVIEW_TESTS_SYSTEM },
        {
          role: 'user',
          content: [
            `## Test Code\n\`\`\`\n${testCode.slice(0, 4000)}\n\`\`\``,
            `## Source Code\n\`\`\`\n${sourceCode.slice(0, 3000)}\n\`\`\``,
            `## Scenarios\n${entry.scenarios.join('\n')}`,
          ].join('\n\n'),
        },
      ];

      const reviewResponse = await claudeProvider.complete(reviewMessages, {
        maxTokens: 1500,
        temperature: 0.1,
      });

      reviewSummary = reviewResponse.text.trim();
    }

    // Auto-approve if user chose "approve" (no code review) at plan gate
    if (!state.reviewTests) {
      if (reviewSummary) {
        ctx.progress(`Claude review: ${reviewSummary.startsWith('APPROVED') ? 'APPROVED' : 'issues noted (auto-proceeding)'}`);
      }
      return { state, next: 'execute-tests' };
    }

    // Interactive review gate
    const gateContent = reviewSummary
      ? `## Claude Review\n${reviewSummary}\n\n## Test File: ${entry.testFile}`
      : `## Test File: ${entry.testFile}\n(No Claude review available)`;

    const reply = await ctx.gate({
      stage: 'review-tests',
      title: `Test Code Review (${entry.index}/${plan.entries.length})`,
      content: gateContent,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>' },
        { name: 'skip', label: 'Skip this test' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    switch (reply.action) {
      case 'approve':
        return { state: newState, next: 'execute-tests' };

      case 'edit': {
        if (ctx.recordFeedback && (cleanFeedback || reply.feedback)) {
          ctx.recordFeedback({
            content: `User edited test code: ${cleanFeedback || reply.feedback}`,
            namespace: 'tester',
            language: frameworkToLanguage(state.detectedFramework),
            repoPath: state.input.repoPath,
            provider: ctx.providers.local,
          }).catch(() => {});
        }
        const key = `review-tests-${entry.index}`;
        const rounds = (newState.editRounds[key] ?? 0) + 1;
        if (rounds > MAX_EDIT_ROUNDS) {
          ctx.progress('Max edit rounds reached. Proceeding.');
          return { state: newState, next: 'execute-tests' };
        }
        return {
          state: { ...newState, editRounds: { ...newState.editRounds, [key]: rounds } },
          next: 'write-tests', // same group, no index advance
        };
      }

      case 'skip': {
        const fileResults = [...newState.fileResults];
        fileResults[state.currentEntryIndex] = { ...result, status: 'skipped' };
        return {
          state: { ...newState, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
          next: nextAfterEntry({ ...newState, currentEntryIndex: state.currentEntryIndex + 1 }),
        };
      }

      default:
        return { state: newState, next: 'execute-tests' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: execute-tests (classify-then-fix loop)
// ---------------------------------------------------------------------------

export const executeTestsStep: AgentStep<TesterState> = {
  name: 'execute-tests',
  async run(state, ctx) {
    const plan = state.testPlan;
    if (!plan) return { state, next: 'report' };

    const entry = plan.entries[state.currentEntryIndex]!;
    const result = state.fileResults[state.currentEntryIndex]!;

    if (result.status !== 'written') {
      // Skip entries that weren't successfully written
      return {
        state: { ...state, currentEntryIndex: state.currentEntryIndex + 1 },
        next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
      };
    }

    const testFilePath = resolve(state.input.repoPath, entry.testFile);
    ctx.progress(`Executing tests: ${entry.testFile}...`);

    // Live test prerequisite check
    if (isLiveTest(entry.testFile) && entry.setup?.services) {
      ctx.progress('  Checking prerequisites for live test...');
      // Simple check: verify env vars exist
      for (const [name, svc] of Object.entries(entry.setup.services)) {
        if (svc.envVar && !process.env[svc.envVar]) {
          ctx.progress(`  Prerequisite not met: ${name} (${svc.envVar} not set)`);
          const fileResults = [...state.fileResults];
          fileResults[state.currentEntryIndex] = { ...result, status: 'prereq-not-met', error: `${name}: ${svc.envVar} not set` };
          return {
            state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
            next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
          };
        }
      }
    }

    // Initial test run
    let testResult = await runTests(testFilePath, state.input.repoPath, state.detectedFramework);

    if (testResult.passed) {
      ctx.progress(`  ALL PASSED (${testResult.passCount}/${testResult.total})`);
      const fileResults = [...state.fileResults];
      fileResults[state.currentEntryIndex] = { ...result, status: 'passing', testResult };
      void requestReindex(result.filesWritten, (msg) => ctx.progress(msg));
      return {
        state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
        next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
      };
    }

    ctx.progress(`  ${testResult.failCount} failure(s) — entering classify-then-fix loop`);

    const provider = resolveStepProvider(ctx, state, 'tester', 'execute');
    const claudeProvider = ctx.providers.resolveOrNull('tester', 'fix-escalation');
    let localAttempts = 0;
    let claudeRounds = 0;
    const fixDiffs: string[] = [];

    // Classify-then-fix loop
    while (true) {
      // Read current code
      const testCode = await readFileSafe(testFilePath);
      const implCode = await readFileSafe(resolve(state.input.repoPath, entry.targetFile));

      // Classify failure
      const classification = await classifyFailure({
        testResult,
        testCode,
        implCode,
        provider: claudeProvider ?? provider,
        log: (msg) => ctx.progress(msg),
      });

      ctx.progress(`  Classification: ${classification.category} (${classification.confidence})`);

      // Route by classification
      if (classification.category === 'implementation_bug') {
        ctx.progress(`  Implementation bug detected — accumulating for Pair handoff.`);
        const bug: ImplementationBug = {
          testFile: entry.testFile,
          testName: testResult.failures[0]?.testName ?? 'unknown',
          sourceFile: entry.targetFile,
          description: classification.reasoning,
          classification,
          status: 'detected',
        };
        const fileResults = [...state.fileResults];
        fileResults[state.currentEntryIndex] = { ...result, status: 'impl-bug', testResult, fixAttempts: localAttempts, claudeRounds };
        return {
          state: {
            ...state,
            fileResults,
            implementationBugs: [...state.implementationBugs, bug],
            currentEntryIndex: state.currentEntryIndex + 1,
          },
          next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
        };
      }

      if (classification.category === 'setup_issue') {
        ctx.progress(`  Setup issue — skipping.`);
        const fileResults = [...state.fileResults];
        fileResults[state.currentEntryIndex] = { ...result, status: 'setup-skipped', testResult, error: classification.reasoning };
        return {
          state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
          next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
        };
      }

      // test_issue — attempt fix
      if (localAttempts >= MAX_FIX_ATTEMPTS) {
        // Escalate to Claude
        if (claudeRounds >= MAX_CLAUDE_ROUNDS || !claudeProvider) {
          ctx.progress(`  Fix loop exhausted (${localAttempts} local, ${claudeRounds} Claude).`);
          const fileResults = [...state.fileResults];
          fileResults[state.currentEntryIndex] = { ...result, status: 'fix-exhausted', testResult, fixAttempts: localAttempts, claudeRounds };
          return {
            state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
            next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
          };
        }

        claudeRounds++;
        ctx.progress(`  Escalating to Claude (round ${claudeRounds})...`);

        const escalationParts: string[] = [
          `## Failing Test Output\n${formatTestResultForLLM(testResult)}`,
          `## Test Code\n\`\`\`\n${testCode.slice(0, 3000)}\n\`\`\``,
          `## Implementation Code\n\`\`\`\n${implCode.slice(0, 3000)}\n\`\`\``,
        ];
        for (let i = 0; i < fixDiffs.length; i++) {
          escalationParts.push(`## Prior Fix Attempt ${i + 1}\n\`\`\`diff\n${fixDiffs[i]}\n\`\`\``);
        }
        if (state.configContext) escalationParts.push(state.configContext);

        const escalationMessages: LLMMessage[] = [
          { role: 'system', content: FIX_TEST_ESCALATION_SYSTEM },
          { role: 'user', content: escalationParts.join('\n\n') },
        ];

        const escalationResponse = await claudeProvider.complete(escalationMessages, {
          maxTokens: 4000,
          temperature: 0.1,
        });

        const fixDiff = extractDiffFromResponse(escalationResponse.text);
        if (fixDiff && fixDiff.includes('---')) {
          fixDiffs.push(fixDiff);
          const applied = await applyTestFixDiff(fixDiff, state.input.repoPath, result, (msg) => ctx.progress(msg));
          if (applied) {
            testResult = await runTests(testFilePath, state.input.repoPath, state.detectedFramework);
            if (testResult.passed) {
              ctx.progress(`  PASSED after Claude fix (round ${claudeRounds}).`);
              const fileResults = [...state.fileResults];
              fileResults[state.currentEntryIndex] = { ...result, status: 'passing', testResult, fixAttempts: localAttempts, claudeRounds };
              return {
                state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
                next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
              };
            }
          }
        }
        localAttempts = 0; // reset local attempts after Claude round
        continue;
      }

      // Local fix attempt
      localAttempts++;
      ctx.progress(`  Local fix attempt ${localAttempts}/${MAX_FIX_ATTEMPTS}...`);

      const fixParts: string[] = [
        `## Failing Test Output\n${formatTestResultForLLM(testResult)}`,
        `## Test Code\n\`\`\`\n${testCode.slice(0, 3000)}\n\`\`\``,
        `## Implementation Code\n\`\`\`\n${implCode.slice(0, 3000)}\n\`\`\``,
      ];
      if (fixDiffs.length > 0) {
        fixParts.push(`## Previous Fix\n\`\`\`diff\n${fixDiffs[fixDiffs.length - 1]}\n\`\`\``);
      }
      if (state.configContext) fixParts.push(state.configContext);

      const fixMessages: LLMMessage[] = [
        { role: 'system', content: FIX_TEST_SYSTEM },
        { role: 'user', content: fixParts.join('\n\n') },
      ];

      const fixResponse = await provider.complete(fixMessages, {
        maxTokens: 4000,
        temperature: 0.2,
      });

      const fixDiff = extractDiffFromResponse(fixResponse.text);
      if (!fixDiff || !fixDiff.includes('---')) {
        fixDiffs.push('(invalid diff)');
        continue;
      }

      fixDiffs.push(fixDiff);
      const applied = await applyTestFixDiff(fixDiff, state.input.repoPath, result, (msg) => ctx.progress(msg));
      if (!applied) continue;

      testResult = await runTests(testFilePath, state.input.repoPath, state.detectedFramework);
      if (testResult.passed) {
        ctx.progress(`  PASSED after local fix attempt ${localAttempts}.`);
        const fileResults = [...state.fileResults];
        fileResults[state.currentEntryIndex] = { ...result, status: 'passing', testResult, fixAttempts: localAttempts, claudeRounds };
        void requestReindex(result.filesWritten, (msg) => ctx.progress(msg));
        return {
          state: { ...state, fileResults, currentEntryIndex: state.currentEntryIndex + 1 },
          next: nextAfterEntry({ ...state, currentEntryIndex: state.currentEntryIndex + 1 }),
        };
      }
      // Loop continues — re-classify on next iteration
    }
  },
};

// ---------------------------------------------------------------------------
// Step: impl-bug-gate (Pair handoff)
// ---------------------------------------------------------------------------

export const implBugGateStep: AgentStep<TesterState> = {
  name: 'impl-bug-gate',
  async run(state, ctx) {
    if (state.implementationBugs.length === 0) {
      return { state, next: 'report' };
    }

    // Format bugs for gate display
    const bugLines = state.implementationBugs.map((bug, i) => [
      `${i + 1}. [${bug.sourceFile}] ${bug.testName}`,
      `   ${bug.description}`,
      `   Confidence: ${bug.classification.confidence}`,
    ].join('\n'));

    const content = [
      `## Implementation Bugs Found (${state.implementationBugs.length})`,
      '',
      ...bugLines,
    ].join('\n');

    const reply = await ctx.gate({
      stage: 'impl-bug',
      title: 'Implementation Bugs Detected',
      content,
      actions: [
        { name: 'auto-fix', label: 'Auto-fix (Pair agent)' },
        { name: 'skip', label: 'Skip (report as known failures)' },
      ],
    });

    if (reply.action === 'skip') {
      const bugs = state.implementationBugs.map(b => ({ ...b, status: 'skipped' as const }));
      return { state: { ...state, implementationBugs: bugs }, next: 'report' };
    }

    // Auto-fix via Pair agent
    ctx.progress('Invoking Pair agent for implementation bug fixes...');

    const todoList = state.implementationBugs
      .map((bug, i) => `${i + 1}. [ ] [${bug.sourceFile}] ${bug.testName} — ${bug.description}`)
      .join('\n');

    // Build code context from affected files
    const affectedFiles = [...new Set(state.implementationBugs.map(b => b.sourceFile))];
    const codeSnippets: string[] = [];
    for (const f of affectedFiles) {
      const code = await readFileSafe(resolve(state.input.repoPath, f));
      if (code) codeSnippets.push(`## ${f}\n\`\`\`\n${code.slice(0, 2000)}\n\`\`\``);
    }

    try {
      const { pairAgent } = await import('../pair/agent.js');
      const { runAgent } = await import('../../framework/runner.js');
      type RunnerOpts = import('../../framework/runner.js').RunnerOpts;
      const { TestChannel } = await import('../../framework/test-channel.js');

      const subChannel = new TestChannel([
        { action: 'approve' }, // review-gate: approve proposal
        { action: 'approve' }, // review-gate: approve applied
        { action: 'done' },    // review-gate: done
      ]);

      const rpcFn = <T>(method: string, params?: unknown): Promise<T> =>
        ctx.rpc<T>(method, params).then(r => {
          if (r === null) throw new Error('RPC returned null');
          return r;
        });

      const pairOpts: RunnerOpts = {
        definition: pairAgent as unknown as RunnerOpts['definition'],
        channel: subChannel,
        options: {
          input: {
            message: `Fix the following implementation bugs found by test execution:\n\nTODO:\n${todoList}`,
            codeContext: codeSnippets.join('\n\n'),
            mode: 'debug',
            session: {
              repoPath: state.input.repoPath,
              closureRepos: state.input.closureRepos,
            },
          },
          repo: state.input.repoPath,
        },
        config: ctx.config,
        providers: ctx.providers,
        rpcFn,
      };

      await runAgent(pairOpts);

      // Re-run previously-failing test files
      ctx.progress('Re-running tests after Pair fixes...');
      const fileResults = [...state.fileResults];
      const bugs = [...state.implementationBugs];

      for (let i = 0; i < fileResults.length; i++) {
        const fr = fileResults[i]!;
        if (fr.status !== 'impl-bug') continue;

        const testFilePath = resolve(state.input.repoPath, fr.testFile);
        const rerunResult = await runTests(testFilePath, state.input.repoPath, state.detectedFramework);

        if (rerunResult.passed) {
          fileResults[i] = { ...fr, status: 'passing', testResult: rerunResult };
          const bugIdx = bugs.findIndex(b => b.testFile === fr.testFile);
          if (bugIdx >= 0) bugs[bugIdx] = { ...bugs[bugIdx]!, status: 'fixed' };
        }
      }

      return { state: { ...state, fileResults, implementationBugs: bugs }, next: 'report' };
    } catch (err) {
      ctx.progress(`Pair agent invocation failed: ${err instanceof Error ? err.message : String(err)}`);
      return { state, next: 'report' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: report
// ---------------------------------------------------------------------------

export const reportStep: AgentStep<TesterState> = {
  name: 'report',
  async run(state, ctx) {
    ctx.progress('Generating test report...');

    const provider = resolveStepProvider(ctx, state, 'tester', 'report');

    // Build summary parts
    const parts: string[] = [];
    const passing = state.fileResults.filter(r => r.status === 'passing').length;
    const failing = state.fileResults.filter(r => r.status === 'failing' || r.status === 'fix-exhausted').length;
    const skipped = state.fileResults.filter(r => r.status === 'skipped' || r.status === 'prereq-not-met' || r.status === 'setup-skipped').length;
    const implBugs = state.fileResults.filter(r => r.status === 'impl-bug').length;
    const codegenFailed = state.fileResults.filter(r => r.status === 'codegen-failed').length;

    parts.push(`Test framework: ${state.detectedFramework}`);
    parts.push(`Total entries: ${state.fileResults.length}`);
    parts.push(`Passing: ${passing} | Failing: ${failing} | Impl bugs: ${implBugs} | Skipped: ${skipped} | Codegen failed: ${codegenFailed}`);

    if (state.fileResults.length > 0) {
      parts.push('\nPer-file results:');
      for (const r of state.fileResults) {
        parts.push(`  ${r.targetFile} → ${r.testFile}: ${r.status} (${r.fixAttempts} fix, ${r.claudeRounds} Claude)`);
        if (r.error) parts.push(`    Error: ${r.error}`);
      }
    }

    if (state.implementationBugs.length > 0) {
      parts.push('\nImplementation bugs:');
      for (const bug of state.implementationBugs) {
        parts.push(`  [${bug.status}] ${bug.sourceFile} — ${bug.description.slice(0, 100)}`);
      }
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: REPORT_SYSTEM },
      { role: 'user', content: parts.join('\n') },
    ];

    const response = await provider.complete(messages, {
      maxTokens: 1500,
      temperature: 0.2,
    });

    const report = response.text.trim();
    ctx.writeArtifact('test-report.md', report);

    // Record session-level feedback on high failure rate
    const total = state.fileResults.length;
    if (ctx.recordFeedback && total > 0 && (failing + codegenFailed) > total * 0.5) {
      ctx.recordFeedback({
        content: `High test failure rate (${failing + codegenFailed}/${total}). Generated tests may not match project patterns.`,
        namespace: 'tester',
        language: frameworkToLanguage(state.detectedFramework),
        repoPath: state.input.repoPath,
        provider: ctx.providers.local,
      }).catch(() => {});
    }

    ctx.emit(report);

    const allPassing = state.fileResults.every(r => r.status === 'passing' || r.status === 'skipped');

    return {
      state: { ...state, summary: report, allPassing },
      next: null,
    };
  },
  artifacts: () => ['test-report.md'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a TestPlan from LLM response text. Returns null on failure. */
function parseTestPlan(text: string, fallbackFramework: string): TestPlan | null {
  let jsonStr = text.trim();

  // Strip markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

  // Find JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0]!;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const entries = parsed['entries'];
    if (!Array.isArray(entries) || entries.length === 0) return null;

    return {
      framework: (typeof parsed['framework'] === 'string' ? parsed['framework'] : fallbackFramework) as TestPlan['framework'],
      summary: typeof parsed['summary'] === 'string' ? parsed['summary'] : '',
      entries: entries.filter(
        (e): e is TestPlanEntry =>
          typeof e === 'object' && e !== null && 'targetFile' in e && 'scenarios' in e,
      ).map((e, i) => ({
        index: typeof e.index === 'number' ? e.index : i + 1,
        targetFile: String(e.targetFile),
        testFile: String(e.testFile ?? inferTestFilePath(String(e.targetFile))),
        kind: e.kind === 'live' ? 'live' as const : 'unit' as const,
        scenarios: Array.isArray(e.scenarios) ? e.scenarios.map(String) : [],
        fixtures: Array.isArray(e.fixtures) ? e.fixtures.map(String) : [],
        setup: (typeof e.setup === 'object' && e.setup !== null ? e.setup : null) as TestPlanEntry['setup'],
        priority: (e.priority === 'high' || e.priority === 'medium' || e.priority === 'low') ? e.priority : 'medium',
      })),
    };
  } catch {
    return null;
  }
}

/** Infer a test file path from a source file path. */
function inferTestFilePath(sourceFile: string): string {
  const dir = dirname(sourceFile);
  const base = sourceFile.split('/').pop()!.replace(/\.(ts|js|tsx|jsx|py|go)$/, '');
  const ext = sourceFile.match(/\.(ts|js|tsx|jsx|py|go)$/)?.[0] ?? '.ts';

  if (ext === '.py') return `${dir}/test_${base}.py`;
  if (ext === '.go') return `${dir}/${base}_test.go`;
  return `${dir}/__tests__/${base}.test${ext}`;
}

/** Format test plan for gate display. */
function formatTestPlanForGate(plan: TestPlan): string {
  const lines: string[] = [
    `## Test Plan: ${plan.summary}`,
    `Framework: ${plan.framework} | Entries: ${plan.entries.length}`,
    '',
  ];

  for (const entry of plan.entries) {
    lines.push(`### ${entry.index}. ${entry.targetFile} → ${entry.testFile} [${entry.kind}] (${entry.priority})`);
    for (const s of entry.scenarios) {
      lines.push(`  - ${s}`);
    }
    if (entry.fixtures.length > 0) {
      lines.push(`  Fixtures: ${entry.fixtures.join(', ')}`);
    }
    if (entry.setup) {
      lines.push(`  Setup: ${JSON.stringify(entry.setup)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Initialize TestFileResult[] from test plan entries. */
function initFileResults(plan: TestPlan): TestFileResult[] {
  return plan.entries.map(e => ({
    testFile: e.testFile,
    targetFile: e.targetFile,
    kind: e.kind,
    status: 'pending' as const,
    scenarios: e.scenarios,
    fixAttempts: 0,
    claudeRounds: 0,
    filesWritten: [],
  }));
}

/** Read a file, returning empty string if not found. */
async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** Apply a fix diff to the repo. Returns true if applied successfully. */
async function applyTestFixDiff(
  fixDiff: string,
  repoPath: string,
  _result: TestFileResult,
  log: (msg: string) => void,
): Promise<boolean> {
  const parsed = parseDiff(fixDiff);

  // Dry-run
  const dryResult = await applyDiff(parsed, repoPath, true);
  if (!dryResult.success) {
    log(`  Fix diff dry-run failed.`);
    return false;
  }

  // Apply
  const applyResult = await applyDiff(parsed, repoPath, false);
  if (!applyResult.success) return false;

  // Re-index implementation files (non-test files)
  const implFiles = applyResult.filesWritten.filter(
    f => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__'),
  );
  if (implFiles.length > 0) {
    await requestReindex(implFiles, log);
  }

  return true;
}

/** Determine the next step after processing a test entry. */
function nextAfterEntry(state: TesterState): string {
  const nextIdx = state.currentEntryIndex + 1;
  const plan = state.testPlan;
  if (!plan || nextIdx >= plan.entries.length) {
    return state.implementationBugs.length > 0 ? 'impl-bug-gate' : 'report';
  }
  return 'write-tests';
}
