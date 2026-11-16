import type { Services } from '../services/index.js';
export const config: Services['config'] = { show: async () => ({}), write: async () => ({ ok: true }), reload: async () => ({ ok: true }) };
