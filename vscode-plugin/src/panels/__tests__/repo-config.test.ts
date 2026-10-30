/**
 * Story E20260923401ae5fb:S007 / t2 — the Repo Configuration core (sc9).
 * renderRepoConfig + createRepoConfigWriteHandler over injected fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderRepoConfig, createRepoConfigWriteHandler, type RepoConfigWriteDeps } from '../repo-config.js';
import { escapeHtml } from '../html.js';
import type { RepoRef } from '../types.js';
import type { ConfigWriteResult } from '../../config/types.js';
import type { ConsentGate, ConsentOutcome } from '../../surfaces/consent-gate.js';
import type { StatusSurface } from '../../surfaces/status-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const REPOS: RepoRef[] = [
  { path: '/Users/x/work/a.b/repo-one', name: 'repo-one' },
  { path: '/Users/x/work/repo-two', name: 'repo-two' },
];

// ---- renderRepoConfig -----------------------------------------------------

test('renderRepoConfig: repo <select> from registeredRepos() (folder-independent) + explicit empty-state when none', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => [] })(undefined);
  assert.match(html, /<select id="insrc-repo-select">/, 'a repo picker is rendered');
  assert.match(html, /repo-one/, 'each registered repo is an option');
  assert.match(html, /repo-two/);
  assert.match(html, /Choose a repo/, 'no selection -> picker-only prompt, no form');
  assert.doesNotMatch(html, /insrc-repo-form/, 'no form until a repo is selected');

  const empty = await renderRepoConfig({ registeredRepos: async () => [], rawConfig: async () => ({}), mcpRegistration: async () => [] })(undefined);
  assert.match(empty, /No repos are registered/, 'empty repo list -> explicit empty-state');
  assert.doesNotMatch(empty, /<select/, 'no picker when there are no repos');
});

test('renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] tasks and coreFloor (NOT raw JSON); missing entry -> all-global', async () => {
  const raw = { models: { byRepo: { '/Users/x/work/a.b/repo-one': { tasks: { 'context.assemble': 'cheap' }, coreFloor: 'mid' } } } };
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => raw, mcpRegistration: async () => [] })('/Users/x/work/a.b/repo-one');
  const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seg = (segments: string[]) => reEsc(escapeHtml(JSON.stringify(segments)));
  assert.match(html, /id="insrc-repo-form" data-repo="\/Users\/x\/work\/a\.b\/repo-one"/, 'the form carries the selected repoPath');
  // A dotted role id stays one segment; the stored tier is selected.
  assert.match(html, new RegExp(`data-segments="${seg(['tasks', 'context.assemble'])}"><option value="">global</option><option value="core">core</option><option value="mid">mid</option><option value="cheap" selected>cheap</option>`));
  assert.match(html, new RegExp(`data-segments="${seg(['coreFloor'])}">[^]*?<option value="mid" selected>mid</option>`));
  assert.doesNotMatch(html, /<textarea/, 'discrete fields, NOT a raw-JSON textarea (ac3)');

  // A repo with NO byRepo entry -> every field 'global'.
  const missing = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => [] })('/Users/x/work/repo-two');
  assert.match(missing, new RegExp(`data-segments="${seg(['tasks', 'review'])}"><option value="" selected>global</option>`), 'a missing byRepo entry -> all-global form');
});

test('renderRepoConfig renders 14 critical roles in an open <details> group and 20 peripheral roles in a closed <details> group, not one flat 34-row table', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => [] })(REPOS[0]!.path);
  assert.doesNotMatch(html, /<table/, 'no flat table — roles render as grouped rows, not <tr>s');
  const critical = /<details class="section" open><summary class="section-head">Critical roles <span class="count">(\d+)<\/span><\/summary>([^]*?)<\/details>/.exec(html);
  const peripheral = /<details class="section"><summary class="section-head">Peripheral roles <span class="count">(\d+)<\/span><\/summary>([^]*?)<\/details>/.exec(html);
  assert.ok(critical, 'the critical group is open (no explicit open attr elsewhere -> this regex)');
  assert.ok(peripheral, 'the peripheral group is present and closed (no "open" attribute)');
  assert.equal(critical![1], '14', '14 critical roles');
  assert.equal(peripheral![1], '20', '20 peripheral roles');
  assert.equal((critical![2]!.match(/class="role-row"/g) ?? []).length, 14, 'the critical group renders exactly its 14 role rows');
  assert.equal((peripheral![2]!.match(/class="role-row"/g) ?? []).length, 20, 'the peripheral group renders exactly its 20 role rows');
});

test('the core floor renders in its own <details>/section, separate from the role groups', async () => {
  const raw = { models: { byRepo: { [REPOS[0]!.path]: { coreFloor: 'mid' } } } };
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => raw, mcpRegistration: async () => [] })(REPOS[0]!.path);
  const floorSection = /<div class="section"><div class="section-head">Core floor<\/div><div class="floor-row">([^]*?)<\/div><\/div>/.exec(html);
  assert.ok(floorSection, 'the core floor has its own section, distinct from the role-group <details>');
  assert.match(floorSection![1]!, /data-segments="[^"]*coreFloor[^"]*"/, 'the floor row still carries the coreFloor write segments');
  assert.match(floorSection![1]!, /<option value="mid" selected>mid<\/option>/, 'the stored core-floor tier is selected');
  assert.doesNotMatch(html, /<details[^>]*>(?:(?!<\/details>).)*Core floor/s, "the core floor is its own section, not nested inside a role-group <details>");
});

test('renderRepoConfig: an unregistered selected repo falls back to picker-only', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => [] })('/not/registered');
  assert.doesNotMatch(html, /insrc-repo-form/, 'a stale selection that is no longer registered renders no form');
  assert.match(html, /Choose a repo/);
});

test('renderRepoConfig: every repo path/name + field value HTML-escaped; a registeredRepos()/rawConfig() rejection propagates', async () => {
  const evilRepos: RepoRef[] = [{ path: '/r/<x>', name: '<b>&' }];
  const raw = { models: { byRepo: { '/r/<x>': { tasks: { review: '<script>x</script>' } } } } };
  const html = await renderRepoConfig({ registeredRepos: async () => evilRepos, rawConfig: async () => raw, mcpRegistration: async () => [] })('/r/<x>');
  assert.doesNotMatch(html, /<script>x<\/script>/, 'a stored value is never echoed raw (only fixed tier options render)');
  assert.match(html, /data-repo="\/r\/&lt;x&gt;"/, 'the repo path is escaped');
  assert.match(html, /&lt;b&gt;&amp;/, 'the repo name is escaped');

  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => { throw new Error('repo.list down'); }, rawConfig: async () => ({}), mcpRegistration: async () => [] })(undefined),
    /repo.list down/,
    'a registeredRepos() rejection propagates',
  );
  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => { throw new Error('config.show down'); }, mcpRegistration: async () => [] })(REPOS[0]!.path),
    /config.show down/,
    'a rawConfig() rejection propagates',
  );
});

// ---- createRepoConfigWriteHandler -----------------------------------------

function fakeConsent(outcome: ConsentOutcome): { gate: ConsentGate; asked: () => number } {
  let n = 0;
  return { gate: { ask: async () => { n += 1; return outcome; } }, asked: () => n };
}

function fakeStatus(): StatusSurface {
  let snap: { state: 'running' | 'stopped' | 'errored' | 'unknown'; detail?: string } = { state: 'running' };
  return { set: (s) => { snap = s; }, current: () => snap };
}

function makeWriteDeps(over: Partial<RepoConfigWriteDeps> & { outcome?: ConsentOutcome; writeResult?: ConfigWriteResult } = {}): {
  deps: RepoConfigWriteDeps;
  calls: { segments: readonly string[]; value: unknown }[];
  consentAsked: () => number;
  refreshes: () => number;
  status: StatusSurface;
} {
  const calls: { segments: readonly string[]; value: unknown }[] = [];
  const consent = fakeConsent(over.outcome ?? 'accepted');
  const status = over.status ?? fakeStatus();
  let refreshes = 0;
  const deps: RepoConfigWriteDeps = {
    consent: consent.gate,
    writeKeyPath: async (segments, value) => {
      calls.push({ segments: [...segments], value });
      return over.writeResult ?? { ok: true };
    },
    registeredRepos: async () => REPOS,
    status,
    logger: { warn: () => {} },
    refresh: () => { refreshes += 1; },
    offerRestart: () => {},
    ...(over.writeKeyPath ? { writeKeyPath: over.writeKeyPath } : {}),
    ...(over.registeredRepos ? { registeredRepos: over.registeredRepos } : {}),
    ...(over.logger ? { logger: over.logger } : {}),
    ...(over.offerRestart ? { offerRestart: over.offerRestart } : {}),
  };
  return { deps, calls, consentAsked: consent.asked, refreshes: () => refreshes, status };
}

test("createRepoConfigWriteHandler: on 'accepted' writeKeyPath called with EXACTLY ['models','byRepo',repoPath,...segments] + value (ac2 array form)", async () => {
  const f = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(f.deps)({ repoPath: REPOS[0]!.path, segments: ['tasks', 'context.assemble'], value: 'cheap' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.consentAsked(), 1, 'consent was requested');
  assert.deepEqual(f.calls, [{ segments: ['models', 'byRepo', REPOS[0]!.path, 'tasks', 'context.assemble'], value: 'cheap' }]);
  assert.match(f.status.current().detail ?? '', /updated tasks\.context\.assemble/, 'the outcome surfaced via sc2');
  assert.equal(f.refreshes(), 1, 'the panel re-rendered from fresh config');
});

test("createRepoConfigWriteHandler: declined/dismissed consent writes NEVER (k4); unregistered/malformed write dropped without consent", async () => {
  // declined -> no write.
  const declined = makeWriteDeps({ outcome: 'declined' });
  createRepoConfigWriteHandler(declined.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(declined.consentAsked(), 1);
  assert.deepEqual(declined.calls, [], 'a declined consent writes NOTHING (k4)');

  // dismissed -> no write.
  const dismissed = makeWriteDeps({ outcome: 'dismissed' });
  createRepoConfigWriteHandler(dismissed.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(dismissed.calls, [], 'a dismissed consent writes NOTHING (k4)');

  // unregistered repo -> no consent, no write.
  const unreg = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(unreg.deps)({ repoPath: '/not/registered', segments: ['coreFloor'], value: 'mid' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(unreg.consentAsked(), 0, 'an unregistered repo is not even prompted');
  assert.deepEqual(unreg.calls, [], 'an unregistered repo writes NOTHING (lc1)');

  // malformed write -> no consent, no write.
  const bad = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(bad.deps)({ repoPath: '', segments: [], value: 'x' } as never);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(bad.consentAsked(), 0, 'a malformed write is dropped before consent');
  assert.deepEqual(bad.calls, []);
});

test("createRepoConfigWriteHandler: {ok:false} refusal surfaces the reason via sc2 + refresh; a writeKeyPath rejection is caught, never throws", async () => {
  // refusal -> surfaces reason + refresh, no throw.
  const refused = makeWriteDeps({ outcome: 'accepted', writeResult: { ok: false, reason: 'invalid path' } });
  await assert.doesNotReject(async () => {
    createRepoConfigWriteHandler(refused.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.match(refused.status.current().detail ?? '', /refused: invalid path/, 'the daemon reason surfaced via sc2');
  assert.equal(refused.refreshes(), 1, 'the panel re-read (truthful) even on refusal');

  // writeKeyPath rejection -> caught + logged, never throws.
  const warns: string[] = [];
  const rejecting = makeWriteDeps({
    outcome: 'accepted',
    writeKeyPath: async () => { throw new Error('socket down'); },
    logger: { warn: (m) => warns.push(m) },
  });
  await assert.doesNotReject(async () => {
    createRepoConfigWriteHandler(rejecting.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(warns.some((w) => /per-repo config write failed/.test(w)), 'the write rejection was caught + logged');
});

// ---- source guards --------------------------------------------------------

test('source-scan: repo-config.ts imports no vscode, no cloud; and reaches the daemon only via the sc8 writeKeyPath/rawConfig (k3)', () => {
  const src = readFileSync(join(HERE, '..', 'repo-config.ts'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  assert.ok(!imports.some((s) => s === 'vscode'), 'repo-config must not import vscode');
  assert.ok(!imports.some((s) => /undici|^https?:/.test(s)), 'repo-config imports no cloud/HTTP client');
  // No IPC method literals — the write path goes through the injected sc8 writeKeyPath (config.write).
  assert.doesNotMatch(src, /['"]config\.(catalog|show|write)['"]/, 'no direct config IPC literal (goes through the sc8 gateway)');
});

test('source-scan: the sc9 types amendment is ADDITIVE — S007 members added, no S004/S005/S006 member removed', () => {
  const src = readFileSync(join(HERE, '..', 'types.ts'), 'utf8');
  assert.match(src, /export type RepoConfigRenderer\b/);
  assert.match(src, /export interface RepoConfigRendererDeps\b/);
  assert.match(src, /export interface RepoConfigWrite\b/);
  assert.match(src, /repoRenderer\?:\s*RepoConfigRenderer/);
  assert.match(src, /onRepoConfigWrite\?:\s*\(\(write: RepoConfigWrite\) => void\)/);
  for (const kept of ['detailRenderers', 'tabControllers', 'onDetailAction', 'DaemonDataGateway', 'PanelHandle', 'TabRenderer']) {
    assert.ok(src.includes(kept), `${kept} is preserved (additive amendment)`);
  }
});

test('repo-config.test.ts: the form has role tier selects and a coreFloor select only; the handler writes tasks / coreFloor after consent, drops tiers writes, shows reason and detail and offers a restart', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => [] })(REPOS[0]!.path);
  const segs = [...html.matchAll(/data-segments="([^"]+)"/g)].map((m) => JSON.parse(m[1]!.replace(/&quot;/g, '"')) as string[]);
  assert.ok(segs.length > 1);
  assert.ok(segs.every((x) => (x[0] === 'tasks' && x.length === 2) || (x.length === 1 && x[0] === 'coreFloor')), 'only tasks and coreFloor fields');
  assert.deepEqual(segs.filter((x) => x[0] === 'coreFloor'), [['coreFloor']]);
  assert.doesNotMatch(html, /<input|data-segments="[^"]*(runner|model|effort|tiers)/, 'no runner, model, effort or tier field');

  // tasks and coreFloor writes reach writeKeyPath after consent; a tiers write is dropped before consent.
  const ok = makeWriteDeps({ outcome: 'accepted' });
  const handle = createRepoConfigWriteHandler(ok.deps);
  handle({ repoPath: REPOS[0]!.path, segments: ['tasks', 'context.assemble'], value: null });
  handle({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'core' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ok.calls, [
    { segments: ['models', 'byRepo', REPOS[0]!.path, 'tasks', 'context.assemble'], value: null },
    { segments: ['models', 'byRepo', REPOS[0]!.path, 'coreFloor'], value: 'core' },
  ]);
  const warns: string[] = [];
  const tiers = makeWriteDeps({ outcome: 'accepted', logger: { warn: (m) => warns.push(m) } });
  for (const segments of [['tiers', 'core', 'runner'], ['tasks'], ['tasks', 'a', 'b'], ['coreFloor', 'x']]) {
    createRepoConfigWriteHandler(tiers.deps)({ repoPath: REPOS[0]!.path, segments, value: 'x' });
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(tiers.consentAsked(), 0, 'no prompt for a write a repo may not make');
  assert.deepEqual(tiers.calls, []);
  assert.equal(warns.length, 4);

  // A refusal shows the daemon's reason and detail; restartRequired offers a restart.
  const refused = makeWriteDeps({ outcome: 'accepted', writeResult: { ok: false, reason: 'per-repo-tier', detail: 'tiers are global' } });
  createRepoConfigWriteHandler(refused.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(refused.status.current().detail ?? '', /per-repo write refused: per-repo-tier — tiers are global/);
  const offers: string[] = [];
  const restart = makeWriteDeps({ outcome: 'accepted', writeResult: { ok: true, restartRequired: true }, offerRestart: (m) => offers.push(m) });
  createRepoConfigWriteHandler(restart.deps)({ repoPath: REPOS[0]!.path, segments: ['coreFloor'], value: 'mid' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(offers.length, 1);
  assert.match(offers[0]!, /updated coreFloor for .* — restart the daemon to apply/);
});

// ---- Providers section (post-setup mcp.register) -----------------------------

import { createRepoRegisterProvidersHandler, steeringForClients, type RepoRegisterProvidersDeps } from '../repo-config.js';
import type { McpRegistrationView, RepoProviderRegistration } from '../types.js';

const REGS: McpRegistrationView[] = [
  { client: 'claude', available: true, registered: true },
  { client: 'codex', available: true, registered: false },
  { client: 'vibe', available: false, registered: false },
];

test('renderRepoConfig: Providers section — registered = checked+disabled, unregistered+available = checkable, unavailable = disabled; button only when something is checkable', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => REGS })(REPOS[0]!.path);
  assert.match(html, /<h3>Providers<\/h3>/, 'the section renders in the repo form');
  assert.match(html, /<input type="checkbox" checked disabled> Claude Code — registered/, 'registered provider is checked and NOT checkable');
  assert.doesNotMatch(html, /data-provider="claude"/, 'a registered provider carries no data-provider checkbox');
  assert.match(html, /<input type="checkbox" data-provider="codex"> Codex/, 'an unregistered available provider is checkable');
  assert.match(html, /<input type="checkbox" disabled> Mistral Vibe — CLI not found on PATH/, 'an unavailable provider is disabled with the reason');
  assert.match(html, /id="insrc-register-providers"/, 'the register button renders when a provider is checkable');

  const none = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => REGS.map(r => ({ ...r, registered: true, available: true })) })(REPOS[0]!.path);
  assert.doesNotMatch(none, /insrc-register-providers/, 'nothing checkable -> no button');
  assert.doesNotMatch(none, /data-provider=/, 'all registered -> no checkboxes at all');

  const down = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => { throw new Error('mcp.status down'); } })(REPOS[0]!.path);
  assert.match(down, /registration state is unavailable/, 'a failed mcp.status read degrades to a hint, not an error');

  const oldDaemon = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), mcpRegistration: async () => { throw new Error('mcp.status failed: unknown method: mcp.status'); } })(REPOS[0]!.path);
  assert.match(oldDaemon, /predates provider registration/, 'an old daemon (unknown method) gets an update hint, not the bare unavailable text');
  assert.match(oldDaemon, /insrc: Update daemon/, 'the hint names the update command');
});

test('steeringForClients maps provider clients to the daemon selection (claude→claude, codex→agents, vibe→vibe)', () => {
  assert.deepEqual(steeringForClients(['codex', 'vibe']), { claude: false, agents: true, vibe: true });
  assert.deepEqual(steeringForClients(['claude']), { claude: true, agents: false, vibe: false });
  assert.deepEqual(steeringForClients([]), { claude: false, agents: false, vibe: false });
});

function makeRegDeps(over: Partial<RepoRegisterProvidersDeps> & { outcome?: ConsentOutcome } = {}): {
  deps: RepoRegisterProvidersDeps;
  calls: { repoPath: string; steering: unknown }[];
  consentAsked: () => number;
  refreshes: () => number;
  status: StatusSurface;
} {
  const calls: { repoPath: string; steering: unknown }[] = [];
  const consent = fakeConsent(over.outcome ?? 'accepted');
  const status = over.status ?? fakeStatus();
  let refreshes = 0;
  const deps: RepoRegisterProvidersDeps = {
    consent: consent.gate,
    status,
    logger: { warn: () => {} },
    registeredRepos: async () => REPOS,
    registerProviders: async (repoPath, steering) => {
      calls.push({ repoPath, steering });
      return { ok: true, mcp: { clients: [{ client: 'codex', action: 'registered' }] } };
    },
    refresh: () => { refreshes += 1; },
    ...over,
  };
  return { deps, calls, consentAsked: consent.asked, refreshes: () => refreshes, status };
}

test('createRepoRegisterProvidersHandler: on accept, mcp.register is called with the repo + mapped steering; outcome surfaced + panel refreshed', async () => {
  const f = makeRegDeps({ outcome: 'accepted' });
  const reg: RepoProviderRegistration = { repoPath: REPOS[0]!.path, clients: ['codex', 'vibe'] };
  createRepoRegisterProvidersHandler(f.deps)(reg);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.consentAsked(), 1);
  assert.deepEqual(f.calls, [{ repoPath: REPOS[0]!.path, steering: { claude: false, agents: true, vibe: true } }], 'the full registration (steering + MCP) goes through one mcp.register call');
  assert.match(f.status.current().detail ?? '', /codex registered/, 'per-client outcome surfaced via sc2');
  assert.equal(f.refreshes(), 1, 'panel re-rendered from fresh state');
});

test('createRepoRegisterProvidersHandler: decline writes nothing; unknown client / unregistered repo / empty selection are no-ops', async () => {
  const declined = makeRegDeps({ outcome: 'declined' });
  createRepoRegisterProvidersHandler(declined.deps)({ repoPath: REPOS[0]!.path, clients: ['codex'] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(declined.calls.length, 0, 'declined -> no mcp.register');

  const bad = makeRegDeps({ outcome: 'accepted' });
  createRepoRegisterProvidersHandler(bad.deps)({ repoPath: REPOS[0]!.path, clients: ['gemini'] });
  createRepoRegisterProvidersHandler(bad.deps)({ repoPath: '/not/registered', clients: ['codex'] });
  createRepoRegisterProvidersHandler(bad.deps)({ repoPath: REPOS[0]!.path, clients: [] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(bad.calls.length, 0, 'unknown provider / unregistered repo / empty selection -> no call');
  assert.equal(bad.consentAsked(), 0, 'no consent prompt for an invalid request');
});
