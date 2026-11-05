# Vibe programmatic prompt delivery

Issue: ISSUE-910fce32967bc4ea. Build: BUILD-1030f5889f8ec287-S001.

The Vibe mapper in vscode-plugin/src/chat/cli-adapter.ts now passes the complete prompt as the value of --prompt= rather than a positional argument after bare -p. This is one existing mapper change; initial turns, resumed turns and deriveChatTitle all use the same path. Streaming output, closeInput, resume, attachment directories, permission arguments and VIBE_ACTIVE_MODEL remain in place. Backend source is unchanged: its prompt already travels through stdin.

Regression coverage in vscode-plugin/src/chat/__tests__/cli-adapter.test.ts verifies exact prompt value for multiline and option-like text in initial and resumed requests, the shared title path and model pin, and the existing streaming/permission/attachment arguments. Existing backend Vibe tests exercise stdin transport.

The installed Vibe 3.0.4 parser was checked locally with its app server replaced by a stub executable that exits immediately: no inference is possible in this probe. The old argv triggers No prompt provided before starting the stub. Corrected argv, option-like multiline text and existing backend stdin input all pass that guard and start the stub. Their expected initialization failures do not constitute successful inference. Raw results are in evidence/vibe-cli-probe.json. A full authenticated Mistral response remains a manual check.

No UI layout, IPC/storage relationships, provider configuration, or new dependency is involved. No new visual design artifact is needed for this isolated CLI argument correction. The unrelated docs/vscode-plugin-screen-recording-script.html changes are excluded.

Local checks: 152/152 affected tests passed with no skips or cancellations. Root and plugin TypeScript checks are clean.
