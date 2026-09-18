# insrc — JetBrains IDE plugin

A single IntelliJ-Platform plugin that brings insrc into IntelliJ IDEA, PyCharm,
GoLand, and WebStorm. It is a **thin orchestrator that owns no reasoning**: it
wires insrc's grounded-analyze and tracked-workflow capabilities into the IDE's
own AI assistant and manages the backing daemon.

This is a **separate Gradle/Kotlin build** from the ESM/TypeScript backend in the
repository root — deliberately, so the two toolchains never entangle (Epic
constraint **k6**). It lives in-repo for one-place cohesion.

Epic `61d8c73edb68041a` · design under
[`docs/epics/integrate-insrc-framework-into-jetbrains-ide-E2026091761d8c73e/`](../docs/epics/integrate-insrc-framework-into-jetbrains-ide-E2026091761d8c73e/).

## Status

Story **S001** (foundation) is in progress:

- **t1** (this scaffold) — single Gradle/Kotlin IntelliJ-Platform module, plugin
  descriptor depending only on `com.intellij.modules.platform` (so one artifact
  activates in all four IDEs), single versioned build artifact, and a CI lane.
- **t2** — `sc1` PluginRuntime & ProjectContext (project-open / uninstall lifecycle).
- **t3** — `sc2` DaemonGateway (health probe + `repo.add` registration over the
  daemon socket).
- **t4** — acceptance tests (integration activation + contract single-artifact).

## Build & test

Requires **JDK 21**. Use the committed Gradle wrapper (`./gradlew`) — it pins
Gradle **8.10.2**, so you do NOT need Gradle on your PATH. From this directory:

```bash
./gradlew build          # compile + run tests + produce the plugin distribution
./gradlew runIde         # launch a sandbox IDE with the plugin for manual testing
./gradlew verifyPlugin   # run the IntelliJ Platform plugin verifier
```

> Use `./gradlew`, not a system `gradle`. The wrapper pins Gradle 8.10.2 because
> the IntelliJ Platform Gradle plugin (2.1.0) is incompatible with Gradle 9.x —
> a bare `gradle` from a recent Homebrew/SDKMAN install will fail to configure.

The single distribution artifact is written to `build/distributions/` and is what
gets published to the JetBrains Marketplace.

## Why one artifact for four IDEs

The plugin descriptor ([`src/main/resources/META-INF/plugin.xml`](src/main/resources/META-INF/plugin.xml))
declares a dependency only on the **common platform module**
(`com.intellij.modules.platform`), never on an IDE-specific module. That is what
makes a single build load and activate identically in IntelliJ IDEA, PyCharm,
GoLand, and WebStorm (Story S001 / `lc1`, `ac3`). `PluginDescriptorSmokeTest`
guards this invariant.
