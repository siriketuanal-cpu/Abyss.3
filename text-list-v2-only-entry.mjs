import { initializeV2Store, loadExistingV2Store } from './lunaby-v2-store.mjs?rev=lunaby-v2-r15';
import { renderV2OnlyGate } from './text-list-v2-only-gate.mjs?rev=lunaby-v2-r15';

const existing = loadExistingV2Store(localStorage);
const start = loaded => import('./text-list.js?rev=lunaby-v2-r15').then(module => module.startLunaby(loaded)).catch(renderV2OnlyGate);
if (existing) {
  start(existing);
} else {
  renderV2OnlyGate(() => {
    const initial = initializeV2Store(localStorage);
    if (initial) start(initial);
  });
}
