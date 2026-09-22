/**
 * Story E20260921ad0d45c9:S003 / t2 — the data-only HostSpec starter list (sc5).
 *
 * Each entry is pure data + two small pure fns (detect predicate, config-path
 * resolver); the shared createHostAdapter factory turns it into an AiHostAdapter.
 * Adding a host = adding ONE entry here — no existing adapter changes (ac3). The
 * v1 starter set exercises BOTH detection kinds (by-extension-id, by-editor-env);
 * each resolveConfig is isolated so an evolving config location is a one-line fix.
 *
 * The wired files are HOME-level, host-owned config the writers can safely
 * key-merge / marker-upsert: the JSON mcp registry (mcpServers.insrc) and the
 * Markdown guidance file the agent reads. No workspace root is needed (and none
 * is injected), keeping the seam narrow.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { HostDetection, HostEnv, HostSpec } from './types.js';

/** Shared detection over the injected HostEnv — reused by every spec (ac3, no per-host detection code). */
export function matchesDetection(detection: HostDetection, env: HostEnv): boolean {
  if (detection.kind === 'by-extension-id') {
    return env.getExtension(detection.extensionId);
  }
  // by-editor-env: match on appName and/or uriScheme (whichever the descriptor pins).
  if (detection.appName !== undefined && env.appName === detection.appName) return true;
  if (detection.uriScheme !== undefined && env.uriScheme === detection.uriScheme) return true;
  return false;
}

/** Build a HostSpec from its descriptor + a home-relative config-path resolver. */
function spec(
  descriptor: HostSpec['descriptor'],
  paths: { mcp: readonly string[]; steering: readonly string[] },
): HostSpec {
  return {
    descriptor,
    detect: (env) => matchesDetection(descriptor.detection, env),
    resolveConfig: () => ({
      mcpConfigPath: join(homedir(), ...paths.mcp),
      steeringPath: join(homedir(), ...paths.steering),
    }),
  };
}

/**
 * The v1 supported-host starter set. Deliberately small; extended by appending a
 * `spec(...)` entry.
 */
export const HOST_SPECS: readonly HostSpec[] = [
  // Detected by its VS Code extension id; wires Claude Code's home MCP registry +
  // user-global guidance memory.
  spec(
    {
      id: 'anthropic.claude-code',
      displayName: 'Claude Code',
      detection: { kind: 'by-extension-id', extensionId: 'anthropic.claude-code' },
    },
    { mcp: ['.claude.json'], steering: ['.claude', 'CLAUDE.md'] },
  ),
  // Detected by the running editor (a Cursor build); wires Cursor's home MCP
  // config + a home-level insrc rules file.
  spec(
    {
      id: 'cursor',
      displayName: 'Cursor',
      detection: { kind: 'by-editor-env', appName: 'Cursor', uriScheme: 'cursor' },
    },
    { mcp: ['.cursor', 'mcp.json'], steering: ['.cursor', 'rules', 'insrc.md'] },
  ),
];
