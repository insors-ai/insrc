import { InstallerError } from './contracts.js';
import type { Target } from './contracts.js';
import { canonicalJson, digest, parseReleaseDescriptor } from './release-descriptor.js';
import type { ReleaseDescriptor } from './release-descriptor.js';
import { openPreparedBundle, prepareBundle, resolveBundleDelivery } from './bundle.js';
import type { DeliveryPort } from './peer-contracts.js';
export function bundleDelivery(target: Target): DeliveryPort {
  const offers = new Map<string, ReleaseDescriptor>();
  return {
    async resolve(delivery) {
      const descriptor = parseReleaseDescriptor(await resolveBundleDelivery(delivery, target), { target });
      const descriptorSha256 = digest(canonicalJson(descriptor));
      if (offers.size >= 8) offers.delete(offers.keys().next().value!); offers.set(descriptorSha256, descriptor);
      return { kind: 'bundle', manifest: descriptor.manifest, descriptorSha256 };
    },
    async prepare(store, offer, context) {
      if (offer.kind !== 'bundle') throw new InstallerError('delivery-invalid', 'Bundle preparation requires a bundle offer');
      const descriptor = offers.get(offer.descriptorSha256);
      if (!descriptor || canonicalJson(descriptor.manifest) !== canonicalJson(offer.manifest)) throw new InstallerError('offer-stale', 'Exact accepted descriptor is unavailable');
      return prepareBundle(store, descriptor, { target, signal: context.signal });
    },
    open: (location, releaseId) => openPreparedBundle(location, releaseId, target),
    async verify(candidate, location) {
      const verified = await openPreparedBundle(location, candidate.releaseId, target);
      if (verified.descriptorSha256 !== candidate.descriptorSha256 || verified.payloadSha256 !== candidate.payloadSha256 || verified.inventorySha256 !== candidate.inventorySha256 || canonicalJson(verified.manifest) !== canonicalJson(candidate.manifest)) throw new InstallerError('candidate-conflict', 'Prepared release differs from immutable storage');
    },
  };
}
