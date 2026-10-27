<!-- insrc:artifact CR-ce99b72065d03b1b-s7 -->

# Code review: ce99b72065d03b1b:s7

⚠️ **WARN** — HIGH 0 · MED 8 · LOW 1 · model `codex:gpt-6.1-sol`

**Changed files:** 31

## adherence — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1332 | The supplied evidence establishes the signature and result variants, but shows no implementation of the required decision behavior: routing approval/rejection to models.approve/models.reject, preserving daemon refusal reasons, and converting failures into Failed without throwing. These executable contract requirements remain unimplemented in the evidence. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:253 | The required caller updates are unimplemented in the supplied evidence: no note shows ModelTiersSection, PerRoleSection, PerRepoSection, and InsrcSettingsConfigurable all matching `is SaveResult.Saved` and displaying rejection detail when present. Type declarations and test intent alone do not satisfy this postcondition. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1295 | The evidence shows failure types and UI surfaces, but no implementation of the required unavailable-daemon path: catching DaemonUnavailableException as Failed(NotRunning), displaying the prescribed message without editable rows or writes, and retrying on Refresh. This required error case remains unimplemented on the supplied evidence. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckDialog.kt:108 | The supplied evidence does not show the required expired-check response implemented: an unknown-check refusal must tell the user that the check is no longer pending and offer Check again. Available state and a test name establish intent, but do not establish this dialog behavior. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:83 | The evidence shows supporting helpers and state, but no implementation of the required unset-tier behavior: display the default family's tier default, remain clean, and produce no Apply writes. This expectation remains unimplemented in the supplied evidence. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt:63 | The supplied evidence shows the family-selection surface and cliKind metadata, but does not show the required CLI-only filtering implemented. The check dialog must exclude Ollama from its offered families. |
| MED | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:70 | The evidence shows Apply entry points and per-tier saved/pending state, but no implementation of off-EDT execution, baseline advancement gated on Saved, or a ConfigurationException naming the failed tier. These required behaviors are unimplemented in the supplied evidence. |
| MED | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/S7LiveRenderTest.kt:1 | The evidence shows component-rendering helpers and a live-daemon test declaration, but no executed runIde walkthrough. It also does not establish coverage of approve + restart or Apply with restartRequired, comparison against the LLD UX mock, or recorded screenshots of every required state. Complete and record the sandbox IDE walkthrough required by t10. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 0 finding(s)

_No findings._

## diagram — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/ux-mock.html | no registered diagram handler for companion type 'ux' ('UX mock') — not judged in this Story |

## ux — 0 finding(s)

_No findings._

