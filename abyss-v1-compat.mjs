import { SLOT_COUNT, normalizeSlot } from './abyss-runtime-core.mjs?rev=lunaby-lazy-v2b';
import { createSLState } from './starleap-state.mjs?rev=lunaby-lazy-v2b';

export const STORAGE_KEY = 'dotabyss:unified:v1';

function copyStoredSlot(target, slot) {
  let changed = false;
  const set = (key, value) => { if (target[key] !== value) { target[key] = value; changed = true; } };
  set('label', slot.label); set('rank', slot.rank);
  set('stamCurrent', slot.stamCurrent); set('stamMax', slot.stamMax); set('stamStart', slot.stamStart); set('stamRunning', slot.stamRunning);
  set('idleStart', slot.idleStart); set('idleCapMs', slot.idleCapMs); set('idleRunning', slot.idleRunning);
  set('missionDone', slot.missionDone); set('weeklyDone', slot.weeklyDone);
  return changed;
}
const toStoredSlot = slot => { const target = {}; copyStoredSlot(target, slot); return target; };
const snapshotSL = sl => ({ stamina:{ current:sl.stamina.current, start:sl.stamina.start, running:sl.stamina.running }, orb:{ current:sl.orb.current, start:sl.orb.start, running:sl.orb.running } });

export function loadStore(storage) {
  let envelope = {};
  try { envelope = JSON.parse(storage.getItem(STORAGE_KEY) || '{}'); } catch (_) {}
  if (!envelope || typeof envelope !== 'object') envelope = {};
  const source = Array.isArray(envelope.slots) ? envelope.slots : [];
  const sl = createSLState(envelope.sl);
  const slots = new Array(SLOT_COUNT);
  const storedSlots = new Array(SLOT_COUNT);
  for (let index = 0; index < SLOT_COUNT; index += 1) { const slot = normalizeSlot(source[index]); slots[index] = slot; storedSlots[index] = toStoredSlot(slot); }
  return { envelope, slots, storedSlots, sl };
}

export function saveStore(storage, envelope, slots, storedSlots, changedIndex, sl) {
  const output = Array.isArray(storedSlots) && storedSlots.length === slots.length ? storedSlots : slots.map(toStoredSlot);
  let changed = false;
  const indexes = Number.isInteger(changedIndex) && changedIndex >= 0 && changedIndex < slots.length ? [changedIndex] : slots.map((_, index) => index);
  for (const index of indexes) { const slot = slots[index]; if (slot && slot.dirty) { changed = copyStoredSlot(output[index], slot) || changed; slot.dirty = false; } }
  if (sl) {
    const before = envelope.sl && typeof envelope.sl === 'object' ? envelope.sl : {};
    const sameSL = ['stamina','orb'].every(key => { const previous = before[key] || {}; const current = sl[key]; return previous.current === current.current && previous.start === current.start && previous.running === current.running; });
    if (!sameSL) { envelope.sl = snapshotSL(sl); changed = true; }
  }
  if (!changed) return false;
  if (!envelope.sl) envelope.sl = sl ? snapshotSL(sl) : createSLState();
  envelope.slots = output;
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return true;
}
