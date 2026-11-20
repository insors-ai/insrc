<!-- insrc:artifact ISSUE-f585657934058a38 -->

# Restore the JetBrains plugin test build

## Reproduction

Both Gradle test invocations stop at compileTestKotlin. Settings tests use SaveResult.Saved as a singleton, call removed requestLine, and pass obsolete PerRepoSection constructor arguments. The default run additionally fails storing the configuration cache for bundleBackendAssets; disabling the cache leaves the Kotlin errors.

## Root cause

Test fixtures were not updated when Saved became a data class and transport/settings constructors changed. The asset Copy task also captures script/project references in provider mapping that Gradle cannot serialize for configuration caching.

## Fix intent

Bring settings and transport fixtures onto supported APIs while preserving their wire/null-value and save-result assertions, and make backend asset bundling compatible with the intended Gradle configuration-cache behavior. Acceptance: test compilation succeeds, focused settings tests execute and pass, and two normal test-build invocations reuse the cache without the Copy-task serialization error. Do not introduce a compatibility gate for the deprecated IDE fork.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `jetbrains-plugin/build.gradle.kts`
- **[[c3]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt`
