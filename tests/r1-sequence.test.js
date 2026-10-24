'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../ac-protection.js');
const {TIMING}=require('../r1-sequence.js');
const source=require('./fixtures/52r1-sequence.json');
function setup(){
 const devices=new Map(['52-R1','89-R1','52-R2','89-R2','52-R3','89-R3','52-D1','52-DB1','52-DB2','52-H1','89-H1','52-1','54-1'].map(id=>[id,{closed:false}]));
 const events=[],pending=new Map();let now=0,serial=0;
 const m=create({devices,onEvent:e=>events.push({...e,at:now}),setTimer:(fn,ms)=>{const id=++serial;pending.set(id,{fn,at:now+ms});return id},clearTimer:id=>pending.delete(id)});
 function tick(ms){const target=now+ms;for(let i=0;i<200;i++){const due=[...pending.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){now=target;return}now=due[1].at;pending.delete(due[0]);due[1].fn();}throw Error('timer loop');}
 const on=id=>devices.get(id).closed;
 const seq=()=>m.status('52-R1').sequence;
 const close=()=>{assert.equal(m.commandR1('close').ok,true);tick(4000);assert.equal(on('52-R1'),true);assert.equal(seq().busy,false);};
 return {m,devices,events,pending,tick,on,seq,close};
}
test('native TON presets match decoded source, including 10s command limits and NC 84X',()=>{
 assert.deepEqual(TIMING,Object.fromEntries(Object.entries(source.timers).map(([key,s])=>[key,s.ms])));
 assert.equal(source['84X_timer_enable'],'NOT DI31_52R1_84X');
});
test('RUN close operates DS first, waits 1s, closes CB, holds CX until 3s CB feedback',()=>{
 const {m,tick,on,seq,events}=setup();assert.equal(m.commandR1('close').ok,true);
 assert.equal(on('89-R1'),true);assert.equal(on('52-R1'),false);assert.equal(seq().cx,true);
 tick(999);assert.equal(on('52-R1'),false);tick(1);assert.equal(on('52-R1'),true);
 tick(2999);assert.equal(seq().cx,true);tick(1);assert.equal(seq().cx,false);
 const writes=events.filter(e=>e.message.includes(' · 시퀀스 '));
 assert.deepEqual(writes.map(e=>e.id),['89-R1','52-R1']);assert.deepEqual(writes.map(e=>e.at),[0,1000]);
 assert.match(seq().stage,/완료/);
});
test('RUN open opens CB first, waits 1s, opens DS, holds TX until 7s DS feedback',()=>{
 const {m,tick,on,seq,events,close}=setup();close();events.length=0;
 assert.equal(m.commandR1('open').ok,true);assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),true);
 tick(999);assert.equal(on('89-R1'),true);tick(1);assert.equal(on('89-R1'),false);
 tick(6999);assert.equal(seq().tx,true);tick(1);assert.equal(seq().tx,false);
 assert.deepEqual(events.filter(e=>e.message.includes(' · 시퀀스 ')).map(e=>e.id),['52-R1','89-R1']);
});
test('failed DS close times out at 10s and never closes CB later',()=>{
 const {m,tick,on,seq}=setup();m.configureR1('failDS',true);m.commandR1('close');tick(9999);
 assert.equal(seq().busy,true);assert.equal(on('52-R1'),false);tick(1);assert.equal(seq().busy,false);
 assert.equal(seq().result,'close-timeout');m.configureR1('failDS',false);tick(20000);assert.equal(on('52-R1'),false);
 m.commandR1('close');tick(4000);assert.equal(on('52-R1'),true);
});
test('failed CB close times out without inventing feedback',()=>{
 const {m,tick,on,seq}=setup();m.configureR1('failCB',true);m.commandR1('close');tick(10000);
 assert.equal(on('89-R1'),true);assert.equal(on('52-R1'),false);assert.equal(seq().result,'close-timeout');
});
test('failed CB opening does not open DS under load; command expires after 10s',()=>{
 const {m,tick,on,seq,close}=setup();close();m.configureR1('failCB',true);m.commandR1('open');tick(10000);
 assert.equal(on('52-R1'),true);assert.equal(on('89-R1'),true);assert.equal(seq().result,'open-timeout');
});
test('failed DS opening holds CB open and ends at 10s limit',()=>{
 const {m,tick,on,seq,close}=setup();close();m.configureR1('failDS',true);m.commandR1('open');tick(10000);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),true);assert.equal(seq().result,'open-timeout');
});
test('G86X wins during close command and held close coil cannot reclose after clearing',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(1200);assert.equal(on('52-R1'),true);
 m.setInput('52-R1','OCR50',true);assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),true);
 m.setInput('52-R1','OCR50',false);tick(20000);assert.equal(on('52-R1'),false);
});
test('G86X before CB close suppresses the close edge',()=>{
 const {m,tick,on}=setup();m.commandR1('close');tick(500);m.setInput('52-R1','OCR51',true);tick(20000);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),true);
});
test('open command interrupts a pending close without stale close later',()=>{
 const {m,tick,on,seq}=setup();m.commandR1('close');tick(500);m.commandR1('open');tick(20000);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),false);assert.equal(seq().busy,false);
});
test('a new close can interrupt an open and cancels future DS-open output',()=>{
 const {m,tick,on,close}=setup();close();m.commandR1('open');tick(300);m.commandR1('close');tick(20000);
 assert.equal(on('52-R1'),true);assert.equal(on('89-R1'),true);
});
test('UVR1 with closed CB generates G27X after 0.5s and trips',()=>{
 const {m,tick,on,close,events}=setup();close();m.setInput('52-R1','UVR1',true);tick(499);
 assert.equal(on('52-R1'),true);tick(1);assert.equal(on('52-R1'),false);
 assert.equal(events.some(e=>e.message.includes('TON_27X')),true);
 assert.equal(m.status('52-R1').flags.includes('UVR'),true);
});
test('brief UVR1 input is cancelled before 0.5s; open CB alone does not start G27X',()=>{
 const {m,tick,on,close}=setup();m.setInput('52-R1','UVR1',true);tick(2000);assert.equal(m.status('52-R1').flags.includes('UVR'),false);
 m.setInput('52-R1','UVR1',false);close();m.setInput('52-R1','UVR1',true);tick(250);m.setInput('52-R1','UVR1',false);tick(1000);
 assert.equal(on('52-R1'),true);
});
test('84X timer uses b contact: normal true does not trip, false trips at 2s',()=>{
 const {m,tick,on,close}=setup();close();tick(10000);assert.equal(on('52-R1'),true);
 m.setInput('52-R1','R1_84X',false);tick(1999);assert.equal(on('52-R1'),true);tick(1);assert.equal(on('52-R1'),false);
 assert.equal(m.request('52-R1').ok,false);assert.equal(m.resetIndicators('52-R1').ok,false);m.setInput('52-R1','R1_84X',true);assert.equal(m.commandR1('close').ok,true);
});
test('TEST closes CB individually, bypasses RUN permit and disconnects primary power',()=>{
 const {m,on,devices}=setup();m.configureR1('position','TEST');devices.get('52-R2').closed=true;devices.get('89-R2').closed=true;m.setSource('onsu',true);
 assert.equal(m.commandR1('close').ok,true);assert.equal(on('52-R1'),true);assert.equal(on('89-R1'),false);
 assert.equal(m.isPowerConnected('52-R1'),false);m.setInput('52-R1','OCR50',true);assert.equal(on('52-R1'),false);
});
test('TEST DS opening allows closed CB; DS closing still needs open CB and RUN direct is blocked',()=>{
 const {m,on}=setup();assert.equal(m.request('89-R1').ok,false);m.configureR1('position','TEST');
 assert.equal(m.commandR1('ds-close').ok,true);assert.equal(on('89-R1'),true);m.commandR1('close');
 assert.equal(m.commandR1('ds-open').ok,true);assert.equal(on('89-R1'),false);assert.equal(on('52-R1'),true);
 assert.equal(m.commandR1('ds-close').ok,false);m.commandR1('open');assert.equal(m.commandR1('ds-close').ok,true);
});
test('LOCAL/REMOTE command routing and config changes are enforced',()=>{
 const {m,tick,seq}=setup();m.configureR1('location','REMOTE');
 assert.equal(m.commandR1('close','LOCAL').ok,false);assert.equal(m.commandR1('close','REMOTE').ok,true);
 assert.equal(m.configureR1('location','LOCAL').ok,false);tick(4000);assert.equal(seq().location,'REMOTE');
 assert.equal(m.configureR1('position','TEST').ok,false);
});
test('repeat close request does not restart 10s limit',()=>{
 const {m,tick,seq}=setup();m.configureR1('failDS',true);m.commandR1('close');tick(5000);
 assert.equal(m.commandR1('close').ok,false);tick(5000);assert.equal(seq().result,'close-timeout');
});
test('global reset cancels pending outputs and timers, restores RUN/LOCAL',()=>{
 const {m,tick,on,seq,devices,pending}=setup();m.configureR1('location','REMOTE');m.commandR1('close');tick(500);
 for(const d of devices.values())d.closed=false;m.reset();assert.equal(pending.size,0);tick(30000);
 assert.equal(on('52-R1'),false);assert.equal(on('89-R1'),false);assert.equal(seq().position,'RUN');assert.equal(seq().location,'LOCAL');
});
test('invalid sequence commands/settings are rejected',()=>{
 const {m}=setup();assert.equal(m.commandR1('invalid').ok,false);assert.equal(m.configureR1('position','invalid').ok,false);
 assert.equal(m.configureR1('location','invalid').ok,false);assert.equal(m.configureR1('unknown',true).ok,false);
});
