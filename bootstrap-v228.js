loadState();
setupDelegatedEvents();
const appRootForTickRecovery = document.querySelector('.wrap');
if (appRootForTickRecovery) appRootForTickRecovery.addEventListener('click', scheduleInteractionTickRecovery);
const gamesRootForPriorityLoad = document.getElementById('gamesAll');
if (gamesRootForPriorityLoad) gamesRootForPriorityLoad.addEventListener('pointerdown', () => scheduleSecondaryGamesBuild(true), { passive: true });
scheduleStartupStabilization();
const startupGraceUntil = Date.now() + 3000;

// ---- 画面復帰時のタイマー同期処理 ----
// 軽量優先版ではvisibilitychangeだけを復帰入口にし、復帰イベントの多重保険は持たない。
let resumeRenderTimer = null;

function resumeTicking(){
  if (document.hidden) return;
  // 復帰直後は予約だけを再接続し、全体描画はブラウザの復帰処理から切り離す。
  scheduleSecondaryGamesBuild();
  startTicking(true);
  if (resumeRenderTimer) clearTimeout(resumeRenderTimer);
  resumeRenderTimer = setTimeout(() => {
    resumeRenderTimer = null;
    if (document.hidden) return;
    render();
  }, 150);
}

function scheduleResetCheck(){
  if (resetCheckTimer) clearTimeout(resetCheckTimer);

  const now = new Date();
  const next = new Date(now);
  next.setHours(1, 0, 1, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const nextGameReset = new Date(now);
  nextGameReset.setHours(5, 0, 1, 0);
  if (nextGameReset <= now) nextGameReset.setDate(nextGameReset.getDate() + 1);
  if (nextGameReset < next) next.setTime(nextGameReset.getTime());

  resetCheckTimer = setTimeout(() => {
    resetCheckTimer = null;
    if (!document.hidden) {
      render();
      startTicking();
    }
    scheduleResetCheck();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Date.now() < startupGraceUntil) return;
    if (resumeRenderTimer) {
      clearTimeout(resumeRenderTimer);
      resumeRenderTimer = null;
    }
  } else {
    resumeTicking();
  }
});

function scheduleServiceWorkerRegistration(){
  if (swRegistrationScheduled) return;
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  swRegistrationScheduled = true;
  const register = async () => {
    try {
      const existing = await navigator.serviceWorker.getRegistration('./');
      // 未登録時だけ登録する。登録済みなら、アプリ側から更新確認を促さない。
      if (!existing) {
        await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      }
    } catch (_) {}
  };

  // 初回登録だけを初期描画後に行い、登録済みPWAの更新確認はブラウザ標準判定へ任せる。
  if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 8000 });
  else setTimeout(register, 2500);
}
