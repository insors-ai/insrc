/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { PROBE_OBSERVATION_BYTES } from '../../shared/review-investigation-probe.js';

export const CLAUDE_POLICY_TELEMETRY_VERSION = '2.1.310 (Claude Code)';
export interface ClaudeSourcePolicyFacts {
  readonly managedSettingsPath: '/etc/claude-code/managed-settings.json';
  readonly noManagedOrganization: true;
  readonly enabledPlugins: 0;
  readonly pluginHooks: 0;
}

/** Native debug-file grammar observed on the pinned installed CLI. Never parse
 * model output or accept a substring embedded in a native message as a fact.
 * The host must separately establish file safety, invocation identity and that
 * the reported missing managed file is actually absent (not a broken symlink).
 */
export function readClaudeSourcePolicyDiagnostics(text: string, binaryVersion: string): ClaudeSourcePolicyFacts | undefined {
  if (binaryVersion !== CLAUDE_POLICY_TELEMETRY_VERSION || Buffer.byteLength(text) > PROBE_OBSERVATION_BYTES) return;
  const messages: string[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const match = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \[(?:DEBUG|INFO|WARN|ERROR)\] (.*)$/.exec(line);
    if (!match) return; // truncated/unknown multiline diagnostics are not proof.
    messages.push(match[1]!);
  }
  const unique = (pattern: RegExp) => messages.filter(m => pattern.test(m));
  const pluginCounts = unique(/^Found \d+ plugins \(\d+ enabled, \d+ disabled\)$/);
  const counts = pluginCounts.length === 1 ? /^Found (\d+) plugins \((\d+) enabled, (\d+) disabled\)$/.exec(pluginCounts[0]!) : null;
  if (!counts || Number(counts[1]) !== Number(counts[2]) + Number(counts[3])) return;
  if (unique(/^Found \d+ plugins \(\d+ enabled, \d+ disabled\)$/).length !== 1 ||
    unique(/^Found \d+ plugins \(0 enabled, \d+ disabled\)$/).length !== 1 ||
    unique(/^Registered \d+ hooks from \d+ plugins$/).length !== 1 ||
    unique(/^Registered 0 hooks from 0 plugins$/).length !== 1 ||
    unique(/^Initialized versioned plugins system with \d+ plugins$/).length !== 1 ||
    unique(/^Initialized versioned plugins system with 0 plugins$/).length !== 1 ||
    unique(/^cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization \((?:max|pro|free)\)$/).length !== 1 ||
    unique(/^Broken symlink or missing file encountered for settings.json at path: \/etc\/claude-code\/managed-settings.json$/).length !== 1) return;
  // A second policy report or later conflicting load cannot be hidden by an
  // earlier no-managed line. Unsupported organizations/source grammars refuse.
  if (messages.some(m => /(?:loaded|loading|applied|fetched) managed (?:settings|policy)|managed settings (?:loaded|applied)|cc-plugin-sec-default@builtin (?:seated|loaded)/i.test(m))) return;
  return { managedSettingsPath: '/etc/claude-code/managed-settings.json', noManagedOrganization: true, enabledPlugins: 0, pluginHooks: 0 };
}
