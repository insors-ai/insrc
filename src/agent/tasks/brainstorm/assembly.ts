/**
 * Final document assembly for the brainstorm agent.
 *
 * Transforms BrainstormState into a BrainstormResult with rendered HTML output.
 */

import type { BrainstormState } from './agent-state.js';
import type { BrainstormResult, SpecRequirement, Theme, Idea } from './types.js';
import { BRAINSTORM_HTML_TEMPLATE } from './templates.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the final brainstorm output from agent state.
 */
export function assembleDocument(
  state: BrainstormState,
  customTemplate?: string,
): BrainstormResult {
  const stats = computeStats(state);
  const output = renderHTML(state, stats, customTemplate);
  const summary = compressForL2(state, stats);

  return {
    kind: 'brainstorm-spec',
    output,
    requirements: state.requirements,
    themes: state.themes,
    ideas: state.ideas,
    revisions: state.revisions,
    summary,
    stats,
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(state: BrainstormState): BrainstormResult['stats'] {
  return {
    rounds: state.round,
    totalIdeas: state.ideas.length,
    promoted: state.ideas.filter(i => i.status === 'promoted').length,
    merged: state.ideas.filter(i => i.status === 'merged').length,
    rejected: state.ideas.filter(i => i.status === 'rejected').length,
    parked: state.ideas.filter(i => i.status === 'parked').length,
  };
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function renderHTML(
  state: BrainstormState,
  stats: BrainstormResult['stats'],
  customTemplate?: string,
): string {
  const title = deriveTitle(state.input.message);
  let html = customTemplate ?? BRAINSTORM_HTML_TEMPLATE;

  html = html.replace(/\{\{title\}\}/g, escapeHtml(title));
  html = html.replace('{{stats}}', renderStatsHTML(stats));
  html = html.replace('{{problem}}', `<p>${escapeHtml(state.input.message)}</p>`);
  html = html.replace('{{themes_section}}', renderThemesHTML(state.themes, state.ideas));
  html = html.replace('{{requirements_section}}', renderRequirementsHTML(state.requirements, state.themes));
  html = html.replace('{{traceability}}', renderTraceabilityHTML(state.requirements, state.ideas));
  html = html.replace('{{parked_ideas}}', renderParkedHTML(state.ideas));
  html = html.replace('{{revision_log}}', renderRevisionLogHTML(state));
  html = html.replace('{{session_stats}}', renderSessionStatsHTML(state, stats));

  return html;
}

function renderStatsHTML(stats: BrainstormResult['stats']): string {
  return `<div class="stats">
    <div class="stat"><div class="stat-value">${stats.rounds}</div><div class="stat-label">Rounds</div></div>
    <div class="stat"><div class="stat-value">${stats.totalIdeas}</div><div class="stat-label">Ideas</div></div>
    <div class="stat"><div class="stat-value">${stats.promoted}</div><div class="stat-label">Promoted</div></div>
    <div class="stat"><div class="stat-value">${stats.merged}</div><div class="stat-label">Merged</div></div>
    <div class="stat"><div class="stat-value">${stats.parked}</div><div class="stat-label">Parked</div></div>
  </div>`;
}

function renderThemesHTML(themes: Theme[], ideas: Idea[]): string {
  if (themes.length === 0) return '';

  const parts = ['<h2>Themes</h2>'];
  for (const theme of themes) {
    parts.push(`<div class="theme-section">`);
    parts.push(`<h3>${escapeHtml(theme.name)}</h3>`);
    parts.push(`<p>${escapeHtml(theme.description)}</p>`);

    const themeIdeas = theme.ideaIds
      .map(id => ideas.find(i => i.id === id))
      .filter((i): i is Idea => !!i);

    if (themeIdeas.length > 0) {
      for (const idea of themeIdeas) {
        const statusClass = idea.status;
        parts.push(`<div class="idea-item">[${idea.index}] ${escapeHtml(idea.text)} <span class="idea-status ${statusClass}">${idea.status}</span></div>`);
      }
    }
    parts.push('</div>');
  }
  return parts.join('\n');
}

function renderRequirementsHTML(requirements: SpecRequirement[], themes: Theme[]): string {
  if (requirements.length === 0) return '<h2>Requirements</h2>\n<p>No requirements generated.</p>';

  const parts = ['<h2>Requirements Specification</h2>'];

  // Group by theme
  const byTheme = new Map<string, SpecRequirement[]>();
  for (const req of requirements) {
    const list = byTheme.get(req.themeId) ?? [];
    list.push(req);
    byTheme.set(req.themeId, list);
  }

  for (const theme of themes) {
    const reqs = byTheme.get(theme.id);
    if (!reqs || reqs.length === 0) continue;

    parts.push(`<h3>${escapeHtml(theme.name)}</h3>`);
    for (const req of reqs) {
      parts.push(renderReqCard(req));
    }
  }

  // Unthemed
  const unthemed = requirements.filter(r => !themes.some(t => t.id === r.themeId));
  if (unthemed.length > 0) {
    parts.push('<h3>Uncategorized</h3>');
    for (const req of unthemed) {
      parts.push(renderReqCard(req));
    }
  }

  return parts.join('\n');
}

function renderReqCard(req: SpecRequirement): string {
  const typeClass = req.type === 'non-functional' ? 'nonfunctional' : req.type;
  const priorityClass = req.priority;

  const criteria = req.acceptanceCriteria.length > 0
    ? `<ul class="criteria-list">${req.acceptanceCriteria.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : '';

  return `<div class="req-card">
    <div class="req-statement">${req.index}. ${escapeHtml(req.statement)}</div>
    <div class="req-meta">
      <span class="badge badge-${typeClass}">${req.type}</span>
      <span class="badge badge-${priorityClass}">${req.priority}</span>
      rev ${req.revision} | round ${req.addedInRound}
    </div>
    ${criteria}
  </div>`;
}

function renderTraceabilityHTML(requirements: SpecRequirement[], ideas: Idea[]): string {
  if (requirements.length === 0) return '';

  const rows = requirements.map(req => {
    const sourceIdeas = req.sourceIdeaIds
      .map(id => ideas.find(i => i.id === id))
      .filter((i): i is Idea => !!i)
      .map(i => `[${i.index}] ${i.text.slice(0, 40)}`)
      .join(', ');

    return `<tr>
      <td>${req.index}</td>
      <td>${escapeHtml(req.statement.slice(0, 60))}</td>
      <td>${escapeHtml(sourceIdeas) || '—'}</td>
    </tr>`;
  }).join('\n');

  return `<h2>Traceability Matrix</h2>
  <table class="trace-table">
    <thead><tr><th>#</th><th>Requirement</th><th>Source Ideas</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderParkedHTML(ideas: Idea[]): string {
  const parked = ideas.filter(i => i.status === 'parked');
  if (parked.length === 0) return '';

  const items = parked.map(i =>
    `<div class="idea-item">[${i.index}] ${escapeHtml(i.text)} <span class="idea-status parked">parked</span></div>`,
  ).join('\n');

  return `<h2>Parked Ideas</h2>\n${items}`;
}

function renderRevisionLogHTML(state: BrainstormState): string {
  if (state.revisions.length === 0) return '';

  const items = state.revisions.map(r =>
    `<li>Round ${r.round}: <strong>[${r.action}]</strong> ${escapeHtml(r.detail)}</li>`,
  ).join('\n');

  return `<h2>Revision Log</h2>\n<ul class="revision-log">${items}</ul>`;
}

function renderSessionStatsHTML(state: BrainstormState, stats: BrainstormResult['stats']): string {
  return `<h2>Session Summary</h2>
  <div class="req-card">
    <p><strong>Rounds:</strong> ${stats.rounds} | <strong>Ideas:</strong> ${stats.totalIdeas} | <strong>Requirements:</strong> ${state.requirements.length}</p>
    <p><strong>Promoted:</strong> ${stats.promoted} | <strong>Merged:</strong> ${stats.merged} | <strong>Rejected:</strong> ${stats.rejected} | <strong>Parked:</strong> ${stats.parked}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// L2 compression
// ---------------------------------------------------------------------------

function compressForL2(state: BrainstormState, stats: BrainstormResult['stats']): string {
  return [
    `Brainstorm: ${stats.rounds} rounds, ${stats.totalIdeas} ideas.`,
    `${state.requirements.length} requirements across ${state.themes.length} themes.`,
    `${stats.promoted} promoted, ${stats.merged} merged, ${stats.rejected} rejected, ${stats.parked} parked.`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveTitle(message: string): string {
  const firstSentence = message.match(/^[^.!?\n]+/);
  const raw = firstSentence ? firstSentence[0]! : message.slice(0, 80);
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
