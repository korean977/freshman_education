/* 52r1.src: networks 11–25 and 33–35. Time values are source TON presets.
 * Mechanical operation is an idealized command-edge response, with optional
 * failed-operation simulation. The PLC's internal holding coils remain visible.
 */
(function(root){
 'use strict';
 const TIMING=Object.freeze({TON_52A:3000,TON_52B:1000,TON_89A:1000,TON_89B:7000,TON_CX:10000,TON_TX:10000,TON_27X:500,TON_84R1:2000});
 const LABEL={TON_52A:'52-R1 투입 확인 3초',TON_52B:'52-R1 개방 확인 1초',TON_89A:'89-R1 투입 확인 1초',TON_89B:'89-R1 개방 확인 7초',TON_CX:'투입 명령 제한 10초',TON_TX:'개방 명령 제한 10초',TON_27X:'2차 무전압 0.5초',TON_84R1:'84X 접점 해제 2초'};
 function create({read,write,emit=()=>{},wake=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  let position='RUN',location='LOCAL',cx=false,tx=false,buttons=null,uvr=false,lastResult='idle';
  let failure={cb:false,ds:false},last={cbClose:false,cbOpen:false,dsClose:false,dsOpen:false};
  const handles=new Map(),ready=new Set();
  function ton(key,enabled){
   if(!enabled){if(handles.has(key))clearTimer(handles.get(key));handles.delete(key);ready.delete(key);return false;}
   if(ready.has(key))return true;
   if(!handles.has(key))handles.set(key,setTimer(()=>{handles.delete(key);ready.add(key);emit('timer',`52-R1 ${key} · ${LABEL[key]} 경과`);wake();},TIMING[key]));
   return false;
  }
  function issue(action,{origin=location}={}){
   if(!['close','open','ds-close','ds-open'].includes(action))return {ok:false,message:'알 수 없는 시퀀스 명령입니다.'};
   if(origin!==location)return {ok:false,message:`현재 조작 위치는 ${location}입니다.`};
   if(action.startsWith('ds-')&&position!=='TEST')return {ok:false,message:'RUN 상태의 89-R1은 52-R1 투입·개방 시퀀스로 조작하세요.'};
   if(action.startsWith('ds-')&&read('52-R1'))return {ok:false,message:'89-R1 조작 전 52-R1 개방이 필요합니다.'};
   if((action==='close'&&cx)||(action==='open'&&tx))return {ok:false,message:'같은 시퀀스가 진행 중입니다.'};
   if(action==='close'&&read('52-R1'))return {ok:false,message:'52-R1은 이미 투입되어 있습니다.'};
   buttons={action};lastResult=action.startsWith('ds-')?'manual':action==='close'?'closing':'opening';
   return {ok:true,message:`52-R1 ${position} ${location} ${action==='close'?'투입':action==='open'?'개방':action==='ds-close'?'단로기 투입':'단로기 개방'} 명령`};
  }
  function evaluate({permit=true,g86x=false,uvr1=false,r1_84x=true}={}){
   const oldCX=cx,oldTX=tx,oldUVR=uvr;
   const a52=ton('TON_52A',read('52-R1'));
   const b52=ton('TON_52B',!read('52-R1'));
   const a89=ton('TON_89A',read('89-R1'));
   const b89=ton('TON_89B',!read('89-R1'));
   const g27x=ton('TON_27X',read('52-R1')&&uvr1);
   // DI31 is a b contact in source row 94: TON enable = NOT R1_84X.
   const b84=ton('TON_84R1',!r1_84x);
   uvr=g27x||b84;
   const closeExpired=ton('TON_CX',cx),openExpired=ton('TON_TX',tx);
   if(closeExpired&&cx){lastResult='close-timeout';emit('alarm','52-R1 투입 시퀀스 10초 제한 · 동작 피드백을 확인하세요');}
   if(openExpired&&tx){lastResult='open-timeout';emit('alarm','52-R1 개방 시퀀스 10초 제한 · 동작 피드백을 확인하세요');}
   const on=buttons?.action==='close',off=buttons?.action==='open';
   // CX/TX self-hold branches are outside the initial RUN/permit command gate.
   cx=!closeExpired&&((position==='RUN'&&permit&&on)||(cx&&!tx&&!a52));
   tx=!openExpired&&((position==='RUN'&&off)||(tx&&!cx&&!b89));
   const manual52Close=position==='TEST'&&on;
   const manual52Open=position==='TEST'&&off;
   const manual89Close=position==='TEST'&&buttons?.action==='ds-close'&&!read('52-R1');
   const manual89Open=position==='TEST'&&buttons?.action==='ds-open';
   const commands={
    cbClose:manual52Close||(cx&&a89),
    cbOpen:manual52Open||tx||g86x,
    dsClose:manual89Close||(cx&&!read('52-R1')),
    dsOpen:manual89Open||(tx&&b52)
   };
   let changed=oldCX!==cx||oldTX!==tx||oldUVR!==uvr;
   function act(key,id,target,output,failed){
    if(commands[key]&&!last[key]&&!failed){
     if(id==='52-R1'&&target&&(g86x||commands.cbOpen))return;
     if(id==='89-R1'&&read('52-R1'))return;
     if(read(id)!==target){write(id,target,output);changed=true;}
    }
   }
   // G86X physical opening and trip history are handled by the protection engine.
   if(!g86x)act('cbOpen','52-R1',false,'CB1_52R1_OPEN',failure.cb);
   act('dsOpen','89-R1',false,'PO01_89R1_OPEN',failure.ds);
   act('dsClose','89-R1',true,'PO02_89R1_CLOSE',failure.ds);
   act('cbClose','52-R1',true,'CB1_52R1_CLOSE',failure.cb);
   last=commands;
   if(g86x)lastResult='protection';
   if(oldCX&&!cx&&lastResult==='closing')lastResult=read('52-R1')?'closed':'stopped';
   if(oldTX&&!tx&&lastResult==='opening')lastResult=!read('52-R1')&&!read('89-R1')?'opened':'stopped';
   if(buttons)changed=true;
   buttons=null;
   return changed;
  }
  function configure(key,value){
   if(!['position','location','failCB','failDS'].includes(key))return {ok:false,message:'알 수 없는 설정입니다.'};
   if(cx||tx)return {ok:false,message:'시퀀스 종료 후 설정을 변경하세요.'};
   if(key==='position'){
    if(!['RUN','TEST'].includes(value))return {ok:false,message:'RUN 또는 TEST를 선택하세요.'};
    if(read('52-R1'))return {ok:false,message:'차단기 개방 후 RUN/TEST 위치를 변경하세요.'};
    position=value;
   }
   if(key==='location'){
    if(!['LOCAL','REMOTE'].includes(value))return {ok:false,message:'LOCAL 또는 REMOTE를 선택하세요.'};
    location=value;
   }
   if(key==='failCB')failure.cb=!!value;
   if(key==='failDS')failure.ds=!!value;
   lastResult='idle';return {ok:true,message:'52-R1 연습 설정 변경'};
  }
  function reset(){
   for(const h of handles.values())clearTimer(h);handles.clear();ready.clear();
   position='RUN';location='LOCAL';cx=false;tx=false;buttons=null;uvr=false;lastResult='idle';failure={cb:false,ds:false};last={cbClose:false,cbOpen:false,dsClose:false,dsOpen:false};
  }
  function status(){
   const protectedState=last.cbOpen&&lastResult==='protection';
   let stage='명령 대기';
   if(cx)stage=protectedState?'G86X 개방 우선 · 투입 명령 유지 중':!read('89-R1')?'89-R1 투입 피드백 대기':!ready.has('TON_89A')?'89-R1 투입 확인 1초':!read('52-R1')?'52-R1 투입 피드백 대기':'52-R1 투입 확인 3초';
   else if(tx)stage=read('52-R1')?'52-R1 개방 피드백 대기':!ready.has('TON_52B')?'52-R1 개방 확인 1초':read('89-R1')?'89-R1 개방 피드백 대기':'89-R1 개방 확인 7초';
   else stage=({closed:'투입 시퀀스 완료',opened:'개방 시퀀스 완료','close-timeout':'투입 시퀀스 시간 초과','open-timeout':'개방 시퀀스 시간 초과',protection:'보호 트립',manual:'TEST 수동 조작 완료',stopped:'시퀀스 종료',closing:'투입 명령 종료',opening:'개방 명령 종료'})[lastResult]||'명령 대기';
   return {position,location,failure:{...failure},busy:cx||tx,cx,tx,uvr,stage,result:lastResult,commands:{...last},pending:[...handles.keys()].map(key=>({key,label:LABEL[key],ms:TIMING[key]})),ready:[...ready]};
  }
  return {issue,evaluate,configure,reset,status,getUVR:()=>uvr};
 }
 root.R1Sequence={create,TIMING};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.R1Sequence;
})(globalThis);
