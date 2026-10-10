/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's state (E2 s1, sc2; screens and navigation, ISSUE-348d4663) and the down-messages derived from it.
 *
 * State changes only through reduceBoardState, a pure function over four events: a refresh was requested (stamped
 * with a strictly increasing request number), the client answered a request, the reader navigated, or the reader
 * changed the density. An answer to anything but the newest request is dropped, which is the whole of the
 * one-coherent-snapshot rule. A failed refresh keeps the last applied snapshot, so the board stays visible and is
 * marked stale; a snapshot with no items is 'empty' only when nothing failed to load.
 *
 * Where the reader is lives in a trail of screens: the first entry is always one of the four views, then an epic's
 * board, then a story's or issue's own screen. Each entry keeps its own search, attention filter and paging, so Back
 * returns to an earlier screen as the reader left it; choosing one of the four views starts a new trail, so no screen
 * outlives a change of context. A refresh cuts the trail before the first entry whose epic or item is gone, with a
 * notice. boardDownMessages turns state into the status message and one screen message. Pure and vscode-free.
 */

import type { DeliveryResult } from './delivery-client.js';
import type { DeliveryItemView, DeliverySnapshot, DeliveryStage } from './delivery-contract.js';
import { buildBoardViewModel, compactIdOf, epicOf, indexItems, isPlaceable, showMore, titleOf, type BoardPaging, type MatchFilter } from './board-model.js';
import { buildEpicRollup, buildIssueView, epicRowOf } from './board-views.js';
import type {
  BoardDownMessage, BoardScreen, CrumbView, Density, Envelope, ItemDetailsViewModel, ItemTab, ListView, ScreenBody, ScreenModel,
  StatePanelView, StatusView,
} from './board-protocol.js';
import { msBetween, readableTime, type DisplayLabels } from './labels.js';

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

/** One screen in the reader's trail, with the filters and paging it had when the reader left it. */
export interface TrailEntry {
  /** Unique within a panel; never reused, so the webview can key scroll and section memory on it. */
  readonly id: number;
  readonly screen: BoardScreen;
  readonly search: string;
  readonly needsAttentionOnly: boolean;
  readonly paging: BoardPaging;
  /** The epic or item the reader opened from this screen, to focus on return. */
  readonly openedId: string | null;
}

export interface BoardSelection {
  /** Never empty; the first entry is always one of the four views, the last is the screen shown. */
  readonly trail: readonly TrailEntry[];
  readonly density: Density;
}

/** 'unavailable' covers daemon-unavailable and no-workspace; 'failed' covers read-failed and timed-out. */
export interface BoardState {
  readonly status: LoadStatus;
  readonly selection: BoardSelection;
  /** Set when a refresh removed what the reader was viewing. */
  readonly selectionNotice: string | null;
  /** The newest refresh request number; only its answer is applied. */
  readonly latestSeq: number;
  /** The last trail entry id handed out. */
  readonly entrySeq: number;
  /** True when the last navigation returned to an earlier screen (Back, a crumb, or a refresh that cut the trail). */
  readonly restored: boolean;
}

/** What the reader asked for; ids were checked against the shown snapshot by the host. */
export type NavIntent =
  | { readonly type: 'set-view'; readonly view: ListView }
  | { readonly type: 'open-epic'; readonly epicItemId: string }
  | { readonly type: 'open-item'; readonly itemId: string }
  | { readonly type: 'set-item-tab'; readonly tab: ItemTab }
  | { readonly type: 'back' }
  | { readonly type: 'go-to-crumb'; readonly index: number }
  | { readonly type: 'set-search'; readonly search: string }
  | { readonly type: 'set-attention'; readonly on: boolean }
  | { readonly type: 'clear-filters' }
  | { readonly type: 'show-more'; readonly stage: DeliveryStage };

export type BoardEvent =
  | { readonly type: 'refresh-requested'; readonly seq: number }
  | { readonly type: 'snapshot-arrived'; readonly seq: number; readonly result: DeliveryResult<DeliverySnapshot>; readonly at: string }
  | { readonly type: 'navigate'; readonly intent: NavIntent }
  | { readonly type: 'set-density'; readonly density: Density };

/** The trail never grows past this; the oldest entry after the root is dropped first. */
export const TRAIL_LIMIT = 20;

export const REMOVED_NOTICE = 'What you were viewing is no longer on the board.';

export const INITIAL_SELECTION: BoardSelection = {
  trail: [{ id: 1, screen: { kind: 'list', view: 'all' }, search: '', needsAttentionOnly: false, paging: {}, openedId: null }],
  density: 'comfortable',
};

export function initialBoardState(): BoardState {
  return { status: { state: 'loading', last: null }, selection: INITIAL_SELECTION, selectionNotice: null, latestSeq: 0, entrySeq: 1, restored: false };
}

/** The screen the reader is on: the trail's last entry. */
export function currentEntry(selection: BoardSelection): TrailEntry {
  return selection.trail[selection.trail.length - 1]!;
}

/** The item of the story or issue screen shown, or null on any other screen. */
export function currentItemId(selection: BoardSelection): string | null {
  const screen = currentEntry(selection).screen;
  return screen.kind === 'item' ? screen.itemId : null;
}

/** The snapshot the board currently shows: the current one, or the last good one behind a loading or failed state. */
export function shownSnapshot(status: LoadStatus): AppliedSnapshot | null {
  return status.state === 'ready' || status.state === 'empty' ? status.current : status.last;
}

function isPartial(s: DeliverySnapshot): boolean {
  return s.unreadableCount > 0 || s.notices.length > 0;
}

/** Whether a trail entry's screen still names something in the snapshot; the four views always do. */
function stillOnBoard(screen: BoardScreen, snapshot: DeliverySnapshot): boolean {
  switch (screen.kind) {
    case 'list': return true;
    case 'epic': return snapshot.items.some(i => i.kind === 'epic' && i.id === screen.epicItemId);
    case 'item': return snapshot.items.some(i => i.id === screen.itemId && isPlaceable(i));
  }
}

function applySnapshot(state: BoardState, applied: AppliedSnapshot): BoardState {
  const items = applied.snapshot.items;
  const status: LoadStatus = items.length === 0 && !applied.partial
    ? { state: 'empty', current: applied }
    : { state: 'ready', current: applied };
  const trail = state.selection.trail;
  const gone = trail.findIndex(e => !stillOnBoard(e.screen, applied.snapshot));
  if (gone > 0) {
    // The root is one of the four views, so it always survives.
    return {
      ...state, status, restored: true, selectionNotice: REMOVED_NOTICE,
      selection: { ...state.selection, trail: trail.slice(0, gone) },
    };
  }
  return { ...state, status, selectionNotice: null };
}

/** A filtered screen: one of the four views or an epic's board. A story or issue screen has no filters. */
const isFiltered = (e: TrailEntry): boolean => e.screen.kind !== 'item';

function withTrail(state: BoardState, trail: readonly TrailEntry[], restored: boolean): BoardState {
  return { ...state, selection: { ...state.selection, trail }, restored, selectionNotice: null };
}

/** Push a new screen, recording on the screen left what was opened from it; the root survives the cap. */
function push(state: BoardState, screen: BoardScreen, openedId: string): BoardState {
  const trail = state.selection.trail;
  const left = currentEntry(state.selection);
  const id = state.entrySeq + 1;
  const next: TrailEntry = { id, screen, search: '', needsAttentionOnly: left.needsAttentionOnly, paging: {}, openedId: null };
  let out = [...trail.slice(0, -1), { ...left, openedId }, next];
  while (out.length > TRAIL_LIMIT) out = [out[0]!, ...out.slice(2)];
  return { ...withTrail(state, out, false), entrySeq: id };
}

/** Change the current entry in place (same id); a new search or filter also resets its paging. */
function updateCurrent(state: BoardState, change: Partial<TrailEntry>): BoardState {
  const trail = state.selection.trail;
  return withTrail(state, [...trail.slice(0, -1), { ...currentEntry(state.selection), ...change }], false);
}

function navigate(state: BoardState, intent: NavIntent): BoardState {
  const trail = state.selection.trail;
  const cur = currentEntry(state.selection);
  switch (intent.type) {
    case 'set-view': {
      if (trail.length === 1 && cur.screen.kind === 'list' && cur.screen.view === intent.view) return state;
      const id = state.entrySeq + 1;
      const root: TrailEntry = { id, screen: { kind: 'list', view: intent.view }, search: '', needsAttentionOnly: cur.needsAttentionOnly, paging: {}, openedId: null };
      return { ...withTrail(state, [root], false), entrySeq: id };
    }
    case 'open-epic':
      if (cur.screen.kind === 'epic' && cur.screen.epicItemId === intent.epicItemId) return state;
      return push(state, { kind: 'epic', epicItemId: intent.epicItemId }, intent.epicItemId);
    case 'open-item':
      if (cur.screen.kind === 'item' && cur.screen.itemId === intent.itemId) return state;
      return push(state, { kind: 'item', itemId: intent.itemId, tab: 'overview' }, intent.itemId);
    case 'set-item-tab':
      if (cur.screen.kind !== 'item' || cur.screen.tab === intent.tab) return state;
      return updateCurrent(state, { screen: { ...cur.screen, tab: intent.tab } });
    case 'back':
      return trail.length > 1 ? withTrail(state, trail.slice(0, -1), true) : state;
    case 'go-to-crumb':
      return Number.isInteger(intent.index) && intent.index >= 0 && intent.index < trail.length - 1
        ? withTrail(state, trail.slice(0, intent.index + 1), true)
        : state;
    case 'set-search':
      if (!isFiltered(cur) || cur.search === intent.search) return state;
      return updateCurrent(state, { search: intent.search, paging: {} });
    case 'set-attention':
      if (!isFiltered(cur) || cur.needsAttentionOnly === intent.on) return state;
      return updateCurrent(state, { needsAttentionOnly: intent.on, paging: {} });
    case 'clear-filters':
      if (!isFiltered(cur)) return state;
      return updateCurrent(state, { search: '', needsAttentionOnly: false, paging: {} });
    case 'show-more':
      if (!isFiltered(cur)) return state;
      return updateCurrent(state, { paging: showMore(cur.paging, intent.stage) });
  }
}

export function reduceBoardState(state: BoardState, event: BoardEvent): BoardState {
  switch (event.type) {
    case 'refresh-requested':
      return { ...state, latestSeq: event.seq, status: { state: 'loading', last: shownSnapshot(state.status) } };
    case 'navigate':
      return navigate(state, event.intent);
    case 'set-density':
      return event.density === state.selection.density ? state : { ...state, selection: { ...state.selection, density: event.density } };
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

/** How long ago the shown snapshot was taken, phrased for the app bar; an unparseable time is shown as recorded. */
function freshnessLabel(takenAt: string | null, now: string): string | null {
  if (takenAt === null) return null;
  const ms = msBetween(takenAt, now);
  if (ms === null) return `Updated ${takenAt}`;
  if (ms < 60_000) return 'Updated just now';
  if (ms < 3_600_000) {
    const minutes = Math.floor(ms / 60_000);
    return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  return `Updated ${readableTime(takenAt)}`;
}

/** The partial-evidence panel for a snapshot with unreadable records or store notices; null otherwise. */
function partialPanel(s: DeliverySnapshot): StatePanelView | null {
  if (!isPartial(s)) return null;
  const affected: { artifactIds: readonly string[]; text: string }[] = [];
  if (s.unreadableCount > 0) {
    affected.push({ artifactIds: [], text: `${s.unreadableCount} record${s.unreadableCount === 1 ? '' : 's'} could not be read.` });
  }
  for (const n of s.notices) affected.push({ artifactIds: [...n.artifactIds], text: n.message });
  return {
    kind: 'partial', title: 'Some evidence could not be read',
    text: 'Every readable item is shown; counts may not cover every record.',
    action: null, stale: false, affected, placement: 'banner',
  };
}

/**
 * The status bar's view of a load status, with its freshness line and state panel; also the source of the refresh
 * announcement's text (s5). `now` is the host clock, used only to phrase the freshness line.
 */
export function statusView(status: LoadStatus, now: string): StatusView {
  const shown = shownSnapshot(status);
  const takenAt = shown?.snapshot.takenAt ?? null;
  const partial = shown === null ? null : partialNotice(shown.snapshot);
  const freshness = freshnessLabel(takenAt, now);
  const partialP = shown === null ? null : partialPanel(shown.snapshot);
  switch (status.state) {
    case 'loading':
      return { state: 'loading', takenAt, message: 'Refreshing the delivery board…', partialNotice: partial, stale: false, freshnessLabel: freshness, panel: partialP };
    case 'ready':
      return { state: 'ready', takenAt, message: null, partialNotice: partial, stale: false, freshnessLabel: freshness, panel: partialP };
    case 'empty':
      return {
        state: 'empty', takenAt, message: 'This workspace has no recorded delivery work yet.', partialNotice: null, stale: false, freshnessLabel: freshness,
        panel: { kind: 'empty', title: 'No work items yet', text: 'The workspace was read successfully. No epic, story or issue records were found.', action: null, stale: false, affected: [], placement: 'body' },
      };
    case 'unavailable':
    case 'failed': {
      const prefix = status.state === 'unavailable' ? 'The delivery board is unavailable' : 'The refresh failed';
      const since = shown === null ? '' : ` Showing the board from ${shown.snapshot.takenAt}.`;
      const stale = shown !== null;
      const panel: StatePanelView = {
        kind: status.state === 'unavailable' ? 'unavailable' : 'refresh-failed',
        title: stale ? 'Showing the last successful snapshot' : prefix,
        text: stale ? `${prefix}: ${status.message}. Your board and selection are preserved.` : status.message,
        // With no board to fall back on the panel replaces the screen; over a stale board it sits above it.
        action: 'retry', stale, affected: [], placement: stale ? 'banner' : 'body',
      };
      return { state: status.state, takenAt, message: `${prefix} at ${status.at}: ${status.message}${since}`, partialNotice: partial, stale, freshnessLabel: freshness, panel };
    }
  }
}

/** The search box's placeholder on each screen that has one. */
const SEARCH_PLACEHOLDER: Readonly<Record<ListView | 'epic', string>> = {
  all: 'Search titles, ids, epics',
  epics: 'Search epics',
  standalone: 'Search standalone work',
  issues: 'Search issues',
  epic: 'Search this epic',
};

/** An item's id as the breadcrumb shows it: the story number ('S001'), or the issue's or epic's short hash. */
export function shortId(id: string): string {
  return compactIdOf(id).split(' / ').pop() ?? id;
}

/** The breadcrumb label of one trail entry's screen. */
function screenLabel(screen: BoardScreen, byId: ReadonlyMap<string, DeliveryItemView>, labels: DisplayLabels): string {
  switch (screen.kind) {
    case 'list': return labels.views[screen.view];
    case 'epic': { const e = byId.get(screen.epicItemId); return e === undefined ? screen.epicItemId : titleOf(e); }
    case 'item': return shortId(screen.itemId);
  }
}

/**
 * The breadcrumb: 'Delivery', then the root view (All work is the board's home and adds nothing), 'Needs attention'
 * when the root's toggle is on, then one crumb per later entry. Each crumb returns to its trail entry.
 */
function crumbsOf(trail: readonly TrailEntry[], byId: ReadonlyMap<string, DeliveryItemView>, labels: DisplayLabels): CrumbView[] {
  const root = trail[0]!;
  const crumbs: CrumbView[] = [{ label: 'Delivery', index: 0 }];
  if (root.screen.kind === 'list' && root.screen.view !== 'all') crumbs.push({ label: labels.views[root.screen.view], index: 0 });
  if (root.needsAttentionOnly) crumbs.push({ label: labels.needsAttention, index: 0 });
  trail.slice(1).forEach((e, i) => crumbs.push({ label: screenLabel(e.screen, byId, labels), index: i + 1 }));
  return crumbs;
}

/** Back names where it goes: '← Back to epic', '← <view>' for one of the four views, '← Back to <id>' for an item. */
function backOf(trail: readonly TrailEntry[], byId: ReadonlyMap<string, DeliveryItemView>, labels: DisplayLabels): ScreenModel['back'] {
  const prev = trail[trail.length - 2];
  if (prev === undefined) return null;
  switch (prev.screen.kind) {
    case 'epic': return { label: '\u2190 Back to epic' };
    case 'list': return { label: `\u2190 ${labels.views[prev.screen.view]}` };
    case 'item': return { label: `\u2190 Back to ${screenLabel(prev.screen, byId, labels)}` };
  }
}

const filterOf = (entry: TrailEntry, scope: MatchFilter['scope']): MatchFilter =>
  ({ scope, search: entry.search, needsAttentionOnly: entry.needsAttentionOnly });

/** The current screen's title and body, or null when its item has no details (it is not in the snapshot). */
function screenBody(
  entry: TrailEntry, snapshot: DeliverySnapshot, byId: ReadonlyMap<string, DeliveryItemView>, labels: DisplayLabels,
  detailsOf: (itemId: string) => ItemDetailsViewModel | null,
): { readonly title: string; readonly body: ScreenBody } | null {
  const screen = entry.screen;
  switch (screen.kind) {
    case 'list': {
      const title = labels.views[screen.view];
      switch (screen.view) {
        case 'all': return { title, body: buildBoardViewModel(snapshot, filterOf(entry, { kind: 'all' }), entry.paging, labels) };
        case 'standalone': return { title, body: buildBoardViewModel(snapshot, filterOf(entry, { kind: 'standalone' }), entry.paging, labels) };
        case 'epics': return { title, body: buildEpicRollup(snapshot, entry, labels) };
        case 'issues': return { title, body: buildIssueView(snapshot, filterOf(entry, { kind: 'all' }), labels) };
      }
      break;
    }
    case 'epic': {
      const epic = byId.get(screen.epicItemId);
      if (epic === undefined) return null;
      const body = buildBoardViewModel(snapshot, filterOf(entry, { kind: 'epic', epicItemId: epic.id }), entry.paging, labels);
      // The header shows the epic's own row: the same numbers as on Epics.
      return { title: titleOf(epic), body: { ...body, epic: epicRowOf(snapshot, epic, labels) } };
    }
    case 'item': {
      const item = byId.get(screen.itemId);
      const details = detailsOf(screen.itemId);
      if (item === undefined || details === null) return null;
      if (item.kind === 'issue') {
        const entryView = buildIssueView(snapshot, { scope: { kind: 'all' }, search: '', needsAttentionOnly: false }, labels).issues.find(e => e.card.itemId === item.id);
        if (entryView === undefined) return null;
        return { title: titleOf(item), body: { kind: 'issue', details, entry: entryView } };
      }
      const epic = item.standalone ? null : epicOf(item, byId);
      return { title: titleOf(item), body: { kind: 'story', tab: screen.tab, details, epic: epic === null ? null : epicRowOf(snapshot, epic, labels) } };
    }
  }
}

/** The screen message for the trail's current entry, or null when it cannot be built from this snapshot. */
export function screenModel(
  state: BoardState, snapshot: DeliverySnapshot, labels: DisplayLabels, detailsOf: (itemId: string) => ItemDetailsViewModel | null,
): ScreenModel | null {
  const trail = state.selection.trail;
  const entry = currentEntry(state.selection);
  const byId = indexItems(snapshot);
  const built = screenBody(entry, snapshot, byId, labels, detailsOf);
  if (built === null) return null;
  const screen = entry.screen;
  const filters: ScreenModel['filters'] = screen.kind === 'item' ? null : {
    views: screen.kind === 'list' && trail.length === 1,
    view: screen.kind === 'list' ? screen.view : null,
    search: entry.search,
    searchPlaceholder: SEARCH_PLACEHOLDER[screen.kind === 'list' ? screen.view : 'epic'],
    needsAttentionOnly: entry.needsAttentionOnly,
  };
  return {
    entryId: entry.id,
    restored: state.restored,
    focusItemId: entry.openedId,
    title: built.title,
    crumbs: crumbsOf(trail, byId, labels),
    back: backOf(trail, byId, labels),
    filters,
    body: built.body,
  };
}

/**
 * The status message first (its freshness phrased against `now`), then, when a snapshot is shown and the workspace is
 * not empty, one screen message for where the reader is. Only that one screen is built. `detailsOf` is the details
 * memory's model for a story or issue screen.
 */
export function boardDownMessages(
  state: BoardState, labels: DisplayLabels, now: string, detailsOf: (itemId: string) => ItemDetailsViewModel | null,
): readonly Envelope<BoardDownMessage>[] {
  const out: Envelope<BoardDownMessage>[] = [{ v: 1, payload: { type: 'status', status: statusView(state.status, now) } }];
  const shown = shownSnapshot(state.status);
  if (shown === null || state.status.state === 'empty') return out;
  const model = screenModel(state, shown.snapshot, labels, detailsOf);
  if (model !== null) out.push({ v: 1, payload: { type: 'screen', model } });
  return out;
}
