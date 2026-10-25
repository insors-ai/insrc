/**
 * Deterministic readers of gh's plain output. No model call.
 */

/** Tab-separated lines as rows of columns: blank lines are dropped, columns are not named. */
export function parseTabRows(text: string): string[][] {
  return text.split('\n').filter(line => line.trim().length > 0).map(line => line.replace(/\r$/, '').split('\t'));
}

/** `gh config list` lines (`key=value`) as entries; a line without `=` is skipped, a value may hold `=`. */
export function parseConfigList(text: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq <= 0) { continue; }
    out.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1) });
  }
  return out;
}
