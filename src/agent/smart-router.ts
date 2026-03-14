/**
 * Smart LLM Router — LLM-assessed complexity routing.
 *
 * When auto mode is enabled (and Ollama is available), uses the local model
 * to assess request complexity and pick the optimal provider:
 *   local | claude-fast | claude-standard | claude-powerful
 *
 * Fast-path bypass handles ~60-70% of requests without an LLM call.
 * Results are cached in an LRU map to avoid repeated assessments.
 */

import { createHash } from 'node:crypto';
import type { AgentConfig, Intent, ExplicitProvider, LLMProvider, LLMMessage } from '../shared/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { hasEscalationAttachment } from './attachments/router.js';
import type { RouteResult, RouterDeps } from './router.js';
import { selectProvider } from './router.js';
import { ProviderResolver } from './config.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('smart-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = 'fast' | 'standard' | 'powerful';

export type TaskCategory = 'generation' | 'validation' | 'analysis' | 'lookup';

export interface ComplexitySignals {
  intent: Intent;
  messageLength: number;
  contextTokens: number;
  fileCount: number;
  repoCount: number;
  hasAttachments: boolean;
  taskCategory: TaskCategory;
}

export interface ComplexityAssessment {
  score: number;           // 1-5
  provider: 'local' | 'claude';
  tier: Tier;
  reasoning: string;
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// LRU Cache
// ---------------------------------------------------------------------------

const CACHE_MAX = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  assessment: ComplexityAssessment;
  expiresAt: number;
}

class LRUCache {
  private readonly map = new Map<string, CacheEntry>();

  get(key: string): ComplexityAssessment | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return { ...entry.assessment, fromCache: true };
  }

  set(key: string, assessment: ComplexityAssessment): void {
    // Evict oldest if at capacity
    if (this.map.size >= CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, {
      assessment,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}

// ---------------------------------------------------------------------------
// Complexity assessment prompt
// ---------------------------------------------------------------------------

const ASSESS_SYSTEM = `You assess coding request complexity to route to the optimal LLM.
Given signals about a request, decide the best provider. Output ONLY valid JSON.

Scoring guide:
  1-2: Simple — lookup, small edit, single-file, mechanical, boilerplate → local
  3: Medium — moderate reasoning, 2-4 files, standard patterns → claude fast (haiku)
  4: High — multi-file architecture, creative design, complex debugging → claude standard (sonnet)
  5: Very high — cross-repo, novel architecture, deep analysis, large refactoring → claude powerful (opus)

Prefer "local" when quality would be sufficient — it's faster and free.
Prefer "claude" when reasoning depth, creativity, or large context handling matters.

Response format: {"score": N, "provider": "local"|"claude", "tier": "fast"|"standard"|"powerful", "reasoning": "brief reason"}`;

// ---------------------------------------------------------------------------
// SmartRouter
// ---------------------------------------------------------------------------

export class SmartRouter {
  private readonly cache = new LRUCache();
  private readonly localProvider: LLMProvider;
  private readonly config: AgentConfig;

  constructor(localProvider: LLMProvider, config: AgentConfig) {
    this.localProvider = localProvider;
    this.config = config;
  }

  /**
   * Route a request using LLM-assessed complexity.
   *
   * Explicit @provider prefixes bypass smart routing entirely.
   * Fast-path rules handle obvious cases without an LLM call.
   * Falls back to static routing on LLM failure.
   */
  async route(
    intent: Intent,
    explicit: ExplicitProvider | undefined,
    signals: ComplexitySignals,
    message: string,
    deps: RouterDeps,
  ): Promise<RouteResult> {
    // Explicit overrides always bypass smart routing
    if (explicit) {
      return selectProvider(intent, explicit, deps);
    }

    // Attachment-forced escalation — preserve existing behavior
    if (signals.hasAttachments && hasEscalationAttachment(deps.attachments)) {
      return selectProvider(intent, undefined, deps);
    }

    // Graph-only — no LLM needed
    if (intent === 'graph') {
      return selectProvider(intent, undefined, deps);
    }

    // Assess complexity
    const assessment = await this.assess(signals, message);
    log.info(`[auto] score=${assessment.score} → ${assessment.provider}/${assessment.tier} (${assessment.fromCache ? 'cached' : 'assessed'}): ${assessment.reasoning}`);

    return this.toRouteResult(assessment, deps);
  }

  /**
   * Assess complexity — fast-path then LLM then fallback.
   */
  async assess(signals: ComplexitySignals, message: string): Promise<ComplexityAssessment> {
    // Fast-path
    const fast = this.fastPath(signals);
    if (fast) return fast;

    // Check cache
    const key = this.cacheKey(signals, message);
    const cached = this.cache.get(key);
    if (cached) return cached;

    // LLM assessment
    try {
      const assessment = await this.llmAssess(signals, message);
      this.cache.set(key, assessment);
      return assessment;
    } catch (err) {
      log.debug(`LLM assessment failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fall back to heuristic
      return this.heuristicAssess(signals);
    }
  }

  // ---------------------------------------------------------------------------
  // Fast-path (no LLM call)
  // ---------------------------------------------------------------------------

  private fastPath(signals: ComplexitySignals): ComplexityAssessment | null {
    // Tiny request, single file, single repo → local
    if (signals.messageLength < 200 && signals.contextTokens < 2000
        && signals.fileCount <= 1 && signals.repoCount <= 1) {
      return {
        score: 1, provider: 'local', tier: 'fast',
        reasoning: 'small request, minimal context', fromCache: false,
      };
    }

    // Multi-repo → claude standard
    if (signals.repoCount > 2) {
      return {
        score: 4, provider: 'claude', tier: 'standard',
        reasoning: `cross-repo task (${signals.repoCount} repos)`, fromCache: false,
      };
    }

    // Very large context → claude standard (Claude handles 200K well)
    if (signals.contextTokens > 50_000) {
      return {
        score: 4, provider: 'claude', tier: 'standard',
        reasoning: `large context (${signals.contextTokens} tokens)`, fromCache: false,
      };
    }

    // Simple lookup tasks → local
    if (signals.taskCategory === 'lookup') {
      return {
        score: 1, provider: 'local', tier: 'fast',
        reasoning: 'lookup task', fromCache: false,
      };
    }

    return null; // Need LLM assessment
  }

  // ---------------------------------------------------------------------------
  // LLM assessment
  // ---------------------------------------------------------------------------

  private async llmAssess(signals: ComplexitySignals, message: string): Promise<ComplexityAssessment> {
    const userContent = JSON.stringify({
      intent: signals.intent,
      messagePreview: message.slice(0, 200),
      contextTokens: signals.contextTokens,
      fileCount: signals.fileCount,
      repoCount: signals.repoCount,
      taskCategory: signals.taskCategory,
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: ASSESS_SYSTEM },
      { role: 'user', content: userContent },
    ];

    const response = await this.localProvider.complete(messages, {
      maxTokens: 150,
      temperature: 0,
    });

    return this.parseAssessment(response.text);
  }

  private parseAssessment(text: string): ComplexityAssessment {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in assessment response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const score = typeof parsed['score'] === 'number' ? parsed['score'] : 3;
    const provider = parsed['provider'] === 'claude' ? 'claude' as const : 'local' as const;
    const tier = normalizeTier(parsed['tier'] as string | undefined);
    const reasoning = typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '';

    return { score, provider, tier, reasoning, fromCache: false };
  }

  // ---------------------------------------------------------------------------
  // Heuristic fallback (when LLM fails)
  // ---------------------------------------------------------------------------

  private heuristicAssess(signals: ComplexitySignals): ComplexityAssessment {
    let score = 2; // Default: low complexity

    if (signals.contextTokens > 8_000) score++;
    if (signals.fileCount > 3) score++;
    if (signals.repoCount > 1) score++;
    if (signals.taskCategory === 'analysis') score++;
    if (signals.messageLength > 500) score++;

    score = Math.min(score, 5);

    const provider = score >= 3 ? 'claude' as const : 'local' as const;
    const tier: Tier = score >= 5 ? 'powerful' : score >= 4 ? 'standard' : 'fast';

    return {
      score, provider, tier,
      reasoning: 'heuristic fallback',
      fromCache: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Cache key
  // ---------------------------------------------------------------------------

  private cacheKey(signals: ComplexitySignals, message: string): string {
    const tokenBucket = Math.floor(signals.contextTokens / 2000);
    const input = `${signals.intent}:${message.slice(0, 100)}:${tokenBucket}:${signals.fileCount}:${signals.repoCount}`;
    return createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  // ---------------------------------------------------------------------------
  // Convert assessment to RouteResult
  // ---------------------------------------------------------------------------

  private toRouteResult(assessment: ComplexityAssessment, deps: RouterDeps): RouteResult {
    if (assessment.provider === 'local') {
      return {
        provider: deps.ollamaProvider,
        label: 'Local (auto)',
        graphOnly: false,
      };
    }

    // Claude requested — check availability
    if (!deps.claudeProvider) {
      log.warn('Smart router chose Claude but no API key — falling back to local.');
      return {
        provider: deps.ollamaProvider,
        label: 'Local (Claude unavailable)',
        graphOnly: false,
      };
    }

    const apiKey = deps.config.keys.anthropic;
    const model = deps.config.models.tiers[assessment.tier];
    const provider = new ClaudeProvider({ model, apiKey });

    return {
      provider,
      label: `Claude ${tierLabel(assessment.tier)} (auto)`,
      graphOnly: false,
      tier: assessment.tier,
    };
  }
}

// ---------------------------------------------------------------------------
// SmartProviderResolver — wraps ProviderResolver for pipeline steps
// ---------------------------------------------------------------------------

/**
 * Step name patterns used for heuristic routing when no config binding exists.
 * Maps step name substrings to provider preferences.
 */
const STEP_HEURISTICS: Array<{ pattern: RegExp; provider: 'local' | 'claude'; tier: Tier }> = [
  // Validation/review steps benefit from Claude's reasoning
  { pattern: /validate|review|enhance|promote|finalize/, provider: 'claude', tier: 'fast' },
  // Generation/creative steps can run locally first
  { pattern: /sketch|generate|diverge|seed|cluster|draft/, provider: 'local', tier: 'fast' },
  // Detail/analysis steps need stronger models
  { pattern: /detail|update-spec|assemble/, provider: 'claude', tier: 'standard' },
];

export class SmartProviderResolver {
  constructor(
    private readonly inner: ProviderResolver,
    private readonly config: AgentConfig,
    private readonly local: LLMProvider,
    private readonly claude: LLMProvider | null,
  ) {}

  resolve(agent: string, step: string): LLMProvider {
    // Explicit config binding always wins
    const configResult = this.inner.resolve(agent, step);
    if (this.hasExplicitBinding(agent, step)) {
      return configResult;
    }

    // Heuristic routing by step name
    return this.heuristicResolve(step) ?? configResult;
  }

  resolveOrNull(agent: string, step: string): LLMProvider | null {
    // Explicit config binding always wins
    if (this.hasExplicitBinding(agent, step)) {
      return this.inner.resolveOrNull(agent, step);
    }

    // Heuristic routing by step name
    return this.heuristicResolve(step) ?? this.inner.resolveOrNull(agent, step);
  }

  private hasExplicitBinding(agent: string, step: string): boolean {
    const agentCfg = this.config.models.agents;
    if (!agentCfg) return false;
    const agentBindings = agentCfg[agent as keyof typeof agentCfg];
    if (!agentBindings) return false;
    return agentBindings[step] !== undefined;
  }

  private heuristicResolve(step: string): LLMProvider | null {
    for (const h of STEP_HEURISTICS) {
      if (h.pattern.test(step)) {
        if (h.provider === 'local') return this.local;
        if (this.claude) {
          const apiKey = this.config.keys.anthropic;
          if (apiKey) {
            return new ClaudeProvider({
              model: this.config.models.tiers[h.tier],
              apiKey,
            });
          }
        }
        return this.local; // Claude unavailable fallback
      }
    }
    return null; // No heuristic match — defer to inner resolver
  }
}

// ---------------------------------------------------------------------------
// Signal extraction helper
// ---------------------------------------------------------------------------

/**
 * Build ComplexitySignals from available context.
 * Called by the REPL before smart routing.
 */
export function buildSignals(
  intent: Intent,
  message: string,
  contextTokens: number,
  fileCount: number,
  repoCount: number,
  hasAttachments: boolean,
): ComplexitySignals {
  return {
    intent,
    messageLength: message.length,
    contextTokens,
    fileCount,
    repoCount,
    hasAttachments,
    taskCategory: categorizeTask(intent, message),
  };
}

function categorizeTask(intent: Intent, message: string): TaskCategory {
  const lower = message.toLowerCase();

  // Generation intents always categorize as generation
  if (intent === 'implement' || intent === 'refactor' || intent === 'design'
      || intent === 'requirements' || intent === 'brainstorm' || intent === 'plan'
      || intent === 'document') {
    return 'generation';
  }

  if (intent === 'graph' || lower.includes('find') || lower.includes('search') || lower.includes('where is')) {
    return 'lookup';
  }
  if (intent === 'review' || intent === 'debug' || intent === 'research'
      || lower.includes('analyze') || lower.includes('explain') || lower.includes('why')) {
    return 'analysis';
  }
  if (intent === 'test' || lower.includes('validate') || lower.includes('check') || lower.includes('verify')) {
    return 'validation';
  }
  return 'generation';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTier(raw: string | undefined): Tier {
  if (raw === 'fast' || raw === 'standard' || raw === 'powerful') return raw;
  return 'standard';
}

function tierLabel(tier: Tier): string {
  switch (tier) {
    case 'fast':     return 'Haiku';
    case 'standard': return 'Sonnet';
    case 'powerful': return 'Opus';
  }
}
