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
            untilBuild = providers.gradleProperty("pluginUntilBuild")
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
