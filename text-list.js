import { applyStam, createSlots, displaySnapshot, hasTimedProgress, liveStam, loadStore, remainingAfter40, restartIdle, saveStore, setLabel, setRank, toggleMission, toggleWeekly, formatClock } from './abyss-lite-core.mjs';
import { applyFullRecovery, applyStamina as applySLStamina, createSLState, formatSLDuration, getTimerInfo, hasSLTimedProgress, parseFullRecoveryInput, SL_ORB_MAX, SL_ORB_STEP_MS, SL_STAM_MAX, SL_STAM_STEP_MS } from './starleap-lite-core.mjs';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const escape = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const dateJP = () => { const date = new Date(); return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日'; };

  let state = { slots:createSlots(), sl:createSLState() };
  let storageEnvelope = {};
  let storedSlots = [];
  let refs = [];
  let selected = null;
  let edit = null;
  let slEdit = null;
  let slRefs = null;
  const slSnapshot = { stamina:{}, orb:{} };
  let refreshTimer = null;
  let renderedDate = '';

  function read(){ const loaded = loadStore(localStorage); storageEnvelope = loaded.envelope; state.slots = loaded.slots; state.sl = loaded.sl; storedSlots = loaded.storedSlots; }

  function write(index){
    try { saveStore(localStorage, storageEnvelope, state.slots, storedSlots, index, state.sl); } catch (_) {}
  }
  function writeSL(){ try { saveStore(localStorage, storageEnvelope, state.slots, storedSlots, undefined, state.sl); } catch (_) {} }
  function slMarkup(){ return '<section class="starleap-line" aria-label="スターリープ"><span class="sl-item" data-sl-task="stamina" role="button" tabindex="0"><span class="sl-label">討伐依頼</span><span class="sl-value" data-sl-value="stamina"></span><input class="sl-edit" data-sl-editor="stamina" type="tel" inputmode="numeric" autocomplete="off" hidden><span class="sl-plan" data-sl-plan="stamina"></span></span><span class="sl-item" data-sl-task="orb" role="button" tabindex="0"><span class="sl-label">御大樹の恵み</span><span class="sl-value" data-sl-value="orb"></span><input class="sl-edit" data-sl-editor="orb" type="text" inputmode="numeric" autocomplete="off" hidden><span class="sl-plan" data-sl-plan="orb"></span></span></section>'; }
  function refreshSLItem(ref, isEditing, value, plan){ ref.value.hidden=isEditing; ref.input.hidden=!isEditing; if(!isEditing) setText(ref.value,value); setText(ref.plan,isEditing?'':plan); }
  function refreshSL(now){
    const stamina = getTimerInfo(state.sl.stamina, SL_STAM_MAX, SL_STAM_STEP_MS, now, slSnapshot.stamina);
    const orb = getTimerInfo(state.sl.orb, SL_ORB_MAX, SL_ORB_STEP_MS, now, slSnapshot.orb);
    refreshSLItem(slRefs.stamina, slEdit==='stamina', stamina.current+'/'+SL_STAM_MAX, stamina.running ? formatClock(stamina.fullAt) : (stamina.isFull ? 'MAX' : '—:—'));
    refreshSLItem(slRefs.orb, slEdit==='orb', '●'.repeat(orb.current)+'○'.repeat(SL_ORB_MAX-orb.current), orb.running ? ('次 '+formatSLDuration(orb.nextIn)+' / '+formatSLDuration(orb.fullIn)) : (orb.isFull ? 'MAX' : '—:—'));
  }
  function beginSLEdit(type){ if(slEdit) return; selected=null; slEdit=type; refreshSL(Date.now()); const input=slRefs[type].input; input.value=''; input.focus({preventScroll:true}); }
  function commitSLEdit(){ if(!slEdit) return; const type=slEdit; const input=slRefs[type].input; const now=Date.now(); if(type==='stamina'){ const digits=String(input.value||'').replace(/[^0-9]/g,''); if(digits) applySLStamina(state.sl.stamina,Number(digits),now); } else { const remaining=parseFullRecoveryInput(input.value); if(remaining!==null) applyFullRecovery(state.sl.orb,remaining,now); } slEdit=null; writeSL(); syncAll(); }
  function buildSL(){ const host=document.getElementById('starleap'); if(!host) return; host.innerHTML=slMarkup(); slRefs={}; for(const type of ['stamina','orb']){ const root=host.querySelector('[data-sl-task="'+type+'"]'); slRefs[type]={ root, value:root.querySelector('[data-sl-value]'), input:root.querySelector('[data-sl-editor]'), plan:root.querySelector('[data-sl-plan]') }; } }

  function accountMarkup(slot, index){
    return '<section class="account" data-slot="' + index + '">' +
      '<div class="account-head">' +
        '<span class="name-display" data-name-edit="' + index + '">' + escape(slot.label || ('スロット ' + (index + 1))) + '</span>' +
        '<input class="name-input" data-name-editor="' + index + '" value="' + escape(slot.label) + '" hidden autocomplete="off" spellcheck="false">' +
        '<span class="rank-display" data-rank-edit="' + index + '" role="button" tabindex="0">Lv.' + slot.rank + '</span>' +
        '<input class="rank-input" data-rank-editor="' + index + '" value="' + slot.rank + '" hidden inputmode="numeric" autocomplete="off">' +
      '</div>' +
      '<div class="task-row compact-data" data-i="' + index + '" data-task="stam" role="button" tabindex="0">' +
        '<span class="stam-group"><span class="stam-current stam-number" data-stam-number="' + index + '"></span>' +
        '<input class="stam-edit" data-stam-editor="' + index + '" type="tel" inputmode="numeric" autocomplete="off" spellcheck="false" hidden>' +
        '<span class="task-slash">/</span><span class="task-max" data-stam-number="' + index + '"></span></span><span class="stam-confirm-zone" data-stam-confirm="' + index + '" aria-hidden="true"></span><span class="task-plan" data-stam-confirm="' + index + '"></span>' +
      '</div>' +
      '<div class="task-row compact-data" data-i="' + index + '" data-task="idle" role="button" tabindex="0">' +
        '<strong class="task-value"></strong><span class="task-plan"></span>' +
        '<span class="compact-check" data-compact-check="daily" data-check-index="' + index + '" role="button" tabindex="0" aria-label="デイリー"></span>' +
      '</div>' +
    '</section>';
  }

  function buildStaticList(){
    const list = document.getElementById('list');
    list.innerHTML = state.slots.map(accountMarkup).join('');
    refs = state.slots.map((_, index) => {
      const root = list.querySelector('[data-slot="' + index + '"]');
      const stamRow = root.querySelector('[data-task="stam"]');
      const idleRow = root.querySelector('[data-task="idle"]');
      return {
        root,
        nameDisplay:root.querySelector('[data-name-edit]'), nameInput:root.querySelector('[data-name-editor]'),
        rankDisplay:root.querySelector('[data-rank-edit]'), rankInput:root.querySelector('[data-rank-editor]'),
      stamRow, stamNumber:stamRow.querySelector('.stam-number'), stamInput:stamRow.querySelector('[data-stam-editor]'),
        stamMax:stamRow.querySelector('.task-max'), stamPlan:stamRow.querySelector('.task-plan'),
        idleRow, idleValue:idleRow.querySelector('.task-value'), idlePlan:idleRow.querySelector('.task-plan'), dailyCheck:idleRow.querySelector('[data-compact-check="daily"]'),
        snapshot:{ stam:{ current:0, plan:'—:—' }, idle:{ value:'未開始', plan:'—:—', full:false } }
      };
    });
  }

  function setText(element, value){
    const text = String(value == null ? '' : value);
    if (element.textContent !== text) element.textContent = text;
  }
  function setSelected(element, value){ element.classList.toggle('is-selected', !!value); }
  function setCheck(element, done, awaiting){
    setText(element, awaiting ? '✦' : (done ? '◆' : '◇'));
    element.classList.toggle('is-done', !!done);
    setSelected(element, awaiting);
    element.dataset.checkState = awaiting ? 'awaiting' : (done ? 'done' : 'todo');
    element.setAttribute('aria-pressed', String(!!done));
  }
  function editIs(type, index){ return edit && edit.type === type && edit.index === index; }
  function planForIdle(snapshot, index){
    if (!selected || selected.index !== index || selected.task !== 'idle') return snapshot.idle.plan;
    return snapshot.idle.full ? '受取' : (snapshot.idle.value === '未開始' ? '開始' : '待機中');
  }

  function refreshSlot(index, snapshot){
    const slot = state.slots[index];
    const ref = refs[index];
    const stamSelected = selected && selected.index === index && selected.task === 'stam';
    const idleSelected = selected && selected.index === index && selected.task === 'idle';
    const stamEditing = editIs('stam', index);
    const nameEditing = editIs('name', index);
    const rankEditing = editIs('rank', index);

    ref.nameDisplay.hidden = nameEditing;
    ref.nameInput.hidden = !nameEditing;
    if (!nameEditing) setText(ref.nameDisplay, slot.label || ('スロット ' + (index + 1)));
    ref.rankDisplay.hidden = rankEditing;
    ref.rankInput.hidden = !rankEditing;
    if (!rankEditing) setText(ref.rankDisplay, 'Lv.' + slot.rank);

    ref.stamNumber.hidden = stamEditing;
    ref.stamInput.hidden = !stamEditing;
    if (!stamEditing) setText(ref.stamNumber, stamSelected ? selected.value : snapshot.stam.current);
    setText(ref.stamMax, slot.stamMax);
    setText(ref.stamPlan, stamSelected ? '確定' : snapshot.stam.plan);
    setSelected(ref.stamRow, stamSelected);

    setText(ref.idleValue, snapshot.idle.value);
    setText(ref.idlePlan, planForIdle(snapshot, index));
    setSelected(ref.idleRow, idleSelected);

    setCheck(ref.dailyCheck, slot.missionDone, selected && selected.index === index && selected.task === 'daily');
  }

  function scheduleRefresh(){
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (document.hidden || edit || slEdit) return;
    const now = Date.now();
    const slTimed = hasSLTimedProgress(state.sl, now);
    let dotTimed = false;
    for (let index = 0; index < state.slots.length; index += 1) { if (hasTimedProgress(state.slots[index], now)) { dotTimed = true; break; } }
    if (!dotTimed && !slTimed) return;
    const delay = 60000 - (Date.now() % 60000) + 24;
    refreshTimer = setTimeout(syncTimedSlots, delay);
  }
  function syncAll(){
    const now = Date.now();
    const date = dateJP();
    if (date !== renderedDate) { setText(document.getElementById('today'), date); renderedDate = date; }
    const complete=document.getElementById('daily-complete'); complete.hidden = !state.slots.length || !state.slots.every(slot => slot.missionDone); setText(complete, complete.hidden ? '' : 'COMPLETE');
    refreshSL(now);
    for (let index = 0; index < state.slots.length; index += 1) refreshSlot(index, displaySnapshot(state.slots[index], now, refs[index].snapshot));
    scheduleRefresh();
  }
  function syncTimedSlots(){
    const now = Date.now();
    refreshSL(now);
    for (let index = 0; index < state.slots.length; index += 1) {
      const slot = state.slots[index];
      if (slot.stamRunning || slot.idleRunning) refreshSlot(index, displaySnapshot(slot, now, refs[index].snapshot));
    }
    scheduleRefresh();
  }
  function syncIndices(...indices){
    const now = Date.now();
    for (const index of new Set(indices.filter(Number.isFinite))) refreshSlot(index, displaySnapshot(state.slots[index], now, refs[index].snapshot));
  }

  function beginEdit(type, index){
    const previous = selected ? selected.index : NaN;
    selected = null;
    edit = { type, index, original:type === 'stam' ? liveStam(state.slots[index], Date.now()) : null };
    syncIndices(previous, index);
    const ref = refs[index];
    const input = type === 'name' ? ref.nameInput : type === 'rank' ? ref.rankInput : ref.stamInput;
    input.value = type === 'name' ? state.slots[index].label : type === 'rank' ? String(state.slots[index].rank) : '';
    if (type === 'stam') adjustStamInputWidth(input);
    input.focus({ preventScroll:true });
    if (type === 'name' || type === 'rank') moveCursorToEnd(input);
  }
  function moveCursorToEnd(input){ const apply=()=>{ const end=input.value.length; input.setSelectionRange(end,end); }; apply(); requestAnimationFrame(apply); }
  function adjustStamInputWidth(input){ input.style.width = Math.max(1, input.value.length) * 1.05 + 'ch'; }
  function closeEdit(cancel){
    if (!edit) return;
    const active = edit;
    const ref = refs[active.index];
    const input = active.type === 'name' ? ref.nameInput : active.type === 'rank' ? ref.rankInput : ref.stamInput;
    if (!cancel) commitEdit(active, input.value);
    else { edit = null; syncIndices(active.index); scheduleRefresh(); }
  }
  function commitEdit(active, raw){
    const slot = state.slots[active.index];
    if (active.type === 'name') {
      setLabel(slot, raw);
      write(active.index);
    } else if (active.type === 'rank') {
      const rank = clamp(Math.floor(num(String(raw || '').replace(/[^0-9]/g, ''), slot.rank)), 1, 200);
      setRank(slot, rank, Date.now());
      write(active.index);
    } else {
      const digits = String(raw || '').replace(/[^0-9]/g, '');
      if (digits) {
        const value = clamp(Math.floor(num(digits, active.original)), 0, slot.stamMax);
        applyStam(slot, value, Date.now());
        write(active.index);
      }
    }
    edit = null;
    syncAll();
  }

  function selectTask(index, task){
    const previous = selected ? selected.index : NaN;
    selected = task === 'stam'
      ? { index, task, value:remainingAfter40(liveStam(state.slots[index], Date.now())) }
      : { index, task };
    syncIndices(previous, index);
  }
  function confirmTask(index, task){
    const slot = state.slots[index];
    if (task === 'stam') applyStam(slot, selected.value, Date.now());
    else if (task === 'idle') restartIdle(slot, Date.now());
    else if (task === 'daily') toggleMission(slot);
    else if (task === 'weekly') toggleWeekly(slot);
    write(index);
    selected = null;
    syncAll();
  }
  function activate(index, task){
    const same = selected && selected.index === index && selected.task === task;
    if (!same) selectTask(index, task);
    else confirmTask(index, task);
  }

  function setupEvents(){
    const list = document.querySelector('.page');
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('copy', event => event.preventDefault());
    document.addEventListener('cut', event => event.preventDefault());
    document.addEventListener('selectstart', event => event.preventDefault());
    document.addEventListener('dragstart', event => event.preventDefault());
    let touchStartY = 0;
    document.addEventListener('touchstart', event => { touchStartY = event.touches[0] ? event.touches[0].clientY : 0; }, { passive:true });
    document.addEventListener('touchmove', event => { const point = event.touches[0]; if (point && window.scrollY <= 0 && point.clientY > touchStartY) event.preventDefault(); }, { passive:false });
    list.addEventListener('pointerdown', event => { const input=event.target; if (input.matches('[data-name-editor],[data-rank-editor]')) { event.preventDefault(); input.focus({ preventScroll:true }); moveCursorToEnd(input); } });
    list.addEventListener('click', event => {
      const target = event.target;
      if (target.matches('input')) return;
      const name = target.closest('[data-name-edit]');
      if (name) { beginEdit('name', Number(name.dataset.nameEdit)); return; }
      const rank = target.closest('[data-rank-edit]');
      if (rank) { beginEdit('rank', Number(rank.dataset.rankEdit)); return; }
      const stamNumber = target.closest('[data-stam-number]');
      if (stamNumber) { beginEdit('stam', Number(stamNumber.dataset.stamNumber)); return; }
      const stamConfirm = target.closest('[data-stam-confirm]');
      if (stamConfirm) { activate(Number(stamConfirm.dataset.stamConfirm), 'stam'); return; }
      const check = target.closest('[data-compact-check]');
      if (check) { activate(Number(check.dataset.checkIndex), check.dataset.compactCheck); return; }
      const sl=target.closest('[data-sl-task]');
      if (sl) { beginSLEdit(sl.dataset.slTask); return; }
      const row = target.closest('[data-task]');
      if (row && row.dataset.task !== 'stam') activate(Number(row.dataset.i), row.dataset.task);
    });
    list.addEventListener('input', event => {
      const input = event.target;
      if (input.matches('[data-stam-editor]')) adjustStamInputWidth(input);
      if (input.matches('[data-sl-editor="stamina"]')) input.value=String(input.value||'').replace(/[^0-9]/g,'').slice(0,2);
      if (input.matches('[data-sl-editor="orb"]')) { const raw=String(input.value||'').replace(/：/g,':'); let next=''; let digits=0; for(const char of raw){ if(/\d/.test(char) && digits<4){ next+=char; digits+=1; } else if(char===':' && !next.includes(':')) next+=char; } input.value=next; }
    });
    list.addEventListener('focusout', event => {
      const input = event.target;
      if (slEdit && input.matches('[data-sl-editor]')) { commitSLEdit(); return; }
      if (!edit || !input.matches('input')) return;
      const type = input.matches('[data-name-editor]') ? 'name' : input.matches('[data-rank-editor]') ? 'rank' : input.matches('[data-stam-editor]') ? 'stam' : '';
      if (type === edit.type && Number(input.dataset[type + 'Editor']) === edit.index) closeEdit(false);
    });
    list.addEventListener('keydown', event => {
      if (!event.target.matches('input')) return;
      if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); if (slEdit) { slEdit=null; syncAll(); } else closeEdit(true); }
    });
    document.addEventListener('pointerdown', event => {
      if (!selected || event.target.closest('[data-task]') || event.target.closest('[data-compact-check]') || event.target.closest('[data-sl-task]')) return;
      const index = selected.index;
      selected = null;
      syncIndices(index);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; } }
      else syncAll();
    });
  }

  read();
  buildStaticList();
  buildSL();
  setupEvents();
  syncAll();
