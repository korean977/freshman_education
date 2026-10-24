/* 52r1.src sequence profile. See docs/52r1-source-logic.md. */
(function(root){
 'use strict';
 const Base=typeof module!=='undefined'&&module.exports?require('./breaker-sequence.js'):root.BreakerSequence;
 const TIMING=Object.freeze({TON_52A:3000,TON_52B:1000,TON_89A:1000,TON_89B:7000,TON_CX:10000,TON_TX:10000,TON_27X:500,TON_84R1:2000});
 const create=options=>Base.create({...options,profile:{cb:'52-R1',ds:'89-R1',timing:TIMING,undervoltage:true}});
 root.R1Sequence={create,TIMING};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.R1Sequence;
})(globalThis);
