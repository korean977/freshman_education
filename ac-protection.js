/* AC sequence training. Drawing names and unresolved paths: docs/ac-sequence-review.md.
 * Inputs represent contacts that have ALREADY operated, not measured fault magnitudes.
 * R1/R2/R3/S1 use reviewed controllers; remaining panels execute exported source networks.
 * Do not infer relay settings from contact drawings.
 */
(function (root) {
 'use strict';
 const R1=typeof module!=='undefined'&&module.exports?require('./r1-sequence.js'):root.R1Sequence;
 const R2=typeof module!=='undefined'&&module.exports?require('./r2-sequence.js'):root.R2Sequence;
 const R3=typeof module!=='undefined'&&module.exports?require('./r3-sequence.js'):root.R3Sequence;
 const S1=typeof module!=='undefined'&&module.exports?require('./s1-sequence.js'):root.S1Sequence;
 const Station=typeof module!=='undefined'&&module.exports?require('./station-sequence.js'):root.StationSequence;
 const Network=typeof module!=='undefined'&&module.exports?require('./power-network.js'):root.PowerNetwork;
 const input=(key,label,effect='trip',held=false)=>({key,label,effect,held});
 const gcbInputs=[input('OCR50','OCR 50 · 순시 과전류'),input('OCR51','OCR 51 · 한시 과전류'),input('OCGR50','OCGR 50 · 순시 지락 과전류'),input('OCGR51','OCGR 51 · 한시 지락 과전류')];
 const gas=[input('GAS1','63G1 · 가스압력 1단계 저하','indication'),input('GAS2','63G2 · 가스압력 2단계 저하','trip',true)];
 const defs={
  '52-R1':{source:'52r1.src · RUN/TEST 시퀀스·G86X 보호 출력',relay:'G86X',trip:true,
   note:'RUN 투입은 89-R1 → 1초 확인 → 52-R1 → 3초 확인, 개방은 52-R1 → 1초 확인 → 89-R1 → 7초 확인 순서입니다. 명령 제한은 각 10초입니다. TEST에서는 개별 조작하며 주회로에 연결하지 않습니다. 차단기 투입 중에도 단로기 개방이 가능하며, 단로기 투입은 차단기 개방 후 가능합니다. G86X는 위치와 관계없이 트립을 우선합니다. 29X는 경보만 발생합니다.',
   inputs:[...gcbInputs,input('OVR','OVR · 과전압'),input('UVR','UVR · 내부 동작 신호'),input('FIRE','29X · 화재 신호','indication'),...gas,input('PTX','PTX · PT 퓨즈 이상','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[{...input('R2_84X','52-R2 84 · 89-R2 1차측 전압 (자동)','voltage'),readOnly:true},{...input('R3_84X','52-R3 84 · 89-R3 1차측 전압 (자동)','voltage'),readOnly:true},input('UVR1','UVR1 · 2차 무전압 입력 (0.5초)','external'),{...input('R1_84X','52-R1 84X 정상 접점 (해제 시 2초)','external'),initial:true}]},
  '52-R2':{source:'52r2.src · CX_PERMIT(구간 19) / RUN·TEST / G86X(구간 26)',relay:'G86X',trip:true,
   note:'84는 89-R2 1차측 전압을 감지합니다. 온수 측 공급으로 항상 가압·동작 상태입니다. R2 소스: 투입 명령 제한 8초, 개방 제한 10초. 89-R2 투입 1초 후 52-R2 투입, 차단기 투입 확인 3초입니다. 개방은 차단기 개방 1초 후 단로기 개방, 단로기 개방 확인 7초입니다. UVR1은 경보만이며 트립하지 않습니다. TEST에서는 차단기 투입 중에도 89-R2 개방이 가능합니다. 단로기 투입은 차단기 개방 상태에서만 허용합니다.',
   inputs:[...gcbInputs,input('OVR','OVR · 과전압'),...gas,input('UVR1','UVR1 · 무전압 표시·경보 (트립 없음)','indication'),input('PTX','PTX · PT 퓨즈 이상','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[{...input('R2_84X','52-R2 84 · 89-R2 1차측 전압 (자동)','voltage'),readOnly:true},{...input('R3_84X','52-R3 84 · 89-R3 1차측 전압 (자동)','voltage'),readOnly:true}]},
  '52-R3':{source:'52r3.src · CX_PERMIT(구간 19) / RUN·TEST / G86X(구간 26)',relay:'G86X',trip:true,
   note:'84는 89-R3 1차측 전압을 감지하며 그 지점이 무가압이면 비동작합니다. R3 소스: 투입 명령 제한 8초, 개방 제한 10초. 89-R3 투입 1초 후 52-R3 투입, 차단기 투입 확인 3초입니다. 개방은 차단기 개방 1초 후 단로기 개방, 단로기 개방 확인 7초입니다. UVR1은 경보만이며 트립하지 않습니다. TEST에서는 차단기 투입 중에도 89-R3 개방이 가능합니다. 단로기 투입은 차단기 개방 상태에서만 허용합니다. RUN 개방은 차단기부터 개방합니다.',
   inputs:[...gcbInputs,input('OVR','OVR · 과전압'),...gas,input('UVR1','UVR1 · 무전압 표시·경보 (트립 없음)','indication'),input('PTX','PTX · PT 퓨즈 이상','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[{...input('R3_84X','52-R3 84 · 89-R3 1차측 전압 (자동)','voltage'),readOnly:true},{...input('R2_84X','52-R2 84 · 89-R2 1차측 전압 (자동)','voltage'),readOnly:true}]},
  '52-1':{source:'52s1.src · RUN/TEST 직접 조작 / G86X / HSCB 연동',relay:'G86X',trip:true,
   note:'RUN 투입은 NEG 단로기 투입·54-1 개방·G86X 비동작이 필요하며 수동 개방도 54-1 개방이 필요합니다. TEST는 개별 조작이며 주회로에서 분리됩니다. 보호·TRIP_TEST1은 수동 개방 조건을 우회합니다. HSCB 고장 입력은 즉시 시작하는 1초 TP 펄스로 트립합니다. OVR·29AL은 G86X 보호 OR에 없습니다.',
   inputs:[...gcbInputs,input('UVR1','UVR1 · 부족전압'),input('TR26TP','TR26TP · SRTR1 온도 트립'),input('REC26TP','REC26TP · REC1 온도 트립'),input('REC_FAULT','REC_FAULT · 정류기 고장'),input('HSCB_FAULT','HSCB_FAULT · 즉시 1초 트립 펄스','pulse'),...gas,input('OVR','OVR · 과전압 (G86X 연동 없음)','indication'),input('TR26AL','26AL · SRTR1 온도 경보','indication'),input('REC26AL','REC26AL · REC1 온도 경보','indication'),input('REC_TEMP_AL','REC_TEMP_AL · 정류기 온도 경보','indication'),input('REC_DIODE_AL','REC_DIODE_AL · 다이오드 경보','indication'),input('EXTINGUISHER','29AL · 소화기 경보','indication')],
   external:[{...input('NEG_A','89-N1 NEG 단로기 투입 접점','external'),initial:true},input('TRIP_TEST','TRIP_TEST1 · 차단기 시험 개방','triptest')]},
 };
 Object.assign(defs,Station.definitions);
 function create({devices,onEvent=()=>{},onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  const states=new Map(), previous=new Map();
  let sources=Object.fromEntries(Network.SOURCES.map(source=>[source.id,source.initial]));
  for(const [id,def] of Object.entries(defs))states.set(id,{inputs:Object.fromEntries([...def.inputs,...(def.external||[])].map(d=>[d.key,!!d.initial])),flags:new Set()});
  const closed=id=>!!devices.get(id)?.closed;
  const emit=(id,kind,message)=>onEvent({id,kind,message});
  const st=id=>states.get(id);
  const raw=(id,key)=>!!st(id)?.inputs[key];
  const signal=(id,key)=>raw(id,key)||(defs[id].inputs.find(d=>d.key===key)?.held&&st(id).flags.has(key));
  const makeSequence=(id,profile)=>profile.create({read:closed,write:(target,value,output)=>{
   devices.get(target).closed=value;emit(target,'operation',`${target} ${value?'투입':'개방'} · 시퀀스 ${output}`);
  },emit:(kind,message)=>emit(id,kind,message),wake:process,setTimer,clearTimer});
  const r1=makeSequence('52-R1',R1),r2=makeSequence('52-R2',R2),r3=makeSequence('52-R3',R3),s1=makeSequence('52-1',S1);
  const sequences={'52-R1':r1,'52-R2':r2,'52-R3':r3,'52-1':s1};
  const dsController={'89-R1':'52-R1','89-R2':'52-R2','89-R3':'52-R3'};
  const station=Station.create({devices,emit,wake:process,readR1UVR:()=>r1.getUVR(),setTimer,clearTimer});
  const isPowerConnected=id=>station.handles(id)?station.isPowerConnected(id):closed(id)&&(!sequences[id]||sequences[id].status().position==='RUN');
  const energized=()=>Network.energized({sources,connected:isPowerConnected});
  function syncVoltage(notify=false){
   const hot=energized();
   for(const [id,node] of Object.entries(Network.PRIMARY)){
    const key=id.replace('52-','')+'_84X',live=hot.has(node),old=raw(id,key);
    for(const peer of ['52-R1','52-R2','52-R3'])st(peer).inputs[key]=live;
    if(notify&&old!==live)emit(id,'voltage',`${id.replace('52-','89-')} 1차측 ${live?'가압':'무가압'} · ${id} 84 ${live?'동작':'비동작'}`);
   }
   return hot;
  }
  function powerStatus(){
   const hot=syncVoltage();
   return {sources:{...sources},energized:[...hot],primary:Object.fromEntries(Object.entries(Network.PRIMARY).map(([id,node])=>[id,{node,live:hot.has(node)}]))};
  }
  function setSource(id,value){
   const source=Network.SOURCES.find(source=>source.id===id&&source.adjustable);
   if(!source)return {ok:false,message:'설정 가능한 연계선 전원을 선택하세요.'};
   const enabled=!!value;
   if(sources[id]!==enabled){sources[id]=enabled;emit('52-'+(id==='onsu'?'R2':'R3'),'source',`${source.label} 전원 ${enabled?'가압':'무가압'}`);process();}
   return {ok:true,message:`${source.label} 전원을 ${enabled?'가압':'무가압'} 상태로 설정했습니다.`};
  }

  const r1Permit=active=>(!active.length)&&(!closed('52-R2')||!raw('52-R1','R2_84X'))&&(!closed('52-R3')||!raw('52-R1','R3_84X'));

  const r2Permit=active=>R2.permit({r2_84x:raw('52-R2','R2_84X'),r1Closed:closed('52-R1'),r3Closed:closed('52-R3'),r3_84x:raw('52-R2','R3_84X'),g86x:active.length>0});
  const r3Permit=active=>R3.permit({r3_84x:raw('52-R3','R3_84X'),r1Closed:closed('52-R1'),r2Closed:closed('52-R2'),r2_84x:raw('52-R3','R2_84X'),g86x:active.length>0});
  function outputs(){
   const values={};
   for(const [id,def] of Object.entries(defs))values[id]=def.native?[]:def.inputs.filter(d=>d.effect==='trip'&&signal(id,d.key)).map(d=>d.key);
   if(r1.getUVR()&&!values['52-R1'].includes('UVR'))values['52-R1'].push('UVR');
   const hscb=s1.sampleFault(raw('52-1','HSCB_FAULT'));
   if(hscb)values['52-1'].push('TP_HSCB_86X');
   return {values};
  }
  function process(){
   station.settle();
   for(let pass=0;pass<12;pass++){
    syncVoltage(true);
    const {values}=outputs();
    let changed=r1.evaluate({permit:r1Permit(values['52-R1']),g86x:values['52-R1'].length>0,uvr1:raw('52-R1','UVR1'),r1_84x:raw('52-R1','R1_84X')});
    changed=r2.evaluate({permit:r2Permit(values['52-R2']),g86x:values['52-R2'].length>0})||changed;
    changed=r3.evaluate({permit:r3Permit(values['52-R3']),g86x:values['52-R3'].length>0})||changed;
    changed=s1.evaluate({permit:raw('52-1','NEG_A')&&!closed('54-1')&&!values['52-1'].length,g86x:values['52-1'].length>0,tripTest:raw('52-1','TRIP_TEST')})||changed;
    for(const [id,causes] of Object.entries(values)){
     if(causes.length){
      st(id).flags.add(defs[id].relay);
      for(const cause of causes)st(id).flags.add(cause);
      if(!previous.get(id))emit(id,'relay',`${id} ${defs[id].relay} 동작 · ${causes.join(', ')}${defs[id].trip?'':' · 자동 트립 없음'}`);
      if(defs[id].trip&&closed(id)){
       devices.get(id).closed=false;changed=true;
       emit(id,'trip',`${id} 보호 트립 · ${defs[id].relay}${sequences[id]?' → '+(sequences[id].status().openOutput||'CB1_'+id.replace(/-/g,'')+'_OPEN'):''}`);
      }
     }
     previous.set(id,causes.length>0);
    }
    const s1Outputs=s1.feedback({uvr1:raw('52-1','UVR1')});
    if(closed('54-1')&&s1Outputs.hscbTrip){
     devices.get('54-1').closed=false;changed=true;
     emit('54-1','trip','54-1 개방 · 52-1 HSCB_TRIP → DO15_HSCB_TRIP');
    }
    if(!changed)break;
   }
   station.settle();
   onChange();
  }
  const check=(ok,text,reference)=>({ok:!!ok,text,reference});
  function checks(id,closing=!closed(id)){
   if(station.handles(id))return station.checks(id,closing);
   syncVoltage();
   const active=outputs().values;
   if(dsController[id]){
    const cb=dsController[id],sequence=sequences[cb],result=[];
    const testOpen=!closing&&sequence.status().position==='TEST'&&sequence.status().allowTestDSOpenWhileCBClosed;
    const physical=check(testOpen||!closed(cb),testOpen?`${id} TEST 개방 허용 (차단기 투입 중 가능)`:`${cb} 개방 필요`,testOpen?`${cb.toLowerCase().replace(/-/g,'')}.src · TEST 개방 출력 및 사용자 확인`:`${cb.toLowerCase().replace(/-/g,'')}.src · 단로기 외부 인터록`);
    result.push(physical);
    result.push(check(sequence.status().position==='TEST',`RUN의 ${id}은 ${cb} 시퀀스로 조작하세요`,`${cb.toLowerCase().replace(/-/g,'')}.src · TEST 분기`));
    return result;
   }
   if(id==='54-1')return closing?[check(closed('52-1'),'52-1 투입 필요','52s1.src · 행 39 / DI01_52S1_A'),check(!raw('52-1','UVR1'),'52-1 UVR1 비동작 필요','52s1.src · 행 39 / UVR1 b접점')]:[];
   if(!defs[id])return [];
   if(!closing){
    if(id==='52-1'&&s1.status().position==='RUN')return [check(!closed('54-1'),'54-1을 먼저 개방하세요','52s1.src · 행 33 / DI36_HSCB_B')];
    return [];
   }
   const result=[];
   if(id==='52-1'&&s1.status().position==='TEST')return [];
   if(defs[id].relay)result.push(check(!active[id].length,`${defs[id].relay} 비동작 필요`,defs[id].source));
   if(id==='52-R1'&&r1.status().position==='RUN')result.push(
    check(!closed('52-R2')||!raw(id,'R2_84X'),'52-R2 개방 또는 R2 84X 비동작 필요','52R1 GCB1 · CX PERMIT / DI21·DI22'),
    check(!closed('52-R3')||!raw(id,'R3_84X'),'52-R3 개방 또는 R3 84X 비동작 필요','52R1 GCB1 · CX PERMIT / DI23·DI24'));
   if(id==='52-R2'&&r2.status().position==='RUN')result.push(
    check(!raw(id,'R2_84X')||!closed('52-R1'),'89-R2 1차측 가압(84 동작) 시 52-R1 개방 필요','52r2.src · CX_PERMIT / 행 47~51'),
    check(!raw(id,'R2_84X')||!closed('52-R3')||!raw(id,'R3_84X'),'89-R2 1차측 가압(84 동작) 시 R3 개방 또는 R3 84X 비동작 필요','52r2.src · CX_PERMIT / 행 47~51'));
   if(id==='52-R3'&&r3.status().position==='RUN')result.push(
    check(!raw(id,'R3_84X')||!closed('52-R1'),'89-R3 1차측 가압(84 동작) 시 52-R1 개방 필요','52r3.src · CX_PERMIT / 행 47~51'),
    check(!raw(id,'R3_84X')||!closed('52-R2')||!raw(id,'R2_84X'),'89-R3 1차측 가압(84 동작) 시 R2 개방 또는 R2 84X 비동작 필요','52r3.src · CX_PERMIT / 행 47~51'));
   if(id==='52-1')result.push(check(raw(id,'NEG_A'),'외부 89-N1 투입 접점 필요','52s1.src · 행 28 / DI31_NEG_DS_A'),check(!closed('54-1'),'54-1 개방 필요','52s1.src · 행 28 / DI36_HSCB_B'));
   return result;
  }
  function request(id){
   if(!devices.has(id))return {ok:false,message:'등록되지 않은 설비입니다.'};
   if(station.handles(id)){const result=station.request(id);if(!result.ok)emit(id,'blocked',result.message);process();return result;}
   if(sequences[id])return commandSequence(id,closed(id)?'open':'close');
   if(dsController[id])return commandSequence(dsController[id],closed(id)?'ds-open':'ds-close');
   const reasons=checks(id).filter(c=>!c.ok);
   if(reasons.length){const message=`${id} 조작 차단 · ${reasons.map(c=>c.text).join(' / ')}`;emit(id,'blocked',message);onChange();return {ok:false,message};}
   const d=devices.get(id);d.closed=!d.closed;
   const message=`${id} ${d.closed?'투입':'개방'}`;
   emit(id,'operation',message);process();return {ok:true,message};
  }
  function commandSequence(id,action,origin){
   if(station.handles(id)){const result=station.command(id,action,origin);if(!result.ok)emit(id,'blocked',result.message);process();return result;}
   if(!sequences[id]||typeof action!=='string')return {ok:false,message:'등록된 시퀀스와 명령을 선택하세요.'};
   const target=action.startsWith('ds-')?id.replace('52-','89-'):id;
   const closing=action==='close'||action==='ds-close';
   const reasons=checks(target,closing).filter(c=>!c.ok&&c.commandGate!==false);
   if(reasons.length){const message=`${target} 조작 차단 · ${reasons.map(c=>c.text).join(' / ')}`;emit(target,'blocked',message);onChange();return {ok:false,message};}
   const result=sequences[id].issue(action,{origin});
   emit(target,result.ok?'operation':'blocked',result.message);
   if(result.ok)process();else onChange();
   return result;
  }
  function configureSequence(id,key,value){
   if(station.handles(id)){const result=station.configure(id,key,value);emit(id,result.ok?'operation':'blocked',result.message);process();return result;}
   if(!sequences[id])return {ok:false,message:'등록된 시퀀스를 선택하세요.'};
   const result=sequences[id].configure(key,value);
   emit(id,result.ok?'operation':'blocked',result.message);
   if(result.ok)process();else onChange();
   return result;
  }
  function setInput(id,key,value){
   if(station.handles(id)){station.setInput(id,key,value);process();return;}
   const def=defs[id],state=st(id);
   const spec=[...(def?.inputs||[]),...(def?.external||[])].find(d=>d.key===key);
   if(!spec)throw new Error('Unknown AC input: '+id+'/'+key);
   if(spec.readOnly)throw new Error('Voltage-derived input: '+id+'/'+key+'; change the line source or switch state.');
   const enabled=!!value;if(state.inputs[key]===enabled)return;
   state.inputs[key]=enabled;
   if(enabled&&!['external','pulse','triptest'].includes(spec.effect))state.flags.add(key);
   emit(id,'input',`${id} ${key} ${enabled?'동작':'해제'}`);process();
  }
  function resetIndicators(id){
   if(station.handles(id)){const result=station.resetIndicators(id);if(!result.ok)emit(id,'blocked',result.message);process();return result;}
   if(!defs[id])return {ok:false,message:'보호 모의 대상이 아닙니다.'};
   // Held contacts can be reset after their originating inputs are removed.
   const nonHeld=defs[id].inputs.some(d=>raw(id,d.key)&&!(id==='52-1'&&d.key==='HSCB_FAULT'));
   const derivedActive=(id==='52-R1'&&r1.getUVR())||(id==='52-1'&&s1.status().pulse);
   if(nonHeld||derivedActive){const message=`${id} 복귀 불가 · 동작 중인 원인 신호를 먼저 해제하세요`;emit(id,'blocked',message);onChange();return {ok:false,message};}
   st(id).flags.clear();emit(id,'reset',`${id} 표시기억 복귀`);process();return {ok:true,message:`${id} 표시기억을 복귀했습니다.`};
  }
  function reset(){
   previous.clear();sources=Object.fromEntries(Network.SOURCES.map(source=>[source.id,source.initial]));for(const sequence of Object.values(sequences))sequence.reset();
   for(const [id,def] of Object.entries(defs)){const state=st(id);state.flags.clear();state.inputs=Object.fromEntries([...def.inputs,...(def.external||[])].map(d=>[d.key,!!d.initial]));}
   station.reset();syncVoltage();onChange();
  }
  function status(id){
   if(station.handles(id))return station.status(id);
   syncVoltage();
   const def=defs[id];if(!def)return {supported:false,checks:checks(id)};
   const out=outputs();
   if(id==='52-1')s1.feedback({uvr1:raw('52-1','UVR1')});
   const received=[];
   return {supported:true,def,received,sequence:sequences[id]?.status()||null,inputs:{...st(id).inputs},flags:[...st(id).flags],active:out.values[id],checks:checks(id),pending:[]};
  }
  return {request,commandSequence,configureSequence,commandR1:(action,origin)=>commandSequence('52-R1',action,origin),configureR1:(key,value)=>configureSequence('52-R1',key,value),commandR2:(action,origin)=>commandSequence('52-R2',action,origin),configureR2:(key,value)=>configureSequence('52-R2',key,value),commandR3:(action,origin)=>commandSequence('52-R3',action,origin),configureR3:(key,value)=>configureSequence('52-R3',key,value),commandS1:(action,origin)=>commandSequence('52-1',action,origin),configureS1:(key,value)=>configureSequence('52-1',key,value),setSource,powerStatus,setInput,resetIndicators,reset,status,checks,definitions:defs,isPowerConnected};
 }
 root.ACProtection={create,definitions:defs};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ACProtection;
})(globalThis);
