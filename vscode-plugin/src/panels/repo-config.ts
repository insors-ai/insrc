/**
 * Story E20260923401ae5fb:S007 / t2 — the Repo Configuration panel core (sc9).
 *
 * The S007-owned per-repo config editor, plugged into the sc9 host via the
 * `repoRenderer` (the body) + `onRepoConfigWrite` (the write sink). Both are
 * VS-Code-free.
 *
 * `renderRepoConfig` is a (selected)=>Promise<string> that reads its OWN data
 * (registeredRepos + the raw config over config.show) so the host stays a pure
 * dispatcher: it renders a repo <select> (the daemon's registered repos, folder-
 * independent — ac1/lc1) and, for the selected repo, DISCRETE form fields for what a
 * repo may choose: the tier each role uses (models.byRepo[repoPath].tasks[roleId]) and
 * the repo's core floor — never a runner, model or effort, which are global (Epic
 * ce99b72065d03b1b, Story s6, k6). Each field emits a
 * {type:'repoWrite',repoPath,segments,value} message. A registeredRepos()/rawConfig()
 * rejection PROPAGATES so the host degrades the panel.
 *
 * `createRepoConfigWriteHandler` is the onRepoConfigWrite sink: it validates the
 * write (only ['tasks', roleId] and ['coreFloor'] are accepted), cross-checks the repoPath
 * is a registered repo, asks sc4 consent (a write
 * mutates daemon config, k4), and ONLY on 'accepted' writes via the sc8 writeKeyPath
 * ARRAY form (['models','byRepo',repoPath,...segments]) — reusing the existing
 * config.write (no new daemon capability, k3). The outcome surfaces via sc2 and the
 * panel re-renders from fresh config (truthful). Fire-and-forget + never-throw. No
 * vscode, no cloud (k2/k5).
 */

import { reasoningRoleTaxonomy } from '../../../src/config/role-taxonomy.js';
import type { Criticality, RoleDescriptor } from '../../../src/config/role-taxonomy.js';
import { escapeHtml } from './html.js';
import type { McpRegistrationView, RepoConfigRenderer, RepoConfigRendererDeps, RepoConfigWrite, RepoProviderRegistration, RepoRef } from './types.js';
import type { ConfigWriteResult } from '../config/types.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';
import type { McpClient, McpClientOutcome, SteeringSelection } from '../../../src/shared/types.js';

/** The tier names a role or the core floor may choose ('' = use the global choice). */
const TIER_CHOICES = ['core', 'mid', 'cheap'] as const;

/** Injected inputs for the consent-gated per-repo write orchestration (S007). */
export interface RepoConfigWriteDeps {
  readonly consent: ConsentGate;
  readonly writeKeyPath: (segments: readonly string[], value: unknown) => Promise<ConfigWriteResult>;
  readonly registeredRepos: () => Promise<readonly RepoRef[]>;
  readonly status: StatusSurface;
  readonly logger: { warn(message: string): void };
  /** Re-render the panel from fresh config after a write (truthful; the k5 discipline). */
  readonly refresh: () => void;
  /** Offer a daemon restart for a write that applies only after one (a 'Restart daemon' action). */
  readonly offerRestart: (message: string) => void;
}

/** Whether a write targets what a repo may set: ['tasks', roleId] or ['coreFloor']. */
function isRepoModelWrite(segments: readonly string[]): boolean {
  return (segments.length === 2 && segments[0] === 'tasks' && segments[1] !== '') || (segments.length === 1 && segments[0] === 'coreFloor');
}

/** A role row: a label and a tier <select> carrying its write segments; '' (global) clears the repo's choice. */
function tierRow(label: string, segments: readonly string[], current: string): string {
  // The segments are carried as a JSON array (NOT a dot-joined string): a role id is
  // dotted (`context.assemble`) and a naive split('.') would mis-nest it — the hazard the
  // config.write ARRAY form exists to avoid. escapeHtml keeps the attribute intact.
  const options = ['', ...TIER_CHOICES]
    .map((t) => `<option value="${t}"${t === current ? ' selected' : ''}>${t === '' ? 'global' : t}</option>`)
    .join('');
  return `<div class="role-row"><span>${escapeHtml(label)}</span><select data-segments="${escapeHtml(JSON.stringify(segments))}">${options}</select></div>`;
}

/** The section heading for a criticality group (exhaustive — a future
 *  Criticality member is a compile-time error here, not a silently-dropped role). */
function groupLabel(c: Criticality): string {
  switch (c) {
    case 'critical':
      return 'Critical roles';
    case 'peripheral':
      return 'Peripheral roles';
  }
}

/** One <details> section of role rows for a single criticality, open only for 'critical'. */
function roleGroupSection(criticality: Criticality, roles: readonly RoleDescriptor[], raw: Record<string, unknown>, active: string): string {
  const rows = roles
    .map((role) => tierRow(role.id, ['tasks', role.id], readStringAt(raw, ['models', 'byRepo', active, 'tasks', role.id]) ?? ''))
    .join('');
  return (
    `<details class="section"${criticality === 'critical' ? ' open' : ''}>` +
    `<summary class="section-head">${groupLabel(criticality)} <span class="count">${roles.length}</span></summary>` +
    `<div class="rows">${rows}</div>` +
    `</details>`
  );
}

/** Read a nested string at `path` in an unknown object tree, or undefined. */
function readStringAt(root: Record<string, unknown>, path: readonly string[]): string | undefined {
  let cur: unknown = root;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Build the Repo Configuration body renderer. Reads registeredRepos + rawConfig
 * itself; a rejection propagates to the host's never-throw wrapper.
 */
export function renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer {
  return async (selected: string | undefined): Promise<string> => {
    const repos = await deps.registeredRepos();
    if (repos.length === 0) {
      return `<p class="placeholder">No repos are registered with the daemon.</p>`;
    }

    // The picker: one option per registered repo (folder-independent). The selected
    // repo is only honoured when it is still a registered repo.
    const known = new Set(repos.map((r) => r.path));
    const active = selected !== undefined && known.has(selected) ? selected : undefined;
    const options = repos
      .map(
        (r) =>
          `<option value="${escapeHtml(r.path)}"${r.path === active ? ' selected' : ''}>${escapeHtml(
            r.name,
          )} — ${escapeHtml(r.path)}</option>`,
      )
      .join('');
    const picker =
      `<label class="repo-picker">Repo <select id="insrc-repo-select">` +
      `<option value=""${active === undefined ? ' selected' : ''}>Choose a repo…</option>${options}</select></label>`;

    if (active === undefined) {
      return `${picker}<p class="placeholder">Choose a repo to edit its per-repo overrides.</p>`;
    }

    // The per-repo form: the tier each role uses (tasks) and the core floor — what a repo
    // may choose. Pre-filled from the daemon's stored value; 'global' = no repo choice.
    const raw = await deps.rawConfig();
    const allRoles = reasoningRoleTaxonomy().roles;
    const groups = (['critical', 'peripheral'] as const)
      .map((c) => roleGroupSection(c, allRoles.filter((r) => r.criticality === c), raw, active))
      .join('');
    const floor = tierRow('coreFloor', ['coreFloor'], readStringAt(raw, ['models', 'byRepo', active, 'coreFloor']) ?? '');
    const floorSection = `<div class="section"><div class="section-head">Core floor</div><div class="floor-row">${floor}</div></div>`;

    // The Providers section: per-provider MCP registration state from the
    // daemon's mcp.status read — already-registered providers render as
    // non-checkable; only unregistered, available ones are checkboxes.
    let providers: string;
    try {
      providers = renderProvidersSection(await deps.mcpRegistration());
    } catch (err) {
      // An old daemon answers 'unknown method: mcp.status' — say so and point at the update.
      const msg = err instanceof Error ? err.message : String(err);
      providers = /unknown method/.test(msg)
        ? `<p class="hint">The running daemon predates provider registration — run <b>insrc: Update daemon</b> (or restart the daemon) and reopen this panel.</p>`
        : `<p class="hint">Provider registration state is unavailable right now.</p>`;
    }

    return (
      `${picker}` +
      `<section id="insrc-repo-form" data-repo="${escapeHtml(active)}">` +
      `<p class="hint">The tier each role uses in this repo, and its core floor. 'global' uses the global choice; the tiers' models are set with 'insrc: Set model tier'.</p>` +
      groups +
      floorSection +
      `<h3>Providers</h3>${providers}` +
      `</section>`
    );
  };
}

/** Human label for a provider client id. */
function providerLabel(client: string): string {
  return client === 'claude' ? 'Claude Code' : client === 'codex' ? 'Codex' : client === 'vibe' ? 'Mistral Vibe' : client;
}

/** The Providers section: registered providers are shown checked + disabled;
 *  unavailable CLIs disabled; only unregistered available ones are checkable. */
function renderProvidersSection(regs: readonly McpRegistrationView[]): string {
  const rows = regs.map((r) => {
    const label = providerLabel(r.client);
    if (r.registered) {
      return `<label class="provider"><input type="checkbox" checked disabled> ${escapeHtml(label)} — registered</label>`;
    }
    if (!r.available) {
      return `<label class="provider"><input type="checkbox" disabled> ${escapeHtml(label)} — CLI not found on PATH</label>`;
    }
    return `<label class="provider"><input type="checkbox" data-provider="${escapeHtml(r.client)}"> ${escapeHtml(label)}</label>`;
  });
  const checkable = regs.some((r) => r.available && !r.registered);
  const button = checkable
    ? `<button id="insrc-register-providers" type="button">Register selected providers</button>`
    : '';
  return (
    `<p class="hint">Register the insrc MCP server (and inject the steering block) for a provider in this repo. Already-registered providers are not checkable.</p>` +
    `<div class="providers">${rows.join('')}</div>` +
    button
  );
}

/**
 * Build the consent-gated per-repo write handler (the host's onRepoConfigWrite sink).
 * Validates the write, cross-checks the repoPath is registered, prompts sc4 consent,
 * and writes ONLY on 'accepted' via the sc8 writeKeyPath ARRAY form. Surfaces the
 * outcome via sc2 and re-renders (refresh) from fresh config. Never throws.
 */
export function createRepoConfigWriteHandler(deps: RepoConfigWriteDeps): (write: RepoConfigWrite) => void {
  return (write: RepoConfigWrite): void => {
    // Shape guard (defence-in-depth; the host already validates before forwarding).
    if (
      typeof write !== 'object' ||
      write === null ||
      typeof write.repoPath !== 'string' ||
      write.repoPath.length === 0 ||
      !Array.isArray(write.segments) ||
      !write.segments.every((s) => typeof s === 'string') ||
      write.segments.length === 0
    ) {
      return;
    }
    // A repo chooses only role tiers and its core floor: tiers are global (k6).
    if (!isRepoModelWrite(write.segments)) {
      deps.logger.warn(`insrc: ignoring a per-repo write to ${JSON.stringify(write.segments)} — a repo sets only tasks and coreFloor`);
      return;
    }
    void (async () => {
      try {
        const repos = await deps.registeredRepos();
        if (!repos.some((r) => r.path === write.repoPath)) {
          deps.logger.warn(`insrc: ignoring a per-repo write for an unregistered repo (${write.repoPath})`);
          return; // never write for a repo the daemon does not track (lc1).
        }
        const label = write.segments.join('.');
        const outcome = await deps.consent.ask({
          title: 'Apply per-repo configuration change?',
          detail: `Write ${label} for the repo ${write.repoPath}?`,
          acceptLabel: 'Apply',
        });
        if (outcome !== 'accepted') return; // declined / dismissed — write NOTHING (k4).
        const result = await deps.writeKeyPath(['models', 'byRepo', write.repoPath, ...write.segments], write.value);
        deps.status.set({
          state: deps.status.current().state,
          detail: result.ok
            ? `updated ${label} for ${write.repoPath}`
            : `per-repo write refused: ${result.reason}${result.detail !== undefined ? ` — ${result.detail}` : ''}`,
        });
        if (result.ok && result.restartRequired === true) deps.offerRestart(`insrc: updated ${label} for ${write.repoPath} — restart the daemon to apply`);
        deps.refresh(); // truthful re-render from fresh config (accepted-ok OR refused).
      } catch (err) {
        deps.logger.warn(`insrc: the per-repo config write failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };
}

// ---- provider registration sink (post-setup `mcp.register`) -----------------

/** The known provider clients a repo form may check. */
const KNOWN_PROVIDERS: readonly McpClient[] = ['claude', 'codex', 'vibe'];

/** Injected inputs for the consent-gated provider-registration orchestration. */
export interface RepoRegisterProvidersDeps {
  readonly consent: ConsentGate;
  readonly status: StatusSurface;
  readonly logger: { warn(message: string): void };
  readonly registeredRepos: () => Promise<readonly RepoRef[]>;
  /** The daemon's `mcp.register`: steering injection + per-client MCP registration. */
  readonly registerProviders: (repoPath: string, steering: SteeringSelection) => Promise<{
    readonly ok: boolean;
    readonly mcp?: { readonly clients: readonly McpClientOutcome[] } | undefined;
    readonly steering?: unknown;
  }>;
  /** Re-render the panel after a registration (truthful). */
  readonly refresh: () => void;
}

/** Map the checked provider clients to the daemon's SteeringSelection flags
 *  (claude → CLAUDE.md + claude client, codex → AGENTS.md + codex client,
 *  vibe → vibe client; vibe reads the same AGENTS.md block via the agents flag). */
export function steeringForClients(clients: readonly string[]): SteeringSelection {
  return {
    claude: clients.includes('claude'),
    agents: clients.includes('codex'),
    vibe: clients.includes('vibe'),
  };
}

/**
 * Build the consent-gated provider-registration handler (the host's
 * onRepoRegisterProviders sink). Validates the repo is registered and the
 * clients are known providers, prompts sc4 consent, and ONLY on 'accepted'
 * calls the daemon's `mcp.register` — the full setup (steering-block injection
 * into the repo's client files + MCP registration per selected client).
 * Surfaces the outcome via sc2 and re-renders. Never throws.
 */
export function createRepoRegisterProvidersHandler(deps: RepoRegisterProvidersDeps): (reg: RepoProviderRegistration) => void {
  return (reg: RepoProviderRegistration): void => {
    if (
      typeof reg !== 'object' ||
      reg === null ||
      typeof reg.repoPath !== 'string' ||
      reg.repoPath.length === 0 ||
      !Array.isArray(reg.clients) ||
      !reg.clients.every((c) => typeof c === 'string') ||
      reg.clients.length === 0 ||
      !reg.clients.every((c) => (KNOWN_PROVIDERS as readonly string[]).includes(c))
    ) {
      return;
    }
    void (async () => {
      try {
        const repos = await deps.registeredRepos();
        if (!repos.some((r) => r.path === reg.repoPath)) {
          deps.logger.warn(`insrc: ignoring a provider registration for an unregistered repo (${reg.repoPath})`);
          return;
        }
        const labels = reg.clients.map(providerLabel);
        const outcome = await deps.consent.ask({
          title: 'Register providers for this repo?',
          detail: `Register ${labels.join(', ')} for ${reg.repoPath}: inject the insrc steering block into the repo's client files and register the insrc MCP server for each. Reversible.`,
          acceptLabel: 'Register',
          items: labels,
        });
        if (outcome !== 'accepted') return; // declined / dismissed — write NOTHING (k4).
        const result = await deps.registerProviders(reg.repoPath, steeringForClients(reg.clients));
        const mcpLine = (result.mcp?.clients ?? [])
          .filter((c) => c.action !== 'skipped')
          .map((c) => `${c.client} ${c.action}${c.note !== undefined && c.note !== '' ? ` (${c.note})` : ''}`)
          .join(', ');
        deps.status.set({
          state: deps.status.current().state,
          detail: result.ok
            ? `provider registration for ${reg.repoPath}${mcpLine ? `: ${mcpLine}` : ' — nothing to do'}`
            : `provider registration refused for ${reg.repoPath}`,
        });
        deps.refresh();
      } catch (err) {
        deps.logger.warn(`insrc: the provider registration failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };
}
