// ---------------------------------------------------------------------------
// Planner Module — Utilities
//
// Pure helper functions: ID generation, cycle detection.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { Step } from './types.js';

/** Generate a unique ID for a plan or step. */
export function generateId(): string {
  return randomUUID();
}

/**
 * Detect cycles in a step dependency graph using iterative DFS.
 *
 * @returns The cycle path (step IDs) if a cycle is found, or null.
 */
export function detectCycle<T>(steps: Step<T>[]): string[] | null {
  const idSet = new Set(steps.map(s => s.id));
  const visited  = new Set<string>();
  const inStack  = new Set<string>();
  const parentOf = new Map<string, string | null>();

  for (const step of steps) {
    if (visited.has(step.id)) continue;

    // Iterative DFS
    const stack: Array<{ id: string; depIdx: number }> = [{ id: step.id, depIdx: 0 }];
    inStack.add(step.id);
    parentOf.set(step.id, null);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const current = steps.find(s => s.id === frame.id);
      if (!current) { stack.pop(); inStack.delete(frame.id); continue; }

      const deps = current.dependencies.filter(d => idSet.has(d));

      if (frame.depIdx >= deps.length) {
        // All deps explored — backtrack
        visited.add(frame.id);
        inStack.delete(frame.id);
        stack.pop();
        continue;
      }

      const depId = deps[frame.depIdx]!;
      frame.depIdx++;

      if (inStack.has(depId)) {
        // Cycle found — reconstruct path
        const cycle: string[] = [depId];
        for (let i = stack.length - 1; i >= 0; i--) {
          cycle.push(stack[i]!.id);
          if (stack[i]!.id === depId) break;
        }
        return cycle.reverse();
      }

      if (!visited.has(depId)) {
        inStack.add(depId);
        parentOf.set(depId, frame.id);
        stack.push({ id: depId, depIdx: 0 });
      }
    }
  }

  return null;
}
