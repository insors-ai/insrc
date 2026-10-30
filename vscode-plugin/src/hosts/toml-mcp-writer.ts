/**
 * The reversible TOML mcp-config writer for hosts whose MCP registry is a TOML
 * array-of-tables — vibe's `~/.vibe/config.toml` (`[[mcp_servers]]`), the format
 * `vibe mcp add insrc --transport stdio --command node --arg <js>` writes.
 *
 * Same sc5 contract as the JSON McpConfigWriter (writeInsrcServer /
 * removeInsrcServer over HostFileSystem), same never-clobber discipline, but
 * line-based: a TOML table header line opens a section, and the insrc entry is
 * the `[[mcp_servers]]` section whose body carries `name = "insrc"`. Writing
 * replaces exactly that section's body (header line kept verbatim, other keys
 * in the section dropped — the section IS insrc's entry); removal drops the
 * section and any `[mcp_servers.<sub>]` tables that belong to it. Everything
 * else in the file — preamble, other tables, comments — is preserved verbatim.
 * Duplicate insrc sections are ambiguous and throw (never guess), mirroring the
 * steering writer's duplicate-marker guard.
 */
import { HostFileAccessError, type HostFileSystem } from './fs.js';
import { SERVER_KEY, type McpConfigWriter } from './mcp-writer.js';

/** A TOML table header line: `[a.b]` or `[[a.b]]`, optional trailing comment. */
const HEADER_RE = /^\s*(\[\[|\[)\s*([A-Za-z0-9_.-]+)\s*(\]\]|\])\s*(?:#.*)?$/;

/** A `name = "insrc"` (or 'insrc') line, optional trailing comment. */
const nameLineRe = (name: string): RegExp =>
  new RegExp(`^\\s*name\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s*(?:#.*)?$`);

/** One parsed section: its header line index and its span in the line array. */
interface TomlSection {
  readonly dotted: string;
  readonly isArray: boolean;
  /** Index of the header line. */
  readonly headerIndex: number;
  /** Index one past the section's last line (header + body); grows as body lines are added. */
  endIndex: number;
  readonly body: string[];
}

/** Escape a string into a TOML basic string (double-quoted). */
const tomlString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** The canonical entry body lines for the composed stdio entry ({command, args}). */
function entryBodyLines(serverEntry: object): string[] {
  const e = serverEntry as Record<string, unknown>;
  const command = typeof e['command'] === 'string' ? (e['command'] as string) : 'node';
  const args = Array.isArray(e['args']) ? e['args'].filter((a): a is string => typeof a === 'string') : [];
  return [
    `name = ${tomlString(SERVER_KEY)}`,
    'transport = "stdio"',
    `command = ${tomlString(command)}`,
    `args = [${args.map(tomlString).join(', ')}]`,
  ];
}

/** Split the file into lines and parse the top-level sections with their spans. */
function parseSections(lines: string[]): TomlSection[] {
  const sections: TomlSection[] = [];
  let current: TomlSection | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADER_RE.exec(lines[i]!);
    if (m !== null) {
      current = { dotted: m[2]!, isArray: m[1] === '[[', headerIndex: i, endIndex: i + 1, body: [] };
      sections.push(current);
    } else if (current !== undefined) {
      current.body.push(lines[i]!);
      current.endIndex = i + 1;
    }
    // Lines before the first header (preamble) belong to no section.
  }
  return sections;
}

/** The `[[mcp_servers]]` sections whose body names the insrc server. */
function insrcSections(sections: readonly TomlSection[]): TomlSection[] {
  const nameRe = nameLineRe(SERVER_KEY);
  return sections.filter((s) => s.isArray && s.dotted === 'mcp_servers' && s.body.some((l) => nameRe.test(l)));
}

/** Split file text into real lines (dropping only the artifact of a final newline). */
function toLines(text: string): { lines: string[]; trailing: boolean } {
  const lines = text.split('\n');
  if (lines.at(-1) === '') return { lines: lines.slice(0, -1), trailing: true };
  return { lines, trailing: false };
}

/** Build the reversible TOML mcp-config writer over the injected HostFileSystem. */
export function createTomlMcpConfigWriter(fs: HostFileSystem): McpConfigWriter {
  const readOrThrow = (path: string): string | undefined => {
    try {
      return fs.read(path);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot read host mcp config ${path}`, { cause: err });
    }
  };
  const writeOrThrow = (path: string, content: string): void => {
    try {
      fs.write(path, content);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot write host mcp config ${path}`, { cause: err });
    }
  };

  return {
    writeInsrcServer(mcpConfigPath, serverEntry): void {
      const existing = readOrThrow(mcpConfigPath);
      const body = entryBodyLines(serverEntry);
      if (existing === undefined || existing.trim() === '') {
        writeOrThrow(mcpConfigPath, `[[mcp_servers]]\n${body.join('\n')}\n`);
        return;
      }
      const { lines } = toLines(existing);
      const matches = insrcSections(parseSections(lines));
      if (matches.length > 1) {
        throw new HostFileAccessError(`insrc: host mcp config has ${matches.length} '${SERVER_KEY}' [[mcp_servers]] sections; refusing to guess: ${mcpConfigPath}`);
      }
      let next: string[];
      if (matches.length === 1) {
        const s = matches[0]!;
        // Replace exactly the section's header+body; the header line stays verbatim.
        next = [...lines.slice(0, s.headerIndex), lines[s.headerIndex]!, ...body, ...lines.slice(s.endIndex)];
      } else {
        // No insrc section: append one, blank-line separated when the file has content.
        const last = lines.at(-1);
        const needsBlank = lines.length > 0 && last !== '' && last !== undefined;
        next = [...lines, ...(needsBlank ? [''] : []), '[[mcp_servers]]', ...body];
      }
      const content = `${next.join('\n')}\n`;
      if (content === existing) return; // idempotent — nothing changed
      writeOrThrow(mcpConfigPath, content);
    },

    removeInsrcServer(mcpConfigPath): void {
      const existing = readOrThrow(mcpConfigPath);
      if (existing === undefined || existing.trim() === '') return; // absent/empty → no-op
      const { lines } = toLines(existing);
      const sections = parseSections(lines);
      const matches = insrcSections(sections);
      if (matches.length === 0) return; // not present → no-op
      if (matches.length > 1) {
        throw new HostFileAccessError(`insrc: host mcp config has ${matches.length} '${SERVER_KEY}' [[mcp_servers]] sections; refusing to guess: ${mcpConfigPath}`);
      }
      const s = matches[0]!;
      // The section's own span, plus any `[mcp_servers.<sub>]` tables directly after
      // it (they belong to the last [[mcp_servers]] entry — ours).
      let end = s.endIndex;
      const rest = sections.filter((x) => x.headerIndex >= end);
      for (const x of rest) {
        if (x.dotted.startsWith('mcp_servers.')) end = x.endIndex;
        else break;
      }
      let next = [...lines.slice(0, s.headerIndex), ...lines.slice(end)];
      // Collapse the doubled blank line the append path leaves at the splice.
      const at = s.headerIndex;
      if (next[at] === '' && next[at - 1] === '') next = [...next.slice(0, at), ...next.slice(at + 1)];
      const content = `${next.join('\n')}\n`;
      if (content === existing) return;
      writeOrThrow(mcpConfigPath, content);
    },
  };
}
