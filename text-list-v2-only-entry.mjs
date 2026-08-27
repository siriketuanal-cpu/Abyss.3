import { loadExistingV2Store } from './lunaby-v2-store.mjs?rev=lunaby-v2-r5';
import { renderV2OnlyGate } from './text-list-v2-only-gate.mjs?rev=lunaby-v2-r5';

const existing = loadExistingV2Store(localStorage);
if (existing) {
  import('./text-list.js?rev=lunaby-v2-r5').then(module => module.startLunaby(existing)).catch(renderV2OnlyGate);
} else {
  renderV2OnlyGate();
}
