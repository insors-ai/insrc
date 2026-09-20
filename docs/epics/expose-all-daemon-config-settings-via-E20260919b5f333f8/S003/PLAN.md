<!-- insrc:artifact PLAN-b5f333f8d7ba421b-s3 -->

# Plan: E20260920b5f333f8:S003

**Epic:** `expose-all-daemon-config-settings-via`
**LLD run:** `wf-1789882506964-6msmw0`
**LLD effective hash:** `ee39a9f5fd11...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the sc2 write surface to the gateway (SaveResult + writeSetting/clearSetting) | M | — | unit: writeSetting: ok=true→Saved, ok=false→Rejected, DaemonUnavailable→Unavailable; sends {path: segments, value}; unit: clearSetting omits the value key (FakeDaemonRpc param assertion); ok=true→Saved; unit: WireRpc real UnixSocketDaemonRpc.parse: {result:{ok:true}}→Saved, {result:{error}}→Unavailable | [[c1]] [[c2]] |
| 2 | **`t2`** Add the pure SettingsEditModel (validation, dirty, reset, segment mapping) | M | — | unit: control-kind per type (enum/boolean/number/string); unit: per-type parse/validate: number parse + integral-Double equality, enum-membership, empty-string-valid; unit: isModified/collectDirty emits only changed fields; a validationError field is excluded; unit: revertField restores last-saved; markResetToDefault set→Clear, unset→no-op; onSaved advances last-saved; unit: path→segments mapping verbatim (lc1) | [[c3]] |
| 3 | **`t3`** Make InsrcSettingsConfigurable editable (edit controls + apply/isModified/reset via the model) | M | `t1`, `t2` | unit: source-scan: edit-capable controls installed per type (not the read-only JLabel/disabled checkbox) | [[c4]] |
| 4 | **`t4`** Configurable source-scan tests + final green sweep | S | `t1`, `t2`, `t3` | unit: source-scan: apply calls gateway.writeSetting/clearSetting (not raw config.write), delegates isModified/reset, throws ConfigurationException on not-Saved/validation | [[c5]] [[c6]] |

### E20260920b5f333f8:S003:T001 — Add the sc2 write surface to the gateway (SaveResult + writeSetting/clearSetting)

In DaemonGateway.kt add a sealed SaveResult { Saved | Rejected(reason) | Unavailable(reason) }, add writeSetting(pathSegments: List<String>, value: Any?): SaveResult and clearSetting(pathSegments: List<String>): SaveResult to the interface, implement both in DaemonGatewayImpl over rpc.call(METHOD_CONFIG_WRITE='config.write') (writeSetting sends {path: segments, value}; clearSetting sends {path: segments} with value OMITTED; ok=true→Saved, ok=false (no throw)→Rejected, DaemonUnavailableException/RuntimeException→Unavailable), add the DaemonGatewayService delegate overrides, and add writeSetting/clearSetting stubs to the 4 test doubles (DaemonLifecycleServiceTest throws AssertionError like its settingsCatalog stub; the 3 Onboarding tests return Unavailable('not used')). Additive to the interface — must compile all consumers in one change. Land the gateway-classification tests (writeSetting/clearSetting Fake + WireRpc) with this task so its ./gradlew test proves the sc2 slice.

**Acceptance checks:**
- DaemonGateway declares writeSetting(pathSegments, value) and clearSetting(pathSegments) returning SaveResult; SaveResult is a sealed interface with Saved/Rejected/Unavailable.
- DaemonGatewayImpl.writeSetting calls config.write with {path: segments, value}; clearSetting calls config.write with {path: segments} and NO value key.
- ok=true→Saved, ok=false→Rejected, DaemonUnavailable/RuntimeException→Unavailable (never throws).
- DaemonGatewayService delegates both; all 4 test doubles compile with the new stubs; ./gradlew test still green.

### E20260920b5f333f8:S003:T002 — Add the pure SettingsEditModel (validation, dirty, reset, segment mapping)

In the settings package add PendingWrite(segments: List<String>, op: WriteOp) + sealed WriteOp { Set(value: Any?) | Clear } and the pure class SettingsEditModel(catalog: SettingsCatalogDto) with a private FieldState per option. Implement editField (parse+validate per type: number parse tolerating Gson Double, enum-membership, boolean, empty-string-valid), validationError, isModified, revertField, markResetToDefault (set→Clear, unset→no-op), onSaved (advance/clear last-saved), and collectDirty()→only dirty, validation-clean fields as PendingWrite with path→segments mapping. Integral-Double equality so a re-typed same number is not dirty. No Swing, no existing-symbol changes. Land the SettingsEditModel unit tests with this task.

**Acceptance checks:**
- SettingsEditModel + PendingWrite + WriteOp exist in settings/ and are pure (no Swing/IDE imports).
- editField parses+validates per type; validationError non-null for a bad number/enum; empty string is valid for string.
- isModified true only on a real change or reset-of-a-set field; a re-typed integral-Double value is not dirty.
- collectDirty emits only dirty validation-clean fields as PendingWrite(Set|Clear) with correct segments; markResetToDefault set→Clear, unset→no-op; onSaved advances last-saved.

### E20260920b5f333f8:S003:T003 — Make InsrcSettingsConfigurable editable (edit controls + apply/isModified/reset via the model)

Replace readOnlyControl with edit-capable controls per type (enum→JComboBox over enumValues, boolean→enabled JCheckBox, number→number/text field, string→JTextField) bound to a SettingsEditModel built from the Loaded catalog. Wire isModified()→model.isModified(), reset()→revert all fields to last-saved, and apply()→for each collectDirty() PendingWrite call gateway.writeSetting/clearSetting, onSaved on Saved, and throw ConfigurationException (preserving the edit) on any not-Saved result or a validationError. An Unavailable page installs no editors (unchanged). Wire a reset-to-default affordance per row to markResetToDefault. Depends on t1 (gateway) + t2 (model).

**Acceptance checks:**
- Each Loaded row renders a type-appropriate EDIT control (not the read-only JLabel/disabled checkbox).
- isModified/reset delegate to the model; apply writes only dirty keys via writeSetting/clearSetting and calls onSaved on Saved.
- apply throws ConfigurationException on a not-Saved result or a validationError, preserving the pending edit; a partial batch advances only the Saved fields.
- The Unavailable placeholder path installs no editors; no SettingsSection is registered.

### E20260920b5f333f8:S003:T004 — Configurable source-scan tests + final green sweep

Extend InsrcSettingsConfigurableTest source-scan: edit-capable controls per type (not the read-only JLabel/disabled checkbox), apply throws ConfigurationException on not-Saved/validation, and apply uses gateway.writeSetting/clearSetting (not a raw config.write string). Confirm the gateway-classification tests (from t1) and SettingsEditModel tests (from t2) are present, then run the full JDK21 ./gradlew test green sweep. (Per the s3 critique, the pure-model and gateway tests land with t2/t1; t4 adds the shell source-scan and the consolidated final sweep.)

**Acceptance checks:**
- InsrcSettingsConfigurable source-scan asserts edit controls + apply-throws-on-not-Saved/validation + gateway (not raw config.write) usage.
- The SettingsEditModel tests (t2) and gateway sc2 classification + WireRpc tests (t1) are present and passing.
- ./gradlew test passes on JDK21 with all new tests (full sweep green).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| SettingsEditModel control-kind per type | `t2` |
| number parse + integral-Double equality, enum-membership, empty-string-valid | `t2` |
| isModified/collectDirty emits only changed fields; validationError excluded | `t2` |
| revertField / markResetToDefault (set→Clear, unset→no-op) / onSaved | `t2` |
| path→segments verbatim (lc1) | `t2` |
| writeSetting ok=true→Saved / ok=false→Rejected / DaemonUnavailable→Unavailable; sends {path,value} | `t1` |
| clearSetting OMITS the value key; ok=true→Saved | `t1` |
| WireRpc over real UnixSocketDaemonRpc.parse: {result:{ok:true}}→Saved, {result:{error}}→Unavailable | `t1` |
| apply calls gateway.writeSetting/clearSetting (not a raw config.write string), delegates isModified/reset to the model, throws ConfigurationException on not-Saved/validation | `t4` |
| edit-capable controls installed per type (not the S002 read-only JLabel/disabled checkbox) | `t3`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails DaemonGateway.writeSetting (sc2)` — "fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult -> config.write({path: segments, value}); ok=true→Saved, ok=false→Rejected, DaemonUnavailable/RuntimeException→Unavailable."
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails DaemonGateway.clearSetting (sc2)` — "fun clearSetting(pathSegments: List<String>): SaveResult -> config.write({path: segments}) with value OMITTED so the daemon drops the leaf; reset-to-default of a global setting."
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails SettingsEditModel + dataModelChanges PendingWrite/WriteOp/FieldState` — "Pure headless SettingsEditModel: per-type parse/validate, dirty-vs-last-saved, revert/markResetToDefault/onSaved, collectDirty()→PendingWrite(segments, Set|Clear)."
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails InsrcSettingsConfigurable.apply` — "Edit-capable controls per type + native isModified/apply/reset backed by the model; apply per dirty PendingWrite calls writeSetting/clearSetting, onSaved on Saved, ConfigurationException on not-Saved/"
- **[[c5]]** `prior-artifact` `LLD s3 testStrategy (test levels + acceptance mapping)` — "Unit: SettingsEditModel logic, gateway sc2 classification + WireRpc real-parse, Configurable source-scan; all four ACs mapped."
- **[[c6]]** `prior-artifact` `LLD s3 testStrategy.testFramework` — "JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test; source-scan tests read the Kotlin source; no BasePlatformTestCase, no daemon/TS test."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T05:54:51.521Z

_No load-bearing premises were extracted._
