import { InstallerError } from './contracts.js';
import type { Target } from './contracts.js';
import { canonicalJson, digest, parseReleaseDescriptor } from './release-descriptor.js';
import type { DownloadTransport } from './download.js';
import { openPreparedBundle, prepareBundle, resolveBundleDelivery } from './bundle.js';
import type { DeliveryPort } from './peer-contracts.js';
import { bindCandidateIntegritySignal, invalidateCandidateIntegrity, verifyCandidateIntegrity } from './candidate-integrity.js';
/** Transport is internal only; runtime identity is always resolved explicitly. */
export function bundleDelivery(target: Target, options: { transport?: DownloadTransport | undefined } = {}): DeliveryPort {
  const { transport } = options;
  return {
    async resolve(delivery) {
      const descriptor = parseReleaseDescriptor(await resolveBundleDelivery(delivery, target, { transport }), { target });
      const descriptorSha256 = digest(canonicalJson(descriptor));
      return { kind: 'bundle', manifest: descriptor.manifest, descriptorSha256, descriptor };
    },
    async prepare(store, offer, context) {
      try {
      bindCandidateIntegritySignal(context.integrity, store.location, context.signal);
      if (offer.kind !== 'bundle') throw new InstallerError('delivery-invalid', 'Bundle preparation requires a bundle offer');
      if (!offer.descriptor) throw new InstallerError('offer-stale', 'Exact accepted descriptor is unavailable; legacy offers cannot resolve a replacement');
      const descriptor = parseReleaseDescriptor(offer.descriptor, { target });
      if (digest(canonicalJson(descriptor)) !== offer.descriptorSha256 || canonicalJson(descriptor.manifest) !== canonicalJson(offer.manifest)) {
        throw new InstallerError('offer-stale', 'Accepted bundle descriptor differs from its durable identity');
      }
      return await prepareBundle(store, descriptor, { target, signal: context.signal, transport, integrity: context.integrity });
      } catch (cause) { invalidateCandidateIntegrity(context.integrity); throw cause; }
    },
    open: (location, releaseId) => openPreparedBundle(location, releaseId, target),
    async verify(candidate, location, integrity) {
      try {
      bindCandidateIntegritySignal(integrity, location);
      const verified = await openPreparedBundle(location, candidate.releaseId, target);
      if (verified.descriptorSha256 !== candidate.descriptorSha256 || verified.payloadSha256 !== candidate.payloadSha256 || verified.inventorySha256 !== candidate.inventorySha256 || canonicalJson(verified.manifest) !== canonicalJson(candidate.manifest)) throw new InstallerError('candidate-conflict', 'Prepared release differs from immutable storage');
      await verifyCandidateIntegrity(candidate, location, integrity);
      } catch (cause) { invalidateCandidateIntegrity(integrity); throw cause; }
    },
  };
}
