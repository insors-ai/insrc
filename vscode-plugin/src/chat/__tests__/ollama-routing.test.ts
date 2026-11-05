import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatOllamaResolver, ollamaClaudeEnv } from '../ollama-routing.js';
import { createProviderRegistry, deriveChatTitle, type TurnRequest } from '../cli-adapter.js';
import { createTurnLifecycle, type TurnSink } from '../turn-lifecycle.js';
import { createMemorySessionLocks } from '../session-lock.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ModelDefinitions } from '../../models/definitions.js';
import { makeFakeSpawner, CLAUDE_TEXT_TURN } from './fixtures.js';

const definitions: ModelDefinitions = {
  version: 1, defaultFamily: 'cli-claude', families: [
    { id: 'cli-claude', cliKind: 'claude', displayName: 'Claude', models: [
      { id: 'claude-vendor', aliases: ['sonnet'], efforts: [], source: 'shipped' },
    ] },
    { id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [
      { id: 'deepseek-v4-pro:cloud', aliases: ['cloud-coder'], hosting: 'cloud', efforts: [], source: 'shipped' },
      { id: 'local-coder', aliases: [], hosting: 'local', efforts: [], source: 'shipped' },
    ] },
  ],
};
const request = (model = 'deepseek-v4-pro:cloud'): TurnRequest => ({ provider: 'claude', model, prompt: 'fixture', cwd: '/repo' });
const resolve = (config: Record<string, unknown> = {}) => createChatOllamaResolver({ definitions: async () => definitions, rawConfig: async () => config });

test('ollama-routing.test.ts: local/cloud targets and aliases use the daemon-configured host and canonical model', async () => {
  const resolver = resolve({ models: { local: { host: 'http://ollama.example:11434' } } });
  assert.deepEqual(await resolver(request('cloud-coder')), { host: 'http://ollama.example:11434', hosting: 'cloud', model: 'deepseek-v4-pro:cloud' });
  assert.deepEqual(await resolver(request('local-coder')), { host: 'http://ollama.example:11434', hosting: 'local', model: 'local-coder' });
  assert.equal((await resolve()(request()))?.host, 'http://localhost:11434');
});

test('ollama-routing.test.ts: vendor/default and non-Claude calls do not read Ollama configuration', async () => {
  const resolver = createChatOllamaResolver({ definitions: async () => definitions, rawConfig: async () => { throw Error('must not read'); } });
  assert.equal(await resolver(request('sonnet')), undefined);
  assert.equal(await resolver({ provider: 'claude', prompt: 'default', cwd: '/repo' }), undefined);
  assert.equal(await resolver({ ...request(), provider: 'codex' }), undefined);
  assert.equal(await resolver({ ...request(), provider: 'vibe' }), undefined);
});

test('ollama-routing.test.ts: unknown/rejected/ambiguous targets and invalid hosts fail closed', async () => {
  await assert.rejects(resolve()(request('missing:cloud')), /not served/);
  for (const host of ['', 42, 'file:///tmp/fixture']) await assert.rejects(resolve({ models: { local: { host } } })(request()), /HTTP\(S\) URL/);
  const rejected: ModelDefinitions = { ...definitions, families: definitions.families.map(f => f.host ? { ...f, rejectedModels: ['deepseek-v4-pro:cloud'] } : f) };
  const resolver = (defs: ModelDefinitions) => createChatOllamaResolver({ definitions: async () => defs, rawConfig: async () => ({}) });
  await assert.rejects(resolver(rejected)(request()), /not served/);
  const duplicate: ModelDefinitions = { ...definitions, families: [...definitions.families, { ...definitions.families[1]!, id: 'duplicate' }] };
  await assert.rejects(resolver(duplicate)(request()), /ambiguous/);
  const missingHosting: ModelDefinitions = { ...definitions, families: [{ ...definitions.families[1]!, models: [{ id: 'bad', aliases: [], efforts: [], source: 'shipped' }] }] };
  await assert.rejects(resolver(missingHosting)(request('bad')), /hosting metadata/);
});

test('ollama-routing.test.ts: shared Claude environment removes vendor routing without mutating its input', () => {
  const base = { PATH: '/fixture', ANTHROPIC_BASE_URL: 'https://vendor.example', ANTHROPIC_API_KEY: 'fixture-key', CLAUDE_CODE_OAUTH_TOKEN: 'fixture-login', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1' };
  const before = { ...base };
  const env = ollamaClaudeEnv(base, 'http://ollama.example');
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://ollama.example');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'ollama');
  assert.equal(env.ANTHROPIC_API_KEY, '');
  for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) assert.equal(env[key], undefined);
  assert.equal(env.PATH, '/fixture');
  assert.deepEqual(base, before);
});

test('ollama-routing.test.ts: initial/resumed/follow-up/title launches are Ollama-routed; vendor launches still inherit', async () => {
  const spawner = makeFakeSpawner({ lines: CLAUDE_TEXT_TURN });
  const providers = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, resolveOllamaTarget: resolve({ models: { local: { host: 'http://configured-ollama:11434' } } }) });
  const before = { ...process.env };
  for (const req of [request('cloud-coder'), { ...request(), resume: { provider: 'claude' as const, nativeSessionId: 'native-fixture' } }, { ...request(), prompt: 'Approved — fixture action' }, request('local-coder')]) {
    for await (const _ of providers.get('claude').run(req)) { /* consume */ }
  }
  await deriveChatTitle(providers, { provider: 'claude', prompt: 'title fixture', cwd: '/repo', model: 'deepseek-v4-pro:cloud' });
  assert.equal(spawner.calls.length, 5);
  for (const call of spawner.calls) {
    assert.equal(call.env?.ANTHROPIC_BASE_URL, 'http://configured-ollama:11434');
    assert.equal(call.env?.ANTHROPIC_AUTH_TOKEN, 'ollama');
    assert.equal(call.env?.ANTHROPIC_API_KEY, '');
    assert.equal(call.env?.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.equal(call.env?.CLAUDE_CODE_USE_BEDROCK, undefined);
    assert.equal(call.env?.CLAUDE_CODE_USE_VERTEX, undefined);
  }
  assert.equal(spawner.calls[0]!.args[spawner.calls[0]!.args.indexOf('--model') + 1], 'deepseek-v4-pro:cloud');
  assert.ok(spawner.calls[1]!.args.includes('native-fixture'));
  for await (const _ of providers.get('claude').run(request('sonnet'))) { /* consume */ }
  assert.equal(spawner.calls[5]!.env, undefined);
  assert.deepEqual({ ...process.env }, before);
});

test('ollama-routing.test.ts: failed definitions/configuration lookup produces an error and no child', async () => {
  for (const failure of ['definitions', 'configuration']) {
    const spawner = makeFakeSpawner({ lines: CLAUDE_TEXT_TURN });
    const resolver = createChatOllamaResolver({
      definitions: async () => { if (failure === 'definitions') throw Error('definitions unavailable'); return definitions; },
      rawConfig: async () => { throw Error('configuration unavailable'); },
    });
    const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, resolveOllamaTarget: resolver }).get('claude');
    const events = [];
    for await (const event of adapter.run(request())) events.push(event);
    assert.equal(spawner.calls.length, 0);
    assert.equal(events[0]?.kind, 'error');
  }
});

test('ollama-routing.test.ts: cancelled continuation and expired title cannot spawn after routing resolves', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const spawner = makeFakeSpawner({ lines: CLAUDE_TEXT_TURN });
  const providers = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, resolveOllamaTarget: async req => { await gate; return resolve()(req); } });
  let valid = true;
  const iterator = providers.get('claude').run(request(), { shouldSpawn: () => valid })[Symbol.asyncIterator]();
  const pending = iterator.next();
  valid = false;
  assert.equal(await deriveChatTitle(providers, { provider: 'claude', prompt: 'fixture', cwd: '/repo', model: 'deepseek-v4-pro:cloud' }, { timeoutMs: 10 }), undefined);
  release();
  await pending;
  await new Promise(r => setTimeout(r, 20));
  assert.equal(spawner.calls.length, 0);
});

test('ollama-routing.test.ts: Stop during routing IPC prevents a normal lifecycle turn from spawning', async () => {
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(r => { entered = r; });
  const gate = new Promise<void>(r => { release = r; });
  const spawner = makeFakeSpawner({ lines: CLAUDE_TEXT_TURN });
  const providers = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, resolveOllamaTarget: async req => { entered(); await gate; return resolve()(req); } });
  const store = createInMemoryChatSessionStore();
  const session = store.create('claude');
  const lifecycle = createTurnLifecycle({ providers, store, locks: createMemorySessionLocks({ graceMs: 10 }), lockTimeoutMs: () => 1000, hostPid: 7, processStartTime: () => 1, isAlive: () => false, isOpen: () => true, logger: { warn() {}, error() {} } });
  const sink: TurnSink = { onWaiting() {}, beforeRun: async () => {}, onEvent() {}, onError() {}, onTerminal() {} };
  const pending = lifecycle.start(session, request(), sink);
  await waiting;
  await lifecycle.stop();
  release();
  await pending;
  assert.equal(spawner.calls.length, 0);
});
