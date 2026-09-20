<!-- insrc:artifact LLD-b5f333f8d7ba421b-s3 -->

# LLD: E20260920b5f333f8:S003

**Epic:** `expose-all-daemon-config-settings-via`
**HLD base run:** `wf-1789841045868-kib3gd`
**HLD effective hash:** `ee39a9f5fd11...`

## HLD context

**Framework:** A daemon-owned, self-describing settings contract feeds a native JetBrains Settings page that renders whatever the daemon reports. The plugin adds config gateway methods behind the established sealed three-state result pattern and a native applicationConfigurable built purely from the daemon's description. Reads use the catalog IPC plus the existing value read; writes reuse the existing segment-aware write. The plugin owns no settings semantics; the daemon stays the single source of truth.
**Rollout phase:** Phase C — Editing + write-back
**Owns:** `sc2` (Settings write surface (segment-aware write + clear) behind a sealed SaveResult)
**Consumes:** `sc1` (Self-describing settings catalog (enriched ConfigOption + role taxonomy) over config.catalog, and its plugin read surface), `sc3` (Settings page framework (Configurable host + grouped collapsible rendering + type→control mapping))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Daemon-side catalog enrichment + config.catalog assembly + contract-test/reconcile extensions stay private to s1; other stories consume only the payload shape (sc1). — owns `sc1`
- `s2`: Read-only rendering, collapsible layout + expand/collapse state, and the daemon-unavailable placeholder stay private to s2; the edit-capable row variant and dirty/apply logic are s3's. — owns `sc3`
- `s4`: The per-role overrides sub-section (models.tasks.<roleId>) is wholly private to s4; it plugs into sc3's section seam and reuses sc2.
- `s5`: The per-repo overrides sub-section (models.byRepo.<repoPath>.*) is wholly private to s5; it plugs into sc3's section seam and reuses sc2.

## Contract details

**Surface level:** internal-shared

### `DaemonGateway.writeSetting`

```typescript
fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult
```

**Parameters:**
- `pathSegments: List<String>` — The config key as LITERAL segments (never a dotted string), passed verbatim as config.write's path array so a dotted dynamic key is never mis-nested (lc1/k4).
- `value: Any?` — The already-parsed, type-correct value (Boolean/number/String) so the daemon stores the right JSON type; never the raw editor string.

**Returns:** `SaveResult` — Saved on config.write ok=true; Rejected(reason) on ok=false; Unavailable(reason) on socket down / result.error / RuntimeException.

**Errors:**
- `SaveResult.Rejected` when config.write reply ok=false (invalid path / empty segment refused).
- `SaveResult.Unavailable` when DaemonUnavailableException, transport result.error, or a RuntimeException.

**Preconditions:**
- pathSegments non-empty, no empty segment.
- value already parsed + validated by SettingsEditModel.

**Postconditions:**
- On Saved the daemon wrote config.json and ran reloadChatConfig (ac2).
- Never throws — every failure is a sealed SaveResult (ac4).

### `DaemonGateway.clearSetting`

```typescript
fun clearSetting(pathSegments: List<String>): SaveResult
```

**Parameters:**
- `pathSegments: List<String>` — The config key to REMOVE, as literal segments. Reset-to-default of a global setting (s3) and override removal (s4/s5).

**Returns:** `SaveResult` — Same three-state classification; Saved means the key was removed and the daemon default now applies.

**Errors:**
- `SaveResult.Rejected` when config.write reply ok=false.
- `SaveResult.Unavailable` when DaemonUnavailableException / result.error / RuntimeException.

**Preconditions:**
- pathSegments non-empty, no empty segment.

**Postconditions:**
- Implemented as config.write with the value field OMITTED → JSON.stringify drops the undefined leaf → key removed; daemon config.write reused UNCHANGED (k3/k4).
- After a Saved clear the setting reads isSet=false and renders the daemon default (ac3).

### `SettingsEditModel`

```typescript
class SettingsEditModel(catalog: SettingsCatalogDto) { fun editField(path: String, rawInput: Any?): Unit; fun revertField(path: String): Unit; fun markResetToDefault(path: String): Unit; fun isModified(): Boolean; fun validationError(path: String): String?; fun collectDirty(): List<PendingWrite>; fun onSaved(path: String): Unit }
```

**Parameters:**
- `catalog: SettingsCatalogDto` — The daemon self-description (sc1) the model builds one FieldState per option from; default/type/enumValues drive control choice + validation, currentValue/isSet seed the last-saved value.

**Returns:** `SettingsEditModel` — Pure headless edit state: per-field pending value, dirty-vs-last-saved, per-type validation, and segment/op mapping. Load-bearing logic lives here (not in the Swing shell) so it is unit-testable.

**Errors:**
- `IllegalArgumentException` when edit/revert/markResetToDefault called with a path not in the catalog (programmer error).

**Preconditions:**
- editField rawInput mapped from the control (Boolean/String) but not yet type-parsed — the model parses+validates.

**Postconditions:**
- isModified() true iff any field's pending differs from last-saved OR is reset-to-default while set.
- collectDirty() returns only changed fields as PendingWrite(segments, Set(parsed)|Clear); a validationError field is excluded.
- onSaved(path) advances last-saved (or clears it for a reset) and clears dirty.
- A parsed value equal to last-saved is NOT dirty — unchanged settings never written (ac2).

### `InsrcSettingsConfigurable.apply`

```typescript
override fun apply(): Unit  // + isModified(): Boolean, reset(): Unit
```

**Returns:** `Unit` — Native Apply backed by SettingsEditModel: per PendingWrite calls writeSetting/clearSetting, advances via onSaved on Saved; Rejected/Unavailable preserve the edit and surface the failure (ac4). isModified() delegates to the model; reset() reverts all fields to last-saved (ac3).

**Errors:**
- `ConfigurationException` when A field fails validation, or a write returns not-Saved — apply throws so the Settings dialog blocks and shows the message, preserving the edit (ac4).

**Preconditions:**
- The page rendered from a Loaded SettingsCatalogResult (an Unavailable page installs no editors — unchanged from S002).

**Postconditions:**
- Only dirty keys written; unchanged keys untouched (ac2).
- A partial failure advances the Saved ones and leaves the failed one dirty with its edit + a surfaced message (ac4).

## Data model changes

### `SaveResult` — new

New sealed interface in the daemon package beside SettingsCatalogResult: Saved (data object), Rejected(reason: String), Unavailable(reason: String). The sc2 three-state result.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `PendingWrite / WriteOp` — new

New pure data types in the settings package: PendingWrite(segments: List<String>, op: WriteOp) and WriteOp { Set(value: Any?) | Clear }. collectDirty() emits these; the Configurable maps Set→writeSetting and Clear→clearSetting. Keeps segment/op selection in the testable layer.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `FieldState (internal to SettingsEditModel)` — new

Per-option pure state: the ConfigOptionDto, the last-saved value (currentValue when isSet else an unset sentinel), the pending edited value, a resetToDefault flag, and a derived validationError. Number parsing tolerates the Gson-Double catalog shape (S002 numeric lesson) so an integral last-saved value compares equal to an integral edit. Private to s3.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s3 OWNS sc2: adds writeSetting/clearSetting + the sealed SaveResult to DaemonGateway (+ DaemonGatewayImpl over rpc.call(METHOD_CONFIG_WRITE) + the DaemonGatewayService delegate + the 4 test doubles). writeSetting sends config.write({path: segments, value}); clearSetting sends config.write({path: segments}) with value omitted. Both exercised in-story so s4/s5 inherit a tested surface. |
| `sc1` | consumes | Consumes settingsCatalog(): SettingsCatalogResult UNCHANGED; the edit model reads each ConfigOptionDto's type/default/enumValues/currentValue/isSet to choose the control, seed last-saved, and validate. Forks no schema, adds no field. |
| `sc3` | consumes | Consumes the s2 Configurable scaffold: replaces readOnlyControl with edit-capable controls and wires the native isModified/apply/reset (S002 no-ops) to SettingsEditModel; groupsOf + collapsible layout unchanged. Registers NO SettingsSection (that seam is for s4/s5). |

## Error paths

### Error cases

- **The daemon rejects a write (config.write returns ok=false).** (recoverable)
  - Detection: DaemonGatewayImpl sees DaemonResult.ok==false with no thrown exception → SaveResult.Rejected(reason) (generic reason when the bare {ok:false} carries no error string).
  - Response: apply does not advance last-saved, keeps the field dirty with the edit intact, throws ConfigurationException naming the setting so the dialog stays open.
  - User impact: Clear failure message; pending edit preserved; never a false success (ac4).
- **The daemon is down / socket unreachable at apply.** (recoverable)
  - Detection: rpc.call throws DaemonUnavailableException (or transport surfaces result.error) → SaveResult.Unavailable(reason).
  - Response: Same preserve-and-surface as Rejected but the message says 'unavailable'; already-Saved fields stay saved.
  - User impact: Told the daemon is unavailable, can retry; no edit lost (ac4).
- **Partial-batch failure: several dirty fields, one not Saved mid-loop.** (recoverable)
  - Detection: apply records per-field SaveResult and detects at least one non-Saved.
  - Response: Saved fields advanced via onSaved; failed field(s) stay dirty with edits; apply throws ConfigurationException summarizing failures; no rollback of the already-persisted Saved writes.
  - User impact: Honest partial progress; failures' edits preserved (ac2/ac4).
- **A field fails type validation before any write.** (recoverable)
  - Detection: SettingsEditModel.validationError(path) non-null; collectDirty excludes it and apply checks for any validationError first.
  - Response: apply throws ConfigurationException pointing at the field BEFORE any config.write, so nothing invalid reaches the daemon.
  - User impact: Guided to fix; nothing invalid persisted (ac1/ac4).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A number setting whose default/currentValue arrived as Gson Double 40.0 and the developer re-types '40'. | Parsed and compared numerically to 40.0 as EQUAL → not dirty → no write (S002 integral-Double lesson). Editing to '41' is dirty and writes the JVM number 41. |
| Reset-to-default on a setting that is currently unset. | No-op: markResetToDefault leaves it not-dirty (no key to remove); apply issues no clearSetting (ac2/ac3). |
| Reset-to-default on a setting set to a non-default value, then Apply. | PendingWrite(segments, Clear) → clearSetting → config.write value omitted → key removed → next catalog shows isSet=false rendering the default (ac3). |
| Revert (reset()) after edits, before Apply. | Every pending value returns to last-saved, resetToDefault flags clear, isModified()=false, no daemon call (ac3). |
| The page opened while the daemon was Unavailable, then Apply invoked. | No editors installed (S002 placeholder) → no dirty state → apply is a no-op. |
| A string setting edited to an empty string. | Empty string is a VALID string, written verbatim as "" via writeSetting (distinct from clearSetting which omits value). |

### Invariants to preserve

- A setting write goes through the daemon's segment-aware config.write with a LITERAL segment array (never a naive dotted split); s3 passes segments verbatim and adds no daemon-side write logic. [[c5]]
- The plugin talks to the daemon only over the existing Unix-socket JSON-RPC transport and honours its ok/error framing (ok=false→Rejected, thrown/result.error→Unavailable); no new transport, no direct config.json write. [[c4]]
- The daemon stays the single source of truth for schema/defaults/reconcile; the plugin persists no default of its own — reset-to-default REMOVES the key so the daemon default governs. [[c7]]
- The recognized-settings catalog stays the single definition site the surface renders from; s3 forks no schema and adds no field to the catalog or DTO. [[c1]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test, matching S002's SettingsViewTest/SettingsCatalogGatewayTest; source-scan tests read the Kotlin source. No BasePlatformTestCase and no daemon/TS test (config.write unchanged, already covered by src/config write-path tests).`

### Test levels

- **unit** — Prove the load-bearing edit logic headlessly (the review-epic split): type→control, per-type parse/validate, dirty-vs-last-saved, reset semantics, segment/op mapping.
  - Subjects: `SettingsEditModel control-kind per type`, `number parse + integral-Double equality, enum-membership, empty-string-valid`, `isModified/collectDirty emits only changed fields; validationError excluded`, `revertField / markResetToDefault (set→Clear, unset→no-op) / onSaved`, `path→segments verbatim (lc1)`
  - Fixtures: `An in-memory SettingsCatalogDto with one option of each type, some set some unset`
- **unit** — Prove sc2 gateway classification against the real transport framing (extends SettingsCatalogGatewayTest).
  - Subjects: `writeSetting ok=true→Saved / ok=false→Rejected / DaemonUnavailable→Unavailable; sends {path,value}`, `clearSetting OMITS the value key; ok=true→Saved`, `WireRpc over real UnixSocketDaemonRpc.parse: {result:{ok:true}}→Saved, {result:{error}}→Unavailable`
  - Fixtures: `FakeDaemonRpc capturing (method, params)`, `WireRpc replaying a canned reply through parse`
- **unit** — Guard the Swing shell wiring by source-scan (not headlessly bootable), extending InsrcSettingsConfigurableTest.
  - Subjects: `apply calls gateway.writeSetting/clearSetting (not a raw config.write string), delegates isModified/reset to the model, throws ConfigurationException on not-Saved/validation`, `edit-capable controls installed per type (not the S002 read-only JLabel/disabled checkbox)`
  - Fixtures: `Read of InsrcSettingsConfigurable.kt source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `SettingsEditModel control-kind-per-type unit test`, `InsrcSettingsConfigurable source-scan: edit-capable controls per type` |
| `ac2` | `collectDirty emits only changed fields`, `writeSetting sends {path: segments, value} and ok=true→Saved`, `integral-Double equality: re-typing the same number is not dirty` |
| `ac3` | `revertField restores last-saved`, `markResetToDefault: set→Clear, unset→no-op`, `clearSetting omits value (Fake/WireRpc)` |
| `ac4` | `writeSetting ok=false→Rejected and DaemonUnavailable→Unavailable`, `not-Saved apply keeps the field dirty (onSaved not called); validationError excludes + surfaces`, `source-scan: apply throws ConfigurationException on not-Saved/validation` |

## Migration

**State before:** After S002 (main d6552ef) the Settings page is READ-ONLY: readOnlyControl renders a disabled checkbox/label and isModified/apply/reset are no-ops; DaemonGateway has settingsCatalog() but no write. The daemon's config.write + segment-aware write-path exist and are tested but nothing in the plugin calls them.

**State after:** The page is EDITABLE for global settings: type-appropriate controls, a pure SettingsEditModel for validation + dirty + reset, native isModified/apply/reset backed by it, Apply writing only dirty keys through sc2 (writeSetting/clearSetting) with preserve-on-failure, and a reset-to-default that clears the key. The daemon is UNCHANGED; per-role/per-repo sub-sections remain unbuilt (s4/s5).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc2 surface: sealed SaveResult + writeSetting/clearSetting on DaemonGateway + DaemonGatewayImpl (clearSetting omits value) + the DaemonGatewayService delegate + stubs in the 4 test doubles. Additive to the interface. — ↩ rollbackable
2. Add the pure SettingsEditModel + PendingWrite/WriteOp/FieldState with per-type parse/validate, dirty tracking, reset semantics, and path→segments mapping. No existing symbol changes. — ↩ rollbackable
3. Replace readOnlyControl with edit-capable controls bound to the model and wire isModified/apply/reset (apply calls sc2 per dirty PendingWrite, throws ConfigurationException on not-Saved/validation). Unavailable placeholder + layout untouched. — ↩ rollbackable
4. Extend the test suite (SettingsEditModel, gateway classification + WireRpc, Configurable source-scan) and run ./gradlew test on JDK21. — ↩ rollbackable

**Backward compat:** The DaemonGateway interface only GAINS methods; settingsCatalog() and all S001/S002 behaviour are unchanged. The daemon's config.write is reused verbatim (no daemon code change), so config.json stays valid and older/newer daemons interoperate. reset-to-default is a key removal via config.write-with-value-omitted (existing unchanged daemon behaviour) — no new IPC or migration. A page against an Unavailable daemon falls back to the S002 read-only placeholder. Values already on disk render exactly as before; editing writes only changed keys.

## Alternatives considered

### a1: Pure edit-model + three-state SaveResult; reset-to-default = clear the key — **CHOSEN**

A headless SettingsEditModel owns per-option editor state/validation/dirty/segment-mapping; sc2 = writeSetting/clearSetting returning Saved|Rejected|Unavailable; reset-to-default is a clearSetting (config.write with value omitted).

A pure headless model holds one FieldState per option (last-saved, pending, per-type parse+validate, isDirty, segment mapping); apply() collects only dirty fields and calls writeSetting or, for a reset, clearSetting, advancing last-saved on Saved and preserving the edit on Rejected/Unavailable. The Swing Configurable is a thin shell delegating isModified/apply/reset to the model.

### a2: In-shell edit logic (no pure model); controls self-track dirty

Keep all edit/validate/dirty logic inside the Swing shell; controls capture a baseline and apply() walks components; sc2 SaveResult identical.

No separate model; each control captures its baseline, isModified walks components, apply parses/validates inline and calls writeSetting per dirty control.

**Rejected because:** Puts validation/dirty/preserve-on-failure in the untestable shell — partial on ac2/ac3/ac4, exactly the class of silent UI defect the review split exists to prevent.

### a3: Pure model, but reset-to-default writes the default VALUE (clear reserved for overrides)

Same pure model + SaveResult as a1, but reset-to-default writeSetting(segments, catalogDefault) instead of clearSetting.

Identical to a1 except reset-to-default persists the catalog default value; clearSetting is delivered for s4/s5 but unused by s3.

**Rejected because:** Loses on ac3 (write-default is not a true reset) and sc2 (ships clearSetting untested by its owner) — a1 dominates it.

## Citations

- **[[c1]]** `code` `src/daemon/index.ts:1335` — "'config.write' handler: params {path: string|string[]; value: unknown} -> setConfigAtPath -> writeFileSync -> reloadChatConfig; returns {ok:true}, or {ok:false} on an invalid path."
- **[[c2]]** `code` `src/config/write-path.ts` — "setConfigAtPath always ASSIGNS obj[leaf]=value (no delete); toConfigSegments rejects an empty path/segment. A clear is achievable by omitting value so JSON.stringify drops the undefined leaf."
- **[[c3]]** `prior-artifact` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt (S002, main d6552ef)` — "object SettingsView { groupsOf; displayValue } + SettingsGroupModel + interface SettingsSection (declared, unused in S002 — the sc3 seam)."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — "interface DaemonGateway over DaemonRpc.call(method, params): DaemonResult(ok,data,error); sealed three-state results; S002 added settingsCatalog() + METHOD_CONFIG_CATALOG."
- **[[c5]]** `prior-artifact` `HLD sc2 (docs/epics/expose-all-daemon-config-settings-via-E20260919b5f333f8/HLD.md)` — "sc2: Settings write surface (segment-aware write + clear) behind a sealed SaveResult; writeSetting(pathSegments,value) -> config.write; clearSetting removes a key; owned by s3, consumed by s4/s5."
- **[[c7]]** `convention` `HLD constraint k5 (docs/epics/expose-all-daemon-config-settings-via-E20260919b5f333f8/HLD.md) / CLAUDE.md project principles` — "Changing which values are stored is the daemon's job; the plugin remains a thin surface that reads the daemon's schema and current values and writes user edits back, owning no settings semantics or de"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T05:46:55.715Z

_No load-bearing premises were extracted._
