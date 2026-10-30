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
 * A Claude or Codex model the family does not list is entered by id and checked by
 * the daemon (models.check): each claimed effort level's verdict and evidence is
 * shown, the user chooses the levels to allow, and models.approve records the
 * decision. Nothing is saved then — the running daemon does not yet serve the
 * model — so the tier is written only after a restart that brings the daemon back
 * (restartDaemon resolves true), and the approval is never sent twice. Ollama has
 * no such flow, nor has a CLI family that runs on a host (its `host` is set): only
 * their listed models can be used.
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
  servedModel,
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
  /** Check an unlisted CLI model through its CLI (models.check). */
  check(params: { family: string; modelId: string; claimedEfforts: readonly string[] }): Promise<ModelCheckResult | { error: string }>;
  /** Record the approval of a check's levels (models.approve). */
  approve(params: { checkId: string; efforts: readonly string[] }): Promise<DecisionResult>;
  /** Record the rejection of a checked model (models.reject). */
  reject(params: { checkId: string }): Promise<DecisionResult>;
  /** Ask for a line of text (default vscode.window.showInputBox); undefined on cancel. */
  input(opts: { prompt: string; value?: string }): Promise<string | undefined>;
  /** Present a multi-select dropdown (showQuickPick with canPickMany); undefined on cancel. */
  pickMany<T extends QuickPickItemLike>(items: readonly T[], opts: { placeHolder: string }): Promise<readonly T[] | undefined>;
}

/** The daemon's check of an unlisted model (models.check), typed structurally. */
export interface ModelCheckResult {
  readonly checkId: string;
  readonly runs: boolean;
  readonly inputLimit?: { readonly unit: string; readonly max: number } | undefined;
  readonly efforts: readonly { readonly effort: string; readonly verdict: 'accepted' | 'rejected' | 'recognised-unconfirmed'; readonly evidence: string }[];
  readonly error?: string | undefined;
}

/** The daemon's answer to models.approve / models.reject. */
export type DecisionResult =
  | { readonly ok: true; readonly restartRequired?: boolean | undefined }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/** A tier as config.json holds it. */
export interface TierValue {
  readonly runner: string;
  readonly model: string;
  readonly effort: string;
}

/** The three global tiers, in the canonical order. */
const TIERS = ['core', 'mid', 'cheap'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * A tier's status for display: `ok` (nothing to flag), `floor-raised` (the
 * configured model resolves fine, but insrc.models.coreFloor raises this tier
 * to a stronger one), or `not-supported` / `not-listed` (the configured model
 * does not resolve against the daemon's current catalog — see {@link tierStatus}).
 */
export type TierStatus =
  | { readonly kind: 'ok' }
  | { readonly kind: 'floor-raised'; readonly to: Tier }
  | { readonly kind: 'not-supported'; readonly model: string }
  | { readonly kind: 'not-listed'; readonly model: string };

/** A short human hint per tier. */
const TIER_HINT: Record<Tier, string> = {
  core: 'critical roles (design / review / build / validate)',
  mid: 'default working tier',
  cheap: 'peripheral roles (classification / summaries)',
};

const RESTART = 'Restart daemon';

/** The QuickPick item the flow drives; `kind` names its role. */
interface PickItem extends QuickPickItemLike {
  readonly kind: 'tier' | 'family' | 'model' | 'refresh' | 'current-not-listed' | 'no-models' | 'effort' | 'enter-id' | 'verdict' | 'approve' | 'reject';
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

/** The fields of the tier config.json holds (any of them may be absent). */
function configuredFields(raw: Record<string, unknown>, tier: Tier): Partial<TierValue> {
  const models = raw['models'];
  const tiers = typeof models === 'object' && models !== null ? (models as Record<string, unknown>)['tiers'] : undefined;
  const value = typeof tiers === 'object' && tiers !== null ? (tiers as Record<string, unknown>)[tier] : undefined;
  if (typeof value !== 'object' || value === null) return {};
  const fields: { runner?: string; model?: string; effort?: string } = {};
  for (const key of ['runner', 'model', 'effort'] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string' && (key === 'effort' || v !== '')) fields[key] = v;
  }
  return fields;
}

/**
 * The tier's current value: the tier the daemon runs, by its own rules (tierSetting and
 * parseTiering in src/config/analyze.ts, then the registry's resolveTier). A configured
 * runner the definitions serve AND a non-empty model make the tier, with the configured
 * effort or none ('' = CLI default) — never the default's effort. Any other tier (unset,
 * model '', a runner or model alone, an unknown runner) is the default family's default
 * for the tier, at the configured effort, else the default's effort. An effort the
 * resolved model does not accept is dropped by the daemon, so it is shown as ''.
 */
export function currentTier(defs: ModelDefinitions, raw: Record<string, unknown>, tier: Tier): TierValue | undefined {
  const configured = configuredFields(raw, tier);
  const configuredFamily = configured.runner !== undefined ? familyOf(defs, configured.runner) : undefined;
  let value: TierValue;
  if (configuredFamily !== undefined && configured.model !== undefined) {
    const model = servedModel(configuredFamily, configured.model);
    value = { runner: configuredFamily.id, model: model?.id ?? configured.model, effort: configured.effort ?? '' };
  } else {
    const family = familyOf(defs, defs.defaultFamily);
    const fallback = family !== undefined ? familyDefault(family, tier) : undefined;
    if (family === undefined || fallback === undefined) return undefined;
    value = { runner: family.id, model: fallback.model.id, effort: configured.effort ?? fallback.effort };
  }
  const resolved = familyOf(defs, value.runner);
  const model = resolved !== undefined ? servedModel(resolved, value.model) : undefined;
  return model !== undefined && value.effort !== '' && !model.efforts.includes(value.effort) ? { ...value, effort: '' } : value;
}

/**
 * This tier's display status. Checks the configured runner/model against the
 * daemon's current catalog FIRST, independent of {@link currentTier}'s fallback
 * (which would otherwise silently substitute the default family for an unknown
 * runner and lose the distinction): an unresolved runner, or a configured model
 * the resolved family does not serve, is `not-supported` when the family runs on
 * a host (Ollama's closed list — the same split {@link pickModel}'s inline marker
 * already applies) or `not-listed` otherwise (an open vendor family; the daemon
 * runs its default instead). Only once the configured model resolves cleanly is
 * the tier checked against `coreFloor`: `floor-raised` when this tier ranks below
 * it, else `ok`.
 */
export function tierStatus(defs: ModelDefinitions, raw: Record<string, unknown>, tier: Tier, coreFloor: Tier): TierStatus {
  const configured = configuredFields(raw, tier);
  if (configured.runner !== undefined) {
    const family = familyOf(defs, configured.runner);
    if (family === undefined) return { kind: 'not-listed', model: configured.model ?? configured.runner };
    if (configured.model !== undefined && servedModel(family, configured.model) === undefined) {
      return { kind: family.host !== undefined ? 'not-supported' : 'not-listed', model: configured.model };
    }
  }
  return TIERS.indexOf(tier) > TIERS.indexOf(coreFloor) ? { kind: 'floor-raised', to: coreFloor } : { kind: 'ok' };
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
  const current = currentTier(defs, raw, tier);

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
    let model: DefinedModel | undefined;
    if (chosen.kind === 'enter-id') {
      const typed = (await deps.input({ prompt: `A ${family.displayName} model id (a listed id or alias, or one to check)` }))?.trim();
      if (typed === undefined || typed === '') return;
      model = models.find((m) => m.id === typed || m.aliases.includes(typed));
      if (model === undefined) {
        await checkUnlisted(deps, tier, family, typed, current);
        return;
      }
    } else {
      if (chosen.kind !== 'model' || chosen.value === undefined) return; // a notice row — no-op.
      model = models.find((m) => m.id === chosen.value);
    }
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

/** The marks after a model's id: its aliases, user-approved, not installed, its hosting (cloud / local), current. */
function modelDescription(m: DefinedModel, isCurrent: boolean): string | undefined {
  const marks = [
    ...(m.aliases.length > 0 ? [`alias ${m.aliases.join(', ')}`] : []),
    ...(m.source === 'user-approved' ? ['(user-approved)'] : []),
    ...(m.installed === false ? ['(not installed)'] : []),
    ...(m.hosting !== undefined ? [m.hosting] : []),
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
    items.push(family.host !== undefined
      ? { label: `(current, not supported — the tier will not run): ${currentModel}`, description: `not supported by ${family.displayName}`, kind: 'current-not-listed' }
      : { label: `(current, not listed — runs the default): ${currentModel}`, description: `not served by ${family.displayName}`, kind: 'current-not-listed' });
  }
  for (const m of models) {
    const desc = modelDescription(m, m === current);
    const label = m.displayName !== undefined && m.displayName.length > 0 ? m.displayName : m.id;
    items.push(desc === undefined ? { label, kind: 'model', value: m.id } : { label, description: desc, kind: 'model', value: m.id });
  }
  // Only a vendor CLI family's models can be checked; Ollama, and a CLI family on a host, offer only their listed models.
  if (family.cliKind !== undefined && family.host === undefined) items.push({ label: 'Enter another model id…', description: 'checked by the daemon before it can be used', kind: 'enter-id' });
  items.push({ label: '$(refresh) Refresh', kind: 'refresh' });
  return deps.pick(items, { placeHolder: `Select a ${family.displayName} model` });
}

const VERDICT: Record<string, string> = { accepted: 'accepted', rejected: 'rejected', 'recognised-unconfirmed': 'recognised — unconfirmed' };
const CHECK_AGAIN = 'Check again';
const RESTART_AND_SAVE = 'Restart daemon and save';

/**
 * Check a model the family does not list, then approve or reject it. Approve records the
 * decision and saves nothing; the tier is saved only after a restart that brings the
 * daemon back, and the approval is never sent again. Never throws.
 */
async function checkUnlisted(deps: SetModelTierDeps, tier: Tier, family: DefinedFamily, modelId: string, current: TierValue | undefined): Promise<void> {
  const familyEfforts = [...new Set(family.models.flatMap((m) => m.efforts))];
  const claimedText = await deps.input({ prompt: `Effort levels to check for ${modelId} (comma-separated; empty for none)`, value: familyEfforts.join(', ') });
  if (claimedText === undefined) return;
  const claimedEfforts = claimedText.split(',').map((e) => e.trim()).filter((e) => e.length > 0);

  for (;;) {
    let result: ModelCheckResult | { error: string };
    try {
      result = await deps.check({ family: family.id, modelId, claimedEfforts });
    } catch (err) {
      if (classifyDaemonFailure(err).kind === 'disconnected') {
        if ((await deps.notify(`insrc: the check of ${modelId} was interrupted — the daemon closed the connection.`, CHECK_AGAIN)) === CHECK_AGAIN) continue;
        return;
      }
      await deps.notify(failureMessage(err, `check ${modelId}`));
      return;
    }
    if (!('checkId' in result)) {
      // The daemon refuses an id it already serves: if fresh definitions list it, offer it as a normal pick.
      let served: DefinedModel | undefined;
      try {
        const fresh = familyOf(await deps.definitions(), family.id);
        served = fresh !== undefined ? servedModel(fresh, modelId) : undefined;
      } catch { /* nothing to offer: the refusal is shown below */ }
      if (served !== undefined) {
        const save = `Save ${served.id}`;
        if ((await deps.notify(`insrc: ${served.id} is served by ${family.displayName} now.`, save)) === save) {
          await saveTier(deps, tier, { runner: family.id, model: served.id, effort: '' }, current);
        }
        return;
      }
      await deps.notify(`insrc: the daemon refused to check ${modelId}: ${result.error}`);
      return;
    }

    // The verdicts, with the decision: Approve (only for a model that ran), Reject or cancel.
    const rows: PickItem[] = result.efforts.map((e) => ({ label: `${e.effort} — ${VERDICT[e.verdict] ?? e.verdict}`, detail: e.evidence, kind: 'verdict' }));
    const summary = `runs: ${result.runs ? 'yes' : 'no'}${result.inputLimit !== undefined ? ` · input limit ${result.inputLimit.max} ${result.inputLimit.unit}` : ''}${result.error !== undefined ? ` · ${result.error}` : ''}`;
    const decisions: PickItem[] = [
      ...(result.runs ? [{ label: `Approve ${modelId}…`, description: 'choose the levels to allow', kind: 'approve' as const }] : []),
      { label: `Reject ${modelId}`, kind: 'reject' },
    ];
    const decision = await deps.pick([...rows, ...decisions], { placeHolder: `${modelId} through ${family.displayName}: ${summary}` });
    if (decision === undefined || decision.kind === 'verdict') return;

    let outcome: DecisionResult;
    let efforts: readonly string[] = [];
    try {
      if (decision.kind === 'reject') {
        outcome = await deps.reject({ checkId: result.checkId });
      } else {
        const allowable = result.efforts.filter((e) => e.verdict !== 'rejected');
        if (allowable.length > 0) {
          const chosen = await deps.pickMany(allowable.map((e) => ({ label: e.effort, description: VERDICT[e.verdict] ?? e.verdict, kind: 'effort' as const, value: e.effort })), { placeHolder: `Effort levels to allow for ${modelId}` });
          if (chosen === undefined) return;
          efforts = chosen.map((c) => c.value ?? '').filter((e) => e !== '');
        }
        outcome = await deps.approve({ checkId: result.checkId, efforts });
      }
    } catch (err) {
      const failure = classifyDaemonFailure(err);
      await deps.notify(failure.kind === 'disconnected'
        ? `insrc: the outcome is unknown — ${failure.text}; reopen the picker after a restart to see whether ${modelId} was recorded.`
        : failureMessage(err, `record the decision for ${modelId}`));
      return;
    }
    if (!outcome.ok) {
      // unknown-check: the daemon no longer holds this check (a restart or eviction) — only a fresh check helps.
      const again = outcome.reason === 'unknown-check' ? [CHECK_AGAIN] : [];
      if ((await deps.notify(`insrc: ${outcome.reason}: ${outcome.detail}`, ...again)) === CHECK_AGAIN) continue;
      return;
    }
    if (decision.kind === 'reject') {
      await deps.notify(`insrc: ${modelId} rejected — the decision applies after a daemon restart.`);
      return;
    }

    // Approved: save only after a restart that brings the daemon back; never approve again.
    let message = `insrc: approved ${modelId} (levels: ${efforts.length > 0 ? efforts.join(', ') : 'none'}) — restart the daemon to use it; the ${tier} tier is saved after the restart.`;
    for (;;) {
      if ((await deps.notify(message, RESTART_AND_SAVE)) !== RESTART_AND_SAVE) return;
      if (await deps.restartDaemon()) {
        await saveTier(deps, tier, { runner: family.id, model: modelId, effort: efforts[0] ?? '' }, current);
        return;
      }
      message = `insrc: the approval of ${modelId} is recorded, but the daemon did not restart — the ${tier} tier was not saved.`;
    }
  }
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

