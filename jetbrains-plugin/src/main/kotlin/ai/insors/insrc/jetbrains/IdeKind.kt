package ai.insors.insrc.jetbrains

/**
 * The four JetBrains IDEs this plugin targets (Story S001 / sc1).
 *
 * Resolved once at project-open from the running IDE's product code. The
 * product-code -> [IdeKind] mapping is private to S001; downstream stories
 * receive the resolved [IdeKind] on [ProjectContext] and never re-derive it.
 */
enum class IdeKind {
    IDEA,
    PYCHARM,
    GOLAND,
    WEBSTORM,
    ;

    companion object {
        /**
         * Map an IntelliJ Platform product code (e.g. from
         * `ApplicationInfo.getBuild().productCode`) to an [IdeKind], or `null`
         * when the plugin is running in an IDE outside the four supported ones.
         *
         * Codes: IDEA = IC/IU, PyCharm = PC/PY, GoLand = GO, WebStorm = WS.
         */
        fun fromProductCode(productCode: String?): IdeKind? =
            when (productCode?.trim()?.uppercase()) {
                "IC", "IU" -> IDEA
                "PC", "PY" -> PYCHARM
                "GO" -> GOLAND
                "WS" -> WEBSTORM
                else -> null
            }
    }
}
