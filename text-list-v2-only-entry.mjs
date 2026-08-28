import { initializeV2Store } from './lunaby-v2-store.mjs?rev=lunaby-v2-r13';
import { renderV2OnlyGate } from './text-list-v2-only-gate.mjs?rev=lunaby-v2-r13';

const initial = initializeV2Store(localStorage);
import('./text-list.js?rev=lunaby-v2-r13').then(module => module.startLunaby(initial)).catch(renderV2OnlyGate);
