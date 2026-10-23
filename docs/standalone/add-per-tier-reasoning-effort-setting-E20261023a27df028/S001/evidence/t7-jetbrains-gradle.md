# S001/t7 JetBrains tests (Gradle)

`./gradlew test` in `jetbrains-plugin/`, 2026-10-23: **BUILD SUCCESSFUL, 412 tests in 69 classes, 0 failures, 0 errors, 0 skipped**.

- `ai.insors.insrc.jetbrains.settings.ModelTiersModelTest`: 13 tests, 0 failures. It includes the named test, written with commas in place of semicolons because Kotlin identifiers cannot contain `;`: `JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write, ModelTiersSection shows an effort combo per tier, with no effort row in the daemon's catalog it shows no effort combo and emits no effort write`.
- `ai.insors.insrc.jetbrains.settings.ModelTiersWiringSourceScanTest`: 4 tests, 0 failures.
- Mutation check: disabling the effort write in `ModelTiersModel.collectWrites` makes the named test fail (13 tests, 1 failed).
