/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Static qualification table for `ReadOnlySessionOpts.capabilityPolicy ===
 * 'strict-read-analyze'` (Epic add-dedicated-security-reviews, s3 amendment).
 *
 * A provider is qualified only when it already enforces a real, declarative
 * restriction on which tools a read-only session may call -- not merely a
 * sandbox/network flag. This is a hardcoded today-only allow/deny list, not a
 * live capability probe: qualifying a currently-unqualified provider by
 * investigating its native-tool-disable flags and verifying them with real
 * behavioral testing, tied to CLI version + effective config and requalified
 * on upgrade, is explicitly deferred future work.
 *
 *   - 'claude' -- qualified. `claudeReadOnlySessionArgs` (cli-provider.ts)
 *     builds a real `--tools`/`--allowedTools` declarative allowlist that
 *     restricts claude's native built-in tools.
 *   - 'codex'  -- NOT qualified. `codexReadOnlySessionArgs` (cli-provider.ts)
 *     only sets `--sandbox read-only` plus per-MCP-server enable/disable; no
 *     flag restricts codex's native built-in tools (shell exec, patch, etc).
 *   - 'vibe'   -- NOT qualified. Its read-only dispatch (`readOnlySessionOnce`)
 *     restricts only which MCP tools are enabled (`--enabled-tools`); it sets
 *     no equivalent restriction on native built-in tools.
 *   - 'ollama' -- qualified. `OllamaProvider.runReadOnlySession` runs its tool
 *     loop with `allow: new Set(READ_ONLY_TOOL_IDS)` (ollama.ts), a real
 *     declarative allowlist structurally equivalent to claude's.
 */
export type CapabilityQualifiedProvider = 'claude' | 'codex' | 'vibe' | 'ollama';

const QUALIFIED_FOR_STRICT_READ_ANALYZE: ReadonlySet<CapabilityQualifiedProvider> = new Set(['claude', 'ollama']);

export function isQualifiedForCapabilityPolicy(
	provider: CapabilityQualifiedProvider,
	policy: 'write-sandboxed' | 'strict-read-analyze',
): boolean {
	if (policy === 'write-sandboxed') return true;
	return QUALIFIED_FOR_STRICT_READ_ANALYZE.has(provider);
}
