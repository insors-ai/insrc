/**
 * Web tools -- search / fetch.
 *
 * web:search uses the Brave Search API when BRAVE_API_KEY is set.
 * Without a key the tool reports unavailability; the research
 * agent has a separate Claude-backed path with approval gating
 * for open-ended web access.
 *
 * web:fetch is a thin wrapper around undici fetch with a size cap
 * so huge pages don't blow out the LLM's context budget.
 */

import { fetch as undiciFetch } from 'undici';
import { registerTool } from '../../registry.js';
import { getToolSettings } from '../../config.js';
import { getKey } from '../../../../shared/keystore.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// web:search
// ---------------------------------------------------------------------------

interface BraveResult { title: string; url: string; description: string }

interface WebSearchData {
  query: string;
  limit: number;
  provider: 'brave' | 'unavailable';
  results: readonly BraveResult[];
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export const webSearchTool: Tool = {
  id: 'web_search',
  description: 'Search the web. Uses Brave Search API when BRAVE_API_KEY is set.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 20 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const query = str(input, 'query');
    if (!query) { return fail('web_search', 'query required'); }
    const limit = num(input, 'limit') ?? 5;
    const keySource = getToolSettings().web.braveApiKeySource;
    let key: string | undefined;
    if (keySource === 'keychain') {
      const stored = await getKey('brave');
      if (stored) { key = stored; }
    }
    if (!key) {
      key = process.env['BRAVE_API_KEY'];
    }
    if (!key) {
      const data: WebSearchData = { query, limit, provider: 'unavailable', results: [] };
      const hint = keySource === 'keychain'
        ? 'Set the key via the `insrc: Set Brave API Key` command (stores to OS keychain under account `brave`).'
        : 'Set BRAVE_API_KEY in the daemon process environment.';
      return {
        output: `web:search unavailable: no Brave API key found (source=${keySource}). ${hint}`,
        format: 'markdown', success: false, error: 'BRAVE_API_KEY missing',
        data,
      };
    }
    try {
      const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${limit}`;
      const resp = await undiciFetch(url, {
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      });
      if (!resp.ok) { return fail('web_search', `Brave API ${resp.status} ${resp.statusText}`); }
      const body = await resp.json() as { web?: { results?: BraveResult[] } };
      const results = body.web?.results ?? [];
      const data: WebSearchData = { query, limit, provider: 'brave', results };
      const rendered = results.length === 0
        ? '_no results_'
        : results.map((r, i) => `${i + 1}. **${r.title}**\n   <${r.url}>\n   ${r.description}`).join('\n\n');
      return {
        output: `**${results.length}** result(s) for \`${query}\`.\n\n${rendered}`,
        format: 'markdown', success: true, data,
      };
    } catch (err: unknown) {
      return fail('web_search', `fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// web:fetch
// ---------------------------------------------------------------------------

interface WebFetchData {
  url: string;
  status: number;
  statusText: string;
  contentType: string | undefined;
  bytes: number;
  truncated: boolean;
  body: string;
}

const WEB_FETCH_MAX_BYTES = 512 * 1024;
const WEB_FETCH_TIMEOUT = 30_000;

export const webFetchTool: Tool = {
  id: 'web_fetch',
  description: 'Fetch a URL body (read-only GET). Response truncated above 512 KB.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      maxBytes: { type: 'number' },
      timeoutMs: { type: 'number', minimum: 1000, maximum: 120_000 },
    },
    required: ['url'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const url = str(input, 'url');
    if (!url) { return fail('web_fetch', 'url required'); }
    const maxBytes = num(input, 'maxBytes') ?? WEB_FETCH_MAX_BYTES;
    const timeoutMs = num(input, 'timeoutMs') ?? WEB_FETCH_TIMEOUT;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await undiciFetch(url, {
        headers: { 'User-Agent': 'insrc-agent/1.0' },
        signal: ac.signal,
      });
      const contentType = resp.headers.get('content-type') ?? undefined;
      const reader = resp.body?.getReader();
      const chunks: Buffer[] = [];
      let received = 0;
      let truncated = false;
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          const buf = Buffer.from(value);
          if (received + buf.length > maxBytes) {
            chunks.push(buf.subarray(0, maxBytes - received));
            received = maxBytes;
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(buf);
          received += buf.length;
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const data: WebFetchData = {
        url,
        status: resp.status,
        statusText: resp.statusText,
        contentType,
        bytes: received,
        truncated,
        body,
      };
      const ok = resp.ok;
      return {
        output: [
          `**GET** \`${url}\` -> **${resp.status} ${resp.statusText}** (${received} B${truncated ? ', capped' : ''}).`,
          contentType ? `Content-Type: \`${contentType}\`` : '',
          '',
          '```',
          body.length > 20_000 ? body.slice(0, 20_000) + '\n... (truncated in render)' : body,
          '```',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `HTTP ${resp.status}` }),
        data,
      };
    } catch (err: unknown) {
      return fail('web_fetch', `fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWebTools(): void {
  registerTool(webSearchTool);
  registerTool(webFetchTool);
}
