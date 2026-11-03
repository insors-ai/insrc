/** Shared structural checks; each trust boundary supplies its own failure policy. */
export function record(reject: () => never, value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
}
export function fields(reject: () => never, value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) reject();
}
export function shape(reject: () => never, value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  record(reject, value);
  fields(reject, value, required, optional);
}
