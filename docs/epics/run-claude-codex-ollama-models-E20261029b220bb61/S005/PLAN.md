<!-- insrc:artifact PLAN-b220bb6174a2f5ed-s5 -->

# Plan: E20261030b220bb61:S005

## Summary

**Epic:** `run-claude-codex-ollama-models`
**LLD run:** `wf-1793350039391-64wnc9`
**LLD effective hash:** `ca5bac7aee60...`

Building this Story teaches the JetBrains plugin's Model Tiers settings about the Claude-on-Ollama runner. The plugin's view of the daemon's definitions gains the host and hosting marks; the tier model then labels that runner's models cloud or local and says plainly when a configured model will not run; and the Check model dialog stops offering that runner. The JUnit tests reach the build gate through a small node bridge, as the earlier JetBrains story did.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** host/hosting on the JetBrains definitions DTOs and their parsing; s5 gradle bridge | S | — | unit: b220-s5-gradle.test.ts: ModelDefinitionsGatewayTest parses a family's host and its models' hosting, and null when the answer has neither | [[c1]] [[c4]] [[c5]] |
| 2 | **`t2`** ModelTiersModel: cloud/local label, not-supported note and marker for a host family | M | `t1` | unit: b220-s5-gradle.test.ts: ModelTiersModelTest offers the host family, labels its models cloud or local, offers efforts only where the model has them and writes the whole tier; unit: b220-s5-gradle.test.ts: ModelTiersModelTest notes an undeclared host-family model as not supported, the tier will not run, while a vendor or host-less family keeps today's note; unit: b220-s5-gradle.test.ts: ModelTiersModelTest resolves a tier saved on the host family to its runner, model and effort on reopen | [[c1]] [[c2]] [[c4]] [[c5]] |
| 3 | **`t3`** ModelCheckFlow.families() excludes host families | S | `t1` | unit: b220-s5-gradle.test.ts: ModelCheckFlowTest keeps the host family out of Check model and offers it again when the answer has no host | [[c3]] [[c4]] [[c5]] |

### 1.1 E20261030b220bb61:S005:T001 — host/hosting on the JetBrains definitions DTOs and their parsing; s5 gradle bridge

jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt: DefinedFamilyDto gains `host: String? = null` and DefinedModelDto gains `hosting: String? = null`; parseModelDefinitions reads them as non-blank strings. JUnit case in ModelDefinitionsGatewayTest.kt. A node bridge jetbrains-plugin/__tests__/b220-s5-gradle.test.ts (same pattern as s7-gradle.test.ts) runs the s5 JUnit cases for the build gate.

**Acceptance checks:**
- An answer with a family host 'ollama' and models hosting 'cloud'/'local' parses them onto DefinedFamilyDto.host and DefinedModelDto.hosting.
- An answer without host/hosting parses with null for both; existing parse behaviour (skipped malformed entries) is unchanged.
- The bridge test runs the named JUnit case through gradle and passes.

### 1.2 E20261030b220bb61:S005:T002 — ModelTiersModel: cloud/local label, not-supported note and marker for a host family

jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt: label() appends ' — cloud' / ' — local' from hosting; resolve() notes '<model> is not supported by <displayName> — the tier will not run' for a configured model a host family does not declare (vendor families keep the 'runs its default' note); ModelChoice.CurrentNotInCatalog gains `hosted: Boolean = false` and reads '(current, not supported): <id>' when set. JUnit cases in ModelTiersModelTest.kt over a fake answer with a host family, bridged in b220-s5-gradle.test.ts.

**Acceptance checks:**
- runnerOptions offers the host family next to today's; selectRunner to it takes its first declared model with effort ''; modelOptions lists only its declared models labelled '— cloud' / '— local'; effortOptions is '' plus the model's efforts (only '' for none); collectWrites writes the whole tier.
- Vendor and plain Ollama model labels carry no cloud/local suffix.
- A host model configured by alias resolves to its canonical id, labelled with its hosting.
- A configured undeclared host-family model is noted 'not supported by <family> — the tier will not run', shown as '(current, not supported): <id>', and refused by unsavable; a vendor family keeps the 'runs its default' note and '(current, not listed)'; a host-less answer behaves as a vendor family.
- A catalog snapshot holding a tier saved on the host family resolves to that runner, canonical model and effort with no note; an effort the model does not take is shown dropped.

### 1.3 E20261030b220bb61:S005:T003 — ModelCheckFlow.families() excludes host families

jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt families() returns families with a cliKind and no host. JUnit case in ModelCheckFlowTest.kt, bridged in b220-s5-gradle.test.ts.

**Acceptance checks:**
- families() excludes the host family and keeps the vendor CLI families and their order.
- With host absent (older daemon) the same family is offered.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: an answer with a family host 'ollama' and models hosting 'cloud'/'local' parses them onto DefinedFamilyDto.host and DefinedModelDto.hosting; an answer without them parses with null. | `t1` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: runnerOptions offers the host family next to today's; selectRunner to it takes its first declared model with effort ''; modelOptions lists only its declared models, labelled '— cloud' / '— local'; effortOptions offers '' plus the model's efforts (only '' for a model with none); collectWrites writes the whole tier. | `t2` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: a configured undeclared model on the host family is noted 'not supported by <family> — the tier will not run', shown as '(current, not supported)' and refused by unsavable; a vendor family keeps 'the daemon runs its default' and '(current, not listed)'; a host-less answer behaves as a vendor family. | `t2` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: a catalog snapshot holding a tier saved on the host family resolves to that runner, canonical model and effort with no note (reopen); an effort the model does not take is shown dropped. | `t2` |
| jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: families() excludes the host family and keeps the vendor CLI families; with host absent the family is offered. | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 dataModelChanges DefinedFamilyDto + DefinedModelDto + parseModelDefinitions` — "+ val host: String? = null"
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails.api resolve + label + modelOptions` — "the note reads '<model> is not supported by <displayName> — the tier will not run'"
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails.api families` — "The families the Check model… dialog offers: those with a cliKind and no host."
- **[[c4]]** `prior-artifact` `LLD s5 errorPaths errorCases + edgeCases + invariantsToPreserve` — "No host field: host and hosting are null, so the family behaves as today's CLI families"
- **[[c5]]** `prior-artifact` `LLD s5 testStrategy acceptanceMapping ac1-ac3` — "a catalog snapshot holding a tier saved on the host family resolves to that runner, model and effort with no note"
