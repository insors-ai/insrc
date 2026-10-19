/**
 * Story E20260923401ae5fb:S005 / t2 — the Daemon + Workflows tab renderers (sc9).
 *
 * The two S005-owned TabRenderers plugged into the sc9 host via the detailRenderers
 * map. Each is a VS-Code-free PURE fn over the read-only DaemonDataGateway: it
 * awaits the gateway read, renders the tab BODY html (escaped), and lets a
 * GatewayReadError PROPAGATE (no swallow) so the host degrades the tab in-panel
 * (the host's never-throw wrapper owns the failure UX). The host wraps this body
 * in the panel shell + interactive tab strip; a Refresh control here posts
 * {type:'refresh'} to the host's message bridge. No vscode, no cloud (k2/k3).
 */

import { escapeHtml } from './html.js';
import { GatewayReadError, type DaemonDataGateway, type RepoRef, type TabRenderer, type WorkflowChainRow } from './types.js';

/** The Refresh control both tabs render; its click posts {type:'refresh'} (wired by the host bootstrap). */
const REFRESH_CONTROL = `<button type="button" id="insrc-refresh" class="refresh" title="Re-read from the daemon">Refresh</button>`;

/**
 * The Daemon tab (ac1): the daemon's current operational status. Reads
 * gateway.status() and renders the state + (optional) detail; a missing detail
 * renders just the state heading. A gateway rejection propagates to the host.
 */
export const renderDaemonTab: TabRenderer = async (gateway: DaemonDataGateway): Promise<string> => {
  const view = await gateway.status();
  const detail = view.detail !== undefined ? `<p class="detail">${escapeHtml(view.detail)}</p>` : '';
  return `${REFRESH_CONTROL}<p class="state">${escapeHtml(view.state)}</p>${detail}${await repositoryList(gateway)}`;
};

/**
 * The Daemon tab's repository list (Epic c2ba6fa6 s1): each repository with its
 * status and whether its index is complete; an incomplete one lists its reasons
 * (each carries its count); one with no completeness (a daemon before the
 * change) shows the status alone. A failed repo.list read leaves the daemon's
 * status shown and says the list is unavailable.
 */
async function repositoryList(gateway: DaemonDataGateway): Promise<string> {
  let repos: readonly RepoRef[];
  try {
    repos = await gateway.registeredRepos();
  } catch (err) {
    if (!(err instanceof GatewayReadError)) throw err;
    return `<section class="repos"><h3>Repositories</h3><p class="placeholder">Repositories unavailable: ${escapeHtml(err.message)}</p></section>`;
  }
  if (repos.length === 0) {
    return `<section class="repos"><h3>Repositories</h3><p class="placeholder">No repositories registered.</p></section>`;
  }
  const items = repos.map((r) => {
    const status = r.status !== undefined ? ` <span class="status">${escapeHtml(r.status)}</span>` : '';
    const c = r.completeness;
    const completeness = c === undefined
      ? ''
      : c.complete
        ? ` <span class="completeness complete">complete</span>`
        : ` <span class="completeness incomplete">incomplete</span><ul class="reasons">${c.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`;
    return `<li class="repo"><span class="repo-name" title="${escapeHtml(r.path)}">${escapeHtml(r.name !== '' ? r.name : r.path)}</span>${status}${completeness}</li>`;
  });
  return `<section class="repos"><h3>Repositories</h3><ul class="repo-list">${items.join('')}</ul></section>`;
}

/**
 * The Workflows tab (ac2): the workflow chain report. Reads gateway.workflowChain()
 * and renders the rows grouped by slug (one section per work item, one line per
 * stage: stage + status), an explicit empty-state when there are no rows. A
 * gateway rejection propagates to the host.
 */
export const renderWorkflowsTab: TabRenderer = async (gateway: DaemonDataGateway): Promise<string> => {
  const { rows } = await gateway.workflowChain();
  if (rows.length === 0) {
    return `${REFRESH_CONTROL}<p class="placeholder">No workflow artifacts yet.</p>`;
  }
  const sections = groupBySlug(rows)
    .map(([slug, slugRows]) => {
      const lines = slugRows
        .map((r) => `<li><span class="stage">${escapeHtml(r.stage)}</span> — <span class="status">${escapeHtml(r.status)}</span></li>`)
        .join('');
      return `<section class="chain"><h3>${escapeHtml(slug)}</h3><ul>${lines}</ul></section>`;
    })
    .join('');
  return `${REFRESH_CONTROL}${sections}`;
};

/** Group chain rows by slug, preserving first-seen order for a stable report. */
function groupBySlug(rows: readonly WorkflowChainRow[]): Array<[string, WorkflowChainRow[]]> {
  const order: string[] = [];
  const bySlug = new Map<string, WorkflowChainRow[]>();
  for (const row of rows) {
    let bucket = bySlug.get(row.slug);
    if (bucket === undefined) {
      bucket = [];
      bySlug.set(row.slug, bucket);
      order.push(row.slug);
    }
    bucket.push(row);
  }
  return order.map((slug) => [slug, bySlug.get(slug)!]);
}
