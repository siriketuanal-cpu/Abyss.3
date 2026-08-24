// v227由来: スターリープ表示・入力・確定操作。共有状態はcore.jsに保持する。

function buildSL(){
  const wrap = document.getElementById('slwrap');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="slcard stam-card" id="sl-card-stamina" data-slaction="card" data-sltype="stamina">' +
      '<div class="slhead"><span class="slname">討伐依頼</span></div>' +
      '<div class="slmain" id="sl-stamina-main">—:—</div>' +
      '<div class="slsub sl-stamina-sub" id="sl-stamina-sub"><input class="sl-inline-field sl-stamina-current-input sl-always-current-field" id="sl-stamina-current-input" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" readonly tabindex="-1" aria-label="現在のスタミナ"><span class="sl-stamina-sep">/</span><input class="sl-inline-field sl-stamina-max-input sl-always-max-field" id="sl-stamina-max-input" type="text" readonly tabindex="-1" aria-label="スタミナ上限"><span id="sl-stamina-clock"></span></div>' +
    '</div>' +
    '<div class="slcard orb-card" id="sl-card-orb" data-slaction="card" data-sltype="orb">' +
      '<div class="slhead"><span class="slname">御大樹の恵み</span></div>' +
      '<div class="slmain slorbs" id="sl-orb-main">○○○○</div>' +
      '<div class="slsub orb-sub"><span class="orb-sub-left" id="sl-orb-next"></span><span class="sl-orb-full-wrap"><span class="sl-orb-full-display" id="sl-orb-full-display"></span><input class="sl-inline-field sl-orb-full-input" id="sl-orb-full-input" type="text" inputmode="numeric" pattern="[0-9:]*" enterkeyhint="done" aria-label="オーブ全回復までの残り時間。数字は4桁まで。342、1800、または18:00で入力"></span><span class="orb-full-at" id="sl-orb-full-at"></span></div>' +
    '</div>';
  slRefs = {
    stamina: { card: document.getElementById('sl-card-stamina'), main: document.getElementById('sl-stamina-main'), current: document.getElementById('sl-stamina-current-input'), max: document.getElementById('sl-stamina-max-input'), clock: document.getElementById('sl-stamina-clock'), input: document.getElementById('sl-stamina-current-input'), maxInput: document.getElementById('sl-stamina-max-input') },
    orb: { card: document.getElementById('sl-card-orb'), main: document.getElementById('sl-orb-main'), next: document.getElementById('sl-orb-next'), full: document.getElementById('sl-orb-full-display'), fullAt: document.getElementById('sl-orb-full-at'), input: document.getElementById('sl-orb-full-input') }
  };
}
function getSLConfig(type){
  return type === 'orb'
    ? { timer: state.sl.orb, max: SL_ORB_MAX, interval: SL_ORB_INTERVAL }
    : { timer: state.sl.stamina, max: SL_STAM_MAX, interval: SL_STAM_INTERVAL };
}

function parseSLFullRecoveryInput(value){
  const raw = String(value || '').trim().replace(/：/g, ':');
  let hours, minutes;
  if (raw.includes(':')) {
    const parts = raw.split(':');
    // H:MMのみを許容し、秒を含むH:MM:SSは受け付けない。
    if (parts.length !== 2 || parts.some(p => !/^\d+$/.test(p))) return null;
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  } else if (/^\d+$/.test(raw)) {
    // 数字のみは1〜2桁を分、3桁以上をHMM/HHMMとして読む。
    // 入力欄側で数字を4桁に打ち止めるため、ここでは重複した桁数拒否を持たない。
    // 例: 42 → 42分、342 → 3時間42分、1800 → 18時間00分。
    if (raw.length <= 2) {
      hours = 0;
      minutes = Number(raw);
    } else {
      hours = Number(raw.slice(0, -2));
      minutes = Number(raw.slice(-2));
    }
  } else {
    return null;
  }
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59) return null;
  const ms = (hours * 3600 + minutes * 60) * 1000;
  if (ms < 0 || ms > SL_ORB_MAX * SL_ORB_INTERVAL) return null;
  return ms;
}
function slClearEdit(){
  if (!slEdit) return;
  Object.keys(slRefs).forEach(key => {
    const r = slRefs[key];
    if (!r || !r.card) return;
    r.card.classList.remove('sl-inline-active', 'sl-inline-current', 'sl-inline-orb');
    if (r.input) {
      r.input.value = '';
      r.input.readOnly = true;
      r.input.tabIndex = -1;
    }
  });
  slEdit = null;
  renderSL();
  requestAnimationFrame(renderSL);
  syncIdleConfirmBackdrop();
}
function slArm(type){
  if (slEdit) { slClearEdit(); return; }
  const r = slRefs[type];
  if (!r || !r.card) return;
  slEdit = { type, mode: 'armed' };
  r.card.classList.add('sl-inline-active');
  syncIdleConfirmBackdrop();
}
function slBeginEdit(type){
  if (slEdit) slClearEdit();
  const r = slRefs[type];
  if (!r || !r.card || !r.input) return;
  slEdit = { type, mode: 'input' };
  r.card.classList.add('sl-inline-active', type === 'orb' ? 'sl-inline-orb' : 'sl-inline-current');
  r.input.readOnly = false;
  r.input.tabIndex = 0;
  r.input.value = '';
  syncIdleConfirmBackdrop();
  // ドットアビス／Gジェネと同じ共通フォーカス補助を使い、端末差なく入力位置を整える。
  focusEditAtEnd(r.input);
}
function slCommit(){
  if (!slEdit || slEdit.mode !== 'input') return;
  const type = slEdit.type;
  const cfg = getSLConfig(type);
  const r = slRefs[type];
  const raw = r && r.input ? String(r.input.value || '').trim() : '';
  const now = Date.now();
  let changed = false;
  if (type === 'stamina') {
    const value = clampInt(raw, 0, cfg.max, null);
    if (value !== null) {
      cfg.timer.current = value;
      cfg.timer.running = value < cfg.max;
      cfg.timer.start = cfg.timer.running ? now : null;
      changed = true;
    }
  } else {
    const fullIn = parseSLFullRecoveryInput(raw);
    if (fullIn !== null) {
      const missing = fullIn === 0 ? 0 : Math.ceil(fullIn / cfg.interval);
      const current = cfg.max - missing;
      const nextIn = fullIn === 0 ? 0 : fullIn - (missing - 1) * cfg.interval;
      cfg.timer.current = current;
      if (current >= cfg.max) {
        cfg.timer.running = false;
        cfg.timer.start = null;
      } else {
        cfg.timer.running = true;
        cfg.timer.start = now - (cfg.interval - nextIn);
      }
      changed = true;
    }
  }
  slClearEdit();
  if (changed) saveState();
  renderSL();
  if (changed) startTicking();
}
function slCommitOutside(){
  if (!slEdit) return;
  if (slEdit.mode === 'armed') slClearEdit();
  else slCommit();
}
function renderSL(){
  if (!slRefs.stamina || !slRefs.orb) return;
  const now = Date.now();
  const stamCfg = getSLConfig('stamina');
  const orbCfg = getSLConfig('orb');
  const stamina = getSLTimerInfo(stamCfg.timer, stamCfg.max, stamCfg.interval, now);
  const orb = getSLTimerInfo(orbCfg.timer, orbCfg.max, orbCfg.interval, now);

  // 満タン時は Gジェネ／ドットアビスと同じ「時刻 + 到達」
  let slStamMain;
  if (stamina.isFull) {
    const at = stamina.fullAt || stamCfg.timer.start || now;
    slStamMain = formatClock(at);
  } else if (stamCfg.timer.running) {
    slStamMain = formatGameMinute(stamina.fullIn);
  } else {
    slStamMain = '—:—';
  }
  setText(slRefs.stamina.main, slStamMain);
  setClass(slRefs.stamina.main, 'slmain' + (stamina.isFull ? ' reached' : ''));
  setText(slRefs.stamina.current, String(stamina.current));
  setText(slRefs.stamina.max, String(SL_STAM_MAX));
  setText(slRefs.stamina.clock, stamina.isFull ? '' : (stamina.fullAt ? '　' + formatPlanClock(stamina.fullAt) : ''));

  const filled = '●'.repeat(orb.current) + '○'.repeat(SL_ORB_MAX - orb.current);
  setText(slRefs.orb.main, filled);
  setClass(slRefs.orb.main, 'slmain slorbs' + (orb.isFull ? ' full' : ''));
  if (orb.isFull) {
    setText(slRefs.orb.next, orb.fullAt ? formatClock(orb.fullAt) : 'MAX');
  } else if (orbCfg.timer.running) {
    if (slRefs.orb.next) {
      const nextTxt = formatGameMinute(orb.nextIn);
      const html = '<span class="orb-label">次</span>' + nextTxt;
      if (slRefs.orb.next.dataset._h !== html) {
        slRefs.orb.next.dataset._h = html;
        slRefs.orb.next.innerHTML = html;
      }
    }
  } else {
    setText(slRefs.orb.next, orb.current + '/4　未開始');
  }
  setClass(slRefs.orb.next, 'orb-sub-left' + (orb.isFull ? ' reached' : ''));
  setText(slRefs.orb.full, '');
  setText(slRefs.orb.fullAt, (!orb.isFull && orbCfg.timer.running && orb.fullAt) ? formatPlanClock(orb.fullAt) : '');
}
function setupSLDelegatedEvents(){
  const wrap = document.getElementById('slwrap');
  if (!wrap || wrap.dataset.delegated) return;
  wrap.dataset.delegated = '1';
  wrap.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.closest && target.closest('input')) return;
    const card = target.closest && target.closest('.slcard');
    if (!card) return;
    const type = card.dataset.sltype;
    if (slEdit && slEdit.type === type && slEdit.mode === 'armed') { slBeginEdit(type); return; }
    if (slEdit) return;
    slArm(type);
  });
  // 数字を4桁で打ち止めにする。H:MMのコロンは数字数に含めない。
  // キー入力と貼り付けの双方で同じ制限を適用し、5桁・6桁の確定時拒否を不要にする。
  wrap.addEventListener('input', (ev) => {
    const input = ev.target;
    if (!input || input.id !== 'sl-orb-full-input') return;
    const raw = String(input.value || '');
    let digits = 0;
    let next = '';
    for (const ch of raw) {
      if (/^\d$/.test(ch)) {
        if (digits < 4) { next += ch; digits += 1; }
      } else if (ch === ':' && !next.includes(':')) {
        next += ch;
      }
    }
    if (next !== raw) {
      input.value = next;
      input.setSelectionRange(next.length, next.length);
    }
  });
  wrap.addEventListener('focusout', (ev) => {
    const input = ev.target;
    if (!input || !input.id || (input.id !== 'sl-stamina-current-input' && input.id !== 'sl-orb-full-input')) return;
    slCommit();
  });
  wrap.addEventListener('keydown', (ev) => {
    const input = ev.target;
    if (!input || !input.id || (input.id !== 'sl-stamina-current-input' && input.id !== 'sl-orb-full-input')) return;
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); input.value = ''; input.blur(); }
  });
  document.addEventListener('click', (ev) => {
    if (!slEdit) return;
    if (ev.target && ev.target.closest && ev.target.closest('.slcard')) return;
    slCommitOutside();
  });
}
