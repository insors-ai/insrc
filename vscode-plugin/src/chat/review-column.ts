/**
 * The review pane's placement: which editor group a NEW pane opens in.
 *
 * A vscode-free, deps-free function over a plain list of the window's editor groups (mirrors group-lock.ts, whose
 * `isChatTabInput` is the one rule for "this tab is the chat"). The review pane goes into a group you already have
 * open that holds no chat tab, instead of opening beside or over the chat; with no such group it says so and the
 * caller keeps today's placement.
 */

import { isChatTabInput } from './group-lock.js';

/** The slice of an editor group the choice reads (extension.ts fills it from `vscode.window.tabGroups.all`). */
export interface EditorGroupView {
  readonly viewColumn: number;
  readonly isActive: boolean;
  readonly tabs: readonly { readonly input: unknown }[];
}

/**
 * The view column to open the review pane in, or undefined when every open group holds the chat (or none is open).
 * A group with any chat tab is left out whole. Among the rest the active group wins, otherwise the lowest column.
 */
export function chooseReviewColumn(groups: readonly EditorGroupView[], chatViewType: string): number | undefined {
  const others = groups.filter((g) => !g.tabs.some((t) => isChatTabInput(t.input, chatViewType)));
  if (others.length === 0) return undefined;
  const active = others.find((g) => g.isActive);
  if (active !== undefined) return active.viewColumn;
  return others.reduce((lowest, g) => (g.viewColumn < lowest.viewColumn ? g : lowest)).viewColumn;
}
