/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's state (E2 s1, sc2) and the down-messages derived from it.
 *
 * State changes only through reduceBoardState, a pure function over three
 * events: a refresh was requested (stamped with a strictly increasing request
 * number), the client answered a request, or the reader changed the selection.
 * An answer to anything but the newest request is dropped, which is the whole
 * of the one-coherent-snapshot rule. A failed refresh keeps the last applied
 * snapshot, so the board stays visible and is marked stale; a snapshot with no
 * items is 'empty' only when nothing failed to load. The selection survives a
 * refresh, except an item that is no longer in the board, which is cleared with
 * a notice. boardDownMessages turns state into the status message and s1's
 * interim item list. Pure and vscode-free.
 */

import type { DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import type { BoardDownMessage, BoardScope, BoardView, Density, Envelope, ItemListEntry, StatusView } from './board-protocol.js';
import type { DisplayLabels } from './labels.js';

export interface AppliedSnapshot {
  readonly snapshot: DeliverySnapshot;
  /** Request number the snapshot answered; older answers are dropped. */
  readonly requestSeq: number;
  /** True when the snapshot reports unreadable records or store-level notices. */
  readonly partial: boolean;
}

export type LoadStatus =
  | { readonly state: 'loading'; readonly last: AppliedSnapshot | null }
  | { readonly state: 'ready'; readonly current: AppliedSnapshot }
  | { readonly state: 'empty'; readonly current: AppliedSnapshot }
  | { readonly state: 'unavailable'; readonly last: AppliedSnapshot | null; readonly message: string; readonly at: string }
  | { readonly state: 'failed'; readonly last: AppliedSnapshot | null; readonly message: string; readonly at: string };

export interface BoardSelection {
  readonly view: BoardView;
  readonly scope: BoardScope;
  readonly search: string;
  readonly needsAttentionOnly: boolean;
  readonly selectedItemId: string | null;
  readonly density: Density;
}

/** 'unavailable' covers daemon-unavailable and no-workspace; 'failed' covers read-failed and timed-out. */
export interface BoardState {
  readonly status: LoadStatus;
  readonly selection: BoardSelection;
  /** Set when a refresh removed the selected item. */
  readonly selectionNotice: string | null;
  /** The newest refresh request number; only its answer is applied. */
  readonly latestSeq: number;
}

export type BoardEvent =
  | { readonly type: 'refresh-requested'; readonly seq: number }
  | { readonly type: 'snapshot-arrived'; readonly seq: number; readonly result: DeliveryResult<DeliverySnapshot>; readonly at: string }
  | { readonly type: 'selection-changed'; readonly selection: BoardSelection };

export const INITIAL_SELECTION: BoardSelection = {
  view: 'board',
  scope: { kind: 'all' },
  search: '',
  needsAttentionOnly: false,
  selectedItemId: null,
  density: 'comfortable',
};

export function initialBoardState(): BoardState {
  return { status: { state: 'loading', last: null }, selection: INITIAL_SELECTION, selectionNotice: null, latestSeq: 0 };
}

/** The snapshot the board currently shows: the current one, or the last good one behind a loading or failed state. */
export function shownSnapshot(status: LoadStatus): AppliedSnapshot | null {
  return status.state === 'ready' || status.state === 'empty' ? status.current : status.last;
}

function isPartial(s: DeliverySnapshot): boolean {
  return s.unreadableCount > 0 || s.notices.length > 0;
}

function applySnapshot(state: BoardState, applied: AppliedSnapshot): BoardState {
  const items = applied.snapshot.items;
  const status: LoadStatus = items.length === 0 && !applied.partial
    ? { state: 'empty', current: applied }
    : { state: 'ready', current: applied };
  const selected = state.selection.selectedItemId;
  if (selected !== null && !items.some(i => i.id === selected)) {
    return {
      ...state,
      status,
      selection: { ...state.selection, selectedItemId: null },
      selectionNotice: 'The selected item is no longer in the board.',
    };
  }
  return { ...state, status, selectionNotice: null };
}

export function reduceBoardState(state: BoardState, event: BoardEvent): BoardState {
  switch (event.type) {
    case 'refresh-requested':
      return { ...state, latestSeq: event.seq, status: { state: 'loading', last: shownSnapshot(state.status) } };
    case 'selection-changed':
      return { ...state, selection: event.selection };
    case 'snapshot-arrived': {
      if (event.seq !== state.latestSeq) return state;   // a superseded answer is dropped
      const last = shownSnapshot(state.status);
      if (event.result.ok) {
        return applySnapshot(state, { snapshot: event.result.value, requestSeq: event.seq, partial: isPartial(event.result.value) });
      }
      const { kind, message } = event.result.failure;
      const unavailable = kind === 'daemon-unavailable' || kind === 'no-workspace';
      return { ...state, status: { state: unavailable ? 'unavailable' : 'failed', last, message, at: event.at } };
    }
  }
}

function partialNotice(s: DeliverySnapshot): string | null {
  if (!isPartial(s)) return null;
  const parts: string[] = [];
  if (s.unreadableCount > 0) {
    parts.push(`${s.unreadableCount} record${s.unreadableCount === 1 ? '' : 's'} could not be read; every readable item is shown.`);
  }
  for (const n of s.notices) parts.push(n.message);
  return parts.join(' ');
}

function statusView(status: LoadStatus): StatusView {
  const shown = shownSnapshot(status);
  const takenAt = shown?.snapshot.takenAt ?? null;
  const partial = shown === null ? null : partialNotice(shown.snapshot);
  switch (status.state) {
    case 'loading':
      return { state: 'loading', takenAt, message: 'Refreshing the delivery board…', partialNotice: partial, stale: false };
    case 'ready':
      return { state: 'ready', takenAt, message: null, partialNotice: partial, stale: false };
    case 'empty':
      return { state: 'empty', takenAt, message: 'This workspace has no recorded delivery work yet.', partialNotice: null, stale: false };
    case 'unavailable':
    case 'failed': {
      const prefix = status.state === 'unavailable' ? 'The delivery board is unavailable' : 'The refresh failed';
      const since = shown === null ? '' : ` Showing the board from ${shown.snapshot.takenAt}.`;
      return { state: status.state, takenAt, message: `${prefix} at ${status.at}: ${status.message}${since}`, partialNotice: partial, stale: shown !== null };
    }
  }
}

/** The status message first, then (when a snapshot is shown) every item of that snapshot in its own order. */
export function boardDownMessages(state: BoardState, labels: DisplayLabels): readonly Envelope<BoardDownMessage>[] {
  const out: Envelope<BoardDownMessage>[] = [{ v: 1, payload: { type: 'status', status: statusView(state.status) } }];
  const shown = shownSnapshot(state.status);
  if (shown !== null) {
    const items: ItemListEntry[] = shown.snapshot.items.map(i => ({
      itemId: i.id,
      kind: i.kind,
      title: i.title,
      // A stage this build has no label for (a newer daemon) shows its raw id rather than nothing.
      stageLabel: i.stage === null ? null : labels.stage[i.stage.stage] ?? String(i.stage.stage),
    }));
    out.push({ v: 1, payload: { type: 'items', items } });
  }
  return out;
}
