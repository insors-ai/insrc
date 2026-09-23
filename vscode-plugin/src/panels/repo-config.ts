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
 * independent — ac1/lc1) and, for the selected repo, DISCRETE form fields for that
 * repo's per-repo model-tiering overrides (models.byRepo[repoPath].tiers.<tier>.
 * {runner,model}) — authored through inputs, NOT raw JSON (ac3). Each field emits a
 * {type:'repoWrite',repoPath,segments,value} message. A registeredRepos()/rawConfig()
 * rejection PROPAGATES so the host degrades the panel.
 *
 * `createRepoConfigWriteHandler` is the onRepoConfigWrite sink: it validates the
 * write, cross-checks the repoPath is a registered repo, asks sc4 consent (a write
 * mutates daemon config, k4), and ONLY on 'accepted' writes via the sc8 writeKeyPath
 * ARRAY form (['models','byRepo',repoPath,...segments]) — reusing the existing
 * config.write (no new daemon capability, k3). The outcome surfaces via sc2 and the
 * panel re-renders from fresh config (truthful). Fire-and-forget + never-throw. No
 * vscode, no cloud (k2/k5).
 */

import { escapeHtml } from './html.js';
import type { RepoConfigRenderer, RepoConfigRendererDeps, RepoConfigWrite, RepoRef } from './types.js';
import type { ConfigWriteResult } from '../config/types.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';

/** The per-repo tiers rendered as discrete fields (the primary per-repo override surface). */
const TIERS = ['core', 'mid', 'cheap'] as const;
/** The two editable fields of each tier. */
const TIER_FIELDS = ['runner', 'model'] as const;

/** Injected inputs for the consent-gated per-repo write orchestration (S007). */
export interface RepoConfigWriteDeps {
  readonly consent: ConsentGate;
  readonly writeKeyPath: (segments: readonly string[], value: unknown) => Promise<ConfigWriteResult>;
  readonly registeredRepos: () => Promise<readonly RepoRef[]>;
  readonly status: StatusSurface;
  readonly logger: { warn(message: string): void };
  /** Re-render the panel from fresh config after a write (truthful; the k5 discipline). */
  readonly refresh: () => void;
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

    // The per-repo form: the model-tiering overrides at models.byRepo[repoPath].tiers.
    // Each field is a discrete input (NOT raw JSON, ac3), pre-filled from the daemon's
    // stored value (empty = using the global/default tier), posting a repoWrite.
    const raw = await deps.rawConfig();
    const rows = TIERS.map((tier) => {
      const fields = TIER_FIELDS.map((field) => {
        const cur = readStringAt(raw, ['models', 'byRepo', active, 'tiers', tier, field]) ?? '';
        // The trailing segments are carried as a JSON array (NOT a dot-joined string):
        // a config segment may legitimately contain a dot (a dotted roleId like
        // `context.assemble`), and a naive split('.') would mis-nest it — the exact
        // hazard the config.write ARRAY form exists to avoid. JSON survives a `"`-bearing
        // value because the attribute is escapeHtml'd (browser decodes it back before parse).
        const segments = JSON.stringify(['tiers', tier, field]);
        return (
          `<label class="field">${escapeHtml(field)} ` +
          `<input type="text" data-segments="${escapeHtml(segments)}" value="${escapeHtml(cur)}" ` +
          `placeholder="(default)" /></label>`
        );
      }).join('');
      return `<fieldset class="tier"><legend>${escapeHtml(tier)}</legend>${fields}</fieldset>`;
    }).join('');

    return (
      `${picker}` +
      `<section id="insrc-repo-form" data-repo="${escapeHtml(active)}">` +
      `<p class="hint">Per-repo model tiers for this repo. Leave a field blank to use the global default.</p>${rows}` +
      `</section>`
    );
  };
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
            : `per-repo write refused: ${result.reason}`,
        });
        deps.refresh(); // truthful re-render from fresh config (accepted-ok OR refused).
      } catch (err) {
        deps.logger.warn(`insrc: the per-repo config write failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };
}
