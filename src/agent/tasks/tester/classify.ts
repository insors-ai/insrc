/**
 * Failure classification — determines whether a test failure is a test issue,
 * implementation bug, or setup/config problem.
 *
 * Also provides utility functions: isLiveTest(), frameworkToLanguage().
 */

import type { LLMProvider, LLMMessage, Language } from '../../../shared/types.js';
import type { TestResult, TestFramework } from '../test-runner.js';
import type { FailureClassification } from './types.js';
import { formatTestResultForLLM } from '../test-runner.js';
import { CLASSIFY_FAILURE_SYSTEM } from './prompts.js';

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface ClassifyOpts {
  testResult:  TestResult;
  testCode:    string;
  implCode:    string;
  provider:    LLMProvider;
  log?:        ((msg: string) => void) | undefined;
}

/**
 * Classify a test failure by sending test output, test code, and implementation
 * code to an LLM. Returns a structured classification.
 *
 * On parse failure, defaults to test_issue with low confidence.
 */
export async function classifyFailure(opts: ClassifyOpts): Promise<FailureClassification> {
  const { testResult, testCode, implCode, provider, log } = opts;

  const testOutput = formatTestResultForLLM(testResult);

  const messages: LLMMessage[] = [
    { role: 'system', content: CLASSIFY_FAILURE_SYSTEM },
    {
      role: 'user',
      content: [
        `## Test Output\n${testOutput}`,
        `## Test Code\n\`\`\`\n${testCode.slice(0, 3000)}\n\`\`\``,
        `## Implementation Code\n\`\`\`\n${implCode.slice(0, 3000)}\n\`\`\``,
      ].join('\n\n'),
    },
  ];

  try {
    const response = await provider.complete(messages, {
      maxTokens: 500,
      temperature: 0.1,
    });

    return parseClassification(response.text);
  } catch (err) {
    log?.(`Classification failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      category: 'test_issue',
      confidence: 'low',
      reasoning: 'Classification failed — defaulting to test issue',
      suggestedFix: '',
    };
  }
}

/**
 * Parse a FailureClassification from LLM response text.
 * Extracts JSON from markdown fences if present.
 */
function parseClassification(text: string): FailureClassification {
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim();
  }

  // Find JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    jsonStr = objMatch[0]!;
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const category = parsed['category'];
    const confidence = parsed['confidence'];

    if (category !== 'test_issue' && category !== 'implementation_bug' && category !== 'setup_issue') {
      throw new Error(`Invalid category: ${String(category)}`);
    }

    return {
      category,
      confidence: (confidence === 'high' || confidence === 'medium' || confidence === 'low')
        ? confidence
        : 'low',
      reasoning: typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
      suggestedFix: typeof parsed['suggestedFix'] === 'string' ? parsed['suggestedFix'] : '',
    };
  } catch {
    return {
      category: 'test_issue',
      confidence: 'low',
      reasoning: 'Could not parse classification response',
      suggestedFix: '',
    };
  }
}

// ---------------------------------------------------------------------------
// Live test detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a test file is a live/integration test by naming convention.
 *
 * - Node/TS: *.live.(test|spec).[tj]sx?
 * - Python:  test_*_live.py
 * - Go:      *_live_test.go
 */
export function isLiveTest(testFile: string): boolean {
  if (/\.live\.(test|spec)\.[tj]sx?$/.test(testFile)) return true;
  if (/test_\w+_live\.py$/.test(testFile)) return true;
  if (/_live_test\.go$/.test(testFile)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Framework → Language mapping
// ---------------------------------------------------------------------------

/**
 * Map a detected test framework to the Language type used by the config store.
 */
export function frameworkToLanguage(framework: TestFramework): Language | 'all' {
  switch (framework) {
    case 'vitest':
    case 'jest':
    case 'mocha':
      return 'typescript';
    case 'pytest':
      return 'python';
    case 'go':
      return 'go';
    default:
      return 'all';
  }
}
