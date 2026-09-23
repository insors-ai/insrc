package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ModelListResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto

/**
 * The pure, headless state machine for the three global model tiers (Epic
 * ba132c185fe45860 / S004). It is the JetBrains twin of S003's VS-Code-free
 * picker: a DUMB consumer of the daemon's per-provider model lists (k2/k4) that
 * turns the free-text `models.tiers.<tier>.model` field into a provider-filtered
 * dropdown. All the k7 behaviour lives here (dropdown / empty+Refresh /
 * '(current, not in catalog)' for a stale OVERRIDE only / clear-on-provider-switch
 * / idempotent no-op) so it is unit-testable without Swing — the Swing shell
 * [ModelTiersSection] is source-scan-only (the InsrcSettingsConfigurable review idiom).
 *
 * The tier's effective runner+model are read from the settingsCatalog snapshot's
 * options (each [ai.insors.insrc.jetbrains.daemon.ConfigOptionDto] carries its
 * `default`, `currentValue` and `isSet`), so a defaulted tier resolves its provider
 * without any hardcoded fallback. The write path is the EXISTING config.write
 * literal-segments key ['models','tiers',tier,'model'] (+ 'runner' only on a switch);
 * an empty/Unavailable list is never written (the saved value is left untouched).
 */
class ModelTiersModel(
    catalog: SettingsCatalogDto,
    listsByProvider: Map<String, ModelListResult>,
) {
    companion object {
        /** The three global tiers, in canonical order. */
        val TIERS: List<String> = listOf("core", "mid", "cheap")

        /** The reused runner/provider enum (k3) — the model combo is filtered by the tier's runner. */
        val PROVIDERS: List<String> = listOf("ollama", "cli-claude", "cli-codex")
    }

    /** One tier's saved baseline + pending edits. `model` uses "" to mean "none". */
    private class TierState(
        val runnerDefault: String,
        val modelDefault: String,
        var savedRunner: String,
        var savedModel: String,
        /** Whether the saved model is an explicit OVERRIDE (not a built-in default). */
        var savedModelIsOverride: Boolean,
    ) {
        var pendingRunner: String = savedRunner
        var pendingModel: String = savedModel
    }

    private var lists: Map<String, ModelListResult> = listsByProvider

    private val states: Map<String, TierState> = TIERS.associateWith { tier ->
        val runnerOpt = catalog.options.firstOrNull { it.path == "models.tiers.$tier.runner" }
        val modelOpt = catalog.options.firstOrNull { it.path == "models.tiers.$tier.model" }
        val runnerDefault = (runnerOpt?.default as? String) ?: "cli-claude"
        val effRunner = ((runnerOpt?.currentValue as? String)?.takeIf { runnerOpt.isSet }) ?: runnerDefault
        val modelDefault = (modelOpt?.default as? String) ?: ""
        val modelOverride = (modelOpt?.currentValue as? String)?.takeIf { modelOpt.isSet && it.isNotBlank() }
        TierState(
            runnerDefault = runnerDefault,
            modelDefault = modelDefault,
            savedRunner = effRunner,
            savedModel = modelOverride ?: modelDefault,
            savedModelIsOverride = modelOverride != null,
        )
    }

    private fun state(tier: String): TierState =
        states[tier] ?: throw IllegalArgumentException("unknown tier: $tier")

    /** The provider (runner) options for a tier's runner combo (reused enum, k3). */
    fun runnerOptions(): List<String> = PROVIDERS

    /** The tier's pending runner (provider). */
    fun currentRunner(tier: String): String = state(tier).pendingRunner

    /** The tier's pending model id ("" = none selected). */
    fun currentModel(tier: String): String = state(tier).pendingModel

    /** True iff the tier's runner was switched away from its saved value (model cleared). */
    private fun providerSwitched(s: TierState): Boolean = s.pendingRunner != s.savedRunner

    /**
     * The model dropdown choices for a tier over its pending provider's daemon list.
     * Unavailable / empty -> a single [ModelChoice.NoModels] sentinel. Otherwise the
     * provider's models (dropdown-only, k4), prefixed with a non-selectable
     * [ModelChoice.CurrentNotInCatalog] ONLY when the tier's saved OVERRIDE is absent
     * from a successful list and the provider was not switched (ac3; a built-in default
     * that isn't listed is never flagged).
     */
    fun modelOptions(tier: String): List<ModelChoice> {
        val s = state(tier)
        val result = lists[s.pendingRunner]
        if (result !is ModelListResult.Loaded || !result.available || result.models.isEmpty()) {
            return listOf(ModelChoice.NoModels)
        }
        val ids = result.models.map { it.id }
        val choices = result.models.map { m ->
            ModelChoice.Model(
                id = m.id,
                label = m.displayName?.takeIf { it.isNotBlank() } ?: m.id,
                current = m.id == s.pendingModel,
            )
        }
        val hasCurrent = s.pendingModel.isNotEmpty() && s.pendingModel in ids
        val showMarker = !providerSwitched(s) &&
            s.savedModelIsOverride &&
            s.pendingModel == s.savedModel &&
            s.pendingModel.isNotEmpty() &&
            s.pendingModel !in ids
        // The prefix reflects what the tier's model currently IS: a non-selectable
        // '(current, not in catalog)' marker for a stale override, else a
        // '— select a model —' prompt whenever the pending model is not one of the
        // listed ids (a cleared switch, or an unset/defaulted-but-unlisted value) so
        // the combo never falsely shows a concrete model as chosen (k4/k7).
        val prefix = when {
            showMarker -> listOf(ModelChoice.CurrentNotInCatalog(s.pendingModel))
            !hasCurrent -> listOf(ModelChoice.SelectPrompt)
            else -> emptyList()
        }
        return prefix + choices
    }

    /** The choice the model combo should pre-select for a tier. */
    fun selectedModelChoice(tier: String): ModelChoice {
        val options = modelOptions(tier)
        return options.firstOrNull { it is ModelChoice.Model && it.current }
            ?: options.firstOrNull { it is ModelChoice.CurrentNotInCatalog }
            ?: options.firstOrNull { it is ModelChoice.SelectPrompt }
            ?: options.first()
    }

    /** Pick a model id for a tier (only real ids reach here; a sentinel is a no-op in the UI). */
    fun selectModel(tier: String, id: String) {
        state(tier).pendingModel = id
    }

    /** Switch a tier's provider (runner): clears the pending model, forcing an explicit re-pick (ac4). */
    fun selectRunner(tier: String, provider: String) {
        val s = state(tier)
        if (s.pendingRunner == provider) return
        s.pendingRunner = provider
        s.pendingModel = ""
    }

    /** True iff any tier has a pending runner/model edit different from its saved baseline. */
    fun isModified(): Boolean = states.values.any { dirtyRunner(it) || dirtyModel(it) }

    private fun dirtyRunner(s: TierState): Boolean = s.pendingRunner != s.savedRunner

    /**
     * A tier's model is dirty when the user picked a different non-empty model, OR
     * when a provider switch cleared a saved OVERRIDE (the stale override must be
     * removed so it can't outlive its provider — k7 "switching clears the model
     * field"; leaving it would persist an inconsistent runner/model pair). A cleared
     * DEFAULT (no override) has nothing to remove.
     */
    private fun dirtyModel(s: TierState): Boolean =
        if (s.pendingModel.isNotEmpty()) s.pendingModel != s.savedModel
        else providerSwitched(s) && s.savedModelIsOverride

    /** Drop all pending edits, restoring every tier to its last-saved runner+model. */
    fun revert() {
        for (s in states.values) {
            s.pendingRunner = s.savedRunner
            s.pendingModel = s.savedModel
        }
    }

    /**
     * The dirty tiers as [PendingWrite]s: a switched runner -> Set at
     * ['models','tiers',tier,'runner']; a chosen (non-empty, changed) model -> Set at
     * ['models','tiers',tier,'model']; a switch that dropped a saved OVERRIDE without a
     * re-pick -> Clear that model key (revert to the new runner's default, k7). Only
     * changed leaves appear (ac2). Runner precedes model for a given tier.
     */
    fun collectWrites(): List<PendingWrite> = TIERS.flatMap { tier ->
        val s = states.getValue(tier)
        buildList {
            if (dirtyRunner(s)) add(PendingWrite(listOf("models", "tiers", tier, "runner"), WriteOp.Set(s.pendingRunner)))
            if (dirtyModel(s)) {
                val segments = listOf("models", "tiers", tier, "model")
                add(PendingWrite(segments, if (s.pendingModel.isNotEmpty()) WriteOp.Set(s.pendingModel) else WriteOp.Clear))
            }
        }
    }

    /** Advance a tier's last-saved baseline after ALL its writes persisted (per-tier isolation). */
    fun onSaved(tier: String) {
        val s = state(tier)
        val switched = providerSwitched(s)
        s.savedRunner = s.pendingRunner
        when {
            s.pendingModel.isNotEmpty() -> {
                s.savedModel = s.pendingModel
                s.savedModelIsOverride = true
            }
            // A switch that cleared an override persisted a Clear -> the effective model
            // is now the (new runner's) default; drop the override baseline.
            switched && s.savedModelIsOverride -> {
                s.savedModel = s.modelDefault
                s.pendingModel = s.modelDefault
                s.savedModelIsOverride = false
            }
        }
    }

    /** Replace the pre-fetched per-provider lists (a Refresh) without dropping pending edits. */
    fun updateLists(newLists: Map<String, ModelListResult>) {
        lists = newLists
    }
}

/** A model dropdown entry: a selectable model, a non-selectable current marker, or the empty sentinel. */
sealed interface ModelChoice {
    val label: String

    /** A selectable model from the daemon's list; [current] marks the tier's saved/selected one. */
    data class Model(val id: String, override val label: String, val current: Boolean) : ModelChoice

    /** A non-selectable marker showing a saved OVERRIDE that isn't in the current list (ac3). */
    data class CurrentNotInCatalog(val id: String) : ModelChoice {
        override val label: String = "(current, not in catalog): $id"
    }

    /** A non-selectable prompt shown when no concrete model is chosen (a cleared switch,
     *  or an unset/defaulted-but-unlisted model) so the combo never falsely pre-selects one. */
    data object SelectPrompt : ModelChoice {
        override val label: String = "— select a model —"
    }

    /** The disabled sentinel shown when the provider's list is empty/unavailable (ac2). */
    data object NoModels : ModelChoice {
        override val label: String = "no models available"
    }
}
