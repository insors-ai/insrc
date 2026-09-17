package ai.insors.insrc.jetbrains.onboarding

import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType

/**
 * S005-internal seam over the one-click "Enable insrc for this project" IDE notification
 * (Story S005 / t1). A fun-interface so the onboarding orchestration is unit-testable with a
 * fake that captures (projectRootPath, onAccept) without an IDE.
 */
fun interface OnboardingOffer {
    /**
     * Surface the passive one-click offer scoped to [projectRootPath]; [onAccept] runs when the
     * developer clicks Enable. The offer itself registers/allocates nothing (k2/lc1) — registration
     * happens only inside [onAccept].
     */
    fun offerEnable(projectRootPath: String, onAccept: () -> Unit)
}

/**
 * The production [OnboardingOffer] (Story S005 / t1): the 'insrc' BALLOON NotificationGroup plus a
 * single "Enable" [NotificationAction] whose click expires the balloon and runs [onAccept] — the
 * same shape as [DaemonLifecycleService.showOfferSetupNotification][ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleService].
 * Purely an IDE notification: it opens no cloud path (k1) and allocates nothing by itself.
 */
object NotificationOnboardingOffer : OnboardingOffer {
    override fun offerEnable(projectRootPath: String, onAccept: () -> Unit) {
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup("insrc")
            .createNotification("insrc: enable for this project?", NotificationType.INFORMATION)
        notification.addAction(NotificationAction.createSimple("Enable") {
            notification.expire()
            onAccept()
        })
        notification.notify(null)
    }
}
