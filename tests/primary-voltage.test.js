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
test('R2 upstream supply and 84 remain live through RUN/TEST, DS opening, trips and reset',()=>{
 const {m,tick,on,devices,pending}=setup();
 const verify=()=>{
  const power=m.powerStatus();assert.equal(power.sources.onsu,true);assert.equal(power.primary['52-R2'].node,'onsu');assert.equal(power.primary['52-R2'].live,true);
  for(const id of ['52-R1','52-R2','52-R3'])assert.equal(m.status(id).inputs.R2_84X,true);
 };
 verify();assert.equal(m.setSource('onsu',false).ok,false);verify();
 m.commandR2('close');tick(4000);verify();m.commandR2('open');tick(8000);verify();assert.equal(on('89-R2'),false);
 m.configureR2('position','TEST');m.commandR2('ds-close');m.commandR2('close');m.commandR2('ds-open');verify();
 assert.equal(on('52-R2'),true);assert.equal(on('89-R2'),false);m.setInput('52-R2','OCR50',true);verify();
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);verify();
});
test('R2 always-live 84 inhibits initial RUN close with R1 closed before DS can move',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(4000);
 assert.equal(m.status('52-R2').inputs.R2_84X,true);assert.equal(m.commandR2('close').ok,false);assert.equal(on('89-R2'),false);
 m.commandR1('open');tick(8000);assert.equal(m.commandR2('close').ok,true);tick(4000);assert.equal(on('52-R2'),true);
});
test('R3 upstream line voltage is sensed before DS closing and remains after TEST DS opening',()=>{
 const {m,on}=setup();assert.equal(m.status('52-R3').inputs.R3_84X,false);m.setSource('sangdong',true);
 assert.equal(m.powerStatus().primary['52-R3'].node,'sangdong');assert.equal(m.status('52-R3').inputs.R3_84X,true);
 assert.equal(on('89-R3'),false);assert.equal(m.powerStatus().energized.includes('r3a'),false);
 m.configureR3('position','TEST');m.commandR3('ds-close');m.commandR3('close');m.commandR3('ds-open');
 assert.equal(on('52-R3'),true);assert.equal(on('89-R3'),false);assert.equal(m.status('52-R3').inputs.R3_84X,true);
 m.setSource('sangdong',false);assert.equal(m.status('52-R3').inputs.R3_84X,false);
});
test('R3 live upstream detector inhibits RUN close with R1 energized even when DS is open',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(4000);m.setSource('sangdong',true);
 assert.equal(on('89-R3'),false);assert.equal(m.commandR3('close').ok,false);assert.equal(on('89-R3'),false);
 m.setSource('sangdong',false);assert.equal(m.commandR3('close').ok,true);tick(4000);assert.equal(on('52-R3'),true);
});
test('R3 upstream backfeed requires both RUN CB and DS; opening CB removes it before DS opens',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(4000);assert.equal(m.status('52-R3').inputs.R3_84X,false);
 m.commandR3('close');assert.equal(on('89-R3'),true);assert.equal(m.status('52-R3').inputs.R3_84X,false);
 tick(999);assert.equal(m.status('52-R3').inputs.R3_84X,false);tick(1);assert.equal(m.status('52-R3').inputs.R3_84X,true);
 tick(3000);m.commandR3('open');assert.equal(on('89-R3'),true);assert.equal(m.status('52-R3').inputs.R3_84X,false);
 tick(1000);assert.equal(on('89-R3'),false);tick(7000);assert.equal(m.status('52-R3').sequence.result,'opened');
});
test('R3 opening DS isolates the upstream detector from an energized segment between CB and DS',()=>{
 const {m,tick,on,devices}=setup();m.commandR1('close');tick(4000);
 // Observe the distinct electrical nodes with RUN CB closed and DS open.
 devices.get('52-R3').closed=true;devices.get('89-R3').closed=false;
 let power=m.powerStatus();assert.equal(power.energized.includes('r3a'),true);assert.equal(power.primary['52-R3'].live,false);
 devices.get('89-R3').closed=true;assert.equal(m.status('52-R3').inputs.R3_84X,true);
 devices.get('89-R3').closed=false;power=m.powerStatus();assert.equal(power.energized.includes('r3a'),true);assert.equal(power.primary['52-R3'].live,false);
 assert.equal(on('52-R1'),true);
});
test('TEST R3 CB cannot backfeed upstream voltage, while an external line source still operates 84',()=>{
 const {m,tick}=setup();m.commandR1('close');tick(4000);m.configureR3('position','TEST');m.commandR3('ds-close');m.commandR3('close');
 assert.equal(m.status('52-R3').inputs.R3_84X,false);m.setSource('sangdong',true);assert.equal(m.status('52-R3').inputs.R3_84X,true);
 m.setSource('sangdong',false);assert.equal(m.status('52-R3').inputs.R3_84X,false);
});
test('R3 line voltage persists after RUN CB and DS open when external supply is present',()=>{
 const {m,tick,on}=setup();m.setSource('sangdong',true);m.commandR3('close');tick(4000);
 m.commandR3('open');assert.equal(m.status('52-R3').inputs.R3_84X,true);tick(1000);
 assert.equal(on('89-R3'),false);assert.equal(m.status('52-R3').inputs.R3_84X,true);tick(7000);assert.equal(m.status('52-R3').sequence.result,'opened');
});
test('R3 loss/return of the sole source updates upstream 84 without an invented UVR trip',()=>{
 const {m,tick,on}=setup();m.setSource('sangdong',true);m.commandR3('close');tick(4000);m.setSource('sangdong',false);
 assert.equal(m.status('52-R3').inputs.R3_84X,false);assert.equal(m.powerStatus().energized.includes('ac'),false);
 tick(20000);assert.equal(on('52-R3'),true);assert.deepEqual(m.status('52-R3').active,[]);
 m.setSource('sangdong',true);assert.equal(m.status('52-R3').inputs.R3_84X,true);
});
test('R3 protection opening recomputes upstream voltage according to the remaining line source',()=>{
 for(const lineLive of [false,true]){
  const {m,tick,on}=setup();m.commandR1('close');tick(4000);m.commandR3('close');tick(4000);m.setSource('sangdong',lineLive);
  assert.equal(m.status('52-R3').inputs.R3_84X,true);m.setInput('52-R3','OCR50',true);
  assert.equal(on('52-R3'),false);assert.equal(on('89-R3'),true);assert.equal(m.status('52-R3').inputs.R3_84X,lineLive);
 }
});
test('all 128 RUN topologies agree on upstream detector voltages, diagram nodes and native permits',()=>{
 for(let bits=0;bits<128;bits++){
  const b=i=>!!(bits&(1<<i));const {m,devices}=setup();
  const r1=b(0),ds1=b(1),r2=b(2),ds2=b(3),r3=b(4),ds3=b(5),line3=b(6);
  for(const [id,value] of [['52-R1',r1],['89-R1',ds1],['52-R2',r2],['89-R2',ds2],['52-R3',r3],['89-R3',ds3]])devices.get(id).closed=value;
  m.setSource('sangdong',line3);
  const bus=(r1&&ds1)||(r2&&ds2)||(r3&&ds3&&line3),p3=line3||(r3&&ds3&&bus);
  const power=m.powerStatus();assert.equal(power.primary['52-R2'].live,true);assert.equal(power.primary['52-R3'].live,p3);
  assert.equal(power.energized.includes('ac'),bus);assert.equal(power.energized.includes('onsu'),true);assert.equal(power.energized.includes('sangdong'),p3);
  assert.equal(power.energized.includes('r2a'),ds2||(r2&&bus));assert.equal(power.energized.includes('r3a'),(ds3&&line3)||(r3&&bus));
  for(const id of ['52-R1','52-R2','52-R3']){const state=m.status(id);assert.equal(state.inputs.R2_84X,true);assert.equal(state.inputs.R3_84X,p3);}
  assert.equal(m.checks('52-R2',true).every(c=>c.ok),R2.permit({r2_84x:true,r1Closed:r1,r3Closed:r3,r3_84x:p3}));
  assert.equal(m.checks('52-R3',true).every(c=>c.ok),R3.permit({r3_84x:p3,r1Closed:r1,r2Closed:r2,r2_84x:true}));
 }
});
test('reset preserves the fixed Onsu source, resets Sangdong and cancels pending operations',()=>{
 const {m,devices,pending,tick}=setup();m.setSource('sangdong',true);m.commandR2('close');tick(500);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 assert.deepEqual(m.powerStatus().sources,{kepco:true,onsu:true,sangdong:false});
 for(const id of ['52-R1','52-R2','52-R3']){assert.equal(m.status(id).inputs.R2_84X,true);assert.equal(m.status(id).inputs.R3_84X,false);}
 assert.equal(devices.get('52-R2').closed,false);assert.equal(devices.get('89-R2').closed,false);
 assert.equal(m.setSource('missing',true).ok,false);assert.equal(m.setSource('kepco',false).ok,false);assert.equal(m.setSource('onsu',false).ok,false);
 for(const id of ['52-R1','52-R2','52-R3'])for(const key of ['R2_84X','R3_84X'])assert.throws(()=>m.setInput(id,key,false),/Voltage-derived/);
});
