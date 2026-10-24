/* Educational connectivity: no voltage magnitudes or relay pickup delays are inferred. */
(function(root){
 'use strict';
 function link(a,b,device=null,directed=false){connections.push(Object.freeze({a,b,device,directed}));}
const connections = [];
// Same electrical graph is used for relay voltage detection and diagram coloring.
link('kepco','r1a','89-R1'); link('r1a','r1b'); link('r1b','ac','52-R1');
link('onsu','r2a','89-R2'); link('r2a','ac','52-R2');
link('sangdong','r3a','89-R3'); link('r3a','ac','52-R3');
link('ac','tr1','52-1'); link('tr1','rec1in'); link('rec1in','rec1out',null,true); link('rec1out','dc','54-1');
link('ac','tr2','52-2'); link('tr2','rec2in'); link('rec2in','rec2out',null,true); link('rec2out','dc','54-2');
for(let i=1;i<=4;i++) {
 link('dc','f'+i,'54-F'+i);
 link('f'+i,'line'+(i+10),i===1?'89-F1':'F'+i);
 link('bypass','line'+(i+10),'Z'+i);
}
link('dc','bypass','54-FS');
link('ac','dtr1','52-D1'); link('dtr1','auxA','52-DB1');
link('ac','dtr2','52-D2'); link('dtr2','auxB','52-DB2');
link('auxA','auxB','52-HT');
link('auxA','h1','52-H1'); link('auxA','h2','52-H2'); link('auxB','h3','52-H3');
link('h1','room1','89-H1'); link('h2','room2','89-H2'); link('h3','room3','89-H3');

 Object.freeze(connections);
 const PRIMARY=Object.freeze({'52-R2':'r2a','52-R3':'r3a'});
 const SOURCES=Object.freeze([
  Object.freeze({id:'kepco',label:'한전 수전',initial:true,adjustable:false}),
  Object.freeze({id:'onsu',label:'온수 측 연계선',initial:false,adjustable:true}),
  Object.freeze({id:'sangdong',label:'상동 측 연계선',initial:false,adjustable:true})
 ]);
 function energized({sources,connected}){
  const hot=new Set(SOURCES.filter(source=>sources[source.id]).map(source=>source.id)),queue=[...hot];
  for(let i=0;i<queue.length;i++){
   const at=queue[i];
   for(const edge of connections){
    if(edge.device&&!connected(edge.device))continue;
    const dest=edge.a===at?edge.b:!edge.directed&&edge.b===at?edge.a:null;
    if(dest&&!hot.has(dest)){hot.add(dest);queue.push(dest);}
   }
  }
  return hot;
 }
 root.PowerNetwork={energized,PRIMARY,SOURCES};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.PowerNetwork;
})(globalThis);
