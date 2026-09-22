/**
 * Story E20260921ad0d45c9:S003 / t1 — the reversible mcp-config writer +
 * composeMcpEntry (sc5, k2/k4).
 *
 * The mcp config is JSON, so — unlike the Markdown steering file — the insrc
 * region cannot be a text marker block (HTML comments are invalid JSON). The
 * replace anchor is instead the `mcpServers.insrc` KEY: writeInsrcServer parses
 * the existing config (or starts from `{}`), sets `mcpServers.insrc` to the
 * composed entry, and re-serialises — every OTHER key and server is preserved,
 * and re-writing the same entry is an idempotent no-op. removeInsrcServer deletes
 * only that key. The content is composed in memory and written in one call, so a
 * failure surfaces HostFileAccessError with no partial write. Mirrors the
 * JetBrains JsonMcpConfigWriter + InsrcMcpRegistration.
 */
import { HostFileAccessError, type HostFileSystem } from './fs.js';

/** The MCP server key the registration is filed under — the replace anchor (k4). */
export const SERVER_KEY = 'insrc';

/**
 * Compose the value written under `mcpServers.insrc`, or `undefined` (fail-safe
 * skip, logged by the caller) when the insrc-mcp launch target is absent.
 *
 * LOCAL stdio server only — `node <~/.insrc/daemon/out/bin/insrc-mcp.js>`, with
 * NO cloud/REST url, NO baked INSRC_REPO env, and NO --repo argv: the extension
 * opens no cloud path (k2). Mirrors InsrcMcpRegistration.composeServerEntry
 * (minus the JetBrains per-project `cwd`, which the VS Code host supplies per
 * tool-call).
 */
export function composeMcpEntry(
  launchTargetPath: string | undefined,
): { command: 'node'; args: string[] } | undefined {
  if (launchTargetPath === undefined || launchTargetPath === '') return undefined;
  return { command: 'node', args: [launchTargetPath] };
}

export interface McpConfigWriter {
  /**
   * Upsert the insrc server entry under `mcpServers.insrc`, preserving every
   * other key/server; idempotent (identical serialised content ⇒ no write).
   * @throws HostFileAccessError if the file cannot be read/written, or its
   *   existing content is not a JSON object, or `mcpServers` is present-but-
   *   non-object (fail-safe: never clobber).
   */
  writeInsrcServer(mcpConfigPath: string, serverEntry: object): void;
  /**
   * Remove the `mcpServers.insrc` entry, leaving every other key/server intact;
   * a no-op when the entry (or the file) is absent.
   * @throws HostFileAccessError if the file cannot be read/written.
   */
  removeInsrcServer(mcpConfigPath: string): void;
}

type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Build the reversible mcp-config writer over the injected HostFileSystem. */
export function createMcpConfigWriter(fs: HostFileSystem): McpConfigWriter {
  const readRoot = (path: string): { existing: string | undefined; root: JsonRecord } => {
    let existing: string | undefined;
    try {
      existing = fs.read(path);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot read host mcp config ${path}`, { cause: err });
    }
    if (existing === undefined || existing.trim() === '') {
      return { existing, root: {} };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch (err) {
      throw new HostFileAccessError(`insrc: host mcp config is not valid JSON: ${path}`, { cause: err });
    }
    if (!isPlainObject(parsed)) {
      throw new HostFileAccessError(`insrc: host mcp config is not a JSON object: ${path}`);
    }
    return { existing, root: parsed };
  };

  /** The `mcpServers` object, or `undefined` when the key is absent; throws on a present-but-non-object. */
  const mcpServersOf = (root: JsonRecord, path: string): JsonRecord | undefined => {
    if (!('mcpServers' in root)) return undefined;
    const servers = root['mcpServers'];
    if (!isPlainObject(servers)) {
      throw new HostFileAccessError(`insrc: host mcp config 'mcpServers' is not an object: ${path}`);
    }
    return servers;
  };

  const writeOrThrow = (path: string, content: string): void => {
    try {
      fs.write(path, content);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot write host mcp config ${path}`, { cause: err });
    }
  };

  /** Serialise pretty (2-space) with a trailing newline — the conventional config shape. */
  const serialise = (root: JsonRecord): string => `${JSON.stringify(root, null, 2)}\n`;

  return {
    writeInsrcServer(mcpConfigPath, serverEntry): void {
      const { existing, root } = readRoot(mcpConfigPath);
      const servers = mcpServersOf(root, mcpConfigPath) ?? {};
      servers[SERVER_KEY] = serverEntry;
      root['mcpServers'] = servers;
      const next = serialise(root);
      if (existing === next) return; // idempotent — nothing changed
      writeOrThrow(mcpConfigPath, next);
    },

    removeInsrcServer(mcpConfigPath): void {
      const { existing, root } = readRoot(mcpConfigPath);
      if (existing === undefined) return; // absent file → nothing to remove
      const servers = mcpServersOf(root, mcpConfigPath);
      if (servers === undefined || !(SERVER_KEY in servers)) return; // not present → no-op
      delete servers[SERVER_KEY];
      writeOrThrow(mcpConfigPath, serialise(root));
    },
  };
}
