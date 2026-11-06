import { servedModel, type ModelDefinitions } from '../models/definitions.js';
import type { TurnRequest } from './cli-adapter.js';

/** Match the backend Claude-on-Ollama environment convention in this chat-only adapter. */
export function ollamaClaudeEnv(base: NodeJS.ProcessEnv, host: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ANTHROPIC_BASE_URL: host, ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_API_KEY: '' };
  for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete env[key];
  return env;
}

export interface ChatOllamaTarget {
  readonly host: string;
  readonly hosting: 'local' | 'cloud';
  readonly model: string;
}

/** Resolve routing from trusted daemon data, including for restored chats and title calls.
 * The popup may merge model families; that must not erase their execution target. */
export function createChatOllamaResolver(deps: {
  readonly definitions: () => Promise<ModelDefinitions>;
  readonly rawConfig: () => Promise<Record<string, unknown>>;
}): (request: TurnRequest) => Promise<ChatOllamaTarget | undefined> {
  return async (request) => {
    if (request.provider !== 'claude' || request.model === undefined || request.model === '') return undefined;
    const definitions = await deps.definitions();
    const matches = definitions.families.flatMap((family) => {
      if (family.cliKind !== request.provider) return [];
      const model = servedModel(family, request.model!);
      return model === undefined || family.rejectedModels?.includes(model.id) ? [] : [{ family, model }];
    });
    if (matches.length !== 1) throw new Error(`Cannot route Claude model '${request.model}': ${matches.length === 0 ? 'not served' : 'ambiguous model family'}. Refresh the model list and select a model.`);
    const { family, model } = matches[0]!;
    if (family.host === undefined) return undefined;
    if (family.host !== 'ollama' || (model.hosting !== 'local' && model.hosting !== 'cloud')) {
      throw new Error(`Cannot route Claude model '${request.model}': unsupported or missing hosting metadata.`);
    }
    const config = await deps.rawConfig();
    const models = asRecord(config['models']);
    const local = asRecord(models?.['local']);
    const configured = local?.['host'];
    const host = configured === undefined ? 'http://localhost:11434' : configured;
    if (typeof host !== 'string' || host.trim() === '') throw new Error('Cannot route Claude to Ollama: models.local.host must be an HTTP(S) URL.');
    let url: URL;
    try { url = new URL(host); } catch { throw new Error('Cannot route Claude to Ollama: models.local.host must be an HTTP(S) URL.'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Cannot route Claude to Ollama: models.local.host must be an HTTP(S) URL.');
    return { host: host.trim(), hosting: model.hosting, model: model.id };
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
