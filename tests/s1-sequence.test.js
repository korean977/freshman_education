'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../ac-protection.js'),S1=require('../s1-sequence.js');
const source=require('./fixtures/52s1-sequence.json');
function setup(){
 const devices=new Map(['52-R1','89-R1','52-R2','89-R2','52-R3','89-R3','52-1','54-1','52-D1','52-DB1','52-DB2','52-H1','89-H1'].map(id=>[id,{closed:false}]));
 const events=[],timers=new Map();let now=0,serial=0;
 const m=create({devices,onEvent:e=>events.push({...e,at:now}),setTimer:(fn,ms)=>{const key=++serial;timers.set(key,{fn,at:now+ms});return key;},clearTimer:key=>timers.delete(key)});
 function tick(ms){const target=now+ms;for(let i=0;i<500;i++){
  const due=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){now=target;return;}now=due[1].at;timers.delete(due[0]);due[1].fn();
 }throw Error('timer loop');}
 const on=id=>devices.get(id).closed,seq=()=>m.status('52-1').sequence;
 const close=()=>{assert.equal(m.commandS1('close').ok,true);assert.equal(on('52-1'),true);};
 return {m,devices,events,timers,tick,on,seq,close};
}
test('S1 is direct control, with only a native 1s TP and no R1/R2/R3 feedback or command timers',()=>{
 const {m,seq,close}=setup();assert.deepEqual(S1.TIMING,{TP_HSCB:source.hscb_pulse.ms});close();
 assert.equal(seq().kind,'direct');assert.equal(seq().busy,false);assert.deepEqual(seq().pending,[]);assert.equal(seq().lastOutput,source.outputs.close);
 assert.equal(m.commandS1('ds-open').ok,false);assert.equal(m.configureS1('failDS',true).ok,false);
});
test('RUN close exactly follows NEG_A AND HSCB_B AND NOT G86X for all 8 combinations',()=>{
 for(const neg of [false,true])for(const hscb of [false,true])for(const trip of [false,true]){
  const {m,devices,on}=setup();m.setInput('52-1','NEG_A',neg);m.setInput('52-1','OCR50',trip);
  devices.get('54-1').closed=hscb;
  const allowed=neg&&!hscb&&!trip;assert.equal(m.commandS1('close').ok,allowed);assert.equal(on('52-1'),allowed);
 }
});
test('RUN manual open requires HSCB_B; open 54-1 before opening 52-1',()=>{
 const {m,on,close}=setup();close();assert.equal(m.request('54-1').ok,true);assert.equal(m.commandS1('open').ok,false);assert.equal(on('52-1'),true);
 m.request('54-1');assert.equal(m.commandS1('open').ok,true);assert.equal(on('52-1'),false);
});
test('TEST close bypasses NEG and HSCB RUN gates; TEST open bypasses HSCB_B',()=>{
 const {m,devices,on}=setup();m.configureS1('position','TEST');m.setInput('52-1','NEG_A',false);devices.get('54-1').closed=true;
 assert.equal(m.commandS1('close').ok,true);assert.equal(on('52-1'),true);assert.equal(m.isPowerConnected('52-1'),false);
 assert.equal(m.commandS1('open').ok,true);assert.equal(on('52-1'),false);assert.equal(on('54-1'),false);
});
test('G86X dominates simultaneous TEST close without inventing a protection bypass',()=>{
 const {m,on,events}=setup();m.configureS1('position','TEST');m.setInput('52-1','OCR50',true);
 assert.equal(m.commandS1('close').ok,true);assert.equal(on('52-1'),false);
 assert.equal(events.some(e=>e.kind==='command'&&e.message.includes('CB1_52S1_CLOSE')),true);
 assert.equal(m.status('52-1').active.includes('OCR50'),true);
});
test('source LOCAL/REMOTE command routing and direct command response failure',()=>{
 const {m,on,seq}=setup();m.configureS1('location','REMOTE');
 assert.equal(m.commandS1('close','LOCAL').ok,false);m.configureS1('failCB',true);
 assert.equal(m.commandS1('close','REMOTE').ok,true);assert.equal(on('52-1'),false);assert.equal(seq().result,'no-feedback');
 m.configureS1('failCB',false);assert.equal(m.commandS1('close','REMOTE').ok,true);assert.equal(on('52-1'),true);
 assert.equal(m.configureS1('position','TEST').ok,false);
});
test('all ten native G86X branches trip S1 and forward HSCB_TRIP to 54-1',()=>{
 for(const symbol of source.g86x.or_inputs){
  const {m,on,events,close}=setup();close();m.request('54-1');m.setInput('52-1',source.mapping[symbol],true);
  assert.equal(on('52-1'),false,symbol);assert.equal(on('54-1'),false,symbol);
  assert.equal(m.status('52-1').active.includes(symbol==='TP_HSCB_86X'?symbol:source.mapping[symbol]),true);
  assert.equal(events.some(e=>e.kind==='trip'&&e.message.includes('G86X → CB1_52S1_OPEN')),true);
  assert.equal(events.some(e=>e.id==='54-1'&&e.message.includes('DO15_HSCB_TRIP')),true);
 }
});
test('native alarm-only inputs, including OVR and 29AL, do not trip or inhibit',()=>{
 for(const key of source.indication_only){
  const {m,on,tick,close}=setup();close();m.setInput('52-1',key,true);tick(20000);assert.equal(on('52-1'),true,key);assert.deepEqual(m.status('52-1').active,[]);
  m.commandS1('open');assert.equal(m.commandS1('close').ok,true);assert.equal(on('52-1'),true);
 }
 const {m}=setup();assert.throws(()=>m.setInput('52-1','FIRE',true),/Unknown AC input/);
});
test('63G2 source _F remains interlocking until source clear and indication reset',()=>{
 const {m,close}=setup();close();m.setInput('52-1','GAS2',true);assert.equal(m.resetIndicators('52-1').ok,false);
 m.setInput('52-1','GAS2',false);assert.equal(m.commandS1('close').ok,false);assert.equal(m.resetIndicators('52-1').ok,true);close();
});
test('temperature and REC fault raw inputs release protection despite remaining indication',()=>{
 for(const key of ['TR26TP','REC26TP','REC_FAULT']){
  const {m,close}=setup();close();m.setInput('52-1',key,true);m.setInput('52-1',key,false);
  assert.equal(m.status('52-1').flags.includes(key),true);close();
 }
});
test('HSCB fault TP starts immediately, lasts exactly 1s, and is not held by high input or memory',()=>{
 const {m,tick,on,seq,close}=setup();close();m.setInput('52-1','HSCB_FAULT',true);
 assert.equal(on('52-1'),false);assert.equal(seq().pulse,true);assert.equal(m.resetIndicators('52-1').ok,false);
 tick(999);assert.equal(m.commandS1('close').ok,false);assert.equal(seq().pulse,true);
 tick(1);assert.equal(seq().pulse,false);assert.deepEqual(m.status('52-1').active,[]);
 assert.equal(m.status('52-1').flags.includes('TP_HSCB_86X'),true);assert.equal(m.resetIndicators('52-1').ok,true);
 close();tick(20000);assert.equal(on('52-1'),true,'held raw fault must not retrigger TP');
});
test('brief HSCB fault persists for full pulse; early rising edges do not extend or restart it',()=>{
 const {m,tick,seq,close}=setup();close();m.setInput('52-1','HSCB_FAULT',true);tick(100);m.setInput('52-1','HSCB_FAULT',false);
 tick(100);m.setInput('52-1','HSCB_FAULT',true);tick(799);assert.equal(seq().pulse,true);
 tick(1);assert.equal(seq().pulse,false);tick(1000);assert.equal(seq().pulse,false);
 m.setInput('52-1','HSCB_FAULT',false);m.setInput('52-1','HSCB_FAULT',true);assert.equal(seq().pulse,true);
});
test('HSCB source output truth table uses CB_A and UVR1 in both RUN and TEST',()=>{
 for(const position of ['RUN','TEST'])for(const cb of [false,true])for(const uvr of [false,true]){
  const {m,devices,seq}=setup();m.configureS1('position',position);m.setInput('52-1','UVR1',uvr);devices.get('52-1').closed=cb;
  assert.equal(seq().hscbPermit,cb&&!uvr);assert.equal(seq().hscbTrip,!cb||uvr);
 }
});
test('TRIP_TEST1 opens CB with HSCB closed, bypasses failCB and RUN gate without operating G86X',()=>{
 const {m,on,events,close}=setup();close();m.request('54-1');m.configureS1('failCB',true);m.setInput('52-1','TRIP_TEST',true);
 assert.equal(on('52-1'),false);assert.equal(on('54-1'),false);assert.deepEqual(m.status('52-1').active,[]);
 assert.equal(events.some(e=>e.message.includes('TRIP_TEST1 → CB1_52S1_OPEN')),true);
 assert.equal(m.commandS1('close').ok,true);assert.equal(on('52-1'),false);
 m.setInput('52-1','TRIP_TEST',false);m.configureS1('failCB',false);close();
});
test('protection opening bypasses RUN manual HSCB condition and simulated manual CB failure',()=>{
 const {m,on,close}=setup();close();m.request('54-1');m.configureS1('failCB',true);m.setInput('52-1','OCR51',true);
 assert.equal(on('52-1'),false);assert.equal(on('54-1'),false);
});
test('S1 TEST disconnects primary while its actual source HSCB permit remains observable',()=>{
 const {m,seq,close}=setup();m.configureS1('position','TEST');close();assert.equal(m.isPowerConnected('52-1'),false);
 assert.equal(seq().hscbPermit,true);assert.equal(m.request('54-1').ok,true);
});
test('reset cancels a running TP, clears memory and restores independent RUN/LOCAL settings',()=>{
 const {m,devices,timers,tick,seq,on,close}=setup();m.configureS1('location','REMOTE');close();m.setInput('52-1','HSCB_FAULT',true);tick(300);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(timers.size,0);tick(20000);
 assert.equal(seq().pulse,false);assert.equal(seq().location,'LOCAL');assert.equal(seq().position,'RUN');assert.equal(on('52-1'),false);
 assert.deepEqual(m.status('52-1').flags,[]);assert.equal(m.status('52-1').inputs.NEG_A,true);
});
test('S1 diagram commands and settings use own controller while native R2 sequencing continues',()=>{
 const {m,tick,on,seq}=setup();m.commandR2('close');m.configureS1('position','TEST');assert.equal(m.request('52-1').ok,true);
 assert.equal(seq().position,'TEST');assert.equal(m.status('52-R2').sequence.position,'RUN');tick(4000);assert.equal(on('52-R2'),true);
 assert.equal(m.request('52-1').ok,true);assert.equal(on('52-1'),false);assert.equal(on('52-R2'),true);
});
