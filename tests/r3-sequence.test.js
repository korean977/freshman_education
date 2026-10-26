'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../ac-protection.js');
const R3=require('../r3-sequence.js');
const source=require('./fixtures/52r3-sequence.json');
function setup(){
 const devices=new Map(['52-R1','89-R1','52-R3','89-R3','52-R2','89-R2','52-D1','52-DB1','52-DB2','52-H1','89-H1','52-1','54-1'].map(id=>[id,{closed:false}]));
 const events=[],pending=new Map();let now=0,serial=0;
 const m=create({devices,onEvent:e=>events.push({...e,at:now}),setTimer:(fn,ms)=>{const id=++serial;pending.set(id,{fn,at:now+ms});return id},clearTimer:id=>pending.delete(id)});
 function tick(ms){const target=now+ms;for(let i=0;i<300;i++){const due=[...pending.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){now=target;return}now=due[1].at;pending.delete(due[0]);due[1].fn();}throw Error('timer loop');}
 const on=id=>devices.get(id).closed,seq=(id='52-R3')=>m.status(id).sequence;
 const close=()=>{assert.equal(m.commandR3('close').ok,true);tick(4000);assert.equal(on('52-R3'),true);assert.equal(seq().busy,false);};
 return {m,devices,events,pending,tick,on,seq,close};
}
test('R3 native timer profile uses 8s close, 10s open, and no R1 UVR/84X timers',()=>{
 assert.deepEqual(R3.TIMING,Object.fromEntries(Object.entries(source.timers).map(([k,v])=>[k,v.ms])));
 assert.equal('TON_27X' in R3.TIMING,false);assert.equal('TON_84R1' in R3.TIMING,false);
});
test('R3 permit matches all five native parallel branches across 32 combinations',()=>{
 for(const own of [false,true])for(const r1 of [false,true])for(const r2 of [false,true])for(const x2 of [false,true])for(const gf of [false,true]){
  const values={R3_84X:own,R1_A:r1,R2_A:r2,R2_84X:x2};
  const expected=!gf&&source.permit.branches.some(branch=>branch.every(([name,state])=>values[name]===state));
  assert.equal(R3.permit({r3_84x:own,r1Closed:r1,r2Closed:r2,r2_84x:x2,g86x:gf}),expected);

 }
});
test('RUN R3 closes DS first, waits 1s, closes CB and confirms for 3s',()=>{
 const {m,tick,on,seq,events}=setup();m.commandR3('close');assert.equal(on('89-R3'),true);assert.equal(on('52-R3'),false);
 tick(999);assert.equal(on('52-R3'),false);tick(1);assert.equal(on('52-R3'),true);
 tick(2999);assert.equal(seq().busy,true);tick(1);assert.equal(seq().busy,false);
 assert.deepEqual(events.filter(e=>e.message.includes(' · 시퀀스 ')).map(e=>e.id),['89-R3','52-R3']);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),false);
});
test('RUN R3 opens CB, waits 1s, opens DS and confirms DS for 7s',()=>{
 const {m,tick,on,seq,close}=setup();close();m.commandR3('open');assert.equal(on('52-R3'),false);assert.equal(on('89-R3'),true);
 tick(999);assert.equal(on('89-R3'),true);tick(1);assert.equal(on('89-R3'),false);
 tick(6999);assert.equal(seq().tx,true);tick(1);assert.equal(seq().busy,false);
});
test('R3 failed close stops at 8s rather than R1 10s and never actuates later',()=>{
 const {m,tick,on,seq}=setup();m.configureR3('failDS',true);m.commandR3('close');tick(7999);assert.equal(seq().busy,true);
 tick(1);assert.equal(seq().result,'close-timeout');assert.equal(seq().busy,false);assert.equal(on('52-R3'),false);
 m.configureR3('failDS',false);tick(20000);assert.equal(on('52-R3'),false);m.commandR3('close');tick(4000);assert.equal(on('52-R3'),true);
});
test('R3 failed CB close times out after 8s with DS feedback only',()=>{
 const {m,tick,on,seq}=setup();m.configureR3('failCB',true);m.commandR3('close');tick(8000);
 assert.equal(on('89-R3'),true);assert.equal(on('52-R3'),false);assert.equal(seq().result,'close-timeout');
});
test('R3 failed opening stops at 10s without moving DS under closed CB',()=>{
 const {m,tick,on,seq,close}=setup();close();m.configureR3('failCB',true);m.commandR3('open');tick(9999);assert.equal(seq().busy,true);
 tick(1);assert.equal(seq().result,'open-timeout');assert.equal(on('52-R3'),true);assert.equal(on('89-R3'),true);
});
test('each of six native R3 G86X branches trips only R3 and inhibits reclosing',()=>{
 for(const symbol of source.g86x.or_inputs){
  const {m,devices,on,events,close}=setup();close();devices.get('52-R1').closed=true;
  const key=source.mapping[symbol];m.setInput('52-R3',key,true);
  assert.equal(on('52-R3'),false,symbol);assert.equal(on('89-R3'),true);assert.equal(on('52-R1'),true);
  assert.equal(m.commandR3('close').ok,false);assert.equal(events.some(e=>e.kind==='trip'&&e.message.includes('CB1_52R3_OPEN')),true);
 }
});
test('R3 UVR1 and other indication inputs do not trip or inhibit, even after 20s',()=>{
 for(const key of source.indication_only_inputs){
  const {m,tick,on,close}=setup();close();m.setInput('52-R3',key,true);tick(20000);
  assert.equal(on('52-R3'),true,key);assert.deepEqual(m.status('52-R3').active,[]);assert.equal(m.status('52-R3').flags.includes(key),true);
 }
});
test('R3 gas2 remains latched until the source is cleared and indication reset',()=>{
 const {m,close}=setup();close();m.setInput('52-R3','GAS2',true);assert.equal(m.resetIndicators('52-R3').ok,false);
 m.setInput('52-R3','GAS2',false);assert.equal(m.commandR3('close').ok,false);assert.equal(m.resetIndicators('52-R3').ok,true);
 assert.equal(m.commandR3('close').ok,true);
});
test('R3 primary-voltage-derived 84X is shared and cannot be manually overridden',()=>{
 const {m}=setup();m.setSource('sangdong',true);
 assert.equal(m.status('52-R3').inputs.R3_84X,true,'upstream line is sensed even with DS open');
 m.configureSequence('52-R3','position','TEST');m.commandSequence('52-R3','ds-close');
 for(const id of ['52-R1','52-R2','52-R3'])assert.equal(m.status(id).inputs.R3_84X,true);
 assert.throws(()=>m.setInput('52-R3','R3_84X',false),/Voltage-derived/);
 m.setSource('sangdong',false);
 for(const id of ['52-R1','52-R2','52-R3'])assert.equal(m.status(id).inputs.R3_84X,false);
});

test('R3 line-side voltage and R1 state gate native closing permission',()=>{
 const {m,tick,on,close}=setup();m.setSource('sangdong',true);close();
 assert.equal(m.commandR1('close').ok,false);
 m.commandR3('open');tick(8000);assert.equal(m.commandR1('close').ok,true);tick(4000);assert.equal(on('52-R1'),true);
 m.configureR3('position','TEST');m.commandR3('ds-close');m.configureR3('position','RUN');
 assert.equal(m.status('52-R3').inputs.R3_84X,true);assert.equal(m.commandR3('close').ok,false);
 m.setSource('sangdong',false);assert.equal(m.status('52-R3').inputs.R3_84X,false);
 assert.equal(m.commandR3('close').ok,true);
});

test('TEST R3 is individual and disconnected from primary; RUN DS direct is blocked',()=>{
 const {m,devices,on}=setup();assert.equal(m.request('89-R3').ok,false);m.configureR3('position','TEST');devices.get('52-R1').closed=true;
 assert.equal(m.commandR3('close').ok,true);assert.equal(on('52-R3'),true);assert.equal(on('89-R3'),false);assert.equal(m.isPowerConnected('52-R3'),false);
 m.setInput('52-R3','OCR50',true);assert.equal(on('52-R3'),false);
});
test('R3 confirmed TEST DS-open output opens the DS under closed CB; DS closing stays blocked',()=>{
 const {m,on,events}=setup();m.configureR3('position','TEST');m.commandR3('ds-close');m.commandR3('close');
 assert.equal(m.commandR3('ds-close').ok,false);assert.equal(m.checks('89-R3',false).every(c=>c.ok),true);assert.equal(m.commandR3('ds-open').ok,true);
 assert.equal(on('89-R3'),false);assert.equal(on('52-R3'),true);
 assert.equal(m.commandR3('ds-close').ok,false);
 assert.equal(events.some(e=>e.kind==='command'&&e.message.includes('PO01_89R3_OPEN')),true);
 assert.equal(events.some(e=>e.kind==='blocked'&&e.message.includes('외부 인터록')),false);
 m.commandR3('open');m.commandR3('ds-close');assert.equal(on('89-R3'),true);
});
test('R3 LOCAL/REMOTE settings and repeat commands are independent from R1',()=>{
 const {m,tick,seq}=setup();m.configureR3('location','REMOTE');assert.equal(seq('52-R1').location,'LOCAL');
 assert.equal(m.commandR3('close','LOCAL').ok,false);assert.equal(m.commandR3('close','REMOTE').ok,true);
 assert.equal(m.commandR3('close').ok,false);assert.equal(m.configureR3('location','LOCAL').ok,false);tick(4000);
 assert.equal(seq().busy,false);assert.equal(m.configureR3('position','TEST').ok,false);
});
test('opposite R3 command cancels a pending close without stale actuation',()=>{
 const {m,tick,on}=setup();m.commandR3('close');tick(500);m.commandR3('open');tick(20000);
 assert.equal(on('52-R3'),false);assert.equal(on('89-R3'),false);
});
test('R3 protection during a close does not reclose from a held coil',()=>{
 const {m,tick,on}=setup();m.commandR3('close');tick(1200);m.setInput('52-R3','OCR51',true);assert.equal(on('52-R3'),false);
 m.setInput('52-R3','OCR51',false);tick(20000);assert.equal(on('52-R3'),false);
});
test('global reset cancels all controller timers, restores independent RUN/LOCAL and shared defaults',()=>{
 const {m,tick,devices,on,seq,pending}=setup();m.configureR3('location','REMOTE');m.commandR3('close');tick(500);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 assert.equal(on('52-R3'),false);assert.equal(on('89-R3'),false);assert.equal(seq().location,'LOCAL');assert.equal(seq('52-R1').location,'LOCAL');
 assert.equal(m.status('52-R1').inputs.R3_84X,false);assert.equal(m.status('52-R3').inputs.R3_84X,false);
});
test('unsupported R3 source inputs and controllers are rejected',()=>{
 const {m}=setup();assert.throws(()=>m.setInput('52-R3','UVR',true));assert.throws(()=>m.setInput('52-R3','FIRE',true));
 assert.equal(m.commandSequence('52-R9','close').ok,false);assert.equal(m.configureSequence('52-R9','position','TEST').ok,false);
});

test('native R3 and R2 controllers mutually inhibit with both 84X active, and release after opening',()=>{
 const {m,tick,on,close}=setup();m.setSource('sangdong',true);
 for(const id of ['52-R2','52-R3']){m.configureSequence(id,'position','TEST');m.commandSequence(id,'ds-close');m.configureSequence(id,'position','RUN');}
 close();
 assert.equal(m.commandR1('close').ok,false);assert.equal(m.commandR2('close').ok,false);
 m.commandR3('open');tick(8000);assert.equal(m.commandR2('close').ok,true);tick(4000);
 assert.equal(on('52-R2'),true);m.configureR3('position','TEST');m.commandR3('ds-close');m.configureR3('position','RUN');assert.equal(m.commandR3('close').ok,false);
 m.commandR2('open');tick(8000);assert.equal(m.commandR3('close').ok,true);tick(4000);
 assert.equal(on('52-R3'),true);assert.equal(on('52-R2'),false);
});
test('dead R3 primary permits closing with R1 energized; own 84X appears only after backfeed',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(4000);
 assert.equal(m.status('52-R3').inputs.R3_84X,false);assert.equal(m.commandR3('close').ok,true);
 assert.equal(m.status('52-R3').inputs.R3_84X,false);tick(1000);assert.equal(on('52-R3'),true);
 assert.equal(m.status('52-R3').inputs.R3_84X,true);tick(3000);assert.equal(m.status('52-R3').sequence.result,'closed');
});

test('R1 10s and R3 8s timeouts run independently, including after switching panels',()=>{
 const {m,tick,seq}=setup();
 m.configureR1('failDS',true);m.configureR3('failDS',true);m.configureR3('location','REMOTE');
 m.commandR1('close');m.commandR3('close');tick(8000);
 assert.equal(seq().result,'close-timeout');assert.equal(seq('52-R1').busy,true);
 assert.equal(seq('52-R2').result,'idle');assert.equal(seq('52-R1').location,'LOCAL');
 tick(2000);assert.equal(seq('52-R1').result,'close-timeout');assert.equal(seq().location,'REMOTE');
});
test('R3 manual commands route through the diagram request path and reset clears all three controllers',()=>{
 const {m,tick,on,devices,seq,pending}=setup();assert.equal(m.request('52-R3').ok,true);tick(4000);assert.equal(on('52-R3'),true);
 assert.equal(m.request('52-R3').ok,true);tick(8000);assert.equal(on('89-R3'),false);
 m.configureR3('position','TEST');assert.equal(m.request('89-R3').ok,true);assert.equal(on('89-R3'),true);
 m.setSource('sangdong',true);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 for(const id of ['52-R1','52-R2','52-R3']){
  assert.equal(seq(id).busy,false);assert.equal(seq(id).position,'RUN');
  assert.equal(m.status(id).inputs.R2_84X,true);assert.equal(m.status(id).inputs.R3_84X,false);
 }
});

test('all three TEST controllers open DS under closed CB through diagram request; DS closing remains blocked',()=>{
 const {m,on,events}=setup();
 for(const id of ['52-R1','52-R2','52-R3']){
  const ds=id.replace('52-','89-');m.configureSequence(id,'position','TEST');
  m.commandSequence(id,'ds-close');m.commandSequence(id,'close');
  assert.equal(m.checks(ds,false).every(c=>c.ok),true);
  assert.equal(m.request(ds).ok,true);assert.equal(on(ds),false);assert.equal(on(id),true);
  assert.equal(m.isPowerConnected(id),false);assert.equal(m.request(ds).ok,false);
  assert.equal(m.checks(ds,true).some(c=>!c.ok),true);
  assert.equal(events.some(e=>e.kind==='command'&&e.message.includes('PO01_'+ds.replace(/-/g,'')+'_OPEN')),true);
 }
});
