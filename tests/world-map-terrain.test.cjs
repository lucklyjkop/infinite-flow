const test=require('node:test');
const assert=require('node:assert/strict');
const {heightAt,silhouetteAt,localPhase,position,stops}=require('../loading-page/world-map-terrain.js');

test('terrain remains finite and bounded across the whole relief',()=>{
  let highest=0;
  for(let y=0;y<=60;y++)for(let x=0;x<=120;x++){
    const height=heightAt(x/120,y/60),alpha=silhouetteAt(x/120,y/60);
    assert.ok(Number.isFinite(height)&&height>0&&height<1);
    assert.ok(Number.isFinite(alpha)&&alpha>=0&&alpha<=1);
    highest=Math.max(highest,height);
  }
  assert.ok(highest>.55,'a mountain relief must contain actual peaks');
});

test('the initial view is pixel-aligned with its source frame',()=>{
  const state={progress:0,pointerX:1,pointerY:-1};
  for(const [width,height] of [[1920,1080],[1440,900],[1440,700]])for(const stop of stops){
    const point=position(stop.u,stop.v,heightAt(stop.u,stop.v),width,height,state);
    assert.equal(point.x,stop.u*width);
    assert.equal(point.y,stop.v*height);
  }
});

test('one fault passes every cell once and fully settles before progress one',()=>{
  for(const u of [0,.25,.5,.75,1])for(const v of [0,.5,1]){
    assert.equal(localPhase(u,v,0),0);
    assert.equal(localPhase(u,v,1),1);
    let previous=0;
    for(let frame=0;frame<=100;frame++){
      const value=localPhase(u,v,frame/100);assert.ok(value>=previous);previous=value;
    }
  }
});

test('level anchors stay left-to-right under either parallax extreme',()=>{
  for(const pointerX of [-1,1])for(const pointerY of [-1,1]){
    let previous=-Infinity;
    for(const stop of stops){
      const point=position(stop.u,stop.v,heightAt(stop.u,stop.v),1440,900,{progress:1,pointerX,pointerY});
      assert.ok(point.x>previous);assert.ok(point.y>900*.20&&point.y<900*.86);previous=point.x;
    }
  }
});
