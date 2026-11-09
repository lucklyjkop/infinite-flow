const test=require('node:test');
const assert=require('node:assert/strict');
const {heightAt,silhouetteAt,localPhase,position,stops,pathAt,habitatAt,materialColors,decorationsFor,updateState,sourceLayout,getGeometry,prepareGeometry}=require('../loading-page/world-map-terrain.js');

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

test('chapter terrain is deterministic, distinct and bounded at large chapter indices',()=>{
  const signatures=[];
  for(const chapter of [0,1,2,8,1003,Number.MAX_SAFE_INTEGER]){
    const heights=[];
    for(let y=0;y<=24;y++)for(let x=0;x<=48;x++){
      const u=x/48,v=y/24,height=heightAt(u,v,chapter),habitat=habitatAt(u,v,chapter);
      assert.ok(height>=.036&&height<=.86);
      assert.equal(height,heightAt(u,v,chapter));
      for(const value of Object.values(habitat))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
      heights.push(height);
    }
    signatures.push(heights.join(','));
    for(const stop of stops){
      assert.ok(Math.abs(pathAt(stop.u,chapter).v-stop.v)<1e-10,'route must reach every fixed stage');
      const point=position(stop.u,stop.v,heightAt(stop.u,stop.v,chapter),1440,900,{progress:1,pointerX:0,pointerY:0});
      assert.ok(point.y>900*.20&&point.y<900*.86);
    }
  }
  assert.equal(new Set(signatures).size,signatures.length);
});

test('the currently available stage is lit without marking it completed',()=>{
  const state={progress:1,completedCount:0,litCount:1,chapterIndex:0,selectedIndex:0,pointerX:0,pointerY:0};
  updateState(state,{completedCount:0});assert.equal(state.litCount,1);assert.equal(state.completedCount,0);
  updateState(state,{completedCount:2});assert.equal(state.litCount,3);assert.equal(state.completedCount,2);
  updateState(state,{chapterIndex:10,completedCount:0,litCount:0});assert.equal(state.litCount,0);
  updateState(state,{pointerX:.4});assert.equal(state.litCount,0,'pointer updates must not unlock a chapter');
  updateState(state,{completedCount:6});assert.equal(state.litCount,6);
});

test('decoration clusters stay bounded and leave stage labels and paths unobstructed',()=>{
  for(const chapter of [0,1,2,3,5,8,100,999999]){
    const decorations=decorationsFor(chapter);
    assert.ok(decorations.length>=40&&decorations.length<=65);
    assert.deepEqual(decorations,decorationsFor(chapter));
    for(const item of decorations){
      assert.ok(item.u>=0&&item.u<=1&&item.v>=0&&item.v<=1);
      assert.ok(Number.isInteger(item.type)&&item.type>=0&&item.type<=11);
      assert.ok(item.scale>.25&&item.scale<1);
      assert.ok(!stops.some(stop=>Math.abs(stop.u-item.u)<.065&&Math.abs(stop.v-item.v)<.16));
      if(![5,6,8].includes(item.type))assert.ok(Math.abs(item.v-pathAt(item.u,chapter).v)>=.045);
    }
    decorations[0].u=100;assert.notEqual(decorationsFor(chapter)[0].u,100,'callers must not mutate the cached layout');
  }
});

test('neighbour pages sample one screen-anchored photograph without duplication at either DPR',()=>{
  for(const dpr of [1,2]){
    const pageWidth=1320,viewportWidth=390,viewportHeight=844,camera=1100;
    const a=sourceLayout(pageWidth,viewportHeight,viewportWidth*dpr,viewportHeight*dpr,{sourceOffsetX:-camera});
    const b=sourceLayout(pageWidth,viewportHeight,viewportWidth*dpr,viewportHeight*dpr,{sourceOffsetX:pageWidth-camera});
    assert.equal(a.width,viewportWidth);assert.equal(b.width,viewportWidth);
    const leftAtSeam=1*a.scale+a.offset,rightAtSeam=b.offset;
    assert.ok(Math.abs(leftAtSeam-rightAtSeam)<1e-12,'both sides of a page seam sample the same source pixel');
    for(const screenX of [0,100,219,220,300,389]){
      const page=screenX<pageWidth-camera?0:1;
      const correct=page?b:a,localX=screenX-(page*pageWidth-camera);
      assert.ok(Math.abs(localX/pageWidth*correct.scale+correct.offset-screenX/viewportWidth)<1e-12);
    }
  }
  const explicit=sourceLayout(1320,844,780,1688,{sourceOffsetX:100,sourceViewportWidth:600});
  assert.equal(explicit.width,600);assert.equal(explicit.offset,1/6);
});

test('lit relief separates green meadows, pale summits, blue rivers and sand paths without bleaching locks',()=>{
  const luminance=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  for(const chapter of [0,1,2,3,4,1003]){
    const habitat={moss:.1,water:0,path:0},meadow=materialColors(chapter,.12,habitat,.5);
    const forest=materialColors(chapter,.12,{...habitat,moss:.95},.5);
    const summit=materialColors(chapter,.65,habitat,.5);
    const river=materialColors(chapter,.06,{...habitat,water:1},.5);
    const road=materialColors(chapter,.12,{...habitat,path:1},.5);
    assert.ok(meadow.top[1]>meadow.top[0]&&meadow.top[1]>meadow.top[2]);
    assert.ok(luminance(forest.top)<luminance(meadow.top)*.8);
    assert.ok(luminance(summit.top)>luminance(meadow.top)*1.3);
    assert.ok(river.top[2]>river.top[0]*2&&river.top[1]>river.top[0]*2);
    assert.ok(road.top[0]>road.top[1]&&road.top[1]>road.top[2]);
    const locked=materialColors(chapter,.12,habitat,.5,false);
    assert.ok(luminance(locked.top)<.15);
    assert.deepEqual(locked,materialColors(0,.12,{moss:1,water:1,path:1},.5,false));
    for(const result of [meadow,forest,summit,river,road,locked])for(const rgb of Object.values(result)){
      assert.ok(rgb.every(value=>Number.isFinite(value)&&value>=0&&value<1));
    }
  }
});

test('geometry is shared by chapter and grid, with four-entry LRU eviction',()=>{
  const first=getGeometry(70,24,16,'webgl');assert.equal(first.cached,false);
  const second=getGeometry(70,24,16,'webgl');assert.equal(second.cached,true);assert.equal(second.geometry,first.geometry);
  assert.equal(first.geometry.cells.length,24*16);assert.equal(first.geometry.values.length,first.geometry.instances*11);
  for(const cell of first.geometry.cells)assert.equal(cell.h,heightAt(cell.u,cell.v,70));
  const resized=getGeometry(70,25,16,'webgl');assert.notEqual(resized.geometry,first.geometry);
  for(let chapter=71;chapter<=75;chapter++)getGeometry(chapter,24,16,'webgl');
  assert.equal(getGeometry(70,24,16,'webgl').cached,false,'oldest chapter is evicted instead of growing indefinitely');
});

test('idle preparation and an early synchronous swap share one immutable geometry result',async()=>{
  const prepared=await prepareGeometry(180,48,30,'webgl');
  assert.ok(prepared);const hit=getGeometry(180,48,30,'webgl');assert.equal(hit.cached,true);assert.equal(hit.geometry,prepared);
  const inFlight=prepareGeometry(181,48,30,'webgl');
  assert.equal(prepareGeometry(181,48,30,'webgl'),inFlight,'duplicate requests share pending work');
  const early=getGeometry(181,48,30,'webgl');assert.equal(await inFlight,early.geometry);
  const fallback=await prepareGeometry(181,34,24,'canvas2d');
  assert.equal(fallback.values,null);assert.equal(fallback.ordered.length,34*24);
  for(let i=1;i<fallback.ordered.length;i++)assert.ok(fallback.ordered[i].v>=fallback.ordered[i-1].v);
});

test('rapid chapter prefetch cancels stale jobs instead of creating an unbounded queue',async()=>{
  const results=await Promise.all(Array.from({length:7},(_,i)=>prepareGeometry(200+i,24,16,'webgl')));
  assert.equal(results.filter(Boolean).length,4);assert.deepEqual(results.slice(0,3),[null,null,null]);
  for(let i=3;i<results.length;i++)assert.equal(getGeometry(200+i,24,16,'webgl').geometry,results[i]);
});
