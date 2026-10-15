// The review pane's placement: an existing editor group that holds no chat tab, else today's placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReviewColumn, type EditorGroupView } from '../review-column.js';

const CHAT = 'insrc.chatPanel';
const chatTab = { input: { viewType: `mainThreadWebview-${CHAT}` } };
const fileTab = { input: { uri: 'file:///a.ts' } };
const otherWebview = { input: { viewType: 'mainThreadWebview-insrc.docsReviewPanel' } };
const group = (viewColumn: number, isActive: boolean, ...tabs: { input: unknown }[]): EditorGroupView => ({ viewColumn, isActive, tabs });

test('chooseReviewColumn picks a group without the chat tab, the active one first, else the lowest column, and none when only the chat\'s group is open', () => {
  // Another group is open next to the chat's: it is used, whether or not it is active.
  assert.equal(chooseReviewColumn([group(1, true, chatTab), group(2, false, fileTab)], CHAT), 2);
  // The active group is chosen when it is not the chat's, even if a lower column exists.
  assert.equal(chooseReviewColumn([group(1, false, fileTab), group(2, true, fileTab), group(3, false, fileTab)], CHAT), 2);
  // The chat's group is the active one: the lowest column among the others.
  assert.equal(chooseReviewColumn([group(1, true, chatTab), group(4, false, fileTab), group(3, false, fileTab)], CHAT), 3);
  // A group that holds the chat tab among other tabs is left out as a whole.
  assert.equal(chooseReviewColumn([group(1, true, fileTab, chatTab), group(2, false, fileTab)], CHAT), 2);
  assert.equal(chooseReviewColumn([group(1, true, fileTab, chatTab)], CHAT), undefined);
  // Only the chat's group, or no group at all: none, so the caller keeps today's placement.
  assert.equal(chooseReviewColumn([group(1, true, chatTab)], CHAT), undefined);
  assert.equal(chooseReviewColumn([], CHAT), undefined);
  // An empty group and a group of other webviews qualify.
  assert.equal(chooseReviewColumn([group(1, true, chatTab), group(2, false)], CHAT), 2);
  assert.equal(chooseReviewColumn([group(1, true, chatTab), group(2, false, otherWebview)], CHAT), 2);
});

test('chooseReviewColumn: a tab whose input is not an object or has no viewType does not mark its group as the chat\'s', () => {
  const odd = [{ input: undefined }, { input: null }, { input: 'text' }, { input: { viewType: 7 } }, { input: {} }];
  assert.equal(chooseReviewColumn([group(1, true, ...odd)], CHAT), 1, 'such a group is a normal group');
  assert.equal(chooseReviewColumn([group(1, true, chatTab), group(2, false, ...odd)], CHAT), 2);
});
