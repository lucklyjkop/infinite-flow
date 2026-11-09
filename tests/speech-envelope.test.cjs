'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {build}=require('../loading-page/speech-envelope.js');

function audio({duration=1,sampleRate=24000,frequency=200,amplitude=.2,voiced=()=>true}={}){
  const length=Math.round(duration*sampleRate);
  const channel=Float32Array.from({length},(_,index)=>{
    const time=index/sampleRate;return voiced(time)?amplitude*Math.sin(2*Math.PI*frequency*time):0;
  });
  return {duration:length/sampleRate,length,sampleRate,numberOfChannels:1,getChannelData:()=>channel};
}
function samples(envelope,start,end,step=.005){
  const result=[];for(let time=start;time<end;time+=step)result.push(envelope.sample(time));return result;
}
const spread=values=>Math.max(...values)-Math.min(...values);

test('silence and quiet background noise stay completely closed',()=>{
  for(const amplitude of [0,.001,.004]){
    const envelope=build(audio({amplitude,frequency:137}));
    assert.equal(envelope.peak,0);assert.ok(samples(envelope,0,1).every(value=>value===0));
  }
});

test('sustained voiced sound has a stable mouth instead of pitch-cycle chatter',()=>{
  const envelope=build(audio()),steady=samples(envelope,.2,.85,.001);
  assert.ok(Math.min(...steady)>.6);assert.ok(Math.max(...steady)<=.680001);
  assert.ok(spread(steady)<.015,`mouth jitter=${spread(steady)}`);
});

test('speech bursts open continuously and pauses return to a fully closed pose',()=>{
  const envelope=build(audio({duration:1.5,voiced:time=>(time>=.1&&time<.3)||(time>=.65&&time<.9)}));
  assert.equal(envelope.sample(.02),0);
  assert.ok(envelope.sample(.22)>.55);assert.equal(envelope.sample(.53),0);
  assert.ok(envelope.sample(.8)>.6);assert.equal(envelope.sample(1.16),0);
  const points=samples(envelope,0,1.45,.005);
  assert.ok(points.every(value=>value>=0&&value<=.680001));
  assert.ok(points.slice(1).every((value,index)=>Math.abs(value-points[index])<.13),'opening and closing should not jump');
});

test('different recorded loudness keeps comparable syllable articulation',()=>{
  const voiced=time=>(time>=.1&&time<.4)||(time>=.7&&time<.95);
  const soft=build(audio({amplitude:.12,voiced})),loud=build(audio({amplitude:.7,voiced}));
  for(let time=.1;time<1;time+=.01){
    assert.ok(Math.abs(soft.sample(time)-loud.sample(time))<.035,`loudness should not change motion at ${time}`);
  }
  assert.ok(soft.peak>.6&&loud.peak>.6);
});

test('male and female pitch ranges retain the same syllable rhythm',()=>{
  const voiced=time=>(time>=.1&&time<.35)||(time>=.65&&time<.9);
  const low=build(audio({frequency:120,voiced})),high=build(audio({frequency:300,voiced}));
  const lowPoints=samples(low,0,1),highPoints=samples(high,0,1);
  const difference=lowPoints.map((value,index)=>Math.abs(value-highPoints[index]));
  assert.ok(Math.max(...difference)<.055,`pitch difference=${Math.max(...difference)}`);
  for(const time of [.02,.59])assert.equal(low.sample(time)+high.sample(time),0);
  for(const time of [.25,.8])assert.ok(low.sample(time)>.55&&high.sample(time)>.55);
});

test('invalid and out-of-duration clock values always close the mouth',()=>{
  const envelope=build(audio());
  for(const time of [-1,-.001,1,1.001,NaN,Infinity,-Infinity])assert.equal(envelope.sample(time),0);
  const empty=build({duration:0,length:0,sampleRate:24000,numberOfChannels:0});
  assert.equal(empty.peak,0);assert.equal(empty.sample(0),0);
});
