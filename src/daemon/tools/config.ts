/**
 * Tool settings snapshot.
 *
 * The IDE pushes its `insrc.tools.*` settings to the daemon on
 * connect and on change via the `tools.config.set` RPC. Tools and
 * the LLM tool-loop read the current snapshot through
 * `getToolSettings()`. Defaults here match the defaults declared in
 * src/vs/workbench/contrib/insrc/common/insrcConfiguration.ts so the
 * daemon behaves identically when started outside the IDE (scripts,
 * tests, headless CLI).
 *
 * The historical `enabledCategories` / `enabledSkillFamilies`
 * whitelists were dropped: per-action permission gates (approval,
 * fs-access, cross-agent depth) already gate authorisation, so
 * double-gating at registry lookup time was unnecessary overhead
 * and a recurring source of "tool registered but invisible" silent
 * failures.
 */

import { getLogger } from '../../shared/logger.js';

const log = getLogger('tools-config');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolSettings {
  approval: {
    defaultAction: 'approve' | 'skip';
    maxEditRounds: number;
    showStructuredDiff: boolean;
  };
  loop: {
    maxIterations: number;
    maxNudges: number;
  };
  output: {
    inlineMaxChars: number;
    retainSpills: boolean;
  };
  shell: {
    defaultTimeoutMs: number;
    detachedMaxRuntimeMs: number;
  };
  web: {
    braveApiKeySource: 'env' | 'keychain';
  };
  destructive: {
    requireDoubleConfirm: boolean;
  };
  /**
   * Keychain account names (strings). The actual secret (webhook
   * URL, SMTP password) lives in the OS keychain under the insrc
   * service. Tools look it up via shared/keystore.getKey(ref) when a
   * per-call argument isn't supplied.
   */
  notify: {
    slack:   { defaultWebhookRef: string };
    teams:   { defaultWebhookRef: string };
    discord: { defaultWebhookRef: string };
    email:   {
      smtpHost:    string;
      smtpPort:    number;
      smtpUserRef: string;
      smtpPassRef: string;
      fromAddress: string;
    };
  };
}

function defaults(): ToolSettings {
  return {
    approval:    { defaultAction: 'skip', maxEditRounds: 5, showStructuredDiff: true },
    loop:        { maxIterations: 25, maxNudges: 3 },
    output:      { inlineMaxChars: 12_000, retainSpills: false },
    shell:       { defaultTimeoutMs: 120_000, detachedMaxRuntimeMs: 30 * 60_000 },
    web:         { braveApiKeySource: 'env' },
    destructive: { requireDoubleConfirm: false },
    notify: {
      slack:   { defaultWebhookRef: '' },
      teams:   { defaultWebhookRef: '' },
      discord: { defaultWebhookRef: '' },
      email:   { smtpHost: '', smtpPort: 587, smtpUserRef: '', smtpPassRef: '', fromAddress: '' },
    },
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let current: ToolSettings = defaults();

/** Return the current tool settings snapshot. Never throws. */
export function getToolSettings(): ToolSettings {
  return current;
}

/**
 * Merge a partial settings update into the current snapshot. Values
 * not present in the update keep their previous value (which may be a
 * default). Typed loosely because the RPC payload is `unknown`; we
 * coerce per-field.
 */
export function updateToolSettings(incoming: Record<string, unknown>): ToolSettings {
  const next: ToolSettings = {
    approval: {
      defaultAction:     parseEnum(incoming['approval.defaultAction'],     ['approve', 'skip'], current.approval.defaultAction),
      maxEditRounds:     parseNumber(incoming['approval.maxEditRounds'],   current.approval.maxEditRounds, 1, 20),
      showStructuredDiff: parseBool(incoming['approval.showStructuredDiff'], current.approval.showStructuredDiff),
    },
    loop: {
      maxIterations: parseNumber(incoming['loop.maxIterations'], current.loop.maxIterations, 1, 200),
      maxNudges:     parseNumber(incoming['loop.maxNudges'],     current.loop.maxNudges, 0, 10),
    },
    output: {
      inlineMaxChars: parseNumber(incoming['output.inlineMaxChars'], current.output.inlineMaxChars, 1024, 1_000_000),
      retainSpills:   parseBool(incoming['output.retainSpills'],     current.output.retainSpills),
    },
    shell: {
      defaultTimeoutMs:     parseNumber(incoming['shell.defaultTimeoutMs'],     current.shell.defaultTimeoutMs, 1000, Number.MAX_SAFE_INTEGER),
      detachedMaxRuntimeMs: parseNumber(incoming['shell.detachedMaxRuntimeMs'], current.shell.detachedMaxRuntimeMs, 1000, Number.MAX_SAFE_INTEGER),
    },
    web: {
      braveApiKeySource: parseEnum(incoming['web.braveApiKeySource'], ['env', 'keychain'], current.web.braveApiKeySource),
    },
    destructive: {
      requireDoubleConfirm: parseBool(incoming['destructive.requireDoubleConfirm'], current.destructive.requireDoubleConfirm),
    },
    notify: {
      slack:   { defaultWebhookRef: parseString(incoming['notify.slack.defaultWebhookRef'],   current.notify.slack.defaultWebhookRef) },
      teams:   { defaultWebhookRef: parseString(incoming['notify.teams.defaultWebhookRef'],   current.notify.teams.defaultWebhookRef) },
      discord: { defaultWebhookRef: parseString(incoming['notify.discord.defaultWebhookRef'], current.notify.discord.defaultWebhookRef) },
      email:   {
        smtpHost:    parseString(incoming['notify.email.smtpHost'],    current.notify.email.smtpHost),
        smtpPort:    parseNumber(incoming['notify.email.smtpPort'],    current.notify.email.smtpPort, 1, 65535),
        smtpUserRef: parseString(incoming['notify.email.smtpUserRef'], current.notify.email.smtpUserRef),
        smtpPassRef: parseString(incoming['notify.email.smtpPassRef'], current.notify.email.smtpPassRef),
        fromAddress: parseString(incoming['notify.email.fromAddress'], current.notify.email.fromAddress),
      },
    },
  };
  current = next;
  log.info({
    maxIterations: next.loop.maxIterations,
    defaultApproval: next.approval.defaultAction,
  }, 'tool settings updated');
  return next;
}

/** Reset to defaults. Used by tests. */
export function resetToolSettings(): void {
  current = defaults();
}

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

function parseBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseNumber(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function parseEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function parseString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
