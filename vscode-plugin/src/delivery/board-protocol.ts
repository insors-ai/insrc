/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's webview message protocol (E2 s1, sc3): the only traffic
 * between the board's host and its webview, in the plugin's versioned
 * envelope. View models go down; the reader's intents come up as ids only, which
 * the host resolves against its current snapshot, so a crafted message cannot
 * name a path. parseBoardUpMessage is the gate every inbound message passes.
 *
 * Screens (ISSUE-348d4663): two down-messages carry what the board shows, the
 * status and one screen, which replaces the whole screen; the up-messages name
 * where the reader goes (one of the four views, an epic, an item, a tab, Back,
 * a crumb) and what they filter. The 'show-more' up-message
 * (AMD-6a1315585c38c41c-2) asks for the next page of one stage. The card and
 * rollup row views are s2's and s3's; the item details model (sc6) and its task
 * and evidence rows are s4's.
 */

import type { Envelope } from '../chat/protocol.js';
import type { DeliveryStage } from './delivery-contract.js';
import { isObject } from './guards.js';
import { STAGE_ORDER } from './labels.js';

export type { Envelope };

/** A titled state panel (s5 mock F): an empty store, an unavailable daemon, a failed refresh, or partial evidence. */
export interface StatePanelView {
  /** The status panels, and the views' 'no-matches' and 'no-issues' panels. */
  readonly kind: 'empty' | 'unavailable' | 'refresh-failed' | 'partial' | 'no-matches' | 'no-issues';
  readonly title: string;
  readonly text: string;
  /** 'retry' posts refresh; 'clear-filters' clears the search and attention filter. */
  readonly action: 'retry' | 'clear-filters' | null;
  /** True when the last good board is still shown behind the panel. */
  readonly stale: boolean;
  /** What could not be read: each store notice with its records, and the unreadable-record count. */
  readonly affected: readonly { readonly artifactIds: readonly string[]; readonly text: string }[];
  /** 'body' replaces the screen's content (or its list area); 'banner' sits above a screen that stays usable. */
  readonly placement: 'body' | 'banner';
}

export interface StatusView {
  readonly state: 'loading' | 'ready' | 'empty' | 'unavailable' | 'failed';
  readonly takenAt: string | null;
  readonly message: string | null;
  readonly partialNotice: string | null;
  readonly stale: boolean;
  /** 'Updated just now', 'Updated N minutes ago' or 'Updated <date and time>'; null when no snapshot is shown. */
  readonly freshnessLabel: string | null;
  readonly panel: StatePanelView | null;
}

/** One text-labelled signal on a card (sc5); colour comes from tone but the label always carries the meaning. */
export interface BadgeView {
  /** 'stage' and 'tasks' appear only among the details chips. */
  readonly kind: 'approval' | 'review' | 'validation' | 'conflict' | 'attention' | 'notice' | 'stage' | 'tasks';
  /** Text from sc4; always present. */
  readonly label: string;
  readonly tone: 'neutral' | 'warning' | 'danger' | 'success';
}

export interface CardView {
  readonly itemId: string;
  readonly kind: 'story' | 'issue';
  readonly title: string;
  readonly standalone: boolean;
  readonly epicTitle: string | null;
  /** The item id in short form ('ABCDEF01 / S001'), or the full id when it has no canonical or H-form hash. */
  readonly compactId: string;
  /** Recorded task results ('n/N tasks passed'); null when the item records none. */
  readonly taskSummary: { readonly passed: number; readonly total: number; readonly label: string } | null;
  readonly badges: readonly BadgeView[];
  readonly needsAttention: boolean;
  /** One line naming the id, the task summary and every badge, for screen readers. */
  readonly accessibleLabel: string;
}

/** One epic's row on Epics, and its board's summary (s3): counts only, no cards, over the epic's whole scope. */
export interface EpicRollupRowView {
  readonly epicItemId: string;
  readonly compactId: string;
  readonly title: string;
  readonly storiesTotal: number;
  readonly storiesComplete: number;
  /** e.g. '2 of 5 stories complete'; names its denominator. */
  readonly completionLabel: string;
  /** Planned tasks of the row's matching stories. */
  readonly taskCount: number;
  readonly issueCount: number;
  /** Matching cards counted in this row. */
  readonly total: number;
  readonly attentionCount: number;
  /** 'No open gates', '1 needs attention' or 'N need attention'. */
  readonly attentionLabel: string;
  readonly attentionTone: 'warning' | 'success';
}

/** A followable reference to another work item; ids only, resolved by the host. */
export interface LinkView {
  readonly itemId: string;
  readonly kind: 'epic' | 'story' | 'task' | 'issue';
  readonly title: string;
  /** null for an epic or an item with no stage. */
  readonly stageLabel: string | null;
}

export interface IssueEntryView {
  readonly card: CardView;
  readonly stageLabel: string;
  /** The story or epic the issue corrects; null when it names none or cannot be resolved. */
  readonly parent: LinkView | null;
  /** The issue's unresolved-parent notice message, or a fixed text when its resolved parent is not on the board. */
  readonly parentNotice: string | null;
  /** Each fix story among the issue's children, in childIds order. */
  readonly fixStories: readonly LinkView[];
}

/** One task of the selected story (s4): its result, and its dependencies and checks from the story's PLAN. */
export interface TaskRowView {
  readonly taskItemId: string;
  readonly title: string | null;
  /** Result label from sc4, or the unplanned label. */
  readonly resultLabel: string;
  readonly planned: boolean;
  /** From the story's PLAN, read through workflow.deliveryEvidence; null when no PLAN or it could not be read. */
  readonly dependsOn: readonly string[] | null;
  readonly acceptanceChecks: readonly string[] | null;
  /** Passed success, Failed danger, Unrecorded and Unplanned neutral. */
  readonly resultTone: BadgeView['tone'];
}

/**
 * One row of the selected item's artifact chain (s4): a recorded DEF, HLD, ISSUE, LLD, PLAN or BUILD, or a kind the
 * item's route expects that has no record. Records of any other kind are not chain rows; they stay in the evidence.
 */
export interface ChainRowView {
  readonly kind: 'DEF' | 'HLD' | 'ISSUE' | 'LLD' | 'PLAN' | 'BUILD';
  readonly status: 'recorded' | 'not-recorded';
  readonly artifactId: string | null;
  /** The approval label for a recorded row; the not-recorded label otherwise. */
  readonly label: string;
  readonly tone: BadgeView['tone'];
  /** The review label, when the record carries a review. */
  readonly note: string | null;
}

/** One evidence record of the selected item (s4), and where opening it goes. */
export interface EvidenceRowView {
  readonly artifactId: string;
  readonly kindLabel: string;
  readonly approvalLabel: string;
  readonly reviewLabel: string | null;
  readonly overrideLabel: string | null;
  readonly opensIn: 'review-pane' | 'read-only';
  /** When the record was approved, as 'YYYY-MM-DD HH:MM UTC'; null when it carries no approval time. */
  readonly approvedAt: string | null;
}

/** The details of the selected item (s4, sc6), built from the shown snapshot alone. */
export interface ItemDetailsViewModel {
  readonly itemId: string;
  /** '<KIND> · <compact id>', e.g. 'STORY · ABCDEF01 / S001'. */
  readonly kicker: string;
  readonly title: string;
  readonly stageLabel: string | null;
  readonly stageReason: { readonly text: string; readonly artifactIds: readonly string[] } | null;
  /** The stage, the task summary and the item's card badges, in that order. */
  readonly chips: readonly BadgeView[];
  /** DEF, HLD, ISSUE, LLD, PLAN, BUILD in that order, as the item's route expects or records them. */
  readonly chain: readonly ChainRowView[];
  readonly tasks: readonly TaskRowView[];
  readonly taskCounts: { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number } | null;
  /** Set exactly when the daemon reports a validation conflict. */
  readonly conflict: { readonly headline: string; readonly text: string } | null;
  readonly evidence: readonly EvidenceRowView[];
  readonly notices: readonly string[];
  /** Recorded links: the parent, each child (a story's tasks, an issue's fix stories) and what the item corrects. */
  readonly linked: readonly { readonly itemId: string; readonly kind: LinkView['kind']; readonly title: string; readonly relation: 'parent' | 'child' | 'corrects' }[];
  /** The issues whose recorded parent is this item, in snapshot order. */
  readonly correctedBy: readonly LinkView[];
  readonly sourceIds: readonly string[];
  /** Set when the PLAN read failed; the rest of the details still render. */
  readonly planNotice: string | null;
  /** The read-only text of an evidence-read record the reader opened, rendered as preformatted text. */
  readonly openedRecord: { readonly artifactId: string; readonly text: string } | null;
}

/** The four views the reader chooses between; Needs attention narrows whichever is chosen. */
export type ListView = 'all' | 'epics' | 'standalone' | 'issues';

/** The story screen's tabs. */
export type ItemTab = 'overview' | 'evidence' | 'linked';

/** Where the reader is: one of the four views, one epic's board, or one story's or issue's own screen. */
export type BoardScreen =
  | { readonly kind: 'list'; readonly view: ListView }
  | { readonly kind: 'epic'; readonly epicItemId: string }
  | { readonly kind: 'item'; readonly itemId: string; readonly tab: ItemTab };

/** One stage of a board screen, shown as a collapsible section. */
export interface StageSectionView {
  readonly stage: DeliveryStage;
  readonly label: string;
  /** Matches in the stage, including cards behind show-more. */
  readonly total: number;
  readonly cards: readonly CardView[];
  readonly hiddenCount: number;
  readonly attentionCount: number;
  /** Whether the section starts open; the webview keeps the reader's own choice once made. */
  readonly defaultOpen: boolean;
  /** 'nothing at this stage' for an empty stage; null otherwise. */
  readonly emptyText: string | null;
  /** How many need attention, for a section that starts closed with matches; null otherwise. */
  readonly hint: string | null;
}

/** A board screen (All work, Standalone, or one epic's board): six stage sections. */
export interface StagesBody {
  readonly kind: 'stages';
  /** The epic's own row (the same numbers as on Epics) on an epic's board; null otherwise. */
  readonly epic: EpicRollupRowView | null;
  readonly totalsLabel: string;
  /** True when Needs attention is on, so the totals line offers Show all. */
  readonly showAll: boolean;
  readonly sections: readonly StageSectionView[];
  /** The empty stages folded into one line: always under Needs attention, and in a narrow pane. */
  readonly fold: { readonly always: boolean; readonly text: string };
  readonly emptyPanel: StatePanelView | null;
}

/** One stage of the Epics screen: the epics whose least-advanced story is at this stage, in a board screen's section. */
export interface EpicSectionView {
  readonly stage: DeliveryStage;
  readonly label: string;
  readonly total: number;
  /** How many of the section's epics have something needing attention. */
  readonly attentionCount: number;
  readonly defaultOpen: boolean;
  readonly emptyText: string | null;
  readonly hint: string | null;
  readonly rows: readonly EpicRollupRowView[];
}

/**
 * The Epics screen: one row per epic, each opening that epic's board, in six stage sections opened and folded as a
 * board screen's. An epic sits at the stage of its least-advanced story; an epic with no stories has no stage and is
 * listed after the sections.
 */
export interface EpicsBody {
  readonly kind: 'epics';
  readonly totalsLabel: string;
  readonly sections: readonly EpicSectionView[];
  readonly fold: { readonly always: boolean; readonly text: string };
  readonly noStories: readonly EpicRollupRowView[];
  readonly emptyPanel: StatePanelView | null;
}

/** One stage of the Issues screen: the same collapsible section, with the same defaults, as a board screen's. */
export interface IssueSectionView {
  readonly stage: DeliveryStage;
  readonly label: string;
  readonly total: number;
  readonly attentionCount: number;
  readonly defaultOpen: boolean;
  readonly emptyText: string | null;
  readonly hint: string | null;
  readonly issues: readonly IssueEntryView[];
}

/** The Issues screen: six stage sections of issues, folded and opened as a board screen's. */
export interface IssuesBody {
  readonly kind: 'issues';
  readonly totalsLabel: string;
  /** True when Needs attention is on, so the totals line offers Show all. */
  readonly showAll: boolean;
  readonly sections: readonly IssueSectionView[];
  readonly fold: { readonly always: boolean; readonly text: string };
  readonly emptyPanel: StatePanelView | null;
}

/** A story's own screen, on one of its tabs. */
export interface StoryBody {
  readonly kind: 'story';
  readonly tab: ItemTab;
  readonly details: ItemDetailsViewModel;
  /** The story's epic with its completion, for Linked work; null for a story in no epic. */
  readonly epic: EpicRollupRowView | null;
}

/** An issue's own screen. */
export interface IssueBody {
  readonly kind: 'issue';
  readonly details: ItemDetailsViewModel;
  readonly entry: IssueEntryView;
}

export type ScreenBody = StagesBody | EpicsBody | IssuesBody | StoryBody | IssueBody;

/** One breadcrumb step; index is the trail entry it returns to. */
export interface CrumbView {
  readonly label: string;
  readonly index: number;
}

/** Everything one screen shows. Each screen message replaces the whole screen. */
export interface ScreenModel {
  /** The trail entry's id; the webview keys its scroll and section memory on it. */
  readonly entryId: number;
  /** True when the reader came back to this screen (Back or a crumb): scroll and focus are restored. */
  readonly restored: boolean;
  /** The card or row the reader opened from this screen, to focus on return. */
  readonly focusItemId: string | null;
  readonly title: string;
  readonly crumbs: readonly CrumbView[];
  readonly back: { readonly label: string } | null;
  /** null on a story or issue screen; views is true only on one of the four views. */
  readonly filters: {
    readonly views: boolean;
    readonly view: ListView | null;
    readonly search: string;
    readonly searchPlaceholder: string;
    readonly needsAttentionOnly: boolean;
  } | null;
  readonly body: ScreenBody;
}

/** Host -> webview. Each message replaces what it names; nothing is merged. */
export type BoardDownMessage =
  | { readonly type: 'status'; readonly status: StatusView }
  | { readonly type: 'screen'; readonly model: ScreenModel }
  | { readonly type: 'announce'; readonly text: string };

/** What a board screen matches: everything, standalone work, or one epic's work. Internal to the host's matching. */
export type BoardScope = { readonly kind: 'all' } | { readonly kind: 'epic'; readonly epicItemId: string } | { readonly kind: 'standalone' };
export type Density = 'compact' | 'comfortable';

/** Webview -> host. Ids only; the host resolves them against the current snapshot. */
export type BoardUpMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'set-view'; readonly view: ListView }
  | { readonly type: 'open-epic'; readonly epicItemId: string }
  | { readonly type: 'open-item'; readonly itemId: string }
  | { readonly type: 'set-item-tab'; readonly tab: ItemTab }
  | { readonly type: 'back' }
  | { readonly type: 'go-to-crumb'; readonly index: number }
  | { readonly type: 'set-search'; readonly search: string }
  | { readonly type: 'set-attention'; readonly on: boolean }
  | { readonly type: 'open-evidence'; readonly itemId: string; readonly artifactId: string }
  | { readonly type: 'set-density'; readonly density: Density }
  | { readonly type: 'show-more'; readonly stage: DeliveryStage }
  | { readonly type: 'clear-filters' };

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const LIST_VIEWS: readonly ListView[] = ['all', 'epics', 'standalone', 'issues'];
const ITEM_TABS: readonly ItemTab[] = ['overview', 'evidence', 'linked'];

/** The typed intent when raw is a v1 envelope carrying a known, well-typed up-message; null otherwise. */
export function parseBoardUpMessage(raw: unknown): BoardUpMessage | null {
  if (!isObject(raw) || raw['v'] !== 1 || !isObject(raw['payload'])) return null;
  const p = raw['payload'];
  switch (p['type']) {
    case 'ready': return { type: 'ready' };
    case 'refresh': return { type: 'refresh' };
    case 'set-view': {
      const view = LIST_VIEWS.find(v => v === p['view']);
      return view === undefined ? null : { type: 'set-view', view };
    }
    case 'open-epic':
      return isNonEmptyString(p['epicItemId']) ? { type: 'open-epic', epicItemId: p['epicItemId'] } : null;
    case 'open-item':
      return isNonEmptyString(p['itemId']) ? { type: 'open-item', itemId: p['itemId'] } : null;
    case 'set-item-tab': {
      const tab = ITEM_TABS.find(t => t === p['tab']);
      return tab === undefined ? null : { type: 'set-item-tab', tab };
    }
    // Carries nothing but its type, like clear-filters.
    case 'back':
      return Object.keys(p).length === 1 ? { type: 'back' } : null;
    case 'go-to-crumb': {
      const index = p['index'];
      return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? { type: 'go-to-crumb', index } : null;
    }
    case 'set-search':
      return typeof p['search'] === 'string' ? { type: 'set-search', search: p['search'] } : null;
    case 'set-attention':
      return typeof p['on'] === 'boolean' ? { type: 'set-attention', on: p['on'] } : null;
    case 'open-evidence':
      return isNonEmptyString(p['itemId']) && isNonEmptyString(p['artifactId'])
        ? { type: 'open-evidence', itemId: p['itemId'], artifactId: p['artifactId'] }
        : null;
    case 'set-density':
      return p['density'] === 'compact' || p['density'] === 'comfortable' ? { type: 'set-density', density: p['density'] } : null;
    case 'show-more': {
      const stage = STAGE_ORDER.find(st => st === p['stage']);
      return stage === undefined ? null : { type: 'show-more', stage };
    }
    // Carries nothing but its type; anything more is not a clear-filters message.
    case 'clear-filters':
      return Object.keys(p).length === 1 ? { type: 'clear-filters' } : null;
    default:
      return null;
  }
}
