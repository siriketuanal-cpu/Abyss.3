(()=>{'use strict';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const snapshot=(timer,at,interval,max)=>{
 const current=clamp(Number(timer?.current??timer?.stamCurrent)||0,0,max);
 const start=Number(timer?.start??timer?.stamStart);
 const running=!!(timer?.running??timer?.stamRunning);
 if(!running||!Number.isFinite(start)||start<=0)return{current,nextIn:null,fullIn:null,fullAt:null,isFull:current>=max,recovered:0};
 const elapsed=Math.max(0,at-start),recovered=Math.floor(elapsed/interval),live=clamp(current+recovered,0,max);
 if(live>=max){const need=Math.max(0,max-current);return{current:max,nextIn:0,fullIn:0,fullAt:start+need*interval,isFull:true,recovered};}
 const nextIn=interval-(elapsed%interval),fullIn=(max-live-1)*interval+nextIn;
 return{current:live,nextIn,fullIn,fullAt:at+fullIn,isFull:false,recovered};
};
const recover=(timer,at,interval,max)=>{const s=snapshot(timer,at,interval,max);if(s.recovered<=0)return{...timer,current:s.current};const nextStart=s.current>=max?null:Number(timer.start)+s.recovered*interval;return{...timer,current:s.current,start:nextStart,running:s.current<max};};
const phase=(timer,at,interval)=>{const start=Number(timer?.start??timer?.stamStart),running=!!(timer?.running??timer?.stamRunning);if(!running||!Number.isFinite(start)||start<=0)return null;return Math.max(0,at-start)%interval;};
const setCurrentPreservePhase=(timer,value,at,interval,max)=>{const p=phase(timer,at,interval),next=clamp(Number(value)||0,0,max);if(next>=max)return{...timer,current:max,start:null,running:false};return{...timer,current:next,start:p===null?at:at-p,running:true};};
const consume40=(timer,at,interval,max)=>{const live=snapshot(timer,at,interval,max),amount=Math.floor(Math.max(0,live.current)/40)*40;if(amount<=0)return{...timer,current:live.current,consumed:0};const p=phase(timer,at,interval);return{...timer,current:Math.max(0,live.current-amount),start:p===null?at:at-p,running:true,consumed:amount};};
const idleSnapshot=(timer,at,cap)=>{const start=Number(timer?.idleStart),running=!!timer?.idleRunning;if(!running||!Number.isFinite(start)||start<=0)return{remaining:null,complete:false,fullAt:null};const remaining=Math.max(0,cap-Math.max(0,at-start));return{remaining,complete:remaining<=0,fullAt:start+cap};};
window.AbysssTimerModel={clamp,snapshot,recover,phase,setCurrentPreservePhase,consume40,idleSnapshot};
})();