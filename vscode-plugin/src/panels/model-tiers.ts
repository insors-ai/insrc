/**
 * The Model Tiers panel core (Story E20261030c5c764585f6714f7:S001).
 *
 * Replaces the flat 9-field Settings UI with one card per tier (core/mid/cheap):
 * runner/model/effort dropdowns, a cloud/local hosting badge, and the inline
 * {@link tierStatus} note, plus a panel-foot Core-floor select — matching the
 * approved mock at mocks/model-tiers-grouped.html. `renderModelTiers` reads its
 * OWN data (modelDefinitions + rawConfig), same shape as `renderRepoConfig`
 * (repo-config.ts:82). Non-goal (see the Story's Summary): the mock's 'Check an
 * unlisted model…' link is not rendered here — that stays reachable only through
 * the existing 'insrc: Set model tier' QuickPick wizard's checkUnlisted flow.
 *
 * `createModelTiersWriteHandler` is the onModelTiersWrite sink: it maps a
 * {kind:'tierField'} write to ['models','tiers',tier,field] and a
 * {kind:'coreFloor'} write to ['models','coreFloor'], via the same global
 * writeKeyPath the 'insrc: Set model tier' wizard's saveTier already uses — no
 * per-repo consent gate (tiers and the core floor are global, not per-repo).
 * `refresh()` runs on every RESOLVED write (accepted or refused), never on a
 * rejected one, exactly as createRepoConfigWriteHandler's own refresh call
 * (repo-config.ts:219) does. Never throws.
 */

import { escapeHtml } from './html.js';
import { currentTier, tierStatus, type Tier, type TierStatus } from '../models/model-tier-picker.js';
import { familyOf, servedModel, type ModelDefinitions } from '../models/definitions.js';
import type { ConfigWriteResult } from '../config/types.js';

/** The three global tiers, in the canonical order (mirrors model-tier-picker.ts's own list). */
const TIERS: readonly Tier[] = ['core', 'mid', 'cheap'];

/** A short human hint per tier, matching the approved mock. */
const TIER_HINT: Record<Tier, string> = {
  core: 'critical reasoning — never runs below the core floor',
  mid: 'most reasoning and build work',
  cheap: 'narrow, high-volume tasks',
};

/** The narrow injected boundary `renderModelTiers` reads through. */
export interface ModelTiersRendererDeps {
  readonly modelDefinitions: () => Promise<ModelDefinitions>;
  readonly rawConfig: () => Promise<Record<string, unknown>>;
}

/** A (re)render of the Model Tiers panel body (mirrors `RepoConfigRenderer`'s () => Promise<string> shape). */
export type ModelTiersRenderer = () => Promise<string>;

/**
 * One field write emitted by the Model Tiers form: either one tier's runner,
 * model or effort, or the global core floor. Discriminated because this panel
 * writes two distinct config paths where Repo Configuration's single-shape
 * `RepoConfigWrite` only ever writes one.
 */
export type ModelTiersWrite = { readonly kind: 'tierField'; readonly tier: Tier; readonly field: 'runner' | 'model' | 'effort'; readonly value: string } | { readonly kind: 'coreFloor'; readonly value: Tier };

/** Injected inputs for the Model Tiers write sink (mirrors `RepoConfigWriteDeps`, minus the per-repo consent gate — tiers and the core floor are global). */
export interface ModelTiersWriteHandlerDeps {
  readonly writeKeyPath: (segments: readonly string[], value: unknown) => Promise<ConfigWriteResult>;
  readonly logger: { warn(message: string): void };
  /** Re-render the panel from fresh config after a write (truthful; runs on both an accepted and a refused resolution). */
  readonly refresh: () => void;
}

/** Read the raw config's current insrc.models.coreFloor, or 'mid' (the daemon's documented default) if unset/invalid. */
function currentCoreFloor(raw: Record<string, unknown>): Tier {
  const models = raw['models'];
  const value = typeof models === 'object' && models !== null ? (models as Record<string, unknown>)['coreFloor'] : undefined;
  return (TIERS as readonly string[]).includes(value as string) ? (value as Tier) : 'mid';
}

/** The cloud/local hosting badge for a resolved family's model, or '' when the family is an open vendor family (no badge in the mock). */
function hostingBadge(hosting: 'cloud' | 'local' | undefined): string {
  return hosting === undefined ? '' : ` <span class="hosting-chip ${escapeHtml(hosting)}">${escapeHtml(hosting)}</span>`;
}

/** The inline status note for a tier, matching the approved mock's .note.ok/.note.err blocks. */
function statusNote(status: TierStatus): string {
  if (status.kind === 'ok') return `<div class="note ok"><span class="dot">●</span><span>Running as configured.</span></div>`;
  if (status.kind === 'floor-raised') return `<div class="note ok"><span class="dot">●</span><span>Raised to ${escapeHtml(status.to)} by the core floor.</span></div>`;
  const reason = status.kind === 'not-supported' ? 'is not supported by this runner — the tier will not run' : 'is not listed by this runner — the daemon runs its default instead';
  return `<div class="note err"><span class="dot">⚠</span><span><b>${escapeHtml(status.model)}</b> ${reason}. Pick a listed model above.</span></div>`;
}

/** One tier's card: runner/model/effort selects, the hosting badge, and the inline status note. */
function tierCard(tier: Tier, defs: ModelDefinitions, raw: Record<string, unknown>, coreFloor: Tier): string {
  const value = currentTier(defs, raw, tier);
  const status = tierStatus(defs, raw, tier, coreFloor);
  const family = value !== undefined ? familyOf(defs, value.runner) : undefined;
  const model = family !== undefined && value !== undefined ? servedModel(family, value.model) : undefined;

  const runnerOptions = defs.families
    .map((f) => `<option value="${escapeHtml(f.id)}"${value !== undefined && f.id === value.runner ? ' selected' : ''}>${escapeHtml(f.displayName)}</option>`)
    .join('');

  const knownModels = family !== undefined
    ? family.models.map((m) => `<option value="${escapeHtml(m.id)}"${value !== undefined && m.id === value.model ? ' selected' : ''}>${escapeHtml(m.displayName !== undefined && m.displayName.length > 0 ? m.displayName : m.id)}</option>`)
    : [];
  // A configured model the resolved family does not list (status not-supported/not-listed): shown as its own, styled option.
  const modelOptions = model === undefined && value !== undefined
    ? [...knownModels, `<option value="${escapeHtml(value.model)}" selected style="color:var(--err-fg)">${escapeHtml(value.model)} (not listed)</option>`]
    : knownModels;

  const efforts = model?.efforts ?? [];
  const effortOptions = efforts.length === 0
    ? ''
    : ['<option value=""' + (value?.effort === '' ? ' selected' : '') + '>CLI default</option>', ...efforts.map((e) => `<option value="${escapeHtml(e)}"${value?.effort === e ? ' selected' : ''}>${escapeHtml(e)}</option>`)].join('');

  return (
    `<div class="tier">` +
    `<div class="tier-head"><div class="tier-name"><b>${escapeHtml(tier)}</b><span class="tier-purpose">${escapeHtml(TIER_HINT[tier])}</span></div></div>` +
    `<div class="controls">` +
    `<div class="field"><label>Runner</label><select data-tier="${tier}" data-field="runner">${runnerOptions}</select></div>` +
    `<div class="field"><label>Model</label><select data-tier="${tier}" data-field="model">${modelOptions.join('')}</select>${hostingBadge(model?.hosting)}</div>` +
    `<div class="field"><label>Effort</label><select data-tier="${tier}" data-field="effort"${efforts.length === 0 ? ' disabled' : ''}>${effortOptions || '<option value="">—</option>'}</select></div>` +
    `</div>` +
    statusNote(status) +
    `</div>`
  );
}

/**
 * Build the Model Tiers body renderer. Reads modelDefinitions + rawConfig itself,
 * so the panel host stays a pure dispatcher (same contract as `renderRepoConfig`).
 */
export function renderModelTiers(deps: ModelTiersRendererDeps): ModelTiersRenderer {
  return async (): Promise<string> => {
    const [defs, raw] = await Promise.all([deps.modelDefinitions(), deps.rawConfig()]);
    const coreFloor = currentCoreFloor(raw);
    const cards = TIERS.map((tier) => tierCard(tier, defs, raw, coreFloor)).join('');
    const floorOptions = TIERS.map((t) => `<option value="${t}"${t === coreFloor ? ' selected' : ''}>${t[0]!.toUpperCase()}${t.slice(1)}</option>`).join('');
    return (
      `<div class="panel-head"><h1>Model Tiers</h1><p>Which tool and model each tier runs. Pulled live from the daemon.</p></div>` +
      `<div class="tier-list">${cards}</div>` +
      `<div class="panel-foot">` +
      `<div class="foot-field"><label class="foot-hint">Core floor</label><select data-field="coreFloor">${floorOptions}</select></div>` +
      `<div class="foot-hint">Critical roles never resolve below this tier</div>` +
      `</div>`
    );
  };
}

/**
 * Build the Model Tiers write handler (the host's onModelTiersWrite sink). Maps
 * a `{kind:'tierField'}` write to `['models','tiers',tier,field]` and a
 * `{kind:'coreFloor'}` write to `['models','coreFloor']`, via the global
 * writeKeyPath — no per-repo consent (k6: tiers and the core floor are global).
 * `refresh()` runs on every RESOLVED write, success or refusal; a REJECTED
 * write (the daemon unreachable) is logged and does NOT refresh, leaving the
 * panel showing its last-rendered state. Never throws.
 */
export function createModelTiersWriteHandler(deps: ModelTiersWriteHandlerDeps): (write: ModelTiersWrite) => void {
  return (write: ModelTiersWrite): void => {
    const segments = write.kind === 'tierField' ? ['models', 'tiers', write.tier, write.field] : ['models', 'coreFloor'];
    void (async () => {
      try {
        await deps.writeKeyPath(segments, write.value);
        deps.refresh(); // truthful re-render from fresh config (accepted-ok OR refused).
      } catch (err) {
        deps.logger.warn(`insrc: the model-tiers write failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };
}
