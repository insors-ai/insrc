/**
 * Story E20260921ad0d45c9:S003 / t2 — the sc5 AiHostAdapter contract + its
 * injectable HostEnv seam + the data-only HostSpec shape.
 *
 * sc5 is internal-shared: s5 consumes AiHostRegistry for the uninstall unwire
 * sweep; s3 owns the adapter/registry impl. A new host plugs in by adding one
 * HostSpec — no existing adapter changes (ac3). Mirrors the JetBrains
 * AiHostAdapter / AiHost / AiHostKind split, but data-driven rather than enum.
 */

/** How a host's presence is determined. */
export type HostDetection =
  /** Present iff an extension with `extensionId` is installed+enabled (HostEnv.getExtension). */
  | { readonly kind: 'by-extension-id'; readonly extensionId: string }
  /** Present iff the running editor matches `appName` and/or `uriScheme` (HostEnv). */
  | { readonly kind: 'by-editor-env'; readonly appName?: string; readonly uriScheme?: string };

/** A supported AI host's identity + how it is detected (sc5). */
export interface HostDescriptor {
  /** Stable machine id (e.g. 'github.copilot'). */
  readonly id: string;
  /** Human-facing name shown in the combined consent prompt. */
  readonly displayName: string;
  /** The detection strategy. */
  readonly detection: HostDetection;
}

/** The injected editor-environment slice detection reads (VS Code's extensions/env). */
export interface HostEnv {
  /** Whether an extension with `id` is installed + enabled. */
  getExtension(id: string): boolean;
  /** The running editor's product name (VS Code's `env.appName`, e.g. 'Visual Studio Code'). */
  readonly appName: string;
  /** The running editor's uri scheme (VS Code's `env.uriScheme`, e.g. 'vscode'). */
  readonly uriScheme: string;
}

/**
 * The data-only per-host unit turned into an AiHostAdapter by createHostAdapter.
 * Its `detect` predicate + `resolveConfig` path locations are the ONLY host-
 * specific code; everything else is the shared factory (ac3).
 */
export interface HostSpec {
  readonly descriptor: HostDescriptor;
  /** Presence predicate over the injected HostEnv. Never throws (indeterminate ⇒ false). */
  detect(env: HostEnv): boolean;
  /** The host's own config file locations (private per-host, isolated for one-line path fixes). */
  resolveConfig(): { readonly mcpConfigPath: string; readonly steeringPath: string };
}

/** sc5: an abstraction over one supported AI host — detection + reversible wire/unwire. */
export interface AiHostAdapter {
  /** The host this adapter wires. */
  readonly descriptor: HostDescriptor;
  /** True iff this host is present per its descriptor.detection. Never throws (indeterminate ⇒ false). */
  detectPresent(): Promise<boolean>;
  /** Write BOTH mcpServers.insrc + the steering marker block, reversibly (k4). */
  wire(): Promise<void>;
  /** Remove EXACTLY the mcpServers.insrc key + the steering block, restoring prior content. */
  unwire(): Promise<void>;
}

/** sc5: the pluggable set of host adapters. */
export interface AiHostRegistry {
  /** Every registered adapter (one per HostSpec), regardless of presence. */
  adapters(): readonly AiHostAdapter[];
  /** The subset whose detectPresent() resolved true; a throwing detection is omitted. */
  detectPresent(): Promise<readonly AiHostAdapter[]>;
}
