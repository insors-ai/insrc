package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import ai.insors.insrc.jetbrains.daemon.ModelCheckDto
import ai.insors.insrc.jetbrains.daemon.ModelCheckOutcome
import ai.insors.insrc.jetbrains.daemon.ModelDecisionResult
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsResult

/**
 * Restart the daemon and confirm it is running again (Epic ce99b72065d03b1b, Story s7).
 * [run] is the lifecycle command (DaemonLifecycleCommandRunner.run in production); only a
 * restart whose status read then answers counts. Returns null on success, else the reason.
 */
class DaemonRestart(
    private val run: (LifecycleCommand) -> DaemonActionResult,
    private val gateway: DaemonGateway,
) {
    fun restart(): String? = when (val r = run(LifecycleCommand.RESTART)) {
        is DaemonActionResult.Failed -> "the daemon did not restart — ${r.reason}"
        is DaemonActionResult.Ok -> when (val status = gateway.daemonStatus()) {
            is DaemonStatusResult.Loaded -> null
            DaemonStatusResult.Stopped -> "the daemon is not running after the restart"
            is DaemonStatusResult.Unavailable -> "the daemon did not answer after the restart — ${status.reason}"
        }
    }
}

/**
 * The headless controller behind the Check model… dialog (Epic ce99b72065d03b1b, Story s7;
 * sc4). It checks a model a CLI family does not list, shows what the check found, records
 * the user's approval (with the efforts they tick, never a rejected one) or rejection, and
 * after an approval restarts the daemon and re-reads the definitions so the model can be
 * picked. It never writes a tier: the tier is saved only by the settings page's Apply.
 * Gateway calls block (the check runs a CLI): the dialog runs them off the EDT.
 */
class ModelCheckFlow(
    private val gateway: DaemonGateway,
    private var definitions: ModelDefinitionsDto,
    private val restarter: DaemonRestart,
) {
    /** The check being decided, if any. */
    var check: ModelCheckDto? = null
        private set

    /** What the dialog should tell the user now (a failure, a refusal, a confirmation), or null. */
    var message: String? = null
        private set

    /** True after an approval was recorded, until a restart confirms it. */
    var restartPending: Boolean = false
        private set

    /** True when the daemon no longer knows the check, so it must be run again. */
    var checkAgain: Boolean = false
        private set

    /** The families that can be checked: vendor CLI families only (the local family, and a CLI family on a host, take only their listed models). */
    fun families(): List<DefinedFamilyDto> = definitions.families.filter { it.cliKind != null && it.host == null }

    /** The efforts to try for [family]: every effort its listed models take, in order. */
    fun claimedEfforts(family: String): List<String> =
        definitions.families.firstOrNull { it.id == family }?.models?.flatMap { it.efforts }?.distinct() ?: emptyList()

    /** Run the check. Blocks. */
    fun runCheck(family: String, modelId: String) {
        check = null
        checkAgain = false
        restartPending = false
        message = null
        val id = modelId.trim()
        if (id.isEmpty()) {
            message = "enter a model id"
            return
        }
        when (val r = gateway.checkModel(family, id, claimedEfforts(family))) {
            is ModelCheckOutcome.Checked -> {
                check = r.check
                if (!r.check.runs) message = "${r.check.modelId} did not run — ${r.check.error ?: "no detail"}; it cannot be approved"
            }
            is ModelCheckOutcome.Failed -> message = "could not check the model — ${r.failure.text}"
        }
    }

    /** Approve is possible only for a check in which the model ran. */
    fun canApprove(): Boolean = check?.runs == true && !checkAgain

    /** Reject is possible for any check the daemon still holds. */
    fun canReject(): Boolean = check != null && !checkAgain

    /** The efforts the user may allow: those the check did not reject. */
    fun approvableEfforts(): List<String> = check?.efforts?.filter { it.verdict != "rejected" }?.map { it.effort } ?: emptyList()

    /** Record an approval with the [ticked] efforts (any rejected or unknown one is dropped). Blocks. */
    fun approve(ticked: List<String>) {
        val c = check ?: return
        if (!canApprove()) return
        val allowed = approvableEfforts()
        decide(c, approve = true, efforts = ticked.filter { it in allowed })
    }

    /** Record a rejection. Blocks. */
    fun reject() {
        val c = check ?: return
        if (!canReject()) return
        decide(c, approve = false, efforts = emptyList())
    }

    private fun decide(c: ModelCheckDto, approve: Boolean, efforts: List<String>) {
        when (val r = gateway.decideModel(c.checkId, approve, efforts)) {
            ModelDecisionResult.Recorded -> {
                restartPending = approve
                message = if (approve) {
                    "Approved ${c.modelId} — it can be used after a daemon restart"
                } else {
                    "Rejected ${c.modelId} — recorded; it applies after a daemon restart"
                }
            }
            is ModelDecisionResult.Refused -> {
                checkAgain = r.reason == "unknown-check"
                message = if (checkAgain) {
                    "the daemon no longer holds this check (${r.detail}) — check the model again"
                } else {
                    "the daemon refused — ${r.reason}${if (r.detail.isNotEmpty()) " — ${r.detail}" else ""}"
                }
            }
            is ModelDecisionResult.Failed -> message = "could not record the decision — ${r.failure.text}"
        }
    }

    /**
     * Restart the daemon and, once it is confirmed running, re-read the definitions.
     * Returns the fresh definitions (in which an approved model is now listed), or null
     * with [message] saying why. Blocks.
     */
    fun restartAndReload(): ModelDefinitionsDto? {
        restarter.restart()?.let {
            message = it
            return null
        }
        restartPending = false
        return when (val r = gateway.modelDefinitions()) {
            is ModelDefinitionsResult.Loaded -> {
                definitions = r.definitions
                val c = check
                val listed = c != null && r.definitions.families.any { f -> f.id == c.family && f.models.any { it.id == c.modelId } }
                message = if (listed) "The daemon restarted; ${c!!.modelId} can now be picked for a tier" else "The daemon restarted"
                r.definitions
            }
            is ModelDefinitionsResult.Failed -> {
                message = "the daemon restarted but its model definitions could not be read — ${r.failure.text}"
                null
            }
        }
    }
}
