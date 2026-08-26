export function renderV2OnlyGate() {
  const today = document.getElementById('today');
  const complete = document.getElementById('daily-complete');
  const list = document.getElementById('list');
  const starleap = document.getElementById('starleap');
  const date = new Date();
  if (today) today.textContent = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  if (complete) complete.hidden = true;
  if (list) list.innerHTML = '<section class="pure-v2-gate" aria-live="polite"><strong>v2専用候補</strong><span>有効なv2保存がないため起動していません。</span></section>';
  if (starleap) starleap.textContent = '';
}
