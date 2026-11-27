/** Browser library entry. S006 adds the document bridge/UI; no note opens here. */
import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';
import './scratch-editor.css';

/** Do not expose library AI, even if another caller passes feature overrides.
 * Construction alone never creates an editor or starts a network operation. */
export function createScratchCrepe(config: CrepeConfig): Crepe {
  return new Crepe({ ...config, features: { ...config.features, [CrepeFeature.AI]: false } });
}
