/**
 * The VS-Code-free model-tier picker behind 'insrc: Set model tier' (Story
 * E20260923ba132c18:S003; on the daemon's model definitions since Epic
 * ce99b72065d03b1b, Story s6).
 *
 * A guided tier → family → model → effort flow whose every option comes from the
 * daemon's `models.definitions` answer: the extension keeps no family, model or
 * effort list of its own. The tier's current value is config.show's
 * models.tiers.<tier>, or the definitions' default for the tier. The choice is
 * written ONCE as the whole tier ({ runner, model, effort } at
 * ['models','tiers',tier]), so a runner is never saved without a model of its
 * family. The daemon's refusal reason and detail, and a 'restart to apply', are
 * shown; a restart is offered through the injected restartDaemon seam.
 *
 * Everything is injected via {@link SetModelTierDeps}, so the whole flow is
 * unit-testable over fakes WITHOUT vscode; extension.ts binds the real seams.
 * Never throws — every failure surfaces via `notify` and writes nothing.
 */

import type { ConfigWriteResult } from '../config/types.js';
import {
  classifyDaemonFailure,
  familyDefault,
  familyOf,
  type DefinedFamily,
  type DefinedModel,
  type ModelDefinitions,
} from './definitions.js';

/** The minimal QuickPick item contract the injected `pick` seam consumes (a subset
 *  of vscode.QuickPickItem, so the real showQuickPick satisfies it). */
export interface QuickPickItemLike {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

/** The injected VS-Code-free seams (bound in extension.ts). */
export interface SetModelTierDeps {
  /** The daemon's model definitions (models.definitions). */
  definitions(): Promise<ModelDefinitions>;
  /** The raw config (config.show), for the tier's current value. */
  rawConfig(): Promise<Record<string, unknown>>;
  /** config.write at literal segments; writes ['models','tiers',tier] with the whole tier. */
  writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>;
  /** Restart the daemon; resolves true only when it is running again (restartDaemonAndReport). */
  restartDaemon(): Promise<boolean>;
  /** Present a single-select dropdown (default vscode.window.showQuickPick). */
  pick<T extends QuickPickItemLike>(items: readonly T[], opts: { placeHolder: string }): Promise<T | undefined>;
  /** Show a message with optional action buttons; resolves the chosen action. */
  notify(message: string, ...actions: string[]): Promise<string | undefined>;
}

/** A tier as config.json holds it. */
interface TierValue {
  readonly runner: string;
  readonly model: string;
  readonly effort: string;
}

/** The three global tiers, in the canonical order. */
const TIERS = ['core', 'mid', 'cheap'] as const;
type Tier = (typeof TIERS)[number];

/** A short human hint per tier. */
const TIER_HINT: Record<Tier, string> = {
  core: 'critical roles (design / review / build / validate)',
  mid: 'default working tier',
  cheap: 'peripheral roles (classification / summaries)',
};

const RESTART = 'Restart daemon';

/** The QuickPick item the flow drives; `kind` names its role. */
interface PickItem extends QuickPickItemLike {
  readonly kind: 'tier' | 'family' | 'model' | 'refresh' | 'current-not-listed' | 'no-models' | 'effort';
  readonly value?: string;
}

/**
 * Run the 'insrc: Set model tier' flow. Never throws; a cancel at any step is a
 * clean no-op; every failure path leaves the saved tier untouched.
 */
export async function runSetModelTier(deps: SetModelTierDeps): Promise<void> {
  try {
    await runSetModelTierInner(deps);
  } catch {
    await deps.notify('insrc: the model-tier picker hit an unexpected error — nothing was changed.');
  }
}

/** The tier config.json holds, or undefined when it is unset or malformed. */
function configuredTier(raw: Record<string, unknown>, tier: Tier): TierValue | undefined {
  const models = raw['models'];
  const tiers = typeof models === 'object' && models !== null ? (models as Record<string, unknown>)['tiers'] : undefined;
  const value = typeof tiers === 'object' && tiers !== null ? (tiers as Record<string, unknown>)[tier] : undefined;
  if (typeof value !== 'object' || value === null) return undefined;
  const { runner, model, effort } = value as Record<string, unknown>;
  if (typeof runner !== 'string' || typeof model !== 'string') return undefined;
  return { runner, model, effort: typeof effort === 'string' ? effort : '' };
}

/** What a failed request means for this flow, as one message. */
function failureMessage(err: unknown, what: string): string {
  const failure = classifyDaemonFailure(err);
  switch (failure.kind) {
    case 'not-running': return `insrc: the daemon is not running — start it to set model tiers.`;
    case 'disconnected': return `insrc: ${failure.text} — try again.`;
    case 'older-daemon': return `insrc: ${failure.text}.`;
    default: return `insrc: could not ${what}: ${failure.text}`;
  }
}

async function runSetModelTierInner(deps: SetModelTierDeps): Promise<void> {
  // 1) Pick a tier.
  const tier = await pickTier(deps);
  if (tier === undefined) return;

  // 2) The definitions and the tier's current value.
  let defs: ModelDefinitions;
  let raw: Record<string, unknown>;
  try {
    defs = await deps.definitions();
    raw = await deps.rawConfig();
  } catch (err) {
    await deps.notify(failureMessage(err, 'read the model definitions'));
    return;
  }
  const configured = configuredTier(raw, tier);
  const defaultFamily = familyOf(defs, defs.defaultFamily);
  const fallback = defaultFamily !== undefined ? familyDefault(defaultFamily, tier) : undefined;
  const current: TierValue | undefined = configured
    ?? (defaultFamily !== undefined && fallback !== undefined ? { runner: defaultFamily.id, model: fallback.model.id, effort: fallback.effort } : undefined);

  // 3) Pick the family (current marked).
  const family = await pickFamily(deps, defs, current?.runner);
  if (family === undefined) return;
  const sameFamily = family.id === current?.runner;

  // 4) Pick a model of that family (re-reading the definitions on Refresh).
  let models = family.models;
  for (;;) {
    if (models.length === 0) {
      const again = await pickEmpty(deps, family);
      if (!again) return;
      try {
        models = familyOf(await deps.definitions(), family.id)?.models ?? [];
      } catch (err) {
        await deps.notify(failureMessage(err, 'read the model definitions'));
        return;
      }
      continue;
    }
    const chosen = await pickModel(deps, family, models, sameFamily ? current?.model : undefined);
    if (chosen === undefined) return;
    if (chosen.kind === 'refresh') {
      try {
        models = familyOf(await deps.definitions(), family.id)?.models ?? [];
      } catch (err) {
        await deps.notify(failureMessage(err, 'read the model definitions'));
        return;
      }
      continue;
    }
    if (chosen.kind !== 'model' || chosen.value === undefined) return; // a notice row — no-op.
    const model = models.find((m) => m.id === chosen.value);
    if (model === undefined) return;

    // 5) Pick the effort ('' = the CLI's default) from the model's own levels.
    const keepEffort = sameFamily && current?.model === model.id ? current.effort : '';
    const effort = await pickEffort(deps, tier, model, keepEffort);
    if (effort === undefined) return;

    // 6) One whole-tier write.
    await saveTier(deps, tier, { runner: family.id, model: model.id, effort }, current);
    return;
  }
}

/** Write the whole tier and report the outcome (refusal, restartRequired, unknown outcome). */
export async function saveTier(deps: Pick<SetModelTierDeps, 'writeKeyPath' | 'notify' | 'restartDaemon'>, tier: string, next: TierValue, current?: TierValue | undefined): Promise<boolean> {
  if (current !== undefined && current.runner === next.runner && current.model === next.model && current.effort === next.effort) {
    await deps.notify(`insrc: the ${tier} tier is unchanged (${describe(next)}).`);
    return true;
  }
  let result: ConfigWriteResult;
  try {
    result = await deps.writeKeyPath(['models', 'tiers', tier], next);
  } catch (err) {
    const failure = classifyDaemonFailure(err);
    await deps.notify(failure.kind === 'disconnected'
      ? `insrc: the outcome is unknown — ${failure.text}; reopen the picker to see the current ${tier} tier.`
      : failureMessage(err, `save the ${tier} tier`));
    return false;
  }
  if (!result.ok) {
    await deps.notify(`insrc: the ${tier} tier was not saved: ${result.reason}${result.detail !== undefined ? ` — ${result.detail}` : ''}.`);
    return false;
  }
  if (result.restartRequired === true) {
    const choice = await deps.notify(`insrc: ${tier} tier set to ${describe(next)} — restart the daemon to apply.`, RESTART);
    if (choice === RESTART && !(await deps.restartDaemon())) await deps.notify('insrc: the daemon did not restart — the change applies at the next restart.');
  } else {
    await deps.notify(`insrc: ${tier} tier set to ${describe(next)}.`);
  }
  return true;
}

/** A tier as one line: model (family), with its effort when set. */
function describe(t: TierValue): string {
  return `${t.model} (${t.runner}${t.effort !== '' ? `, effort ${t.effort}` : ''})`;
}

/** Step 1 — the tier dropdown. */
async function pickTier(deps: SetModelTierDeps): Promise<Tier | undefined> {
  const items: PickItem[] = TIERS.map((t) => ({ label: t, description: TIER_HINT[t], kind: 'tier', value: t }));
  const picked = await deps.pick(items, { placeHolder: 'Select the model tier to configure' });
  return picked === undefined ? undefined : (picked.value as Tier);
}

/** Step 3 — the family dropdown: the answer's families, current marked. */
async function pickFamily(deps: SetModelTierDeps, defs: ModelDefinitions, current: string | undefined): Promise<DefinedFamily | undefined> {
  const items: PickItem[] = defs.families.map((f) => ({
    label: f.displayName,
    description: f.id === current ? `${f.id} (current)` : f.id,
    kind: 'family',
    value: f.id,
  }));
  const picked = await deps.pick(items, { placeHolder: 'Select the model family for this tier' });
  return picked === undefined ? undefined : familyOf(defs, picked.value ?? '');
}

/** The empty dropdown: a notice + a Refresh. True iff Refresh was chosen. */
async function pickEmpty(deps: SetModelTierDeps, family: DefinedFamily): Promise<boolean> {
  const items: PickItem[] = [
    { label: 'No models available', description: family.displayName, kind: 'no-models' },
    { label: '$(refresh) Refresh', kind: 'refresh' },
  ];
  const picked = await deps.pick(items, { placeHolder: 'No models available — Refresh to retry' });
  return picked?.kind === 'refresh';
}

/** The marks after a model's id: its aliases, user-approved, not installed, current. */
function modelDescription(m: DefinedModel, isCurrent: boolean): string | undefined {
  const marks = [
    ...(m.aliases.length > 0 ? [`alias ${m.aliases.join(', ')}`] : []),
    ...(m.source === 'user-approved' ? ['(user-approved)'] : []),
    ...(m.installed === false ? ['(not installed)'] : []),
    ...(isCurrent ? ['(current)'] : []),
  ];
  return marks.length > 0 ? marks.join(' ') : undefined;
}

/** Step 4 — the model dropdown over the family's models (+ a stale-current notice + Refresh). */
async function pickModel(
  deps: SetModelTierDeps,
  family: DefinedFamily,
  models: readonly DefinedModel[],
  currentModel: string | undefined,
): Promise<PickItem | undefined> {
  const items: PickItem[] = [];
  const current = currentModel !== undefined ? models.find((m) => m.id === currentModel || m.aliases.includes(currentModel)) : undefined;
  if (currentModel !== undefined && current === undefined) {
    items.push({ label: `(current, not listed — runs the default): ${currentModel}`, description: `not served by ${family.displayName}`, kind: 'current-not-listed' });
  }
  for (const m of models) {
    const desc = modelDescription(m, m === current);
    const label = m.displayName !== undefined && m.displayName.length > 0 ? m.displayName : m.id;
    items.push(desc === undefined ? { label, kind: 'model', value: m.id } : { label, description: desc, kind: 'model', value: m.id });
  }
  items.push({ label: '$(refresh) Refresh', kind: 'refresh' });
  return deps.pick(items, { placeHolder: `Select a ${family.displayName} model` });
}

/** Step 5 — the effort dropdown: '' (the CLI default) then the model's own levels; skipped when it lists none. */
async function pickEffort(deps: SetModelTierDeps, tier: Tier, model: DefinedModel, current: string): Promise<string | undefined> {
  if (model.efforts.length === 0) return '';
  const items: PickItem[] = ['', ...model.efforts].map((v) => {
    const label = v === '' ? 'CLI default' : v;
    return v === current ? { label, description: '(current)', kind: 'effort' as const, value: v } : { label, kind: 'effort' as const, value: v };
  });
  const picked = await deps.pick(items, { placeHolder: `Select the reasoning effort for the ${tier} tier` });
  return picked === undefined ? undefined : picked.value ?? '';
}

