/**
 * Story E20260923ba132c18:S003 / t1 — the VS-Code-free model-tier picker (sc2 consumer).
 *
 * The S003-private orchestrator for the 'insrc: Set model tier' command: a guided
 * tier → provider → model flow that turns the global model-tier `model` field from
 * free text into an AUTHORITATIVE dropdown backed by the shipped sc2 list-models
 * IPC. It is a DUMB consumer (k2/k4): it renders exactly the daemon's returned
 * `ModelListResult`, carries no per-provider list logic, and offers no free-text
 * entry — availability comes from the sc2 `available` flag, not a plugin-side probe.
 *
 * Everything is injected via {@link SetModelTierDeps} (listModels / catalog /
 * writeKeyPath / pick / notify) so the whole flow is unit-testable over fakes
 * WITHOUT vscode — the plugin's extract-into-modules + inject-deps idiom (mirrors
 * S007's repo-config.ts). This module imports NO `vscode`; extension.ts binds the
 * real seams (client.rpc('providers.listModels'), the sc8 configGateway.catalog +
 * writeKeyPath, vscode.window.showQuickPick, a notify surface).
 *
 * The write reuses the sc8 `writeKeyPath` ARRAY form targeting the EXISTING
 * `models.tiers.<tier>.model` CONFIG_CATALOG key — no new daemon capability (k3),
 * no schema change. On any non-availability / empty / refusal / cancel path the
 * saved value is left untouched (ac2/k7). Never throws — all failures surface via
 * `notify` (the plugin's never-throw idiom).
 */

import { CONFIG_CATALOG } from '../../../src/config/config-catalog.js';
import type { ConfigCatalogSnapshot, ConfigWriteResult } from '../config/types.js';

/** The three model providers (the reused runner enum, k3 — kept in lock-step with
 *  the daemon's ModelProvider without importing daemon internals). */
export type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex';

/** One model as sc2 returns it (structurally the daemon's ModelInfo). */
export interface ModelInfo {
  readonly id: string;
  readonly displayName?: string;
}

/** The sc2 result shape S003 renders authoritatively (structurally the daemon's ModelListResult). */
export interface ModelListResult {
  readonly provider: ModelProvider;
  readonly available: boolean;
  readonly models: readonly ModelInfo[];
}

/** The minimal QuickPick item contract the injected `pick` seam consumes (a subset
 *  of vscode.QuickPickItem, so the real showQuickPick satisfies it). */
export interface QuickPickItemLike {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

/**
 * The injected VS-Code-free seams. Defaults (bound in extension.ts): `listModels`
 * = client.rpc('providers.listModels'); `catalog`/`writeKeyPath` = the sc8
 * configGateway; `pick` = vscode.window.showQuickPick; `notify` = a status/notify
 * surface (showInformationMessage). So the flow is fully unit-testable over fakes.
 */
export interface SetModelTierDeps {
  /** The sc2 list-models call for a provider (rejection ⇒ treated as unavailable). */
  listModels(provider: ModelProvider): Promise<ModelListResult>;
  /** The sc8 effective-config read (values omit defaults ⇒ the picker fills them). */
  catalog(): Promise<ConfigCatalogSnapshot>;
  /** The sc8 config.write ARRAY form; writes ['models','tiers',tier,'model'] (and runner on a switch). */
  writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>;
  /** Present a single-select dropdown (default vscode.window.showQuickPick). */
  pick<T extends QuickPickItemLike>(items: readonly T[], opts: { placeHolder: string }): Promise<T | undefined>;
  /** Surface a one-line message (info or error). */
  notify(message: string): void;
}

/** The three global tiers, in the canonical order. */
const TIERS = ['core', 'mid', 'cheap'] as const;
type Tier = (typeof TIERS)[number];

/** The three providers with human labels (the dropdown-only provider set, k3/k4). */
const PROVIDERS: ReadonlyArray<{ readonly id: ModelProvider; readonly label: string }> = [
  { id: 'ollama', label: 'Ollama (local)' },
  { id: 'cli-claude', label: 'Claude (CLI)' },
  { id: 'cli-codex', label: 'Codex (CLI)' },
];

/** The QuickPick item the flow drives; `kind` names its role so the k7 states live here. */
interface PickItem extends QuickPickItemLike {
  readonly kind: 'tier' | 'provider' | 'model' | 'refresh' | 'current-not-in-catalog' | 'no-models';
  /** Present on a model item (its id) and a provider item (the ModelProvider). */
  readonly value?: string;
}

/** Whether a string is one of the three ModelProvider literals. */
function isProvider(v: unknown): v is ModelProvider {
  return v === 'ollama' || v === 'cli-claude' || v === 'cli-codex';
}

/** The CONFIG_CATALOG default for a config path (or undefined if unknown). */
function catalogDefault(path: string): unknown {
  return CONFIG_CATALOG.find((o) => o.path === path)?.default;
}

/** The tier's effective value at a leaf: the override if present, else the catalog default. */
function effective(snapshot: ConfigCatalogSnapshot, path: string): unknown {
  const override = snapshot.values.get(path);
  return override !== undefined ? override : catalogDefault(path);
}

/**
 * Run the 'insrc: Set model tier' flow. Picks a tier, reads its effective runner +
 * model, lets the user (re)choose the provider then a model from the daemon's
 * authoritative list, and writes the chosen model (and the runner on a provider
 * switch) via the sc8 writeKeyPath ARRAY form. Never throws; a cancel at any step
 * is a clean no-op; every failure/empty path leaves the saved value untouched.
 */
export async function runSetModelTier(deps: SetModelTierDeps): Promise<void> {
  // A single outer backstop so NOTHING escapes into VS Code (never-throw idiom):
  // the specific seam guards below give precise messages; this catches anything
  // unforeseen (e.g. a rejecting pick seam) rather than surfacing a raw command error.
  try {
    await runSetModelTierInner(deps);
  } catch {
    deps.notify('insrc: the model-tier picker hit an unexpected error — nothing was changed.');
  }
}

async function runSetModelTierInner(deps: SetModelTierDeps): Promise<void> {
  // 1) Pick a tier.
  const tier = await pickTier(deps);
  if (tier === undefined) return; // cancel — no-op.

  // 2) Read the tier's effective runner + current model (defaults filled).
  let snapshot: ConfigCatalogSnapshot;
  try {
    snapshot = await deps.catalog();
  } catch {
    deps.notify("insrc: couldn't read the current configuration — is the daemon running?");
    return; // clean abort, no write.
  }
  const rawRunner = effective(snapshot, `models.tiers.${tier}.runner`);
  const currentModel = readString(effective(snapshot, `models.tiers.${tier}.model`));
  // Whether the tier's model is an explicit override (present in the snapshot) vs a
  // built-in catalog default. Only an override that has fallen out of the daemon's
  // list is a real "(current, not in catalog)" — a default the user never set is not.
  const modelOverride = snapshot.values.get(`models.tiers.${tier}.model`);
  const modelIsOverride = typeof modelOverride === 'string' && modelOverride.length > 0;
  let currentProvider: ModelProvider | undefined;
  if (isProvider(rawRunner)) {
    currentProvider = rawRunner;
  } else {
    // A stale/hand-edited runner outside the enum — do NOT pass it to sc2; the
    // provider step re-establishes a valid one (ac4/k7).
    deps.notify(`insrc: the ${tier} tier's provider is unrecognised — choose a provider.`);
  }

  // 3) Pick the provider (defaults to the current runner; a change clears the model).
  const provider = await pickProvider(deps, currentProvider);
  if (provider === undefined) return; // cancel — no-op.
  const providerChanged = provider !== currentProvider;
  // The saved model only applies to the tier's own (unchanged) provider.
  const savedModel = providerChanged ? undefined : currentModel;
  // A cleared model (provider switch) carries no override marker either.
  const markNotInCatalog = !providerChanged && modelIsOverride;

  // 4) List + pick a model over the daemon's authoritative result (re-query on Refresh).
  for (;;) {
    let result: ModelListResult;
    try {
      result = await deps.listModels(provider);
    } catch {
      // A socket/daemon failure is treated exactly like available:false (ac2/k7);
      // surface it so the empty state isn't mistaken for "this provider has none".
      deps.notify("insrc: couldn't reach the daemon to list models — is it running?");
      result = { provider, available: false, models: [] };
    }

    if (!result.available || result.models.length === 0) {
      const again = await pickEmpty(deps, provider);
      if (again) continue; // Refresh — re-query.
      return; // no-models / cancel — saved model untouched (ac2/k7).
    }

    const chosen = await pickModel(deps, provider, result.models, savedModel, markNotInCatalog);
    if (chosen === undefined) return; // cancel — no-op.
    if (chosen.kind === 'refresh') continue; // re-query.
    if (chosen.kind === 'current-not-in-catalog') return; // non-selectable — no-op.
    // A real model pick.
    const modelId = chosen.value ?? '';
    if (!providerChanged && modelId === savedModel) return; // idempotent — no needless write.
    await commit(deps, tier, provider, providerChanged, modelId);
    return;
  }
}

/** Step 1 — the tier dropdown. */
async function pickTier(deps: SetModelTierDeps): Promise<Tier | undefined> {
  const items: PickItem[] = TIERS.map((t) => ({
    label: t,
    description: TIER_HINT[t],
    kind: 'tier',
    value: t,
  }));
  const picked = await deps.pick(items, { placeHolder: 'Select the model tier to configure' });
  return picked === undefined ? undefined : (picked.value as Tier);
}

/** A short human hint per tier (from the catalog descriptions). */
const TIER_HINT: Record<Tier, string> = {
  core: 'critical roles (design / review / build / validate)',
  mid: 'default working tier',
  cheap: 'peripheral roles (classification / summaries)',
};

/** Step 3 — the provider dropdown, current marked. */
async function pickProvider(
  deps: SetModelTierDeps,
  current: ModelProvider | undefined,
): Promise<ModelProvider | undefined> {
  const items: PickItem[] = PROVIDERS.map((p) => {
    const isCurrent = p.id === current;
    return isCurrent
      ? { label: p.label, description: '(current)', kind: 'provider' as const, value: p.id }
      : { label: p.label, kind: 'provider' as const, value: p.id };
  });
  const picked = await deps.pick(items, { placeHolder: 'Select the provider (backend) for this tier' });
  return picked === undefined ? undefined : (picked.value as ModelProvider);
}

/** The empty/unavailable dropdown: a disabled notice + a Refresh. Returns true iff Refresh was chosen. */
async function pickEmpty(deps: SetModelTierDeps, provider: ModelProvider): Promise<boolean> {
  const items: PickItem[] = [
    { label: 'No models available', description: providerLabel(provider), kind: 'no-models' },
    { label: '$(refresh) Refresh', kind: 'refresh' },
  ];
  const picked = await deps.pick(items, { placeHolder: 'No models available — Refresh to retry' });
  return picked?.kind === 'refresh';
}

/** The model dropdown over the daemon's authoritative list (+ current-not-in-catalog + Refresh). */
async function pickModel(
  deps: SetModelTierDeps,
  provider: ModelProvider,
  models: readonly ModelInfo[],
  savedModel: string | undefined,
  markNotInCatalog: boolean,
): Promise<PickItem | undefined> {
  const items: PickItem[] = [];
  const savedIsListed = savedModel !== undefined && models.some((m) => m.id === savedModel);
  // A saved OVERRIDE absent from a successful list ⇒ a non-selectable current marker
  // (ac3/k7). A built-in default that isn't listed is NOT flagged (it's not a
  // misconfiguration the user made).
  if (savedModel !== undefined && !savedIsListed && markNotInCatalog) {
    items.push({
      label: `(current, not in catalog): ${savedModel}`,
      description: 'not offered by this provider',
      kind: 'current-not-in-catalog',
    });
  }
  for (const m of models) {
    const isCurrent = m.id === savedModel;
    const desc = describeModel(m, isCurrent);
    const label = modelLabel(m);
    items.push(desc === undefined ? { label, kind: 'model', value: m.id } : { label, description: desc, kind: 'model', value: m.id });
  }
  items.push({ label: '$(refresh) Refresh', kind: 'refresh' });
  return deps.pick(items, { placeHolder: `Select a model for ${providerLabel(provider)}` });
}

/** The visible label for a model item (displayName, else the id). */
function modelLabel(m: ModelInfo): string {
  return m.displayName !== undefined && m.displayName.length > 0 ? m.displayName : m.id;
}

/** Write the chosen model (and the runner on a provider switch); surface the outcome. */
async function commit(
  deps: SetModelTierDeps,
  tier: Tier,
  provider: ModelProvider,
  providerChanged: boolean,
  modelId: string,
): Promise<void> {
  // The write seam (config.write over the socket) can REJECT if the daemon went
  // down between the pick and the write — guard it so nothing escapes (never-throw).
  try {
    if (providerChanged) {
      const r = await deps.writeKeyPath(['models', 'tiers', tier, 'runner'], provider);
      if (!r.ok) {
        deps.notify(`insrc: could not set the ${tier} provider — ${r.reason}. Nothing was changed.`);
        return;
      }
    }
    const w = await deps.writeKeyPath(['models', 'tiers', tier, 'model'], modelId);
    if (!w.ok) {
      // On a provider switch the runner write already landed — say so, so the tier
      // isn't silently left with a new runner + an old/mismatched model (re-run to finish).
      const partial = providerChanged
        ? ` The provider was changed to ${providerLabel(provider)} but the model was NOT set — re-run to finish.`
        : '';
      deps.notify(`insrc: could not set the ${tier} model — ${w.reason}.${partial}`);
      return;
    }
    deps.notify(`insrc: ${tier} tier set to ${modelId} (${providerLabel(provider)}).`);
  } catch {
    // A socket rejection mid-write. On a switch the runner may already have landed;
    // tell the user so a half-applied tier is visible, not silent.
    const partial = providerChanged ? ' The provider change may have partially applied — re-run to confirm.' : '';
    deps.notify(`insrc: couldn't save the ${tier} tier — is the daemon running?${partial}`);
  }
}

/** A model item's description: '(current)' when it is the saved model, else its id (when a displayName is shown). */
function describeModel(m: ModelInfo, isCurrent: boolean): string | undefined {
  if (isCurrent) return '(current)';
  return m.displayName !== undefined && m.displayName !== m.id ? m.id : undefined;
}

/** The human provider label (falls back to the id). */
function providerLabel(provider: ModelProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}

/** Narrow an unknown effective value to a non-empty string, else undefined. */
function readString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
