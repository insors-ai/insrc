# Changelog

All notable changes to the insrc VS Code extension. The Marketplace shows this file
on the extension's Changelog tab.

## 0.5.16 - 2026-10-29

Everything since 0.5.15.

### Models

- **Model tiers come from the daemon.** *insrc: Set model tier* offers the families, models
  (with aliases, and marks for approved and not-installed models) and effort levels the daemon
  reports, and saves the tier as a whole. The picker shows the tier the daemon actually runs.
- **Effort settings.** Each CLI tier has an effort setting (CLI default, or low to max), in
  Settings and as a step in the tier picker. An Ollama tier has none.
- **Other models.** For a Claude or Codex tier, *Enter another model id…* has the daemon try a
  model it does not list. You see the result for each effort level and approve or reject the
  model; an approved model is saved and the daemon restarts to use it.
- **Settings checked before saving.** A tier changed in VS Code Settings is checked against the
  daemon's model list and saved as a whole tier. The settings no longer carry a built-in model
  list.
- **New defaults.** The cheap tier defaults to the Claude CLI's haiku; with Codex installed the
  tiers default to the GPT-6 models.

### Repo Configuration panel

- The panel now sets only each role's tier and the core floor for a repository, laid out as a
  table.

### Daemon

- The Daemon tab lists the registered repositories and how completely each is indexed.
- New setting `insrc.daemon.threads.sessionIdleMs`: how long a session's worker thread may sit
  idle before the daemon releases it.
- Code-review wait limits are settings: an overall ceiling and how long a review may go without
  progress.

### Review pane

- A code reference clicked inside a document's companion page opens in the editor.

### Assistant instructions

- The instructions written for your AI assistant say which reviews are required, cap reviews at
  three rounds per cycle, and explain when a design needs a diagram.

## 0.5.15 - 2026-10-16

Everything since 0.5.13, the last version published before this one. Version 0.5.14 was
never published; its changes are included here.

### Chat

- **One message queue per repository.** Messages sent from any window go through a shared
  queue, so two windows never start two turns at once. A message sent while a turn runs waits
  in an outbox band, with its place in the queue and actions on each message.
- **Failed turns retry.** A turn that fails for a passing reason (the CLI overloaded, a busy
  queue file) is retried, with the attempt and a countdown on the row and a *Retry now* action.
  The sign-in line names the login step for the CLI in use.
- **Queue recovery.** A window that reloaded or crashed no longer blocks the queue: the next
  window takes over its turn. If the queue cannot be opened, the chat is disabled with a notice.
- **Long transcripts.** The chat loads the latest page of a long transcript and fetches older
  pages as you scroll. Sessions are kept in files, several windows can share them, and existing
  sessions are migrated from VS Code storage on first start.
- **Attachments.** An attach button and image paste; pending files show as chips on the message.
- **Approvals one at a time.** Approval requests from a turn queue up and are shown one card at a
  time, each with its place in the line. Typing a message denies the in-turn requests.
- **Diffs.** A turn's file changes appear as a diff section with syntax highlighting. Clicking a
  diff line, or the path in its header, opens the file at that line.
- **Clickable references.** Links and `path:line` code references in chat messages open in the
  browser or the editor.
- **Look.** The chat takes its colours from the VS Code theme. Long assistant replies can be
  collapsed. The progress widget is always visible, with an idle animation when nothing runs.
  The chat is named *insrc ctrl*.
- **Documents the agent presents open for review.** When the agent declares the documents it
  asks you to review (the `insrc_present` tool), the review pane opens exactly those; the chat
  says which ones were not shown and why.

### Review pane

- A paged table of documents with search and a type filter.
- Inline comments on selected text, sent with the decision; saved comments are shown with the
  document.
- Each document of an artifact has its own tab; an HTML document is shown as the page itself.
- The pane reloads the shown document when it changes on disk, and opens in an existing editor
  group that holds no chat tab.
- Links and code references in the pane are clickable.

### Delivery board

- Screens for epics, stories and issues, with filter bar, stage boxes and a table of a story's
  planned tasks. The board has its own icon.

### Daemon

- A stopped but installed daemon is started when the extension activates. The settings pull,
  update check and onboarding wait for that to finish, so they find the running daemon.
- The daemon's status says when its store has failed.

### Fixes

- Codex chat turns no longer hang waiting for input.
- A prompt that begins with a dash is no longer read as an option by the `claude` or `codex` CLI.
- A rebuilt chat page learns that a turn is running, so the progress widget and Stop come back.
- The chat page leaves the running state only on a turn's own end, not on an informational line.
- A restored chat tab gets the current title.
- A turn whose output ends without a terminal event ends as an error instead of staying open.

## 0.5.13

Last version published to the Marketplace. Its changes are in the git history before
`c81ba05e`.
