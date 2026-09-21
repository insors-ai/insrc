<!-- insrc:artifact LLD-57298940cdc341bc-s6 -->

# LLD: E2026092157298940:S006

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) registered declaratively as <applicationConfigurable parentId="ai.insors.insrc.settings"> under the UNCHANGED parent insrc Configurable, each a thin Swing page on a shared off-EDT page-shell base. Every page is a read/act surface over a plugin-side seam at its natural home — incl. a first-of-its-kind log-editor seam (LightVirtualFile + FileEditorManager) hosting the tail. Additive, plugin-only, off-EDT; the parent settings page + daemon are untouched.
**Rollout phase:** Phase C — Debug sections (MCP/sessions, log editor)
**Consumes:** `sc3` (DebugPageHost)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s4`: PRIVATE to S004: the Debug status card + the OS-process orphan-kill seam (the single mutation, k3); S004 implements the DebugPageHost (sc3) and seeds status+orphan sections. — owns `sc3`
- `s5`: PRIVATE to S005: the MCP diagnostic section (host-detection registration + daemon.debug-status attached sessions), read-only.

## Contract details

**Surface level:** internal

### `parseLogLine`

```typescript
fun parseLogLine(raw: String): LogLine
```

**Parameters:**
- `raw: String` — One verbatim tail line, possibly a pino-JSON object or free text

**Returns:** `LogLine` — Best-effort parse mirroring the CLI parseLogLine: a pino-JSON line fills timeMs(from `time`), level(from `level`, numeric), module(from `name`), msg(from `msg`); a non-JSON/partial line keeps ONLY raw. raw is ALWAYS the verbatim line.

**Errors:**
- `(none — never throws)` when A malformed / non-object JSON line is caught and yields LogLine(raw only); the parse never propagates.

**Preconditions:**
- Pure; no I/O, no platform.

**Postconditions:**
- Deterministic: identical output to the CLI parseLogLine for the same input (byte-parity).

### `matchesFilter`

```typescript
fun matchesFilter(line: LogLine, filter: LogFilter): Boolean
```

**Parameters:**
- `line: LogLine` — The parsed line to test
- `filter: LogFilter` — The active {minLevel?, module?, text?} predicate

**Returns:** `Boolean` — True iff the line passes ALL active filter fields (ANDed), mirroring the CLI matchesFilter EXACTLY: minLevel keeps lines whose numeric level >= minLevel (a null-level line is DROPPED by an active minLevel); module is a case-insensitive substring on LogLine.module (null module DROPPED by an active module filter); text is a case-insensitive substring over LogLine.raw (free-text still matches a non-JSON line via raw); an unset/empty field imposes no constraint.

**Errors:**
- `(none)` when Pure total predicate; never throws.

**Preconditions:**
- Pure; no I/O.

**Postconditions:**
- An empty LogFilter (all null) matches every line.

### `LogTailSeam.tail`

```typescript
class LogTailSeam(fs: LogTailFs = LiveLogTailFs, logDir: Path = defaultLogDir(), maxLines: Int = TAIL_MAX_LINES) { fun tail(category: LogCategory, onLines: (List<LogLine>) -> Unit): AutoCloseable }
```

**Parameters:**
- `category: LogCategory` — Which log to follow (its stem globs `<stem>.<N>.log`)
- `onLines: (List<LogLine>) -> Unit` — Callback invoked with the initial last-maxLines batch, then only newly-appended (parsed) lines on each fs event

**Returns:** `AutoCloseable` — An idempotent dispose handle: close() stops the watcher and a `disposed` guard suppresses any post-dispose emit. Mirrors the CLI tailLogWith dispose().

**Errors:**
- `(none — never throws)` when A missing logDir / read error / un-installable watcher degrades to an empty initial emit + a quiet retry on the next event; nothing propagates (mirrors tailLogWith).

**Preconditions:**
- Called OFF the EDT (blocking directory + file reads; k2).
- onLines marshals any UI update back to the EDT itself (the seam invokes it on the fs/pooled thread).

**Postconditions:**
- Read-only: only lists/reads/watches `<stem>.<N>.log` under logDir; never writes/rotates/clears a log (k5).
- Active segment = highest-N `<stem>.<N>.log`; initial emit = last maxLines; subsequent emits append-only (tracks `seen`); a truncated file (< seen) re-tails from 0; a new/higher-N segment resets seen.

### `LogTailFs`

```typescript
interface LogTailFs { fun listSegments(dir: Path, stem: String): List<Path>; fun readLines(file: Path): List<String>; fun watch(dir: Path, onEvent: () -> Unit): AutoCloseable }
```

**Returns:** `interface` — The injectable fs seam behind LogTailSeam (mirrors the CLI TailDeps): listSegments returns `<stem>.<N>.log` files under dir sorted ascending by N; readLines returns a file's current lines (trailing empty dropped); watch installs a directory watcher firing on append/creation and returns an AutoCloseable unwatch. LiveLogTailFs is the java.nio default; a scripted fake drives the unit tests.

**Errors:**
- `(implementation-defined)` when The LIVE impl swallows its own IO errors so LogTailSeam stays never-throwing; the seam also guards each call, so a throwing fake still cannot crash tail().

**Preconditions:**
- Injected; the live default binds java.nio (Files.list + name regex, Files.readAllLines, a WatchService or polling ticker).

**Postconditions:**
- Strictly read-only — no method writes to disk.

### `LogEditorSurface.openLog`

```typescript
class LogEditorSurface(seam: LogTailSeam = LogTailSeam()) { fun openLog(project: com.intellij.openapi.project.Project, category: LogCategory): Unit }
```

**Parameters:**
- `project: com.intellij.openapi.project.Project` — The project whose FileEditorManager hosts the editor tab (resolved by the caller)
- `category: LogCategory` — Which log to open + follow

**Returns:** `Unit` — Opens (or re-focuses) a user-read-only LightVirtualFile('insrc-<stem>.log') via FileEditorManager.getInstance(project).openFile(file, true), subscribes the LogTailSeam OFF the EDT, and streams the filtered bounded (MAX_BUFFER=1000) buffer into the file's Document via a disposed-guarded invokeLater + write action. A per-editor filter toolbar re-renders from the buffer on a LogFilter change. The tail is disposed on editor close (FileEditorManagerListener) / project close.

**Errors:**
- `(none propagated)` when The tail seam never throws; the open + document rebuild are guarded (disposed check + try/catch), so a late post-close emit is dropped, never an exception.

**Preconditions:**
- A non-null Project (the section resolves it; when none is open the section shows a line and does NOT call openLog).
- openLog is invoked from the EDT (an action handler); the blocking tail reads happen on the seam's own off-EDT feed.

**Postconditions:**
- The on-disk log is NEVER modified: the LightVirtualFile is a separate in-memory file, user-read-only (isWritable=false), and only the plugin rebuilds its Document (k5/ac2).
- The bounded buffer caps memory (last 1000 lines); filtering re-renders from the buffer, never re-reads the disk.

### `LogEditorSection.component`

```typescript
class LogEditorSection(surface: LogEditorSurface = LogEditorSurface(), projectResolver: () -> com.intellij.openapi.project.Project? = ::resolveOpenProject) : DebugSection { override fun title(): String; override fun component(): javax.swing.JComponent }
```

**Returns:** `javax.swing.JComponent` — The sc3 log-open affordance: a read-only category picker (Daemon/Agent from LogCategories.all) + an 'Open in editor' control that resolves a target Project (projectResolver, default = the first/most-recently-focused ProjectManager.getInstance().openProjects entry) and calls LogEditorSurface.openLog; when no project is open it shows a clear 'open a project to view logs' line and opens nothing. Built off the EDT by the sc3 host, rendered under the sc1 base.

**Errors:**
- `(none propagated)` when projectResolver returning null -> the no-project line (not a throw); openLog never throws.

**Preconditions:**
- Built off the EDT (component() runs inside DebugConfigurable.buildBody on a pooled thread, sc1 base).
- The 'Open in editor' click handler runs on the EDT and delegates the blocking work to the off-EDT tail feed.

**Postconditions:**
- Implements the sc3 DebugSection (title + off-EDT-built component).
- Opens the log ONLY in an editor tab (k5) — never renders the live log inline in the section.
- Adds no log-mutating control; nothing deletes/rotates/clears a log (ac2/k5); the epic's single mutation stays S004's orphan kill (k3).

### `DebugConfigurable.sections`

```typescript
override fun sections(): List<DebugSection>  // now [statusSection(), orphansSection(), mcpSection(), logSection()]
```

**Returns:** `List<DebugSection>` — The sc3 ordered section list, now with the S006 LogEditorSection APPENDED after S004's Status/Orphans and S005's Mcp sections — the section-additive consumption of sc3. S004's + S005's sections are unchanged.

**Preconditions:**
- Assembled off the EDT (each section's component() may read files / open editors).

**Postconditions:**
- Consumes sc3 by appending exactly one DebugSection; does NOT re-design S004's/S005's sections.
- The parent settings page + plugin.xml <applicationConfigurable> element remain byte-unchanged (k4).

## Data model changes

### `LogLine` — new

Plugin projection of the CLI LogLine (debug-types.ts): data class LogLine{ raw: String, timeMs: Long?, level: Int?, module: String?, msg: String? }. raw always verbatim; timeMs/level/module/msg best-effort pino-JSON (level numeric, module from `name`, timeMs from `time`); non-JSON -> raw only. Gson Double->Long/Int coercion.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogModel.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogTailSeam.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSurface.kt`

### `LogFilter` — new

Plugin projection of the CLI LogFilter: data class LogFilter{ minLevel: Int?, module: String?, text: String? }. Consumed by matchesFilter (ANDed active fields). Empty matches all.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogModel.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSurface.kt`

### `LogCategory` — new

Plugin projection of the CLI LogCategory + LogCategoryId: enum LogCategoryId{ DAEMON, AGENT } + data class LogCategory{ id, title, stem }; LogCategories.all = [Daemon(stem 'daemon'), Agent(stem 'agent')] mirroring LOG_CATEGORIES. The stem globs `<stem>.<N>.log`.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogModel.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogTailSeam.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSection.kt`

### `LogLevels` — new

Plugin projection of the CLI LEVELS: object LogLevels with the name<->numeric pairs (trace 10, debug 20, info 30, warn 40, error 50, fatal 60), label(level:Int?):String, parseLevel(token:String):Int? (a name or a numeric string; '' clears). Drives the level filter parse + display.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogModel.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSurface.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | S006 CONSUMES sc3 (owned by S004): it implements the DebugSection interface with a new S006-internal LogEditorSection and APPENDS it to DebugConfigurable.sections() (now [Status, Orphans, Mcp, Logs]) — the section-additive contract. It does NOT re-own or re-design the DebugPageHost or S004's/S005's sections. The section's component is a read-only picker + 'Open in editor' affordance built off the EDT under the sc1 base; the live log renders in a FileEditorManager editor tab (k5), NOT inline. No change to the sc3 interface shape. |

## Error paths

### Error cases

- **The log directory (/tmp/.insrc) does not exist or has no `<stem>.<N>.log` segment yet.** (recoverable)
  - Detection: LogTailSeam.tail's resolveActive() catches the directory-list failure / empty match (LogTailFs.listSegments returns empty or throws, guarded) and finds no active segment.
  - Response: Empty initial emit (loaded-but-empty), the watcher stays installed, a later fs event re-resolves + emits when the file appears (mirrors tailLogWith). The editor opens with an empty document + a 'waiting for <category> log…' header.
  - User impact: The tab opens cleanly and begins streaming as soon as the daemon writes; no dialog, no crash.
- **A file read of the active segment fails transiently (mid-rotation / momentarily locked / partial read).** (recoverable)
  - Detection: LogTailFs.readLines throws and the seam's per-emit guard catches it (mirrors tailLogWith's try/catch around readLines).
  - Response: That emit is skipped (no lines, `seen` unchanged); the next fs event retries; the seam never throws.
  - User impact: A momentary pause; the next appended line resumes it. No visible error.
- **The directory watcher cannot be installed (WatchService unavailable / too many watches).** (recoverable)
  - Detection: LogTailFs.watch throws and LogTailSeam.tail catches it around the watch() call (mirrors tailLogWith).
  - Response: The initial last-N emit is still delivered; live follow silently degrades; the seam returns a valid dispose() regardless.
  - User impact: The developer sees the current tail but not new lines until re-open; no crash (a polling-ticker LiveLogTailFs avoids this).
- **'Open in editor' is used but NO project is open (welcome screen / all projects closed).** (recoverable)
  - Detection: LogEditorSection's projectResolver (first/most-recent ProjectManager.getInstance().openProjects) returns null.
  - Response: The section renders a clear 'open a project to view logs' line and does NOT call openLog; no LightVirtualFile is created.
  - User impact: A clear instruction instead of a silent no-op or NPE; the developer opens a project and retries.
- **A late tail emit arrives AFTER the editor tab / project has closed (dispose race).** (recoverable)
  - Detection: LogEditorSurface's disposed guard (set by the FileEditorManagerListener.fileClosed / project-close handler that also close()s the tail) short-circuits the invokeLater body; the file/Document validity is checked before the write.
  - Response: The stray batch is dropped, the tail is idempotently closed, no exception (the disposed-guarded invokeLater idiom).
  - User impact: No 'already disposed' exception, no zombie watcher leaking a handle after the tab closes.
- **The developer attempts to TYPE in / edit the opened log editor tab.** (recoverable)
  - Detection: The LightVirtualFile is user-read-only (isWritable=false), so the platform editor rejects user edits at the document level.
  - Response: Edit keystrokes are refused; only the plugin's guarded write-action rebuild mutates the in-memory Document; the on-disk log is never touched.
  - User impact: The tab behaves like any read-only file — scroll/select/copy/search work, editing does not (ac2/k5).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A rotation happens WHILE following: pino-roll opens `<stem>.<N+1>.log`. | resolveActive() re-resolves to the new highest-N segment on the next event, resets `seen`=0, continues append-only from the new file — no dup, no gap beyond the initial-tail boundary. |
| The active segment is TRUNCATED / replaced in place (line count drops below `seen`). | The seam detects lines.length < seen, resets seen=0 and re-tails from the start, re-syncing rather than mis-slicing negative indices. |
| A pino-JSON line with `name` but no `msg`, or a numeric level not among the 6 known (e.g. 35). | parseLogLine fills module/level(35), msg null; LogLevels.label(35) falls back to '35'; matchesFilter minLevel=30 keeps 35 (35>=30). No crash, no dropped field. |
| A stream exceeding the bounded buffer (>1000 lines). | The ring buffer keeps only the last 1000 lines; the document is rebuilt from that bounded buffer, so memory stays flat over an unbounded tail (mirrors the CLI ring buffer). |
| The developer changes the filter while the stream is live. | The view re-renders the CURRENT bounded buffer via matchesFilter (no disk re-read); newly-appended lines are appended-then-filtered; an empty filter shows everything. |
| The same category is opened twice while its tab is open. | FileEditorManager.openFile re-focuses the existing LightVirtualFile tab (same identity) rather than duplicating; the single tail subscription is reused (or the prior disposed first) — no double-stream. |

### Invariants to preserve

- The rotation-aware tail mirrors the CLI tailLogWith EXACTLY: active segment = highest-N `<stem>.<N>.log`, initial emit = last maxLines(500), subsequent emits append-only via `seen`, a truncated file re-tails from 0, a new segment resets seen, and the whole seam NEVER throws (missing dir/read/watch -> empty initial emit + quiet retry). [[c6]]
- The log stream is STRICTLY READ-ONLY: the plugin only lists/reads/watches `<stem>.<N>.log` under /tmp/.insrc and renders into a separate user-read-only in-memory LightVirtualFile; nothing the developer does deletes/rotates/clears the underlying on-disk log (k5/ac2). The epic's single mutation stays S004's confirm-gated orphan kill. [[c6]]
- The pure LogLine/LogFilter/parseLogLine/matchesFilter/LogLevels core mirrors the CLI byte-for-byte: minLevel drops no-level lines, module case-insensitive substring on module (no-module dropped by an active module filter), text case-insensitive substring over raw (free-text still matches non-JSON), ANDed, empty filter matches all. [[c6]]
- All file I/O runs OFF the EDT and every editor/document mutation is marshalled back via a disposed-guarded invokeLater under a write action (k2); the log opens ONLY as a FileEditorManager editor tab (k5), never inline. The section consumes sc3 additively (one appended DebugSection) and touches neither S004/S005's sections nor the parent settings page / plugin.xml (k1/k4). [[c3]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) — the jetbrains-plugin test module, mirroring the OrphanProcessSeamTest scripted-fake seam idiom + the WorkflowChainReaderTest golden-CLI-vector idiom + the DebugPageTest source-scan idiom.`

### Test levels

- **unit** — Prove the PURE log core mirrors the CLI byte-for-byte (parseLogLine, matchesFilter, LogLevels).
  - Subjects: `parseLogLine (canonical pino-JSON, name-but-no-msg, non-JSON, partial JSON)`, `matchesFilter (minLevel keep/drop incl. no-level; module substring incl. no-module; text substring over raw incl. non-JSON; ANDed; empty)`, `LogLevels.parseLevel ('warn'->40, '40'->40, ''->null, junk->null) + label(35->'35', 30->'info')`
  - Fixtures: `golden CLI-parity string vectors (pino-JSON + free-text lines)`, `a LogFilter matrix (each field alone + combined + empty)`
- **unit** — Prove LogTailSeam mirrors tailLogWith rotation/append/truncation/never-throws over a SCRIPTED LogTailFs fake (no real disk watcher).
  - Subjects: `initial emit = last maxLines of the highest-N segment`, `append-only follow: a watch trigger emits ONLY fresh lines (seen)`, `rotation: a new higher-N segment resets seen, follow continues with no dup`, `truncation: file shrinks below seen -> seen=0, re-tail (no negative slice)`, `never-throws: a throwing listSegments/readLines/watch -> empty initial emit + valid dispose()`, `dispose(): idempotent; a post-dispose trigger emits nothing (disposed guard)`
  - Fixtures: `a ScriptedLogTailFs fake with programmable segments/lines + a manual watch-trigger hook`, `a throwing-variant fake for each of listSegments/readLines/watch`
- **unit** — Source-scan guard the platform-coupled editor surface + the sc3 consumption (Settings dialog + FileEditorManager not headlessly bootable).
  - Subjects: `DebugConfigurable.kt: sections() = [status, orphans, mcp, log] (S006 appended; S004/S005 unchanged)`, `LogEditorSurface.kt: opens via FileEditorManager + a user-read-only LightVirtualFile (isWritable=false), streams under a guarded invokeLater + write action, disposes the tail on editor/project close, NO delete/rotate/clear of the on-disk log`, `LogEditorSection.kt: implements DebugSection, resolves a Project (degrades to a line when null), opens in an editor NOT inline, no log-mutating control`, `LogTailSeam.kt/LogModel.kt: default log dir /tmp/.insrc (mirrors PATHS.logDir, NOT ~/.insrc) + `<stem>.<N>.log` regex`
  - Fixtures: `read of ops/DebugConfigurable.kt`, `read of debug/LogEditorSurface.kt, debug/LogEditorSection.kt, debug/LogTailSeam.kt, debug/LogModel.kt`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(seam): LogTailSeam.tail emits the initial last-maxLines batch then append-only fresh lines on each watch trigger, never throwing`, `unit(seam): rotation + truncation cases keep the follow correct`, `source-scan(surface): LogEditorSurface opens the log via FileEditorManager into a LightVirtualFile editor tab (k5) and streams into its Document under a guarded off-EDT invokeLater (k2)`, `source-scan(section): 'Open in editor' resolves a Project and calls openLog; a null project degrades to a clear line; no inline live view`, `source-scan(page): DebugConfigurable.sections() appends the log section after status/orphans/mcp` |
| `ac2` | `unit(core): matchesFilter shows only matching lines for level/module/text (incl. no-level/no-module drop + non-JSON free-text) and empty matches all`, `unit(core): LogLevels.parseLevel maps the level filter token; the re-render uses matchesFilter (proven pure)`, `source-scan(surface): the LightVirtualFile is user-read-only (isWritable=false) and no write/delete/rotate/clear of the on-disk log (k5)`, `source-scan(seam): LogTailFs is read-only (list/read/watch only)` |

## Migration

**State before:** The Debug page renders exactly THREE sc3 sections (status, orphans, mcp) and buildBody() iterates them under InsrcCollapsible off the EDT (s1 symbol.locate). The plugin has NO editor surface — no FileEditorManager/LightVirtualFile usage (s1 capability.map). The rotation-aware tail + LogLine/LogFilter/parseLogLine/matchesFilter/LEVELS model exist ONLY in the CLI (s1 capability.map + data-model.trace). The logs live under /tmp/.insrc (PATHS.logDir), a DISTINCT root from the plugin's ~/.insrc daemon-root (s1 external-contract).

**State after:** The Debug page renders FOUR sc3 sections (status, orphans, mcp, log). A new debug/ log stack exists: a pure core (LogLine/LogFilter/LogCategory/LogLevels + parseLogLine + matchesFilter mirroring the CLI), a LogTailSeam over an injectable LogTailFs (rotation-aware tail under logDir=/tmp/.insrc, last-500 initial, append-only, never-throws, idempotent dispose), and a LogEditorSurface opening a user-read-only LightVirtualFile via FileEditorManager streaming the filtered bounded (1000-line) buffer off the EDT under a guarded write action, disposing the tail on editor/project close. The LogEditorSection resolves a Project + offers a read-only 'Open in editor' affordance. The log opens ONLY as an editor tab (k5), strictly read-only; the daemon, parent settings page, plugin.xml, and S004/S005 sections are unchanged (k1/k4).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the PURE log core (debug/LogModel.kt): LogLine/LogFilter/LogCategory/LogCategoryId/LogLevels + parseLogLine + matchesFilter mirroring the CLI byte-for-byte. Additive; golden CLI-parity unit tests. — ↩ rollbackable
2. Add LogTailSeam + injectable LogTailFs (debug/LogTailSeam.kt) with a LiveLogTailFs java.nio default binding logDir=/tmp/.insrc (NOT ~/.insrc) + the `<stem>.<N>.log` regex; rotation/append/truncation/never-throws mirror tailLogWith. Additive; scripted-fake unit tests. — ↩ rollbackable
3. Add LogEditorSurface (debug/LogEditorSurface.kt): open a user-read-only LightVirtualFile via FileEditorManager, subscribe off the EDT, stream the filtered 1000-line buffer into the Document under a disposed-guarded invokeLater + write action, dispose the tail on editor/project close. Additive; the plugin's FIRST editor surface. — ↩ rollbackable
4. Add LogEditorSection (debug/LogEditorSection.kt) implementing the sc3 DebugSection: a read-only category picker + 'Open in editor' affordance resolving a Project (default first/most-recent open project), degrading to a clear line when none is open. Additive. — ↩ rollbackable
5. Append logSection() to DebugConfigurable.sections() (now [status, orphans, mcp, log]) — the ONLY edit to existing code, one list element + one private factory. S004/S005 sections, buildBody(), parent settings page, plugin.xml byte-unchanged. — ↩ rollbackable
6. Add tests: golden-vector core tests, a scripted-fake LogTailSeam test, and DebugPageTest source-scan extensions. Verify locally: gradlew test buildPlugin (JDK21, --no-build-cache after new types). — ↩ rollbackable

**Backward compat:** No existing PUBLIC API changes signature or behavior. The only existing-code edit is appending one element to DebugConfigurable.sections() (an internal S004-owned method whose contract is 'an ordered section list'); S004's and S005's sections are untouched, so the Debug page's prior behavior is a strict subset. Everything else is additive new files in debug/. The daemon, the sc3 interface shape, the parent applicationConfigurable id, and plugin.xml are unchanged (k1/k4).

## Alternatives considered

### a1: Pure LogTailSeam + LogFilter core + a LightVirtualFile editor surface, one sc3 log-open section — **CHOSEN**

A pure injectable LogTailSeam + pure LogLine/LogFilter/parseLogLine/matchesFilter/LEVELS core, driven into a user-read-only LightVirtualFile opened via FileEditorManager and streamed off-EDT under a guarded write action; the sc3 section is a category picker + 'Open in editor' affordance appended to DebugConfigurable.sections().

Three plugin-internal layers, each at its natural testability boundary: (1) a PURE core (LogLine/LogFilter/LogCategory/LogLevels + parseLogLine + matchesFilter mirroring the CLI byte-for-byte, golden-vector tested); (2) a LogTailSeam over an injectable LogTailFs mirroring tailLogWith (rotation-aware, last-500 initial, append-only, truncation re-tail, never-throws, idempotent dispose, scripted-fake tested); (3) a LogEditorSurface opening a user-read-only LightVirtualFile via FileEditorManager and streaming the filtered bounded buffer into the Document off the EDT under a guarded write action, disposing on editor/project close. The sc3 LogEditorSection is a read-only category picker + 'Open in editor' affordance appended to DebugConfigurable.sections().

### a2: ConsoleView (execution console) hosted in the editor area

Reuse the same pure core but render the tail into a com.intellij.execution.ui.ConsoleView mounted as an editor-area tab, appending filtered lines incrementally.

Keep the LogTailSeam + pure core from a1 but replace the surface: openLog builds a ConsoleView via TextConsoleBuilderFactory and console.print()s each matchesFilter-passing line with per-level content type; a filter change clears + re-prints the buffer.

**Rejected because:** It would require an HLD back-flow/amendment rather than a clean consume (the HLD names LightVirtualFile+FileEditorManager), and the heavier com.intellij.execution surface is harder to source-scan-assert as the 'editor tab' invariant ac1 states.

### a3: Inline bounded log view rendered directly in the Debug settings section

Drop the editor surface: render the filtered tail inline inside the sc3 section (a scrolling text component in an InsrcCollapsible panel).

Reuse the LogTailSeam + pure core, but LogEditorSection.component() itself hosts a filter toolbar + a bounded scrolling text component fed off-EDT from the tail; no LightVirtualFile, no FileEditorManager, no Project resolution.

**Rejected because:** An inline settings-page view is exactly the anti-pattern k5 rules out; a modal, small, dispose-on-close settings dialog is a poor host for a continuously-scrolling log, and it contradicts the HLD's named LightVirtualFile + FileEditorManager seam.

## Open questions

- Project resolution for the application-scoped Debug page: FileEditorManager is Project-scoped, so the 'Open in editor' affordance resolves the first/most-recently-focused ProjectManager.getInstance().openProjects entry (injectable projectResolver) and degrades to a clear 'open a project to view logs' line when none is open. Chosen default is internal to the S006 boundary; flagged for visibility, not a shared-contract change.
- The LiveLogTailFs watch mechanism (java.nio WatchService vs a polling ticker) is a build-time implementation choice behind the injectable LogTailFs seam; both satisfy the never-throws + append-only contract, so the scripted-fake unit tests are unaffected either way.

## Resolved questions

- `q43a765ae` — Project resolution for the application-scoped Debug page: FileEditorManager is Project-scoped, so the 'Open in editor' affordance resolves the first/most-recently-focused ProjectManager.getInstance().openProjects entry (injectable projectResolver) and degrades to a clear 'open a project to view logs' line when none is open. Chosen default is internal to the S006 boundary; flagged for visibility, not a shared-contract change.
  - **resolved**: Resolve from the Settings dialog's own DataContext (CommonDataKeys.PROJECT), with the ProjectManager.getInstance().openProjects most-recent scan as fallback, behind the same injectable projectResolver seam; degrade to a clear 'open a project to view logs' line when none resolves. — Removes the wrong-window failure mode under multiple open projects without adding UI or abandoning the HLD-named editor surface; keeps the injectable seam so tests use a fake resolver unchanged. _(2026-09-21T12:50:38.842Z)_
- `qca0ebf08` — The LiveLogTailFs watch mechanism (java.nio WatchService vs a polling ticker) is a build-time implementation choice behind the injectable LogTailFs seam; both satisfy the never-throws + append-only contract, so the scripted-fake unit tests are unaffected either way.
  - **resolved**: Fixed-interval polling ticker: LiveLogTailFs runs a single scheduled ~1s ticker that stats the active segment and reads only the appended bytes from the last offset; each tick is wrapped in a catch-all so a failed stat/read is a skipped tick (never-throws), cancelled on dispose. — Smallest single code path that satisfies never-throws + append-only identically on every platform; the JDK WatchService already degrades to polling on macOS (the primary dev platform), so event-driven options add concurrency surface without a reliable latency win. Swappable behind the injectable LogTailFs seam later. _(2026-09-21T12:51:05.359Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability.map: CLI src/cli/services/debug.ts tailLogWith rotation-aware tail (resolveActive highest-N, last-maxLines initial, append-only seen, truncation re-tail, never-throws, idempotent dispose) + LOG_CATEGORIES + injectable TailDeps`
- **[[c2]]** `analyze-bundle` `s1 data-model.trace: CLI src/cli/services/debug-types.ts LogCategory/LogLine/LogFilter + parseLogLine + matchesFilter + LEVELS (trace10..fatal60) semantics`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate: sc3 DebugPageHost/DebugSection (debug/DebugPageHost.kt) + DebugConfigurable.sections() render loop + the InsrcOpsConfigurable off-EDT/disposed-guarded-invokeLater base (k2/k4)`
- **[[c4]]** `analyze-bundle` `s1 capability.map: the plugin has NO editor surface yet (grep FileEditorManager/LightVirtualFile = none) + the FileEditorManager project-scoping tension; the user-read-only LightVirtualFile + FileEditorManager.openFile pattern`
- **[[c5]]** `code` `src/shared/paths.ts: PATHS.logDir = LOG_DIR = join('/tmp', '.insrc') (the log root is /tmp/.insrc, NOT ~/.insrc) + the `<stem>.<N>.log` rotation scheme in debug.ts realTailDeps`
- **[[c6]]** `analyze-bundle` `s1 external-contract + capability.map + data-model.trace jointly: the CLI source-of-truth for the tail semantics, the strictly-read-only log access, and the byte-for-byte pure filter/parse core S006 mirrors`
