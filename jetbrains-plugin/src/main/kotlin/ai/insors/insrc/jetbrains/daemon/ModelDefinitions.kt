package ai.insors.insrc.jetbrains.daemon

/*
 * The daemon's model definitions and the unknown-model check, as the JetBrains plugin
 * reads them (Epic ce99b72065d03b1b, Story s7). The answers of `models.definitions`,
 * `models.check` and `models.approve` / `models.reject` are typed here structurally —
 * the plugin keeps no family, model or effort list of its own; every choice it offers
 * comes from these answers.
 */

/** One model of a family, as the daemon serves it. */
data class DefinedModelDto(
    val id: String,
    val aliases: List<String>,
    val displayName: String?,
    val efforts: List<String>,
    /** 'shipped' or 'user-approved'. */
    val source: String,
    /** Local family only; null when Ollama did not answer. */
    val installed: Boolean?,
    /** 'cloud' or 'local' on a model of a family with a host (Epic b220bb61, s5); null otherwise. */
    val hosting: String? = null,
)

/** A family's default for one tier. */
data class TierDefaultDto(val model: String, val effort: String?)

/** One model family (runner), as the daemon serves it. */
data class DefinedFamilyDto(
    val id: String,
    /** 'claude' / 'codex' for a CLI family; null for the local (Ollama) family. */
    val cliKind: String?,
    val displayName: String,
    val tierDefaults: Map<String, TierDefaultDto>,
    val toolLoopModel: String?,
    val models: List<DefinedModelDto>,
    /** 'ollama' when the family runs its CLI on a host (Epic b220bb61, s5): its models are a closed list. */
    val host: String? = null,
)

/** The `models.definitions` answer. */
data class ModelDefinitionsDto(
    val defaultFamily: String,
    val families: List<DefinedFamilyDto>,
)

/**
 * What a failed daemon request means, in the user's terms. The JetBrains transport turns
 * every socket I/O failure (at connect or mid-call) into a [DaemonUnavailableException],
 * so a lost connection reads as [NotRunning]; the daemon's own 'unknown method: …' answer
 * is an older daemon; anything else is shown as it is.
 */
sealed interface DaemonFailure {
    val text: String

    data object NotRunning : DaemonFailure {
        override val text = "the daemon is not running or the connection was lost"
    }

    data class OlderDaemon(override val text: String) : DaemonFailure

    data class Other(override val text: String) : DaemonFailure

    companion object {
        /** Classify a framed error string from the daemon. */
        fun ofError(error: String): DaemonFailure =
            if (error.startsWith("unknown method: ")) {
                OlderDaemon("the daemon does not know this request ($error) — update the daemon (Settings › insrc › Daemon › Update)")
            } else {
                Other(error)
            }
    }
}

sealed interface ModelDefinitionsResult {
    data class Loaded(val definitions: ModelDefinitionsDto) : ModelDefinitionsResult
    data class Failed(val failure: DaemonFailure) : ModelDefinitionsResult
}

/** One effort level's verdict in a check. */
data class EffortCheckDto(val effort: String, val verdict: String, val evidence: String)

/** The `models.check` answer for a check the daemon ran (whether or not the model ran). */
data class ModelCheckDto(
    val checkId: String,
    val family: String,
    val modelId: String,
    val runs: Boolean,
    /** e.g. "200000 tokens"; null when the CLI did not report one. */
    val inputLimit: String?,
    val efforts: List<EffortCheckDto>,
    val error: String?,
)

sealed interface ModelCheckOutcome {
    data class Checked(val check: ModelCheckDto) : ModelCheckOutcome
    data class Failed(val failure: DaemonFailure) : ModelCheckOutcome
}

sealed interface ModelDecisionResult {
    /** The decision was recorded; it applies after a daemon restart. */
    data object Recorded : ModelDecisionResult

    /** The daemon refused: 'unknown-check' | 'model-did-not-run' | 'invalid-efforts' | 'write-failed'. */
    data class Refused(val reason: String, val detail: String) : ModelDecisionResult

    data class Failed(val failure: DaemonFailure) : ModelDecisionResult
}

private fun strings(v: Any?): List<String> = (v as? List<*>)?.filterIsInstance<String>() ?: emptyList()

private fun nonBlank(v: Any?): String? = (v as? String)?.takeIf { it.isNotBlank() }

/** Parse a `models.definitions` object; a malformed family or model is skipped. Null when no family survives. */
internal fun parseModelDefinitions(data: Map<String, Any?>): ModelDefinitionsDto? {
    val families = (data["families"] as? List<*>).orEmpty().mapNotNull { item ->
        val f = item as? Map<*, *> ?: return@mapNotNull null
        val id = nonBlank(f["id"]) ?: return@mapNotNull null
        val models = (f["models"] as? List<*>).orEmpty().mapNotNull { m ->
            val mm = m as? Map<*, *> ?: return@mapNotNull null
            DefinedModelDto(
                id = nonBlank(mm["id"]) ?: return@mapNotNull null,
                aliases = strings(mm["aliases"]),
                displayName = nonBlank(mm["displayName"]),
                efforts = strings(mm["efforts"]),
                source = nonBlank(mm["source"]) ?: "shipped",
                installed = mm["installed"] as? Boolean,
                hosting = nonBlank(mm["hosting"]),
            )
        }
        val defaults = (f["tierDefaults"] as? Map<*, *>).orEmpty().mapNotNull { (tier, d) ->
            val dd = d as? Map<*, *> ?: return@mapNotNull null
            val model = nonBlank(dd["model"]) ?: return@mapNotNull null
            (tier as? String ?: return@mapNotNull null) to TierDefaultDto(model, nonBlank(dd["effort"]))
        }.toMap()
        DefinedFamilyDto(
            id = id,
            cliKind = nonBlank(f["cliKind"]),
            displayName = nonBlank(f["displayName"]) ?: id,
            tierDefaults = defaults,
            toolLoopModel = nonBlank(f["toolLoopModel"]),
            models = models,
            host = nonBlank(f["host"]),
        )
    }
    if (families.isEmpty()) return null
    return ModelDefinitionsDto(defaultFamily = nonBlank(data["defaultFamily"]) ?: families.first().id, families = families)
}

/** Parse a `models.check` object; null when it is not a check (no checkId — an invalid-params reply). */
internal fun parseModelCheck(data: Map<String, Any?>): ModelCheckDto? {
    val checkId = nonBlank(data["checkId"]) ?: return null
    val limit = data["inputLimit"] as? Map<*, *>
    val max = (limit?.get("max") as? Number)?.toLong()
    return ModelCheckDto(
        checkId = checkId,
        family = nonBlank(data["family"]) ?: "",
        modelId = nonBlank(data["modelId"]) ?: "",
        runs = data["runs"] == true,
        inputLimit = max?.let { "$it ${nonBlank(limit["unit"]) ?: ""}".trim() },
        efforts = (data["efforts"] as? List<*>).orEmpty().mapNotNull { e ->
            val ee = e as? Map<*, *> ?: return@mapNotNull null
            EffortCheckDto(
                effort = nonBlank(ee["effort"]) ?: return@mapNotNull null,
                verdict = nonBlank(ee["verdict"]) ?: return@mapNotNull null,
                evidence = (ee["evidence"] as? String) ?: "",
            )
        },
        error = nonBlank(data["error"]),
    )
}
