import { SLOT_COUNT, loadStore as loadV1Store, normalizeSlot } from './abyss-lite-core.mjs';
import { createSLState } from './starleap-lite-core.mjs';

export const V2_STORAGE_KEY = 'lunaby:state:v2';
export const V2_VERSION = 2;

const STAM_RUNNING = 1;
const IDLE_RUNNING = 2;
const MISSION_DONE = 4;
const WEEKLY_DONE = 8;
const SL_STAM_RUNNING = 1;
const SL_ORB_RUNNING = 2;

const finite = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const timestamp = value => {
  const number = finite(value, 0);
  return number > 0 && number < 9_000_000_000_000_000 ? Math.floor(number) : null;
};
const flag = (value, bit) => (Number.isInteger(value) && (value & bit) !== 0);
const sameArray = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

function packSlot(slot) {
  const flags = (slot.stamRunning ? STAM_RUNNING : 0)
    | (slot.idleRunning ? IDLE_RUNNING : 0)
    | (slot.missionDone ? MISSION_DONE : 0)
    | (slot.weeklyDone ? WEEKLY_DONE : 0);
  return [slot.label, slot.rank, slot.stamCurrent, slot.stamStart || 0, slot.idleStart || 0, flags];
}

function unpackSlot(input) {
  if (!Array.isArray(input) || input.length !== 6 || typeof input[0] !== 'string' || !Number.isInteger(input[5])) return null;
  const flags = input[5];
  return normalizeSlot({
    label: input[0],
    rank: input[1],
    stamCurrent: input[2],
    stamStart: timestamp(input[3]),
    stamRunning: flag(flags, STAM_RUNNING),
    idleStart: timestamp(input[4]),
    idleRunning: flag(flags, IDLE_RUNNING),
    missionDone: flag(flags, MISSION_DONE),
    weeklyDone: flag(flags, WEEKLY_DONE)
  });
}

function packSL(sl) {
  const flags = (sl.stamina.running ? SL_STAM_RUNNING : 0) | (sl.orb.running ? SL_ORB_RUNNING : 0);
  return [sl.stamina.current, sl.stamina.start || 0, sl.orb.current, sl.orb.start || 0, flags];
}

function unpackSL(input) {
  if (!Array.isArray(input) || input.length !== 5 || !Number.isInteger(input[4])) return null;
  const flags = input[4];
  return createSLState({
    stamina: { current: input[0], start: timestamp(input[1]), running: flag(flags, SL_STAM_RUNNING) },
    orb: { current: input[2], start: timestamp(input[3]), running: flag(flags, SL_ORB_RUNNING) }
  });
}

function parseV2(storage) {
  let value = null;
  try { value = JSON.parse(storage.getItem(V2_STORAGE_KEY) || 'null'); } catch (_) { return null; }
  if (!value || value.v !== V2_VERSION || !Array.isArray(value.s) || value.s.length !== SLOT_COUNT) return null;
  const slots = value.s.map(unpackSlot);
  const sl = unpackSL(value.l);
  return slots.every(Boolean) && sl ? { envelope:value, slots, sl } : null;
}

function packState(slots, sl) {
  return { v:V2_VERSION, s:slots.map(packSlot), l:packSL(sl) };
}

function makeLoaded(envelope, slots, sl, source, migrated) {
  return {
    envelope,
    slots,
    sl,
    source,
    migrated
  };
}

export function loadV2Store(storage) {
  const v2 = parseV2(storage);
  if (v2) return makeLoaded(v2.envelope, v2.slots, v2.sl, 'v2', false);

  const v1 = loadV1Store(storage);
  const envelope = packState(v1.slots, v1.sl);
  try { storage.setItem(V2_STORAGE_KEY, JSON.stringify(envelope)); } catch (_) {}
  return makeLoaded(envelope, v1.slots, v1.sl, 'v1', true);
}

export function saveV2Store(storage, envelope, slots, changedIndex, sl) {
  const target = envelope && envelope.v === V2_VERSION ? envelope : packState(slots, sl);
  let changed = false;
  const indexes = Number.isInteger(changedIndex) && changedIndex >= 0 && changedIndex < slots.length
    ? [changedIndex]
    : slots.map((_, index) => index);

  for (const index of indexes) {
    const slot = slots[index];
    if (!slot || !slot.dirty) continue;
    const next = packSlot(slot);
    if (!sameArray(target.s[index], next)) { target.s[index] = next; changed = true; }
    slot.dirty = false;
  }

  if (sl) {
    const nextSL = packSL(sl);
    if (!sameArray(target.l, nextSL)) { target.l = nextSL; changed = true; }
  }

  if (!changed) return false;
  storage.setItem(V2_STORAGE_KEY, JSON.stringify(target));
  return true;
}

export function v2ByteLength(storage) {
  return (storage.getItem(V2_STORAGE_KEY) || '').length;
}
