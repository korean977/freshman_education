'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../ac-protection.js');
function setup(){
 const ids=['52-R1','52-R2','89-R2','52-R3','89-R1','52-D1','52-DB1','52-DB2','52-HT','52-H1','89-H1','52-1','54-1'];
 const devices=new Map(ids.map(id=>[id,{id,closed:false}]));
 const events=[];const pending=new Map();let now=0,serial=0;
 const model=create({devices,onEvent:event=>events.push(event),setTimer(fn,ms){const id=++serial;pending.set(id,{fn,at:now+ms});return id;},clearTimer(id){pending.delete(id);}});
 function tick(ms){const target=now+ms;while(true){const due=[...pending.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;pending.delete(due[0]);due[1].fn();}now=target;}
 const close=id=>{if(id==='89-R1')assert.equal(model.configureR1('position','TEST').ok,true);assert.equal(model.request(id).ok,true,id+' should be permitted');if(id==='52-R1')tick(4000);assert.equal(devices.get(id).closed,true,id+' should close');if(id==='89-R1')assert.equal(model.configureR1('position','RUN').ok,true);};
 return {model,devices,events,tick,pending,close};
}
test('D1/DB1 closing sequence; DB1 must open before manual D1 opening',()=>{
 const {model,devices,close}=setup();
 assert.equal(model.request('52-DB1').ok,false);
 close('52-D1');close('52-DB1');
 assert.equal(model.request('52-D1').ok,false);
 assert.equal(devices.get('52-D1').closed,true);
 assert.equal(model.request('52-DB1').ok,true);
 assert.equal(model.request('52-D1').ok,true);
});
test('D1 protection bypasses manual interlock and trips DB1 through D1 FAULT',()=>{
 const {model,devices,events,close}=setup();close('52-D1');close('52-DB1');
 model.setInput('52-D1','OCR50',true);
 assert.equal(devices.get('52-D1').closed,false);assert.equal(devices.get('52-DB1').closed,false);
 assert.deepEqual(events.filter(e=>e.kind==='trip').map(e=>e.id),['52-D1','52-DB1']);
 assert.equal(model.request('52-D1').ok,false);
 model.setInput('52-D1','OCR50',false);
 close('52-D1'); // An indication _F is not an active 86X interlock.
});
test('alarm-only and unresolved D1 temperature path do not invent trips',()=>{
 const {model,devices,close}=setup();close('52-D1');
 for(const key of ['GAS1','TR26AL','TR26TP','DB1_FAULT','EXTINGUISHER'])model.setInput('52-D1',key,true);
 assert.equal(devices.get('52-D1').closed,true);
 assert.equal(model.status('52-D1').active.length,0);
});
test('latched 87T and gas2 remain interlocking until source cleared and reset',()=>{
 for(const key of ['87T','GAS2']){
  const {model,close}=setup();close('52-D1');model.setInput('52-D1',key,true);
  assert.equal(model.resetIndicators('52-D1').ok,false);
  model.setInput('52-D1',key,false);
  assert.equal(model.request('52-D1').ok,false);
  assert.equal(model.resetIndicators('52-D1').ok,true);close('52-D1');
 }
});
const r1Source=require('./fixtures/52r1-protection.json');
test('R1 source G86X OR branches all drive CB1_52R1_OPEN and inhibit reclosing',()=>{
 for(const symbol of r1Source.g86x.or_inputs){
  const {model,devices,events,close}=setup();close('89-R1');close('52-R1');
  const key=r1Source.input_mapping[symbol];
  model.setInput('52-R1',key,true);
  assert.equal(devices.get('52-R1').closed,false,symbol+' must trip');
  assert.equal(devices.get('89-R1').closed,true,'G86X must not invent a DS open command');
  assert.equal(model.request('52-R1').ok,false,'active cause must inhibit reclosing');
  const sequence=events.filter(e=>e.id==='52-R1');
  assert.deepEqual(sequence.filter(e=>['input','relay','trip'].includes(e.kind)).map(e=>e.kind),['input','relay','trip']);
  assert.match(sequence.find(e=>e.kind==='trip').message,/G86X → CB1_52R1_OPEN/);
 }
});
test('R1 fire, gas1, PT fuse and extinguisher inputs only indicate as in source',()=>{
 for(const key of r1Source.indication_only_inputs){
  const {model,devices,events,close}=setup();close('52-R1');model.setInput('52-R1',key,true);
  assert.equal(devices.get('52-R1').closed,true,key+' must not trip');
  assert.deepEqual(model.status('52-R1').active,[]);
  assert.equal(model.status('52-R1').flags.includes(key),true);
  assert.equal(events.some(e=>e.kind==='trip'),false);
  model.request('52-R1');close('52-R1');
 }
});
test('R1 cleared OCR permits reclose despite indication; gas2 requires source clear and reset',()=>{
 const {model,close}=setup();close('52-R1');model.setInput('52-R1','OCR50',true);
 model.setInput('52-R1','OCR50',false);
 assert.equal(model.status('52-R1').flags.includes('G86X'),true);close('52-R1');
 model.setInput('52-R1','GAS2',true);
 assert.equal(model.resetIndicators('52-R1').ok,false);
 model.setInput('52-R1','GAS2',false);
 assert.equal(model.request('52-R1').ok,false);
 assert.equal(model.resetIndicators('52-R1').ok,true);close('52-R1');
});
test('R1 permits exactly the R2/R3 a/b contact truth table',()=>{
 for(const r2 of [false,true])for(const x2 of [false,true])for(const r3 of [false,true])for(const x3 of [false,true]){
  const {model,devices}=setup();devices.get('52-R2').closed=r2;devices.get('52-R3').closed=r3;
  model.setInput('52-R1','R2_84X',x2);model.setInput('52-R1','R3_84X',x3);
  assert.equal(model.request('52-R1').ok,(!r2||!x2)&&(!r3||!x3));
 }
});
test('HT cannot close with both DB feeders closed; DB1 unresolved HT-on branch remains blocked',()=>{
 const {model,devices,close}=setup();close('52-D1');close('52-DB1');devices.get('52-DB2').closed=true;
 assert.equal(model.request('52-HT').ok,false);
 devices.get('52-DB2').closed=false;close('52-HT');model.request('52-DB1');
 assert.equal(model.request('52-DB1').ok,false);
 assert.match(model.checks('52-DB1').find(c=>!c.ok).text,/도면 확인/);
});
test('H1 requires 89-H1 and its disconnector cannot move while H1 closed',()=>{
 const {model,close}=setup();assert.equal(model.request('52-H1').ok,false);
 close('89-H1');close('52-H1');assert.equal(model.request('89-H1').ok,false);
 model.setInput('52-H1','SGR',true);
 assert.equal(model.request('89-H1').ok,true);
 assert.equal(model.resetIndicators('52-H1').ok,false);
});
test('H1 UVR1 inhibits closing but does not invent its own trip path',()=>{
 const {model,devices,close}=setup();close('89-H1');close('52-H1');
 model.setInput('52-H1','UVR1',true);assert.equal(devices.get('52-H1').closed,true);
 model.request('52-H1');assert.equal(model.request('52-H1').ok,false);
});
test('DB1 27T waits 0.5 seconds; one pulse trips DB1 and H1',()=>{
 const {model,devices,close,tick,events}=setup();close('52-D1');close('52-DB1');close('89-H1');close('52-H1');
 model.setInput('52-DB1','UVR1',true);tick(499);
 assert.equal(devices.get('52-DB1').closed,true);assert.equal(devices.get('52-H1').closed,true);
 tick(1);assert.equal(devices.get('52-DB1').closed,false);assert.equal(devices.get('52-H1').closed,false);
 assert.equal(devices.get('52-D1').closed,true);
 assert.equal(events.some(e=>e.kind==='timer'),true);
});
test('DB1 27T does not run with CB open and cancels short inputs',()=>{
 const {model,close,tick,devices}=setup();model.setInput('52-DB1','UVR1',true);tick(1000);
 assert.equal(model.status('52-DB1').flags.includes('27TX'),false);
 close('52-D1');close('52-DB1');tick(250);model.setInput('52-DB1','UVR1',false);tick(1000);
 assert.equal(devices.get('52-DB1').closed,true);
});
test('DB1 own OCR trips DB1 but is only an indication upstream; 64T remains pending',()=>{
 const {model,devices,close}=setup();close('52-D1');close('52-DB1');
 model.setInput('52-DB1','64T',true);assert.equal(devices.get('52-DB1').closed,true);
 model.setInput('52-DB1','OCR51',true);assert.equal(devices.get('52-DB1').closed,false);assert.equal(devices.get('52-D1').closed,true);
 assert.equal(model.status('52-D1').received.length,1);
 assert.equal(model.resetIndicators('52-D1').ok,false);
});
test('R1 disconnector must not move under its closed CB',()=>{
 const {model,devices,close,tick}=setup();close('89-R1');close('52-R1');assert.equal(model.request('89-R1').ok,false);
 model.request('52-R1');tick(8000);assert.equal(devices.get('89-R1').closed,false);
 assert.equal(model.configureR1('position','TEST').ok,true);assert.equal(model.request('89-R1').ok,true);
});
test('52S1 maps to 52-1; NEG input and AC→HSCB permitting/opening are enforced',()=>{
 const {model,devices,close}=setup();assert.equal(model.request('54-1').ok,false);
 model.setInput('52-1','NEG_A',false);assert.equal(model.request('52-1').ok,false);
 model.setInput('52-1','NEG_A',true);close('52-1');close('54-1');
 assert.equal(model.request('52-1').ok,false);
 model.setInput('52-1','REC26TP',true);
 assert.equal(devices.get('52-1').closed,false);assert.equal(devices.get('54-1').closed,false);
});
test('HSCB fault needs 1 second, independent of 500ms alarm pulses elsewhere',()=>{
 const {model,devices,close,tick}=setup();close('52-1');
 model.setInput('52-1','HSCB_FAULT',true);tick(999);assert.equal(devices.get('52-1').closed,true);
 tick(1);assert.equal(devices.get('52-1').closed,false);
});
test('global reset cancels timers and clears indicators; no delayed trip after reset',()=>{
 const {model,devices,close,tick,pending}=setup();close('52-1');model.setInput('52-1','HSCB_FAULT',true);
 tick(300);model.reset();assert.equal(pending.size,0);tick(2000);
 assert.equal(devices.get('52-1').closed,true);assert.deepEqual(model.status('52-1').flags,[]);
 assert.equal(model.status('52-1').inputs.NEG_A,true);
});
test('invalid inputs are rejected; unmodeled devices retain basic operation only',()=>{
 const {model,close}=setup();assert.throws(()=>model.setInput('52-D1','made-up',true));
 assert.equal(model.request('missing').ok,false);close('52-R3');
});
