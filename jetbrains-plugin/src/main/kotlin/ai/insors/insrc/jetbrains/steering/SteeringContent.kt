package ai.insors.insrc.jetbrains.steering

import java.io.InputStream

/**
 * S004-internal provider of the tracked-workflow steering body (Story S004 / t2).
 *
 * Returns the plugin-bundled copy of the backend's canonical `src/prompts/steering-block.md`
 * (bundled at classpath `/insrc/steering-block.md` by the Gradle `bundleSteeringBlock`
 * task — see build.gradle.kts). This is the SAME block the daemon steering-refresh
 * (`src/daemon/steering-inject.ts`) writes, so there is one source of truth for the
 * tracked-workflow guidance and no re-authored reasoning. Read-only and independent
 * of daemon install state (the guidance text ships with the plugin).
 *
 * The resource stream accessor is injected so the missing/empty guard is unit-testable
 * without touching the real classpath resource.
 */
class SteeringContent(
    private val resource: () -> InputStream? =
        { SteeringContent::class.java.getResourceAsStream(BUNDLED_STEERING_RESOURCE) },
) {

    /**
     * The trimmed canonical steering body.
     *
     * @throws IllegalStateException when the bundled steering resource is missing or
     *   trims to empty (a packaging error — the Gradle bundle step didn't run or the
     *   asset was renamed). Surfaced so the caller skips writing rather than clobbering
     *   the host's insrc rules section with nothing.
     */
    fun steeringBody(): String {
        val stream = resource()
            ?: throw IllegalStateException("insrc: bundled steering block $BUNDLED_STEERING_RESOURCE is missing")
        val body = stream.use { it.readBytes().toString(Charsets.UTF_8) }.trim()
        if (body.isEmpty()) {
            throw IllegalStateException("insrc: bundled steering block $BUNDLED_STEERING_RESOURCE is empty")
        }
        return body
    }

    companion object {
        /** Classpath location of the bundled canonical steering block (see build.gradle.kts). */
        const val BUNDLED_STEERING_RESOURCE: String = "/insrc/steering-block.md"
    }
}
