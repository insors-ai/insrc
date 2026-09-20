package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.RepoOverrideDto
import ai.insors.insrc.jetbrains.daemon.RoleDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import ai.insors.insrc.jetbrains.daemon.TierSpecDto

/**
 * The settings-page framework's PURE view logic (Story S002 / sc3), kept out of
 * the Swing/Configurable shell so grouping + current-vs-default display are
 * unit-testable headlessly (the review-epic split that repeatedly caught silent
 * UI defects).
 */

/** One group's options, in catalog order — one collapsible panel on the page. */
data class SettingsGroupModel(
    val group: String,
    val options: List<ConfigOptionDto>,
)

/**
 * The extension seam where downstream stories plug their own sub-sections into
 * the settings page: the per-role overrides (S004) and per-repo overrides
 * (S005). S002 declares it but registers no override section.
 */
interface SettingsSection {
    val title: String
    fun component(): javax.swing.JComponent
    fun isModified(): Boolean
    fun apply()
    fun reset()
}

object SettingsView {

    /**
     * Bucket the catalog's options into ordered [SettingsGroupModel]s:
     *   - groups appear in the payload's `groups` order first;
     *   - a group with no options yields NO model (no empty panel);
     *   - an option whose group is not listed in `groups` falls into a trailing
     *     bucket (in first-seen order), so no option is ever dropped.
     * Every option appears in exactly one model.
     */
    fun groupsOf(catalog: SettingsCatalogDto): List<SettingsGroupModel> {
        // Preserve option order per group.
        val byGroup = LinkedHashMap<String, MutableList<ConfigOptionDto>>()
        for (opt in catalog.options) {
            byGroup.getOrPut(opt.group) { mutableListOf() }.add(opt)
        }
        val out = mutableListOf<SettingsGroupModel>()
        val emitted = HashSet<String>()
        // Declared groups first, in payload order (skip ones with no options).
        for (g in catalog.groups) {
            val opts = byGroup[g] ?: continue
            out.add(SettingsGroupModel(g, opts))
            emitted.add(g)
        }
        // Any option whose group was not in groups[] — trailing, first-seen order.
        for ((g, opts) in byGroup) {
            if (g !in emitted) out.add(SettingsGroupModel(g, opts))
        }
        return out
    }

    /**
     * The read-only display string for one option: the current value when set,
     * else the default rendered with an explicit "(default)" marker so an unset
     * setting is never shown as a blank field (ac2).
     *
     * A set-but-null currentValue (an unusual config that maps a path to JSON
     * null) falls back to the default rather than showing the literal "null".
     */
    fun displayValue(option: ConfigOptionDto): String {
        if (option.isSet && option.currentValue != null) return render(option.currentValue)
        val default = option.default
        return "${if (default != null) render(default) else "—"} (default)"
    }

    /**
     * Render one config value for display. The real socket transport parses JSON
     * numbers through Gson (ToNumberPolicy.DOUBLE), so every numeric default and
     * currentValue arrives as a [Double] — a naive toString() would print an
     * integral setting like `40` as "40.0" (and a large one as "1.2E5"). Collapse
     * an integral Number back to its whole-number form; everything else is
     * toString() verbatim.
     */
    /**
     * Render a scalar value for an EDIT field (no "(default)" marker): an integral
     * number comes back without the Gson-Double artifact ("40", not "40.0"); null
     * is the empty string. Used by S003 to seed number/text editors.
     */
    fun renderScalar(value: Any?): String = if (value == null) "" else render(value)

    private fun render(value: Any): String {
        if (value is Number) {
            val d = value.toDouble()
            if (!d.isInfinite() && !d.isNaN() && d == Math.floor(d) && Math.abs(d) < 1e15) {
                return value.toLong().toString()
            }
        }
        return value.toString()
    }
}

/** The kind of edit control a setting's declared type maps to (Story S003 / ac1). */
enum class ControlKind { CHOOSER, TOGGLE, NUMBER, TEXT }

/** The operation a [PendingWrite] carries: set a parsed value, or clear the key. */
sealed interface WriteOp {
    /** Persist [value] (already parsed to the right JVM type). */
    data class Set(val value: Any?) : WriteOp

    /** Remove the key so the daemon default governs (reset-to-default / override removal). */
    data object Clear : WriteOp
}

/** One dirty setting the Configurable applies via sc2: literal [segments] + the [op]. */
data class PendingWrite(val segments: List<String>, val op: WriteOp)

/**
 * The pure, headless edit state for the whole settings page (Story S003 / sc3
 * internal). Kept out of the Swing/Configurable shell so the load-bearing logic
 * — per-type validation, dirty-vs-last-saved, reset semantics, and the segment/op
 * mapping — is unit-testable (the review-epic split). The Configurable is a thin
 * shell that renders controls, pushes edits in via [editField]/[revertField]/
 * [markResetToDefault], and delegates its native isModified/apply/reset here.
 *
 * Number parsing tolerates the Gson-Double catalog shape (an integral default
 * arrives as e.g. 40.0), so re-typing the same number is NOT counted as an edit
 * (unchanged settings are never written — ac2).
 */
class SettingsEditModel(catalog: SettingsCatalogDto) {

    private class FieldState(val option: ConfigOptionDto) {
        var savedIsSet: Boolean = option.isSet
        var savedValue: Any? = if (option.isSet) option.currentValue else null
        var edited: Boolean = false
        var pendingRaw: Any? = null
        var resetToDefault: Boolean = false
    }

    private val fields: Map<String, FieldState> =
        catalog.options.associate { it.path to FieldState(it) }

    private fun field(path: String): FieldState =
        fields[path] ?: throw IllegalArgumentException("unknown setting path: $path")

    /** The control kind for one setting's declared type (ac1). */
    fun controlKind(path: String): ControlKind = controlKindFor(field(path).option)

    /** Record a user edit (raw control input: a Boolean from a toggle, else a String). Clears any reset flag. */
    fun editField(path: String, rawInput: Any?) {
        val f = field(path)
        f.edited = true
        f.pendingRaw = rawInput
        f.resetToDefault = false
    }

    /** Revert one field to its last-saved value (drops any edit / reset). */
    fun revertField(path: String) {
        val f = field(path)
        f.edited = false
        f.pendingRaw = null
        f.resetToDefault = false
    }

    /** Mark one field to be reset to its catalog default (a clear). Drops any pending edit. */
    fun markResetToDefault(path: String) {
        val f = field(path)
        f.resetToDefault = true
        f.edited = false
        f.pendingRaw = null
    }

    /**
     * The validation error for one field's pending edit, or null when it is valid
     * (or not edited). A number that does not parse, or an enum value outside the
     * declared set, is invalid; an empty string is a VALID string.
     */
    fun validationError(path: String): String? {
        val f = field(path)
        if (!f.edited || f.resetToDefault) return null
        return when (controlKindFor(f.option)) {
            ControlKind.NUMBER ->
                if (parseNumber(f.pendingRaw) == null) "must be a number" else null
            ControlKind.CHOOSER -> {
                val allowed = f.option.enumValues
                val v = f.pendingRaw?.toString()
                if (allowed != null && v !in allowed) "must be one of: ${allowed.joinToString(", ")}" else null
            }
            ControlKind.TOGGLE, ControlKind.TEXT -> null
        }
    }

    /** True iff any field carries an unsaved change (a real value change, a reset of a set key, or an invalid edit). */
    fun isModified(): Boolean = fields.values.any { it.dirtyOrInvalid() }

    /**
     * The dirty, validation-clean fields as [PendingWrite]s the Configurable
     * applies via sc2. A field with a [validationError] is EXCLUDED (apply blocks
     * on it separately); a reset of an already-unset key is a no-op (excluded).
     */
    fun collectDirty(): List<PendingWrite> =
        fields.values.mapNotNull { f ->
            when {
                f.resetToDefault && f.savedIsSet ->
                    PendingWrite(segmentsOf(f.option.path), WriteOp.Clear)
                f.edited && validationErrorOf(f) == null && parsedDiffers(f) ->
                    PendingWrite(segmentsOf(f.option.path), WriteOp.Set(parsedValue(f)))
                else -> null
            }
        }

    /** Advance one field's last-saved baseline after its write persisted (ac2/ac3). */
    fun onSaved(path: String) {
        val f = field(path)
        if (f.resetToDefault) {
            f.savedIsSet = false
            f.savedValue = null
        } else if (f.edited) {
            f.savedIsSet = true
            f.savedValue = parsedValue(f)
        }
        f.edited = false
        f.pendingRaw = null
        f.resetToDefault = false
    }

    /**
     * The value a control should display for one field (on build and after a
     * revert/reset): the pending edit when editing, the catalog default when
     * marked reset-to-default, else the last-saved value when set, else the
     * default. Booleans come back as Boolean; other types as their raw value.
     */
    fun controlValue(path: String): Any? {
        val f = field(path)
        return when {
            f.resetToDefault -> f.option.default
            f.edited -> f.pendingRaw
            // A set-but-null value (a config key explicitly mapped to null) shows
            // the default, matching SettingsView.displayValue — never a blank/false
            // control that misrepresents the effective value.
            f.savedIsSet && f.savedValue != null -> f.savedValue
            else -> f.option.default
        }
    }

    // ---- internals -----------------------------------------------------------

    private fun FieldState.dirtyOrInvalid(): Boolean = when {
        resetToDefault -> savedIsSet // resetting an already-unset key is a no-op
        edited -> validationErrorOf(this) != null || parsedDiffers(this)
        else -> false
    }

    private fun validationErrorOf(f: FieldState): String? = validationError(f.option.path)

    /**
     * Whether the field's parsed pending value differs from what is effectively in
     * force. For a SET key that is the last-saved value; for an UNSET key it is the
     * catalog default (which the control is showing) — so re-selecting an unset
     * field's own default is NOT a change and is never written (ac2).
     */
    private fun parsedDiffers(f: FieldState): Boolean {
        val effective = if (f.savedIsSet && f.savedValue != null) f.savedValue else f.option.default
        return !valuesEqual(parsedValue(f), effective)
    }

    /** The typed value for a valid pending edit (Boolean / Number / String). */
    private fun parsedValue(f: FieldState): Any? = when (controlKindFor(f.option)) {
        ControlKind.TOGGLE -> f.pendingRaw as? Boolean ?: f.pendingRaw?.toString()?.toBoolean() ?: false
        ControlKind.NUMBER -> parseNumber(f.pendingRaw)
        ControlKind.CHOOSER, ControlKind.TEXT -> f.pendingRaw?.toString() ?: ""
    }

    private companion object {
        fun controlKindFor(option: ConfigOptionDto): ControlKind = when (option.type) {
            "enum" -> ControlKind.CHOOSER
            "boolean" -> ControlKind.TOGGLE
            "number" -> ControlKind.NUMBER
            else -> ControlKind.TEXT
        }

        /** Split a config path into literal segments (lc1/k4 — passed verbatim to config.write). */
        fun segmentsOf(path: String): List<String> = path.split('.')

        /** Parse a numeric editor input, preferring an integral Long; null when it does not parse. */
        fun parseNumber(raw: Any?): Number? {
            if (raw is Number) return raw
            val s = raw?.toString()?.trim() ?: return null
            if (s.isEmpty()) return null
            return s.toLongOrNull() ?: s.toDoubleOrNull()
        }

        /** Numeric-aware equality: two Numbers compare by their double value (40L == 40.0). */
        fun valuesEqual(a: Any?, b: Any?): Boolean {
            if (a is Number && b is Number) return a.toDouble() == b.toDouble()
            return a == b
        }
    }
}

/** One per-role override row the section renders (Story S004 / ac1). */
data class PerRoleRow(
    val roleId: String,
    /** The tier in effect: the pending override when overridden, else the role's default. */
    val effectiveTier: String,
    /** True when this role has a pending explicit override (vs default routing). */
    val isOverride: Boolean,
)

/**
 * The pure, headless per-role overrides editor state (Story S004 / sc4 internal),
 * kept out of the Swing section so the load-bearing logic — override-vs-default,
 * add/change/remove intent, dirty tracking, and the roleId->literal-segment
 * mapping — is unit-testable (the review-epic split).
 *
 * A per-role override lives at config's models.tasks.<roleId> = a tier name; a
 * role absent from that map uses its RoleDescriptor.defaultTier. The write goes
 * through sc2 with the roleId as ONE literal segment (listOf("models","tasks",
 * roleId)) so a DOTTED roleId (e.g. "design.contract.detail") is never mis-nested
 * (k4), and each write touches exactly that one key (per-key isolation, ac2/ac3).
 */
class PerRoleOverridesModel(
    roles: List<RoleDto>,
    private val tierNames: List<String>,
    current: Map<String, String>,
) {
    private class RoleState(val role: RoleDto, var saved: String?) {
        /** The desired override: a tier name, or null = no override (default routing). */
        var pending: String? = saved
    }

    // Preserve role order for stable rendering.
    private val states: Map<String, RoleState> =
        roles.associate { it.id to RoleState(it, current[it.id]) }
    private val order: List<String> = roles.map { it.id }

    private fun state(roleId: String): RoleState =
        states[roleId] ?: throw IllegalArgumentException("unknown roleId: $roleId")

    /** The allowed tier names (from sc1) — the chooser's options. */
    fun tierNames(): List<String> = tierNames

    /** One row per recognized role, reflecting the PENDING state (ac1). */
    fun rows(): List<PerRoleRow> = order.map { roleId ->
        val s = states.getValue(roleId)
        val override = s.pending
        PerRoleRow(
            roleId = roleId,
            effectiveTier = override ?: s.role.defaultTier,
            isOverride = override != null,
        )
    }

    /** Set (or change) a role's override to [tier] (one of tierNames). */
    fun setOverride(roleId: String, tier: String) {
        require(tier in tierNames) { "unknown tier: $tier" }
        state(roleId).pending = tier
    }

    /** Remove a role's override so it falls back to default routing. */
    fun removeOverride(roleId: String) {
        state(roleId).pending = null
    }

    /** Drop all pending intent, restoring every role to its last-saved override. */
    fun revert() {
        for (s in states.values) s.pending = s.saved
    }

    /** True iff any role's pending override differs from its last-saved state. */
    fun isModified(): Boolean = states.values.any { it.pending != it.saved }

    /**
     * The dirty roles as [PendingWrite]s: a set/change -> Set(tier) at
     * listOf("models","tasks",roleId); a removal -> Clear. roleId is ONE literal
     * segment (dots intact). Only changed roles appear (same-tier not dirty;
     * remove-of-unset a no-op) — per-key isolation (ac2/ac3).
     */
    fun collectWrites(): List<PendingWrite> = order.mapNotNull { roleId ->
        val s = states.getValue(roleId)
        if (s.pending == s.saved) return@mapNotNull null
        val segments = listOf("models", "tasks", roleId)
        val pending = s.pending
        if (pending != null) PendingWrite(segments, WriteOp.Set(pending))
        else PendingWrite(segments, WriteOp.Clear)
    }

    /** Advance one role's last-saved baseline after its write persisted (ac2/ac3). */
    fun onSaved(roleId: String) {
        val s = state(roleId)
        s.saved = s.pending
    }
}

// ── Per-repo overrides (Story S005) ──────────────────────────────────────────

/** Which leaf of a per-repo tier spec a [PerRepoOverridesModel.setTierField] edits. */
enum class TierField(val segment: String) {
    Runner("runner"),
    Model("model"),
}

/**
 * One per-repo override row the section renders (Story S005 / ac1): a repository
 * with an override, carrying its full nested pending state — the scalar
 * [coreFloor], the per-role [tasks] (roleId -> tier) map, and the per-tier
 * [tiers] (tierName -> {runner,model}) map — plus [hasOverride] (always true for
 * a rendered row).
 */
data class PerRepoRow(
    val repoPath: String,
    val coreFloor: String?,
    val tasks: Map<String, String>,
    val tiers: Map<String, TierSpecDto>,
    val hasOverride: Boolean,
)

/**
 * The pure, headless per-repo overrides editor state (Story S005 / sc5 internal),
 * kept out of the Swing section so the load-bearing logic — which repos are
 * overridden, the nested coreFloor/tasks/tiers edits, dirty tracking, and the
 * repoPath -> literal-nested-segment mapping — is unit-testable (the S002-S004
 * split; mirror-references the S004 [PerRoleOverridesModel] shape).
 *
 * A per-repo override lives under config's models.byRepo.<repoPath>.{coreFloor |
 * tasks.<roleId> | tiers.<tierName>.<runner|model>}. Every write goes through sc2
 * with the repoPath (and any dotted roleId) as ONE literal segment (k4), so a
 * dotted/slashed path never mis-nests, and each write touches exactly that one
 * leaf — per-repo isolation (ac2/ac3, lc1). Removing a whole override is ONE
 * Clear at models.byRepo.<repoPath> (drops the entire subtree), never per-leaf.
 */
class PerRepoOverridesModel(
    registeredRepos: List<String>,
    roles: List<RoleDto>,
    private val tierNames: List<String>,
    current: Map<String, RepoOverrideDto>,
) {
    private val roleList: List<RoleDto> = roles
    private val roleIds: Set<String> = roles.map { it.id }.toSet()

    /** Mutable per-tier spec (runner/model), the working + saved copies of one tier. */
    private class Tier(var runner: String?, var model: String?) {
        fun copy(): Tier = Tier(runner, model)
        fun toDto(): TierSpecDto = TierSpecDto(runner, model)
    }

    private class RepoState(saved: RepoOverrideDto?) {
        // The last-saved baseline (mutable so onSaved can advance one leaf at a time).
        var savedPresent: Boolean = saved != null
        var savedCoreFloor: String? = saved?.coreFloor
        val savedTasks: MutableMap<String, String> = saved?.tasks?.toMutableMap() ?: mutableMapOf()
        val savedTiers: MutableMap<String, Tier> =
            (saved?.tiers ?: emptyMap()).mapValues { Tier(it.value.runner, it.value.model) }.toMutableMap()

        // The pending working copy, initialized from the baseline.
        var present: Boolean = savedPresent
        var coreFloor: String? = savedCoreFloor
        val tasks: MutableMap<String, String> = savedTasks.toMutableMap()
        val tiers: MutableMap<String, Tier> = savedTiers.mapValues { it.value.copy() }.toMutableMap()
    }

    // A stable order over EVERY known repoPath: the currently-overridden ones
    // (config.show order) first, then registered repos with no override. No write
    // ever targets a repoPath outside this set (addOverride requires a registered one).
    private val order: List<String> =
        current.keys.toList() + registeredRepos.filter { it !in current.keys }
    private val registeredOrder: List<String> = registeredRepos
    private val states: Map<String, RepoState> =
        order.associateWith { RepoState(current[it]) }

    private fun state(repoPath: String): RepoState =
        states[repoPath] ?: throw IllegalArgumentException("unknown repoPath: $repoPath")

    /** The allowed tier names (from sc1) — the coreFloor/tasks choosers' options. */
    fun tierNames(): List<String> = tierNames

    /** The recognized roles (from sc1) — the per-repo tasks (role->tier) editor's rows. */
    fun roles(): List<RoleDto> = roleList

    /** One row per repository that currently has a (pending) override (ac1). */
    fun rows(): List<PerRepoRow> = order.mapNotNull { repoPath ->
        val s = states.getValue(repoPath)
        if (!s.present) return@mapNotNull null
        PerRepoRow(
            repoPath = repoPath,
            coreFloor = s.coreFloor,
            tasks = s.tasks.toMap(),
            tiers = s.tiers.mapValues { it.value.toDto() },
            hasOverride = true,
        )
    }

    /** Registered repos with no (pending) override — the add-override candidates. */
    fun addableRepos(): List<String> = registeredOrder.filter { !states.getValue(it).present }

    /** Add an (empty) override for a registered repo that has none yet. */
    fun addOverride(repoPath: String) {
        val s = state(repoPath)
        require(!s.present) { "repo already has an override: $repoPath" }
        s.present = true
    }

    /** Remove a repo's whole override (a single Clear at the repoPath on apply). */
    fun removeOverride(repoPath: String) {
        state(repoPath).present = false
    }

    /** Set (or clear, with null) a repo's coreFloor tier. */
    fun setCoreFloor(repoPath: String, tier: String?) {
        require(tier == null || tier in tierNames) { "unknown tier: $tier" }
        state(repoPath).coreFloor = tier
    }

    /** Set (or clear, with null) a repo's per-role task tier. */
    fun setTaskTier(repoPath: String, roleId: String, tier: String?) {
        require(roleId in roleIds) { "unknown roleId: $roleId" }
        require(tier == null || tier in tierNames) { "unknown tier: $tier" }
        val s = state(repoPath)
        if (tier == null) s.tasks.remove(roleId) else s.tasks[roleId] = tier
    }

    /** Set (or clear, with null/empty) one leaf (runner|model) of a repo's per-tier spec. */
    fun setTierField(repoPath: String, tierName: String, field: TierField, value: String?) {
        require(tierName in tierNames) { "unknown tier: $tierName" }
        val s = state(repoPath)
        val v = value?.takeIf { it.isNotEmpty() }
        val tier = s.tiers.getOrPut(tierName) { Tier(null, null) }
        when (field) {
            TierField.Runner -> tier.runner = v
            TierField.Model -> tier.model = v
        }
        // Drop a tier that has neither leaf so it does not linger as an empty spec.
        if (tier.runner == null && tier.model == null) s.tiers.remove(tierName)
    }

    /** Drop all pending intent, restoring every repo to its last-saved override. */
    fun revert() {
        for (s in states.values) {
            s.present = s.savedPresent
            s.coreFloor = s.savedCoreFloor
            s.tasks.clear(); s.tasks.putAll(s.savedTasks)
            s.tiers.clear()
            for ((k, v) in s.savedTiers) s.tiers[k] = v.copy()
        }
    }

    /** True iff any repo's pending state differs from its last-saved baseline. */
    fun isModified(): Boolean = states.values.any { repoModified(it) }

    private fun repoModified(s: RepoState): Boolean {
        if (s.savedPresent && !s.present) return true // whole-override removal pending
        if (!s.present) return false // never added, or add-then-remove
        return leavesDiffer(s)
    }

    private fun leavesDiffer(s: RepoState): Boolean {
        if (s.coreFloor != s.savedCoreFloor) return true
        if (s.tasks != s.savedTasks) return true
        val names = s.tiers.keys + s.savedTiers.keys
        for (name in names) {
            val p = s.tiers[name]
            val q = s.savedTiers[name]
            if ((p?.runner) != (q?.runner) || (p?.model) != (q?.model)) return true
        }
        return false
    }

    /**
     * The dirty repos as leaf-granular [PendingWrite]s (per-key isolation, ac2/ac3):
     *   - a whole-override removal  -> ONE Clear at [models,byRepo,repoPath];
     *   - else each changed leaf    -> Set/Clear at its literal nested segment array
     *     (coreFloor / tasks.<roleId> / tiers.<tierName>.<runner|model>).
     * repoPath and a dotted roleId are each ONE literal segment (k4). Only changed
     * leaves appear; same-value not dirty, add-then-revert / clear-of-unset a no-op.
     */
    fun collectWrites(): List<PendingWrite> {
        val out = mutableListOf<PendingWrite>()
        for (repoPath in order) {
            val s = states.getValue(repoPath)
            if (s.savedPresent && !s.present) {
                // Drop the entire override subtree in a single Clear.
                out.add(PendingWrite(base(repoPath), WriteOp.Clear))
                continue
            }
            if (!s.present) continue
            // coreFloor leaf.
            if (s.coreFloor != s.savedCoreFloor) {
                val seg = base(repoPath) + "coreFloor"
                out.add(PendingWrite(seg, s.coreFloor?.let { WriteOp.Set(it) } ?: WriteOp.Clear))
            }
            // tasks leaves.
            for (roleId in (s.tasks.keys + s.savedTasks.keys)) {
                val pv = s.tasks[roleId]
                val qv = s.savedTasks[roleId]
                if (pv == qv) continue
                val seg = base(repoPath) + "tasks" + roleId
                out.add(PendingWrite(seg, pv?.let { WriteOp.Set(it) } ?: WriteOp.Clear))
            }
            // tiers leaves (runner + model per tier, independently).
            for (tierName in (s.tiers.keys + s.savedTiers.keys)) {
                val p = s.tiers[tierName]
                val q = s.savedTiers[tierName]
                for (field in TierField.entries) {
                    val pv = if (field == TierField.Runner) p?.runner else p?.model
                    val qv = if (field == TierField.Runner) q?.runner else q?.model
                    if (pv == qv) continue
                    val seg = base(repoPath) + "tiers" + tierName + field.segment
                    out.add(PendingWrite(seg, pv?.let { WriteOp.Set(it) } ?: WriteOp.Clear))
                }
            }
        }
        return out
    }

    /**
     * Advance the last-saved baseline for exactly the leaf named by [segments]
     * (or the whole repo on a repoPath Clear) after its write persisted (ac2/ac3).
     * [segments] is a PendingWrite's segment array from [collectWrites].
     */
    fun onSaved(segments: List<String>) {
        // segments = [models, byRepo, repoPath, ...]
        if (segments.size < 3) return
        val repoPath = segments[2]
        val s = states[repoPath] ?: return
        when {
            segments.size == 3 -> {
                // Whole-override removal persisted: the repo leaves the baseline AND
                // its working copy is wiped, so a re-add in the same dialog starts from
                // a clean slate rather than resurrecting the just-dropped subtree. (The
                // working copy is only reset here, on the PERSISTED clear — an
                // un-applied remove keeps its working leaves so revert() / a remove-then-
                // re-add without Apply still returns to the saved override.)
                s.savedPresent = false
                s.savedCoreFloor = null
                s.savedTasks.clear()
                s.savedTiers.clear()
                s.present = false
                s.coreFloor = null
                s.tasks.clear()
                s.tiers.clear()
            }
            segments.size == 4 && segments[3] == "coreFloor" -> {
                s.savedPresent = true
                s.savedCoreFloor = s.coreFloor
            }
            segments.size == 5 && segments[3] == "tasks" -> {
                s.savedPresent = true
                val roleId = segments[4]
                val v = s.tasks[roleId]
                if (v == null) s.savedTasks.remove(roleId) else s.savedTasks[roleId] = v
            }
            segments.size == 6 && segments[3] == "tiers" -> {
                s.savedPresent = true
                val tierName = segments[4]
                val field = segments[5]
                val pending = s.tiers[tierName]
                val saved = s.savedTiers.getOrPut(tierName) { Tier(null, null) }
                if (field == "runner") saved.runner = pending?.runner
                if (field == "model") saved.model = pending?.model
                if (saved.runner == null && saved.model == null) s.savedTiers.remove(tierName)
            }
        }
    }

    private fun base(repoPath: String): List<String> = listOf("models", "byRepo", repoPath)
}
