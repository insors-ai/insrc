/**
 * Story E20260921ad0d45c9:S003 / t2 — createHostAdapter + createHostRegistry
 * (sc5) over the shared reversible writers + injectable HostEnv/HostFileSystem.
 *
 * A HostSpec becomes an AiHostAdapter here: detectPresent() runs spec.detect over
 * the injected HostEnv (never throws); wire() composes the local-stdio mcp entry
 * and writes it via McpConfigWriter AND writes the tracked-workflow steering via
 * SteeringWriter; unwire() removes exactly both. A new host = one HostSpec (ac3).
 * Mirrors the JetBrains createHostAdapter/registry composition.
 */
import type { HostFileSystem } from './fs.js';
import { composeMcpEntry, createMcpConfigWriter } from './mcp-writer.js';
import {
  STEERING_MARKER_START,
  STEERING_MARKER_END,
  createSteeringWriter,
} from './steering-writer.js';
import { defaultSteeringBody } from './steering-body.js';
import type { AiHostAdapter, AiHostRegistry, HostEnv, HostSpec } from './types.js';

export interface HostAdapterDeps {
  /** The editor-environment seam detection reads. */
  env: HostEnv;
  /** The host-owned-file seam the writers use. */
  fs: HostFileSystem;
  /** Resolver for the built insrc-mcp stdio entry (~/.insrc/daemon/out/bin/insrc-mcp.js), or undefined. */
  launchTarget: () => string | undefined;
  /** The tracked-workflow steering body; defaults to the extension-bundled canonical block (test seam). */
  steeringBody?: () => string;
}

/** Run a detect predicate defensively: any throw ⇒ not-present (false). */
function detectSafely(spec: HostSpec, env: HostEnv): boolean {
  try {
    return spec.detect(env);
  } catch {
    return false;
  }
}

/**
 * Build an sc5 adapter from a data-only HostSpec. wire()/unwire() delegate to the
 * shared writers over deps.fs; detectPresent() runs spec.detect over deps.env.
 */
export function createHostAdapter(spec: HostSpec, deps: HostAdapterDeps): AiHostAdapter {
  const mcp = createMcpConfigWriter(deps.fs);
  const steering = createSteeringWriter(deps.fs);
  const steeringBody = deps.steeringBody ?? defaultSteeringBody;

  const block = (): { beginMarker: string; endMarker: string; body: string } => ({
    beginMarker: STEERING_MARKER_START,
    endMarker: STEERING_MARKER_END,
    body: steeringBody(),
  });

  return {
    descriptor: spec.descriptor,

    async detectPresent(): Promise<boolean> {
      return detectSafely(spec, deps.env);
    },

    async wire(): Promise<void> {
      const { mcpConfigPath, steeringPath } = spec.resolveConfig();
      // mcp registration — skipped (steering-only) when the launch target is absent (k2).
      const entry = composeMcpEntry(deps.launchTarget());
      if (entry !== undefined) {
        mcp.writeInsrcServer(mcpConfigPath, entry);
      }
      // tracked-workflow steering — always written (ships with the extension).
      steering.upsert(steeringPath, block());
    },

    async unwire(): Promise<void> {
      const { mcpConfigPath, steeringPath } = spec.resolveConfig();
      mcp.removeInsrcServer(mcpConfigPath);
      steering.remove(steeringPath);
    },
  };
}

/**
 * Build the sc5 registry from the static HostSpec list. adapters() returns the
 * full pluggable set; detectPresent() returns only the present subset, omitting
 * any adapter whose detection throws (never-throws).
 */
export function createHostRegistry(specs: readonly HostSpec[], deps: HostAdapterDeps): AiHostRegistry {
  const built = specs.map((spec) => createHostAdapter(spec, deps));

  return {
    adapters(): readonly AiHostAdapter[] {
      return built;
    },
    async detectPresent(): Promise<readonly AiHostAdapter[]> {
      const present: AiHostAdapter[] = [];
      for (const adapter of built) {
        // detectPresent already never-throws, but guard the whole probe defensively.
        try {
          if (await adapter.detectPresent()) present.push(adapter);
        } catch {
          /* omit a host whose probe failed unexpectedly */
        }
      }
      return present;
    },
  };
}
