// ---------------------------------------------------------------------------
// Search Provider — abstraction over web search backends
//
// From design doc (Phase 9):
//   - SearchProvider interface with search(query, limit)
//   - BraveSearchProvider: Brave Search API, structured JSON, free tier
//   - ClaudeWebSearchProvider: fallback using Claude's web_search tool
//   - Auto-select based on BRAVE_API_KEY presence
// ---------------------------------------------------------------------------

import type { LLMProvider, LLMMessage } from '../../shared/types.js';

export interface SearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

export interface SearchProvider {
  /** Run a web search and return results. */
  search(query: string, limit?: number): Promise<SearchResult[]>;
  /** Provider name for logging. */
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Brave Search Provider
// ---------------------------------------------------------------------------

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as BraveResponse;
    const results: SearchResult[] = [];

    for (const item of data.web?.results ?? []) {
      results.push({
        title: item.title ?? '',
        url: item.url ?? '',
        snippet: item.description ?? '',
      });
      if (results.length >= limit) break;
    }

    return results;
  }
}

/** Brave Search API response shape (subset). */
interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Claude Web Search Provider (fallback)
// ---------------------------------------------------------------------------

export class ClaudeWebSearchProvider implements SearchProvider {
  readonly name = 'claude';
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    // Use Claude to perform web search and extract results
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a web search assistant. Search for the given query and return results as a JSON array.
Each result should have: title, url, snippet.
Return ONLY valid JSON — no markdown, no explanation.
Return at most ${limit} results.`,
      },
      { role: 'user', content: `Search for: ${query}` },
    ];

    const response = await this.provider.complete(messages, {
      maxTokens: 2000,
      temperature: 0,
    });

    try {
      // Extract JSON from response (may be wrapped in code block)
      const jsonText = response.text
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(jsonText) as Array<{ title?: string; url?: string; snippet?: string }>;

      if (!Array.isArray(parsed)) return [];

      return parsed.slice(0, limit).map(item => ({
        title: item.title ?? '',
        url: item.url ?? '',
        snippet: item.snippet ?? '',
      }));
    } catch {
      // Claude didn't return valid JSON — return empty
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SearchProvider based on available configuration.
 *
 * - If braveApiKey is provided, uses BraveSearchProvider
 * - Otherwise, if claudeProvider is available, uses ClaudeWebSearchProvider
 * - Returns null if neither is available
 */
export function createSearchProvider(
  braveApiKey: string | undefined,
  claudeProvider: LLMProvider | null,
): SearchProvider | null {
  if (braveApiKey) {
    return new BraveSearchProvider(braveApiKey);
  }
  if (claudeProvider) {
    return new ClaudeWebSearchProvider(claudeProvider);
  }
  return null;
}

/**
 * Format search results for LLM consumption.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No search results found.';

  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
  ).join('\n\n');
}
