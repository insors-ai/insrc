package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.DefinedModelDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto

/**
 * The pure, headless state machine for the three global model tiers (Epic
 * ba132c185fe45860 / S004; reshaped by Epic ce99b72065d03b1b, Story s7). Every runner,
 * model and effort it offers comes from the daemon's model definitions
 * (`models.definitions`); the plugin keeps no list of its own. The Swing shell
 * [ModelTiersSection] only renders it.
 *
 * The configured tier leaves come from the settings catalog snapshot (each option's
 * `currentValue` / `isSet`). The tier shown as current is the one the daemon runs, by
 * the daemon's own rules (tierSetting and parseTiering in src/config/analyze.ts, then
 * the registry's resolveTier):
 *  - a configured effort leaf ('' included) always wins;
 *  - a configured runner (a family the definitions serve) AND a non-empty model make the
 *    tier: that runner and model, with the configured effort or none ('' = CLI default);
 *  - any other tier (unset, model '', a runner or model alone) is the default family's
 *    default for the tier, at the configured effort, else the default's effort;
 *  - an effort the resolved model does not accept is dropped by the daemon, so it is
 *    shown as '' with a note, and the tier is not dirty for it.
 */
class ModelTiersModel(
    private val catalog: SettingsCatalogDto,
    definitions: ModelDefinitionsDto,
) {
    companion object {
        /** The three global tiers, in canonical order. */
        val TIERS: List<String> = listOf("core", "mid", "cheap")
    }

    /** What the daemon runs for one tier, plus what the user should know about it. */
    private data class Resolved(
        val runner: String,
        val model: String,
        val effort: String,
        /** False when the configured model is not one the definitions list. */
        val listed: Boolean,
        val note: String?,
    )

    /** One tier's saved baseline + pending edits. `model` uses "" to mean "none". */
    private class TierState(var saved: Resolved) {
        var pendingRunner: String = saved.runner
        var pendingModel: String = saved.model
        var pendingEffort: String = saved.effort
    }

    private var defs: ModelDefinitionsDto = definitions

    private val states: Map<String, TierState> = TIERS.associateWith { TierState(resolve(it)) }

    private fun state(tier: String): TierState =
        states[tier] ?: throw IllegalArgumentException("unknown tier: $tier")

    private fun family(id: String): DefinedFamilyDto? = defs.families.firstOrNull { it.id == id }

    private fun served(family: DefinedFamilyDto, idOrAlias: String): DefinedModelDto? =
        family.models.firstOrNull { it.id == idOrAlias || idOrAlias in it.aliases }

    /** A configured tier leaf: the string value when the leaf is set, else null. */
    private fun leaf(tier: String, field: String): String? {
        val opt = catalog.options.firstOrNull { it.path == "models.tiers.$tier.$field" } ?: return null
        return (opt.currentValue as? String)?.takeIf { opt.isSet }
    }

    /** The family's default model and effort for a tier: tierDefaults, else the tool-loop model, else the first model. */
    private fun familyDefault(family: DefinedFamilyDto, tier: String): Pair<DefinedModelDto, String>? {
        val named = family.tierDefaults[tier]
        val model = when {
            named != null -> served(family, named.model)
            family.toolLoopModel != null -> served(family, family.toolLoopModel)
            else -> family.models.firstOrNull()
        } ?: return null
        val effort = named?.effort?.takeIf { it in model.efforts } ?: ""
        return model to effort
    }

    private fun resolve(tier: String): Resolved {
        val runner = leaf(tier, "runner")
        val model = leaf(tier, "model")
        val effortLeaf = leaf(tier, "effort")
        val configuredFamily = runner?.let { family(it) }
        val notes = mutableListOf<String>()

        val result: Resolved = if (configuredFamily != null && !model.isNullOrEmpty()) {
            val found = served(configuredFamily, model)
            if (found == null) {
                // A family on a host takes only its listed models: the daemon refuses the tier (model-not-supported).
                notes += if (configuredFamily.host != null) {
                    "$model is not supported by ${configuredFamily.displayName} — the tier will not run"
                } else {
                    "$model is not listed for ${configuredFamily.displayName} — the daemon runs its default for the tier instead"
                }
                Resolved(configuredFamily.id, model, effortLeaf ?: "", listed = false, note = null)
            } else {
                Resolved(configuredFamily.id, found.id, effortLeaf ?: "", listed = true, note = null)
            }
        } else {
            if (runner != null || model != null) {
                notes += "the configured $tier tier is incomplete (it needs a runner the daemon serves and a model) — the daemon ignores it and runs the default"
            }
            val fam = family(defs.defaultFamily) ?: defs.families.first()
            val def = familyDefault(fam, tier)
            Resolved(fam.id, def?.first?.id ?: "", effortLeaf ?: def?.second ?: "", listed = def != null, note = null)
        }

        // The registry drops an effort the resolved model does not accept.
        val resolvedModel = family(result.runner)?.let { served(it, result.model) }
        val effort = if (result.effort.isNotEmpty() && resolvedModel != null && result.effort !in resolvedModel.efforts) {
            notes += "stored effort '${result.effort}' is not accepted by ${resolvedModel.id} — the daemon drops it"
            ""
        } else {
            result.effort
        }
        return result.copy(effort = effort, note = notes.joinToString("; ").ifEmpty { null })
    }

    /** The runner (family) ids the definitions serve with at least one model, in their order. */
    fun runnerOptions(): List<String> = defs.families.filter { it.models.isNotEmpty() }.map { it.id }

    /** A family's display name, for the runner combo. */
    fun runnerLabel(runner: String): String = family(runner)?.let { "${it.displayName} ($runner)" } ?: runner

    /** The tier's pending runner (family). */
    fun currentRunner(tier: String): String = state(tier).pendingRunner

    /** The tier's pending model id ("" = none selected). */
    fun currentModel(tier: String): String = state(tier).pendingModel

    /** What the user should know about the tier as configured (incomplete, not listed, dropped effort), or null. */
    fun note(tier: String): String? = state(tier).saved.note

    /** The model of the tier's pending runner named by its pending model, if the definitions list it. */
    private fun pendingModelDef(s: TierState): DefinedModelDto? =
        family(s.pendingRunner)?.let { served(it, s.pendingModel) }

    /**
     * The effort choices for a tier: exactly '' (the CLI default) plus the pending model's
     * efforts from the definitions — only '' for a model the definitions do not list.
     */
    fun effortOptions(tier: String): List<String> =
        listOf("") + (pendingModelDef(state(tier))?.efforts ?: emptyList())

    /** Clear a pending effort the pending model does not accept. */
    private fun dropUnacceptedEffort(s: TierState) {
        if (s.pendingEffort.isNotEmpty() && pendingModelDef(s)?.efforts?.contains(s.pendingEffort) != true) s.pendingEffort = ""
    }

    /** The tier's pending reasoning effort ("" = the CLI default). */
    fun currentEffort(tier: String): String = state(tier).pendingEffort

    /** Pick a tier's reasoning effort ('' or one the pending model accepts; anything else is ignored). */
    fun selectEffort(tier: String, effort: String) {
        val s = state(tier)
        if (effort == "" || pendingModelDef(s)?.efforts?.contains(effort) == true) s.pendingEffort = effort
    }

    private fun label(m: DefinedModelDto): String = buildString {
        append(m.displayName?.takeIf { it.isNotBlank() && it != m.id }?.let { "$it (${m.id})" } ?: m.id)
        if (m.aliases.isNotEmpty()) append(" · ").append(m.aliases.joinToString(", "))
        if (m.installed == false) append(" — not installed")
        if (m.source == "user-approved") append(" — approved")
        if (m.hosting != null) append(" — ").append(m.hosting)
    }

    /**
     * The model dropdown choices for a tier: the pending runner's models from the
     * definitions, prefixed with a non-selectable [ModelChoice.CurrentNotInCatalog] for a
     * configured model the definitions do not list (until the user changes away from it),
     * or a [ModelChoice.SelectPrompt] when no model is chosen. A family with no models is
     * the single [ModelChoice.NoModels] sentinel.
     */
    fun modelOptions(tier: String): List<ModelChoice> {
        val s = state(tier)
        val fam = family(s.pendingRunner)
        if (fam == null || fam.models.isEmpty()) return listOf(ModelChoice.NoModels)
        val choices = fam.models.map { ModelChoice.Model(id = it.id, label = label(it), current = it.id == s.pendingModel) }
        val prefix = when {
            !s.saved.listed && s.pendingRunner == s.saved.runner && s.pendingModel == s.saved.model && s.pendingModel.isNotEmpty() ->
                listOf(ModelChoice.CurrentNotInCatalog(s.pendingModel, hosted = fam.host != null))
            choices.none { it.current } -> listOf(ModelChoice.SelectPrompt)
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
        val s = state(tier)
        s.pendingModel = id
        dropUnacceptedEffort(s)
    }

    /**
     * Switch a tier's runner: the new family's default for the tier (tierDefaults with its
     * effort when the model takes it, else the tool-loop model, else the first model, with
     * no effort). A family the definitions do not serve, or one with no models, is ignored.
     */
    fun selectRunner(tier: String, runner: String) {
        val s = state(tier)
        if (s.pendingRunner == runner) return
        val fam = family(runner) ?: return
        val (model, effort) = familyDefault(fam, tier) ?: return
        s.pendingRunner = fam.id
        s.pendingModel = model.id
        s.pendingEffort = effort
    }

    /**
     * The dirty tiers that cannot be saved, with the reason: a tier whose pending model the
     * definitions do not list (an edit of a tier still on a model that is no longer listed)
     * or with no model chosen. [collectWrites] leaves them out; the user must pick a listed
     * model first, so no unlisted model is ever written.
     */
    fun unsavable(): Map<String, String> = TIERS.mapNotNull { tier ->
        val s = states.getValue(tier)
        when {
            !dirty(s) -> null
            s.pendingModel.isEmpty() -> tier to "choose a model for the $tier tier first"
            pendingModelDef(s) == null -> {
                // A family on a host refuses the model outright (the tier will not run), so say so.
                val hosted = family(s.pendingRunner)?.takeIf { it.host != null }
                val why = if (hosted != null) "is not supported by ${hosted.displayName}" else "is not listed"
                tier to "choose a listed model for the $tier tier first (${s.pendingModel} $why)"
            }
            else -> null
        }
    }.toMap()

    /** True iff any tier has a pending edit different from its saved baseline. */
    fun isModified(): Boolean = states.values.any { dirty(it) }

    private fun dirty(s: TierState): Boolean =
        s.pendingRunner != s.saved.runner || s.pendingModel != s.saved.model || s.pendingEffort != s.saved.effort

    /** Drop all pending edits, restoring every tier to its saved baseline. */
    fun revert() {
        for (s in states.values) {
            s.pendingRunner = s.saved.runner
            s.pendingModel = s.saved.model
            s.pendingEffort = s.saved.effort
        }
    }

    /**
     * One whole-tier write per dirty, savable tier: {runner, model, effort} at
     * ['models','tiers',tier] — never a single leaf, so the daemon never sees a half-changed
     * tier. Tiers in [unsavable] are left out.
     */
    fun collectWrites(): List<PendingWrite> {
        val refused = unsavable()
        return TIERS.mapNotNull { tier ->
            val s = states.getValue(tier)
            if (!dirty(s) || tier in refused) return@mapNotNull null
            PendingWrite(
                listOf("models", "tiers", tier),
                WriteOp.Set(mapOf("runner" to s.pendingRunner, "model" to s.pendingModel, "effort" to s.pendingEffort)),
            )
        }
    }

    /** Advance a tier's saved baseline after its writes persisted. */
    fun onSaved(tier: String) {
        val s = state(tier)
        s.saved = Resolved(s.pendingRunner, s.pendingModel, s.pendingEffort, listed = pendingModelDef(s) != null, note = null)
    }

    /**
     * Replace the definitions (a Refresh, or after an approval and restart) without
     * dropping pending edits: a clean tier is re-resolved; a dirty one keeps its edit.
     */
    fun updateDefinitions(definitions: ModelDefinitionsDto) {
        defs = definitions
        for ((tier, s) in states) {
            val wasDirty = dirty(s)
            s.saved = resolve(tier)
            if (!wasDirty) {
                s.pendingRunner = s.saved.runner
                s.pendingModel = s.saved.model
                s.pendingEffort = s.saved.effort
            }
        }
    }
}

/** A model dropdown entry: a selectable model, a non-selectable current marker, or the empty sentinel. */
sealed interface ModelChoice {
    val label: String

    /** A selectable model from the definitions; [current] marks the tier's selected one. */
    data class Model(val id: String, override val label: String, val current: Boolean) : ModelChoice

    /** A non-selectable marker showing a configured model the definitions do not list ([hosted]: its family runs on a host, so the tier will not run). */
    data class CurrentNotInCatalog(val id: String, val hosted: Boolean = false) : ModelChoice {
        override val label: String = if (hosted) "(current, not supported): $id" else "(current, not listed): $id"
    }

    /** A non-selectable prompt shown when no concrete model is chosen, so the combo never falsely pre-selects one. */
    data object SelectPrompt : ModelChoice {
        override val label: String = "— select a model —"
    }

    /** The disabled sentinel shown when the family lists no models. */
    data object NoModels : ModelChoice {
        override val label: String = "no models available"
    }
}
