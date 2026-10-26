/* The eight remaining primary projects run their exported contact networks.
 * Site wiring is kept here, separate from source Boolean logic and physical feedback. */
(function(root){
 'use strict';
 const Data=typeof module!=='undefined'&&module.exports?require('./station-logic-data.js'):root.StationLogicData;
 const Ladder=typeof module!=='undefined'&&module.exports?require('./ladder-runtime.js'):root.LadderRuntime;
 const panels={'52-2':'52s2','52-D1':'52d1','52-D2':'52d2','52-DB1':'52db1','52-DB2':'52db2','52-H1':'52h1','52-H2':'52h2','52-H3':'52h3'};
 const owner=id=>id==='52-HT'?'52-DB1':/^89-H[123]$/.test(id)?id.replace('89-','52-'):id;
 const diagram=s=>s.replace(/^52S([12])$/,'52-$1').replace(/^(52|89)([RDH])/,'$1-$2');
 const notes={
  '52-2':'52s2.src의 CB1_52S1 표기는 이 프로젝트의 출력 이름입니다. 실제 조작 대상은 52-2입니다. RUN 투입은 NEG 투입·54-2 개방·G86X 비동작, 수동 개방은 54-2 개방이 필요합니다. HSCB 고장은 즉시 시작하는 1초 TP 펄스입니다.',
  '52-D1':'RUN 투입·수동 개방은 DB1 개방이 필요합니다. 87T·가스압력 2단계는 표시기억 복귀까지 보호를 유지합니다. DTR 온도 트립은 즉시 보호하며, DB1 고장 수신은 표시만 합니다.',
  '52-D2':'RUN 투입·수동 개방은 DB2 개방이 필요합니다. 87T·가스압력 2단계는 표시기억 복귀까지 보호를 유지합니다. DTR 온도 트립은 즉시 보호하며, DB2 고장 수신은 표시만 합니다.',
  '52-DB1':'RUN 투입은 D1 투입 및 (HT 개방 또는 DB2 개방)이 필요합니다. 부족전압은 투입 중 0.5초 후 동작합니다. D1 고장 수신은 상승 시 0.5초 TP로 트립합니다. 64T는 경보만 발생합니다.',
  '52-DB2':'RUN 투입은 D2 투입 및 (HT 개방 또는 DB1 개방)이 필요합니다. 부족전압은 투입 중 0.5초 후 동작합니다. D2 고장 수신은 상승 시 0.5초 TP로 트립합니다. 64T는 경보만 발생합니다.',
  '52-H1':'소스의 투입 허가에는 UVR1 a접점이 있어 ON이 필요합니다. 89-H1 투입·DB1 27TX 비동작·G86X 비동작도 필요합니다. DB1 27TX는 입력 해제 후 1초간 트립을 유지합니다. 단로기의 외부 인터록은 H1 개방 상태에서 조작을 허용합니다.',
  '52-H2':'소스의 RUN 투입 허가는 89-H2 투입·UVR1 ON·DB1 27TX 비동작·G86X 비동작입니다. RUN 단로기 투입에도 같은 허가가 적용되므로 최초 단로기 투입은 TEST에서 진행합니다. DB1 27TX는 지연 없이 트립합니다.',
  '52-H3':'소스의 RUN 투입 허가는 89-H3 투입·UVR1 ON·DB2 27TX 비동작·G86X 비동작입니다. RUN 단로기 투입에도 같은 허가가 적용되므로 최초 단로기 투입은 TEST에서 진행합니다. DB2 27TX는 지연 없이 트립합니다.',
  '52-HT':'52db1.src의 CB2 조작으로 동작합니다. DB1·DB2 중 하나 이상 개방해야 RUN 투입이 가능합니다. 조작 LOCAL/REMOTE 및 RUN/TEST 허가 분기는 DB1 설정을 따릅니다. 여기의 RUN/TEST는 HT 자체 주회로 위치입니다. DB1 TEST에서는 투입 허가를 우회합니다.'
 };
 function specs(id){
  const name=panels[id],dtr=/^52-D[12]$/.test(id),h=/^52-H[123]$/.test(id),db=/DB/.test(id),s=id==='52-2',n=id.slice(-1),all=Data[name].inputs;
  const list=[],mapped=new Set();
  function add(key,symbol,label,effect='trip',held=false,initial=false){if(!(symbol in all))return;list.push({key,symbol,label,effect,held,initial});mapped.add(symbol);}
  add('OCR50',dtr?'G150PL_OP':'G50PL_OP','OCR 50 · 순시 과전류');
  add('OCR51',dtr?'G151PL_OP':'G51PL_OP','OCR 51 · 한시 과전류');
  add('OCGR50',dtr?'G150NL_OP':'G50NL_OP','OCGR 50 · 순시 지락 과전류',dtr||s?'trip':'indication');
  add('OCGR51',dtr?'G151NL_OP':'G51NL_OP','OCGR 51 · 한시 지락 과전류',dtr||s?'trip':'indication');
  add('UVR1','G271_OP',h?'UVR1 a접점 · RUN 투입 허가에 ON 필요':'UVR1 · 부족전압',h?'external':db?'delayed':'trip');
  add('OVR','G59PL_OP','OVR · 과전압 (보호 OR 연동 없음)','indication');
  add('64T','G64_IOP','64T / OVGR · 지락 과전압 (경보)','indication');
  add('SGR','G67N_OP','SGR / DR_GR · 선택 지락',h?'trip':'indication',h);
  add('87T','G87L_OP','87T / DFR · 변압기 차동','trip',true);
  add('GAS1','DI13_63CB_TP1','63G1 · 가스압력 1단계 저하','indication');
  add('GAS2','DI14_63CB_TP2','63G2 · 가스압력 2단계 저하','trip',true);
  add('TR26TP',dtr?'DI22_DTR_26TP':'DI22_SRTR_26TP','26TP · 변압기 온도 트립');
  add('TR26AL',dtr?'DI21_DTR_26AL':'DI21_SRTR_26AL','26AL · 변압기 온도 경보','indication');
  add('EXTINGUISHER',db||h?'DI33_29AL':'DI04_29AL','29AL · 소화기 경보','indication');
  add('TRIP_TEST','TRIP_TEST1','TRIP_TEST1 · 차단기 시험 개방','triptest');
  if(s){
   add('NEG_A','DI31_NEG_DS_A','89-N2 NEG 단로기 투입 접점','external',false,true);
   add('REC26TP','DI24_REC_26TP','REC26TP · 정류기 온도 트립');add('REC_FAULT','DI38_REC_FAULT','REC_FAULT · 정류기 고장');
   add('HSCB_FAULT','DI34_HSCB_FAULT','HSCB_FAULT · 즉시 1초 TP 펄스','pulse');
   add('REC26AL','DI23_REC_26AL','REC26AL · 정류기 온도 경보','indication');add('REC_TEMP_AL','DI32_REC_TEMP_AL','정류기 온도 경보','indication');add('REC_DIODE_AL','DI33_RECDIODE_AL','정류기 다이오드 경보','indication');
  }
  if(dtr){add('DB'+n+'_FAULT','DI24_52DB'+n+'_FAULT','DB'+n+' 고장 입력 · 실제 연동과 OR','indication');add('R1_27X','DI38_52R1_27X','R1 27X 입력 · 실제 연동과 OR','indication');}
  if(db)add('D'+n+'_FAULT','DI22_52D'+n+'_FAULT','D'+n+' 고장 입력 · 실제 연동과 OR (0.5초 TP)','external');
  if(h)add('DB_27TX','DI11_DB'+(n==='3'?'2':'1')+'_27TX','DB 27TX 입력 · 실제 연동과 OR','external');
  if(id==='52-DB1'){add('TIE_29AL','DI34_TIE_29AL','HT 소화기 경보','indication');add('TRIP_TEST2','TRIP_TEST2','TRIP_TEST2 · HT 시험 개방','triptest');}
  for(const symbol of Object.keys(all)){
   if(mapped.has(symbol)||/^(CB[12]_|G2K_|FRESET$|VC$)/.test(symbol)||/^DI\d+_(52\w+_(A|RUN|TEST)|89H\d_A|HSCB_B)$/.test(symbol))continue;
   // Remaining source contacts are available for detailed relay/output exercises.
   add(symbol,symbol,`${symbol} · 원본 접점`, 'source');list[list.length-1].advanced=true;
  }
  return list;
 }
 const definitions={};
 for(const [id,name] of Object.entries(panels)){
  const list=specs(id);
  definitions[id]={source:name+'.src · 전체 접점망 / PCI 구간 '+Data[name].networks.length+'개',relay:'G86X',trip:true,native:true,note:notes[id],inputs:list.filter(x=>!['external','triptest'].includes(x.effect)),external:list.filter(x=>['external','triptest'].includes(x.effect))};
 }
 definitions['52-HT']={source:'52db1.src · CB2 / 행 39~48',relay:null,trip:false,native:true,note:notes['52-HT'],inputs:[]};
 function create({devices,emit=()=>{},wake=()=>{},readR1UVR=()=>false,setTimer=setTimeout,clearTimer=clearTimeout}){
  const models={},settings={},inputs={},last={},results={},lastOutput={};let tiePosition='RUN';
  const closed=id=>!!devices.get(id)?.closed;
  const list=id=>[...definitions[id].inputs,...(definitions[id].external||[])];
  for(const [id,name] of Object.entries(panels)){
   settings[id]={position:'RUN',location:'LOCAL',failCB:false,failDS:false};inputs[id]=Object.fromEntries(list(id).map(d=>[d.key,!!d.initial]));last[id]={};results[id]='명령 대기';lastOutput[id]='';
   models[id]=Ladder.create(Data[name],{setTimer,clearTimer,wake,onTimer:(key,start)=>emit(id,'timer',`${id} ${key} ${start?'시작':'종료'}`)});
  }
  const value=(id,key)=>!!models[id]?.snapshot()[key];
  function contacts(id,buttons={}){
   const data=Data[panels[id]],v=Object.fromEntries(Object.keys(data.inputs).map(k=>[k,false]));
   for(const spec of list(id))v[spec.symbol]=!!inputs[id][spec.key];
   for(const name of Object.keys(v)){
    const contact=/^DI\d+_(52\w+|89H\d)_(A|RUN|TEST)$/.exec(name);
    if(contact){const target=diagram(contact[1]);v[name]=contact[2]==='A'?closed(target):(target==='52-HT'?tiePosition:settings[target]?.position)===contact[2];}
   }
   v.G2K_LOCAL=settings[id].location!=='LOCAL';v.G2K_REMOTE=settings[id].location==='REMOTE';
   if(id==='52-2')v.DI36_HSCB_B=!closed('54-2');
   if(/^52-D[12]$/.test(id)){
    const n=id.slice(-1);v['DI24_52DB'+n+'_FAULT'] ||= value('52-DB'+n,'DB'+n+'_FAULT');v.DI38_52R1_27X ||= readR1UVR();
   }
   if(/^52-DB[12]$/.test(id)){const n=id.slice(-1);v['DI22_52D'+n+'_FAULT'] ||= value('52-D'+n,n==='1'?'DO14_52D1FAULT':'DO14_D2FAULT');}
   if(/^52-H[123]$/.test(id)){const n=id==='52-H3'?'2':'1';v['DI11_DB'+n+'_27TX'] ||= value('52-DB'+n,'DO12_27TX');}
   return Object.assign(v,buttons);
  }
  function physical(id,on,output,forced=false){
   const d=devices.get(id);if(!d||d.closed===on)return false;
   d.closed=on;emit(id,forced?'trip':'operation',`${id} ${forced?'보호·시험 개방':on?'투입':'개방'} · ${output}`);return true;
  }
  function actuate(id){
   const v=models[id].snapshot(),s=settings[id],prior=last[id];let changed=false;
   const prefix=id==='52-2'?'CB1_52S1':`CB1_${id.replace('-','')}`;
   const pairs=[[id,prefix+'_CLOSE',prefix+'_OPEN','failCB']];
   if(/^52-H[123]$/.test(id)){const ds=id.replace('52-','89-');pairs.push([ds,'PO02_'+ds.replace('-','')+'_CLOSE','PO01_'+ds.replace('-','')+'_OPEN','failDS']);}
   if(id==='52-DB1')pairs.push(['52-HT','PO02_52HT_CLOSE','PO01_52HT_OPEN','failDS']);
   for(const [target,c,o,failure] of pairs){
    const force=target===id?(v.G86X||v.TRIP_TEST1):target==='52-HT'?v.TRIP_TEST2:false;
    if(v[c]&&!prior[c]||v[o]&&!prior[o])lastOutput[id]=v[o]?o:c;
    const allowed=target!=='89-H1'||!closed('52-H1'); // Confirmed external H1 disconnector interlock.
    if(allowed&&v[o]&&(force||!prior[o]&&!s[failure]))changed=physical(target,false,o,force)||changed;
    if(allowed&&v[c]&&!prior[c]&&!v[o]&&!force&&!s[failure])changed=physical(target,true,c)||changed;
   }
   if(id==='52-2'&&v.DO15_HSCB_TRIP)changed=physical('54-2',false,'DO15_HSCB_TRIP',true)||changed;
   if(v.G86X&&!prior.G86X)emit(id,'relay',`${id} G86X 동작`);
   last[id]=v;return changed;
  }
  function settle(commands={}){
   // All panels sample and compute before applying feedback: a DB 27TX scan reaches H panels.
   for(let pass=0;pass<24;pass++){
    let changed=false;
    for(const id of Object.keys(panels))changed=models[id].scan(contacts(id,commands[id]||{}))||changed;
    for(const id of Object.keys(panels))changed=actuate(id)||changed;
    if(!changed&&pass>1)break;
   }
  }
  const handles=id=>!!definitions[owner(id)]||id==='54-2';
  const check=(ok,text,id)=>({ok:!!ok,text,reference:definitions[owner(id)]?.source||'52s2.src · HSCB_CX_PERMIT'});
  function checks(id,closing=!closed(id)){
   if(id==='54-2')return closing?[check(value('52-2','HSCB_CX_PERMIT'),'52-2 투입 및 UVR1 비동작 필요',id)]:[];
   const panel=owner(id);if(!models[panel])return [];
   const s=settings[panel],v=models[panel].snapshot(),test=s.position==='TEST';
   if(/^89-H[123]$/.test(id)){
    const physical=id!=='89-H1'||!closed(panel),out=[check(physical,'52-H1 개방 필요 · 외부 단로기 인터록',id)];
    if(closing&&!test)out.push(check(panel==='52-H1'?!closed(panel):v.CX_PERMIT,panel==='52-H1'?'52-H1 개방 필요':'RUN 단로기 투입도 CX_PERMIT 필요 · 최초 투입은 TEST에서 조작',id));
    return out;
   }
   if(id==='52-HT')return closing?[check(test||v.CX2_PERMIT,'DB1 TEST 또는 DB1·DB2 중 하나 이상 개방 필요',id)]:[];
   if(!closing){
    if(test)return [];
    if(panel==='52-2')return [check(!closed('54-2'),'54-2를 먼저 개방하세요',id)];
    if(/^52-D[12]$/.test(panel))return [check(!closed('52-DB'+panel.slice(-1)),'52-DB'+panel.slice(-1)+'을 먼저 개방하세요',id)];
    return [];
   }
   if(test)return [];
   if(panel==='52-2')return [check(v.DI31_NEG_DS_A,'89-N2 NEG 단로기 투입 필요',id),check(v.DI36_HSCB_B,'54-2 개방 필요',id),check(!v.G86X,'G86X 비동작 필요',id)];
   if(/^52-D[12]$/.test(panel))return [check(!closed('52-DB'+panel.slice(-1)),'52-DB'+panel.slice(-1)+' 개방 필요',id),check(!v.G86X,'G86X 비동작 필요',id)];
   if(/^52-DB[12]$/.test(panel)){const n=panel.slice(-1),other=n==='1'?'2':'1';return [check(closed('52-D'+n),'52-D'+n+' 투입 필요',id),check(!closed('52-HT')||!closed('52-DB'+other),'52-HT 개방 또는 52-DB'+other+' 개방 필요',id)];}
   const n=panel.slice(-1),db=n==='3'?'2':'1';
   return [check(closed('89-H'+n),'89-H'+n+' 투입 필요',id),check(v.UVR1,'UVR1 a접점 ON 필요 · 원본 소스 기준',id),check(!v['DI11_DB'+db+'_27TX'],'DB'+db+' 27TX 비동작 필요',id),check(!v.G86X,'G86X 비동작 필요',id)];
  }
  function command(id,action,origin){
   const panel=owner(id);if(!models[panel]||typeof action!=='string')return {ok:false,message:'등록된 원본 시퀀스와 명령을 선택하세요.'};
   const secondary=id==='52-HT'||id.startsWith('89-')||action.startsWith('ds-');
   const target=secondary?(panel==='52-DB1'?'52-HT':panel.replace('52-','89-')):panel;
   if(!['close','open','ds-close','ds-open'].includes(action)||secondary&&!/^52-(H[123]|DB1)$/.test(panel))return {ok:false,message:'이 반에 없는 명령입니다.'};
   if(origin&&origin!==settings[panel].location)return {ok:false,message:`현재 조작 위치는 ${settings[panel].location}입니다.`};
   settle();const closing=action.endsWith('close'),blocked=checks(target,closing).filter(x=>!x.ok);
   if(blocked.length){const message=`${target} 조작 차단 · ${blocked.map(x=>x.text).join(' / ')}`;return {ok:false,message};}
   const key=`CB${secondary?'2':'1'}_${closing?'ON':'OFF'}_SW_${settings[panel].location==='LOCAL'?'G2K':'REM'}`;
   emit(target,'command',`${target} ${settings[panel].location} ${closing?'투입':'개방'} 명령`);
   settle({[panel]:{[key]:true}});settle();
   results[panel]=`${target} ${closing?'투입':'개방'} 명령 처리${closed(target)===closing?'':' · 출력·허가·응답 상태 확인'}`;
   return {ok:true,message:results[panel]};
  }
  function request(id){
   if(id==='54-2'){
    settle();const reason=checks(id).find(x=>!x.ok);if(reason)return {ok:false,message:reason.text};
    physical(id,!closed(id),'HSCB_CX_PERMIT');settle();return {ok:true,message:`54-2 ${closed(id)?'투입':'개방'}`};
   }
   return command(id,closed(id)?'open':'close');
  }
  function configure(id,key,v){
   const panel=owner(id),s=settings[panel];if(!s||!['position','location','failCB','failDS'].includes(key))return {ok:false,message:'등록된 연습 설정을 선택하세요.'};
   if(key==='position'){
    if(!['RUN','TEST'].includes(v))return {ok:false,message:'RUN 또는 TEST를 선택하세요.'};
    if(closed(id))return {ok:false,message:'차단기 개방 후 RUN/TEST 위치를 변경하세요.'};
    if(id==='52-HT')tiePosition=v;else s.position=v;
   }else if(key==='location'){
    if(!['LOCAL','REMOTE'].includes(v))return {ok:false,message:'LOCAL 또는 REMOTE를 선택하세요.'};s.location=v;
   }else s[key]=!!v;
   settle();return {ok:true,message:`${id} 연습 설정 변경`};
  }
  function setInput(id,key,v){
   const panel=owner(id);if(!(key in (inputs[panel]||{})))throw new Error('Unknown AC input: '+id+'/'+key);
   inputs[panel][key]=!!v;emit(panel,'input',`${panel} ${key} ${v?'동작':'해제'}`);settle();
  }
  function resetIndicators(id){
   const panel=owner(id);if(!models[panel])return {ok:false,message:'표시 복귀 대상이 아닙니다.'};
   // FRESET is an actual source input. Active raw causes will reassert after the pulse.
   settle({[panel]:{FRESET:true}});settle();
   const remaining=Object.entries(models[panel].snapshot()).filter(([k,v])=>v&&k.endsWith('_F'));
   emit(panel,'reset',`${panel} FRESET 표시기억 복귀`);
   return {ok:!remaining.length,message:remaining.length?'동작 중인 원인으로 표시기억이 다시 설정됐습니다.':`${panel} 표시기억을 복귀했습니다.`};
  }
  function reset(){
   tiePosition='RUN';
   for(const id of Object.keys(panels)){models[id].reset();settings[id]={position:'RUN',location:'LOCAL',failCB:false,failDS:false};inputs[id]=Object.fromEntries(list(id).map(d=>[d.key,!!d.initial]));last[id]={};results[id]='명령 대기';lastOutput[id]='';}
   settle();
  }
  function status(id){
   if(!definitions[id])return {supported:false,checks:checks(id)};
   const panel=owner(id),v=models[panel].snapshot(),s=settings[panel],pending=models[panel].pending();
   const outputPairs=Object.entries(v).filter(([key])=>/^(DO\d|PO\d|CB1_52|G86X$|CX\d?_PERMIT$|HSCB_|TP_HSCB_86X$|TMR_DB)/.test(key));
   const received=Object.entries(contacts(panel)).filter(([key,on])=>on&&/^DI\d+_.*(FAULT|27TX|27X)$/.test(key)).map(([key])=>key+' 수신');
   return {supported:true,def:definitions[id],inputs:id==='52-HT'?{}:{...inputs[panel]},received,flags:Object.entries(v).filter(([key,on])=>on&&key.endsWith('_F')).map(([key])=>key),active:id!=='52-HT'&&v.G86X?['G86X',...Object.entries(v).filter(([key,on])=>on&&/^(G52D[12]_FAULT|G27TX|TMR_DB[12]_27TX|DR_GR_F|DFR_F|G63CB_TP2_F|TP_HSCB_86X)$/.test(key)).map(([key])=>key)]:[],checks:checks(id),pending:pending.map(t=>t.key),
    sequence:{kind:'native',source:panels[panel]+'.src',cb:id,position:id==='52-HT'?tiePosition:s.position,controllerPosition:s.position,location:s.location,busy:false,cx:false,tx:false,failure:{cb:s.failCB,ds:s.failDS},commands:{},stage:results[panel],pending,lastOutput:lastOutput[panel],outputs:outputPairs,ds:/^52-H[123]$/.test(id)?id.replace('52-','89-'):null,secondary:id==='52-DB1'?'52-HT':null},native:v};
  }
  const isPowerConnected=id=>closed(id)&&(id==='52-HT'?tiePosition==='RUN':settings[id]?settings[id].position==='RUN':true);
  settle();
  return {handles,settle,request,command,configure,setInput,resetIndicators,reset,status,checks,isPowerConnected};
 }
 root.StationSequence={create,definitions,panels};if(typeof module!=='undefined'&&module.exports)module.exports=root.StationSequence;
})(globalThis);
