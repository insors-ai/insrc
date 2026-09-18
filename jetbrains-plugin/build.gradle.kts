import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

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

    // `verifyPlugin` (run in CI) checks the built artifact's API usage against a
    // real IDE. Verify against the compile target (IntelliJ IDEA Community, the
    // platformVersion) — the one artifact loads across all four IDEs off the
    // common-platform descriptor, so the common-platform IDE is the meaningful
    // target and keeps the verifier download bounded.
    pluginVerification {
        ides {
            ide(
                IntelliJPlatformType.IntellijIdeaCommunity,
                providers.gradleProperty("platformVersion").get(),
            )
        }
    }
}

tasks.test {
    // Plain-JUnit5 unit/smoke suites (no IDE fixture) run here; IntelliJ Platform
    // fixture-based integration tests (added in t4) run under the platform-test
    // classpath the IntelliJ Platform Gradle plugin wires in.
    useJUnitPlatform()
}

// Bundle the sibling backend assets the plugin must ship with, so both travel INSIDE
// the plugin jar rather than being read from an (absent-on-a-fresh-machine) daemon dir:
//   - insrc-daemon-install.sh (Story S003 / t6-t7): the bootstrap installer that clones
//     ~/.insrc/daemon, needed for the one-click setup on a machine with no daemon yet;
//   - steering-block.md (Story S004 / t1): the canonical tracked-workflow steering block —
//     the SAME src/prompts/steering-block.md the daemon steering-refresh writes — injected
//     into each detected AI host's rules file on project open (single source of truth).
// One Copy task into one output dir keeps Gradle's up-to-date/incremental checks intact
// (no overlapping-task-output warning). Copies individual files from the sibling backend
// repo; it does NOT wire the two build systems or toolchains together (k6). Both ship
// under classpath /insrc/ (/insrc/insrc-daemon-install.sh, /insrc/steering-block.md).
val bundleBackendAssets by tasks.registering(Copy::class) {
    from(rootProject.file("../scripts/insrc-daemon-install.sh"))
    from(rootProject.file("../src/prompts/steering-block.md"))
    into(layout.buildDirectory.dir("generated-resources/insrc"))
}

sourceSets.named("main") {
    resources.srcDir(layout.buildDirectory.dir("generated-resources"))
}

tasks.named("processResources") {
    dependsOn(bundleBackendAssets)
}
