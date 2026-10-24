/* Shared command/feedback sequencing engine. Device profiles contain source-specific timings.
 * Mechanical operation is an idealized command-edge response, with optional
 * failed-operation simulation. The PLC's internal holding coils remain visible.
 */
(function(root){
 'use strict';
 function create({profile,read,write,emit=()=>{},wake=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  const {cb,ds,timing:TIMING,undervoltage=false,emitTestDSOpenWhileCBClosed=false,allowTestDSOpenWhileCBClosed=false}=profile;
  const cbSymbol=cb.replace(/-/g,''),dsSymbol=ds.replace(/-/g,'');
  const LABEL={TON_52A:`${cb} 투입 확인 ${TIMING.TON_52A/1000}초`,TON_52B:`${cb} 개방 확인 ${TIMING.TON_52B/1000}초`,TON_89A:`${ds} 투입 확인 ${TIMING.TON_89A/1000}초`,TON_89B:`${ds} 개방 확인 ${TIMING.TON_89B/1000}초`,TON_CX:`투입 명령 제한 ${TIMING.TON_CX/1000}초`,TON_TX:`개방 명령 제한 ${TIMING.TON_TX/1000}초`,TON_27X:'2차 무전압 0.5초',TON_84R1:'84X 접점 해제 2초'};
  let position='RUN',location='LOCAL',cx=false,tx=false,buttons=null,uvr=false,lastResult='idle';
  let lastOutput='';
  let failure={cb:false,ds:false},last={cbClose:false,cbOpen:false,dsClose:false,dsOpen:false};
  const handles=new Map(),ready=new Set();
  function ton(key,enabled){
   if(!enabled){if(handles.has(key))clearTimer(handles.get(key));handles.delete(key);ready.delete(key);return false;}
   if(ready.has(key))return true;
   if(!handles.has(key))handles.set(key,setTimer(()=>{handles.delete(key);ready.add(key);emit('timer',`${cb} ${key} · ${LABEL[key]} 경과`);wake();},TIMING[key]));
   return false;
  }
  function issue(action,{origin=location}={}){
   if(!['close','open','ds-close','ds-open'].includes(action))return {ok:false,message:'알 수 없는 시퀀스 명령입니다.'};
   if(origin!==location)return {ok:false,message:`현재 조작 위치는 ${location}입니다.`};
   if(action.startsWith('ds-')&&position!=='TEST')return {ok:false,message:`RUN 상태의 ${ds}은 ${cb} 투입·개방 시퀀스로 조작하세요.`};
   if(action.startsWith('ds-')&&read(cb)&&!(action==='ds-open'&&emitTestDSOpenWhileCBClosed))return {ok:false,message:`${ds} 조작 전 ${cb} 개방이 필요합니다.`};
   if((action==='close'&&cx)||(action==='open'&&tx))return {ok:false,message:'같은 시퀀스가 진행 중입니다.'};
   if(action==='close'&&read(cb))return {ok:false,message:`${cb}은 이미 투입되어 있습니다.`};
   buttons={action};lastResult=action.startsWith('ds-')?'manual':action==='close'?'closing':'opening';
   return {ok:true,message:`${cb} ${position} ${location} ${action==='close'?'투입':action==='open'?'개방':action==='ds-close'?'단로기 투입':'단로기 개방'} 명령`};
  }
  function evaluate({permit=true,g86x=false,uvr1=false,r1_84x=true}={}){
   const oldCX=cx,oldTX=tx,oldUVR=uvr;
   const a52=ton('TON_52A',read(cb));
   const b52=ton('TON_52B',!read(cb));
   const a89=ton('TON_89A',read(ds));
   const b89=ton('TON_89B',!read(ds));
   const g27x=undervoltage?ton('TON_27X',read(cb)&&uvr1):false;
   // DI31 is a b contact in source row 94: TON enable = NOT R1_84X.
   const b84=undervoltage?ton('TON_84R1',!r1_84x):false;
   uvr=g27x||b84;
   const closeExpired=ton('TON_CX',cx),openExpired=ton('TON_TX',tx);
   if(closeExpired&&cx){lastResult='close-timeout';emit('alarm',`${cb} 투입 시퀀스 ${TIMING.TON_CX/1000}초 제한 · 동작 피드백을 확인하세요`);}
   if(openExpired&&tx){lastResult='open-timeout';emit('alarm',`${cb} 개방 시퀀스 ${TIMING.TON_TX/1000}초 제한 · 동작 피드백을 확인하세요`);}
   const on=buttons?.action==='close',off=buttons?.action==='open';
   // CX/TX self-hold branches are outside the initial RUN/permit command gate.
   cx=!closeExpired&&((position==='RUN'&&permit&&on)||(cx&&!tx&&!a52));
   tx=!openExpired&&((position==='RUN'&&off)||(tx&&!cx&&!b89));
   const manual52Close=position==='TEST'&&on;
   const manual52Open=position==='TEST'&&off;
   const manual89Close=position==='TEST'&&buttons?.action==='ds-close'&&!read(cb);
   const manual89Open=position==='TEST'&&buttons?.action==='ds-open';
   const commands={
    cbClose:manual52Close||(cx&&a89),
    cbOpen:manual52Open||tx||g86x,
    dsClose:manual89Close||(cx&&!read(cb)),
    dsOpen:manual89Open||(tx&&b52)
   };
   for(const [key,output] of Object.entries({cbClose:`CB1_${cbSymbol}_CLOSE`,cbOpen:`CB1_${cbSymbol}_OPEN`,dsClose:`PO02_${dsSymbol}_CLOSE`,dsOpen:`PO01_${dsSymbol}_OPEN`}))if(commands[key]&&!last[key]){lastOutput=output;emit('command',`${cb} 출력 ${output} ON`);}
   let changed=oldCX!==cx||oldTX!==tx||oldUVR!==uvr;
   function act(key,id,target,output,failed){
    if(commands[key]&&!last[key]&&!failed){
     if(id===cb&&target&&(g86x||commands.cbOpen))return;
     if(id===ds&&read(cb)&&!(position==='TEST'&&!target&&allowTestDSOpenWhileCBClosed)){if(emitTestDSOpenWhileCBClosed&&!target)emit('blocked',`${ds} 외부 인터록 · ${cb} 개방 후 단로기를 조작하세요. 개방 출력과 물리 동작은 구분됩니다.`);return;}
     if(read(id)!==target){write(id,target,output);changed=true;}
    }
   }
   // G86X physical opening and trip history are handled by the protection engine.
   if(!g86x)act('cbOpen',cb,false,`CB1_${cbSymbol}_OPEN`,failure.cb);
   act('dsOpen',ds,false,`PO01_${dsSymbol}_OPEN`,failure.ds);
   act('dsClose',ds,true,`PO02_${dsSymbol}_CLOSE`,failure.ds);
   act('cbClose',cb,true,`CB1_${cbSymbol}_CLOSE`,failure.cb);
   last=commands;
   if(g86x)lastResult='protection';
   if(oldCX&&!cx&&lastResult==='closing')lastResult=read(cb)?'closed':'stopped';
   if(oldTX&&!tx&&lastResult==='opening')lastResult=!read(cb)&&!read(ds)?'opened':'stopped';
   if(buttons)changed=true;
   buttons=null;
   return changed;
  }
  function configure(key,value){
   if(!['position','location','failCB','failDS'].includes(key))return {ok:false,message:'알 수 없는 설정입니다.'};
   if(cx||tx)return {ok:false,message:'시퀀스 종료 후 설정을 변경하세요.'};
   if(key==='position'){
    if(!['RUN','TEST'].includes(value))return {ok:false,message:'RUN 또는 TEST를 선택하세요.'};
    if(read(cb))return {ok:false,message:'차단기 개방 후 RUN/TEST 위치를 변경하세요.'};
    position=value;
   }
   if(key==='location'){
    if(!['LOCAL','REMOTE'].includes(value))return {ok:false,message:'LOCAL 또는 REMOTE를 선택하세요.'};
    location=value;
   }
   if(key==='failCB')failure.cb=!!value;
   if(key==='failDS')failure.ds=!!value;
   lastResult='idle';return {ok:true,message:`${cb} 연습 설정 변경`};
  }
  function reset(){
   for(const h of handles.values())clearTimer(h);handles.clear();ready.clear();
   position='RUN';location='LOCAL';cx=false;tx=false;buttons=null;uvr=false;lastResult='idle';lastOutput='';failure={cb:false,ds:false};last={cbClose:false,cbOpen:false,dsClose:false,dsOpen:false};
  }
  function status(){
   const protectedState=last.cbOpen&&lastResult==='protection';
   let stage='명령 대기';
   if(cx)stage=protectedState?'G86X 개방 우선 · 투입 명령 유지 중':!read(ds)?`${ds} 투입 피드백 대기`:!ready.has('TON_89A')?`${ds} 투입 확인 ${TIMING.TON_89A/1000}초`:!read(cb)?`${cb} 투입 피드백 대기`:`${cb} 투입 확인 ${TIMING.TON_52A/1000}초`;
   else if(tx)stage=read(cb)?`${cb} 개방 피드백 대기`:!ready.has('TON_52B')?`${cb} 개방 확인 ${TIMING.TON_52B/1000}초`:read(ds)?`${ds} 개방 피드백 대기`:`${ds} 개방 확인 ${TIMING.TON_89B/1000}초`;
   else stage=({closed:'투입 시퀀스 완료',opened:'개방 시퀀스 완료','close-timeout':'투입 시퀀스 시간 초과','open-timeout':'개방 시퀀스 시간 초과',protection:'보호 트립',manual:'TEST 개별 조작 명령 처리',stopped:'시퀀스 종료',closing:'투입 명령 종료',opening:'개방 명령 종료'})[lastResult]||'명령 대기';
   return {cb,ds,allowTestDSOpenWhileCBClosed,timing:{...TIMING},lastOutput,position,location,failure:{...failure},busy:cx||tx,cx,tx,uvr,stage,result:lastResult,commands:{...last},pending:[...handles.keys()].map(key=>({key,label:LABEL[key],ms:TIMING[key]})),ready:[...ready]};
  }
  return {issue,evaluate,configure,reset,status,getUVR:()=>uvr};
 }
 root.BreakerSequence={create};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.BreakerSequence;
})(globalThis);
