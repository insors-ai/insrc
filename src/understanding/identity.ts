import { createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import { runShell } from '../daemon/tools/shell-helper.js';

export type ProviderSource = 'github' | 'gitlab' | 'jira';
export interface ProviderIdentity {
  source: ProviderSource;
  authority: string;
  subject: string;
}
export interface LearnerIdentity {
  key: string;
  source: ProviderSource | 'git' | 'os';
  authority: string;
  subject: string;
  assurance: 'provider-confirmed' | 'local-config' | 'os-local';
  aliases: readonly string[];
}
export interface IdentityLookup {
  source: ProviderSource;
  status: 'available' | 'disconnected' | 'missing-integration' | 'unavailable';
  identities: readonly ProviderIdentity[];
}
export interface IdentityDeps {
  providers: readonly { source: ProviderSource; lookup(): Promise<IdentityLookup> }[];
  gitEmail(repo: string): Promise<string | undefined>;
  osSubject(): string;
  hostId: string;
}
export interface ResolvedLearner {
  learner: LearnerIdentity;
  ownerPrincipal: string;
  diagnostics: readonly { source: ProviderSource | 'git'; status: string }[];
}

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('invalid identity value');
  }
  return value.trim();
}
function authority(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('invalid provider authority');
  }
  return url.origin;
}
function identity(source: LearnerIdentity['source'], host: string, subject: string): LearnerIdentity {
  const normalized = text(subject);
  return { key: digest(['learner-v1', source, host, normalized]), source, authority: host, subject: normalized,
    assurance: source === 'git' ? 'local-config' : source === 'os' ? 'os-local' : 'provider-confirmed', aliases: [] };
}

export async function resolveLearner(repo: string, deps: IdentityDeps): Promise<ResolvedLearner> {
  const host = text(deps.hostId);
  const os = text(deps.osSubject());
  const ownerPrincipal = digest(['owner-v1', host, os]);
  const diagnostics: { source: ProviderSource | 'git'; status: string }[] = [];
  const candidates = new Map<string, LearnerIdentity>();
  let incomplete = false;
  for (const source of ['github', 'gitlab', 'jira'] as const) {
    const adapters = deps.providers.filter(p => p.source === source);
    if (adapters.length > 1) throw new Error('duplicate identity adapter');
    const adapter = adapters[0];
    if (!adapter) { diagnostics.push({ source, status: 'missing-integration' }); continue; }
    try {
      const result = await adapter.lookup();
      if (result.source !== source || !['available', 'disconnected', 'missing-integration', 'unavailable'].includes(result.status)) {
        throw new Error('invalid identity lookup');
      }
      if (result.status !== 'available' && result.identities.length > 0) throw new Error('invalid identity lookup');
      const found = result.identities.map(p => {
        if (p.source !== source) throw new Error('invalid identity source');
        return identity(p.source, authority(p.authority), p.subject);
      });
      if (result.status === 'available' && found.length === 0) throw new Error('empty identity lookup');
      diagnostics.push({ source, status: result.status });
      if (result.status === 'unavailable') incomplete = true;
      for (const item of found) candidates.set(item.key, item);
    } catch {
      incomplete = true;
      diagnostics.push({ source, status: 'unavailable' });
    }
  }
  if (!incomplete && candidates.size === 1) {
    return { learner: [...candidates.values()][0]!, ownerPrincipal, diagnostics };
  }
  try {
    const email = await deps.gitEmail(repo);
    if (email?.trim()) return { learner: identity('git', 'git-email', email), ownerPrincipal, diagnostics };
    diagnostics.push({ source: 'git', status: 'disconnected' });
  } catch { diagnostics.push({ source: 'git', status: 'unavailable' }); }
  return { learner: identity('os', host, os), ownerPrincipal, diagnostics };
}

export type IdentityCommand = typeof runShell;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid provider response');
  return value as Record<string, unknown>;
}
export async function githubIdentities(run: IdentityCommand = runShell): Promise<IdentityLookup> {
  const source = 'github';
  const status = await run(['gh', 'auth', 'status', '--json', 'hosts'], { timeoutMs: 15_000, maxBytes: 256 * 1024 });
  if (status.spawnError) return { source, status: 'missing-integration', identities: [] };
  if (status.code !== 0 || status.stdoutTruncated) return { source, status: 'unavailable', identities: [] };
  try {
    const hosts = object(object(JSON.parse(status.stdout)).hosts);
    const identities: ProviderIdentity[] = [];
    let failed = false;
    for (const [host, rawAccounts] of Object.entries(hosts)) {
      const origin = authority(`https://${host}`);
      if (!Array.isArray(rawAccounts)) throw new Error('invalid accounts');
      for (const raw of rawAccounts) {
        const account = object(raw);
        if (account.state !== 'success') { failed = true; continue; }
        const login = text(account.login);
        const result = await run(['gh', 'api', '--hostname', new URL(origin).host, `users/${encodeURIComponent(login)}`],
          { timeoutMs: 15_000, maxBytes: 64 * 1024 });
        if (result.code !== 0 || result.stdoutTruncated || result.spawnError) { failed = true; continue; }
        const user = object(JSON.parse(result.stdout));
        if (text(user.login).toLowerCase() !== login.toLowerCase()) throw new Error('account changed');
        identities.push({ source, authority: origin, subject: text(user.node_id) });
      }
    }
    if (failed) return { source, status: 'unavailable', identities: [] };
    return { source, status: identities.length ? 'available' : 'disconnected', identities };
  } catch { return { source, status: 'unavailable', identities: [] }; }
}

export function localIdentityDeps(hostId: string, run: IdentityCommand = runShell): IdentityDeps {
  return {
    hostId,
    providers: [{ source: 'github', lookup: () => githubIdentities(run) }],
    gitEmail: async repo => {
      const result = await run(['git', 'config', '--get', 'user.email'], { cwd: repo, timeoutMs: 5_000, maxBytes: 4096 });
      if (result.code === 1 && !result.stdout.trim()) return undefined;
      if (result.code !== 0 || result.stdoutTruncated || result.spawnError) throw new Error('git identity unavailable');
      return result.stdout.trim();
    },
    osSubject: () => {
      const user = userInfo();
      return user.uid >= 0 ? String(user.uid) : user.username;
    },
  };
}
