/** The sole behavior of the retained automated-review endpoints. */
export function reviewUnavailable(family: 'design' | 'code' = 'design', ..._args: readonly unknown[]): never {
 throw new Error(`${family === 'design' ? 'Design' : 'Code'} review functionality is being rewritten.`);
}
