/**
 * The safety conditions of the new git tools, written as input-schema patterns.
 *
 * executeTool checks a tool's input schema BEFORE it builds the approval request, while assertSafeArg runs inside
 * execute, after the approval. So every safety condition has to be in the schema, or an unsafe value would reach a
 * destructive approval prompt. assertSafeArg stays as defence in depth.
 */

/**
 * A ref, remote or branch name that isSafeRefName (src/workflow/team/sighting-store.ts) accepts, as one pattern. Any
 * script, '+', '#' and other valid punctuation are accepted. Refused: an empty name, a leading '-' or '/', whitespace and
 * control characters (NUL included), the characters ~ ^ : ? * [ and backslash, '..', '@{', '//', the name '@', and a
 * trailing '/', '.' or '.lock'. The pattern runs with the Unicode flag (ajv's default).
 */
const SAFE_REF_BODY = '(?![-/])(?!@$)(?!.*(?:\\.\\.|@\\{|//))(?!.*(?:[/.]|\\.lock)$)[^\\s\\u0000-\\u001f\\u007f~^:?*\\[\\\\]+$';
export const SAFE_REF = `^${SAFE_REF_BODY}`;
/** SAFE_REF that also starts with 'refs/'. */
export const SAFE_REFS_REF = `^(?=refs/)${SAFE_REF_BODY}`;

/** A path after '--': only a NUL is refused (a path may start with '-', since the argv puts '--' before the paths). */
export const SAFE_PATH = '^[^\\u0000]+$';

/** A dotted git config key such as user.email or branch.main.remote. */
export const CONFIG_KEY = '^[A-Za-z][A-Za-z0-9-]*(\\.[A-Za-z0-9_-]+)+$';
