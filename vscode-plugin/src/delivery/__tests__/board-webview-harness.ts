/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The board webview's test harness: a fake DOM that records text, attributes, children, listeners and focus (and throws
 * on innerHTML), and a runner that boots the real BOARD_WEBVIEW_SCRIPT against it. Shared by the host tests and the
 * performance test (E2 s5).
 */

import { BOARD_WEBVIEW_SCRIPT } from '../board-host.js';

/** A fake DOM element: records text, attributes, children, listeners and form values; innerHTML throws. */
export interface FakeEl {
  tag: string;
  textContent: string;
  value?: string;
  checked?: boolean;
  children: FakeEl[];
  attrs: Record<string, string>;
  listeners: Record<string, (e?: FakeEvent) => void>;
  readonly firstChild: FakeEl | null;
  removeChild(c: FakeEl): void;
  appendChild(c: FakeEl): void;
  removeAttribute(k: string): void;
  setAttribute(k: string, v: string): void;
  addEventListener(k: string, f: (e?: FakeEvent) => void): void;
  getAttribute(k: string): string | null;
  focus(): void;
  /** Only the 'tag.class' form the board script uses. */
  querySelectorAll(selector: string): FakeEl[];
}

/** A key event as the script reads it; prevented records preventDefault. */
export interface FakeEvent { readonly key: string; prevented: boolean; preventDefault(): void }
export const keyEvent = (key: string): FakeEvent => {
  const e: FakeEvent = { key, prevented: false, preventDefault() { e.prevented = true; } };
  return e;
};

/** The element the fake DOM last focused; reset by every runScript. */
export const focusState: { active: FakeEl | null } = { active: null };

export function makeEl(tag: string): FakeEl {
  const e: FakeEl = {
    tag, textContent: '', children: [], attrs: {}, listeners: {},
    get firstChild() { return e.children[0] ?? null; },
    removeChild(c) { e.children = e.children.filter(x => x !== c); },
    appendChild(c) { e.children.push(c); },
    setAttribute(k, v) { e.attrs[k] = v; },
    removeAttribute(k) { delete e.attrs[k]; },
    addEventListener(k, f) { e.listeners[k] = f; },
    getAttribute(k) { return Object.hasOwn(e.attrs, k) ? e.attrs[k]! : null; },
    focus() { focusState.active = e; },
    querySelectorAll(selector) {
      const [t, cls] = selector.split('.');
      return findAll(e, x => x !== e && x.tag === t && (cls === undefined || (x.attrs['class'] ?? '').split(' ').includes(cls)));
    },
  };
  Object.defineProperty(e, 'innerHTML', { set() { throw new Error('innerHTML used'); }, get() { throw new Error('innerHTML used'); } });
  return e;
}

/** Every text in an element's subtree, depth first. */
export const texts = (e: FakeEl): string[] => [e.textContent, ...e.children.flatMap(texts)].filter(t => t.length > 0);
export const findAll = (e: FakeEl, pred: (x: FakeEl) => boolean): FakeEl[] => [...(pred(e) ? [e] : []), ...e.children.flatMap(c => findAll(c, pred))];
/** The board's cards in document order: the li.card elements, the one rule every board test counts by. */
export const cardsIn = (root: FakeEl): FakeEl[] => findAll(root, e => e.tag === 'li' && e.attrs['class'] === 'card');

/** Run the webview script against the fake DOM; elements are created on first lookup by id. */
/** state is the webview state VS Code hands back on boot; stateThrows makes getState throw. */
export function runScript(opts: { state?: unknown; stateThrows?: boolean } = {}): {
  posted: unknown[]; deliver(msg: unknown): void; el: Record<string, FakeEl>; saved(): unknown;
} {
  const el: Record<string, FakeEl> = {};
  const posted: unknown[] = [];
  focusState.active = null;
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  const document = {
    getElementById: (id: string) => (el[id] ??= makeEl(id)), createElement: (tag: string) => makeEl(tag),
    body: (el['body'] = makeEl('body')),
    get activeElement() { return focusState.active; },
  };
  const window = { addEventListener: (_k: string, f: (e: { data: unknown }) => void) => { onMessage = f; } };
  let state: unknown = opts.state;
  const acquireVsCodeApi = () => ({
    postMessage: (m: unknown) => posted.push(m),
    getState: () => { if (opts.stateThrows === true) throw new Error('no state'); return state; },
    setState: (v: unknown) => { state = v; },
  });
  new Function('document', 'window', 'acquireVsCodeApi', BOARD_WEBVIEW_SCRIPT)(document, window, acquireVsCodeApi);
  el['refresh']!.listeners['click']!();
  return { posted, deliver: m => onMessage?.({ data: m }), el, saved: () => state };
}
