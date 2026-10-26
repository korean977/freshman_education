/* 52s1.src rows 25–52, 87–89. Direct CB commands; TP is a non-retriggerable pulse. */
(function(root){
 'use strict';
 const TIMING=Object.freeze({TP_HSCB:1000});
 function create({read,write,emit=()=>{},wake=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  let position='RUN',location='LOCAL',failCB=false,button=null,lastOutput='',result='idle';
  let pulse=false,previousFault=false,handle=null,last={cbClose:false,cbOpen:false};
  let hscbPermit=false,hscbTrip=true;
  function sampleFault(value){
   const rising=!!value&&!previousFault;previousFault=!!value;
   if(rising&&!pulse){
    pulse=true;emit('timer','52-1 TP_HSCB · 고장 입력 상승으로 1초 펄스 시작 (즉시 동작)');
    handle=setTimer(()=>{handle=null;pulse=false;emit('timer','52-1 TP_HSCB · 1초 펄스 종료');wake();},TIMING.TP_HSCB);
   }
   return pulse;
  }
  function issue(action,{origin=location}={}){
   if(!['close','open'].includes(action))return {ok:false,message:'52-1은 차단기 투입·개방 명령을 사용하세요.'};
   if(origin!==location)return {ok:false,message:`현재 조작 위치는 ${location}입니다.`};
   if(action==='close'&&read('52-1'))return {ok:false,message:'52-1은 이미 투입되어 있습니다.'};
   button=action;result='manual';
   return {ok:true,message:`52-1 ${position} ${location} ${action==='close'?'투입':'개방'} 명령`};
  }
  function evaluate({permit=true,g86x=false,tripTest=false}={}){
   const commands={cbClose:button==='close'&&(position==='TEST'||permit),cbOpen:(button==='open'&&(position==='TEST'||!read('54-1')))||g86x||tripTest};
   let changed=button!==null;
   for(const [key,output] of Object.entries({cbClose:'CB1_52S1_CLOSE',cbOpen:'CB1_52S1_OPEN'}))if(commands[key]&&!last[key]){lastOutput=output;emit('command',`52-1 출력 ${output} ON`);}
   // G86X physical opening is owned by the protection engine, which bypasses failCB.
   if(commands.cbOpen&&!g86x&&read('52-1')&&(tripTest||(!last.cbOpen&&!failCB))){
    write('52-1',false,'CB1_52S1_OPEN');changed=true;
    if(tripTest)emit('trip','52-1 시험 개방 · TRIP_TEST1 → CB1_52S1_OPEN');
   }
   if(commands.cbClose&&!last.cbClose&&!commands.cbOpen&&!g86x&&!failCB&&!read('52-1')){write('52-1',true,'CB1_52S1_CLOSE');changed=true;}
   if(g86x)result='protection';else if(tripTest)result='trip-test';
   else if(button)result=failCB?'no-feedback':button==='close'?'closed':'opened';
   last=commands;button=null;return changed;
  }
  function feedback({uvr1=false}={}){
   hscbPermit=read('52-1')&&!uvr1;hscbTrip=!read('52-1')||uvr1;
   return {hscbPermit,hscbTrip};
  }
  function configure(key,value){
   if(!['position','location','failCB'].includes(key))return {ok:false,message:'52-1에 없는 설정입니다.'};
   if(key==='position'){
    if(!['RUN','TEST'].includes(value))return {ok:false,message:'RUN 또는 TEST를 선택하세요.'};
    if(read('52-1'))return {ok:false,message:'차단기 개방 후 RUN/TEST 위치를 변경하세요.'};
    position=value;
   }
   if(key==='location'){
    if(!['LOCAL','REMOTE'].includes(value))return {ok:false,message:'LOCAL 또는 REMOTE를 선택하세요.'};
    location=value;
   }
   if(key==='failCB')failCB=!!value;
   result='idle';return {ok:true,message:'52-1 연습 설정 변경'};
  }
  function reset(){
   if(handle!==null)clearTimer(handle);handle=null;pulse=false;previousFault=false;
   position='RUN';location='LOCAL';failCB=false;button=null;lastOutput='';result='idle';last={cbClose:false,cbOpen:false};hscbPermit=false;hscbTrip=true;
  }
  function status(){
   return {kind:'direct',source:'52s1.src',cb:'52-1',position,location,busy:false,cx:false,tx:false,failure:{cb:failCB},commands:{...last},lastOutput,openOutput:'CB1_52S1_OPEN',result,
    stage:({idle:'명령 대기',closed:'투입 명령 처리',opened:'개방 명령 처리',protection:'보호 트립','trip-test':'TRIP_TEST1 시험 개방','no-feedback':'명령 출력 · 차단기 응답 없음',manual:'개별 조작 명령 처리'})[result],
    pending:pulse?[{key:'TP_HSCB',label:'HSCB 고장 트립 펄스 1초',ms:TIMING.TP_HSCB}]:[],pulse,hscbPermit,hscbTrip};
  }
  return {issue,evaluate,configure,reset,status,sampleFault,feedback};
 }
 root.S1Sequence={create,TIMING};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.S1Sequence;
})(globalThis);
