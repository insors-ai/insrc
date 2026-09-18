package ai.insors.insrc.jetbrains.platform

import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.ProjectContexts
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * sc1 project-open adapter (Story S001 / t2). A [ProjectActivity] runs once per
 * opened project, off the UI thread (it is a coroutine), so opening a project is
 * never blocked. It resolves the active project's absolute root and the running
 * IDE's [ai.insors.insrc.jetbrains.IdeKind], then broadcasts `onProjectOpened`.
 *
 * A rootless/light project (or an unsupported IDE) yields a null context from
 * [ProjectContexts.of] and is silently skipped — no bogus context is delivered.
 * This adapter does nothing else: registration is S005, host wiring is S002,
 * daemon policy is S003.
 */
internal class InsrcProjectOpenActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        // Register the app-scoped sc1 consumers exactly once, before the first
        // project-open broadcast (replaces the former AppLifecycleListener.appStarted
        // internal hook). Idempotent across every subsequent project open.
        AppScopedConsumers.ensureRegistered()

        val productCode = ApplicationInfo.getInstance().build.productCode
        val ctx = ProjectContexts.of(project.basePath, productCode) ?: return
        LifecycleBroadcaster.fireProjectOpened(ctx)
    }
}
