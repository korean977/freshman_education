/* Boolean ladder networks exported from GIPAM SRC/PCI. A scan preserves source order.
 * Inputs are operated contacts, not analog relay settings. Timers use injected clocks. */
(function(root){
 'use strict';
 function create(program,{setTimer=setTimeout,clearTimer=clearTimeout,wake=()=>{},onTimer=()=>{}}={}){
  let values={},edges=new Map(),timers=new Map();
  function timer(name,kind,ms,input){
   if(!timers.has(name))timers.set(name,{q:false,previous:false,handle:null,done:false,kind,ms});
   const t=timers.get(name),rise=input&&!t.previous,fall=!input&&t.previous;
   function cancel(){if(t.handle!==null)clearTimer(t.handle);t.handle=null;}
   function start(end){t.handle=setTimer(()=>{t.handle=null;t.q=end;t.done=true;onTimer(name,false);wake();},ms);onTimer(name,true);}
   if(kind==='TON'){
    if(!input){cancel();t.q=false;t.done=false;}
    else if(!t.q&&t.handle===null&&!t.done)start(true);
   }else if(kind==='TP'){
    if(rise&&!t.q){t.q=true;t.done=false;start(false);}
   }else if(kind==='TOF'){
    if(input){cancel();t.q=true;t.done=false;}
    else if(fall){cancel();start(false);}
   }else throw new Error('Unsupported timer '+kind);
   t.previous=input;return t.q;
  }
  function scan(inputs={}){
   Object.assign(values,inputs);let changed=false;
   program.networks.forEach((net,ni)=>{
    const graph=new Map(),join=(a,b)=>{if(!graph.has(a))graph.set(a,[]);graph.get(a).push(b);};
    net.edges.forEach(([a,b,name,type],ei)=>{
     const key=ni+':'+ei,v=!!values[name],old=!!edges.get(key);
     const on=type===1?v:type===2?!v:type===3?v&&!old:!v&&old;
     edges.set(key,v);if(on){join(a,b);join(b,a);}
    });
    function reach(){
     const seen=new Set([net.rail]),queue=[net.rail];
     for(const [,out,,name] of net.timers)if(timers.get(name)?.q&&!seen.has(out)){seen.add(out);queue.push(out);}
     for(const at of queue)for(const to of graph.get(at)||[])if(!seen.has(to)){seen.add(to);queue.push(to);}
     return seen;
    }
    let live=reach();
    for(const [at,,kind,name,ms] of net.timers)timer(name,kind,ms,live.has(at));
    live=reach();
    for(const [at,name] of net.coils){const v=live.has(at);if(!!values[name]!==v)changed=true;values[name]=v;}
   });
   return changed;
  }
  const snapshot=()=>({...values});
  const pending=()=>[...timers].filter(([,t])=>t.handle!==null).map(([key,t])=>({key,kind:t.kind,ms:t.ms,label:`${key} · ${t.kind} ${t.ms/1000}초`,q:t.q}));
  function reset(){for(const t of timers.values())if(t.handle!==null)clearTimer(t.handle);values={};edges.clear();timers.clear();}
  return {scan,snapshot,pending,reset};
 }
 root.LadderRuntime={create};if(typeof module!=='undefined'&&module.exports)module.exports=root.LadderRuntime;
})(globalThis);
