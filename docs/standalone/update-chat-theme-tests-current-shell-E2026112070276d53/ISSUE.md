<!-- insrc:artifact ISSUE-70276d53b0e62378 -->

# Update chat theme tests for the current shell structure

## Reproduction

Six chat-theme assertions expect two style blocks, select the last as the layout stylesheet, and require the old exact history-chip markup. The shell now has three blocks and a new-chat button before the history chip, so later root/body/selector assertions inspect the wrong source.

## Root cause

The tests identify stylesheet ownership by historical position and freeze markup from before the intentional chrome addition. Their structural assumptions no longer match the rendered shell; the audit did not establish a visual regression.

## Fix intent

Restore accurate coverage of stylesheet ownership, token-only colors, selectors, CSP and history/new-chat behavior against the current shell. Acceptance: all six affected assertions and positive/negative theme controls pass, and any actual visual discrepancy discovered is fixed within the existing design rather than hidden by weaker snapshots. Keep general probe-process lifetime in batch 01.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
