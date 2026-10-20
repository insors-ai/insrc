import type { Feedback } from '../types.js';

// Negative control: a wrong kind and a malformed anchor must be rejected.
export const bad: Feedback = {
	id: 'f', text: 't', actor: { id: 'x', kind: 'robot', properties: {} }, timestamp: 'x',
	feedback: [], kind: 'shout', anchor: { lines: [1] },
};
