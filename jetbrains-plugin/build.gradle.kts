import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask.FailureLevel

// insrc JetBrains IDE plugin (Epic 61d8c73edb68041a, Story S001).
//
// Scope of THIS build (S001 / t1): produce ONE versioned plugin artifact that
// activates across IntelliJ IDEA / PyCharm / GoLand / WebStorm from a single
// codebase (lc1, k6). sc1 (PluginRuntime & ProjectContext) and sc2
// (DaemonGateway) are implemented in later tasks (t2, t3); this file only
// stands up the module, descriptor patching, and the test task.

plugins {
    kotlin("jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // Compile against the COMMON platform via IntelliJ IDEA Community. The
        // descriptor's `depends` (plugin.xml) — not this compile dependency —
        // is what gates which IDEs load the artifact; it names only
        // com.intellij.modules.platform, so one artifact serves all four IDEs.
        create(
            IntelliJPlatformType.IntellijIdeaCommunity,
            providers.gradleProperty("platformVersion").get(),
        )
        instrumentationTools()
        testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)
        // The IntelliJ Plugin Verifier CLI, so the `verifyPlugin` task (run in CI)
        // has an executable to invoke — without this the task fails with
        // "No IntelliJ Plugin Verifier executable found".
        pluginVerifier()
    }

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    // The IntelliJ Platform fixture base classes (BasePlatformTestCase) are
    // JUnit4; the vintage engine runs them under the JUnit Platform launcher
    // alongside the JUnit5 unit suites.
    testImplementation("junit:junit:4.13.2")
    testRuntimeOnly("org.junit.vintage:junit-vintage-engine:5.11.3")
}

kotlin {
    jvmToolchain(providers.gradleProperty("javaVersion").get().toInt())
}

intellijPlatform {
    pluginConfiguration {
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            // Open-ended upper bound: the plugin depends only on the stable
            // com.intellij.modules.platform, so it is forward-compatible across
            // IDE releases. Explicitly unset untilBuild (a provider yielding null)
            // rather than omitting it — omitting makes the Gradle plugin derive an
            // upper bound from the compile platform (242.*), which is the opposite
            // of what we want.
            untilBuild = provider { null }
        }
    }

    // `verifyPlugin` checks the built artifact's API usage against real IDEs. It
    // must run against NEWER IDEs than the 2024.2 compile target, because a platform
    // API can be public at compile time yet go @ApiStatus.Internal or @Deprecated in
    // a later release — verifying only 2024.2 is exactly why findEnabledPlugin /
    // getLoadedPlugins / ConfigurationException.getMessage slipped through and were
    // caught by a user's own verifier run instead of here. `recommended()` resolves
    // the current recommended release set (no hardcoded version guessing), plus the
    // compile target for the lower bound.
    //
    // failureLevel makes these FAIL the build (not just warn), so an internal /
    // deprecated / scheduled-for-removal API usage is caught at `verifyPlugin` time.
    pluginVerification {
        failureLevel = listOf(
            FailureLevel.COMPATIBILITY_PROBLEMS,
            FailureLevel.INTERNAL_API_USAGES,
            FailureLevel.DEPRECATED_API_USAGES,
            FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
            FailureLevel.INVALID_PLUGIN,
        )
        ides {
            // The compile target (lower bound) plus a NEWER release, so an API that
            // goes internal/deprecated in a later IDE is caught here. `select` with
            // the RELEASE channel resolves ACTUAL downloadable releases in the build
            // range (recommended() can pick an unreleased/undownloadable version).
            ide(
                IntelliJPlatformType.IntellijIdeaCommunity,
                providers.gradleProperty("platformVersion").get(),
            )
            select {
                types = listOf(IntelliJPlatformType.IntellijIdeaCommunity)
                channels = listOf(org.jetbrains.intellij.platform.gradle.models.ProductRelease.Channel.RELEASE)
                sinceBuild = "243"
                untilBuild = "252.*"
            }
        }
    }
}

tasks.test {
    // Plain-JUnit5 unit/smoke suites (no IDE fixture) run here; IntelliJ Platform
    // fixture-based integration tests (added in t4) run under the platform-test
    // classpath the IntelliJ Platform Gradle plugin wires in.
    useJUnitPlatform()
    // Explicit tracked input: cached Gradle configurations must not retain a
    // previous invocation's temporary parity directory from process environment.
    systemProperty("insrc.parity.dir", providers.gradleProperty("insrcParityDir").orElse("").get())
    // Node fixture bridges may run concurrently: keep each invocation's evidence private.
    providers.gradleProperty("insrcFixtureReports").orNull?.let {
        reports.junitXml.outputLocation.set(file(it))
    }
}

// S005: Node and JUnit consume the same versioned JSON corpus, never mirrored source.
sourceSets.named("test") {
    resources.srcDir(rootProject.file("../test-fixtures"))
}

// Bundle the canonical host steering resource.
val bundleBackendAssets by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir)
    commandLine("node", "../scripts/sync-client-runtime-assets.mjs", "jetbrains")
    inputs.file("../scripts/sync-client-runtime-assets.mjs")
    inputs.file("../src/prompts/steering-block.md")
    outputs.dir(layout.buildDirectory.dir("generated-resources/insrc"))
}

sourceSets.named("main") {
    resources.srcDir(layout.buildDirectory.dir("generated-resources"))
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(bundleBackendAssets)
    // Copy tasks retain removed input files; purge only the retired resources.
    doFirst {
        check(!destinationDir.resolve("insrc/insrc-daemon-install.sh").exists() || destinationDir.resolve("insrc/insrc-daemon-install.sh").delete())
        check(!destinationDir.resolve("insrc/node-runtime-policy.json").exists() || destinationDir.resolve("insrc/node-runtime-policy.json").delete())
    }
}
