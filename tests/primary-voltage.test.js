'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../ac-protection.js');
const R2=require('../r2-sequence.js'),R3=require('../r3-sequence.js');
function setup(){
 const devices=new Map(['52-R1','89-R1','52-R2','89-R2','52-R3','89-R3','52-D1','52-DB1','52-DB2','52-H1','89-H1','52-1','54-1'].map(id=>[id,{closed:false}]));
 const events=[],pending=new Map();let now=0,serial=0;
 const m=create({devices,onEvent:e=>events.push({...e,at:now}),setTimer:(fn,ms)=>{const key=++serial;pending.set(key,{fn,at:now+ms});return key;},clearTimer:key=>pending.delete(key)});
 function tick(ms){const target=now+ms;for(let i=0;i<500;i++){
  const due=[...pending].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
  if(!due){now=target;return;}now=due[1].at;pending.delete(due[0]);due[1].fn();
 }throw Error('timer loop');}
 const on=id=>devices.get(id).closed;
 return {m,devices,events,pending,tick,on};
}
for(const [cb,ds,line,key,other] of [['52-R2','89-R2','onsu','R2_84X','R3_84X'],['52-R3','89-R3','sangdong','R3_84X','R2_84X']]){
 test(`${cb}: no primary voltage means 84 OFF even when the common bus is energized`,()=>{
  const {m,tick}=setup();m.commandR1('close');tick(4000);
  assert.equal(m.powerStatus().energized.includes('ac'),true);
  for(const id of ['52-R1','52-R2','52-R3'])assert.equal(m.status(id).inputs[key],false);
  m.configureSequence(cb,'position','TEST');m.commandSequence(cb,'close');
  assert.equal(m.status(cb).inputs[key],false,'TEST CB cannot backfeed primary');
 });
 test(`${cb}: line voltage reaches 84 through DS with CB open; TEST DS-open drops 84`,()=>{
  const {m,on}=setup();m.setSource(line,true);assert.equal(m.status(cb).inputs[key],false);
  m.configureSequence(cb,'position','TEST');m.commandSequence(cb,'ds-close');
  assert.equal(on(cb),false);assert.equal(m.status(cb).inputs[key],true);
  assert.equal(m.powerStatus().energized.includes('ac'),false,'open CB isolates secondary bus');
  m.commandSequence(cb,'close');m.commandSequence(cb,'ds-open');
  assert.equal(on(cb),true);assert.equal(on(ds),false);assert.equal(m.status(cb).inputs[key],false);
 });
 test(`${cb}: RUN closing into an already live bus backfeeds primary; opening releases 84 before DS opens`,()=>{
  const {m,tick,on,events}=setup();m.commandR1('close');tick(4000);
  assert.equal(m.commandSequence(cb,'close').ok,true);assert.equal(on(ds),true);assert.equal(m.status(cb).inputs[key],false);
  tick(999);assert.equal(m.status(cb).inputs[key],false);tick(1);assert.equal(on(cb),true);assert.equal(m.status(cb).inputs[key],true);
  tick(3000);assert.equal(m.status(cb).sequence.result,'closed');
  assert.equal(m.commandSequence(cb,'open').ok,true);assert.equal(on(cb),false);assert.equal(on(ds),true);
  assert.equal(m.status(cb).inputs[key],false);tick(1000);assert.equal(on(ds),false);tick(7000);assert.equal(m.status(cb).sequence.result,'opened');
  assert.equal(events.some(e=>e.kind==='voltage'&&e.id===cb&&e.message.includes('무가압')),true);
 });
 test(`${cb}: live line keeps 84 ON after CB opens, until DS opens`,()=>{
  const {m,tick,on}=setup();m.setSource(line,true);m.commandSequence(cb,'close');
  assert.equal(on(cb),false);assert.equal(m.status(cb).inputs[key],true);tick(4000);
  m.commandSequence(cb,'open');assert.equal(m.status(cb).inputs[key],true);assert.equal(on(ds),true);
  tick(999);assert.equal(m.status(cb).inputs[key],true);tick(1);assert.equal(on(ds),false);assert.equal(m.status(cb).inputs[key],false);
 });
 test(`${cb}: loss/return of primary voltage changes initial permit without inventing UVR trips`,()=>{
  const {m,tick,on}=setup();m.commandR1('close');tick(4000);
  m.configureSequence(cb,'position','TEST');m.commandSequence(cb,'ds-close');m.configureSequence(cb,'position','RUN');
  m.setSource(line,true);assert.equal(m.commandSequence(cb,'close').ok,false);
  m.setSource(line,false);assert.equal(m.commandSequence(cb,'close').ok,true);tick(4000);
  assert.equal(on(cb),true);m.setSource(line,true);m.setSource(line,false);tick(20000);
  assert.equal(on(cb),true);assert.deepEqual(m.status(cb).active,[]);
  assert.equal(m.status(cb).inputs[other],false);
 });
 test(`${cb}: loss of the only line source drops 84 with CB still closed and does not trip`,()=>{
  const {m,tick,on}=setup();m.setSource(line,true);m.commandSequence(cb,'close');tick(4000);
  assert.equal(m.status(cb).inputs[key],true);m.setSource(line,false);
  assert.equal(m.status(cb).inputs[key],false);assert.equal(m.powerStatus().energized.includes('ac'),false);
  tick(20000);assert.equal(on(cb),true);assert.deepEqual(m.status(cb).active,[]);
  m.setSource(line,true);assert.equal(m.status(cb).inputs[key],true);assert.equal(on(cb),true);
 });
 test(`${cb}: protection opening recomputes primary voltage according to the remaining line supply`,()=>{
  for(const lineLive of [false,true]){
   const {m,tick,on}=setup();m.commandR1('close');tick(4000);
   m.commandSequence(cb,'close');tick(4000);m.setSource(line,lineLive);
   assert.equal(m.status(cb).inputs[key],true);m.setInput(cb,'OCR50',true);
   assert.equal(on(cb),false);assert.equal(on(ds),true);assert.equal(m.status(cb).inputs[key],lineLive);
  }
 });
 test(`${cb}: primary voltage change during CX does not cancel native self-hold`,()=>{
  const {m,tick,on}=setup();m.setSource(line,true);m.commandR1('close');tick(4000);
  // DS initially open: detector is dead. Closing DS makes it live after CX has latched.
  assert.equal(m.commandSequence(cb,'close').ok,true);assert.equal(m.status(cb).inputs[key],true);
  assert.equal(m.status(cb).sequence.cx,true);tick(4000);assert.equal(on(cb),true);assert.equal(m.status(cb).sequence.result,'closed');
 });
}
test('all 256 RUN topologies use the same primary voltage in diagram nodes, shared contacts and native permits',()=>{
 for(let bits=0;bits<256;bits++){
  const b=i=>!!(bits&(1<<i));const {m,devices}=setup();
  const r1=b(0),ds1=b(1),r2=b(2),ds2=b(3),r3=b(4),ds3=b(5),line2=b(6),line3=b(7);
  for(const [id,value] of [['52-R1',r1],['89-R1',ds1],['52-R2',r2],['89-R2',ds2],['52-R3',r3],['89-R3',ds3]])devices.get(id).closed=value;
  m.setSource('onsu',line2);m.setSource('sangdong',line3);
  const bus=(r1&&ds1)||(r2&&ds2&&line2)||(r3&&ds3&&line3),p2=(ds2&&line2)||(r2&&bus),p3=(ds3&&line3)||(r3&&bus);
  const power=m.powerStatus();assert.equal(power.primary['52-R2'].live,p2);assert.equal(power.primary['52-R3'].live,p3);
  assert.equal(power.energized.includes('ac'),bus);assert.equal(power.energized.includes('r2a'),p2);assert.equal(power.energized.includes('r3a'),p3);
  for(const id of ['52-R1','52-R2','52-R3']){
   const state=m.status(id);assert.equal(state.inputs.R2_84X,p2);assert.equal(state.inputs.R3_84X,p3);
  }
  const permit2=R2.permit({r2_84x:p2,r1Closed:r1,r3Closed:r3,r3_84x:p3}),permit3=R3.permit({r3_84x:p3,r1Closed:r1,r2Closed:r2,r2_84x:p2});
  assert.equal(m.checks('52-R2',true).every(c=>c.ok),permit2);assert.equal(m.checks('52-R3',true).every(c=>c.ok),permit3);
 }
});
test('source reset restores dead tie lines, derived OFF relays and cancels timers without stale operations',()=>{
 const {m,devices,pending,tick}=setup();m.setSource('onsu',true);m.setSource('sangdong',true);m.commandR2('close');tick(500);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 assert.deepEqual(m.powerStatus().sources,{kepco:true,onsu:false,sangdong:false});
 for(const id of ['52-R1','52-R2','52-R3']){assert.equal(m.status(id).inputs.R2_84X,false);assert.equal(m.status(id).inputs.R3_84X,false);}
 assert.equal(devices.get('52-R2').closed,false);
 assert.equal(m.setSource('missing',true).ok,false);assert.equal(m.setSource('kepco',false).ok,false);
});
