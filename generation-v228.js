// v227由来: Gジェネ表示・編集・デイリー操作。共有状態はcore.jsに保持する。

function buildG(){
  const wrap = document.getElementById('gwrap');
  if (!wrap) return;
  let html = '';
  for (let i = 0; i < GN; i++) {
    const s = state.g.slots[i];
    const label = s.label ? escapeHtml(s.label) : ('G' + (i + 1));
    html +=
      '<div class="gcard" id="gcard-' + i + '" data-idx="' + i + '">' +
        '<div class="grow-top">' +
          '<span class="gname-disp' + (s.label ? '' : ' empty') + '" id="g-name-disp-' + i + '"><span class="gname-lp-hit">' + label + '</span></span>' +
          '<input class="gname-input" id="g-name-' + i + '" value="' + escapeHtml(s.label || '') + '" inputmode="text" enterkeyhint="done" aria-label="G' + (i + 1) + 'の名前">' +
          '<button type="button" class="gmark' + (s.missionDone ? ' show' : '') + '" id="g-mark-' + i + '" data-idx="' + i + '" tabindex="-1" aria-label="G' + (i + 1) + 'のデイリー完了。長押しで切替" aria-pressed="' + (s.missionDone ? 'true' : 'false') + '">✓</button>' +
        '</div>' +
        '<div class="gval" id="g-val-' + i + '">—:—</div>' +
        '<div class="gsub" id="g-sub-' + i + '">' +
          '<input class="g-inline-field g-inline-current-field g-always-current-field" type="text" id="g-cur-' + i + '" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" readonly tabindex="-1" aria-label="G' + (i + 1) + 'の現在スタミナ">' +
          '<span class="gsub-sep" id="g-subsep-' + i + '">/</span>' +
          '<input class="g-inline-field g-inline-max-field g-always-max-field" type="text" id="g-max-input-' + i + '" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" readonly tabindex="-1" aria-label="G' + (i + 1) + 'のスタミナ上限">' +
          '<span class="gsub-clock" id="g-subclock-' + i + '"></span>' +
        '</div>' +
      '</div>';
  }
  wrap.innerHTML = html;
  cacheRefsG();
}

function cacheRefsG(){
  gRefs = [];
  for (let i = 0; i < GN; i++) {
    gRefs.push({
      card: document.getElementById('gcard-' + i),
      val: document.getElementById('g-val-' + i),
      subCur: document.getElementById('g-cur-' + i),
      subMax: document.getElementById('g-max-input-' + i),
      subClock: document.getElementById('g-subclock-' + i),
      mark: document.getElementById('g-mark-' + i)
    });
  }
}

// ---- Gジェネ操作 ----
// Gジェネは同時に1枚しか編集できないため、編集状態を単一値で保持する。
let gEdit = null;

function gClearEdit(){
  if (!gEdit) return;
  const i = gEdit.index;
  const card = document.getElementById('gcard-' + i);
  const sub = document.getElementById('g-sub-' + i);
  const cur = document.getElementById('g-cur-' + i);
  const max = document.getElementById('g-max-input-' + i);
  if (card) card.classList.remove('g-inline-active');
  if (sub) sub.classList.remove('g-inline-editing', 'g-inline-current', 'g-inline-max');
  if (cur) { cur.value = ''; cur.readOnly = true; cur.tabIndex = -1; }
  if (max) { max.value = ''; max.readOnly = true; max.tabIndex = -1; }
  gEdit = null;
  renderG();
  requestAnimationFrame(renderG);
  syncIdleConfirmBackdrop();
}

function gBeginEdit(i, mode){
  gClearEdit();
  const field = document.getElementById(mode === G_EDIT_MODE.MAX ? 'g-max-input-' + i : 'g-cur-' + i);
  const card = document.getElementById('gcard-' + i);
  const sub = document.getElementById('g-sub-' + i);
  if (!field || !card || !sub) return;
  gEdit = { index: i, mode };
  field.readOnly = false;
  field.tabIndex = 0;
  field.value = '';
  card.classList.add('g-inline-active');
  sub.classList.add('g-inline-editing', mode === G_EDIT_MODE.MAX ? 'g-inline-max' : 'g-inline-current');
  syncIdleConfirmBackdrop();
  field.focus({ preventScroll: true });
}

function gCommit(){
  if (!gEdit || gEdit.mode === G_EDIT_MODE.ARMED) return;
  const { index: i, mode } = gEdit;
  const s = state.g.slots[i];
  const field = document.getElementById(mode === G_EDIT_MODE.MAX ? 'g-max-input-' + i : 'g-cur-' + i);
  const text = field ? String(field.value || '').trim() : '';
  if (text !== '') {
    const n = mode === G_EDIT_MODE.CURRENT
      ? clampInt(text, 0, s.stamMax, null)
      : clampInt(text, 1, 999, null);
    if (n !== null) {
      if (mode === G_EDIT_MODE.CURRENT) {
        s.stamCurrent = n;
        s.stamStart = Date.now();
        s.stamRunning = true;
      } else {
        s.stamMax = n;
        if (s.stamCurrent > s.stamMax) s.stamCurrent = s.stamMax;
      }
      saveState();
    }
  }
  gClearEdit();
  renderG();
  startTicking();
}

function gArm(i){
  if (gEdit) { gClearEdit(); return; }
  gEdit = { index: i, mode: G_EDIT_MODE.ARMED };
  const card = document.getElementById('gcard-' + i);
  if (card) card.classList.add('g-inline-active');
  syncIdleConfirmBackdrop();
}

function gCommitOutside(){
  if (!gEdit) return;
  if (gEdit.mode === G_EDIT_MODE.ARMED) gClearEdit();
  else gCommit();
}

function renderGName(i){
  const input = document.getElementById('g-name-' + i);
  const disp = document.getElementById('g-name-disp-' + i);
  const label = (state.g.slots[i] && state.g.slots[i].label) || '';
  restoreLongPressEdit(input, disp, label, label || ('G' + (i + 1)), 'gname-lp-hit', !label);
}

function beginGNameEdit(i){
  gClearEdit();
  for (let j = 0; j < GN; j++) renderGName(j);
  const input = document.getElementById('g-name-' + i);
  const disp = document.getElementById('g-name-disp-' + i);
  if (!input) return;
  setVisible(disp, false);
  input.classList.add('editing');
  input.value = state.g.slots[i].label || '';
  textEditIdx = 1000 + i;
  focusEditAtEnd(input);
}

function onGNameBlur(i){
  const input = document.getElementById('g-name-' + i);
  if (!input) return;
  state.g.slots[i].label = input.value;
  saveState();
  if (textEditIdx === 1000 + i) textEditIdx = -1;
  renderGName(i);
}

function toggleGMark(i){
  const s = state.g.slots[i];
  const mark = document.getElementById('g-mark-' + i);
  s.missionDone = !s.missionDone;
  saveState();
  if (mark) {
    mark.classList.toggle('show', s.missionDone);
    setAttr(mark, 'aria-pressed', s.missionDone);
    if (document.activeElement === mark) mark.blur();
  }
}

function ensureGDailyDate(){
  const today = dayStrAt(G_RESET_HOUR);
  if (state.g.dailyDate !== today) {
    state.g.dailyDate = today;
    state.g.slots.forEach(s => { s.missionDone = false; });
    gRefs.forEach(r => {
      if (r.mark) { r.mark.classList.remove('show'); setAttr(r.mark, 'aria-pressed', false); }
    });
    saveState();
  }
}

function setupGDelegatedEvents(){
  const wrap = document.getElementById('gwrap');
  if (!wrap || wrap.dataset.gInlineReady) return;
  wrap.dataset.gInlineReady = '1';
  let gNameLongPressClickUntil = 0;

  wrap.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('input')) return;
    const mark = target.closest && target.closest('.gmark');
    const name = target.closest && target.closest('.gname-lp-hit');
    // チェックは長押し専用。名前は通常タップをカード操作へ通す。
    if (mark) return;
    // 名前の長押し後にブラウザが発火する自動クリックだけは、編集を閉じないよう短時間無視する。
    if (name && performance.now() < gNameLongPressClickUntil) return;
    const card = target.closest && target.closest('.gcard');
    if (!card) return;
    const i = Number(card.dataset.idx);
    if (gEdit && gEdit.index === i && gEdit.mode === G_EDIT_MODE.ARMED) { gBeginEdit(i, G_EDIT_MODE.CURRENT); return; }
    if (gEdit) return;
    gArm(i);
  });

  wrap.addEventListener('focusout', (ev) => {
    const t = ev.target;
    if (!t || !t.id) return;
    if (t.id.indexOf('g-cur-') === 0 || t.id.indexOf('g-max-input-') === 0) gCommit();
    else if (t.classList && t.classList.contains('gname-input')) onGNameBlur(Number(t.id.split('-').pop()));
  });

  wrap.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (!t || !t.id || (t.id.indexOf('g-cur-') !== 0 && t.id.indexOf('g-max-input-') !== 0)) return;
    if (ev.key === 'Enter') { ev.preventDefault(); t.blur(); }
    if (ev.key === 'Escape') { ev.preventDefault(); t.value = ''; t.blur(); }
  });

  let timer = null, sx = 0, sy = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const start = (ev) => {
    if (ev.touches && ev.touches.length > 1) return;
    const target = ev.target;
    if (!target) return;
    const mark = target.closest && target.closest('.gmark');
    const name = target.closest && target.closest('.gname-lp-hit');
    const card = target.closest && target.closest('.gcard');
    if (!mark && !name && !card) return;
    const point = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    sx = point.clientX; sy = point.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (mark) { toggleGMark(Number(mark.dataset.idx)); return; }
      if (name) {
        gNameLongPressClickUntil = performance.now() + 360;
        beginGNameEdit(Number(card.dataset.idx));
        return;
      }
      gBeginEdit(Number(card.dataset.idx), G_EDIT_MODE.MAX);
    }, 500);
  };
  const move = (ev) => {
    if (!timer) return;
    const point = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    const dx = point.clientX - sx, dy = point.clientY - sy;
    if (dx * dx + dy * dy > 144) cancel();
  };
  wrap.addEventListener('touchstart', start, { passive:true });
  wrap.addEventListener('touchmove', move, { passive:true });
  wrap.addEventListener('touchend', cancel, { passive:true });
  wrap.addEventListener('touchcancel', cancel, { passive:true });
  wrap.addEventListener('mousedown', (ev) => { if (ev.button === 0) start(ev); });
  wrap.addEventListener('mousemove', move);
  wrap.addEventListener('mouseup', cancel);

  document.addEventListener('click', (ev) => {
    if (!gEdit) return;
    if (ev.target && ev.target.closest && ev.target.closest('.gcard')) return;
    gCommitOutside();
  });
}


// v227由来: Gジェネの毎分描画。

function renderG(){
  try {
    ensureGDailyDate();
    const now = Date.now();
    if (!gRefs.length) return;
    for (let i = 0; i < GN; i++) {
      const s = state.g.slots[i];
      const r = gRefs[i];
      if (!r || !r.val) continue;
      const stam = getGStamInfo(s, now);
      let main, cls, curTxt, maxTxt, clockTxt;
      if (s.stamRunning) {
        if (stam.isFull) {
          main = stam.fullAt ? formatClock(stam.fullAt) : 'MAX'; cls = 'gval reached';
          curTxt = String(stam.current); maxTxt = String(s.stamMax);
          clockTxt = '';
        } else {
          main = formatGameMinute(stam.fullIn);
          cls = 'gval';
          curTxt = String(stam.current); maxTxt = String(s.stamMax);
          clockTxt = formatPlanClock(stam.fullAt);
        }
      } else {
        main = '—:—'; cls = 'gval';
        curTxt = String(s.stamCurrent); maxTxt = String(s.stamMax); clockTxt = '';
      }
      setText(r.val, main); setClass(r.val, cls);
      setText(r.subCur, curTxt); setText(r.subMax, maxTxt); setText(r.subClock, clockTxt);
    }
  } catch (e) { console.warn(e); }
}
