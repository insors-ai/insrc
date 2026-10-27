package ai.insors.insrc.jetbrains.settings

import com.intellij.openapi.options.ConfigurationException

/**
 * Finish the settings page's Apply (Epic ce99b72065d03b1b, Story s7), after the background
 * save loop: when any saved write needs a daemon restart, [offerRestart] is called once —
 * before the failures are reported, so a saved change that needs a restart is not lost
 * behind an error — and then any [failures] are thrown as one [ConfigurationException].
 */
internal fun finishApply(restartRequired: Boolean, failures: List<String>, offerRestart: () -> Unit) {
    if (restartRequired) offerRestart()
    if (failures.isNotEmpty()) {
        throw ConfigurationException("Some settings could not be saved:\n" + failures.joinToString("\n"))
    }
}
