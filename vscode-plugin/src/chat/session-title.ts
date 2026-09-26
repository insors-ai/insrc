/**
 * Story E20260926f9563bf5:S001 / t6 — the header session-name clamp (ac4).
 *
 * A pure, vscode-free view transform: a session name longer than 32 characters is
 * shown truncated to 32 characters plus a trailing ellipsis; a name of 32 or fewer
 * characters is shown in full. This is VIEW-only — the stored/persisted session
 * title is never changed (k4). Single-sourced across the host and the inline webview
 * (mirrors markers.ts): {@link clampSessionTitle} is the host copy and
 * {@link clampSessionTitleWebviewSource} the equivalent embedded in the one nonce'd
 * bootstrap; a parity test pins the two together.
 */

/** The header shows at most this many characters of the session name before the ellipsis (ac4). */
export const SESSION_TITLE_MAXLEN = 32;

/** Clamp a session name for the header: >32 chars -> 32 chars + '…'; otherwise unchanged. */
export function clampSessionTitle(name: string): string {
  return name.length > SESSION_TITLE_MAXLEN ? `${name.slice(0, SESSION_TITLE_MAXLEN)}…` : name;
}

/**
 * The webview-embeddable mirror of {@link clampSessionTitle}: a JS function-source
 * string `(s) => string` the header wiring embeds inline (CSP-safe: no import, no
 * remote origin, no vscode ref). The max length is interpolated from
 * {@link SESSION_TITLE_MAXLEN} so both paths share one source.
 */
export function clampSessionTitleWebviewSource(): string {
  return `function(s){s=s||'';return s.length>${SESSION_TITLE_MAXLEN}?s.slice(0,${SESSION_TITLE_MAXLEN})+'\\u2026':s;}`;
}
