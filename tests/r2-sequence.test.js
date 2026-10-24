'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../ac-protection.js');
const R2=require('../r2-sequence.js');
const source=require('./fixtures/52r2-sequence.json');
function setup(){
 const devices=new Map(['52-R1','89-R1','52-R2','89-R2','52-R3','52-D1','52-DB1','52-DB2','52-H1','89-H1','52-1','54-1'].map(id=>[id,{closed:false}]));
 const events=[],pending=new Map();let now=0,serial=0;
 const m=create({devices,onEvent:e=>events.push({...e,at:now}),setTimer:(fn,ms)=>{const id=++serial;pending.set(id,{fn,at:now+ms});return id},clearTimer:id=>pending.delete(id)});
 function tick(ms){const target=now+ms;for(let i=0;i<300;i++){const due=[...pending.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){now=target;return}now=due[1].at;pending.delete(due[0]);due[1].fn();}throw Error('timer loop');}
 const on=id=>devices.get(id).closed,seq=(id='52-R2')=>m.status(id).sequence;
 const close=()=>{assert.equal(m.commandR2('close').ok,true);tick(4000);assert.equal(on('52-R2'),true);assert.equal(seq().busy,false);};
 return {m,devices,events,pending,tick,on,seq,close};
}
test('R2 native timer profile uses 8s close, 10s open, and no R1 UVR/84X timers',()=>{
 assert.deepEqual(R2.TIMING,Object.fromEntries(Object.entries(source.timers).map(([k,v])=>[k,v.ms])));
 assert.equal('TON_27X' in R2.TIMING,false);assert.equal('TON_84R1' in R2.TIMING,false);
});
test('R2 permit matches all five native parallel branches across 32 combinations',()=>{
 for(const own of [false,true])for(const r1 of [false,true])for(const r3 of [false,true])for(const x3 of [false,true])for(const gf of [false,true]){
  const values={R2_84X:own,R1_A:r1,R3_A:r3,R3_84X:x3};
  const expected=!gf&&source.permit.branches.some(branch=>branch.every(([name,state])=>values[name]===state));
  assert.equal(R2.permit({r2_84x:own,r1Closed:r1,r3Closed:r3,r3_84x:x3,g86x:gf}),expected);
  const {m,devices}=setup();devices.get('52-R1').closed=r1;devices.get('52-R3').closed=r3;
  m.setInput('52-R2','R2_84X',own);m.setInput('52-R2','R3_84X',x3);if(gf)m.setInput('52-R2','OCR50',true);
  assert.equal(m.commandR2('close').ok,expected);
 }
});
test('RUN R2 closes DS first, waits 1s, closes CB and confirms for 3s',()=>{
 const {m,tick,on,seq,events}=setup();m.commandR2('close');assert.equal(on('89-R2'),true);assert.equal(on('52-R2'),false);
 tick(999);assert.equal(on('52-R2'),false);tick(1);assert.equal(on('52-R2'),true);
 tick(2999);assert.equal(seq().busy,true);tick(1);assert.equal(seq().busy,false);
 assert.deepEqual(events.filter(e=>e.message.includes(' · 시퀀스 ')).map(e=>e.id),['89-R2','52-R2']);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),false);
});
test('RUN R2 opens CB, waits 1s, opens DS and confirms DS for 7s',()=>{
 const {m,tick,on,seq,close}=setup();close();m.commandR2('open');assert.equal(on('52-R2'),false);assert.equal(on('89-R2'),true);
 tick(999);assert.equal(on('89-R2'),true);tick(1);assert.equal(on('89-R2'),false);
 tick(6999);assert.equal(seq().tx,true);tick(1);assert.equal(seq().busy,false);
});
test('R2 failed close stops at 8s rather than R1 10s and never actuates later',()=>{
 const {m,tick,on,seq}=setup();m.configureR2('failDS',true);m.commandR2('close');tick(7999);assert.equal(seq().busy,true);
 tick(1);assert.equal(seq().result,'close-timeout');assert.equal(seq().busy,false);assert.equal(on('52-R2'),false);
 m.configureR2('failDS',false);tick(20000);assert.equal(on('52-R2'),false);m.commandR2('close');tick(4000);assert.equal(on('52-R2'),true);
});
test('R2 failed CB close times out after 8s with DS feedback only',()=>{
 const {m,tick,on,seq}=setup();m.configureR2('failCB',true);m.commandR2('close');tick(8000);
 assert.equal(on('89-R2'),true);assert.equal(on('52-R2'),false);assert.equal(seq().result,'close-timeout');
});
test('R2 failed opening stops at 10s without moving DS under closed CB',()=>{
 const {m,tick,on,seq,close}=setup();close();m.configureR2('failCB',true);m.commandR2('open');tick(9999);assert.equal(seq().busy,true);
 tick(1);assert.equal(seq().result,'open-timeout');assert.equal(on('52-R2'),true);assert.equal(on('89-R2'),true);
});
test('each of six native R2 G86X branches trips only R2 and inhibits reclosing',()=>{
 for(const symbol of source.g86x.or_inputs){
  const {m,devices,on,events,close}=setup();close();devices.get('52-R1').closed=true;
  const key=source.mapping[symbol];m.setInput('52-R2',key,true);
  assert.equal(on('52-R2'),false,symbol);assert.equal(on('89-R2'),true);assert.equal(on('52-R1'),true);
  assert.equal(m.commandR2('close').ok,false);assert.equal(events.some(e=>e.kind==='trip'&&e.message.includes('CB1_52R2_OPEN')),true);
 }
});
test('R2 UVR1 and other indication inputs do not trip or inhibit, even after 20s',()=>{
 for(const key of source.indication_only_inputs){
  const {m,tick,on,close}=setup();close();m.setInput('52-R2',key,true);tick(20000);
  assert.equal(on('52-R2'),true,key);assert.deepEqual(m.status('52-R2').active,[]);assert.equal(m.status('52-R2').flags.includes(key),true);
 }
});
test('R2 gas2 remains latched until the source is cleared and indication reset',()=>{
 const {m,close}=setup();close();m.setInput('52-R2','GAS2',true);assert.equal(m.resetIndicators('52-R2').ok,false);
 m.setInput('52-R2','GAS2',false);assert.equal(m.commandR2('close').ok,false);assert.equal(m.resetIndicators('52-R2').ok,true);
 assert.equal(m.commandR2('close').ok,true);
});
test('R1/R2 shared 84X inputs synchronize in both directions',()=>{
 const {m}=setup();assert.equal(m.status('52-R1').inputs.R2_84X,true);assert.equal(m.status('52-R2').inputs.R2_84X,true);
 m.setInput('52-R2','R2_84X',false);assert.equal(m.status('52-R1').inputs.R2_84X,false);
 m.setInput('52-R1','R2_84X',true);assert.equal(m.status('52-R2').inputs.R2_84X,true);
 m.setInput('52-R2','R3_84X',true);assert.equal(m.status('52-R1').inputs.R3_84X,true);
 m.setInput('52-R1','R3_84X',false);assert.equal(m.status('52-R2').inputs.R3_84X,false);
});
test('R2 uses R1 state to permit; R1 uses the shared R2 state and 84X',()=>{
 const {m,tick,on,close}=setup();close();assert.equal(m.commandR1('close').ok,false);
 m.commandR2('open');tick(8000);assert.equal(m.commandR1('close').ok,true);tick(4000);assert.equal(on('52-R1'),true);
 assert.equal(m.commandR2('close').ok,false);m.setInput('52-R2','R2_84X',false);assert.equal(m.commandR2('close').ok,true);
});
test('TEST R2 is individual and disconnected from primary; RUN DS direct is blocked',()=>{
 const {m,devices,on}=setup();assert.equal(m.request('89-R2').ok,false);m.configureR2('position','TEST');devices.get('52-R1').closed=true;
 assert.equal(m.commandR2('close').ok,true);assert.equal(on('52-R2'),true);assert.equal(on('89-R2'),false);assert.equal(m.isPowerConnected('52-R2'),false);
 m.setInput('52-R2','OCR50',true);assert.equal(on('52-R2'),false);
});
test('R2 TEST DS-open output is recorded but physical opening under closed CB is withheld',()=>{
 const {m,on,events}=setup();m.configureR2('position','TEST');m.commandR2('ds-close');m.commandR2('close');
 assert.equal(m.commandR2('ds-close').ok,false);assert.equal(m.commandR2('ds-open').ok,true);
 assert.equal(on('89-R2'),true);assert.equal(on('52-R2'),true);
 assert.equal(events.some(e=>e.kind==='command'&&e.message.includes('PO01_89R2_OPEN')),true);
 assert.equal(events.some(e=>e.kind==='blocked'&&e.message.includes('외부 인터록')),true);
 m.commandR2('open');m.commandR2('ds-open');assert.equal(on('89-R2'),false);
});
test('R2 LOCAL/REMOTE settings and repeat commands are independent from R1',()=>{
 const {m,tick,seq}=setup();m.configureR2('location','REMOTE');assert.equal(seq('52-R1').location,'LOCAL');
 assert.equal(m.commandR2('close','LOCAL').ok,false);assert.equal(m.commandR2('close','REMOTE').ok,true);
 assert.equal(m.commandR2('close').ok,false);assert.equal(m.configureR2('location','LOCAL').ok,false);tick(4000);
 assert.equal(seq().busy,false);assert.equal(m.configureR2('position','TEST').ok,false);
});
test('opposite R2 command cancels a pending close without stale actuation',()=>{
 const {m,tick,on}=setup();m.commandR2('close');tick(500);m.commandR2('open');tick(20000);
 assert.equal(on('52-R2'),false);assert.equal(on('89-R2'),false);
});
test('R2 protection during a close does not reclose from a held coil',()=>{
 const {m,tick,on}=setup();m.commandR2('close');tick(1200);m.setInput('52-R2','OCR51',true);assert.equal(on('52-R2'),false);
 m.setInput('52-R2','OCR51',false);tick(20000);assert.equal(on('52-R2'),false);
});
test('global reset cancels both controller timers, restores independent RUN/LOCAL and shared defaults',()=>{
 const {m,tick,devices,on,seq,pending}=setup();m.configureR2('location','REMOTE');m.commandR2('close');tick(500);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 assert.equal(on('52-R2'),false);assert.equal(on('89-R2'),false);assert.equal(seq().location,'LOCAL');assert.equal(seq('52-R1').location,'LOCAL');
 assert.equal(m.status('52-R1').inputs.R2_84X,true);assert.equal(m.status('52-R2').inputs.R2_84X,true);
});
test('unsupported R2 source inputs and controllers are rejected',()=>{
 const {m}=setup();assert.throws(()=>m.setInput('52-R2','UVR',true));assert.throws(()=>m.setInput('52-R2','FIRE',true));
 assert.equal(m.commandSequence('52-R9','close').ok,false);assert.equal(m.configureSequence('52-R9','position','TEST').ok,false);
});
