'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../ac-protection.js'),Data=require('../station-logic-data.js'),Ladder=require('../ladder-runtime.js'),Station=require('../station-sequence.js');
function clock(){let now=0,serial=0;const jobs=new Map();return {jobs,setTimer(fn,ms){const id=++serial;jobs.set(id,{fn,at:now+ms});return id;},clearTimer(id){jobs.delete(id);},tick(ms){const end=now+ms;for(;;){const next=[...jobs].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=end;}};}
function setup(){
 const ids=['52-R1','52-R2','52-R3','89-R1','89-R2','89-R3','52-1','52-2','54-1','54-2','52-D1','52-D2','52-DB1','52-DB2','52-HT','52-H1','52-H2','52-H3','89-H1','89-H2','89-H3'];
 const devices=new Map(ids.map(id=>[id,{id,closed:false}])),events=[],time=clock();
 const model=create({devices,onEvent:e=>events.push(e),setTimer:time.setTimer,clearTimer:time.clearTimer});
 const on=id=>devices.get(id).closed;
 const close=id=>{assert.equal(model.request(id).ok,true,id);assert.equal(on(id),true,id);};
 const signal=(id,key,value=true)=>model.setInput(id,key,value);
 const mode=(id,value)=>assert.equal(model.configureSequence(id,'position',value).ok,true,id);
 const native=id=>model.status(id).native;
 return {model,devices,events,time,on,close,signal,mode,native};
}
function truth(name,row,names,expected){
 const net=Data[name].networks.find(n=>n.rows[0]===row);assert.ok(net,name+' row '+row);
 for(let mask=0;mask<2**names.length;mask++){
  const input=Object.fromEntries(names.map((n,i)=>[n,!!(mask&(1<<i))]));
  const runtime=Ladder.create({networks:[net]},{setTimer:()=>1,clearTimer:()=>{}});runtime.scan(input);
  const out=runtime.snapshot();for(const [key,v] of Object.entries(expected(input)))assert.equal(out[key],!!v,`${name}:${row} ${key} ${JSON.stringify(input)}`);
 }
}
test('archive coverage: exactly eight remaining primary projects, 395 PCI networks, 494 verified addresses',()=>{
 assert.deepEqual(Object.keys(Data),['52s2','52d1','52d2','52db1','52db2','52h1','52h2','52h3']);
 assert.equal(Object.values(Data).reduce((n,p)=>n+p.networks.length,0),395);
 assert.equal(Object.values(Data).reduce((n,p)=>n+p.verifiedAddresses,0),494);
 for(const p of Object.values(Data)){
  assert.match(p.sha256,/^[a-f0-9]{64}$/);
  for(const n of p.networks){assert.ok(n.coils.length);for(const t of n.timers)assert.ok(['TP','TON','TOF'].includes(t[2]));}
 }
});
test('D1/D2 source close and manual-open truth tables preserve TEST and LOCAL/REMOTE branches',()=>{
 for(const n of ['1','2']){
  const source='52d'+n,run='DI11_52D'+n+'_RUN',test='DI12_52D'+n+'_TEST',db='DI23_52DB'+n+'_A';
  truth(source,31,[db,'G86X'],v=>({CX_PERMIT:!v[db]&&!v.G86X}));
  for(const [row,button,out] of [[32,'ON','G52CX'],[36,'OFF','G52TX']]){
   const a='CB1_'+button+'_SW_G2K',b='CB1_'+button+'_SW_REM';
   truth(source,row,[run,test,'CX_PERMIT',db,'G2K_LOCAL','G2K_REMOTE',a,b,...(row===36?['G86X','TRIP_TEST1']:[])],v=>({[out]:((v[run]&&(row===32?v.CX_PERMIT:!v[db]))||v[test])&&((!v.G2K_LOCAL&&v[a])||(v.G2K_REMOTE&&v[b]))||(row===36&&(v.G86X||v.TRIP_TEST1))}));
  }
 }
});
test('DB1/DB2 permit covers all D/HT/opposite-DB combinations; HT forbids both closed',()=>{
 for(const n of ['1','2']){
  const other=n==='1'?'2':'1',d='DI21_52D'+n+'_A',peer='DI13_52DB'+other+'_A';
  truth('52db'+n,n==='1'?29:27,[d,'DI03_52HT_A',peer],v=>({CX1_PERMIT:v[d]&&(!v.DI03_52HT_A||!v[peer])}));
 }
 truth('52db1',39,['DI01_52DB1_A','DI13_52DB2_A'],v=>({CX2_PERMIT:!v.DI01_52DB1_A||!v.DI13_52DB2_A}));
});
test('H1/H2/H3 native UVR1 is an a contact in all 16 close-permit combinations',()=>{
 for(const n of ['1','2','3']){
  const ds='DI03_89H'+n+'_A',uv='DI11_DB'+(n==='3'?'2':'1')+'_27TX';
  truth('52h'+n,n==='1'?23:32,[ds,uv,'UVR1','G86X'],v=>({CX_PERMIT:v[ds]&&!v[uv]&&v.UVR1&&!v.G86X}));
 }
});
test('H2/H3 shared branch feeds CB1 and CB2 with the same RUN permit, not invented sequencing',()=>{
 for(const n of ['2','3'])for(const [row,prefix,pos] of [[34,'MANUAL','TEST'],[38,'AUTO','RUN'],[43,'MANUAL','TEST'],[47,'AUTO','RUN']]){
  const dir=row>=43?'OFF':'ON',suffix=dir==='ON'?'CX':'TX',mode='DI'+(pos==='TEST'?'22':'21')+'_52H'+n+'_'+pos;
  const a='CB1_'+dir+'_SW_G2K',b='CB1_'+dir+'_SW_REM',c='CB2_'+dir+'_SW_G2K',d='CB2_'+dir+'_SW_REM';
  truth('52h'+n,row,[mode,'CX_PERMIT','G2K_LOCAL','G2K_REMOTE',a,b,c,d],v=>{
   const gate=v[mode]&&(row!==38||v.CX_PERMIT),local=!v.G2K_LOCAL,remote=v.G2K_REMOTE;
   return {[prefix+'_52'+suffix]:gate&&((local&&v[a])||(remote&&v[b])),[prefix+'_89'+suffix]:gate&&((local&&v[c])||(remote&&v[d]))};
  });
 }
});
test('S2 uses its own project identity despite CB1_52S1 symbol; HSCB and RUN/TEST gates are independent of S1',()=>{
 const x=setup();assert.equal(x.model.request('54-2').ok,false);x.signal('52-2','NEG_A',false);assert.equal(x.model.request('52-2').ok,false);
 x.mode('52-2','TEST');x.close('52-2');assert.equal(x.on('52-1'),false);assert.equal(x.model.isPowerConnected('52-2'),false);
 assert.equal(x.native('52-2').CB1_52S1_CLOSE,false);assert.match(x.model.status('52-2').sequence.lastOutput,/CB1_52S1_CLOSE/);
 x.model.request('52-2');x.mode('52-2','RUN');x.signal('52-2','NEG_A',true);x.close('52-2');x.close('54-2');assert.equal(x.model.request('52-2').ok,false);
 x.signal('52-2','REC26TP');assert.equal(x.on('52-2'),false);assert.equal(x.on('54-2'),false);
});
test('S2 ten protection branches and latched versus raw temperature contacts',()=>{
 for(const key of ['OCR50','OCR51','OCGR50','OCGR51','UVR1','GAS2','TR26TP','REC26TP','REC_FAULT','HSCB_FAULT']){
  const x=setup();x.close('52-2');x.signal('52-2',key);assert.equal(x.on('52-2'),false,key);
  x.signal('52-2',key,false);
  if(key==='HSCB_FAULT')x.time.tick(1000);
  if(key==='GAS2'){assert.equal(x.model.request('52-2').ok,false);assert.equal(x.model.resetIndicators('52-2').ok,true);}
  x.close('52-2');
 }
});
test('S2 TP starts immediately, persists after input clears, expires at 1000ms without retriggering high input',()=>{
 const x=setup();x.close('52-2');x.signal('52-2','HSCB_FAULT');assert.equal(x.native('52-2').TP_HSCB_86X,true);
 x.time.tick(100);x.signal('52-2','HSCB_FAULT',false);x.time.tick(100);x.signal('52-2','HSCB_FAULT',true);
 x.time.tick(799);assert.equal(x.native('52-2').TP_HSCB_86X,true);x.time.tick(1);assert.equal(x.native('52-2').TP_HSCB_86X,false);
 x.time.tick(2000);x.close('52-2');assert.equal(x.on('52-2'),true);
 x.signal('52-2','HSCB_FAULT',false);x.signal('52-2','HSCB_FAULT');assert.equal(x.on('52-2'),false);
});
test('D1 and D2 all native protection branches forward a latched DO14 fault and a 500ms DB trip pulse',()=>{
 for(const n of ['1','2'])for(const key of ['OCR50','OCR51','OCGR50','OCGR51','87T','GAS2','TR26TP']){
  const x=setup(),d='52-D'+n,db='52-DB'+n;x.close(d);x.close(db);x.signal(d,key);
  assert.equal(x.on(d),false,d+'/'+key);assert.equal(x.on(db),false,db+'/'+key);assert.equal(x.native(d)[n==='1'?'DO14_52D1FAULT':'DO14_D2FAULT'],true);
  x.time.tick(499);assert.equal(x.native(db).G86X,true);x.time.tick(1);assert.equal(x.native(db).G86X,false,'held fault input must not stretch TP');
  x.signal(d,key,false);if(['87T','GAS2'].includes(key)){assert.equal(x.model.request(d).ok,false);assert.equal(x.model.resetIndicators(d).ok,true);}
  x.close(d);x.close(db);
 }
});
test('D1/D2 alarm inputs and secondary relay banks do not create a protective trip',()=>{
 for(const n of ['1','2']){
  const x=setup(),d='52-D'+n;x.close(d);
  for(const key of ['GAS1','TR26AL','DB'+n+'_FAULT','R1_27X','EXTINGUISHER','G250PL_OP','G350PL_OP','G250NL_OP']){x.signal(d,key);assert.equal(x.on(d),true,key);}
  assert.equal(x.native(d).OCR2_50,true);assert.equal(x.native(d).OCR3_50,true);
 }
});
test('DB1/DB2 UVR TON cancels before 500ms and trips the correct H feeders at the boundary',()=>{
 for(const n of ['1','2']){
  const x=setup(),d='52-D'+n,db='52-DB'+n,hs=n==='1'?['1','2']:['3'];x.close(d);x.close(db);
  for(const h of hs){x.mode('52-H'+h,'TEST');x.close('89-H'+h);x.signal('52-H'+h,'UVR1');x.mode('52-H'+h,'RUN');x.close('52-H'+h);}
  x.signal(db,'UVR1');x.time.tick(499);assert.equal(x.on(db),true);x.signal(db,'UVR1',false);x.time.tick(1000);assert.equal(x.on(db),true);
  x.signal(db,'UVR1');x.time.tick(499);assert.equal(x.on(db),true);x.time.tick(1);assert.equal(x.on(db),false);
  for(const h of hs)assert.equal(x.on('52-H'+h),false,'H'+h);
  assert.equal(x.on(d),true);
 }
});
test('H1 TOF holds trip for 1s after DB 27TX falls; H2/H3 follow raw input without delay',()=>{
 for(const n of ['1','2','3']){
  const x=setup(),h='52-H'+n;x.mode(h,'TEST');x.close(h);x.signal(h,'DB_27TX');assert.equal(x.on(h),false);
  x.signal(h,'DB_27TX',false);
  if(n==='1'){x.time.tick(999);assert.equal(x.native(h).G86X,true);x.time.tick(1);}
  assert.equal(x.native(h).G86X,false);x.close(h);
 }
});
test('H1 TOF restarts on a new falling edge and cancels its old expiry when input returns',()=>{
 const x=setup();x.signal('52-H1','DB_27TX');x.signal('52-H1','DB_27TX',false);x.time.tick(600);x.signal('52-H1','DB_27TX');x.time.tick(600);assert.equal(x.native('52-H1').G86X,true);
 x.signal('52-H1','DB_27TX',false);x.time.tick(999);assert.equal(x.native('52-H1').G86X,true);x.time.tick(1);assert.equal(x.native('52-H1').G86X,false);
});
test('H2/H3 initial DS closing follows TEST branch; RUN CB needs UVR1 ON and DS A',()=>{
 for(const n of ['2','3']){
  const x=setup(),h='52-H'+n,ds='89-H'+n;assert.equal(x.model.request(ds).ok,false);x.mode(h,'TEST');x.close(ds);x.mode(h,'RUN');assert.equal(x.model.request(h).ok,false);x.signal(h,'UVR1');x.close(h);
  x.signal(h,'UVR1',false);assert.equal(x.on(h),true,'UVR does not trip H');
 }
});
test('each H panel OCR and latched DR_GR protect in TEST; source has no TRIP_TEST1 contact',()=>{
 for(const n of ['1','2','3'])for(const key of ['OCR50','OCR51','SGR']){
  const x=setup(),h='52-H'+n;x.mode(h,'TEST');x.close(h);x.signal(h,key);assert.equal(x.on(h),false);
  x.signal(h,key,false);if(key==='SGR'){x.model.commandSequence(h,'close');assert.equal(x.on(h),false);x.model.resetIndicators(h);}x.close(h);
  assert.throws(()=>x.signal(h,'TRIP_TEST'));
 }
});
test('DB TEST can emit closing without permit but G86X opening has priority',()=>{
 for(const n of ['1','2']){
  const x=setup(),id='52-DB'+n;x.mode(id,'TEST');x.close(id);x.signal(id,'OCR50');assert.equal(x.on(id),false);
  assert.equal(x.model.commandSequence(id,'close').ok,true);assert.equal(x.on(id),false);
 }
});
test('HT uses DB1 CB2 location and permit mode while its physical TEST position isolates power',()=>{
 const x=setup();x.devices.get('52-DB1').closed=true;x.devices.get('52-DB2').closed=true;assert.equal(x.model.request('52-HT').ok,false);
 x.devices.get('52-DB1').closed=false;x.mode('52-DB1','TEST');x.devices.get('52-DB1').closed=true;x.close('52-HT');
 x.model.request('52-HT');x.mode('52-HT','TEST');x.close('52-HT');assert.equal(x.model.isPowerConnected('52-HT'),false);
 assert.equal(x.model.configureSequence('52-HT','location','REMOTE').ok,true);assert.equal(x.model.commandSequence('52-HT','open','LOCAL').ok,false);
 x.signal('52-DB1','TRIP_TEST2');assert.equal(x.on('52-HT'),false);assert.equal(x.on('52-DB1'),true);
});
test('native LOCAL/REMOTE and failed physical response are distinct from source output; trip test overrides failure',()=>{
 for(const id of ['52-2','52-D1','52-D2','52-DB1','52-DB2']){
  const x=setup();x.mode(id,'TEST');x.model.configureSequence(id,'location','REMOTE');assert.equal(x.model.commandSequence(id,'close','LOCAL').ok,false);
  x.model.configureSequence(id,'failCB',true);assert.equal(x.model.commandSequence(id,'close','REMOTE').ok,true);assert.equal(x.on(id),false);
  x.model.configureSequence(id,'failCB',false);x.close(id);x.model.configureSequence(id,'failCB',true);x.signal(id,'TRIP_TEST');assert.equal(x.on(id),false);assert.equal(x.native(id).G86X,false);
 }
});
test('source DO alarm pulses and buzzer are timed without delaying protection',()=>{
 const x=setup();x.close('52-D2');x.signal('52-D2','OCR50');assert.equal(x.on('52-D2'),false);assert.equal(x.native('52-D2').DO01_OCR50_AL,true);assert.equal(x.native('52-D2').DO31_BUZZER,true);
 x.time.tick(499);assert.equal(x.native('52-D2').DO01_OCR50_AL,true);x.time.tick(1);assert.equal(x.native('52-D2').DO01_OCR50_AL,false);
 x.time.tick(9499);assert.equal(x.native('52-D2').DO31_BUZZER,true);x.time.tick(1);assert.equal(x.native('52-D2').DO31_BUZZER,false);
 assert.equal(x.native('52-D2').G86X,true);
});
test('64T is a 500ms alarm output and latched indication, never DB protection',()=>{
 const x=setup();x.close('52-D2');x.close('52-DB2');x.signal('52-DB2','64T');assert.equal(x.on('52-DB2'),true);assert.equal(x.native('52-DB2').DO02_OVGR_AL,true);
 x.time.tick(500);assert.equal(x.native('52-DB2').DO02_OVGR_AL,false);assert.equal(x.native('52-DB2').OVGR_F,true);assert.equal(x.native('52-DB2').G86X,false);
});
test('all native timers cancel on global reset and output state does not leak into prior controllers',()=>{
 const x=setup();x.signal('52-2','HSCB_FAULT');x.signal('52-H1','DB_27TX');x.signal('52-H1','DB_27TX',false);x.signal('52-D2','OCR50');assert.ok(x.time.jobs.size>0);
 for(const d of x.devices.values())d.closed=false;x.model.reset();assert.equal(x.time.jobs.size,0);x.time.tick(20000);
 for(const id of Object.keys(Station.panels))assert.deepEqual(x.model.status(id).flags,[]);
 assert.equal(x.model.status('52-R2').inputs.R2_84X,true);assert.equal(x.model.status('52-1').inputs.NEG_A,true);
});
