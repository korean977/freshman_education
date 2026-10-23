/* AC sequence training. Drawing names and unresolved paths: docs/ac-sequence-review.md.
 * Inputs represent contacts that have ALREADY operated, not measured fault magnitudes.
 * Only RUN operation is modeled. Do not infer relay settings from contact drawings.
 */
(function (root) {
 'use strict';
 const input=(key,label,effect='trip',held=false)=>({key,label,effect,held});
 const gcbInputs=[input('OCR50','OCR 50 · 순시 과전류'),input('OCR51','OCR 51 · 한시 과전류'),input('OCGR50','OCGR 50 · 순시 지락 과전류'),input('OCGR51','OCGR 51 · 한시 지락 과전류')];
 const gas=[input('GAS1','63G1 · 가스압력 1단계 저하','indication'),input('GAS2','63G2 · 가스압력 2단계 저하','trip',true)];
 const defs={
  '52-R1':{source:'52r1.src · G86X(구간 26) / 개방 출력(구간 16)',relay:'G86X',trip:true,
   note:'52r1.src의 G86X → CB1_52R1_OPEN 경로를 적용합니다. OCR50/51, OCGR50/51, OVR, UVR, 가스압력 2단계 표시기억이 트립 원인입니다. 29X는 경보만 발생합니다. 84X 입력은 외부 접점의 수동 모의입니다.',
   inputs:[...gcbInputs,input('OVR','OVR · 과전압'),input('UVR','UVR · 내부 동작 신호'),input('FIRE','29X · 화재 신호','indication'),...gas,input('PTX','PTX · PT 퓨즈 이상','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[input('R2_84X','52-R2의 84X 입력','external'),input('R3_84X','52-R3의 84X 입력','external')]},
  '52-D1':{source:'752-52D1 GCB1~3.pdf',relay:'G86X',trip:true,
   note:'52-DB1 개방 및 G86X 비동작 시 투입 허가. 26TP와 52-DB1 FAULT는 표시 경로만 확인되어 자동 트립에 추가하지 않았습니다.',
   inputs:[...gcbInputs,input('87T','87T · 변압기 차동','trip',true),input('FIRE','29X · 화재 신호','trip',true),...gas,input('TR26AL','26AL · DTR1 온도 경보','indication'),input('TR26TP','26TP · DTR1 온도 신호 (트립 경로 확인 필요)','pending'),input('DB1_FAULT','52-DB1 FAULT 입력 (표시 경로)','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')]},
  '52-DB1':{source:'752-52DB1 VCB1~3.pdf',relay:'86X',trip:true,
   note:'52-D1 FAULT 수신 시 트립합니다. 52-HT 개방인 직접 투입 허가 경로를 적용했습니다. HT 투입 중 우측 병렬 분기는 접점 표기·연결 확인 전까지 투입을 보류합니다. 64T는 표시 경로만 적용합니다.',
   inputs:[input('OCR50','OCR 50 · 순시 과전류'),input('OCR51','OCR 51 · 한시 과전류'),input('UVR1','UVR1 · 부족전압 (투입 중 0.5초)','delayed'),input('D1_FAULT','52-D1 FAULT 입력'),input('64T','64T · OVGR 신호 (트립 경로 확인 필요)','pending'),input('EXTINGUISHER','29AL · 소화기 경보','indication')]},
  '52-H1':{source:'752-52H1 VCB1~3.pdf',relay:'86X',trip:true,
   note:'89-H1 투입, DB_27TX·UVR1·86X 비동작 시 투입 허가. 89-H1은 52-H1 개방 중에만 조작합니다. UVR1 단독은 투입 억제이며, DB_27TX는 트립 입력입니다.',
   inputs:[input('OCR50','OCR 50 · 순시 과전류'),input('OCR51','OCR 51 · 한시 과전류'),input('SGR','SGR · 선택 지락','trip',true),input('DB_27TX','DB_27TX 입력 (DB1에서도 연동)'),input('UVR1','UVR1 · 2차 무전압','inhibit'),input('EXTINGUISHER','29AL · 소화기 경보','indication')]},
  '52-1':{source:'752-52S1 GCB1~3.pdf (기기명 52-1)',relay:'G86X',trip:true,
   note:'파일명 52S1은 도면 본문의 52-1에 연결했습니다. NEG 단로기 입력은 화면 밖 외부 접점입니다. DI35의 HSCB_A/B 표기가 달라 54-1 투입 중 재투입은 보류합니다. 54-1 조작은 확인된 AC 연동만 적용합니다.',
   inputs:[...gcbInputs,input('UVR1','UVR1 · 부족전압'),input('TR26TP','TR26TP · SRTR1 온도 트립'),input('REC26TP','REC26TP · REC1 온도 트립'),input('REC_FAULT','REC_FAULT · 정류기 고장'),input('HSCB_FAULT','HSCB_FAULT · 54-1 고장 (1초)','delayed'),input('FIRE','29X · 화재 신호'),...gas,input('TR26AL','TR26AL · SRTR1 온도 경보','indication'),input('REC26AL','REC26AL · REC1 온도 경보','indication'),input('REC_TEMP_AL','REC_TEMP_AL · 정류기 온도 경보','indication'),input('REC_DIODE_AL','REC_DIODE_AL · 다이오드 경보','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[{...input('NEG_A','89-N1 NEG 단로기 투입 접점','external'),initial:true}]},
  '52-HT':{source:'752-52HT VCB.pdf + 752-52DB1 VCB1.pdf',relay:null,trip:false,
   note:'52-DB1반의 CX2 PERMIT: 52-DB1 또는 52-DB2 중 적어도 하나가 개방되어야 투입 가능합니다. HT 자체 보호요소는 제공 도면에 없습니다.',inputs:[]}
 };
 function create({devices,onEvent=()=>{},onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  const states=new Map(), timers=new Map(), ready=new Set(), previous=new Map();
  for(const [id,def] of Object.entries(defs))states.set(id,{inputs:Object.fromEntries([...def.inputs,...(def.external||[])].map(d=>[d.key,!!d.initial])),flags:new Set()});
  const closed=id=>!!devices.get(id)?.closed;
  const emit=(id,kind,message)=>onEvent({id,kind,message});
  const st=id=>states.get(id);
  const raw=(id,key)=>!!st(id)?.inputs[key];
  const signal=(id,key)=>raw(id,key)||(defs[id].inputs.find(d=>d.key===key)?.held&&st(id).flags.has(key));
  function delay(key,enabled,ms){
   if(!enabled){if(timers.has(key))clearTimer(timers.get(key));timers.delete(key);ready.delete(key);return false;}
   if(ready.has(key))return true;
   if(!timers.has(key))timers.set(key,setTimer(()=>{
    timers.delete(key);ready.add(key);
    emit(key.startsWith('DB1')?'52-DB1':'52-1','timer',key.startsWith('DB1')?'52-DB1 27T · 0.5초 경과':'52-1 TP_HSCB · 1초 경과');
    process();
   },ms));
   return false;
  }
  function outputs(){
   const values={};
   for(const [id,def] of Object.entries(defs))values[id]=def.inputs.filter(d=>d.effect==='trip'&&signal(id,d.key)).map(d=>d.key);
   const db27=delay('DB1-27T',closed('52-DB1')&&raw('52-DB1','UVR1'),500);
   const hscb=delay('S1-HSCB',raw('52-1','HSCB_FAULT'),1000);
   if(hscb)values['52-1'].push('TP_HSCB_86X');
   if(db27)values['52-DB1'].push('27TX');
   // D1 FAULT is the protection OR, not every D1 alarm. No reverse-trip loop.
   if(values['52-D1'].length)values['52-DB1'].push('52D1_FAULT');
   if(db27)values['52-H1'].push('DB_27TX (52-DB1)');
   return {values,db27,db1fault:raw('52-DB1','OCR50')||raw('52-DB1','OCR51')};
  }
  function process(){
   // Compute each stage before opening devices, so one 27TX pulse reaches both DB1 and H1.
   for(let pass=0;pass<4;pass++){
    const {values,db1fault}=outputs();let changed=false;
    if(db1fault&&!st('52-D1').flags.has('52DB1_FAULT (수신)')){
     st('52-D1').flags.add('52DB1_FAULT (수신)');
     emit('52-D1','alarm','52-D1 · 52DB1_FAULT 수신 (표시만, 역방향 트립 없음)');
    }
    for(const [id,causes] of Object.entries(values)){
     if(causes.length){
      st(id).flags.add(defs[id].relay);
      for(const cause of causes)st(id).flags.add(cause);
      if(!previous.get(id))emit(id,'relay',`${id} ${defs[id].relay} 동작 · ${causes.join(', ')}${defs[id].trip?'':' · 자동 트립 없음'}`);
      if(defs[id].trip&&closed(id)){
       devices.get(id).closed=false;changed=true;
       emit(id,'trip',`${id} 보호 트립 · ${defs[id].relay}${id==='52-R1'?' → CB1_52R1_OPEN':''}`);
      }
     }
     previous.set(id,causes.length>0);
    }
    if(closed('54-1')&&(!closed('52-1')||raw('52-1','UVR1'))){
     devices.get('54-1').closed=false;changed=true;
     emit('54-1','trip','54-1 개방 · 52-1 HSCB_TX 연동');
    }
    if(!changed)break;
   }
   onChange();
  }
  const check=(ok,text,reference)=>({ok:!!ok,text,reference});
  function checks(id,closing=!closed(id)){
   const active=outputs().values;
   if(['89-R1','89-H1'].includes(id)){
    const cb=id==='89-R1'?'52-R1':'52-H1';
    return [check(!closed(cb),`${cb} 개방 필요`,id==='89-R1'?'52R1 GCB1 · DP1 01, GCB4':'52H1 VCB1 · RX05/RX06, VCB3')];
   }
   if(id==='54-1')return closing?[check(closed('52-1'),'52-1 투입 필요','52S1 GCB1 · HSCB CX PERMIT'),check(!raw('52-1','UVR1'),'52-1 UVR1 비동작 필요','52S1 GCB1 · HSCB CX PERMIT')]:[];
   if(!defs[id])return [];
   if(!closing){
    if(id==='52-D1')return [check(!closed('52-DB1'),'52-DB1을 먼저 개방하세요','52D1 GCB1 · TX / DI23 b접점')];
    if(id==='52-1')return [check(!closed('54-1'),'54-1을 먼저 개방하세요','52S1 GCB1 · TX / DI36 HSCB_B')];
    return [];
   }
   const result=[];
   if(defs[id].relay)result.push(check(!active[id].length,`${defs[id].relay} 비동작 필요`,defs[id].source));
   if(id==='52-R1')result.push(
    check(!closed('52-R2')||!raw(id,'R2_84X'),'52-R2 개방 또는 R2 84X 비동작 필요','52R1 GCB1 · CX PERMIT / DI21·DI22'),
    check(!closed('52-R3')||!raw(id,'R3_84X'),'52-R3 개방 또는 R3 84X 비동작 필요','52R1 GCB1 · CX PERMIT / DI23·DI24'));
   if(id==='52-D1')result.push(check(!closed('52-DB1'),'52-DB1 개방 필요','52D1 GCB1 · CX PERMIT / DI23 b접점'));
   if(id==='52-DB1')result.push(check(closed('52-D1'),'52-D1 투입 필요','52DB1 VCB1 · CX1 PERMIT / DI21'),check(!closed('52-HT'),'52-HT 개방 경로 사용 · 투입 중 분기는 도면 확인 필요','52DB1 VCB1 · CX1 PERMIT / DI03'));
   if(id==='52-HT')result.push(check(!closed('52-DB1')||!closed('52-DB2'),'52-DB1 또는 52-DB2 중 하나 이상 개방 필요','52DB1 VCB1 · CX2 PERMIT / DI01·DI13 b접점 병렬'));
   if(id==='52-H1')result.push(check(closed('89-H1'),'89-H1 투입 필요','52H1 VCB1 · CX PERMIT / DI03'),check(!raw(id,'DB_27TX'),'DB_27TX 비동작 필요','52H1 VCB1 · DI11'),check(!raw(id,'UVR1'),'UVR1 비동작 필요','52H1 VCB1 · CX PERMIT'));
   if(id==='52-1')result.push(check(raw(id,'NEG_A'),'외부 89-N1 투입 접점 필요','52S1 GCB1 · CX PERMIT / DI31'),check(!closed('54-1'),'54-1 개방 경로 사용 · DI35의 A/B 표기 확인 필요','52S1 GCB1 · CX PERMIT / DI35'));
   return result;
  }
  function request(id){
   if(!devices.has(id))return {ok:false,message:'등록되지 않은 설비입니다.'};
   const reasons=checks(id).filter(c=>!c.ok);
   if(reasons.length){const message=`${id} 조작 차단 · ${reasons.map(c=>c.text).join(' / ')}`;emit(id,'blocked',message);onChange();return {ok:false,message};}
   const d=devices.get(id);d.closed=!d.closed;
   const message=`${id} ${d.closed?'투입':'개방'}`;
   emit(id,'operation',message);process();return {ok:true,message};
  }
  function setInput(id,key,value){
   const def=defs[id],state=st(id);
   const spec=[...(def?.inputs||[]),...(def?.external||[])].find(d=>d.key===key);
   if(!spec)throw new Error('Unknown AC input: '+id+'/'+key);
   const enabled=!!value;if(state.inputs[key]===enabled)return;
   state.inputs[key]=enabled;
   if(enabled&&spec.effect!=='external')state.flags.add(key);
   emit(id,'input',`${id} ${key} ${enabled?'동작':'해제'}`);process();
  }
  function resetIndicators(id){
   if(!defs[id])return {ok:false,message:'보호 모의 대상이 아닙니다.'};
   // Held contacts can be reset after their originating inputs are removed.
   const nonHeld=defs[id].inputs.some(d=>raw(id,d.key));
   const derivedActive=(id==='52-D1'&&outputs().db1fault)||(id==='52-DB1'&&outputs().values['52-D1'].length)||(id==='52-H1'&&outputs().db27);
   if(nonHeld||derivedActive){const message=`${id} 복귀 불가 · 동작 중인 원인 신호를 먼저 해제하세요`;emit(id,'blocked',message);onChange();return {ok:false,message};}
   st(id).flags.clear();emit(id,'reset',`${id} 표시기억 복귀`);process();return {ok:true,message:`${id} 표시기억을 복귀했습니다.`};
  }
  function reset(){
   for(const handle of timers.values())clearTimer(handle);
   timers.clear();ready.clear();previous.clear();
   for(const [id,def] of Object.entries(defs)){const state=st(id);state.flags.clear();state.inputs=Object.fromEntries([...def.inputs,...(def.external||[])].map(d=>[d.key,!!d.initial]));}
   onChange();
  }
  function status(id){
   const def=defs[id];if(!def)return {supported:false,checks:checks(id)};
   const out=outputs();
   const received=[];
   if(id==='52-D1'&&out.db1fault)received.push('52DB1_FAULT 수신 · 표시만');
   if(id==='52-DB1'&&out.values['52-D1'].length)received.push('52D1_FAULT 수신 · 트립 입력');
   if(id==='52-H1'&&out.db27)received.push('DB_27TX 수신 · 트립 입력');
   return {supported:true,def,received,inputs:{...st(id).inputs},flags:[...st(id).flags],active:out.values[id],checks:checks(id),pending:[...timers.keys()].filter(k=>id==='52-DB1'?k==='DB1-27T':id==='52-1'?k==='S1-HSCB':false)};
  }
  return {request,setInput,resetIndicators,reset,status,checks,definitions:defs};
 }
 root.ACProtection={create,definitions:defs};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ACProtection;
})(globalThis);
