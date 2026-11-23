import { bundleDelivery } from './bundle-delivery.js';
import type { Target, InstallationLocation } from './contracts.js';
import type { ManagerPeers } from './peer-contracts.js';
/** Owning stories supply actual dependency/lifecycle/migration adapters here.
 * No fixture/no-op can accidentally certify a real installation. */
export function productionPeers(target: Target, _location: InstallationLocation): ManagerPeers { return { bundle: bundleDelivery(target) }; }
