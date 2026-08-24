const N = 6;
const STAM_INTERVAL = 3 * 60 * 1000;
const IDLE_DEFAULT_CAP_MS = 12 * 3600 * 1000;
// ドットアビスの確認待ちは、画面外を押すまで維持し、再タップで確定する。
// 秒表示を使わないため、開始時の見た目にも差が出る5分補正を使う。
const IDLE_LEAD_MS = 5 * 60 * 1000;
const URGENT_MS = 2 * 60 * 60 * 1000;
const STAM_MAX_BASE = 240;
const STAM_MAX_PER_LEVEL = 5;
const RANK_MIN = 1;
const RANK_MAX = 200;

const STORAGE_KEY = 'dotabyss:unified:v1';

const defaultSlot = () => ({
  label: '',
  rank: 1,
  stamCurrent: 0, stamMax: 240, stamStart: null, stamRunning: false,
  idleStart: null, idleCapMs: IDLE_DEFAULT_CAP_MS, idleRunning: false,
  missionDone: false, weeklyDone: false
});

function stamMaxFromRank(rank){
  const r = Math.max(RANK_MIN, Math.min(RANK_MAX, Math.floor(Number(rank) || 1)));
  return Math.min(999, STAM_MAX_BASE + (r - 1) * STAM_MAX_PER_LEVEL);
}
function rankFromStamMax(max){
  const m = Math.max(STAM_MAX_BASE, safeNum(max, STAM_MAX_BASE));
  const r = 1 + Math.round((m - STAM_MAX_BASE) / STAM_MAX_PER_LEVEL);
  return Math.max(RANK_MIN, Math.min(RANK_MAX, r));
}

// ---- Gジェネ ----
const GN = 2;
const G_STAM_INTERVAL = 5 * 60 * 1000;
const G_RESET_HOUR = 1;
const defaultGSlot = () => ({
  label: '',
  stamCurrent: 0, stamMax: 130, stamStart: null, stamRunning: false, missionDone: false
});
let gRefs = [];

// ---- 幻想水滸伝 STAR LEAP ----
const SL_STAM_MAX = 80;
const SL_STAM_INTERVAL = 12 * 60 * 1000;
const SL_ORB_MAX = 4;
const SL_ORB_INTERVAL = 6 * 60 * 60 * 1000;
const defaultSLTimer = () => ({ current: 0, start: null, running: false });
const defaultSLState = () => ({ stamina: defaultSLTimer(), orb: defaultSLTimer() });
let slEdit = null;
let slRefs = {};
let secondaryGamesBuilt = false;
let secondaryGamesBuildScheduled = false;
let secondaryGamesLoading = null;

let state = { slots: Array.from({ length: N }, defaultSlot), dailyDate: '', weeklyDate: '', g: { slots: Array.from({ length: GN }, defaultGSlot), dailyDate: '' }, sl: defaultSLState() };

let storageOk = true;
let textEditIdx = -1;
let refs = [];
let gameMinuteKey = '';
let tickId = null;
// 単一の自己スケジュール型描画ループの世代。古い予約済みコールバックを無効化する。
let tickGeneration = 0;
// 1操作内で複数clickが起きても、次フレームの復旧は1回だけにまとめる。
let interactionTickRecoveryFrame = 0;
let resetCheckTimer = null;
let swRegistrationScheduled = false;
let armedIdle = {};
// ドットアビスのスタミナ操作は同時に1枚だけ開けるため、編集状態を単一値で保持する。
let stamEdit = null;
// 手入力中に同じタイマーをタップした際、そのタップは確定操作として一度だけ消費する。
let pendingManualStamTap = -1;
// 長押しの終了直後にブラウザが発火する同一カードのclickだけを短時間で消費する。
// 新しいタップ開始時には必ず解除するため、次の意図的な操作は止めない。
let pendingLongPressClick = null;
// 数値インライン編集の状態定数。入口操作はゲーム別のまま、状態遷移だけを明文化する。
const DOT_EDIT_PHASE = Object.freeze({ REFERENCE: 'reference', MANUAL: 'manual' });
const G_EDIT_MODE = Object.freeze({ ARMED: 'armed', CURRENT: 'current', MAX: 'max' });
let labelSaveTimer = null;
let lastProgressSig = '';
let lastDailyLabel = '';
let lastIdleQuickTap = { index: -1, at: 0 };

function dayStrAt(resetHour){
  const d = new Date();
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function gameDayStr(){ return dayStrAt(5); }
function weekStrAt(resetHour){
  const d = new Date();
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function formatDateJP(iso){
  if (!iso) return '—';
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
}
function safeNum(v, fb){ if (v === null || v === undefined || v === '') return fb; const n = Number(v); return Number.isFinite(n) ? n : fb; }
function formatClock(ts){
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// 小さい予定表示は時刻だけにし、到達後の主表示だけに「到達」を付ける。
function formatPlanClock(ts){ return ts ? formatClock(ts) : ''; }
// Gジェネ・スターリープの分単位表示用。残り時間を過小に見せないよう切り上げる。
function formatGameMinute(ms){
  ms = Math.max(0, safeNum(ms, 0));
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours + ':' + String(minutes).padStart(2, '0');
}
function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function setText(el, text){
  if (!el) return;
  if (el.dataset && el.dataset._h !== undefined) delete el.dataset._h;
  // 常時表示の現在値inputは value を更新（編集フォーカス中は上書きしない）
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (document.activeElement === el) return;
    const v = text == null ? '' : String(text);
    if (el.value !== v) el.value = v;
    return;
  }
  if (el.textContent !== text) el.textContent = text;
}
// 時刻値と接尾辞は固定DOMへ差分テキストだけを流し込み、毎秒のinnerHTML差替えを避ける。
function setClockParts(timeEl, suffixEl, timeText, suffixText){
  setText(timeEl, timeText || '');
  setText(suffixEl, suffixText || '');
}
function setClass(el, cls){ if (el && el.className !== cls) el.className = cls; }
function setAttr(el, name, value){
  if (!el) return;
  const next = String(value);
  if (el.getAttribute(name) !== next) el.setAttribute(name, next);
}
function setVisible(el, visible){
  if (!el) return;
  const next = visible ? '' : 'none';
  if (el.style.display !== next) el.style.display = next;
}
function clampInt(value, min, max, fallback){
  const parsed = parseInt(String(value == null ? '' : value).trim(), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function setLongPressDisplay(disp, hitClass, text){
  if (!disp) return;
  const hit = document.createElement('span');
  hit.className = hitClass;
  hit.textContent = text;
  disp.replaceChildren(hit);
}
function restoreLongPressEdit(input, disp, inputValue, displayValue, hitClass, empty){
  if (input) { input.classList.remove('editing'); input.value = inputValue; }
  if (!disp) return;
  setVisible(disp, true);
  setLongPressDisplay(disp, hitClass, displayValue);
  disp.classList.toggle('empty', !!empty);
}
function focusEditAtEnd(input){
  if (!input) return;
  input.focus({ preventScroll: true });
  const place = () => { try { input.setSelectionRange(input.value.length, input.value.length); } catch(e){} };
  place(); setTimeout(place, 0); setTimeout(place, 40);
}
function setSaveStamp(text){
  const el = document.getElementById('saveStamp');
  if (el) el.textContent = text;
}

function ensureDailyDate(){
  const today = gameDayStr();
  if (state.dailyDate !== today) {
    state.dailyDate = today;
    state.slots.forEach(s => { s.missionDone = false; });
    for (let i = 0; i < refs.length; i++) {
      if (refs[i] && refs[i].mark) { refs[i].mark.classList.remove('show'); refs[i].mark.setAttribute('aria-pressed', 'false'); }
    }
    lastProgressSig = '';
    saveState();
  }
  const label = formatDateJP(state.dailyDate);
  if (label !== lastDailyLabel) {
    lastDailyLabel = label;
    const el = document.getElementById('dailyDateDisplay');
    if (el) el.textContent = label;
  }
  renderDailyProgress();
}

function ensureWeeklyDate(){
  const week = weekStrAt(5);
  if (state.weeklyDate !== week) {
    state.weeklyDate = week;
    state.slots.forEach(s => { s.weeklyDone = false; });
    for (let i = 0; i < refs.length; i++) {
      if (refs[i] && refs[i].weeklyMark) refs[i].weeklyMark.classList.remove('show');
    }
    saveState();
  }
}

function renderDailyProgress(){
  const el = document.getElementById('dailyProgress');
  if (!el) return;
  let sig = '', count = 0;
  for (let k = 0; k < N; k++) {
    const done = !!state.slots[k].missionDone;
    sig += done ? '1' : '0';
    if (done) count++;
  }
  if (sig === lastProgressSig) return;
  lastProgressSig = sig;
  if (count >= N) {
    el.innerHTML = '<span class="complete-badge">COMPLETE</span>';
    return;
  }
  let html = '';
  for (let k = 0; k < N; k++) {
    const done = sig[k] === '1';
    html += '<span class="pdot d' + k + (done ? ' filled' : '') + '">' + (done ? '✓' : '') + '</span>';
  }
  el.innerHTML = html;
}

function parseStoredState(){
  if (typeof localStorage === 'undefined') throw new Error('no localStorage');
  const raw = localStorage.getItem(STORAGE_KEY);
  const result = { slots: null, dailyDate: gameDayStr(), weeklyDate: weekStrAt(5), g: { slots: null, dailyDate: dayStrAt(G_RESET_HOUR) }, sl: defaultSLState() };
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.slots && Array.isArray(parsed.slots) && parsed.slots.length === N) {
      const now = Date.now();
      result.slots = parsed.slots.map(s => {
        const o = defaultSlot();
        if (!s || typeof s !== 'object') return o;
        o.label = typeof s.label === 'string' ? s.label : '';
        if (s.rank != null && Number.isFinite(Number(s.rank))) {
          o.rank = Math.max(RANK_MIN, Math.min(RANK_MAX, Math.floor(Number(s.rank))));
          o.stamMax = stamMaxFromRank(o.rank);
        } else {
          o.stamMax = Math.max(1, Math.min(999, safeNum(s.stamMax, STAM_MAX_BASE)));
          o.rank = rankFromStamMax(o.stamMax);
          o.stamMax = stamMaxFromRank(o.rank);
        }
        o.stamCurrent = Math.max(0, Math.min(o.stamMax, safeNum(s.stamCurrent, 0)));
        const ss = safeNum(s.stamStart, null);
        if (ss && ss > 0 && ss < Date.now() + 60000 && s.stamRunning) {
          const elapsed = Math.max(0, now - ss);
          const recovered = Math.floor(elapsed / STAM_INTERVAL);
          o.stamCurrent = Math.min(o.stamMax, o.stamCurrent + recovered);
          o.stamStart = ss + recovered * STAM_INTERVAL;
          o.stamRunning = true;
          if (o.stamCurrent >= o.stamMax) {
            o.stamCurrent = o.stamMax;
            o.stamStart = ss;
          }
        }
        o.idleCapMs = safeNum(s.idleCapMs, IDLE_DEFAULT_CAP_MS);
        const is = safeNum(s.idleStart, null);
        if (is && is > 0 && is < Date.now() + 60000 && s.idleRunning) {
          o.idleStart = is;
          o.idleRunning = true;
        }
        o.missionDone = !!s.missionDone;
        o.weeklyDone = !!s.weeklyDone;
        return o;
      });
    }
    result.dailyDate = typeof parsed.dailyDate === 'string' ? parsed.dailyDate : gameDayStr();
    result.weeklyDate = typeof parsed.weeklyDate === 'string' ? parsed.weeklyDate : weekStrAt(5);
    result.g = result.g || { slots: null, dailyDate: dayStrAt(G_RESET_HOUR) };
    if (parsed.g && Array.isArray(parsed.g.slots) && parsed.g.slots.length === GN) {
      const now2 = Date.now();
      result.g.slots = parsed.g.slots.map(s => {
        const o = defaultGSlot();
        if (!s || typeof s !== 'object') return o;
        o.label = typeof s.label === 'string' ? s.label : '';
        o.stamMax = Math.max(1, Math.min(999, safeNum(s.stamMax, 130)));
        o.stamCurrent = Math.max(0, Math.min(o.stamMax, safeNum(s.stamCurrent, 0)));
        const ss = safeNum(s.stamStart, null);
        if (ss && ss > 0 && ss < Date.now() + 60000 && s.stamRunning) {
          const elapsed = Math.max(0, now2 - ss);
          const recovered = Math.floor(elapsed / G_STAM_INTERVAL);
          o.stamCurrent = Math.min(o.stamMax, o.stamCurrent + recovered);
          o.stamStart = ss + recovered * G_STAM_INTERVAL;
          o.stamRunning = true;
          if (o.stamCurrent >= o.stamMax) { o.stamCurrent = o.stamMax; o.stamStart = ss; }
        }
        o.missionDone = !!s.missionDone;
        return o;
      });
      result.g.dailyDate = typeof parsed.g.dailyDate === 'string' ? parsed.g.dailyDate : dayStrAt(G_RESET_HOUR);
    }

    if (parsed.sl && typeof parsed.sl === 'object') {
      const readSLTimer = (source, max) => {
        const out = defaultSLTimer();
        if (!source || typeof source !== 'object') return out;
        out.current = Math.max(0, Math.min(max, safeNum(source.current, 0)));
        const start = safeNum(source.start, null);
        if (source.running && start && start > 0 && start < Date.now() + 60000) {
          out.start = start;
          out.running = true;
        }
        return out;
      };
      result.sl.stamina = readSLTimer(parsed.sl.stamina, SL_STAM_MAX);
      result.sl.orb = readSLTimer(parsed.sl.orb, SL_ORB_MAX);
    }
  }
  return result;
}

function loadState(){
  try {
    const parsed = parseStoredState();
    if (parsed.slots) state.slots = parsed.slots;
    state.dailyDate = parsed.dailyDate;
    state.weeklyDate = parsed.weeklyDate;
    if (parsed.g && parsed.g.slots) state.g.slots = parsed.g.slots;
    if (parsed.g) state.g.dailyDate = parsed.g.dailyDate;
    if (parsed.sl) state.sl = parsed.sl;
  } catch (e) {
    storageOk = false;
    setSaveStamp('このブラウザでは保存機能が使えません');
    state.dailyDate = gameDayStr();
  }
  build();
  render();
  // 進行中のタイマーがある場合だけ、毎秒描画を開始する。
  startTicking();
  scheduleResetCheck();
  // 最初のフレームはドットアビスだけを優先し、下段の2ゲームは画面表示後に構築する。
  scheduleSecondaryGamesBuild();
  if (storageOk) setSaveStamp('読み込み完了');
}

function buildSecondaryGames(){
  if (secondaryGamesBuilt) return;
  if (typeof buildG !== 'function' || typeof buildSL !== 'function') return;
  buildG();
  buildSL();
  renderG();
  renderSL();
  secondaryGamesBuilt = true;
  const gamesRoot = document.getElementById('gamesAll');
  if (gamesRoot) {
    gamesRoot.dataset.secondaryState = 'ready';
    gamesRoot.removeAttribute('aria-busy');
  }
}

function loadDeferredAsset(kind, src){
  return new Promise((resolve, reject) => {
    const selector = kind === 'style' ? `link[data-deferred-asset="${src}"]` : `script[data-deferred-asset="${src}"]`;
    const existing = document.querySelector(selector);
    if (existing) {
      if (existing.dataset.ready === '1') { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(src)), { once: true });
      return;
    }
    const el = kind === 'style' ? document.createElement('link') : document.createElement('script');
    el.dataset.deferredAsset = src;
    el.onload = () => { el.dataset.ready = '1'; resolve(); };
    el.onerror = () => reject(new Error(src));
    if (kind === 'style') { el.rel = 'stylesheet'; el.href = src; }
    else { el.src = src; el.async = true; }
    document.head.appendChild(el);
  });
}

function requestSecondaryGamesBuild(){
  if (secondaryGamesBuilt) return Promise.resolve();
  if (secondaryGamesLoading) return secondaryGamesLoading;
  const gamesRoot = document.getElementById('gamesAll');
  if (gamesRoot) { gamesRoot.dataset.secondaryState = 'loading'; gamesRoot.setAttribute('aria-busy', 'true'); }
  secondaryGamesLoading = Promise.all([
    loadDeferredAsset('style', 'styles-games-v237.min.css?v=16'),
    loadDeferredAsset('script', 'games-deferred-v237.min.js?v=16')
  ]).then(() => {
    buildSecondaryGames();
    // 実カードを構築してから委譲イベントを登録する。起動直後の最初の編集操作で
    // 空の下段コンテナを対象にしてしまう余地を減らす。
    setupGDelegatedEvents();
    setupSLDelegatedEvents();
  }).catch((error) => {
    secondaryGamesLoading = null;
    if (gamesRoot) { gamesRoot.dataset.secondaryState = 'failed'; gamesRoot.removeAttribute('aria-busy'); }
    console.warn('secondary games load failed', error);
  });
  return secondaryGamesLoading;
}

function scheduleSecondaryGamesBuild(priority = false){
  if (secondaryGamesBuilt) return;
  if (priority) {
    secondaryGamesBuildScheduled = false;
    requestSecondaryGamesBuild();
    return;
  }
  if (secondaryGamesBuildScheduled) return;
  if (document.hidden) return;
  secondaryGamesBuildScheduled = true;
  const buildAfterFirstPaint = () => {
    secondaryGamesBuildScheduled = false;
    if (document.hidden || secondaryGamesBuilt) return;
    requestSecondaryGamesBuild();
  };
  // 初回ペイント後の次タスクで下段読込へ進む。90ms固定待機をなくして、
  // ドットアビス先行表示を守りながら編集可能になるまでの空白を短くする。
  requestAnimationFrame(() => setTimeout(buildAfterFirstPaint, 0));
}

function saveState(){
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    setSaveStamp('保存済み ' + p(now.getHours()) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds()));
  } catch (e) {
    setSaveStamp('保存に失敗しました');
  }
}

function getStamInfo(s, now){
  if (!s.stamRunning || !s.stamStart) {
    const cur = s.stamCurrent;
    return { current: cur, fullIn: null, fullAt: null, isFull: cur >= s.stamMax };
  }
  const elapsed = Math.max(0, now - s.stamStart);
  const recovered = Math.floor(elapsed / STAM_INTERVAL);
  const current = Math.min(s.stamMax, s.stamCurrent + recovered);
  if (current >= s.stamMax) {
    const need = Math.max(0, s.stamMax - s.stamCurrent);
    const fullAt = s.stamStart + need * STAM_INTERVAL;
    return { current: s.stamMax, fullIn: 0, fullAt: fullAt, isFull: true };
  }
  const nextIn = STAM_INTERVAL - (elapsed % STAM_INTERVAL);
  const need = s.stamMax - current;
  const fullIn = (need - 1) * STAM_INTERVAL + nextIn;
  return { current, fullIn, fullAt: now + fullIn, isFull: false };
}

function getGStamInfo(s, now){
  if (!s.stamRunning || !s.stamStart) {
    const cur = s.stamCurrent;
    return { current: cur, fullIn: null, fullAt: null, isFull: cur >= s.stamMax };
  }
  const elapsed = Math.max(0, now - s.stamStart);
  const recovered = Math.floor(elapsed / G_STAM_INTERVAL);
  const current = Math.min(s.stamMax, s.stamCurrent + recovered);
  if (current >= s.stamMax) {
    const need = Math.max(0, s.stamMax - s.stamCurrent);
    const fullAt = s.stamStart + need * G_STAM_INTERVAL;
    return { current: s.stamMax, fullIn: 0, fullAt: fullAt, isFull: true };
  }
  const nextIn = G_STAM_INTERVAL - (elapsed % G_STAM_INTERVAL);
  const need = s.stamMax - current;
  const fullIn = (need - 1) * G_STAM_INTERVAL + nextIn;
  return { current, fullIn, fullAt: now + fullIn, isFull: false };
}

function getSLTimerInfo(timer, max, interval, now){
  if (!timer.running || !timer.start) {
    const current = timer.current;
    return { current, nextIn: null, fullIn: null, fullAt: null, isFull: current >= max };
  }
  const elapsed = Math.max(0, now - timer.start);
  const recovered = Math.floor(elapsed / interval);
  const current = Math.min(max, timer.current + recovered);
  if (current >= max) {
    const need = Math.max(0, max - timer.current);
    const fullAt = timer.start + need * interval;
    return { current: max, nextIn: 0, fullIn: 0, fullAt, isFull: true };
  }
  const nextIn = interval - (elapsed % interval);
  const need = max - current;
  const fullIn = (need - 1) * interval + nextIn;
  return { current, nextIn, fullIn, fullAt: now + fullIn, isFull: false };
}

function getIdleInfo(s, now){
  if (!s.idleRunning || !s.idleStart) return { display: '—:—', meta: '未開始', isFull: false, remainingMs: null };
  const cap = s.idleCapMs || IDLE_DEFAULT_CAP_MS;
  const elapsed = Math.max(0, now - s.idleStart);
  const remaining = Math.max(0, cap - elapsed);
  const isFull = remaining <= 0;
  const fullAt = s.idleStart + cap;
  return {
    display: isFull ? 'MAX' : formatGameMinute(remaining),
    meta: isFull ? formatClock(fullAt) + ' 到達' : formatClock(fullAt) + ' 満タン',
    clockTxt: formatClock(fullAt),
    suffix: isFull ? ' 到達' : ' 満タン',
    isFull,
    remainingMs: remaining
  };
}

// 実カードとタブ表示で同じ放置報酬の注意状態を使う。満タン到達後も赤字を維持する。
function getIdleAlertClass(s, idle){
  if (!idle || !s.idleRunning) return '';
  return (idle.isFull || (idle.remainingMs != null && idle.remainingMs < URGENT_MS)) ? 'urgent' : '';
}

function stamRemainderAfter40s(current){
  const c = Math.max(0, Math.floor(Number(current) || 0));
  return c % 40;
}

function getLiveStamCurrent(i){
  const s = state.slots[i];
  return s.stamRunning ? getStamInfo(s, Date.now()).current : s.stamCurrent;
}
// 進行中の3分サイクルだけ、更新後にも次回回復までの残り時間を保つ。
function getStamCycleStartAfterUpdate(s, now){
  if (!s.stamRunning || !s.stamStart) return now;
  const info = getStamInfo(s, now);
  if (info.isFull) return now;
  const elapsed = Math.max(0, now - s.stamStart);
  return now - (elapsed % STAM_INTERVAL);
}
function applyStamCurrentPreservingCycle(s, current, now){
  const start = getStamCycleStartAfterUpdate(s, now);
  s.stamCurrent = clampInt(current, 0, s.stamMax, 0);
  s.stamStart = start;
  s.stamRunning = true;
}

const EDIT_LIFECYCLE_SCOPE = Object.freeze({
  ALL: Object.freeze(['abyss', 'g', 'sl']),
  GAME_TABS: Object.freeze(['g', 'sl'])
});
function resolveTimerEdits(scopes = EDIT_LIFECYCLE_SCOPE.ALL){
  if (scopes.includes('abyss')) resolveStamEditFromOutside();
  if (scopes.includes('g') && typeof gCommitOutside === 'function') gCommitOutside();
  if (scopes.includes('sl') && typeof slCommitOutside === 'function') slCommitOutside();
  syncIdleConfirmBackdrop();
}
function closeAllPanels(){
  resolveTimerEdits();
  disarmAllIdle();
  syncIdleConfirmBackdrop();
  softBlur();
}

// ---- テスト用: ドットアビスのグループタブ ----
// ---- テスト用ゲームタブ ----



// ---- 放置報酬の二段階受取 ----

function needsTicking(){
  const now = Date.now();
  for (let i = 0; i < N; i++) {
    const s = state.slots[i];
    if (s.stamRunning && !getStamInfo(s, now).isFull) return true;
    if (s.idleRunning && !getIdleInfo(s, now).isFull) return true;
  }
  for (let i = 0; i < GN; i++) {
    const s = state.g.slots[i];
    if (s.stamRunning && !getGStamInfo(s, now).isFull) return true;
  }
  if (state.sl.stamina.running && !getSLTimerInfo(state.sl.stamina, SL_STAM_MAX, SL_STAM_INTERVAL, now).isFull) return true;
  if (state.sl.orb.running && !getSLTimerInfo(state.sl.orb, SL_ORB_MAX, SL_ORB_INTERVAL, now).isFull) return true;
  return false;
}

// 1回の描画完了後に次回だけを予約する。重複したループは世代番号で無効化する。
function scheduleNextTick(generation){
  if (generation !== tickGeneration || !needsTicking()) return;
  const unitMs = 60000;
  const delay = Math.max(80, unitMs - (Date.now() % unitMs));
  tickId = setTimeout(() => {
    tickId = null;
    if (generation !== tickGeneration) return;
    if (!needsTicking()) { stopTicking(); return; }
    // 個別ゲームの描画例外が起きても、次回予約を失わないようにする。
    try { render(); } catch (e) { console.warn(e); }
    if (generation === tickGeneration && needsTicking()) scheduleNextTick(generation);
  }, delay);
}
function startTicking(forceRestart = false){
  if (!needsTicking()) {
    stopTicking();
    return;
  }
  // 復帰・ユーザー操作では古い予約を無効化し、新しい世代の単一ループへ即時接続する。
  if (forceRestart) {
    tickGeneration += 1;
    if (tickId) clearTimeout(tickId);
    tickId = null;
  }
  if (!tickId) scheduleNextTick(tickGeneration);
}
function stopTicking(){
  tickGeneration += 1;
  if (tickId) { clearTimeout(tickId); tickId = null; }
}
// 編集の開閉・タブ切替・確定待機への移行後に、次フレームで単一ループを再接続する。
function scheduleInteractionTickRecovery(){
  if (interactionTickRecoveryFrame) return;
  interactionTickRecoveryFrame = requestAnimationFrame(() => {
    interactionTickRecoveryFrame = 0;
    if (document.hidden || !needsTicking()) return;
    startTicking(true);
  });
}

let startupStabilized = false;
function scheduleStartupStabilization(){
  const stabilize = () => {
    if (startupStabilized || document.hidden) return;
    startupStabilized = true;
    scheduleServiceWorkerRegistration();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(stabilize, { timeout: 600 });
  else setTimeout(stabilize, 50);
}
