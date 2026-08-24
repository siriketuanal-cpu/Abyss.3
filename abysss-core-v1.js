(()=>{'use strict';
const m=window.AbysssTimerModel;
if(!m)throw new Error('AbysssTimerModel is required');
window.AbysssCore={clamp:m.clamp,snapshot:m.snapshot,recover:m.recover,phase:m.phase,setCurrentPreservePhase:m.setCurrentPreservePhase,consume40:m.consume40,idleSnapshot:m.idleSnapshot};
})();