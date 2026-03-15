/**
 * Status bar item — daemon health display with 10 states.
 *
 * Left-click: open chat panel (Segment 5).
 * Tooltip: uptime, queue depth, Ollama status, model readiness, repos.
 */

import * as vscode from 'vscode';
import type { DaemonStatus } from '../daemon/lifecycle';

// ---------------------------------------------------------------------------
// State definitions
// ---------------------------------------------------------------------------

type StatusState =
  | 'running'
  | 'processing'
  | 'indexing'
  | 'deltaIndexing'
  | 'ollamaDown'
  | 'stopped'
  | 'crashed'
  | 'stale'
  | 'setupRequired'
  | 'autoAccept';

interface StatusDisplay {
  icon: string;
  label: string;
  color: vscode.ThemeColor | string | undefined;
}

const STATE_DISPLAY: Record<StatusState, StatusDisplay> = {
  running:        { icon: '$(pass-filled)',      label: 'insrc',            color: new vscode.ThemeColor('statusBarItem.foreground') },
  processing:     { icon: '$(loading~spin)',     label: 'insrc',            color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  indexing:       { icon: '$(sync~spin)',        label: 'insrc: indexing',  color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  deltaIndexing:  { icon: '$(sync~spin)',        label: 'insrc: delta',     color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  ollamaDown:     { icon: '$(warning)',          label: 'insrc: no Ollama', color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  stopped:        { icon: '$(circle-slash)',     label: 'insrc: stopped',   color: new vscode.ThemeColor('statusBarItem.errorForeground') },
  crashed:        { icon: '$(error)',            label: 'insrc: crashed',   color: new vscode.ThemeColor('statusBarItem.errorForeground') },
  stale:          { icon: '$(clock)',            label: 'insrc: stale',     color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  setupRequired:  { icon: '$(gear)',             label: 'insrc: setup',     color: new vscode.ThemeColor('statusBarItem.warningForeground') },
  autoAccept:     { icon: '$(pass-filled)',      label: 'insrc: auto',      color: '#4caf7d' },
};

// ---------------------------------------------------------------------------
// Status bar manager
// ---------------------------------------------------------------------------

export interface StatusBarManager {
  /** Update the status bar from a DaemonStatus. */
  update(status: DaemonStatus): void;
  /** Set explicit state override (e.g., 'crashed' from lifecycle). */
  setState(state: StatusState): void;
  /** Dispose the status bar item. */
  dispose(): void;
}

export function createStatusBar(): StatusBarManager {
  const item = vscode.window.createStatusBarItem(
    'insrc.statusBar',
    vscode.StatusBarAlignment.Left,
    100,
  );

  // Left-click opens chat panel (Segment 5 — placeholder command for now)
  item.command = 'insrc.openPanel';
  item.name = 'insrc';

  // Start in stopped state
  applyState(item, 'stopped', undefined);
  item.show();

  let lastState: StatusState = 'stopped';
  let wasCrashed = false;

  function update(status: DaemonStatus): void {
    const state = classifyState(status, wasCrashed);

    // Track crash transitions
    if (lastState === 'running' && !status.running) {
      wasCrashed = true;
    }
    if (status.running) {
      wasCrashed = false;
    }

    lastState = state;
    applyState(item, state, status);
  }

  function setState(state: StatusState): void {
    lastState = state;
    applyState(item, state, undefined);
  }

  function dispose(): void {
    item.dispose();
  }

  return { update, setState, dispose };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyState(status: DaemonStatus, wasCrashed: boolean): StatusState {
  if (!status.running) {
    return wasCrashed ? 'crashed' : 'stopped';
  }

  // Check for setup issues
  if (!status.ollamaAvailable) {
    return 'ollamaDown';
  }

  // Check for stale repos
  if (status.repos?.some(r => r.status === 'stale')) {
    return 'stale';
  }

  // Check for active indexing
  if (status.queueDepth !== undefined && status.queueDepth > 0) {
    return status.queueDepth > 20 ? 'indexing' : 'deltaIndexing';
  }

  // Check permission mode
  const permMode = vscode.workspace.getConfiguration('insrc.permissions').get<string>('mode', 'validate');
  if (permMode === 'auto-accept') {
    return 'autoAccept';
  }

  return 'running';
}

function applyState(item: vscode.StatusBarItem, state: StatusState, status: DaemonStatus | undefined): void {
  const display = STATE_DISPLAY[state];
  item.text = `${display.icon} ${display.label}`;
  item.color = display.color;
  item.tooltip = buildTooltip(state, status);
}

function buildTooltip(state: StatusState, status: DaemonStatus | undefined): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### $(pass-filled) insrc Daemon\n\n`);

  if (!status?.running) {
    md.appendMarkdown(`**Status:** ${state === 'crashed' ? '$(error) Crashed' : '$(circle-slash) Stopped'}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[$(debug-start) Start Daemon](command:insrc.restartDaemon)`);
    return md;
  }

  // Health details
  md.appendMarkdown(`| | |\n|---|---|\n`);
  md.appendMarkdown(`| **Status** | $(pass-filled) ${state} |\n`);

  if (status.uptime) {
    md.appendMarkdown(`| **Uptime** | ${status.uptime} |\n`);
  }

  md.appendMarkdown(`| **Queue** | ${status.queueDepth ?? 0} pending |\n`);
  md.appendMarkdown(`| **Ollama** | ${status.ollamaAvailable ? '$(pass-filled) ready' : '$(error) unavailable'} |\n`);
  md.appendMarkdown(`| **Model** | ${status.modelReady ? '$(pass-filled) loaded' : '$(loading~spin) loading'} |\n`);

  // Repo list
  if (status.repos && status.repos.length > 0) {
    md.appendMarkdown(`\n---\n\n**Repos:**\n\n`);
    for (const repo of status.repos) {
      const repoName = repo.path.split('/').pop() ?? repo.path;
      const statusIcon = repo.status === 'ready' ? '$(pass-filled)' :
                         repo.status === 'indexing' ? '$(sync~spin)' :
                         repo.status === 'stale' ? '$(clock)' : '$(error)';
      md.appendMarkdown(`- ${statusIcon} \`${repoName}\`\n`);
    }
  }

  // Actions
  md.appendMarkdown(`\n---\n\n`);
  md.appendMarkdown(`[$(debug-restart) Restart](command:insrc.restartDaemon) · `);
  md.appendMarkdown(`[$(gear) Settings](command:insrc.openSettings) · `);
  md.appendMarkdown(`[$(output) Logs](command:insrc.showLogs)`);

  return md;
}
