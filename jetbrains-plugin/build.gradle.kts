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
    }

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
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
}

tasks.test {
    // Plain-JUnit5 unit/smoke suites (no IDE fixture) run here; IntelliJ Platform
    // fixture-based integration tests (added in t4) run under the platform-test
    // classpath the IntelliJ Platform Gradle plugin wires in.
    useJUnitPlatform()
}
