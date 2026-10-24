/* 52r2.src: source-specific CX permit and 8s close / 10s open limits. */
(function(root){
 'use strict';
 const Base=typeof module!=='undefined'&&module.exports?require('./breaker-sequence.js'):root.BreakerSequence;
 const TIMING=Object.freeze({TON_52A:3000,TON_52B:1000,TON_89A:1000,TON_89B:7000,TON_CX:8000,TON_TX:10000});
 // Source rows 47–51: upper NC-own-84X branch has three alternatives;
 // lower NO-own-84X branch requires R1 open and (R3 open or R3 84X inactive).
 const permit=({r2_84x,r1Closed,r3Closed,r3_84x,g86x=false})=>!g86x&&(!r2_84x||(!r1Closed&&(!r3Closed||!r3_84x)));
 const create=options=>Base.create({...options,profile:{cb:'52-R2',ds:'89-R2',timing:TIMING,undervoltage:false,emitTestDSOpenWhileCBClosed:true,allowTestDSOpenWhileCBClosed:true}});
 root.R2Sequence={create,TIMING,permit};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.R2Sequence;
})(globalThis);
