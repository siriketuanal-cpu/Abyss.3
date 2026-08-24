// v227由来: ドットアビスの描画・編集・放置報酬・イベント処理。共有状態はcore.jsに保持する。

function clearStamEdit(){
  if (!stamEdit) return;
  const i = stamEdit.index;
  const r = refs[i];
  if (r && r.card) r.card.classList.remove('stam-preview');
  if (r && r.stamSub) r.stamSub.classList.remove('stam-manual-editing');
  if (r && r.directCurEl) {
    r.directCurEl.readOnly = true;
    r.directCurEl.tabIndex = -1;
    try { r.directCurEl.blur(); } catch (_) {}
  }
  stamEdit = null;
}

// 1回目: 40消費後の参考値を表示する。画面外で取消、再タップで確定する。
function beginStamReference(i){
  const r = refs[i];
  if (!r) return;
  clearStamEdit();
  const live = getLiveStamCurrent(i);
  stamEdit = { index: i, value: stamRemainderAfter40s(live), phase: DOT_EDIT_PHASE.REFERENCE };
  if (r.card) r.card.classList.add('stam-preview');
  syncIdleConfirmBackdrop();
  render();
}

// スタミナタイマー領域の長押しで、任意値を空欄から直接入力する。
function beginStamManualInput(i){
  const r = refs[i];
  if (!r || !r.directCurEl || !r.stamSub) return;
  if (Object.keys(armedIdle).length > 0) {
    disarmAllIdle();
    return;
  }
  let edit = stamEdit;
  if (!edit || edit.index !== i) {
    clearStamEdit();
    const live = getLiveStamCurrent(i);
    edit = { index: i, value: stamRemainderAfter40s(live), phase: DOT_EDIT_PHASE.MANUAL, manualOnly: true };
    stamEdit = edit;
    if (r.card) r.card.classList.add('stam-preview');
  } else {
    edit.phase = DOT_EDIT_PHASE.MANUAL;
    edit.manualOnly = true;
  }
  const input = r.directCurEl;
  input.value = '';
  input.readOnly = false;
  input.tabIndex = 0;
  r.stamSub.classList.add('stam-manual-editing');
  syncIdleConfirmBackdrop();
  // 同じ要素のまま編集するので、表示とのズレが起きない
  requestAnimationFrame(() => {
    try {
      input.focus({ preventScroll: true });
      if (typeof input.select === 'function') input.select();
    } catch (_) {}
  });
}

function commitStamEdit(rawValue){
  if (!stamEdit) return;
  const { index: i, value, manualOnly } = stamEdit;
  const s = state.slots[i];
  const raw = rawValue == null ? '' : String(rawValue).trim();
  // 長押しから開いた手入力を空欄のまま閉じた場合は、値を変えずに取り消す。
  if (raw === '' && manualOnly) {
    clearStamEdit();
    syncIdleConfirmBackdrop();
    render();
    return;
  }
  let next = value;
  if (raw !== '') next = clampInt(raw, 0, s.stamMax, next);
  applyStamCurrentPreservingCycle(s, next, Date.now());
  clearStamEdit();
  saveState();
  syncIdleConfirmBackdrop();
  render();
  startTicking();
}

// 画面外タップ時は、1回目の参考表示なら取消、手入力なら確定する。
function resolveStamEditFromOutside(){
  if (!stamEdit) return;
  if (stamEdit.phase === DOT_EDIT_PHASE.REFERENCE) {
    clearStamEdit();
    render();
    syncIdleConfirmBackdrop();
    return;
  }
  commitStamEdit();
}

function build(){
  const grid = document.getElementById('grid');
  let html = '';
  for (let i = 0; i < N; i++) {
    const s = state.slots[i];
    const groupIndex = Math.floor(i / 2);
    const group = 'g' + groupIndex;
    const row = groupIndex + 1;
    const stamColumn = i % 2 ? 3 : 1;
    const idleColumn = i % 2 ? 4 : 2;
    const cardVars = '--abyss-row:' + row + ';--abyss-stam-column:' + stamColumn + ';--abyss-idle-column:' + idleColumn + ';';
    html +=
      '<div class="card-row">' +
        '<div class="abyss-timers">' +
          '<div class="card abyss-stam-card ' + group + '" id="card-' + i + '" style="' + cardVars + '" data-action="card" data-idx="' + i + '" aria-expanded="false">' +
            '<div class="row-top">' +
              '<span class="name-disp' + (s.label ? '' : ' empty') + '" id="name-disp-' + i + '"><span class="name-lp-hit">' +
              (s.label ? escapeHtml(s.label) : ('スロット ' + (i + 1))) + '</span></span>' +
              '<input class="name-input" id="name-' + i + '" value="' + escapeHtml(s.label) + '" placeholder="スロット ' + (i + 1) + '" inputmode="text" enterkeyhint="done" aria-label="スロット' + (i + 1) + 'の名前">' +
              '<span class="rank-disp" id="rank-disp-' + i + '"><span class="rank-lp-hit">Lv.' + (s.rank || 1) + '</span></span>' +
              '<input class="rank-input" id="rank-' + i + '" value="' + (s.rank || 1) + '" inputmode="numeric" enterkeyhint="done" aria-label="プレイヤレベル">' +
            '</div>' +
            '<div class="tblock tblock-stam">' +
              '<div class="ttag stam stam-plan-tag" aria-label="全回復予定時刻"><span class="idle-clock stam-plan-clock" id="stam-plan-' + i + '"></span></div>' +
              '<div class="tval stam" id="stam-val-' + i + '">—:—</div>' +
              '<div class="tsub stam-curmax" id="stam-sub-' + i + '">' +
                '<input class="tsub-cur-input stam-cur-field" type="text" id="stam-direct-cur-' + i + '" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" readonly tabindex="-1" aria-label="スロット' + (i + 1) + 'の現在スタミナ">' +
                '<span class="tsub-sep" id="stam-subsep-' + i + '">/</span>' +
                '<span class="tsub-max" id="stam-submax-' + i + '"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card abyss-idle-card ' + group + ' tblock-idle" id="idle-block-' + i + '" style="' + cardVars + '" data-idle-receive="true" data-idx="' + i + '" role="button" aria-label="放置報酬。1回タップで確認、受取">' +
            '<span class="idle-mark daily-mark ' + group + (s.missionDone ? ' show' : '') + '" id="daily-mark-' + i + '" aria-hidden="true">✔</span>' +
            '<span class="weekly-mark' + (s.weeklyDone ? ' show' : '') + '" id="weekly-mark-' + i + '" aria-hidden="true">✦</span>' +
            '<div class="ttag idle idle-plan-tag" aria-label="放置報酬の予定時刻"><span class="idle-clock" id="idle-subclock-time-' + i + '"></span><span id="idle-subclock-suffix-' + i + '"></span></div>' +
            '<div class="tval idle" id="idle-val-' + i + '">—:—</div>' +
            '<div class="tsub idle-meta idle-bottom-spacer" id="idle-sub-' + i + '" aria-hidden="true"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  grid.innerHTML = html;

  cacheRefs();
}

function cacheRefs(){
  refs = [];
  for (let i = 0; i < N; i++) {
    refs.push({
      card: document.getElementById('card-' + i),
      stamVal: document.getElementById('stam-val-' + i),
      stamPlan: document.getElementById('stam-plan-' + i),
      stamSubCur: document.getElementById('stam-direct-cur-' + i),
      stamSubSep: document.getElementById('stam-subsep-' + i),
      stamSubMax: document.getElementById('stam-submax-' + i),
      idleVal: document.getElementById('idle-val-' + i),
      idleSub: document.getElementById('idle-sub-' + i),
      idleSubClockTime: document.getElementById('idle-subclock-time-' + i),
      idleSubClockSuffix: document.getElementById('idle-subclock-suffix-' + i),
      mark: document.getElementById('daily-mark-' + i),
      weeklyMark: document.getElementById('weekly-mark-' + i),
      stamSub: document.getElementById('stam-sub-' + i),
      directCurEl: document.getElementById('stam-direct-cur-' + i)
    });
  }
}

function softBlur(){
  const ae = document.activeElement;
  if (!ae || ae === document.body || !ae.blur) return;
  requestAnimationFrame(() => { try { ae.blur(); } catch (e) {} });
}

function onCardClick(i, ev){
  const t = ev.target;
  // スタミナカード全体（名前・ランク・上部空白・タイマー部を含む）を単一の通常タップ入口として扱う。
  // 名前・ランクの長押しだけは、委譲された長押し判定が先に編集へ切り替える。
  if (!t || !t.closest) return;
  if (t.closest('input') || t.closest('button') || t.closest('.name-input') || t.closest('.rank-input')) return;

  // 手入力欄を閉じるために同じタイマーを押した場合、このclickは確定操作としてのみ消費する。
  if (pendingManualStamTap === i) {
    pendingManualStamTap = -1;
    return;
  }

  if (textEditIdx >= 0) {
    softBlur();
    textEditIdx = -1;
    return;
  }

  // 放置報酬が確認待ちなら、スタミナ側の最初のタップは解除だけに使う。
  if (Object.keys(armedIdle).length > 0) {
    disarmAllIdle();
    return;
  }

  // 参考表示中の通常タップは状態を保ち、確定は長押しに限定する。
  // 手入力中の通常タップは従来どおり入力状態を保つ。
  if (stamEdit && stamEdit.index === i) return;
  // 別タイマーの仮値が残っている場合は、段階に応じて取消または確定だけを行う。
  if (stamEdit) {
    resolveStamEditFromOutside();
    return;
  }

  // 1回目は、40消費後の最小値を取消可能な参考表示として出す。
  beginStamReference(i);
}

function endRankEditVisual(i){
  const rank = state.slots[i].rank || 1;
  restoreLongPressEdit(document.getElementById('rank-' + i), document.getElementById('rank-disp-' + i), String(rank), 'Lv.' + rank, 'rank-lp-hit', false);
}
function endNameEditVisual(i){
  const val = state.slots[i].label || '';
  restoreLongPressEdit(document.getElementById('name-' + i), document.getElementById('name-disp-' + i), val, val || ('スロット ' + (i + 1)), 'name-lp-hit', !val);
}
function beginNameEdit(i){
  for (let j = 0; j < N; j++) endRankEditVisual(j);
  const el = document.getElementById('name-' + i);
  const disp = document.getElementById('name-disp-' + i);
  if (!el) return;
  setVisible(disp, false);
  el.classList.add('editing');
  el.value = state.slots[i].label || '';
  textEditIdx = i;
  focusEditAtEnd(el);
}
function onNameBlur(i){
  const el = document.getElementById('name-' + i);
  const disp = document.getElementById('name-disp-' + i);
  if (!el) return;
  const val = el.value;
  setLabel(i, val);
  restoreLongPressEdit(el, disp, val, val || ('スロット ' + (i + 1)), 'name-lp-hit', !val);
  if (textEditIdx === i) textEditIdx = -1;
}

// ゲーム固有の編集ロジックは統合せず、外部解除の入口だけを共通化する。
function setLabel(i, val){
  state.slots[i].label = val;
  clearTimeout(labelSaveTimer);
  labelSaveTimer = setTimeout(saveState, 300);
}

function toggleMissionMark(i){
  const s = state.slots[i];
  const mark = refs[i] && refs[i].mark;
  s.missionDone = !s.missionDone;
  saveState();
  if (mark) {
    mark.classList.toggle('show', s.missionDone);
    mark.classList.remove('armed');
  }
  renderDailyProgress();
}
function toggleWeeklyMark(i){
  const s = state.slots[i];
  const mark = refs[i] && refs[i].weeklyMark;
  s.weeklyDone = !s.weeklyDone;
  saveState();
  if (mark) mark.classList.toggle('show', s.weeklyDone);
}

function beginRankEdit(i){
  for (let j = 0; j < N; j++) endNameEditVisual(j);
  const el = document.getElementById('rank-' + i);
  const disp = document.getElementById('rank-disp-' + i);
  if (!el) return;
  setVisible(disp, false);
  el.classList.add('editing');
  el.value = String(state.slots[i].rank || 1);
  textEditIdx = i;
  focusEditAtEnd(el);
}
function onRankBlur(i){
  const el = document.getElementById('rank-' + i);
  const disp = document.getElementById('rank-disp-' + i);
  if (!el) return;
  const r = clampInt(String(el.value).replace(/\D/g, ''), RANK_MIN, RANK_MAX, state.slots[i].rank || 1);
  const now = Date.now();
  const s = state.slots[i];
  if (s.stamRunning && s.stamStart) {
    const info = getStamInfo(s, now);
    applyStamCurrentPreservingCycle(s, info.current, now);
  }
  s.rank = r;
  s.stamMax = stamMaxFromRank(r);
  if (s.stamCurrent > s.stamMax) s.stamCurrent = s.stamMax;
  restoreLongPressEdit(el, disp, String(r), 'Lv.' + r, 'rank-lp-hit', false);
  saveState();
  render();
  if (textEditIdx === i) textEditIdx = -1;
}

function syncIdleConfirmBackdrop(){
  const bd = document.getElementById('backdrop');
  if (!bd) return;
  const hasStamEdit = !!stamEdit;
  const hasGEdit = typeof gEdit !== 'undefined' && !!gEdit;
  const hasSLEdit = !!slEdit;
  // #gamesAll は contain による独立した重なり文脈なので、カードだけでなく
  // ゲーム領域ごと暗転より前面化して、2回目の実機タッチをカードへ届ける。
  const gamesRoot = document.getElementById('gamesAll');
  if (gamesRoot) gamesRoot.classList.toggle('editing-above-backdrop', hasGEdit || hasSLEdit);
  if (hasStamEdit || hasGEdit || hasSLEdit) {
    bd.classList.add('show');
    bd.classList.remove('idle-confirm');
    return;
  }
  bd.classList.remove('show');
  bd.classList.toggle('idle-confirm', Object.keys(armedIdle).length > 0);
}

function updateIdleReceiveVisual(i, armed){
  const block = document.getElementById('idle-block-' + i);
  const val = document.getElementById('idle-val-' + i);
  const sub = document.getElementById('idle-sub-' + i);
  if (!block || !val || !sub) return;
  block.classList.toggle('receive-armed', armed);
  if (armed) {
    // 残りタイマーは隠さず、強調色と再タップ案内だけで受取待機を示す。
    const idle = getIdleInfo(state.slots[i], Date.now());
    setText(val, idle.display);
    const time = document.getElementById('idle-subclock-time-' + i);
    const suffix = document.getElementById('idle-subclock-suffix-' + i);
    setClockParts(time, suffix, '', '受取');
    if (suffix) suffix.classList.toggle('await-action-label', true);
  }
  syncIdleConfirmBackdrop();
}
function disarmIdle(i){
  if (Object.prototype.hasOwnProperty.call(armedIdle, i)) {
    clearTimeout(armedIdle[i]);
    delete armedIdle[i];
    updateIdleReceiveVisual(i, false);
    render();
  }
}
function disarmAllIdle(){ Object.keys(armedIdle).forEach(k => disarmIdle(Number(k))); }

function closeAbyssEditForIdle(){
  const active = document.activeElement;
  if (active && active.id && active.id.indexOf('stam-direct-cur-') === 0) active.blur();
  softBlur();
}

function commitIdleReceive(i){
  if (!Object.prototype.hasOwnProperty.call(armedIdle, i)) return false;
  clearTimeout(armedIdle[i]);
  delete armedIdle[i];
  updateIdleReceiveVisual(i, false);
  if (document.activeElement) document.activeElement.blur();
  // 初回も受取後も、従来どおり12時間計測を開始する。
  state.slots[i].idleStart = Date.now() - IDLE_LEAD_MS;
  state.slots[i].idleRunning = true;
  saveState();
  render();
  startTicking();
  return true;
}
function onIdleTimerTap(i){
  // 確認待ち中の通常タップは受取にせず、長押しだけを確定操作にする。
  if (Object.prototype.hasOwnProperty.call(armedIdle, i)) return;
  // 別スロットが受取確認中なら、最初のタップは確認を解除するだけにする。
  // 意図せず別の放置報酬をそのまま受取待機へ切り替えないための安全クッション。
  const hasOtherArmedIdle = Object.keys(armedIdle).some((key) => Number(key) !== i);
  if (hasOtherArmedIdle) {
    disarmAllIdle();
    return;
  }
  disarmAllIdle();
  // 受取確認へ入る時点で状態を登録し、即時描画と毎秒更新を必ず開始する。
  armedIdle[i] = true;
  updateIdleReceiveVisual(i, true);
  // 待機開始で変わるのは対象カードと暗転だけなので、全カードの再描画は行わない。
  startTicking();
}

function render(){
  try {
    ensureDailyDate();
    ensureWeeklyDate();
    const now = Date.now();
    if (!refs.length) return;
    for (let i = 0; i < N; i++) {
      const s = state.slots[i];
      const r = refs[i];
      if (!r || !r.stamVal) continue;
      const stam = getStamInfo(s, now);
      const idle = getIdleInfo(s, now);
      const stamUrgent = s.stamRunning && stam.fullAt != null && stam.fullAt <= now + URGENT_MS;
      const idleAlertClass = getIdleAlertClass(s, idle);
      // A/B/Cは全て常時表示するため、全カードを同一の描画条件で更新する。
      const renderVisibleCard = true;
      let stamMain, stamCls, stamCurTxt, stamMaxTxt, stamPlanTxt;
      if (s.stamRunning) {
        if (stam.isFull) {
          stamMain = stam.fullAt ? formatClock(stam.fullAt) : ''; stamCls = 'tval stam reached';
          stamCurTxt = String(stam.current); stamMaxTxt = String(s.stamMax);
          stamPlanTxt = '';
        } else {
          stamMain = formatGameMinute(stam.fullIn);
          stamCls = 'tval stam' + (stamUrgent ? ' urgent' : '');
          stamCurTxt = String(stam.current); stamMaxTxt = String(s.stamMax);
          stamPlanTxt = formatPlanClock(stam.fullAt);
        }
      } else {
        stamMain = '—:—'; stamCls = 'tval stam';
        stamCurTxt = String(s.stamCurrent); stamMaxTxt = String(s.stamMax); stamPlanTxt = '';
      }
      if (stamEdit && stamEdit.index === i) {
        stamCurTxt = String(stamEdit.value);
        if (stamEdit.phase === DOT_EDIT_PHASE.REFERENCE) {
          stamPlanTxt = '確定';
        }
      }
      if (renderVisibleCard) {
        setText(r.stamVal, stamMain); setClass(r.stamVal, stamCls);
        setText(r.stamPlan, stamPlanTxt);
        r.stamPlan.classList.toggle('await-action-label', stamPlanTxt === '確定');
        setText(r.stamSubCur, stamCurTxt);
        setText(r.stamSubMax, stamMaxTxt);
        let idleCls = 'tval idle';
        if (idle.isFull) idleCls += ' reached';
        else if (idleAlertClass) idleCls += ' ' + idleAlertClass;
        const idleArmed = Object.prototype.hasOwnProperty.call(armedIdle, i);
        const idleMain = idle.isFull ? (idle.clockTxt || '') : idle.display;
        if (idleArmed) {
          // 受取待機中も残りタイマーを維持し、色と操作案内だけで受取待機を示す。
          setText(r.idleVal, idleMain);
          setClockParts(r.idleSubClockTime, r.idleSubClockSuffix, '', '受取');
        } else {
          setText(r.idleVal, idleMain);
          if (idle.isFull) {
            setClockParts(r.idleSubClockTime, r.idleSubClockSuffix, '', '');
          } else if (idle.clockTxt) {
            setClockParts(r.idleSubClockTime, r.idleSubClockSuffix, idle.clockTxt, '');
          } else {
            setClockParts(r.idleSubClockTime, r.idleSubClockSuffix, '', idle.meta);
          }
        }
        r.idleSubClockSuffix.classList.toggle('await-action-label', idleArmed);
        setClass(r.idleVal, idleCls);
      }
    }
  } catch (e) { console.warn(e); }
  const gameMinuteKeyNow = String(Math.floor(Date.now() / 60000));
  if (gameMinuteKeyNow !== gameMinuteKey) {
    if (secondaryGamesBuilt && typeof renderG === 'function') renderG();
    if (secondaryGamesBuilt && typeof renderSL === 'function') renderSL();
    gameMinuteKey = gameMinuteKeyNow;
  }
  // すべて満タン・未開始なら、不要な毎秒描画を停止する。
  if (tickId && !needsTicking()) stopTicking();
}


function setupDelegatedEvents(){
  const grid = document.getElementById('grid');
  if (!grid || grid.dataset.delegated) return;
  grid.dataset.delegated = '1';

  const markManualStamTap = (ev) => {
    const target = ev.target;
    // カード内のどこを押しても、手入力を閉じるためのタップとして扱う。
    const card = target && target.closest && target.closest('.abyss-stam-card');
    const i = card ? Number(card.dataset.idx) : NaN;
    if (stamEdit && stamEdit.index === i && stamEdit.phase === DOT_EDIT_PHASE.MANUAL && document.activeElement === refs[i].directCurEl) {
      pendingManualStamTap = i;
    } else if (pendingManualStamTap >= 0) {
      pendingManualStamTap = -1;
    }
  };
  grid.addEventListener('touchstart', markManualStamTap, { passive: true });
  grid.addEventListener('mousedown', (ev) => { if (ev.button === 0) markManualStamTap(ev); });

  grid.addEventListener('click', (ev) => {
    const t = ev.target;
    const actionCard = t.closest && t.closest('[data-idx]');
    const actionIndex = actionCard ? Number(actionCard.dataset.idx) : NaN;
    if (pendingLongPressClick) {
      const sameCard = Number.isFinite(actionIndex) && actionIndex === pendingLongPressClick.index;
      const withinWindow = performance.now() <= pendingLongPressClick.expiresAt;
      pendingLongPressClick = null;
      if (sameCard && withinWindow) return;
    }
    const idleBlock = t.closest && t.closest('[data-idle-receive]');
    if (idleBlock) {
      const cardEl = idleBlock.closest('.card');
      const idx = cardEl ? Number(cardEl.dataset.idx) : NaN;
      if (Number.isFinite(idx)) {
        const now = performance.now();
        if (Object.prototype.hasOwnProperty.call(armedIdle, idx)) {
          if (lastIdleQuickTap.index === idx && now - lastIdleQuickTap.at <= 240) {
            lastIdleQuickTap = { index: -1, at: 0 };
            toggleWeeklyMark(idx);
            return;
          }
          lastIdleQuickTap = { index: idx, at: now };
          return;
        }
        lastIdleQuickTap = { index: -1, at: 0 };
        // 放置報酬を押したら、開いているスタミナ編集を静かに閉じて受取操作へ移る。
        closeAbyssEditForIdle();
        onIdleTimerTap(idx);
      }
      return;
    }
    const nameHit = t.closest && t.closest('.name-lp-hit');
    const rankHit = t.closest && t.closest('.rank-lp-hit');
    if (nameHit || rankHit) {
      // コンパクトな見出し領域もカードの通常タップへ通し、長押しだけを編集に残す。
      const stamCard = (nameHit || rankHit).closest('.abyss-stam-card');
      const idx = stamCard ? Number(stamCard.dataset.idx) : NaN;
      if (Number.isFinite(idx)) onCardClick(idx, ev);
      return;
    }
    const el = t.closest('[data-action]');
    if (el) {
      const action = el.dataset.action;
      const i = Number(el.dataset.idx);
      if (action === 'card') onCardClick(i, ev);
      else if (action === 'mark') { /* 長押し判定で制御 */ }
      return;
    }
    if (t.closest && (t.closest('input') || t.closest('.edit-panel'))) return;
  });

  grid.addEventListener('focusout', (ev) => {
    const t = ev.target;
    if (!t.id) return;
    if (t.id.indexOf('stam-direct-cur-') === 0) commitStamEdit(t.value);
    else if (t.classList && t.classList.contains('name-input')) onNameBlur(Number(t.id.split('-').pop()));
    else if (t.classList && t.classList.contains('rank-input')) onRankBlur(Number(t.id.split('-').pop()));
  });

  grid.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (!t || !t.id || t.id.indexOf('stam-direct-cur-') !== 0) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      t.blur();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      t.value = '';
      t.blur();
    }
  });

  grid.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.classList && t.classList.contains('name-input')) {
      const idx = Number(t.id.split('-').pop());
      state.slots[idx].label = t.value;
      clearTimeout(labelSaveTimer);
      labelSaveTimer = setTimeout(saveState, 300);
    }
  });

  // 仮値中に編集カード以外を押したら、その仮値を確定または解除する。
  document.addEventListener('click', (ev) => {
    if (!stamEdit) return;
    const t = ev.target;
    const isInsideEditedCard = t && t.closest && t.closest('#card-' + stamEdit.index);
    if (isInsideEditedCard || (t && t.closest && t.closest('.tblock-stam'))) return;
    pendingManualStamTap = -1;
    resolveStamEditFromOutside();
  });

  let lpTimer = null;
  let lpX = 0, lpY = 0;
  const LP_MS = 500;
  const LP_MOVE2 = 14 * 14; // 指の微ブレでキャンセルされにくくする
  const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  const lpStart = (ev) => {
    // 2本指などは無視（スクロール開始の誤判定を減らす）
    if (ev.touches && ev.touches.length > 1) return;
    const el = ev.target;
    if (!el) return;
    // 新しい指操作が始まった場合は、前回の長押し終了後clickの保護を解除する。
    if (pendingLongPressClick) pendingLongPressClick = null;
    const idleBlock = el.closest && el.closest('[data-idle-receive]');
    const nameHit = el.closest && el.closest('.name-lp-hit');
    const rankHit = el.closest && el.closest('.rank-lp-hit');
    const stamBlock = el.closest && el.closest('.tblock-stam');
    const stamCard = (stamBlock && stamBlock.closest ? stamBlock.closest('.abyss-stam-card') : null) || (el.closest && el.closest('.abyss-stam-card'));
    let mode = null;
    if (nameHit) mode = 'name';
    else if (rankHit) mode = 'rank';
    else if (idleBlock) {
      const idleIndex = Number(idleBlock.dataset.idx);
      // 確認待ちの放置報酬は長押しで受取を確定する。
      mode = Object.prototype.hasOwnProperty.call(armedIdle, idleIndex) ? 'idle-armed' : 'idle-mark';
    } else if (stamCard && !(el.closest && el.closest('input'))) {
      const stamIndex = stamCard ? Number(stamCard.dataset.idx) : NaN;
      const isReference = stamEdit && stamEdit.index === stamIndex && stamEdit.phase === DOT_EDIT_PHASE.REFERENCE;
      // 確認待ちは確定、通常時は従来どおり現在値の手入力を開く。
      mode = isReference ? 'stam-confirm' : 'stam-manual';
    } else return;
    const idEl = idleBlock || nameHit || rankHit || stamCard;
    const cardEl = idEl && idEl.closest ? idEl.closest('.card') : null;
    const i = Number((idEl.dataset && idEl.dataset.idx != null) ? idEl.dataset.idx : (cardEl && cardEl.dataset ? cardEl.dataset.idx : NaN));
    if (!Number.isFinite(i)) return;
    clearLp();
    const pt = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
    lpX = pt.clientX; lpY = pt.clientY;
    lpTimer = setTimeout(() => {
      lpTimer = null;
      if (mode === 'idle-armed') {
        commitIdleReceive(i);
        pendingLongPressClick = { index: i, expiresAt: performance.now() + 240 };
      } else if (mode === 'idle-mark') {
        toggleMissionMark(i);
        pendingLongPressClick = { index: i, expiresAt: performance.now() + 240 };
      } else if (mode === 'name') {
        beginNameEdit(i);
        pendingLongPressClick = { index: i, expiresAt: performance.now() + 240 };
      } else if (mode === 'rank') {
        beginRankEdit(i);
        pendingLongPressClick = { index: i, expiresAt: performance.now() + 240 };
      }
      else if (mode === 'stam-confirm') {
        commitStamEdit();
        pendingLongPressClick = { index: i, expiresAt: performance.now() + 240 };
      } else beginStamManualInput(i);
    }, LP_MS);
  };
  const lpMove = (ev) => {
    if (!lpTimer) return;
    const pt = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
    const dx = pt.clientX - lpX, dy = pt.clientY - lpY;
    if (dx * dx + dy * dy > LP_MOVE2) clearLp();
  };
  grid.addEventListener('touchstart', lpStart, { passive: true });
  grid.addEventListener('touchmove', lpMove, { passive: true });
  grid.addEventListener('touchend', clearLp, { passive: true });
  grid.addEventListener('touchcancel', clearLp, { passive: true });
  grid.addEventListener('contextmenu', (ev) => { ev.preventDefault(); }, { passive: false });
  grid.addEventListener('mouseleave', clearLp, { passive: true });
  grid.addEventListener('mousedown', (ev) => { if (ev.button === 0) lpStart(ev); });
  grid.addEventListener('mousemove', lpMove);
  grid.addEventListener('mouseup', clearLp);
}

document.addEventListener('contextmenu', (ev) => {
  // 入力欄を含む全画面で、スマホの長押しメニューを表示しない。
  ev.preventDefault();
}, { capture: true });

document.addEventListener('selectstart', (ev) => {
  // スタミナ、名前、ランクの長押し時に表示文字をハイライトさせない。
  const el = ev.target;
  if (el && el.closest && el.closest('.rank-lp-hit, .name-lp-hit, .tblock-stam')) ev.preventDefault();
}, { capture: true });


// 初期描画・更新予約・日付リセット予約はloadState()で完了している。
// 起動後のアイドル処理ではPWA登録だけを遅延実行し、二重描画は行わない。
